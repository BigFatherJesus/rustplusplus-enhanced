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

/* Rust+ error codes for a camera, with what the official Rust+ app tells the player. */
const CAMERA_ERRORS = {
    player_online: 'cameraErrorPlayerOnline',
    access_denied: 'cameraErrorAccessDenied',
    not_found: 'cameraErrorNotFound',
    no_player: 'cameraErrorNoPlayer'
};

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
                .addStringOption(idOption))
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
                const look = await CameraHandler.look(rustplus, cameraId);
                if (look.error) {
                    await reply(true, client.intlGet(interaction.guildId, CAMERA_ERRORS[look.error] || 'cameraError', {
                        camera: cameraId,
                        error: look.error
                    }));
                    return;
                }

                const frame = await CameraHandler.render(look);
                const players = CameraHandler.playersInView(look)
                    .map(e => `\`${e === null ? client.intlGet(interaction.guildId, 'unknown') : e}\``);
                await client.interactionEditReply(interaction, {
                    embeds: [DiscordEmbeds.getEmbed({
                        title: cameraId,
                        color: Constants.COLOR_DEFAULT,
                        description: players.length > 0 ? client.intlGet(interaction.guildId, 'cameraPlayersInView', {
                            players: players.join(', ')
                        }) : client.intlGet(interaction.guildId, 'cameraNoPlayersInView'),
                        ...(frame !== null ? { image: 'attachment://camera.png' } : {}),
                        footer: { text: server.title }
                    })],
                    files: frame !== null ? [new Discord.AttachmentBuilder(frame, { name: 'camera.png' })] : [],
                    ephemeral: true
                });
            } break;

            case 'watch': {
                /* Check the camera answers before it goes on the list, so a typo isn't watched forever. */
                const look = await CameraHandler.look(rustplus, cameraId);
                if (look.error && look.error !== 'player_online') {
                    await reply(true, client.intlGet(interaction.guildId, CAMERA_ERRORS[look.error] || 'cameraError', {
                        camera: cameraId,
                        error: look.error
                    }));
                    return;
                }

                if (!server.cameraWatch.includes(cameraId)) server.cameraWatch.push(cameraId);
                client.setInstance(interaction.guildId, instance);
                await reply(false, client.intlGet(interaction.guildId, 'cameraWatchAdded', { camera: cameraId }));
            } break;

            case 'unwatch': {
                server.cameraWatch = server.cameraWatch.filter(e => e !== cameraId);
                client.setInstance(interaction.guildId, instance);
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
