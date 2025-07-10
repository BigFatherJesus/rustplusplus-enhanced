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

const Client = require('../../index.ts');
const RecyclerHandler = require('../handlers/recyclerHandler.js');

module.exports = {
    /**
     * Calculate how many of an item can be crafted with available resources in linked storage
     * @param {Object} client - The Discord client
     * @param {Object} rustplus - The rustplus instance
     * @param {string} guildId - The guild ID
     * @param {string} serverId - The server ID
     * @param {string} itemId - The item ID to craft
     * @param {Object} materials - Required materials (from craft or chaincraft)
     * @returns {number} Maximum craftable quantity
     */
    calculateCraftableQuantity: function (client, rustplus, guildId, serverId, itemId, materials) {
        try {
            const instance = client.getInstance(guildId);
            
            // Get all storage monitors (excluding TCs)
            const storageMonitors = instance.serverList[serverId].storageMonitors || {};
            const linkedStorageIds = Object.keys(storageMonitors).filter(entityId => {
                const monitor = storageMonitors[entityId];
                return monitor.type !== 'toolCupboard' && monitor.reachable;
            });

            if (linkedStorageIds.length === 0) {
                return 0;
            }

            // Get consolidated items from all linked storage
            const availableItems = RecyclerHandler.getAllItemsFromLinkedStorages(client, rustplus, linkedStorageIds);
            
            // Create a map of available quantities by item ID
            const availableQuantities = new Map();
            for (const item of availableItems) {
                availableQuantities.set(item.itemId.toString(), item.quantity);
            }

            // Calculate maximum craftable quantity
            let maxCraftable = Infinity;
            
            for (const material of materials) {
                const materialId = material.id || material.itemId;
                const requiredQuantity = material.quantity;
                const availableQuantity = availableQuantities.get(materialId.toString()) || 0;
                
                if (availableQuantity === 0) {
                    return 0; // Can't craft if any material is missing
                }
                
                const possibleFromThisMaterial = Math.floor(availableQuantity / requiredQuantity);
                maxCraftable = Math.min(maxCraftable, possibleFromThisMaterial);
            }

            return maxCraftable === Infinity ? 0 : maxCraftable;
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), 
                `Error calculating craftable quantity: ${error.message}`, 'error');
            return 0;
        }
    },

    /**
     * Find items in linked storage boxes
     * @param {Object} client - The Discord client
     * @param {Object} rustplus - The rustplus instance
     * @param {string} guildId - The guild ID
     * @param {string} serverId - The server ID
     * @param {string} itemName - The item name to search for
     * @returns {Object} Search results with quantities and locations
     */
    findItemsInStorage: function (client, rustplus, guildId, serverId, itemName) {
        try {
            const instance = client.getInstance(guildId);
            
            // Get item ID from name
            const itemId = client.items.getClosestItemIdByName(itemName);
            if (!itemId) {
                return {
                    found: false,
                    itemName: itemName,
                    totalQuantity: 0,
                    locations: []
                };
            }

            const actualItemName = client.items.getName(itemId);
            const storageMonitors = instance.serverList[serverId].storageMonitors || {};
            const results = {
                found: false,
                itemName: actualItemName,
                totalQuantity: 0,
                locations: []
            };

            // Search through all storage monitors (excluding TCs)
            for (const entityId in storageMonitors) {
                const monitor = storageMonitors[entityId];
                if (monitor.type === 'toolCupboard' || !monitor.reachable) {
                    continue;
                }

                const storageItems = rustplus.storageMonitors?.[entityId]?.items || [];
                const foundItem = storageItems.find(item => item.itemId.toString() === itemId.toString());
                
                if (foundItem && foundItem.quantity > 0) {
                    results.found = true;
                    results.totalQuantity += foundItem.quantity;
                    results.locations.push({
                        name: monitor.name || `Storage ${entityId}`,
                        quantity: foundItem.quantity,
                        entityId: entityId
                    });
                }
            }

            return results;
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), 
                `Error finding items in storage: ${error.message}`, 'error');
            return {
                found: false,
                itemName: itemName,
                totalQuantity: 0,
                locations: []
            };
        }
    }
};