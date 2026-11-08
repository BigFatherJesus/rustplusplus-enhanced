/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

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

const CommandHandler = require('../handlers/inGameCommandHandler.js');
const Constants = require('../util/constants.js');
const DiscordMessages = require('../discordTools/discordMessages.js');
const InGameChatHandler = require('../handlers/inGameChatHandler.js');
const SmartSwitchGroupHandler = require('../handlers/smartSwitchGroupHandler.js');
const TeamChatHandler = require("../handlers/teamChatHandler.js");
const TeamHandler = require('../handlers/teamHandler.js');

module.exports = {
    name: 'message',
    async execute(rustplus, client, message) {
        if (!rustplus.isServerAvailable()) return rustplus.deleteThisRustplusInstance();

        if (!rustplus.isOperational) return;

        if (message.hasOwnProperty('response')) {
            messageResponse(rustplus, client, message);
        }
        else if (message.hasOwnProperty('broadcast')) {
            messageBroadcast(rustplus, client, message);
        }
    },
};

async function messageResponse(rustplus, client, message) {
    /* Not implemented */
}

async function messageBroadcast(rustplus, client, message) {
    if (message.broadcast.hasOwnProperty('teamChanged')) {
        messageBroadcastTeamChanged(rustplus, client, message);
    }
    else if (message.broadcast.hasOwnProperty('teamMessage')) {
        messageBroadcastTeamMessage(rustplus, client, message);
    }
    else if (message.broadcast.hasOwnProperty('entityChanged')) {
        messageBroadcastEntityChanged(rustplus, client, message);
    }
    else if (message.broadcast.hasOwnProperty('cameraRays')) {
        messageBroadcastCameraRays(rustplus, client, message);
    }
}

async function messageBroadcastTeamChanged(rustplus, client, message) {
    TeamHandler.handler(rustplus, client, message.broadcast.teamChanged.teamInfo);
    const changed = rustplus.team.isLeaderSteamIdChanged(message.broadcast.teamChanged.teamInfo);
    rustplus.team.updateTeam(message.broadcast.teamChanged.teamInfo);
    if (changed) rustplus.updateLeaderRustPlusLiteInstance();
}

async function messageBroadcastTeamMessage(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const steamId = message.broadcast.teamMessage.message.steamId.toString();

    if (steamId === rustplus.playerId) {
        /* Delay inGameChatHandler */
        clearTimeout(rustplus.inGameChatTimeout);
        const commandDelayMs = parseInt(rustplus.generalSettings.commandDelay) * 1000;
        rustplus.inGameChatTimeout = setTimeout(
            InGameChatHandler.inGameChatHandler, commandDelayMs, rustplus, client);
    }

    let tempName = message.broadcast.teamMessage.message.name;
    let tempMessage = message.broadcast.teamMessage.message.message;

    tempName = tempName.replace(/^<size=.*?><color=.*?>/, '');  /* Rustafied */
    tempName = tempName.replace(/<\/color><\/size>$/, '');      /* Rustafied */
    message.broadcast.teamMessage.message.name = tempName;

    tempMessage = tempMessage.replace(/^<size=.*?><color=.*?>/, '');  /* Rustafied */
    tempMessage = tempMessage.replace(/<\/color><\/size>$/, '');      /* Rustafied */
    tempMessage = tempMessage.replace(/^<color.+?<\/color>/g, '');      /* Unknown */
    message.broadcast.teamMessage.message.message = tempMessage;

    if (instance.blacklist['steamIds'].includes(`${steamId}`)) {
        rustplus.log(client.intlGet(null, 'infoCap'), client.intlGet(null, `userPartOfBlacklistInGame`, {
            user: `${message.broadcast.teamMessage.message.name} (${steamId})`,
            message: message.broadcast.teamMessage.message.message
        }));
        TeamChatHandler(rustplus, client, message.broadcast.teamMessage.message);
        return;
    }

    if (rustplus.messagesSentByBot.includes(message.broadcast.teamMessage.message.message)) {
        /* Remove message from messagesSendByBot */
        for (let i = rustplus.messagesSentByBot.length - 1; i >= 0; i--) {
            if (rustplus.messagesSentByBot[i] === message.broadcast.teamMessage.message.message) {
                rustplus.messagesSentByBot.splice(i, 1);
            }
        }
        return;
    }

    const isCommand = await CommandHandler.inGameCommandHandler(rustplus, client, message);
    if (isCommand) return;

    rustplus.log(client.intlGet(null, 'infoCap'), client.intlGet(null, `logInGameMessage`, {
        message: message.broadcast.teamMessage.message.message,
        user: `${message.broadcast.teamMessage.message.name} (${steamId})`
    }));

    TeamChatHandler(rustplus, client, message.broadcast.teamMessage.message);
}

async function messageBroadcastEntityChanged(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const entityId = message.broadcast.entityChanged.entityId;

    if (instance.serverList[rustplus.serverId].switches.hasOwnProperty(entityId)) {
        messageBroadcastEntityChangedSmartSwitch(rustplus, client, message);
    }
    else if (instance.serverList[rustplus.serverId].alarms.hasOwnProperty(entityId)) {
        messageBroadcastEntityChangedSmartAlarm(rustplus, client, message);
    }
    else if (instance.serverList[rustplus.serverId].storageMonitors.hasOwnProperty(entityId)) {
        messageBroadcastEntityChangedStorageMonitor(rustplus, client, message);
    }
}

async function messageBroadcastCameraRays(rustplus, client, message) {
    /* Not implemented */
}

async function messageBroadcastEntityChangedSmartSwitch(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const serverId = rustplus.serverId;
    const entityId = message.broadcast.entityChanged.entityId;
    const server = instance.serverList[serverId];

    if (!server || (server && !server.switches[entityId])) return;

    if (rustplus.interactionSwitches.includes(`${entityId}`)) {
        rustplus.interactionSwitches = rustplus.interactionSwitches.filter(e => e !== `${entityId}`);
        return;
    }

    if (rustplus.currentSwitchTimeouts.hasOwnProperty(entityId)) {
        clearTimeout(rustplus.currentSwitchTimeouts[entityId]);
        delete rustplus.currentSwitchTimeouts[entityId];
    }

    const active = message.broadcast.entityChanged.payload.value;
    server.switches[entityId].active = active;
    client.setInstance(rustplus.guildId, instance);

    DiscordMessages.sendSmartSwitchMessage(rustplus.guildId, serverId, entityId);
    SmartSwitchGroupHandler.updateSwitchGroupIfContainSwitch(
        client, rustplus.guildId, serverId, entityId);
}

async function messageBroadcastEntityChangedSmartAlarm(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const serverId = rustplus.serverId;
    const entityId = message.broadcast.entityChanged.entityId;
    const server = instance.serverList[serverId];

    if (!server || (server && !server.alarms[entityId])) return;

    const active = message.broadcast.entityChanged.payload.value;
    server.alarms[entityId].active = active;
    server.alarms[entityId].reachable = true;
    client.setInstance(rustplus.guildId, instance);

    if (active) {
        server.alarms[entityId].lastTrigger = Math.floor(new Date() / 1000);
        client.setInstance(rustplus.guildId, instance);
        await DiscordMessages.sendSmartAlarmTriggerMessage(rustplus.guildId, serverId, entityId);

        if (instance.generalSettings.smartAlarmNotifyInGame) {
            rustplus.sendInGameMessage(`${server.alarms[entityId].name}: ${server.alarms[entityId].message}`);
        }

        /* Optional AI tactical heads-up (RPP_AI_ALERTS_ENABLED). Fire-and-forget. */
        require('../util/ai/alerts.js').onSmartAlarm(client, rustplus,
            server.alarms[entityId].name, server.alarms[entityId].message);
    }

    DiscordMessages.sendSmartAlarmMessage(rustplus.guildId, rustplus.serverId, entityId);
}

async function messageBroadcastEntityChangedStorageMonitor(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const serverId = rustplus.serverId;
    const entityId = message.broadcast.entityChanged.entityId;
    const server = instance.serverList[serverId];

    if (!server || (server && !server.storageMonitors[entityId])) return;

    if (message.broadcast.entityChanged.payload.value === true) return;

    if (server.storageMonitors[entityId].type === 'toolCupboard' ||
        message.broadcast.entityChanged.payload.capacity === Constants.STORAGE_MONITOR_TOOL_CUPBOARD_CAPACITY) {
        setTimeout(updateToolCupboard.bind(null, rustplus, client, message), 2000);
    }
    else {
        const oldItems = rustplus.storageMonitors[entityId] ? rustplus.storageMonitors[entityId].items : null;
        await notifyIfLooted(rustplus, client, entityId, oldItems, message.broadcast.entityChanged.payload.items);

        rustplus.storageMonitors[entityId] = {
            items: message.broadcast.entityChanged.payload.items,
            expiry: message.broadcast.entityChanged.payload.protectionExpiry,
            capacity: message.broadcast.entityChanged.payload.capacity,
            hasProtection: message.broadcast.entityChanged.payload.hasProtection
        }

        const info = await rustplus.getEntityInfoAsync(entityId);
        server.storageMonitors[entityId].reachable = await rustplus.isResponseValid(info) ? true : false;

        if (server.storageMonitors[entityId].reachable) {
            if (info.entityInfo.payload.capacity === Constants.STORAGE_MONITOR_VENDING_MACHINE_CAPACITY) {
                server.storageMonitors[entityId].type = 'vendingMachine';
            }
            else if (info.entityInfo.payload.capacity === Constants.STORAGE_MONITOR_LARGE_WOOD_BOX_CAPACITY) {
                server.storageMonitors[entityId].type = 'largeWoodBox';
            }
        }
        client.setInstance(rustplus.guildId, instance);

        await DiscordMessages.sendStorageMonitorMessage(rustplus.guildId, serverId, entityId);
    }
}

/* Items leaving a box while the whole team is offline usually means raiders or a thief. Vending machine
   sales take items too, so those are skipped, and a tool cupboard pays its upkeep from its own contents,
   so it only counts when a large share goes at once. */
async function notifyIfLooted(rustplus, client, entityId, oldItems, newItems) {
    const instance = client.getInstance(rustplus.guildId);
    const entity = instance.serverList[rustplus.serverId].storageMonitors[entityId];
    if (!oldItems || !newItems || !rustplus.team.allOffline) return;
    if (entity.lootAlert === false || entity.type === 'vendingMachine') return;

    const totals = (items) => {
        const map = new Map();
        for (const item of items) {
            const key = `${item.itemId}:${item.itemIsBlueprint ? 1 : 0}`;
            map.set(key, (map.get(key) || 0) + item.quantity);
        }
        return map;
    };
    const before = totals(oldItems);
    const after = totals(newItems);

    const removed = [];
    let total = 0;
    let lost = 0;
    for (const [key, quantity] of before) {
        total += quantity;
        const gone = quantity - (after.get(key) || 0);
        if (gone <= 0) continue;
        lost += gone;
        const [itemId, isBlueprint] = key.split(':');
        removed.push({ itemId: itemId, quantity: gone, itemIsBlueprint: isBlueprint === '1' });
    }
    if (removed.length === 0) return;
    if (entity.type === 'toolCupboard' && lost < total / 4) return;

    await DiscordMessages.sendStorageMonitorLootedMessage(rustplus.guildId, rustplus.serverId, entityId, removed);
}

async function updateToolCupboard(rustplus, client, message) {
    const instance = client.getInstance(rustplus.guildId);
    const server = instance.serverList[rustplus.serverId];
    const entityId = message.broadcast.entityChanged.entityId;

    const info = await rustplus.getEntityInfoAsync(entityId);
    server.storageMonitors[entityId].reachable = await rustplus.isResponseValid(info) ? true : false;
    client.setInstance(rustplus.guildId, instance);

    if (server.storageMonitors[entityId].reachable) {
        const oldItems = rustplus.storageMonitors[entityId] ? rustplus.storageMonitors[entityId].items : null;
        await notifyIfLooted(rustplus, client, entityId, oldItems, info.entityInfo.payload.items);

        rustplus.storageMonitors[entityId] = {
            items: info.entityInfo.payload.items,
            expiry: info.entityInfo.payload.protectionExpiry,
            capacity: info.entityInfo.payload.capacity,
            hasProtection: info.entityInfo.payload.hasProtection
        }

        server.storageMonitors[entityId].type = 'toolCupboard';

        if (info.entityInfo.payload.protectionExpiry === 0 && server.storageMonitors[entityId].decaying === false) {
            server.storageMonitors[entityId].decaying = true;

            await DiscordMessages.sendDecayingNotificationMessage(rustplus.guildId, rustplus.serverId, entityId);

            if (server.storageMonitors[entityId].inGame) {
                rustplus.sendInGameMessage(client.intlGet(rustplus.guildId, 'isDecaying', {
                    device: server.storageMonitors[entityId].name
                }));
            }
        }
        else if (info.entityInfo.payload.protectionExpiry !== 0) {
            server.storageMonitors[entityId].decaying = false;
        }
        client.setInstance(rustplus.guildId, instance);
    }

    await DiscordMessages.sendStorageMonitorMessage(rustplus.guildId, rustplus.serverId, entityId);
}