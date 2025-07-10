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

    https://github.com/alexemanuelol/rustplusplus

*/

const Axios = require('axios');
const cheerio = require('cheerio');

// Base resources and components that should not be broken down further
const BASE_MATERIALS = new Set([
    // Resources
    'Animal Fat', 'Bone Fragments', 'Charcoal', 'Cloth', 'Coal', 'Crude Oil',
    'Diesel Fuel', 'High Quality Metal Ore', 'Horse Dung', 'Leather', 'Low Grade Fuel',
    'Metal Fragments', 'Metal Ore', 'Plant Fiber', 'Radioactive Water', 'Salt Water',
    'Scrap', 'Stones', 'Sulfur', 'Sulfur Ore', 'Water', 'Wood', 'High Quality Metal',
    // Components
    'Gears', 'Metal Pipe', 'Metal Blade', 'Metal Spring', 'Road Signs', 'Sheet Metal',
    'Rope', 'Tarp', 'Sticks', 'Electric Fuse', 'Duct Tape', 'Glue', 'Sewing Kit',
    'Tech Trash', 'Empty Propane Tank'
]);

module.exports = {
    /**
     * Check if an item is a base material that shouldn't be broken down further
     * @param {string} itemName - The name of the item
     * @returns {boolean} True if the item is a base material
     */
    isBaseMaterial: function(itemName) {
        return BASE_MATERIALS.has(itemName);
    },

    /**
     * Get the shortname from an item name by searching the items.json
     * @param {Object} client - The Discord client
     * @param {string} itemName - The name of the item
     * @returns {string|null} The shortname of the item or null if not found
     */
    getItemShortname: function(client, itemName) {
        // Search through items to find matching name
        for (const [itemId, itemData] of Object.entries(client.items.items)) {
            if (itemData.name === itemName) {
                return itemData.shortname;
            }
        }
        return null;
    },

    /**
     * Get the item ID from an item name by searching the items.json
     * @param {Object} client - The Discord client
     * @param {string} itemName - The name of the item
     * @returns {string|null} The item ID or null if not found
     */
    getItemId: function(client, itemName) {
        // Search through items to find matching name
        for (const [itemId, itemData] of Object.entries(client.items.items)) {
            if (itemData.name === itemName) {
                return itemId;
            }
        }
        return null;
    },

    /**
     * Parse a quantity string that might contain K notation (e.g., "2.2K" = 2200)
     * @param {string} quantityStr - The quantity string to parse
     * @returns {number} The parsed quantity as a number
     */
    parseQuantity: function(quantityStr) {
        if (typeof quantityStr === 'number') return quantityStr;
        
        const str = quantityStr.toString().trim().replace(/,/g, '');
        
        if (str.toLowerCase().endsWith('k')) {
            const baseNumber = parseFloat(str.slice(0, -1));
            return Math.round(baseNumber * 1000);
        }
        
        return parseInt(str) || 0;
    },

    /**
     * Get known raw material data for specific items
     * @param {string} itemName - The name of the item
     * @returns {Object|null} Object containing raw materials and quantities, or null if not found
     */
    getKnownRawMaterials: function(itemName) {
        const knownData = {
            'rocket': {
                "Metal Pipe": 2,
                "Charcoal": 1950,
                "Sulfur": 1400,
                "Low Grade Fuel": 30,
                "Metal Fragments": 100
            },
            'gun powder': {
                "Charcoal": 3,
                "Sulfur": 2
            },
            'explosives': {
                "Gun Powder": 50,
                "Low Grade Fuel": 3,
                "Sulfur": 10,
                "Metal Fragments": 10
            },
            'timed explosive charge': {
                "Charcoal": 3000,
                "Sulfur": 2200,
                "Low Grade Fuel": 60,
                "Metal Fragments": 200,
                "Cloth": 5,
                "Tech Trash": 2
            }
        };

        return knownData[itemName.toLowerCase()] || null;
    },

    /**
     * Scrape raw material costs from rusthelp.com for a specific item
     * @param {Object} client - The Discord client
     * @param {string} itemName - The name of the item to scrape
     * @returns {Object|null} Object containing raw materials and quantities, or null if failed
     */
    scrapeRawMaterials: async function(client, itemName) {
        try {
            // First check if we have known data for this item
            const knownData = this.getKnownRawMaterials(itemName);
            if (knownData) {
                const rawMaterials = {};
                for (const [materialName, quantity] of Object.entries(knownData)) {
                    const itemId = this.getItemId(client, materialName);
                    if (itemId) {
                        rawMaterials[itemId] = {
                            name: materialName,
                            quantity: quantity
                        };
                    } else {
                        client.log(client.intlGet(null, 'warningCap'), `Could not find item ID for material: ${materialName}`);
                    }
                }
                return Object.keys(rawMaterials).length > 0 ? rawMaterials : null;
            }

            // If no known data, try to scrape from rusthelp.com
            client.log(client.intlGet(null, 'infoCap'), `Attempting to scrape raw materials for ${itemName} from rusthelp.com`);
            
            const urlName = itemName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const url = `https://rusthelp.com/items/${urlName}#crafting`;
            
            const response = await Axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.status !== 200) {
                client.log(client.intlGet(null, 'warningCap'), `Failed to fetch ${url}, status: ${response.status}`);
                return null;
            }

            const $ = cheerio.load(response.data);
            const rawMaterials = {};
            
            // Look for raw materials section
            // This is a simplified approach - the actual implementation would need to be more sophisticated
            // For now, we'll rely on the known data above
            client.log(client.intlGet(null, 'infoCap'), `Successfully fetched ${url}, but no raw materials parser implemented yet`);
            
            return null;
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), `Failed to get raw materials for ${itemName}: ${error.message}`, 'error');
            return null;
        }
    },

    /**
     * Get base materials for an item, using rusthelp.com data when available
     * @param {Object} client - The Discord client
     * @param {string} itemId - The item ID
     * @param {number} quantity - The quantity needed
     * @param {Object} visited - Object to track visited items to prevent infinite loops
     * @returns {Object|null} Object containing base materials and their quantities
     */
    getBaseMaterials: async function(client, itemId, quantity, visited = {}) {
        // Check if we've already processed this item to prevent infinite loops
        if (visited[itemId]) {
            return {};
        }
        visited[itemId] = true;

        const itemName = client.items.getName(itemId);
        
        if (!itemName) {
            client.log(client.intlGet(null, 'warningCap'), `Item with ID ${itemId} not found`);
            return null;
        }
        
        // Check if this item is a base material
        if (this.isBaseMaterial(itemName)) {
            return { [itemId]: { name: itemName, quantity: quantity } };
        }

        // Try to get raw materials from known data first
        const scrapedMaterials = await this.scrapeRawMaterials(client, itemName);
        if (scrapedMaterials) {
            const baseMaterials = {};
            for (const [materialId, materialData] of Object.entries(scrapedMaterials)) {
                const totalQuantity = materialData.quantity * quantity;
                
                // If this material is also craftable, break it down further unless it's a base material
                if (this.isBaseMaterial(materialData.name)) {
                    baseMaterials[materialId] = {
                        name: materialData.name,
                        quantity: totalQuantity
                    };
                } else {
                    // Recursively get base materials for this material
                    const subMaterials = await this.getBaseMaterials(client, materialId, totalQuantity, { ...visited });
                    if (subMaterials) {
                        for (const [subId, subData] of Object.entries(subMaterials)) {
                            if (baseMaterials[subId]) {
                                baseMaterials[subId].quantity += subData.quantity;
                            } else {
                                baseMaterials[subId] = { ...subData };
                            }
                        }
                    }
                }
            }
            return baseMaterials;
        }

        // Fall back to rustlabs data if no known data available
        const craftDetails = client.rustlabs.getCraftDetailsById(itemId);
        if (craftDetails === null) {
            // This item is not craftable, it's a base material
            return { [itemId]: { name: itemName, quantity: quantity } };
        }

        const [id, itemDetails, craftData] = craftDetails;
        const baseMaterials = {};

        // Process each ingredient
        for (const ingredient of craftData.ingredients) {
            const ingredientId = ingredient.id;
            const ingredientQuantity = ingredient.quantity * quantity;
            const ingredientName = client.items.getName(ingredientId);

            // If ingredient is a base material, add it directly
            if (this.isBaseMaterial(ingredientName)) {
                if (baseMaterials[ingredientId]) {
                    baseMaterials[ingredientId].quantity += ingredientQuantity;
                } else {
                    baseMaterials[ingredientId] = { name: ingredientName, quantity: ingredientQuantity };
                }
            } else {
                // Recursively get base materials for this ingredient
                const ingredientBaseMaterials = await this.getBaseMaterials(client, ingredientId, ingredientQuantity, { ...visited });
                
                if (ingredientBaseMaterials) {
                    // Merge the results
                    for (const [baseId, baseData] of Object.entries(ingredientBaseMaterials)) {
                        if (baseMaterials[baseId]) {
                            baseMaterials[baseId].quantity += baseData.quantity;
                        } else {
                            baseMaterials[baseId] = { ...baseData };
                        }
                    }
                }
            }
        }

        return baseMaterials;
    }
};