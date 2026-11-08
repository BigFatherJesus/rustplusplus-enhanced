/*
    Connection Manager for RustPlus Bot

    Consolidates the previous reconnectionManager.js, autoReconnectManager.js and
    connectionHealthMonitor.js into a single per-guild connection state machine.

    Responsibilities:
    - Health checks of operational connections (lightweight getInfo polling)
    - Server restart/wipe detection (seed/size/wipeTime change)
    - Reconnection with exponential backoff + jitter and retry limits
    - Watchdog: guilds that should be connected but are not get a reconnect scheduled
    - After max retries, re-arms after a cooldown instead of giving up forever
*/

const Config = require('../../config');

const PHASE = Object.freeze({
    IDLE: 'idle',
    RECONNECT_SCHEDULED: 'reconnect_scheduled',
    RECONNECTING: 'reconnecting',
    EXHAUSTED: 'exhausted'
});

class ConnectionManager {
    constructor(client) {
        this.client = client;

        this.config = {
            baseDelay: Config.general.reconnectIntervalMs || 15000,
            maxDelay: Config.general.maxReconnectDelay || 300000,
            maxRetries: Config.general.maxReconnectRetries || 10,
            backoffMultiplier: Config.general.reconnectBackoffMultiplier || 2,
            resetAfterSuccess: Config.general.resetRetriesAfterSuccess || 60000,
            checkInterval: Config.general.connectionHealthCheckInterval || 30000,
            healthCheckTimeout: 8000,
            maxConsecutiveFailures: 2,
            exhaustedCooldown: Config.general.reconnectExhaustedCooldown || 300000
        };

        /* Per-guild connection state */
        this.states = new Map();

        /* guildId:steamId pairs already warned about a Rust+ login problem during this outage. */
        this.loginWarnings = new Set();

        this.intervalId = null;
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    start() {
        if (this.intervalId) this.stop();

        this.intervalId = setInterval(() => this.tick(), this.config.checkInterval);

        this.client.log(this.client.intlGet(null, 'infoCap'),
            `Connection manager started (interval ${this.config.checkInterval}ms)`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.stopAll();
        this.client.log(this.client.intlGet(null, 'infoCap'), 'Connection manager stopped');
    }

    stopAll() {
        for (const [guildId, state] of this.states) {
            if (state.timer) clearTimeout(state.timer);
            if (state.resetTimer) clearTimeout(state.resetTimer);
        }
        this.states.clear();
    }

    /* ------------------------------------------------------------------ */
    /* State helpers                                                       */
    /* ------------------------------------------------------------------ */

    getState(guildId) {
        if (!this.states.has(guildId)) {
            this.states.set(guildId, {
                phase: PHASE.IDLE,
                retryCount: 0,
                currentDelay: this.config.baseDelay,
                timer: null,
                resetTimer: null,
                lastAttempt: null,
                reason: null,
                exhaustedAt: null,
                consecutiveFailures: 0,
                lastHealthCheck: null,
                lastSuccessfulCheck: null
            });
        }
        return this.states.get(guildId);
    }

    resetState(guildId) {
        const state = this.states.get(guildId);
        if (state) {
            if (state.timer) clearTimeout(state.timer);
            if (state.resetTimer) clearTimeout(state.resetTimer);
            this.states.delete(guildId);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Periodic tick: health checks + watchdog                             */
    /* ------------------------------------------------------------------ */

    async tick() {
        for (const guildId of this.client.guilds.cache.keys()) {
            try {
                await this.checkGuild(guildId);
            }
            catch (error) {
                this.client.log(this.client.intlGet(null, 'errorCap'),
                    `Connection check failed for guild ${guildId}: ${error.message}`);
            }
        }
    }

    async checkGuild(guildId) {
        const instance = this.client.getInstance(guildId);
        if (!instance || !instance.activeServer || !instance.serverList[instance.activeServer]) return;

        const state = this.getState(guildId);
        const rustplus = this.client.rustplusInstances[guildId];
        const isOperational = this.client.activeRustplusInstances[guildId] &&
            rustplus && rustplus.isOperational;

        if (isOperational && state.phase === PHASE.IDLE) {
            await this.performHealthCheck(guildId, rustplus);
            return;
        }

        /* Watchdog: should be connected but is not, and nothing is in flight.
           Grace window: a just-executed reconnect may still be establishing its
           websocket — don't double-fire while it settles. */
        const settling = state.lastAttempt && (Date.now() - state.lastAttempt) < this.config.checkInterval * 2;
        if (!isOperational && state.phase === PHASE.IDLE && !settling) {
            this.client.log(this.client.intlGet(null, 'infoCap'),
                `Watchdog: guild ${guildId} should be connected to ${instance.activeServer} but is not`);
            this.scheduleReconnect(guildId, 'watchdog');
            return;
        }

        /* Re-arm after cooldown instead of staying exhausted forever. */
        if (state.phase === PHASE.EXHAUSTED &&
            Date.now() - state.exhaustedAt >= this.config.exhaustedCooldown) {
            this.client.log(this.client.intlGet(null, 'infoCap'),
                `Reconnection cooldown expired for guild ${guildId}, retrying`);
            state.phase = PHASE.IDLE;
            state.retryCount = 0;
            state.currentDelay = this.config.baseDelay;
            this.scheduleReconnect(guildId, 'cooldown_retry');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Health checks                                                       */
    /* ------------------------------------------------------------------ */

    async performHealthCheck(guildId, rustplus) {
        const state = this.getState(guildId);
        const startTime = Date.now();
        state.lastHealthCheck = startTime;

        try {
            const healthCheckPromise = this.performHealthCheckRequest(guildId, rustplus);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout);
            });

            await Promise.race([healthCheckPromise, timeoutPromise]);

            state.consecutiveFailures = 0;
            state.lastSuccessfulCheck = Date.now();
        }
        catch (error) {
            if (error.message === 'Server restart detected') return; /* Reconnect already scheduled. */

            state.consecutiveFailures += 1;
            this.client.log(this.client.intlGet(null, 'warningCap'),
                `Health check failed for guild ${guildId} ` +
                `(${state.consecutiveFailures}/${this.config.maxConsecutiveFailures}): ${error.message}`);

            if (state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
                state.consecutiveFailures = 0;
                rustplus.isOperational = false;
                this.scheduleReconnect(guildId, 'health_check_failure');
            }
        }
    }

    async performHealthCheckRequest(guildId, rustplus) {
        const info = await rustplus.getInfoAsync(this.config.healthCheckTimeout);

        if (!await rustplus.isResponseValid(info)) {
            throw new Error('Invalid health check response');
        }

        /* Detect server restart/wipe via changed seed/size/wipeTime. */
        if (info.info && info.info.name && info.info.seed) {
            const currentServerInfo = {
                name: info.info.name,
                seed: info.info.seed,
                size: info.info.size,
                wipeTime: info.info.wipeTime
            };

            if (!rustplus.lastServerInfo) {
                rustplus.lastServerInfo = currentServerInfo;
            }
            else {
                const serverChanged =
                    currentServerInfo.seed !== rustplus.lastServerInfo.seed ||
                    currentServerInfo.size !== rustplus.lastServerInfo.size ||
                    currentServerInfo.wipeTime !== rustplus.lastServerInfo.wipeTime;

                if (serverChanged) {
                    rustplus.lastServerInfo = currentServerInfo;
                    this.client.log(this.client.intlGet(null, 'infoCap'),
                        `Server restart/wipe detected for guild ${guildId}, reconnecting immediately`);

                    rustplus.isOperational = false;
                    rustplus.disconnect();
                    this.scheduleReconnect(guildId, 'server_restart_detected', { immediate: true });
                    throw new Error('Server restart detected');
                }
            }
        }

        return info;
    }

    /* ------------------------------------------------------------------ */
    /* Reconnection                                                        */
    /* ------------------------------------------------------------------ */

    calculateDelay(retryCount) {
        const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, retryCount);
        const capped = Math.min(delay, this.config.maxDelay);
        const jitter = Math.random() * 0.25 * capped; /* Up to 25% jitter against thundering herd. */
        return Math.floor(capped + jitter);
    }

    /**
     * Single entry point for all reconnection requests.
     * @param {string} guildId - Guild ID
     * @param {string} reason - Reason for reconnection (logging/status only)
     * @param {Object} [options] - { immediate: boolean }
     */
    scheduleReconnect(guildId, reason, options = {}) {
        const state = this.getState(guildId);

        if (state.phase === PHASE.RECONNECT_SCHEDULED || state.phase === PHASE.RECONNECTING) {
            return; /* Already in flight — never double-schedule. */
        }

        if (state.retryCount >= this.config.maxRetries) {
            state.phase = PHASE.EXHAUSTED;
            state.exhaustedAt = Date.now();
            this.client.rustplusReconnecting[guildId] = false;
            this.client.log(this.client.intlGet(null, 'errorCap'),
                `Maximum reconnection attempts (${this.config.maxRetries}) reached for guild ${guildId}, ` +
                `cooling down for ${Math.floor(this.config.exhaustedCooldown / 1000)}s`);
            return;
        }

        state.retryCount += 1;
        state.lastAttempt = Date.now();
        state.reason = reason;
        state.phase = PHASE.RECONNECT_SCHEDULED;

        const delay = options.immediate ? 0 : this.calculateDelay(state.retryCount - 1);
        state.currentDelay = delay;

        this.client.rustplusReconnecting[guildId] = true;

        this.client.log(this.client.intlGet(null, 'infoCap'),
            `Reconnection ${state.retryCount}/${this.config.maxRetries} for guild ${guildId} ` +
            `(reason: ${reason}) in ${Math.floor(delay / 1000)}s`);

        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => this.executeReconnect(guildId, reason), delay);
    }

    /**
     * Perform the actual reconnection using the exact same sequence as the
     * manual reconnect button (buttonHandler.js).
     */
    async executeReconnect(guildId, reason) {
        const state = this.getState(guildId);
        state.phase = PHASE.RECONNECTING;
        state.timer = null;

        const instance = this.client.getInstance(guildId);
        if (!instance || !instance.activeServer) {
            this.client.log(this.client.intlGet(null, 'warningCap'),
                `No active server for guild ${guildId} during reconnection, aborting`);
            state.phase = PHASE.IDLE;
            this.client.rustplusReconnecting[guildId] = false;
            return;
        }

        const serverId = instance.activeServer;
        const serverInfo = instance.serverList[serverId];
        if (!serverInfo) {
            this.client.log(this.client.intlGet(null, 'errorCap'),
                `No server info for active server ${serverId} in guild ${guildId}, aborting reconnection`);
            state.phase = PHASE.IDLE;
            this.client.rustplusReconnecting[guildId] = false;
            return;
        }

        this.client.log(this.client.intlGet(null, 'infoCap'),
            `Executing reconnection attempt ${state.retryCount} for guild ${guildId} ` +
            `to ${serverInfo.serverIp}:${serverInfo.appPort}`);

        try {
            const DiscordMessages = require('../discordTools/discordMessages.js');

            /* Exact sequence from the working manual reconnect button: */
            this.client.resetRustplusVariables(guildId);

            const rustplus = this.client.rustplusInstances[guildId];

            await DiscordMessages.sendServerMessage(guildId, serverId, null);

            instance.activeServer = serverId;
            this.client.setInstance(guildId, instance);

            if (rustplus) {
                rustplus.isDeleted = true;
                rustplus.disconnect();
                delete this.client.rustplusInstances[guildId];
            }

            const newRustplus = this.client.createRustplusInstance(
                guildId,
                serverInfo.serverIp,
                serverInfo.appPort,
                serverInfo.steamId,
                serverInfo.playerToken
            );

            if (newRustplus) {
                await DiscordMessages.sendServerMessage(guildId, serverId, null, null);
                newRustplus.isNewConnection = true;
            }

            /* Success is confirmed by the 'connected' event via onConnectionSuccess().
               Until then we stay in RECONNECTING; if the connection fails the
               disconnected/error events schedule the next attempt. */
            state.phase = PHASE.IDLE;
        }
        catch (error) {
            this.client.log(this.client.intlGet(null, 'errorCap'),
                `Reconnection attempt ${state.retryCount} failed for guild ${guildId}: ${error.message}`);

            state.phase = PHASE.IDLE;
            this.scheduleReconnect(guildId, reason);
        }
    }

    /**
     * Called from the 'connected' rustplus event.
     */
    onConnectionSuccess(guildId) {
        const state = this.getState(guildId);
        this.client.rustplusReconnecting[guildId] = false;
        for (const key of this.loginWarnings) {
            if (key.startsWith(`${guildId}:`)) this.loginWarnings.delete(key);
        }

        if (state.retryCount > 0) {
            this.client.log(this.client.intlGet(null, 'infoCap'),
                `Reconnection successful for guild ${guildId} after ${state.retryCount} attempts`);
        }

        state.phase = PHASE.IDLE;
        state.consecutiveFailures = 0;

        /* Reset the retry counter once the connection stays up for a while. */
        if (state.resetTimer) clearTimeout(state.resetTimer);
        state.resetTimer = setTimeout(() => {
            state.retryCount = 0;
            state.currentDelay = this.config.baseDelay;
            state.resetTimer = null;
        }, this.config.resetAfterSuccess);
    }

    /**
     * Tell the credential's owner in #activity, once per outage, that the Rust+ login needs attention.
     * @param {string} problem Language key: rustplusLoginNoToken, rustplusLoginNoCredentials,
     *                         rustplusLoginExpired, rustplusLoginRejected or rustplusLoginNotRelayPaired.
     */
    async warnRustPlusLogin(guildId, steamId, problem, details = {}) {
        const key = `${guildId}:${steamId}`;
        if (this.loginWarnings.has(key)) return;
        this.loginWarnings.add(key);

        const DiscordEmbeds = require('../discordTools/discordEmbeds.js');
        const DiscordMessages = require('../discordTools/discordMessages.js');
        const InstanceUtils = require('./instanceUtils.js');

        const instance = this.client.getInstance(guildId);
        const server = instance.activeServer !== null ? instance.serverList[instance.activeServer] : null;
        const credentials = InstanceUtils.readCredentialsFile(guildId);
        const owner = credentials && credentials[steamId] ? credentials[steamId].discord_user_id : null;
        const text = this.client.intlGet(guildId, problem, {
            steamId: steamId, server: server ? server.title : '-', ...details
        });

        this.client.log(this.client.intlGet(null, 'warningCap'), text, 'warn');
        const content = DiscordEmbeds.getActionInfoEmbed(1, text);
        if (owner) content.content = `<@${owner}>`;
        await DiscordMessages.sendMessage(guildId, content, null, instance.channelId.activity);
    }

    /**
     * Immediately reconnect a guild, resetting any backoff (manual action).
     */
    async forceReconnect(guildId) {
        this.resetState(guildId);
        this.client.rustplusReconnecting[guildId] = false;
        this.scheduleReconnect(guildId, 'manual_retry', { immediate: true });
    }

    /* ------------------------------------------------------------------ */
    /* Status / statistics (consumed by /connection command)               */
    /* ------------------------------------------------------------------ */

    getReconnectionStatus(guildId) {
        const state = this.states.get(guildId);
        if (!state) {
            return {
                isReconnecting: false,
                retryCount: 0,
                maxRetries: this.config.maxRetries
            };
        }

        return {
            isReconnecting: state.phase === PHASE.RECONNECT_SCHEDULED || state.phase === PHASE.RECONNECTING,
            retryCount: state.retryCount,
            maxRetries: this.config.maxRetries,
            currentDelay: state.currentDelay,
            lastAttempt: state.lastAttempt,
            reconnectionReason: state.reason
        };
    }

    getHealthCheckStats() {
        const lastHealthChecks = {};
        const consecutiveFailures = {};
        for (const [guildId, state] of this.states) {
            if (state.lastHealthCheck) lastHealthChecks[guildId] = state.lastHealthCheck;
            if (state.consecutiveFailures) consecutiveFailures[guildId] = state.consecutiveFailures;
        }

        return {
            checkInterval: this.config.checkInterval,
            maxConsecutiveFailures: this.config.maxConsecutiveFailures,
            healthCheckTimeout: this.config.healthCheckTimeout,
            activeMonitoring: this.intervalId !== null,
            lastHealthChecks: lastHealthChecks,
            consecutiveFailures: consecutiveFailures
        };
    }

    getStats() {
        return {
            isRunning: this.intervalId !== null,
            checkInterval: this.config.checkInterval,
            nextCheck: this.intervalId ? Date.now() + this.config.checkInterval : null
        };
    }
}

module.exports = ConnectionManager;
