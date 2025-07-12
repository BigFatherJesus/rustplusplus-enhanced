/*
    Reconnection Manager for RustPlus Bot
    Handles automatic reconnection with exponential backoff and retry limits
*/

const Config = require('../../config');

class ReconnectionManager {
    constructor(client) {
        this.client = client;
        
        // Configuration with defaults
        this.config = {
            baseDelay: Config.general.reconnectIntervalMs || 15000,     // 15 seconds base delay
            maxDelay: Config.general.maxReconnectDelay || 300000,       // 5 minutes max delay
            maxRetries: Config.general.maxReconnectRetries || 10,       // Maximum retry attempts
            backoffMultiplier: Config.general.reconnectBackoffMultiplier || 2, // Exponential backoff multiplier
            resetAfterSuccess: Config.general.resetRetriesAfterSuccess || 60000, // Reset counter after 1 minute of success
        };
        
        // Track reconnection state per guild
        this.reconnectionStates = new Map();
        
        // Track successful connection time for retry counter reset
        this.successfulConnections = new Map();
    }

    /**
     * Initialize reconnection state for a guild
     * @param {string} guildId - Guild ID
     */
    initializeState(guildId) {
        if (!this.reconnectionStates.has(guildId)) {
            this.reconnectionStates.set(guildId, {
                isReconnecting: false,
                retryCount: 0,
                currentDelay: this.config.baseDelay,
                timer: null,
                lastAttempt: null,
                reconnectionReason: null
            });
        }
    }

    /**
     * Reset reconnection state for a guild
     * @param {string} guildId - Guild ID
     */
    resetState(guildId) {
        const state = this.reconnectionStates.get(guildId);
        if (state) {
            if (state.timer) {
                clearTimeout(state.timer);
            }
            this.reconnectionStates.delete(guildId);
        }
    }

    /**
     * Mark a successful connection to reset retry counter after delay
     * @param {string} guildId - Guild ID
     */
    markSuccessfulConnection(guildId) {
        this.successfulConnections.set(guildId, Date.now());
        
        // Reset retry counter after successful connection period
        setTimeout(() => {
            const state = this.reconnectionStates.get(guildId);
            if (state) {
                state.retryCount = 0;
                state.currentDelay = this.config.baseDelay;
                this.client.log(this.client.intlGet(null, 'infoCap'), 
                    `Reconnection retry counter reset for guild ${guildId}`);
            }
        }, this.config.resetAfterSuccess);
    }

    /**
     * Check if we should attempt reconnection
     * @param {string} guildId - Guild ID
     * @param {string} reason - Reason for reconnection
     * @returns {boolean} - Whether to attempt reconnection
     */
    shouldAttemptReconnection(guildId, reason) {
        this.initializeState(guildId);
        const state = this.reconnectionStates.get(guildId);
        
        if (state.isReconnecting) {
            this.client.log(this.client.intlGet(null, 'warningCap'), 
                `Reconnection already in progress for guild ${guildId}`);
            return false;
        }

        if (state.retryCount >= this.config.maxRetries) {
            this.client.log(this.client.intlGet(null, 'errorCap'), 
                `Maximum reconnection attempts (${this.config.maxRetries}) reached for guild ${guildId}`);
            return false;
        }

        return true;
    }

    /**
     * Calculate next delay with exponential backoff
     * @param {number} retryCount - Current retry count
     * @returns {number} - Delay in milliseconds
     */
    calculateDelay(retryCount) {
        const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, retryCount);
        return Math.min(delay, this.config.maxDelay);
    }

    /**
     * Add jitter to delay to prevent thundering herd
     * @param {number} delay - Base delay
     * @returns {number} - Delay with jitter
     */
    addJitter(delay) {
        // Add up to 25% jitter
        const jitter = Math.random() * 0.25 * delay;
        return Math.floor(delay + jitter);
    }

    /**
     * Attempt reconnection with exponential backoff
     * @param {string} guildId - Guild ID
     * @param {string} reason - Reason for reconnection
     * @param {Object} connectionParams - Connection parameters
     */
    async attemptReconnection(guildId, reason, connectionParams) {
        if (!this.shouldAttemptReconnection(guildId, reason)) {
            return;
        }

        this.initializeState(guildId);
        const state = this.reconnectionStates.get(guildId);
        
        state.isReconnecting = true;
        state.retryCount++;
        state.lastAttempt = Date.now();
        state.reconnectionReason = reason;
        
        // Calculate delay with exponential backoff and jitter
        let baseDelay = this.calculateDelay(state.retryCount - 1);
        let delayWithJitter = this.addJitter(baseDelay);
        
        // For server restart detection, reconnect immediately (no delay)
        if (reason === 'server_restart_detected') {
            delayWithJitter = 0;
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Server restart detected for guild ${guildId}, attempting immediate reconnection`);
        }
        
        state.currentDelay = delayWithJitter;

        this.client.log(this.client.intlGet(null, 'infoCap'), 
            `Attempting reconnection ${state.retryCount}/${this.config.maxRetries} for guild ${guildId} ` +
            `(reason: ${reason}) in ${Math.floor(delayWithJitter / 1000)} seconds`);

        // Clear existing timer
        if (state.timer) {
            clearTimeout(state.timer);
        }

        // Set new reconnection timer (immediate if server restart detected)
        state.timer = setTimeout(async () => {
            try {
                await this.performReconnection(guildId, connectionParams);
            } catch (error) {
                const errorMessage = error.message || error.toString();
                const errorStack = error.stack || 'No stack trace';
                this.client.log(this.client.intlGet(null, 'errorCap'), 
                    `Reconnection attempt failed for guild ${guildId}: ${errorMessage} | Stack: ${errorStack}`);
                
                // Mark as not reconnecting so next attempt can be made
                state.isReconnecting = false;
                
                // Schedule next attempt if we haven't reached max retries
                if (state.retryCount < this.config.maxRetries) {
                    setTimeout(() => {
                        this.attemptReconnection(guildId, reason, connectionParams);
                    }, 1000); // Brief delay before next attempt
                }
            }
        }, delayWithJitter);
    }

    /**
     * Perform the actual reconnection
     * @param {string} guildId - Guild ID
     * @param {Object} connectionParams - Connection parameters
     */
    async performReconnection(guildId, connectionParams) {
        const state = this.reconnectionStates.get(guildId);
        
        this.client.log(this.client.intlGet(null, 'infoCap'), 
            `Executing reconnection attempt ${state.retryCount} for guild ${guildId}`);

        // Clean up existing instance
        if (this.client.rustplusInstances[guildId]) {
            delete this.client.rustplusInstances[guildId];
        }

        // Create new instance
        await this.client.createRustplusInstance(
            guildId,
            connectionParams.server,
            connectionParams.port,
            connectionParams.playerId,
            connectionParams.playerToken
        );
    }

    /**
     * Handle successful reconnection
     * @param {string} guildId - Guild ID
     */
    handleSuccessfulReconnection(guildId) {
        const state = this.reconnectionStates.get(guildId);
        if (state) {
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Reconnection successful for guild ${guildId} after ${state.retryCount} attempts`);
            
            state.isReconnecting = false;
            this.markSuccessfulConnection(guildId);
        }
    }

    /**
     * Handle failed reconnection
     * @param {string} guildId - Guild ID
     * @param {string} reason - Failure reason
     */
    handleFailedReconnection(guildId, reason) {
        const state = this.reconnectionStates.get(guildId);
        if (state) {
            state.isReconnecting = false;
            
            this.client.log(this.client.intlGet(null, 'warningCap'), 
                `Reconnection failed for guild ${guildId}: ${reason}`);
        }
    }

    /**
     * Get reconnection status for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} - Reconnection status
     */
    getReconnectionStatus(guildId) {
        const state = this.reconnectionStates.get(guildId);
        if (!state) {
            return {
                isReconnecting: false,
                retryCount: 0,
                maxRetries: this.config.maxRetries
            };
        }

        return {
            isReconnecting: state.isReconnecting,
            retryCount: state.retryCount,
            maxRetries: this.config.maxRetries,
            currentDelay: state.currentDelay,
            lastAttempt: state.lastAttempt,
            reconnectionReason: state.reconnectionReason
        };
    }

    /**
     * Force stop all reconnection attempts
     */
    stopAllReconnections() {
        for (const [guildId, state] of this.reconnectionStates) {
            if (state.timer) {
                clearTimeout(state.timer);
            }
            state.isReconnecting = false;
        }
        this.reconnectionStates.clear();
        this.successfulConnections.clear();
    }
}

module.exports = ReconnectionManager;