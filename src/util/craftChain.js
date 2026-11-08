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

/*
    Base-material computation for the chaincraft commands: recurses the local crafting data
    (rustlabsCraftData.json via client.rustlabs) down to base resources and components.
*/

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
    isBaseMaterial: function (itemName) {
        return BASE_MATERIALS.has(itemName);
    },

    /**
     * Get base materials for an item by recursively decomposing the local crafting data.
     * No network calls are performed. Recursion stops at base materials (see BASE_MATERIALS)
     * or at items with no known crafting recipe.
     *
     * Recipes that produce multiple items per craft (craftData.output, e.g. Gun Powder
     * yields 10) are normalized: ingredient costs are divided by the output amount so
     * totals reflect true per-item cost. Final quantities are rounded up.
     * @param {Object} client - The Discord client (provides client.items and client.rustlabs)
     * @param {string} itemId - The item ID
     * @param {number} quantity - The quantity needed
     * @param {Object} visited - Object to track visited items to prevent infinite loops
     * @returns {Object|null} Object mapping itemId -> { name, quantity } of base materials
     */
    getBaseMaterials: function (client, itemId, quantity, visited = {}) {
        const collected = this._collectBaseMaterials(client, itemId, quantity, visited);
        if (collected === null) return null;

        /* Exact fractional totals are kept during recursion; round up for display. */
        const rounded = {};
        for (const [baseId, baseData] of Object.entries(collected)) {
            rounded[baseId] = { name: baseData.name, quantity: Math.ceil(baseData.quantity) };
        }
        return rounded;
    },

    /**
     * Internal recursion for getBaseMaterials — keeps fractional quantities exact.
     * NOTE: visited is intentionally branch-local (spread copy). The same sub-item on
     * two different recipe branches must be counted twice; visited only breaks cycles
     * within a single decomposition path.
     */
    _collectBaseMaterials: function (client, itemId, quantity, visited = {}) {
        // Prevent infinite loops on cyclic recipes
        if (visited[itemId]) {
            return {};
        }
        visited = { ...visited, [itemId]: true };

        const itemName = client.items.getName(itemId);
        if (!itemName) {
            client.log(client.intlGet(null, 'warningCap'), `Item with ID ${itemId} not found`);
            return null;
        }

        // Treat declared base materials as leaves
        if (this.isBaseMaterial(itemName)) {
            return { [itemId]: { name: itemName, quantity: quantity } };
        }

        // Look up the crafting recipe from local data
        const craftDetails = client.rustlabs.getCraftDetailsById(itemId);
        if (craftDetails === null) {
            // Not craftable -> it is itself a base material
            return { [itemId]: { name: itemName, quantity: quantity } };
        }

        const [, , craftData] = craftDetails;
        if (!craftData || !Array.isArray(craftData.ingredients) || craftData.ingredients.length === 0) {
            return { [itemId]: { name: itemName, quantity: quantity } };
        }

        /* Items produced per craft operation; recipes scraped before the output field
           existed default to 1 (per-craft == per-item). */
        const output = (typeof craftData.output === 'number' && craftData.output > 0)
            ? craftData.output : 1;

        const baseMaterials = {};
        for (const ingredient of craftData.ingredients) {
            const ingredientId = ingredient.id;
            const ingredientQuantity = (ingredient.quantity * quantity) / output;
            const ingredientName = client.items.getName(ingredientId);

            if (ingredientName && this.isBaseMaterial(ingredientName)) {
                if (baseMaterials[ingredientId]) {
                    baseMaterials[ingredientId].quantity += ingredientQuantity;
                } else {
                    baseMaterials[ingredientId] = { name: ingredientName, quantity: ingredientQuantity };
                }
                continue;
            }

            const sub = this._collectBaseMaterials(client, ingredientId, ingredientQuantity, visited);
            if (sub) {
                for (const [baseId, baseData] of Object.entries(sub)) {
                    if (baseMaterials[baseId]) {
                        baseMaterials[baseId].quantity += baseData.quantity;
                    } else {
                        baseMaterials[baseId] = { ...baseData };
                    }
                }
            }
        }

        return baseMaterials;
    }
};
