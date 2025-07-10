/*
    Copyright (C) 2023 Nuallan Lampe (BigFatherJesus)
    Enhanced fork of rustplusplus by Alexander Emanuelsson (alexemanuelol)

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

    https://github.com/BigFatherJesus/rustplusplus-enhanced

*/

const DiscordMessages = require('../discordTools/discordMessages.js');

module.exports = {
    /**
     * Update recycler displays when storage monitor contents change
     * @param {Object} client - The Discord client
     * @param {string} guildId - The guild ID
     * @param {string} serverId - The server ID
     * @param {string} entityId - The storage monitor entity ID
     */
    updateRecyclerForStorage: async function (client, guildId, serverId, entityId) {
        try {
            const instance = client.getInstance(guildId);
            
            // Check if this storage monitor is linked to any recycler displays
            if (!instance.serverList[serverId].recyclers) {
                instance.serverList[serverId].recyclers = {};
                client.setInstance(guildId, instance);
                return;
            }

            // Find recycler displays that include this storage monitor
            for (const recyclerId in instance.serverList[serverId].recyclers) {
                const recycler = instance.serverList[serverId].recyclers[recyclerId];
                
                if (recycler.linkedStorages && recycler.linkedStorages.includes(entityId)) {
                    await DiscordMessages.sendRecyclerMessage(guildId, serverId, recyclerId);
                }
            }
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), 
                `Failed to update recycler for storage ${entityId}: ${error.message}`, 'error');
        }
    },

    /**
     * Create a new recycler display
     * @param {Object} client - The Discord client
     * @param {string} guildId - The guild ID
     * @param {string} serverId - The server ID
     * @param {string} name - The recycler display name
     * @param {Array} linkedStorages - Array of storage monitor entity IDs
     * @returns {string} The recycler ID
     */
    createRecycler: async function (client, guildId, serverId, name, linkedStorages = []) {
        try {
            const instance = client.getInstance(guildId);
            
            if (!instance.serverList[serverId].recyclers) {
                instance.serverList[serverId].recyclers = {};
            }

            // Generate unique recycler ID
            const recyclerId = this.generateRecyclerId(instance, serverId);
            
            instance.serverList[serverId].recyclers[recyclerId] = {
                name: name,
                linkedStorages: linkedStorages,
                messageId: null,
                active: true
            };

            client.setInstance(guildId, instance);
            
            // Send initial recycler message
            await DiscordMessages.sendRecyclerMessage(guildId, serverId, recyclerId);
            
            return recyclerId;
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), 
                `Failed to create recycler: ${error.message}`, 'error');
            throw error;
        }
    },

    /**
     * Generate a unique recycler ID
     * @param {Object} instance - The guild instance
     * @param {string} serverId - The server ID
     * @returns {string} Unique recycler ID
     */
    generateRecyclerId: function (instance, serverId) {
        let recyclerId;
        do {
            recyclerId = Math.floor(Math.random() * 10000).toString();
        } while (instance.serverList[serverId].recyclers && 
                 instance.serverList[serverId].recyclers[recyclerId]);
        return recyclerId;
    },

    /**
     * Get all items from linked storage monitors
     * @param {Object} client - The Discord client
     * @param {Object} rustplus - The rustplus instance
     * @param {Array} linkedStorages - Array of storage monitor entity IDs
     * @returns {Array} Array of items from all linked storages
     */
    getAllItemsFromLinkedStorages: function (client, rustplus, linkedStorages) {
        const allItems = [];
        
        for (const entityId of linkedStorages) {
            if (rustplus.storageMonitors && rustplus.storageMonitors[entityId]) {
                const storageItems = rustplus.storageMonitors[entityId].items || [];
                allItems.push(...storageItems);
            }
        }
        
        return this.consolidateItems(allItems);
    },

    /**
     * Consolidate duplicate items and sum their quantities
     * @param {Array} items - Array of items
     * @returns {Array} Consolidated array of items
     */
    consolidateItems: function (items) {
        const itemMap = new Map();
        
        for (const item of items) {
            const key = item.itemId.toString();
            if (itemMap.has(key)) {
                itemMap.get(key).quantity += item.quantity;
            } else {
                itemMap.set(key, { ...item });
            }
        }
        
        return Array.from(itemMap.values());
    }
};