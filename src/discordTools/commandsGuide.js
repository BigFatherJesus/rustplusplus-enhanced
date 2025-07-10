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

    https://github.com/alexemanuelol/rustplusplus

*/

const Discord = require('discord.js');
const DiscordTools = require('./discordTools.js');

module.exports = {
    /**
     * Create and send the commands guide to the commands-guide channel
     * @param {Object} client - The Discord client
     * @param {Object} guild - The Discord guild
     */
    async createCommandsGuide(client, guild) {
        try {
            const instance = client.getInstance(guild.id);
            const channelId = instance.channelId.commandsGuide;
            
            if (!channelId) {
                client.log(client.intlGet(null, 'warningCap'), 'Commands guide channel ID not found, skipping guide creation');
                return;
            }
            
            const channel = DiscordTools.getTextChannelById(guild.id, channelId);
            if (!channel) {
                client.log(client.intlGet(null, 'warningCap'), `Commands guide channel not found: ${channelId}`);
                return;
            }

            // Add a small delay to ensure channel is fully ready
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Clear existing messages
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    await channel.bulkDelete(messages);
                }
            } catch (error) {
                client.log(client.intlGet(null, 'warningCap'), `Could not clear commands guide channel: ${error.message}`);
            }

        // Create Discord Commands embed
        const discordCommandsEmbed = new Discord.EmbedBuilder()
            .setTitle('📱 Discord Slash Commands')
            .setDescription('Use these commands directly in Discord with `/` prefix')
            .setColor('#5865F2')
            .addFields(
                { name: '🔧 **General Commands**', value: '`/help` - Show help information\n`/info` - Display bot information\n`/ping` - Check bot response time', inline: false },
                { name: '🎮 **Game Information**', value: '`/item <name>` - Get item information\n`/craft <item>` - Show crafting recipe\n`/craftchain <item>` - Show complete crafting chain\n`/research <item>` - Show research costs\n`/recycle <item>` - Show recycling yields\n`/upkeep <item>` - Show upkeep costs', inline: false },
                { name: '🏭 **Server Management**', value: '`/server` - Manage server connections\n`/players` - Show online players\n`/pop` - Show server population\n`/time` - Show in-game time\n`/wipe` - Show wipe information', inline: false },
                { name: '🔌 **Smart Devices**', value: '`/switch` - Control smart switches\n`/alarm` - Manage smart alarms\n`/storage` - Monitor storage boxes\n`/camera` - Access CCTV cameras', inline: false },
                { name: '📊 **Tracking & Events**', value: '`/events` - Configure event notifications\n`/tracker` - Track players\n`/cargo` - Show cargo ship status\n`/heli` - Show helicopter status\n`/chinook` - Show chinook status', inline: false },
                { name: '⚙️ **Settings**', value: '`/settings` - Configure bot settings\n`/language` - Change language\n`/timezone` - Set timezone\n`/prefix` - Change command prefix', inline: false }
            )
            .setFooter({ text: 'RustPlusPlus Enhanced • Use /help for detailed command information' })
            .setTimestamp();

        // Create In-Game Commands embed
        const inGameCommandsEmbed = new Discord.EmbedBuilder()
            .setTitle('🎮 In-Game Commands')
            .setDescription('Use these commands in Rust game chat (requires Rust+ connection)')
            .setColor('#CE422B')
            .addFields(
                { name: '🔧 **General Commands**', value: '`!help` - Show available commands\n`!info` - Display server information\n`!ping` - Check connection status\n`!time` - Show current in-game time', inline: false },
                { name: '🎯 **Item Information**', value: '`!item <name>` - Get item details\n`!craft <item>` - Show crafting recipe\n`!craftchain <item>` - Show complete crafting chain\n`!research <item>` - Show research costs\n`!recycle <item>` - Show recycling yields', inline: false },
                { name: '👥 **Player Commands**', value: '`!players` - List online players\n`!pop` - Show server population\n`!team` - Show team information\n`!leader` - Show team leader', inline: false },
                { name: '🔌 **Smart Device Control**', value: '`!switch <name>` - Toggle smart switch\n`!switches` - List all smart switches\n`!alarm <name>` - Check alarm status\n`!alarms` - List all smart alarms', inline: false },
                { name: '📦 **Storage Monitoring**', value: '`!storage <name>` - Check storage box\n`!storages` - List all storage monitors\n`!upkeep` - Show upkeep costs for base', inline: false },
                { name: '🎯 **Events & Tracking**', value: '`!cargo` - Show cargo ship status\n`!heli` - Show patrol helicopter status\n`!chinook` - Show chinook helicopter status\n`!events` - Show recent events', inline: false },
                { name: '🔍 **Map & Locations**', value: '`!map` - Get map information\n`!monuments` - List monuments\n`!location` - Get current location info\n`!marker <name>` - Add map marker', inline: false },
                { name: '💬 **Communication**', value: '`!team <message>` - Send team message\n`!discord <message>` - Send to Discord\n`!say <message>` - Broadcast message', inline: false }
            )
            .setFooter({ text: 'RustPlusPlus Enhanced • Commands must be used in Rust game chat' })
            .setTimestamp();

        // Create Usage Tips embed
        const usageTipsEmbed = new Discord.EmbedBuilder()
            .setTitle('💡 Usage Tips & Features')
            .setDescription('Get the most out of RustPlusPlus Enhanced')
            .setColor('#57F287')
            .addFields(
                { name: '🚀 **Getting Started**', value: '1. Connect your Rust+ account using the companion app\n2. Pair your server in the servers channel\n3. Add smart devices in-game using F1 console\n4. Configure notifications in settings', inline: false },
                { name: '📱 **Smart Device Setup**', value: '• Use F1 console in Rust: `bind f1 consoletoggle`\n• Add switches: `switch.add <name>`\n• Add alarms: `alarm.add <name>`\n• Add storage monitors: `storage.add <name>`', inline: false },
                { name: '🔔 **Event Notifications**', value: '• Get notified about cargo ship, helicopters, and chinooks\n• Track player connections and deaths\n• Monitor base attacks and smart device triggers\n• Configure which events to receive in settings', inline: false },
                { name: '🎯 **Advanced Features**', value: '• **Team Chat Bridge**: Chat between Discord and in-game\n• **Player Tracking**: Track specific players across servers\n• **Battlemetrics Integration**: Advanced player statistics\n• **CCTV Access**: View cameras through Discord', inline: false },
                { name: '⚙️ **Configuration**', value: '• All settings can be configured per-server\n• Language support for multiple languages\n• Timezone settings for accurate time display\n• Customizable command prefixes', inline: false },
                { name: '🔧 **Troubleshooting**', value: '• Ensure Rust+ companion app is connected\n• Check server connection in servers channel\n• Verify smart devices are properly paired\n• Use `!ping` to test connection status', inline: false }
            )
            .setFooter({ text: 'RustPlusPlus Enhanced • For support, contact the server administrators' })
            .setTimestamp();

        // Send the embeds
        try {
            await channel.send({ embeds: [discordCommandsEmbed] });
            await channel.send({ embeds: [inGameCommandsEmbed] });
            await channel.send({ embeds: [usageTipsEmbed] });
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), `Failed to send commands guide: ${error.message}`, 'error');
        }
        
        } catch (error) {
            client.log(client.intlGet(null, 'errorCap'), `Failed to create commands guide: ${error.message}`, 'error');
        }
    }
};