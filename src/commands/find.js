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
const DiscordMessages = require('../discordTools/discordMessages.js');
const CraftingCalculator = require('../util/craftingCalculator.js');

module.exports = {
    name: 'find',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('find')
            .setDescription('Find items in linked storage containers')
            .addStringOption(option => option
                .setName('item')
                .setDescription('The name of the item to find')
                .setRequired(true));
    },

    async execute(client, interaction) {
        const guildId = interaction.guildId;

        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        const itemName = interaction.options.getString('item');

        if (!itemName) {
            const str = 'No item name provided';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        // Get the first connected server
        const instance = client.getInstance(guildId);
        const serverIds = Object.keys(instance.serverList);
        
        if (serverIds.length === 0) {
            const str = 'No servers connected';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        const serverId = serverIds[0]; // Use first server for now
        const rustplus = client.rustplusInstances?.[guildId]?.[serverId];
        
        if (!rustplus) {
            const str = 'Bot not connected to server';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        const searchResults = CraftingCalculator.findItemsInStorage(client, rustplus, guildId, serverId, itemName);

        client.log(client.intlGet(null, 'infoCap'), client.intlGet(null, 'slashCommandValueChange', {
            id: `${verifyId}`,
            value: `${itemName}`
        }));

        await DiscordMessages.sendFindMessage(interaction, searchResults);
    },
};