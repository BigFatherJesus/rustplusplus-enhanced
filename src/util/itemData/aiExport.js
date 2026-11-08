/*
    AI knowledge export — writes one JSON file per item into AI/items/, one per
    monument into AI/monuments/ and one per world entity into AI/world/ so the
    AI assistant's lookups can serve individual files.

    All data comes from src/staticFiles (no network). Ingredient/yield ids are
    resolved to display names so the files are self-contained and readable by
    small models without extra lookups.
*/

const Fs = require('fs');
const Path = require('path');

const DestroyOptions = require('./destroyOptions.js');

const STATIC_DIR = Path.join(__dirname, '..', '..', 'staticFiles');
const AI_DIR = Path.join(__dirname, '..', '..', '..', 'AI');
const AI_ITEMS_DIR = Path.join(AI_DIR, 'items');
const AI_MONUMENTS_DIR = Path.join(AI_DIR, 'monuments');
const AI_WORLD_DIR = Path.join(AI_DIR, 'world');

/* Extras fields copied verbatim into the item export (names pre-resolved by the scraper). */
const EXTRAS_FIELDS = [
    'maxCondition', 'health', 'decay', 'upkeep', 'repair', 'consumable', 'whereToFind',
    'obtainedFrom', 'shopping', 'storage', 'container', 'backpackSlots', 'mixing',
    'attachment', 'usedIn'
];

function readStatic(filename, fallback) {
    try {
        return JSON.parse(Fs.readFileSync(Path.join(STATIC_DIR, filename), 'utf8'));
    }
    catch (error) {
        return fallback;
    }
}

function safeFilename(name) {
    return name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '_');
}

function ensureDir(dir) {
    if (!Fs.existsSync(dir)) Fs.mkdirSync(dir, { recursive: true });
}

/**
 *  Find durability records for an item: by numeric id first, then by display name in
 *  the buildingBlocks/other sections (deployables sometimes live there by name).
 */
function durabilityRecordsFor(id, name, durability) {
    if (durability.items && durability.items[id]) return durability.items[id];
    if (durability.buildingBlocks && durability.buildingBlocks[name]) return durability.buildingBlocks[name];
    if (durability.other && durability.other[name]) return durability.other[name];
    return undefined;
}

/**
 *  Build the export object for one item.
 */
function buildItemExport(id, sources) {
    const { items, craft, research, recycle, stack, despawn, durability, extras } = sources;
    const nameOf = (itemId) => (items[itemId] && items[itemId].name) || String(itemId);
    const entry = items[id];

    const data = {
        id: id,
        name: entry.name,
        shortname: entry.shortname,
        description: entry.description || undefined
    };

    const craftEntry = craft[id];
    if (craftEntry) {
        const output = (typeof craftEntry.output === 'number' && craftEntry.output > 0)
            ? craftEntry.output : 1;
        data.craft = {
            ingredients: craftEntry.ingredients.map(ing => ({
                name: nameOf(ing.id),
                quantity: ing.quantity
            })),
            producesPerCraft: output,
            workbench: craftEntry.workbench !== null ? nameOf(craftEntry.workbench) : null,
            craftTime: craftEntry.timeString
        };
    }

    const researchEntry = research[id];
    if (researchEntry) {
        data.research = {
            researchTableScrap: researchEntry.researchTable,
            techTreeTotalScrap: researchEntry.workbench ? researchEntry.workbench.totalScrap : null
        };
    }

    const recycleEntry = recycle[id];
    if (recycleEntry && recycleEntry.recycler && recycleEntry.recycler.yield.length > 0) {
        data.recycle = recycleEntry.recycler.yield.map(y => ({
            name: nameOf(y.id),
            quantity: y.quantity,
            chance: y.probability < 1 ? `${Math.round(y.probability * 100)}%` : undefined
        }));
    }

    const stackEntry = stack[id];
    if (stackEntry) data.stackSize = parseInt(stackEntry.quantity, 10) || stackEntry.quantity;

    const despawnEntry = despawn[id];
    if (despawnEntry) data.despawnTime = despawnEntry.timeString;

    /* Scraped extras (repair/loot/vending/food/mixing/...), pre-resolved to names. */
    const extrasEntry = extras[id];
    if (extrasEntry) {
        for (const field of EXTRAS_FIELDS) {
            if (extrasEntry[field] !== undefined) data[field] = extrasEntry[field];
        }
    }

    const records = durabilityRecordsFor(id, entry.name, durability);
    const destroy = DestroyOptions.buildDestroyOptions(records, nameOf);
    if (destroy) data.destroyOptions = destroy;

    return data;
}

/**
 *  Build an export entry for a building block (keyed by name).
 */
function buildNamedExport(name, decaySection, durabilitySection, blockExtras, nameOf) {
    const data = { name, kind: 'buildingBlock' };

    const decay = decaySection[name];
    if (decay) {
        data.hp = decay.hp;
        if (decay.decayString) data.decay = decay.decayString;
    }

    const extras = blockExtras[name];
    if (extras) {
        if (extras.hp && !data.hp) data.hp = extras.hp;
        if (extras.buildCost) data.buildCost = extras.buildCost;
        if (extras.upkeep) data.upkeepPerDay = extras.upkeep;
        if (extras.repair) data.repair = extras.repair;
    }

    const destroy = DestroyOptions.buildDestroyOptions(durabilitySection[name], nameOf);
    if (destroy) data.destroyOptions = destroy;

    return data;
}

/**
 *  Write one export file, guarding against filename collisions between items and
 *  building blocks (a colliding block gets a "_block" suffix).
 */
function writeExport(dir, name, data, writtenSet, suffix, log) {
    let filename = `${safeFilename(name)}.json`;
    if (writtenSet.has(filename)) {
        log('warning', `AI export filename collision for "${name}" — writing as ${suffix} variant`);
        filename = `${safeFilename(name)}${suffix}.json`;
        if (writtenSet.has(filename)) return false;
    }
    Fs.writeFileSync(Path.join(dir, filename), JSON.stringify(data, null, 2) + '\n', 'utf8');
    writtenSet.add(filename);
    return true;
}

module.exports = {
    /**
     *  Export items, building blocks, monuments and world entities as AI knowledge JSONs.
     *  @param {Object} [opts] Options: { log }.
     *  @return {{ written: number, blocks: number, monuments: number, world: number, errors: number }}
     */
    exportAiItems: function (opts = {}) {
        const log = typeof opts.log === 'function' ? opts.log : (() => { });

        const items = readStatic('items.json', {});
        const sources = {
            items,
            craft: readStatic('rustlabsCraftData.json', {}),
            research: readStatic('rustlabsResearchData.json', {}),
            recycle: readStatic('rustlabsRecycleData.json', {}),
            stack: readStatic('rustlabsStackData.json', {}),
            despawn: readStatic('rustlabsDespawnData.json', {}),
            durability: readStatic('rustlabsDurabilityData.json', {}),
            extras: readStatic('rusthelpExtras.json', {})
        };
        const decay = readStatic('rustlabsDecayData.json', { items: {}, buildingBlocks: {}, other: {} });
        const blockExtras = readStatic('rusthelpBuildingExtras.json', {});
        const monuments = readStatic('rusthelpMonuments.json', {});
        const worldEntities = readStatic('rusthelpWorldEntities.json', {});

        ensureDir(AI_ITEMS_DIR);

        const nameOf = (id) => (items[id] && items[id].name) || String(id);
        const writtenItems = new Set();

        let written = 0;
        let errors = 0;
        for (const id of Object.keys(items)) {
            try {
                const data = buildItemExport(id, sources);
                if (writeExport(AI_ITEMS_DIR, items[id].name, data, writtenItems, '_item', log)) written++;
            }
            catch (error) {
                errors++;
                log('warning', `AI export failed for item ${id}: ${error.message}`);
            }
        }

        /* Building blocks (Stone Wall, etc.) are keyed by name, not in items.json. */
        const blockNames = new Set([
            ...Object.keys(sources.durability.buildingBlocks || {}),
            ...Object.keys((decay && decay.buildingBlocks) || {}),
            ...Object.keys(blockExtras)
        ]);
        let blocks = 0;
        for (const name of blockNames) {
            try {
                const data = buildNamedExport(name, (decay && decay.buildingBlocks) || {},
                    sources.durability.buildingBlocks || {}, blockExtras, nameOf);
                if (writeExport(AI_ITEMS_DIR, name, data, writtenItems, '_block', log)) blocks++;
            }
            catch (error) {
                errors++;
                log('warning', `AI export failed for building block ${name}: ${error.message}`);
            }
        }

        /* Monuments: puzzle requirements, features, spawns. */
        let monumentCount = 0;
        if (Object.keys(monuments).length > 0) {
            ensureDir(AI_MONUMENTS_DIR);
            const writtenMonuments = new Set();
            for (const [name, entry] of Object.entries(monuments)) {
                try {
                    const data = { name, kind: 'monument', ...entry };
                    delete data.slug;
                    if (writeExport(AI_MONUMENTS_DIR, name, data, writtenMonuments, '_monument', log)) monumentCount++;
                }
                catch (error) {
                    errors++;
                    log('warning', `AI export failed for monument ${name}: ${error.message}`);
                }
            }
        }

        /* World entities: crate/NPC loot tables, harvesting, collectables. */
        let worldCount = 0;
        if (Object.keys(worldEntities).length > 0) {
            ensureDir(AI_WORLD_DIR);
            const writtenWorld = new Set();
            for (const [name, entry] of Object.entries(worldEntities)) {
                try {
                    const data = { name, kind: 'worldEntity', ...entry };
                    delete data.slug;
                    if (writeExport(AI_WORLD_DIR, name, data, writtenWorld, '_entity', log)) worldCount++;
                }
                catch (error) {
                    errors++;
                    log('warning', `AI export failed for world entity ${name}: ${error.message}`);
                }
            }
        }

        log('info', `AI export: ${written} items + ${blocks} blocks + ${monumentCount} monuments + ` +
            `${worldCount} world entities${errors > 0 ? `, ${errors} errors` : ''}`);
        return { written, blocks, monuments: monumentCount, world: worldCount, errors };
    }
};
