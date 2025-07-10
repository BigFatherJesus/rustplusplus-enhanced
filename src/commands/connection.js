/*
	Copyright (C) 2023 Alexander Emanuelsson (alexemanuelol)

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
	name: 'connection',

	getData(client, guildId) {
		return new Builder.SlashCommandBuilder()
			.setName('connection')
			.setDescription(client.intlGet(guildId, 'commandsConnectionDesc'))
			.addSubcommand(subcommand => subcommand
				.setName('status')
				.setDescription(client.intlGet(guildId, 'commandsConnectionStatusDesc')))
			.addSubcommand(subcommand => subcommand
				.setName('retry')
				.setDescription(client.intlGet(guildId, 'commandsConnectionRetryDesc')))
			.addSubcommand(subcommand => subcommand
				.setName('health')
				.setDescription(client.intlGet(guildId, 'commandsConnectionHealthDesc')));
	},

	async execute(client, interaction) {
		const guildId = interaction.guildId;
		const subcommand = interaction.options.getSubcommand();

		const verifyId = Math.floor(100000 + Math.random() * 900000);
		client.logInteraction(interaction, verifyId, 'slashCommand');

		if (!await client.validatePermissions(interaction)) return;
		await interaction.deferReply({ ephemeral: true });

		switch (subcommand) {
			case 'status':
				await this.handleStatusCommand(client, interaction, guildId);
				break;
			case 'retry':
				await this.handleRetryCommand(client, interaction, guildId);
				break;
			case 'health':
				await this.handleHealthCommand(client, interaction, guildId);
				break;
		}
	},

	async handleStatusCommand(client, interaction, guildId) {
		const instance = client.getInstance(guildId);
		const reconnectionStatus = client.reconnectionManager.getReconnectionStatus(guildId);
		const rustplus = client.rustplusInstances[guildId];

		let description = '';
		let color = 0x00ff00; // Green for healthy

		if (client.activeRustplusInstances[guildId] && rustplus && rustplus.isOperational) {
			description += `✅ **${client.intlGet(guildId, 'connectionStatusConnected')}**\n`;
			description += `🏠 **${client.intlGet(guildId, 'server')}:** ${rustplus.server}:${rustplus.port}\n`;
			description += `⏰ **${client.intlGet(guildId, 'uptime')}:** ${this.formatUptime(rustplus.uptimeServer)}\n`;
			
			if (reconnectionStatus.retryCount > 0) {
				description += `🔄 **${client.intlGet(guildId, 'reconnectionAttempts')}:** ${reconnectionStatus.retryCount}\n`;
			}
		} else if (client.rustplusReconnecting[guildId]) {
			description += `🔄 **${client.intlGet(guildId, 'connectionStatusReconnecting')}**\n`;
			description += `🔢 **${client.intlGet(guildId, 'attemptCount')}:** ${reconnectionStatus.retryCount}/${reconnectionStatus.maxRetries}\n`;
			
			if (reconnectionStatus.currentDelay) {
				description += `⏱️ **${client.intlGet(guildId, 'nextAttemptIn')}:** ${Math.floor(reconnectionStatus.currentDelay / 1000)}s\n`;
			}
			
			if (reconnectionStatus.reconnectionReason) {
				description += `❓ **${client.intlGet(guildId, 'reason')}:** ${reconnectionStatus.reconnectionReason}\n`;
			}
			
			color = 0xffff00; // Yellow for reconnecting
		} else {
			description += `❌ **${client.intlGet(guildId, 'connectionStatusDisconnected')}**\n`;
			
			if (reconnectionStatus.retryCount >= reconnectionStatus.maxRetries) {
				description += `🚫 **${client.intlGet(guildId, 'maxRetriesReached')}**\n`;
			}
			
			color = 0xff0000; // Red for disconnected
		}

		const embed = DiscordEmbeds.getEmbed({
			title: client.intlGet(guildId, 'connectionStatus'),
			description: description,
			color: color,
			timestamp: true
		});

		await client.interactionEditReply(interaction, { embeds: [embed] });
	},

	async handleRetryCommand(client, interaction, guildId) {
		const instance = client.getInstance(guildId);
		
		if (!instance.activeServer) {
			const embed = DiscordEmbeds.getActionInfoEmbed(1, client.intlGet(guildId, 'noActiveServer'));
			await client.interactionEditReply(interaction, embed);
			return;
		}

		// Reset reconnection state and attempt connection
		client.reconnectionManager.resetState(guildId);
		client.rustplusReconnecting[guildId] = false;

		const server = instance.activeServer;
		client.reconnectionManager.attemptReconnection(guildId, 'manual_retry', {
			server: server.serverIp,
			port: server.appPort,
			playerId: server.playerId,
			playerToken: server.playerToken
		});

		const embed = DiscordEmbeds.getActionInfoEmbed(0, client.intlGet(guildId, 'reconnectionAttemptStarted'));
		await client.interactionEditReply(interaction, embed);
	},

	async handleHealthCommand(client, interaction, guildId) {
		const healthStats = client.connectionHealthMonitor.getHealthCheckStats();
		const lastCheck = healthStats.lastHealthChecks[guildId];
		const consecutiveFailures = healthStats.consecutiveFailures[guildId] || 0;

		let description = '';
		description += `🔍 **${client.intlGet(guildId, 'healthMonitoringStatus')}:** ${healthStats.activeMonitoring ? 'Active' : 'Inactive'}\n`;
		description += `⏱️ **${client.intlGet(guildId, 'checkInterval')}:** ${Math.floor(healthStats.checkInterval / 1000)}s\n`;
		description += `🚨 **${client.intlGet(guildId, 'maxFailures')}:** ${healthStats.maxConsecutiveFailures}\n`;
		description += `⏰ **${client.intlGet(guildId, 'timeout')}:** ${Math.floor(healthStats.healthCheckTimeout / 1000)}s\n`;
		
		if (lastCheck) {
			const timeSinceLastCheck = Date.now() - lastCheck;
			description += `📊 **${client.intlGet(guildId, 'lastHealthCheck')}:** ${Math.floor(timeSinceLastCheck / 1000)}s ago\n`;
		}
		
		if (consecutiveFailures > 0) {
			description += `⚠️ **${client.intlGet(guildId, 'consecutiveFailures')}:** ${consecutiveFailures}\n`;
		}

		const embed = DiscordEmbeds.getEmbed({
			title: client.intlGet(guildId, 'connectionHealthStatus'),
			description: description,
			color: consecutiveFailures > 0 ? 0xffff00 : 0x00ff00,
			timestamp: true
		});

		await client.interactionEditReply(interaction, { embeds: [embed] });
	},

	formatUptime(startTime) {
		const now = new Date();
		const uptime = now - startTime;
		const seconds = Math.floor(uptime / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days}d ${hours % 24}h ${minutes % 60}m`;
		} else if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else {
			return `${minutes}m ${seconds % 60}s`;
		}
	}
};