/*
    Auto-Reconnection Manager for RustPlus Bot
    Automatically reconnects to last connected server when bot is disconnected
*/

const Config = require('../../config');

class AutoReconnectManager {
    constructor(client) {
        this.client = client;
        this.intervalId = null;
        this.checkInterval = 45000; // Check every 45 seconds
        this.isRunning = false;
    }

    /**
     * Start the auto-reconnection manager
     */
    start() {
        if (this.intervalId) {
            this.stop();
        }

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.checkAndReconnect();
        }, this.checkInterval);

        this.client.log(this.client.intlGet(null, 'infoCap'), 
            `Auto-reconnection manager started with ${this.checkInterval}ms interval`);
    }

    /**
     * Stop the auto-reconnection manager
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                'Auto-reconnection manager stopped');
        }
    }

    /**
     * Check all guilds and reconnect if needed
     */
    async checkAndReconnect() {
        if (!this.isRunning) return;

        const guilds = this.client.guilds.cache;
        
        for (const [guildId, guild] of guilds) {
            try {
                await this.checkGuildConnection(guildId);
            } catch (error) {
                this.client.log(this.client.intlGet(null, 'errorCap'), 
                    `Auto-reconnection check failed for guild ${guildId}: ${error.message}`);
            }
        }
    }

    /**
     * Check if a guild should be connected and reconnect if needed
     * @param {string} guildId - Guild ID to check
     */
    async checkGuildConnection(guildId) {
        // Skip if already reconnecting
        if (this.client.rustplusReconnecting[guildId]) {
            return;
        }

        // Get guild instance configuration
        const instance = this.client.getInstance(guildId);
        if (!instance) {
            return;
        }

        // Check if guild has an active server configured
        if (!instance.activeServer || !instance.serverList[instance.activeServer]) {
            return;
        }

        // Check if we should be connected but aren't
        const shouldBeConnected = instance.activeServer !== null;
        const isCurrentlyConnected = this.client.activeRustplusInstances[guildId] && 
                                   this.client.rustplusInstances[guildId] &&
                                   this.client.rustplusInstances[guildId].isOperational;

        if (shouldBeConnected && !isCurrentlyConnected) {
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Auto-reconnecting guild ${guildId} to server ${instance.activeServer}`);
            
            await this.reconnectGuild(guildId, instance);
        }
    }

    /**
     * Reconnect a guild to its active server
     * @param {string} guildId - Guild ID
     * @param {Object} instance - Guild instance configuration
     */
    async reconnectGuild(guildId, instance) {
        const serverInfo = instance.serverList[instance.activeServer];
        
        if (!serverInfo) {
            this.client.log(this.client.intlGet(null, 'errorCap'), 
                `No server info found for active server ${instance.activeServer} in guild ${guildId}`);
            return;
        }

        try {
            // Clean up any existing connection
            if (this.client.rustplusInstances[guildId]) {
                this.client.rustplusInstances[guildId].disconnect();
                delete this.client.rustplusInstances[guildId];
            }
            
            // Mark as reconnecting to prevent multiple attempts
            this.client.rustplusReconnecting[guildId] = true;
            
            // Create new connection
            await this.client.createRustplusInstance(
                guildId,
                serverInfo.serverIp,
                serverInfo.appPort,
                serverInfo.steamId,
                serverInfo.playerToken
            );
            
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Auto-reconnection initiated for guild ${guildId} to ${serverInfo.serverIp}:${serverInfo.appPort}`);
            
        } catch (error) {
            this.client.log(this.client.intlGet(null, 'errorCap'), 
                `Auto-reconnection failed for guild ${guildId}: ${error.message}`);
            
            // Clear reconnecting flag on error
            this.client.rustplusReconnecting[guildId] = false;
        }
    }

    /**
     * Force reconnect a specific guild
     * @param {string} guildId - Guild ID to force reconnect
     */
    async forceReconnectGuild(guildId) {
        const instance = this.client.getInstance(guildId);
        if (instance && instance.activeServer) {
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Force reconnecting guild ${guildId}`);
            await this.reconnectGuild(guildId, instance);
        }
    }

    /**
     * Get auto-reconnection statistics
     * @returns {Object} - Statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            nextCheck: this.intervalId ? Date.now() + this.checkInterval : null
        };
    }
}

module.exports = AutoReconnectManager;