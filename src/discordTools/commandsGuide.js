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
                { name: '🔧 **General**', value: '`/help` - Show help information\n`/connection` - Connection status and retries\n`/uptime` - Bot and server uptime\n`/ai` - Ask the AI assistant', inline: false },
                { name: '🎮 **Items**', value: '`/item` - Item information\n`/craft` - Crafting recipe\n`/chaincraft` - Full crafting chain\n`/research` - Research costs\n`/recycle` - Recycling yields\n`/stack` - Stack size\n`/despawn` - Despawn time\n`/decay` - Decay times\n`/upkeep` - Upkeep costs', inline: false },
                { name: '🔌 **Devices & Map**', value: '`/switch` - Smart switches\n`/alarm` - Smart alarms\n`/storagemonitor` - Storage monitors\n`/recycler` - Recycler tracking\n`/find` - Find an item in storage monitors\n`/camera` - View and watch your own cameras and turrets\n`/cctv` - Monument CCTV codes (in game)\n`/map` - Map image with team pins', inline: false },
                { name: '⚙️ **Setup**', value: '`/credentials` - Add or remove Rust+ credentials\n`/role` - Bot role\n`/alias` - Command aliases\n`/blacklist` - Block users\n`/leader` - Promote the team leader\n`/kick` - Kick a team member\n`/reset` - Rebuild channels\n`/reloaddata` - Reload item data', inline: false }
            )
            .setFooter({ text: 'RustPlusPlus Enhanced • Use /help for detailed command information' })
            .setTimestamp();

        // Create In-Game Commands embed
        const inGameCommandsEmbed = new Discord.EmbedBuilder()
            .setTitle('🎮 In-Game Commands')
            .setDescription('Use these commands in Rust team chat (default prefix `!`)')
            .setColor('#CE422B')
            .addFields(
                { name: '🎯 **Items**', value: '`!craft <item>`, `!craftchain <item>`, `!research <item>`, `!recycle <item>`, `!stack <item>`, `!despawn <item>`, `!decay <item>`, `!find <item>`, `!ai <question>`', inline: false },
                { name: '👥 **Team**', value: '`!team`, `!online`, `!offline`, `!afk`, `!alive`, `!death`, `!connections`, `!leader`, `!prox`, `!steamid`, `!send <name> <message>`', inline: false },
                { name: '🗺️ **Server**', value: '`!pop`, `!time`, `!wipe`, `!uptime`, `!upkeep`, `!marker <name>`, `!note <text>`, `!timer <time> <text>`', inline: false },
                { name: '💬 **Chat**', value: '`!tts <text>`, `!tr <language> <text>`, `!mute`, `!unmute`', inline: false }
            )
            .setFooter({ text: 'RustPlusPlus Enhanced • Commands must be used in Rust team chat' })
            .setTimestamp();

        // Create Usage Tips embed
        const usageTipsEmbed = new Discord.EmbedBuilder()
            .setTitle('💡 Usage Tips & Features')
            .setDescription('Get the most out of RustPlusPlus Enhanced')
            .setColor('#57F287')
            .addFields(
                { name: '🚀 **Getting Started**', value: '1. Run `/credentials add` with the command from the credentials site\n2. In game: ESC, Rust+, Pair with server\n3. Pair smart devices in game: look at the device, hold E and choose Pair\n4. Change settings in the settings channel', inline: false },
                { name: '🎯 **Features**', value: '• **Team chat bridge** between Discord and in game\n• **Trackers**: follow players on any server (trackers channel)\n• **Smart devices**: switches, alarms and storage monitors from Discord\n• **Base watch**: camera snapshots and spotted players in the cameras channel; while the team is offline, alerts for strangers on camera and items taken from storage monitors', inline: false },
                { name: '🔧 **Troubleshooting**', value: '• Rust+ logins expire after about 14 days; the bot posts in the activity channel when it needs a new one\n• Servers paired before November 2026 must be paired again in game\n• Use `/connection` to see the connection status', inline: false }
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