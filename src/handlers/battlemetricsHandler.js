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

const Constants = require('../util/constants.js');
const DiscordMessages = require('../discordTools/discordMessages.js');
const DiscordTools = require('../discordTools/discordTools.js');

module.exports = {
    handler: async function (client, firstTime = false) {
        if (!firstTime) await client.updateBattlemetricsInstances();

        for (const guildItem of client.guilds.cache) {
            const guildId = guildItem[0];
            const instance = client.getInstance(guildId);
            const rustplus = client.rustplusInstances[guildId];

            if (!firstTime) await module.exports.handleBattlemetricsChanges(client, guildId);

            /* Update information channel battlemetrics players */
            const bmId = instance.activeServer !== null ?
                instance.serverList[instance.activeServer].battlemetricsId : null;
            let condition = instance.generalSettings.displayInformationBattlemetricsAllOnlinePlayers;
            condition &= instance.activeServer !== null;
            condition &= bmId !== null;
            condition &= client.battlemetricsInstances.hasOwnProperty(bmId);
            condition &= rustplus && rustplus.isOperational;

            if (condition) {
                await DiscordMessages.sendUpdateBattlemetricsOnlinePlayersInformationMessage(rustplus, bmId);
            }
            else {
                if (instance.informationMessageId.battlemetricsPlayers !== null) {
                    await DiscordTools.deleteMessageById(guildId, instance.channelId.information,
                        instance.informationMessageId.battlemetricsPlayers);

                    instance.informationMessageId.battlemetricsPlayers = null;
                    client.setInstance(guildId, instance);
                }
            }
        }
    },

    handleBattlemetricsChanges: async function (client, guildId) {
        const instance = client.getInstance(guildId);
        const settings = instance.generalSettings;

        const activeServer = instance.activeServer;
        const server = instance.serverList[activeServer];
        const battlemetricsIdActiveServer = server ? server.battlemetricsId : null;

        const battlemetricsIds = [];
        if (battlemetricsIdActiveServer && client.battlemetricsInstances.hasOwnProperty(battlemetricsIdActiveServer) &&
            client.battlemetricsInstances[battlemetricsIdActiveServer].lastUpdateSuccessful) {
            battlemetricsIds.push(battlemetricsIdActiveServer);
        }

        /* Go through each battlemetrics instance and notify changes */
        for (const battlemetricsId of battlemetricsIds) {
            const bmInstance = client.battlemetricsInstances[battlemetricsId];

            /* Server name changed? */
            if (settings.battlemetricsServerNameChanges && bmInstance.serverEvaluation.hasOwnProperty('server_name')) {
                const oldName = bmInstance.serverEvaluation['server_name'].from;
                const newName = bmInstance.serverEvaluation['server_name'].to;

                const title = client.intlGet(guildId, 'battlemetricsServerNameChanged');
                const description = `__**${client.intlGet(guildId, 'old')}:**__ ${oldName}\n` +
                    `__**${client.intlGet(guildId, 'new')}:**__ ${newName}`;

                await DiscordMessages.sendBattlemetricsEventMessage(guildId, battlemetricsId, title, description);
            }

            /* Players whos name have changed */
            if (settings.battlemetricsGlobalNameChanges && bmInstance.nameChangedPlayers.length !== 0) {
                const title = client.intlGet(guildId, 'battlemetricsPlayersNameChanged');

                const oldNameFieldName = client.intlGet(guildId, 'old');
                const playerIdFieldName = client.intlGet(guildId, 'playerId');
                const newNameFieldName = client.intlGet(guildId, 'new');

                let totalCharacters = 50; /* Start of with 50 characters as a base. */

                let oldName = [''], playerId = [''], newName = [''];
                let oldNameCharacters = 0, playerIdCharacters = 0, newNameCharacters = 0;
                let fieldIndex = 0;
                let isEmbedFull = false;
                let playerCounter = 0;
                for (const player of bmInstance.nameChangedPlayers) {
                    playerCounter += 1;
                    const fieldRowMaxLength = Constants.EMBED_FIELD_MAX_WIDTH_LENGTH_3;

                    let oldN = `${player.from}`;
                    oldN = oldN.length <= fieldRowMaxLength ? oldN : oldN.substring(0, fieldRowMaxLength - 2) + '..';
                    oldN += '\n';

                    const id = `[${player.id}](${Constants.BATTLEMETRICS_PROFILE_URL + `${player.id}`})\n`;

                    let newN = `${player.to}`;
                    newN = newN.length <= fieldRowMaxLength ? newN : newN.substring(0, fieldRowMaxLength - 2) + '..';
                    newN += '\n';



                    if (totalCharacters + (oldN.length + id.length + newN.length) >=
                        Constants.EMBED_MAX_TOTAL_CHARACTERS) {
                        isEmbedFull = true;
                        break;
                    }

                    if ((oldNameCharacters + oldN.length) > Constants.EMBED_MAX_FIELD_VALUE_CHARACTERS ||
                        (playerIdCharacters + id.length) > Constants.EMBED_MAX_FIELD_VALUE_CHARACTERS ||
                        (newNameCharacters + newN.length) > Constants.EMBED_MAX_FIELD_VALUE_CHARACTERS) {
                        fieldIndex += 1;

                        oldName.push('');
                        playerId.push('');
                        newName.push('');

                        oldNameCharacters = 0;
                        playerIdCharacters = 0;
                        newNameCharacters = 0;
                    }

                    oldNameCharacters += oldN.length;
                    playerIdCharacters += id.length;
                    newNameCharacters += newN.length;

                    totalCharacters += oldN.length + id.length + newN.length;

                    oldName[fieldIndex] += oldN;
                    playerId[fieldIndex] += id;
                    newName[fieldIndex] += newN;
                }

                let description = '';
                if (isEmbedFull) {
                    description = client.intlGet(interaction.guildId, 'andMorePlayers', {
                        number: bmInstance.nameChangedPlayers.length - playerCounter
                    });
                }

                const fields = [];
                for (let i = 0; i < (fieldIndex + 1); i++) {
                    fields.push({
                        name: i === 0 ? oldNameFieldName : '\u200B',
                        value: oldName[i] !== '' ? oldName[i] : client.intlGet(guildId, 'empty'),
                        inline: true
                    });
                    fields.push({
                        name: i === 0 ? playerIdFieldName : '\u200B',
                        value: playerId[i] !== '' ? playerId[i] : client.intlGet(guildId, 'empty'),
                        inline: true
                    });
                    fields.push({
                        name: i === 0 ? newNameFieldName : '\u200B',
                        value: newName[i] !== '' ? newName[i] : client.intlGet(guildId, 'empty'),
                        inline: true
                    });
                }

                await DiscordMessages.sendBattlemetricsEventMessage(guildId, battlemetricsId, title,
                    description, fields);
            }

            /* Players that just logged in */
            if (settings.battlemetricsGlobalLogin &&
                (bmInstance.loginPlayers.length !== 0 || bmInstance.newPlayers.length !== 0)) {
                const playerIds = Array.from(new Set(bmInstance.loginPlayers.concat(bmInstance.newPlayers)));
                const title = client.intlGet(guildId, 'battlemetricsPlayersLogin');

                let totalCharacters = 50; /* Start of with 50 characters as a base. */
                let fieldCharacters = 0;

                const fields = [''];
                let fieldIndex = 0;
                let isEmbedFull = false;
                let playerCounter = 0;
                for (const playerId of playerIds) {
                    playerCounter += 1;
                    const name = bmInstance.players[playerId]['name'].replace('[', '(').replace(']', ')');
                    const playerStr = `[${name}](${Constants.BATTLEMETRICS_PROFILE_URL + `${playerId}`})\n`;

                    if (totalCharacters + playerStr.length >= Constants.EMBED_MAX_TOTAL_CHARACTERS) {
                        isEmbedFull = true;
                        break;
                    }

                    if (fieldCharacters + playerStr.length >= Constants.EMBED_MAX_FIELD_VALUE_CHARACTERS) {
                        fieldCharacters = 0;
                        fieldIndex += 1;
                        fields.push('');
                    }

                    fields[fieldIndex] += playerStr;
                    totalCharacters += playerStr.length;
                    fieldCharacters += playerStr.length;
                }

                let description = '';
                if (isEmbedFull) {
                    description = client.intlGet(interaction.guildId, 'andMorePlayers', {
                        number: playerIds.length - playerCounter
                    });
                }

                let fieldCounter = 0;
                const outPutFields = [];
                for (const field of fields) {
                    outPutFields.push({
                        name: '\u200B',
                        value: field === '' ? '\u200B' : field,
                        inline: true
                    });
                    fieldCounter += 1;
                }

                await DiscordMessages.sendBattlemetricsEventMessage(guildId, battlemetricsId, title,
                    description, outPutFields);
            }

            /* Players that just logged out */
            if (settings.battlemetricsGlobalLogout && bmInstance.logoutPlayers.length !== 0) {
                const title = client.intlGet(guildId, 'battlemetricsPlayersLogout');

                let totalCharacters = 50; /* Start of with 50 characters as a base. */
                let fieldCharacters = 0;

                const fields = [''];
                let fieldIndex = 0;
                let isEmbedFull = false;
                let playerCounter = 0;
                for (const playerId of bmInstance.logoutPlayers) {
                    playerCounter += 1;
                    const name = bmInstance.players[playerId]['name'].replace('[', '(').replace(']', ')');
                    const playerStr = `[${name}](${Constants.BATTLEMETRICS_PROFILE_URL + `${playerId}`})\n`;

                    if (totalCharacters + playerStr.length >= Constants.EMBED_MAX_TOTAL_CHARACTERS) {
                        isEmbedFull = true;
                        break;
                    }

                    if (fieldCharacters + playerStr.length >= Constants.EMBED_MAX_FIELD_VALUE_CHARACTERS) {
                        fieldCharacters = 0;
                        fieldIndex += 1;
                        fields.push('');
                    }

                    fields[fieldIndex] += playerStr;
                    totalCharacters += playerStr.length;
                    fieldCharacters += playerStr.length;
                }

                let description = '';
                if (isEmbedFull) {
                    description = client.intlGet(interaction.guildId, 'andMorePlayers', {
                        number: playerIds.length - playerCounter
                    });
                }

                let fieldCounter = 0;
                const outPutFields = [];
                for (const field of fields) {
                    outPutFields.push({
                        name: '\u200B',
                        value: field === '' ? '\u200B' : field,
                        inline: true
                    });
                    fieldCounter += 1;
                }

                await DiscordMessages.sendBattlemetricsEventMessage(guildId, battlemetricsId, title,
                    description, outPutFields);
            }
        }
    },
}