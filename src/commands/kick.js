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

const DiscordEmbeds = require('../discordTools/discordEmbeds.js');

module.exports = {
    name: 'kick',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('kick')
            .setDescription(client.intlGet(guildId, 'commandsKickDesc'))
            .addStringOption(option => option
                .setName('member')
                .setDescription(client.intlGet(guildId, 'commandsLeaderMemberDesc'))
                .setRequired(true));
    },

    async execute(client, interaction) {
        const instance = client.getInstance(interaction.guildId);
        const rustplus = client.rustplusInstances[interaction.guildId];

        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.options.getString('member');
        client.log(client.intlGet(null, 'infoCap'), client.intlGet(null, 'slashCommandValueChange', {
            id: `${verifyId}`,
            value: `${member}`
        }));

        if (!rustplus || !rustplus.isOperational) {
            const str = client.intlGet(interaction.guildId, 'notConnectedToRustServer');
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            client.log(client.intlGet(null, 'warningCap'), str);
            return;
        }

        const title = instance.serverList[rustplus.serverId].title;
        const reply = async (isError, str) => {
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(isError ? 1 : 0, str, title));
            rustplus.log(client.intlGet(null, isError ? 'warningCap' : 'infoCap'), str);
        };

        /* Only the team leader can kick, so the request has to go out over the leader's own login. */
        const leaderConnection = rustplus.team.leaderSteamId === rustplus.playerId ?
            rustplus : rustplus.leaderRustPlusInstance;
        if (!leaderConnection) {
            const paired = rustplus.team.players
                .filter(e => e.steamId in instance.serverListLite[rustplus.serverId]).map(e => e.name);
            await reply(true, client.intlGet(interaction.guildId, 'kickNeedsPairedLeader', { name: paired.join(', ') }));
            return;
        }

        /* A loose match could kick the wrong person, so a partial name has to fit exactly one member. */
        const search = member.toLowerCase();
        const exact = rustplus.team.players.filter(e => e.name.toLowerCase() === search);
        const matches = exact.length > 0 ? exact :
            rustplus.team.players.filter(e => e.name.toLowerCase().includes(search));
        if (matches.length === 0) {
            await reply(true, client.intlGet(interaction.guildId, 'couldNotIdentifyMember', { name: member }));
            return;
        }
        if (matches.length > 1) {
            await reply(true, client.intlGet(interaction.guildId, 'kickAmbiguousName', {
                name: member,
                names: matches.map(e => e.name).join(', ')
            }));
            return;
        }

        const player = matches[0];
        if (player.steamId === rustplus.team.leaderSteamId) {
            await reply(true, client.intlGet(interaction.guildId, 'kickCannotKickLeader', { name: player.name }));
            return;
        }

        const response = await leaderConnection.kickFromTeamAsync(player.steamId);
        if (!response || !response.success) {
            await reply(true, client.intlGet(interaction.guildId, 'kickFailed', {
                name: player.name,
                error: response && response.error ? response.error : `${response}`
            }));
            return;
        }
        await reply(false, client.intlGet(interaction.guildId, 'kickedFromTeam', { name: player.name }));
    },
};
