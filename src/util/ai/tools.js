/*
    AI tool definitions + executors.

    Exposes live Rust+ server data (team, server info, time, smart devices) and the
    AI/ knowledge folder to the model
    via OpenAI-style function calling. Control tools (toggling switches) are
    gated behind config + caller permissions.

    Each executor returns a short string (or compact JSON) that is fed back to
    the model as the tool result.
*/

const Fs = require('fs');
const Path = require('path');

const Config = require('../../../config');
const Knowledge = require('./knowledge.js');
const Map = require('../map.js');
const Timer = require('../timer.js');

const AI_ITEMS_DIR = Path.join(__dirname, '..', '..', '..', 'AI', 'items');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getOperationalRustplus(ctx) {
    const rustplus = ctx.client.rustplusInstances[ctx.guildId];
    if (!rustplus || !rustplus.isOperational) return null;
    return rustplus;
}

function itemName(ctx, id) {
    return ctx.client.items.getName(String(id)) ?? String(id);
}

/* ------------------------------------------------------------------ */
/* Executors                                                           */
/* ------------------------------------------------------------------ */

async function execSearchKnowledge(ctx, args) {
    const query = (args.query || '').trim();
    if (query === '') return 'No query provided.';
    const docs = Knowledge.loadRelevantDocuments(query);
    return docs !== '' ? docs : 'No matching knowledge documents found.';
}

async function execGetItem(ctx, args) {
    const name = (args.name || '').trim();
    if (name === '') return 'No item name provided.';

    if (!Fs.existsSync(AI_ITEMS_DIR)) return 'Item knowledge folder not found.';

    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const wantedWords = norm(name).split(' ').filter(Boolean);
    const wantedJoined = wantedWords.join('');

    let best = null;
    let bestScore = -Infinity;
    let bestConfident = false;
    let exact = false;
    const partials = [];
    for (const file of Fs.readdirSync(AI_ITEMS_DIR)) {
        if (!file.endsWith('.json')) continue;
        const display = file.slice(0, -5).replace(/_/g, ' ');
        const label = norm(display);
        const labelWords = label.split(' ').filter(Boolean);
        const labelJoined = labelWords.join('');

        if (labelJoined === wantedJoined) { best = file; exact = true; break; }

        /* Word-overlap scoring: count query words present as whole words,
           then prefer the most specific (fewest extra words). */
        const matched = wantedWords.filter(w => labelWords.includes(w)).length;
        /* Substring fallback catches partial words, but only when the label is at
           least as specific as the query — otherwise the resource "Wood" outranks
           "Wooden Floor" for the query "wood floor". */
        const substr = (labelWords.length >= wantedWords.length) &&
            (labelJoined.includes(wantedJoined) || wantedJoined.includes(labelJoined));
        if (matched === 0 && !substr) continue;

        const allWanted = matched === wantedWords.length;
        const score = matched * 100 - Math.abs(labelWords.length - wantedWords.length)
            + (allWanted ? 50 : 0) + (substr ? 5 : 0);
        partials.push({ display, score });
        if (score > bestScore) { bestScore = score; best = file; bestConfident = allWanted; }
    }

    /* Only auto-return confident matches (exact, or every query word present).
       Anything weaker gets suggestions so the model retries with the right name. */
    if (!best || (!exact && !bestConfident)) {
        const suggestions = partials.sort((a, b) => b.score - a.score).slice(0, 8).map(p => p.display);
        if (suggestions.length > 0) {
            return `No exact match for "${name}". Did you mean one of: ${suggestions.join(', ')}? ` +
                `Call get_item again with the correct name.`;
        }
        return `No item found for "${name}". Try search_items to find the correct name.`;
    }
    try {
        const content = Fs.readFileSync(Path.join(AI_ITEMS_DIR, best), 'utf8');
        if (exact) return content;
        /* Confident-but-fuzzy match: tell the model what actually matched. */
        const matchedName = best.slice(0, -5).replace(/_/g, ' ');
        return `Matched item: ${matchedName}\n${content}`;
    }
    catch (error) {
        return `Failed to read item data: ${error.message}`;
    }
}

async function execSearchItems(ctx, args) {
    const query = (args.query || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (query === '') return 'No query provided.';
    if (!Fs.existsSync(AI_ITEMS_DIR)) return 'Item knowledge folder not found.';

    const words = query.split(' ').filter(Boolean);
    const matches = [];
    for (const file of Fs.readdirSync(AI_ITEMS_DIR)) {
        if (!file.endsWith('.json')) continue;
        const display = file.slice(0, -5).replace(/_/g, ' ');
        const hay = display.toLowerCase();
        if (words.every(w => hay.includes(w))) matches.push(display);
    }
    if (matches.length === 0) return `No item names matching "${args.query}".`;

    /* Most relevant first: fewest extra words, then shortest name — so "wall"
       surfaces "Stone Wall" before "High External Stone Wall (Frozen)". */
    matches.sort((a, b) => {
        const wa = a.split(' ').length;
        const wb = b.split(' ').length;
        if (wa !== wb) return wa - wb;
        return a.length - b.length;
    });
    const shown = matches.slice(0, 25);
    const result = JSON.stringify(shown);
    return matches.length > shown.length
        ? `${result} ... (+${matches.length - shown.length} more matches, refine your query)`
        : result;
}

async function execGetServerInfo(ctx) {
    const rustplus = getOperationalRustplus(ctx);
    if (!rustplus) return 'Not connected to a Rust server.';
    const info = await rustplus.getInfoAsync();
    if (!await rustplus.isResponseValid(info)) return 'Failed to read server info.';
    const i = info.info;
    return JSON.stringify({
        name: i.name,
        players: i.players,
        maxPlayers: i.maxPlayers,
        queued: i.queuedPlayers,
        mapSize: i.mapSize,
        wipeTime: i.wipeTime
    });
}

async function execGetTime(ctx) {
    const rustplus = getOperationalRustplus(ctx);
    if (!rustplus) return 'Not connected to a Rust server.';
    const t = rustplus.time;
    if (!t || typeof t.time !== 'number') return 'Time data not available yet.';

    /* Pre-formatted strings so the model cannot mangle decimal hours, plus the
       REAL-WORLD countdown (the in-game clock runs much faster than real time). */
    const isDay = t.isDay();
    const out = {
        inGameTime: Timer.convertDecimalToHoursMinutes(t.time),
        isDay,
        sunrise: Timer.convertDecimalToHoursMinutes(t.sunrise),
        sunset: Timer.convertDecimalToHoursMinutes(t.sunset)
    };
    const till = t.getTimeTillDayOrNight();
    if (till !== null) {
        out[isDay ? 'realTimeUntilNightfall' : 'realTimeUntilDaylight'] = till;
        out.note = 'realTimeUntil* is real-world time, NOT in-game hours. Use it to answer ' +
            '"how long until night/day". Never convert in-game hours to seconds.';
    }
    return JSON.stringify(out);
}

async function execGetTeam(ctx) {
    const rustplus = getOperationalRustplus(ctx);
    if (!rustplus) return 'Not connected to a Rust server.';
    const info = await rustplus.getTeamInfoAsync();
    if (!await rustplus.isResponseValid(info)) return 'Failed to read team info.';

    const mapSize = rustplus.info ? rustplus.info.correctedMapSize : null;
    const members = info.teamInfo.members.map(m => ({
        name: m.name,
        online: m.isOnline,
        alive: m.isAlive,
        leader: m.steamId.toString() === info.teamInfo.leaderSteamId.toString(),
        grid: (m.isOnline && mapSize) ? Map.getGridPos(m.x, m.y, mapSize) : null
    }));
    return JSON.stringify(members);
}

async function execListDevices(ctx) {
    const instance = ctx.client.getInstance(ctx.guildId);
    const rustplus = getOperationalRustplus(ctx);
    if (!rustplus) return 'Not connected to a Rust server.';
    const serverId = rustplus.serverId;
    const server = instance.serverList[serverId];
    if (!server) return 'No server configuration found.';

    const switches = Object.values(server.switches || {}).map(s => ({
        name: s.name, on: s.active, kind: 'switch'
    }));
    const alarms = Object.values(server.alarms || {}).map(a => ({
        name: a.name, kind: 'alarm'
    }));
    const devices = [...switches, ...alarms];
    if (devices.length === 0) return 'No smart devices configured.';
    return JSON.stringify(devices);
}

async function execSetSwitch(ctx, args) {
    if (!Config.ai.controlEnabled) return 'Device control is disabled in config.';
    if (!ctx.caller.canControl) return 'You do not have permission to control devices.';

    const name = (args.name || '').trim().toLowerCase();
    const on = args.on === true || args.on === 'true';
    if (name === '') return 'No switch name provided.';

    const instance = ctx.client.getInstance(ctx.guildId);
    const rustplus = getOperationalRustplus(ctx);
    if (!rustplus) return 'Not connected to a Rust server.';
    const server = instance.serverList[rustplus.serverId];
    const switches = server ? (server.switches || {}) : {};

    const entry = Object.entries(switches).find(([, s]) => s.name.toLowerCase() === name)
        || Object.entries(switches).find(([, s]) => s.name.toLowerCase().includes(name));
    if (!entry) return `No smart switch named "${args.name}".`;

    const [entityId, sw] = entry;
    try {
        const ok = await rustplus.turnSmartSwitchAsync(entityId, on);
        if (!await rustplus.isResponseValid(ok)) {
            return `Switch "${sw.name}" did not respond (device may be unpowered or out of range).`;
        }
        return `Switch "${sw.name}" turned ${on ? 'ON' : 'OFF'}.`;
    }
    catch (error) {
        return `Failed to toggle "${sw.name}": ${error.message}`;
    }
}

/* ------------------------------------------------------------------ */
/* Tool registry                                                       */
/* ------------------------------------------------------------------ */

const TOOLS = [
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_item',
                description: 'Get craft cost, recycle yield, research cost and raid/destroy options for a Rust item or building block. Use for any item/raid question.',
                parameters: {
                    type: 'object',
                    properties: { name: { type: 'string', description: 'Item or building block name, e.g. "Garage Door", "Sheet Metal Wall", "Rocket".' } },
                    required: ['name']
                }
            }
        },
        execute: execGetItem
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'search_items',
                description: 'Find exact item/building-block names that contain the given words. Use when get_item did not find a name, or to resolve slang/abbreviations to the real name before calling get_item.',
                parameters: {
                    type: 'object',
                    properties: { query: { type: 'string', description: 'Words to match against item names, e.g. "metal chest" or "rifle".' } },
                    required: ['query']
                }
            }
        },
        execute: execSearchItems
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'search_knowledge',
                description: 'Search the knowledge base (raid strategy, electricity, building tiers, general Rust info) by keywords.',
                parameters: {
                    type: 'object',
                    properties: { query: { type: 'string', description: 'Keywords to search for.' } },
                    required: ['query']
                }
            }
        },
        execute: execSearchKnowledge
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_team',
                description: 'Get current team members: name, online, alive, leader, and map grid position.',
                parameters: { type: 'object', properties: {} }
            }
        },
        execute: execGetTeam
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_server_info',
                description: 'Get live server info: player count, queue, map size, wipe time.',
                parameters: { type: 'object', properties: {} }
            }
        },
        execute: execGetServerInfo
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_time',
                description: 'Get current in-game time and whether it is day or night.',
                parameters: { type: 'object', properties: {} }
            }
        },
        execute: execGetTime
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'list_devices',
                description: 'List configured smart switches (with on/off state) and alarms.',
                parameters: { type: 'object', properties: {} }
            }
        },
        execute: execListDevices
    },
    {
        definition: {
            type: 'function',
            function: {
                name: 'set_switch',
                description: 'Turn a smart switch ON or OFF by name. Only use when the user explicitly asks to control a device.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Smart switch name.' },
                        on: { type: 'boolean', description: 'true to turn on, false to turn off.' }
                    },
                    required: ['name', 'on']
                }
            }
        },
        execute: execSetSwitch
    }
];

module.exports = {
    /**
     * Tool definitions for the chat completion request.
     * @returns {Array<Object>}
     */
    getDefinitions: function () {
        return TOOLS.map(t => t.definition);
    },

    /**
     * Execute a tool call by name.
     * @param {string} name - Tool name
     * @param {Object} args - Parsed arguments
     * @param {Object} ctx - { client, guildId, caller: { steamId, discordId, canControl } }
     * @returns {Promise<string>} Tool result string
     */
    execute: async function (name, args, ctx) {
        const tool = TOOLS.find(t => t.definition.function.name === name);
        if (!tool) return `Unknown tool: ${name}`;
        try {
            return await tool.execute(ctx, args || {});
        }
        catch (error) {
            return `Tool "${name}" failed: ${error.message}`;
        }
    }
};
