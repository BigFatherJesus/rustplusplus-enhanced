/*
    Trackers: watch a group of players on a Rust server and post when they connect or disconnect.

    Every cycle (60 s) each tracked server is asked for its online player list with the free Steam
    server query (src/util/serverQuery.js). Players are matched by name, so the current Steam name
    of every tracked Steam ID is re-read every NAME_REFRESH_CYCLES cycles.
*/

const Config = require('../../config');
const Constants = require('../util/constants.js');
const DiscordMessages = require('../discordTools/discordMessages.js');
const Scrape = require('../util/scrape.js');
const ServerQuery = require('../util/serverQuery.js');
const Utils = require('../util/utils.js');

const NAME_REFRESH_CYCLES = 5;
const ADDRESS_LOOKUP_INTERVAL_MS = 30 * 60 * 1000;

let cycle = 0;
let running = false;
const lastAddressLookup = new Map();

function normalise(name) {
    return Utils.removeInvisibleCharacters(name).trim();
}

async function queryOnlineNames(address) {
    const [host, port] = address.split(':');
    try {
        return new Set((await ServerQuery.players(host, parseInt(port))).map(normalise).filter(e => e !== ''));
    }
    catch (e) {
        return null;
    }
}

async function lookUpAddress(client, guildId, trackerId, tracker) {
    const key = `${guildId}-${trackerId}`;
    if (Date.now() - (lastAddressLookup.get(key) ?? 0) < ADDRESS_LOOKUP_INTERVAL_MS) return;
    lastAddressLookup.set(key, Date.now());

    try {
        const server = await ServerQuery.findByName(tracker.title, Config.steam.apiKey);
        if (server === null) {
            client.log(client.intlGet(null, 'warningCap'),
                `Tracker ${tracker.name}: Steam lists no server named "${tracker.title}"; set the address with EDIT.`);
            return;
        }
        tracker.address = `${server.host}:${server.port}`;
        client.log(client.intlGet(null, 'infoCap'), `Tracker ${tracker.name}: found "${tracker.title}" at ${tracker.address}.`);
    }
    catch (e) {
        /* Only the message: the request config holds the API key. */
        client.log(client.intlGet(null, 'errorCap'), `Tracker ${tracker.name}: Steam server lookup failed: ${e.message}`,
            'error');
    }
}

async function refreshSteamNames(client, guildId, tracker, steamNames) {
    for (const player of tracker.players) {
        if (player.steamId === null) continue;

        if (!steamNames.has(player.steamId)) {
            steamNames.set(player.steamId, await Scrape.scrapeSteamProfileName(client, player.steamId));
        }
        const steamName = steamNames.get(player.steamId);
        if (steamName === null) continue;

        const name = (tracker.clanTag !== '' ? `${tracker.clanTag} ` : '') + steamName;
        if (player.name === name) continue;

        const str = client.intlGet(guildId, 'trackerPlayerNameChanged', {
            old: player.name, new: name, tracker: tracker.name
        });
        await DiscordMessages.sendActivityNotificationMessage(guildId, tracker.serverId, Constants.COLOR_DEFAULT,
            str, null, tracker.title, tracker.everyone);
        player.name = name;
    }
}

async function updatePlayers(client, guildId, tracker, onlineNames, firstCycle) {
    const rustplus = client.rustplusInstances[guildId];

    for (const player of tracker.players) {
        /* onlineAs keeps a player online when they change their Steam name mid-session. */
        const matched = [player.name, player.onlineAs].find(e => e && onlineNames.has(normalise(e))) ?? null;
        const online = matched !== null;
        player.onlineAs = matched;

        if (player.online === online) continue;

        const isNew = player.online === undefined || player.online === null;
        player.online = online;
        player.since = new Date().toISOString();
        if (firstCycle || isNew) continue;

        const str = client.intlGet(guildId, online ? 'playerJustConnectedTracker' : 'playerJustDisconnectedTracker', {
            name: player.name, tracker: tracker.name
        });
        await DiscordMessages.sendActivityNotificationMessage(guildId, tracker.serverId,
            online ? Constants.COLOR_ACTIVE : Constants.COLOR_INACTIVE, str, null, tracker.title, tracker.everyone);
        if (rustplus && rustplus.serverId === tracker.serverId && tracker.inGame) {
            rustplus.sendInGameMessage(str);
        }
    }
}

module.exports = {
    handler: async function (client) {
        if (running) return;
        running = true;

        try {
            const firstCycle = cycle === 0;
            const refreshNames = cycle % NAME_REFRESH_CYCLES === 0;
            cycle += 1;

            const onlineNamesByAddress = new Map();
            const steamNames = new Map();

            for (const guildId of client.guilds.cache.keys()) {
                const instance = client.getInstance(guildId);
                if (!instance) continue;

                for (const [trackerId, tracker] of Object.entries(instance.trackers)) {
                    if (refreshNames) await refreshSteamNames(client, guildId, tracker, steamNames);
                    if (!tracker.address && Config.steam.apiKey !== '') {
                        await lookUpAddress(client, guildId, trackerId, tracker);
                    }

                    if (tracker.address) {
                        if (!onlineNamesByAddress.has(tracker.address)) {
                            onlineNamesByAddress.set(tracker.address, await queryOnlineNames(tracker.address));
                        }
                        const onlineNames = onlineNamesByAddress.get(tracker.address);
                        tracker.reachable = onlineNames !== null;
                        if (onlineNames) await updatePlayers(client, guildId, tracker, onlineNames, firstCycle);
                    }

                    client.setInstance(guildId, instance);
                    await DiscordMessages.sendTrackerMessage(guildId, trackerId);
                }
            }
        }
        catch (e) {
            client.log(client.intlGet(null, 'errorCap'), `Tracker update failed: ${e.stack ?? e}`, 'error');
        }
        finally {
            running = false;
        }
    },
};
