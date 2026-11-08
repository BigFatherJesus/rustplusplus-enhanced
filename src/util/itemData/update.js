/*
    Item data update from the game files and the open rust-items-json dataset.

    Run on a PC with Rust installed:
        node src/util/itemData/update.js --rust-dir "D:\SteamLibrary\steamapps\common\Rust" [--dry-run]

    - items.json and rustlabsStackData.json come from <rust-dir>/Bundles/items/*.json, the game's
      own item definitions, so they always match the installed build.
    - rustlabsCraftData.json, rustlabsResearchData.json and rustlabsRecycleData.json come from
      https://github.com/bobosneefdev/rust-items-json (MIT, extracted from the game files). Items it
      doesn't cover keep their current entries.
    Despawn, decay, upkeep, durability, building blocks and the extras files have no source that
    allows automated access any more (rusthelp.com and wiki.rustclash.com block scripts), so they
    are left as they are.
*/

const Axios = require('axios');
const Fs = require('node:fs');
const Path = require('node:path');

const STATIC_DIR = Path.join(__dirname, '..', '..', 'staticFiles');
const DATASET_URL = 'https://raw.githubusercontent.com/bobosneefdev/rust-items-json/master/data';
const WORKBENCH_SHORTNAMES = { 1: 'workbench1', 2: 'workbench2', 3: 'workbench3' };
const RECYCLERS = { 'recycler': 'green', 'safe-zone-recycler': 'yellow' };

function parseArgs(argv) {
    const options = { rustDir: null, dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--dry-run') options.dryRun = true;
        else if (argv[i] === '--rust-dir') options.rustDir = argv[++i];
        else if (argv[i].startsWith('--rust-dir=')) options.rustDir = argv[i].slice('--rust-dir='.length);
    }
    return options;
}

function readStatic(filename) {
    return JSON.parse(Fs.readFileSync(Path.join(STATIC_DIR, filename), 'utf8'));
}

function writeStatic(filename, data) {
    Fs.writeFileSync(Path.join(STATIC_DIR, filename), JSON.stringify(data, null, 4) + '\n', 'utf8');
}

async function fetchDataset(name) {
    const response = await Axios.get(`${DATASET_URL}/${name}`, { timeout: 30000 });
    return response.data;
}

/* The folder keeps stale definitions after renames (e.g. advancedblueprintfragment.json next to
   blueprintbook.json with the same item id), so the newest file per id wins and the older
   shortnames are returned as aliases for recipes that still use them. */
function readGameItems(rustDir) {
    const dir = Path.join(rustDir, 'Bundles', 'items');
    if (!Fs.existsSync(dir)) throw new Error(`No item definitions at ${dir}`);

    const items = new Map();
    const aliases = new Map();
    for (const file of Fs.readdirSync(dir).filter(e => e.endsWith('.json'))) {
        const path = Path.join(dir, file);
        const item = JSON.parse(Fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
        const id = String(item.itemid);
        item.mtime = Fs.statSync(path).mtimeMs;
        aliases.set(item.shortname, id);
        if (!items.has(id) || items.get(id).mtime < item.mtime) items.set(id, item);
    }
    return { items, aliases };
}

function formatTime(seconds) {
    const round = (n) => Math.round(n * 100) / 100;
    if (seconds < 60) return `${round(seconds)} sec`;
    const minutes = Math.floor(seconds / 60);
    const rest = round(seconds - minutes * 60);
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}

/* Recycler output per unit: whole amounts are guaranteed, the remainder is a chance at one more. */
function recycleYield(recycle, efficiency, idOf) {
    const guaranteed = [];
    const chances = [];
    for (const entry of recycle) {
        const id = idOf(entry.item);
        const amount = entry.amount * efficiency;
        const whole = Math.floor(amount + 1e-6);
        const fraction = Math.round((amount - whole) * 100) / 100;
        if (whole > 0) guaranteed.push({ id: id, probability: 1, quantity: whole });
        if (fraction > 0) chances.push({ id: id, probability: fraction, quantity: 1 });
    }
    return guaranteed.concat(chances);
}

/* Scrap to reach each tech tree node from the start: its own cost plus the cheapest way in. */
function techTreeCosts(techTrees) {
    const costs = new Map();
    for (const tree of techTrees.filter(e => e.vanilla)) {
        const nodes = new Map(tree.nodes.map(e => [e.id, e]));
        const total = new Map();
        const totalOf = (node) => {
            if (total.has(node.id)) return total.get(node.id);
            const inputs = node.inputs.map(e => nodes.get(e)).filter(Boolean);
            const value = (node.scrap || 0) + (inputs.length > 0 ? Math.min(...inputs.map(totalOf)) : 0);
            total.set(node.id, value);
            return value;
        };
        for (const node of tree.nodes) {
            if (!node.item) continue;
            const value = { workbench: tree.workbench, scrap: node.scrap, totalScrap: totalOf(node) };
            const known = costs.get(node.item);
            if (!known || value.totalScrap < known.totalScrap) costs.set(node.item, value);
        }
    }
    return costs;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options.rustDir) {
        console.error('Usage: node src/util/itemData/update.js --rust-dir "<path to Rust>" [--dry-run]');
        process.exit(1);
    }

    const { items: gameItems, aliases } = readGameItems(options.rustDir);
    const items = readStatic('items.json');
    const stack = readStatic('rustlabsStackData.json');
    const summary = { gameItems: gameItems.size, newItems: [], renamedItems: [], changedStacks: 0 };
    const idByShortname = new Map(aliases);
    for (const [id, entry] of Object.entries(items)) idByShortname.set(entry.shortname, id);

    for (const [id, item] of gameItems) {
        /* A few definitions carry an untranslated phrase token ("#barricade.sandbags.half"). */
        const name = !item.Name.startsWith('#') ? item.Name : (items[id] ? items[id].name :
            item.shortname.split('.').map(e => e.charAt(0).toUpperCase() + e.slice(1)).join(' '));
        const entry = { shortname: item.shortname, name: name, description: item.Description };
        if (!items[id]) summary.newItems.push(entry.name);
        else if (items[id].name !== entry.name) summary.renamedItems.push(`${items[id].name} -> ${entry.name}`);
        items[id] = entry;

        const quantity = String(item.stackable);
        if (!stack[id] || stack[id].quantity !== quantity) summary.changedStacks += 1;
        stack[id] = { quantity: quantity };
    }

    for (const [id, entry] of Object.entries(items)) idByShortname.set(entry.shortname, id);
    const idOf = (shortname) => {
        const id = idByShortname.get(shortname);
        if (!id) throw new Error(`unknown item ${shortname}`);
        return id;
    };

    const [dataset, techTrees, recyclers] = await Promise.all([
        fetchDataset('items.json'), fetchDataset('techtree.json'), fetchDataset('recyclers.json')]);
    const meta = await fetchDataset('meta.json');
    const efficiency = (type) => {
        const recycler = recyclers.find(e => e.type === type);
        return recycler.powergrid && recycler.powergrid.efficiency > recycler.efficiency ?
            recycler.powergrid.efficiency : recycler.efficiency;
    };
    const techCosts = techTreeCosts(techTrees);

    const craft = readStatic('rustlabsCraftData.json');
    const research = readStatic('rustlabsResearchData.json');
    const recycle = readStatic('rustlabsRecycleData.json');
    const counts = { craft: 0, research: 0, recycle: 0, skipped: [] };
    const changedCraftTimes = [];

    for (const entry of dataset) {
        const id = idByShortname.get(entry.shortname);
        if (!id) continue;

        try {
            const crafting = entry.crafting;
            if (crafting && crafting.craftable) {
                const time = crafting.time;
                if (craft[id] && craft[id].time !== time) changedCraftTimes.push(`${items[id].name} ${craft[id].time}s -> ${time}s`);
                craft[id] = {
                    ingredients: crafting.ingredients.map(e => ({ id: idOf(e.item), quantity: e.amount })),
                    workbench: crafting.workbench > 0 ? idOf(WORKBENCH_SHORTNAMES[crafting.workbench]) : null,
                    time: time,
                    timeString: formatTime(time),
                    output: crafting.amount
                };
                counts.craft += 1;
            }

            if (crafting && crafting.researchable) {
                const tech = techCosts.get(entry.shortname);
                research[id] = {
                    researchTable: crafting.researchScrap,
                    workbench: tech ? {
                        type: idOf(WORKBENCH_SHORTNAMES[tech.workbench]),
                        scrap: tech.scrap,
                        totalScrap: tech.totalScrap
                    } : null
                };
                counts.research += 1;
            }

            if (entry.recycle && entry.recycle.length > 0) {
                const value = {};
                for (const [key, type] of Object.entries(RECYCLERS)) {
                    const eff = efficiency(type);
                    value[key] = { efficiency: String(eff), yield: recycleYield(entry.recycle, eff, idOf) };
                }
                value['shredder'] = (recycle[id] && recycle[id]['shredder']) || { efficiency: null, yield: [] };
                recycle[id] = { recycler: value['recycler'], shredder: value['shredder'],
                    'safe-zone-recycler': value['safe-zone-recycler'] };
                counts.recycle += 1;
            }
        }
        catch (error) {
            counts.skipped.push(`${entry.shortname} (${error.message})`);
        }
    }

    console.log(`Game files: ${summary.gameItems} items. Dataset: build ${meta.build} (updated ${meta.updated}).`);
    console.log(`New items (${summary.newItems.length}): ${summary.newItems.sort().join(', ') || '-'}`);
    console.log(`Renamed items (${summary.renamedItems.length}): ${summary.renamedItems.join('; ') || '-'}`);
    console.log(`Stack sizes changed or added: ${summary.changedStacks}`);
    console.log(`Recipes written: ${counts.craft}, research: ${counts.research}, recycling: ${counts.recycle}`);
    console.log(`Craft times changed (${changedCraftTimes.length}): ${changedCraftTimes.slice(0, 15).join('; ')}` +
        (changedCraftTimes.length > 15 ? '; ...' : ''));
    if (counts.skipped.length > 0) console.log(`Skipped: ${counts.skipped.join('; ')}`);

    if (options.dryRun) {
        console.log('Dry run: nothing written.');
        return;
    }
    writeStatic('items.json', items);
    writeStatic('rustlabsStackData.json', stack);
    writeStatic('rustlabsCraftData.json', craft);
    writeStatic('rustlabsResearchData.json', research);
    writeStatic('rustlabsRecycleData.json', recycle);
    console.log('Written to src/staticFiles. The bot rebuilds its AI knowledge export at startup.');
}

main().catch((error) => {
    console.error(`Item data update failed: ${error.message}`);
    process.exit(1);
});
