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

    Rust+ cameras (CCTV, PTZ cameras, auto turrets, drones) by their in-game ID. Rust+ only allows this while
    the paired player is out of the game, and since 2026 only for cameras the player has access to; monument
    cameras answer access_denied. Each frame lists the players in view by name. The watched cameras get a
    message each in the cameras channel, refreshed every few minutes, with a list of the players outside the
    team they spotted; while the whole team is offline they are checked every minute and a stranger is
    reported in the activity channel.
*/

const Camera = require('@liamcottle/rustplus.js/camera.js');

const DiscordMessages = require('../discordTools/discordMessages.js');

const LOOK_MS = 6000;
const WATCH_INTERVAL_MS = 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SIGHTING_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_SPOTTED = 25;
const PLAYER_ENTITY = 2;

module.exports = {
    /* One camera per connection at a time, so every look waits for the one before it. */
    look: function (rustplus, cameraId) {
        const run = async () => {
            const response = await rustplus.subscribeToCameraAsync(cameraId);
            if (!response || !response.cameraSubscribeInfo) {
                return { error: response && response.error ? response.error : `${response}` };
            }

            const rays = [];
            const onMessage = (message) => {
                if (message.broadcast && message.broadcast.cameraRays) rays.push(message.broadcast.cameraRays);
            };
            rustplus.on('message', onMessage);
            await new Promise(resolve => setTimeout(resolve, LOOK_MS));
            rustplus.removeListener('message', onMessage);
            await rustplus.unsubscribeFromCameraAsync();

            return { info: response.cameraSubscribeInfo, rays: rays };
        };

        const result = rustplus.cameraQueue.then(run);
        rustplus.cameraQueue = result.catch(() => { });
        return result;
    },

    /* The library's own frame renderer; it needs no subscribed Camera object. Returns a PNG buffer. */
    render: async function (look) {
        if (look.rays.length === 0) return null;
        return await Camera.prototype._renderCameraFrame(look.rays, look.info.width, look.info.height);
    },

    snapshot: async function (look) {
        return {
            frame: await module.exports.render(look),
            players: module.exports.playersInView(look),
            time: Date.now()
        };
    },

    playersInView: function (look) {
        const players = new Map();
        for (const rays of look.rays) {
            for (const entity of rays.entities || []) {
                if (entity.type === PLAYER_ENTITY) players.set(entity.entityId, entity.name || null);
            }
        }
        return [...players.values()];
    },

    handler: async function (rustplus, client) {
        const instance = client.getInstance(rustplus.guildId);
        const server = instance.serverList[rustplus.serverId];
        const watch = rustplus.cameraWatch;

        if (!server || server.cameraWatch.length === 0 || watch.running) return;
        const interval = rustplus.team.allOffline ? WATCH_INTERVAL_MS : REFRESH_INTERVAL_MS;
        if (Date.now() - watch.lastRun < interval) return;

        watch.running = true;
        watch.lastRun = Date.now();
        watch.paused = null;
        let posted = false;
        try {
            for (const cameraId of [...server.cameraWatch]) {
                const look = await module.exports.look(rustplus, cameraId);

                /* These are about the paired player, not the camera: every other camera answers the same. */
                if (look.error === 'player_online' || look.error === 'no_player') {
                    watch.paused = look.error;
                    break;
                }

                /* Log a failing camera once per new error, not every minute. */
                if (look.error) {
                    if (watch.errors[cameraId] !== look.error) {
                        rustplus.log(client.intlGet(null, 'warningCap'), client.intlGet(null, 'cameraWatchFailed', {
                            camera: cameraId,
                            error: look.error
                        }));
                    }
                    watch.errors[cameraId] = look.error;
                    continue;
                }
                delete watch.errors[cameraId];
                if (!server.cameraWatch.includes(cameraId)) continue;

                const snapshot = await module.exports.snapshot(look);
                posted = await DiscordMessages.sendCameraMessage(rustplus.guildId, rustplus.serverId, cameraId,
                    snapshot) || posted;

                const team = rustplus.team.players.map(e => e.name);
                const strangers = snapshot.players.filter(e => !team.includes(e))
                    .map(e => e === null ? client.intlGet(rustplus.guildId, 'unknown') : e);
                if (strangers.length === 0) continue;

                for (const name of strangers) {
                    const spotted = server.cameraSpotted[name] || { cameras: [] };
                    if (!spotted.cameras.includes(cameraId)) spotted.cameras.push(cameraId);
                    spotted.lastSeen = snapshot.time;
                    server.cameraSpotted[name] = spotted;
                }
                server.cameraSpotted = Object.fromEntries(Object.entries(server.cameraSpotted)
                    .sort((a, b) => b[1].lastSeen - a[1].lastSeen).slice(0, MAX_SPOTTED));
                client.setInstance(rustplus.guildId, instance);

                if (!rustplus.team.allOffline) continue;
                const fresh = strangers.filter(e =>
                    !(watch.sightings[`${cameraId}:${e}`] > snapshot.time - SIGHTING_COOLDOWN_MS));
                if (fresh.length === 0) continue;
                for (const name of fresh) watch.sightings[`${cameraId}:${name}`] = snapshot.time;

                await DiscordMessages.sendCameraSightingMessage(rustplus.guildId, rustplus.serverId, cameraId,
                    strangers, snapshot.frame);
            }
        }
        finally {
            watch.running = false;
        }

        await DiscordMessages.sendCameraSpottedMessage(rustplus.guildId, rustplus.serverId, posted);
    },
};
