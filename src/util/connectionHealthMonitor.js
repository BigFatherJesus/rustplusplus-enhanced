/*
    Connection Health Monitor for RustPlus Bot
    Monitors connection health and triggers reconnection when needed
*/

const Config = require('../../config');

class ConnectionHealthMonitor {
    constructor(client) {
        this.client = client;
        this.intervalId = null;
        this.checkInterval = Config.general.connectionHealthCheckInterval || 60000; // 1 minute default
        this.lastHealthCheck = new Map();
        this.consecutiveFailures = new Map();
        this.maxConsecutiveFailures = 3;
        this.healthCheckTimeout = 10000; // 10 seconds timeout for health checks
    }

    /**
     * Start the connection health monitor
     */
    start() {
        if (this.intervalId) {
            this.stop();
        }

        this.intervalId = setInterval(() => {
            this.performHealthChecks();
        }, this.checkInterval);

        this.client.log(this.client.intlGet(null, 'infoCap'), 
            `Connection health monitor started with ${this.checkInterval}ms interval`);
    }

    /**
     * Stop the connection health monitor
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                'Connection health monitor stopped');
        }
    }

    /**
     * Perform health checks on all active connections
     */
    async performHealthChecks() {
        const activeInstances = Object.keys(this.client.activeRustplusInstances);
        
        for (const guildId of activeInstances) {
            if (this.client.activeRustplusInstances[guildId] && 
                this.client.rustplusInstances[guildId]) {
                
                const rustplus = this.client.rustplusInstances[guildId];
                
                // Skip if instance is not operational or being reconnected
                if (!rustplus.isOperational || this.client.rustplusReconnecting[guildId]) {
                    continue;
                }

                await this.checkConnectionHealth(guildId, rustplus);
            }
        }
    }

    /**
     * Check health of a specific connection
     * @param {string} guildId - Guild ID
     * @param {Object} rustplus - RustPlus instance
     */
    async checkConnectionHealth(guildId, rustplus) {
        try {
            const startTime = Date.now();
            this.lastHealthCheck.set(guildId, startTime);

            // Perform a lightweight health check - request server info
            const healthCheckPromise = this.performHealthCheckRequest(rustplus);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), this.healthCheckTimeout);
            });

            await Promise.race([healthCheckPromise, timeoutPromise]);

            // Health check successful
            this.consecutiveFailures.set(guildId, 0);
            
            const duration = Date.now() - startTime;
            this.client.log(this.client.intlGet(null, 'infoCap'), 
                `Health check passed for guild ${guildId} (${duration}ms)`);

        } catch (error) {
            this.handleHealthCheckFailure(guildId, rustplus, error);
        }
    }

    /**
     * Perform the actual health check request
     * @param {Object} rustplus - RustPlus instance
     * @returns {Promise} - Health check promise
     */
    async performHealthCheckRequest(rustplus) {
        // Use getInfo as a lightweight health check
        const info = await rustplus.getInfoAsync(this.healthCheckTimeout);
        
        if (!await rustplus.isResponseValid(info)) {
            throw new Error('Invalid health check response');
        }

        return info;
    }

    /**
     * Handle health check failure
     * @param {string} guildId - Guild ID
     * @param {Object} rustplus - RustPlus instance
     * @param {Error} error - Error that occurred
     */
    handleHealthCheckFailure(guildId, rustplus, error) {
        const currentFailures = (this.consecutiveFailures.get(guildId) || 0) + 1;
        this.consecutiveFailures.set(guildId, currentFailures);

        const errorMessage = error.message || error.toString();
        this.client.log(this.client.intlGet(null, 'warningCap'), 
            `Health check failed for guild ${guildId} (${currentFailures}/${this.maxConsecutiveFailures}): ${errorMessage}`);

        if (currentFailures >= this.maxConsecutiveFailures) {
            this.client.log(this.client.intlGet(null, 'errorCap'), 
                `Health check failed ${this.maxConsecutiveFailures} times for guild ${guildId}, triggering reconnection`);
            
            // Reset failure count
            this.consecutiveFailures.set(guildId, 0);
            
            // Trigger reconnection
            this.triggerHealthCheckReconnection(guildId, rustplus);
        }
    }

    /**
     * Trigger reconnection due to health check failure
     * @param {string} guildId - Guild ID
     * @param {Object} rustplus - RustPlus instance
     */
    triggerHealthCheckReconnection(guildId, rustplus) {
        // Mark as not operational to prevent further health checks
        rustplus.isOperational = false;
        
        // Use the reconnection manager to handle the reconnection
        this.client.reconnectionManager.attemptReconnection(guildId, 'health_check_failure', {
            server: rustplus.server,
            port: rustplus.port,
            playerId: rustplus.playerId,
            playerToken: rustplus.playerToken
        });
    }

    /**
     * Get health check statistics
     * @returns {Object} - Health check statistics
     */
    getHealthCheckStats() {
        const stats = {
            checkInterval: this.checkInterval,
            maxConsecutiveFailures: this.maxConsecutiveFailures,
            healthCheckTimeout: this.healthCheckTimeout,
            activeMonitoring: this.intervalId !== null,
            lastHealthChecks: Object.fromEntries(this.lastHealthCheck),
            consecutiveFailures: Object.fromEntries(this.consecutiveFailures)
        };

        return stats;
    }

    /**
     * Reset health check data for a guild
     * @param {string} guildId - Guild ID
     */
    resetHealthCheckData(guildId) {
        this.lastHealthCheck.delete(guildId);
        this.consecutiveFailures.delete(guildId);
    }

    /**
     * Update health check configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        if (config.checkInterval) {
            this.checkInterval = config.checkInterval;
        }
        if (config.maxConsecutiveFailures) {
            this.maxConsecutiveFailures = config.maxConsecutiveFailures;
        }
        if (config.healthCheckTimeout) {
            this.healthCheckTimeout = config.healthCheckTimeout;
        }

        // Restart monitoring with new configuration
        if (this.intervalId) {
            this.stop();
            this.start();
        }
    }
}

module.exports = ConnectionHealthMonitor;