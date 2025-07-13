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
const FirecrawlScraper = require('../util/firecrawlScraper.js');

module.exports = {
    name: 'updatedatabase',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('updatedatabase')
            .setDescription(client.intlGet(guildId, 'commandsUpdateDatabaseDesc') || 'Update the Rust item database')
            .addStringOption(option => option
                .setName('target')
                .setDescription(client.intlGet(guildId, 'commandsUpdateDatabaseTargetDesc') || 'What to update')
                .setRequired(true)
                .addChoices(
                    { name: 'All Items (Full Scrape)', value: 'ALL' },
                    { name: 'New Items Only', value: 'NEW' },
                    { name: 'Specific Item', value: 'ITEM' }
                ))
            .addStringOption(option => option
                .setName('item-name')
                .setDescription(client.intlGet(guildId, 'commandsUpdateDatabaseItemDesc') || 'Name of specific item to update')
                .setRequired(false));
    },

    async execute(client, interaction) {
        const guildId = interaction.guildId;

        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        // Check permissions (admin only)
        if (!interaction.member.permissions.has('Administrator')) {
            const str = client.intlGet(guildId, 'missingPermission') || 'You need Administrator permissions to use this command.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str, null, guildId));
            client.log(client.intlGet(guildId, 'warningCap'), str);
            return;
        }

        if (!await client.validatePermissions(interaction)) return;
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getString('target');
        const itemName = interaction.options.getString('item-name');

        // Validate input
        if (target === 'ITEM' && !itemName) {
            const str = client.intlGet(guildId, 'commandsUpdateDatabaseMissingItem') || 'You must specify an item name when updating a specific item.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str, null, guildId));
            client.log(client.intlGet(guildId, 'warningCap'), str);
            return;
        }

        const scraper = new FirecrawlScraper();
        
        // Check API key configuration
        const status = scraper.getStatus();
        if (!status.apiKeyConfigured) {
            const str = client.intlGet(guildId, 'commandsUpdateDatabaseNoApiKey') || 'Firecrawl API key not configured. Please set the RPP_FIRECRAWL_API_KEY environment variable.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str, null, guildId));
            client.log(client.intlGet(guildId, 'warningCap'), str);
            return;
        }

        // Check rate limiting
        if (status.isRateLimited) {
            const retryTime = Math.ceil((status.rateLimitedUntil - Date.now()) / 60000);
            const str = client.intlGet(guildId, 'commandsUpdateDatabaseRateLimited', { minutes: retryTime }) || 
                       `Database updates are currently rate limited. Please try again in ${retryTime} minutes.`;
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str, null, guildId));
            client.log(client.intlGet(guildId, 'warningCap'), str);
            return;
        }

        // Initial response
        const initialMessage = this.getInitialMessage(client, guildId, target, itemName);
        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, initialMessage, null, guildId));

        try {
            let result;

            switch (target) {
                case 'ALL':
                    result = await scraper.scrapeAllItems();
                    break;
                
                case 'NEW':
                    result = await scraper.scrapeNewItems();
                    break;
                
                case 'ITEM':
                    result = await scraper.scrapeSingleItem(itemName);
                    break;
            }

            // Create result message
            if (result.success) {
                // Reload item data to make new items available immediately
                const reloadSuccess = client.reloadItemData();
                
                let successMessage = this.getSuccessMessage(client, guildId, target, result);
                if (reloadSuccess) {
                    successMessage += '\n\n🔄 Item data reloaded - new items are now available in commands!';
                } else {
                    successMessage += '\n\n⚠️ Database updated but data reload failed - restart the bot to use new items.';
                }
                
                await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, successMessage, null, guildId));
                client.log(client.intlGet(guildId, 'infoCap'), successMessage);
            } else {
                const errorMessage = this.getErrorMessage(client, guildId, result);
                await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, errorMessage, null, guildId));
                client.log(client.intlGet(guildId, 'warningCap'), errorMessage);
            }

        } catch (error) {
            client.log(client.intlGet(guildId, 'errorCap'), `Database update error: ${error.message}`);

            const errorMessage = client.intlGet(guildId, 'commandsUpdateDatabaseError') || 
                                'An unexpected error occurred during the database update.';
            await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, errorMessage, null, guildId));
        }
    },

    getInitialMessage(client, guildId, target, itemName) {
        switch (target) {
            case 'ALL':
                return client.intlGet(guildId, 'commandsUpdateDatabaseStartingAll') || 
                       '🔄 Starting full database update. This may take several minutes...';
            case 'NEW':
                return client.intlGet(guildId, 'commandsUpdateDatabaseStartingNew') || 
                       '🔄 Checking for new items in the database...';
            case 'ITEM':
                return client.intlGet(guildId, 'commandsUpdateDatabaseStartingItem', { item: itemName }) || 
                       `🔄 Updating item "${itemName}"...`;
            default:
                return 'Starting database update...';
        }
    },

    getSuccessMessage(client, guildId, target, result) {
        switch (target) {
            case 'ALL':
                return client.intlGet(guildId, 'commandsUpdateDatabaseSuccessAll', { 
                    total: result.totalItems || result.itemsScraped,
                    errors: result.errors || 0
                }) || `✅ Successfully updated the complete item database with ${result.totalItems || result.itemsScraped} items.${result.errors ? ` (${result.errors} errors)` : ''}`;
                
            case 'NEW':
                if (result.newItems > 0) {
                    return client.intlGet(guildId, 'commandsUpdateDatabaseSuccessNew', { count: result.newItems }) || 
                           `✅ Found and added ${result.newItems} new items to the database.`;
                } else {
                    return client.intlGet(guildId, 'commandsUpdateDatabaseNoNewItems') || 
                           '✅ No new items found. The database is up to date.';
                }
                
            case 'ITEM':
                return client.intlGet(guildId, 'commandsUpdateDatabaseSuccessItem', { 
                    item: result.item.name,
                    id: result.item.identifier || 'N/A'
                }) || `✅ Successfully updated item: **${result.item.name}** (ID: ${result.item.identifier || 'N/A'})`;
                
            default:
                return 'Database update completed successfully.';
        }
    },

    getErrorMessage(client, guildId, result) {
        if (result.reason === 'rate_limited') {
            return client.intlGet(guildId, 'commandsUpdateDatabaseRateLimitedRetry', { minutes: result.retryIn }) || 
                   `⏳ The update was paused due to API rate limits. It will automatically resume in ${result.retryIn} minutes.`;
        } else if (result.reason === 'error') {
            return client.intlGet(guildId, 'commandsUpdateDatabaseFailed') || 
                   '❌ The update failed due to an error. Please check the bot logs for more details.';
        } else {
            return client.intlGet(guildId, 'commandsUpdateDatabaseNotSuccessful') || 
                   '❌ The database update was not successful. Please try again later.';
        }
    }
};