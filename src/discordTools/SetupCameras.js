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

const DiscordMessages = require('./discordMessages.js');
const DiscordTools = require('./discordTools.js');

/* Camera messages of the same server are kept across restarts and reconnects, so the last snapshots stay
   until the camera handler refreshes them. Only missing ones are posted, with the spotted list moved below. */
module.exports = async (client, rustplus) => {
    const instance = client.getInstance(rustplus.guildId);
    const guildId = rustplus.guildId;
    const serverId = rustplus.serverId;
    const channelId = instance.channelId.cameras;
    const messages = instance.cameraMessageId;
    const cameraWatch = instance.serverList[serverId].cameraWatch;

    /* One by one rather than clearing the channel: bulk delete skips messages older than 14 days. */
    for (const [cameraId, messageId] of Object.entries(messages.cameras)) {
        if (messages.serverId === serverId && cameraWatch.includes(cameraId)) continue;
        await DiscordTools.deleteMessageById(guildId, channelId, messageId);
        delete messages.cameras[cameraId];
    }
    messages.serverId = serverId;
    client.setInstance(guildId, instance);

    let posted = false;
    for (const cameraId of cameraWatch) {
        const message = messages.cameras[cameraId] ?
            await DiscordTools.getMessageById(guildId, channelId, messages.cameras[cameraId]) : undefined;
        if (message === undefined) {
            await DiscordMessages.sendCameraMessage(guildId, serverId, cameraId, null);
            posted = true;
        }
    }

    await DiscordMessages.sendCameraSpottedMessage(guildId, serverId, posted);
};
