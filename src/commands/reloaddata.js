/*
    Copyright (C) 2024 Nuallan

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

const Builder = require('@discordjs/builders');

const DiscordEmbeds = require('../discordTools/discordEmbeds.js');

module.exports = {
    name: 'reloaddata',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('reloaddata')
            .setDescription(client.intlGet(guildId, 'commandsReloadDataDesc') || 'Reload item and crafting data from static files');
    },

    async execute(client, interaction) {
        const guildId = interaction.guildId;

        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        // Check permissions (admin only)
        if (!interaction.member.permissions.has('Administrator')) {
            const str = client.intlGet(guildId, 'missingPermission') || 'You need Administrator permissions to use this command.';
            await client.interactionReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str, null, guildId));
            client.log(client.intlGet(guildId, 'warningCap'), str);
            return;
        }

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        try {
            const startMessage = client.intlGet(guildId, 'commandsReloadDataStarting') || '🔄 Reloading item and crafting data...';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, startMessage, null, guildId));

            const reloadSuccess = client.reloadItemData();

            if (reloadSuccess) {
                const successMessage = client.intlGet(guildId, 'commandsReloadDataSuccess') || 
                                     '✅ Successfully reloaded item and crafting data. All commands now use the latest data!';
                await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, successMessage, null, guildId));
                client.log(client.intlGet(guildId, 'infoCap'), successMessage);
            } else {
                const errorMessage = client.intlGet(guildId, 'commandsReloadDataFailed') || 
                                   '❌ Failed to reload item data. Please check the bot logs for more details.';
                await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, errorMessage, null, guildId));
                client.log(client.intlGet(guildId, 'warningCap'), errorMessage);
            }

        } catch (error) {
            client.log(client.intlGet(guildId, 'errorCap'), `Data reload error: ${error.message}`);

            const errorMessage = client.intlGet(guildId, 'commandsReloadDataError') || 
                                'An unexpected error occurred during data reload.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, errorMessage, null, guildId));
        }
    }
};