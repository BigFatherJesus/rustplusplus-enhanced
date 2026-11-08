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

const Builder = require('@discordjs/builders');
const Discord = require('discord.js');

const CameraHandler = require('../handlers/cameraHandler.js');
const Constants = require('../util/constants.js');
const DiscordEmbeds = require('../discordTools/discordEmbeds.js');
const DiscordMessages = require('../discordTools/discordMessages.js');
const DiscordTools = require('../discordTools/discordTools.js');

module.exports = {
    name: 'camera',

    getData(client, guildId) {
        const idOption = option => option
            .setName('id')
            .setDescription(client.intlGet(guildId, 'commandsCameraIdDesc'))
            .setRequired(true);

        return new Builder.SlashCommandBuilder()
            .setName('camera')
            .setDescription(client.intlGet(guildId, 'commandsCameraDesc'))
            .addSubcommand(subcommand => subcommand
                .setName('view')
                .setDescription(client.intlGet(guildId, 'commandsCameraViewDesc'))
                .addStringOption(option => option
                    .setName('id')
                    .setDescription(client.intlGet(guildId, 'commandsCameraViewIdDesc'))
                    .setRequired(false)))
            .addSubcommand(subcommand => subcommand
                .setName('watch')
                .setDescription(client.intlGet(guildId, 'commandsCameraWatchDesc'))
                .addStringOption(idOption))
            .addSubcommand(subcommand => subcommand
                .setName('unwatch')
                .setDescription(client.intlGet(guildId, 'commandsCameraUnwatchDesc'))
                .addStringOption(idOption))
            .addSubcommand(subcommand => subcommand
                .setName('list')
                .setDescription(client.intlGet(guildId, 'commandsCameraListDesc')));
    },

    async execute(client, interaction) {
        const instance = client.getInstance(interaction.guildId);
        const rustplus = client.rustplusInstances[interaction.guildId];

        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const cameraId = (interaction.options.getString('id') || '').trim();
        client.log(client.intlGet(null, 'infoCap'), client.intlGet(null, 'slashCommandValueChange', {
            id: `${verifyId}`,
            value: `${subcommand} ${cameraId}`
        }));

        if (!rustplus || !rustplus.isOperational) {
            const str = client.intlGet(interaction.guildId, 'notConnectedToRustServer');
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            client.log(client.intlGet(null, 'warningCap'), str);
            return;
        }

        const server = instance.serverList[rustplus.serverId];
        const reply = async (isError, str) => {
            await client.interactionEditReply(interaction,
                DiscordEmbeds.getActionInfoEmbed(isError ? 1 : 0, str, server.title));
        };

        switch (subcommand) {
            case 'view': {
                const cameraIds = cameraId !== '' ? [cameraId] : server.cameraWatch;
                if (cameraIds.length === 0) {
                    await reply(true, client.intlGet(interaction.guildId, 'cameraViewNoCameras'));
                    return;
                }

                const views = [];
                for (const id of cameraIds) {
                    const look = await CameraHandler.look(rustplus, id);
                    if (look.error) {
                        const str = client.intlGet(interaction.guildId, Constants.CAMERA_ERRORS[look.error] || 'cameraError', {
                            camera: id,
                            error: look.error
                        });
                        /* These are about the paired player, not the camera: every other camera answers the same. */
                        if (cameraIds.length === 1 || ['player_online', 'no_player'].includes(look.error)) {
                            await reply(true, str);
                            return;
                        }
                        views.push({
                            embed: DiscordEmbeds.getEmbed({
                                title: id,
                                color: Constants.COLOR_INACTIVE,
                                description: str,
                                footer: { text: server.title }
                            }),
                            file: null
                        });
                        continue;
                    }

                    const snapshot = await CameraHandler.snapshot(look);
                    const fileName = `camera${views.length}.png`;
                    views.push({
                        embed: DiscordEmbeds.getCameraEmbed(interaction.guildId, rustplus.serverId, id, snapshot,
                            fileName),
                        file: snapshot.frame !== null ? new Discord.AttachmentBuilder(snapshot.frame, { name: fileName }) : null
                    });
                }

                /* Discord allows 10 embeds per message. */
                for (let i = 0; i < views.length; i += 10) {
                    const chunk = views.slice(i, i + 10);
                    const content = {
                        embeds: chunk.map(e => e.embed),
                        files: chunk.filter(e => e.file !== null).map(e => e.file),
                        ephemeral: true
                    };
                    if (i === 0) await client.interactionEditReply(interaction, content);
                    else await interaction.followUp(content);
                }
            } break;

            case 'watch': {
                /* Check the camera answers before it goes on the list, so a typo isn't watched forever. */
                const look = await CameraHandler.look(rustplus, cameraId);
                if (look.error && look.error !== 'player_online') {
                    await reply(true, client.intlGet(interaction.guildId, Constants.CAMERA_ERRORS[look.error] || 'cameraError', {
                        camera: cameraId,
                        error: look.error
                    }));
                    return;
                }

                const isNew = !server.cameraWatch.includes(cameraId);
                if (isNew) server.cameraWatch.push(cameraId);
                client.setInstance(interaction.guildId, instance);

                /* A camera that answered shows its snapshot right away; one that can't be seen yet gets a placeholder. */
                if (!look.error || isNew) {
                    const snapshot = look.error ? null : await CameraHandler.snapshot(look);
                    if (await DiscordMessages.sendCameraMessage(interaction.guildId, rustplus.serverId, cameraId, snapshot)) {
                        await DiscordMessages.sendCameraSpottedMessage(interaction.guildId, rustplus.serverId, true);
                    }
                }
                await reply(false, client.intlGet(interaction.guildId, 'cameraWatchAdded', { camera: cameraId }));
            } break;

            case 'unwatch': {
                server.cameraWatch = server.cameraWatch.filter(e => e !== cameraId);
                if (instance.cameraMessageId.cameras[cameraId]) {
                    await DiscordTools.deleteMessageById(interaction.guildId, instance.channelId.cameras,
                        instance.cameraMessageId.cameras[cameraId]);
                    delete instance.cameraMessageId.cameras[cameraId];
                }
                client.setInstance(interaction.guildId, instance);
                await DiscordMessages.sendCameraSpottedMessage(interaction.guildId, rustplus.serverId);
                await reply(false, client.intlGet(interaction.guildId, 'cameraWatchRemoved', { camera: cameraId }));
            } break;

            case 'list': {
                await reply(false, server.cameraWatch.length > 0 ?
                    client.intlGet(interaction.guildId, 'cameraWatchList', {
                        cameras: server.cameraWatch.map(e => `\`${e}\``).join(', ')
                    }) : client.intlGet(interaction.guildId, 'cameraWatchListEmpty'));
            } break;

            default: {
            } break;
        }
    },
};
