/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    https://github.com/alexemanuelol/rustplusplus

*/

const DiscordMessages = require('../discordTools/discordMessages.js');

module.exports = {
    name: 'error',
    async execute(rustplus, client, err) {
        if (!rustplus.isServerAvailable()) return rustplus.deleteThisRustplusInstance();

        rustplus.log(client.intlGet(null, 'errorCap'), err, 'error');

        switch (err.code) {
            case 'ETIMEDOUT': {
                errorTimedOut(rustplus, client, err);
            } break;

            case 'ENOTFOUND': {
                errorNotFound(rustplus, client, err);
            } break;

            case 'ECONNREFUSED': {
                await errorConnRefused(rustplus, client, err);
            } break;

            default: {
                errorOther(rustplus, client, err);
            } break;
        }
    },
};

function errorTimedOut(rustplus, client, err) {
    if (err.syscall === 'connect') {
        rustplus.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'couldNotConnectTo', {
            id: rustplus.serverId
        }), 'error');
        
        // Trigger reconnection on connection timeout
        triggerReconnection(rustplus, client, 'connection_timeout');
    }
}

function errorNotFound(rustplus, client, err) {
    if (err.syscall === 'getaddrinfo') {
        rustplus.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'couldNotConnectTo', {
            id: rustplus.serverId
        }), 'error');
        
        // Trigger reconnection on DNS resolution failure
        triggerReconnection(rustplus, client, 'dns_resolution_failure');
    }
}

async function errorConnRefused(rustplus, client, err) {
    rustplus.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'connectionRefusedTo', {
        id: rustplus.serverId
    }), 'error');
    
    // Trigger reconnection on connection refused
    triggerReconnection(rustplus, client, 'connection_refused');
}

function errorOther(rustplus, client, err) {
    const errorString = err.toString();
    
    if (errorString === 'Error: WebSocket was closed before the connection was established') {
        rustplus.log(client.intlGet(null, 'errorCap'),
            client.intlGet(null, 'websocketClosedBeforeConnection'), 'error');
        
        // Trigger reconnection on WebSocket closure
        triggerReconnection(rustplus, client, 'websocket_closed');
    }
    else if (errorString.includes('WebSocket connection closed') || 
             errorString.includes('Connection lost') ||
             errorString.includes('socket hang up') ||
             err.code === 'ECONNRESET' ||
             err.code === 'EPIPE') {
        
        rustplus.log(client.intlGet(null, 'errorCap'),
            `Connection lost to server ${rustplus.serverId}: ${errorString}`, 'error');
        
        // These errors often indicate server restart, attempt immediate reconnection
        triggerReconnection(rustplus, client, 'connection_lost');
    }
    else {
        rustplus.log(client.intlGet(null, 'errorCap'),
            `Unhandled error for server ${rustplus.serverId}: ${errorString}`, 'error');
        
        // For any other error, still attempt reconnection
        triggerReconnection(rustplus, client, 'unknown_error');
    }
}

/**
 * Trigger reconnection using the new reconnection manager
 * @param {Object} rustplus - RustPlus instance
 * @param {Object} client - Discord client
 * @param {string} reason - Reason for reconnection
 */
function triggerReconnection(rustplus, client, reason) {
    if (rustplus.isDeleted || !client.activeRustplusInstances[rustplus.guildId]) {
        return;
    }

    const guildId = rustplus.guildId;
    
    // Use the new reconnection manager with exponential backoff
    client.reconnectionManager.attemptReconnection(guildId, reason, {
        server: rustplus.server,
        port: rustplus.port,
        playerId: rustplus.playerId,
        playerToken: rustplus.playerToken
    });
}