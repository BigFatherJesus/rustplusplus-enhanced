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
const RecyclerHandler = require('../handlers/recyclerHandler.js');

module.exports = {
    name: 'recycler',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('recycler')
            .setDescription('Manage recycler displays for storage monitors')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Create a new recycler display')
                    .addStringOption(option =>
                        option.setName('name')
                            .setDescription('Name for the recycler display')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('link')
                    .setDescription('Link a storage monitor to a recycler display')
                    .addStringOption(option =>
                        option.setName('recycler-id')
                            .setDescription('ID of the recycler display')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('storage-id')
                            .setDescription('ID of the storage monitor to link')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('unlink')
                    .setDescription('Unlink a storage monitor from a recycler display')
                    .addStringOption(option =>
                        option.setName('recycler-id')
                            .setDescription('ID of the recycler display')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('storage-id')
                            .setDescription('ID of the storage monitor to unlink')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('delete')
                    .setDescription('Delete a recycler display')
                    .addStringOption(option =>
                        option.setName('recycler-id')
                            .setDescription('ID of the recycler display to delete')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all recycler displays'));
    },

    async execute(client, interaction) {
        const guildId = interaction.guildId;
        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        const instance = client.getInstance(guildId);
        if (!instance.serverList || Object.keys(instance.serverList).length === 0) {
            const str = 'No servers configured. Please connect to a server first.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        const activeServer = instance.activeServer;
        if (!activeServer) {
            const str = 'No active server. Please connect to a server first.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'create':
                    await handleCreate(client, interaction, guildId, activeServer);
                    break;
                case 'link':
                    await handleLink(client, interaction, guildId, activeServer);
                    break;
                case 'unlink':
                    await handleUnlink(client, interaction, guildId, activeServer);
                    break;
                case 'delete':
                    await handleDelete(client, interaction, guildId, activeServer);
                    break;
                case 'list':
                    await handleList(client, interaction, guildId, activeServer);
                    break;
                default:
                    await client.interactionEditReply(interaction, 
                        DiscordEmbeds.getActionInfoEmbed(1, 'Unknown subcommand'));
            }
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), 
                `Recycler command error: ${error.message}`, 'error');
            await client.interactionEditReply(interaction, 
                DiscordEmbeds.getActionInfoEmbed(1, `Error: ${error.message}`));
        }

        client.log(client.intlGet(null, 'infoCap'), `Recycler command executed: ${subcommand}`);
    },
};

async function handleCreate(client, interaction, guildId, serverId) {
    const name = interaction.options.getString('name');
    
    try {
        const recyclerId = await RecyclerHandler.createRecycler(client, guildId, serverId, name);
        const str = `Recycler display "${name}" created with ID: ${recyclerId}. Use /recycler link to connect storage monitors.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, str));
    } catch (error) {
        const str = `Failed to create recycler display: ${error.message}`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
    }
}

async function handleLink(client, interaction, guildId, serverId) {
    const recyclerId = interaction.options.getString('recycler-id');
    const storageId = interaction.options.getString('storage-id');
    
    const instance = client.getInstance(guildId);
    
    if (!instance.serverList[serverId].recyclers || 
        !instance.serverList[serverId].recyclers[recyclerId]) {
        const str = `Recycler display with ID ${recyclerId} not found.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
        return;
    }
    
    if (!instance.serverList[serverId].storageMonitors || 
        !instance.serverList[serverId].storageMonitors[storageId]) {
        const str = `Storage monitor with ID ${storageId} not found.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
        return;
    }
    
    const recycler = instance.serverList[serverId].recyclers[recyclerId];
    if (!recycler.linkedStorages.includes(storageId)) {
        recycler.linkedStorages.push(storageId);
        client.setInstance(guildId, instance);
        
        const str = `Storage monitor "${instance.serverList[serverId].storageMonitors[storageId].name}" linked to recycler "${recycler.name}".`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, str));
        
        // Update the recycler display
        const DiscordMessages = require('../discordTools/discordMessages.js');
        await DiscordMessages.sendRecyclerMessage(guildId, serverId, recyclerId);
    } else {
        const str = `Storage monitor is already linked to this recycler.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
    }
}

async function handleUnlink(client, interaction, guildId, serverId) {
    const recyclerId = interaction.options.getString('recycler-id');
    const storageId = interaction.options.getString('storage-id');
    
    const instance = client.getInstance(guildId);
    
    if (!instance.serverList[serverId].recyclers || 
        !instance.serverList[serverId].recyclers[recyclerId]) {
        const str = `Recycler display with ID ${recyclerId} not found.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
        return;
    }
    
    const recycler = instance.serverList[serverId].recyclers[recyclerId];
    const index = recycler.linkedStorages.indexOf(storageId);
    
    if (index > -1) {
        recycler.linkedStorages.splice(index, 1);
        client.setInstance(guildId, instance);
        
        const storageName = instance.serverList[serverId].storageMonitors[storageId]?.name || storageId;
        const str = `Storage monitor "${storageName}" unlinked from recycler "${recycler.name}".`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, str));
        
        // Update the recycler display
        const DiscordMessages = require('../discordTools/discordMessages.js');
        await DiscordMessages.sendRecyclerMessage(guildId, serverId, recyclerId);
    } else {
        const str = `Storage monitor is not linked to this recycler.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
    }
}

async function handleDelete(client, interaction, guildId, serverId) {
    const recyclerId = interaction.options.getString('recycler-id');
    
    const instance = client.getInstance(guildId);
    
    if (!instance.serverList[serverId].recyclers || 
        !instance.serverList[serverId].recyclers[recyclerId]) {
        const str = `Recycler display with ID ${recyclerId} not found.`;
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
        return;
    }
    
    const recyclerName = instance.serverList[serverId].recyclers[recyclerId].name;
    delete instance.serverList[serverId].recyclers[recyclerId];
    client.setInstance(guildId, instance);
    
    const str = `Recycler display "${recyclerName}" (ID: ${recyclerId}) deleted successfully.`;
    await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, str));
}

async function handleList(client, interaction, guildId, serverId) {
    const instance = client.getInstance(guildId);
    
    if (!instance.serverList[serverId].recyclers || 
        Object.keys(instance.serverList[serverId].recyclers).length === 0) {
        const str = 'No recycler displays found. Use /recycler create to create one.';
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
        return;
    }
    
    let listStr = '';
    for (const [recyclerId, recycler] of Object.entries(instance.serverList[serverId].recyclers)) {
        const linkedCount = recycler.linkedStorages.length;
        listStr += `**${recycler.name}** (ID: ${recyclerId})\n`;
        listStr += `└ Linked storage monitors: ${linkedCount}\n\n`;
    }
    
    const embed = DiscordEmbeds.getEmbed({
        title: '♻️ Recycler Displays',
        description: listStr.trim(),
        color: 0x00FF00,
        timestamp: true
    });
    
    await client.interactionEditReply(interaction, { embeds: [embed] });
}