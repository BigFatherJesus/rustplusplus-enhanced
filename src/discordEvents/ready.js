/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

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
const Path = require('path');

const AiExport = require('../util/itemData/aiExport.js');
const Config = require('../../config');
const Migrations = require('../util/migrations.js');
const TrackerHandler = require('../handlers/trackerHandler.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        for (const guild of client.guilds.cache) {
            require('../util/CreateInstanceFile')(client, guild[1]);
            require('../util/CreateCredentialsFile')(client, guild[1]);
            client.fcmListenersLite[guild[0]] = new Object();
        }

        client.loadGuildsIntl();
        client.log(client.intlGet(null, 'infoCap'), client.intlGet(null, 'loggedInAs', {
            name: client.user.tag
        }));

        try {
            await client.user.setUsername(Config.discord.username);
        }
        catch (e) {
            client.log(client.intlGet(null, 'warningCap'), client.intlGet(null, 'ignoreSetUsername'));
        }

        try {
            await client.user.setAvatar(Path.join(__dirname, '..', 'resources/images/rustplusplus_logo.png'));
        }
        catch (e) {
            client.log(client.intlGet(null, 'warningCap'), client.intlGet(null, 'ignoreSetAvatar'));
        }

        client.user.setPresence({
            activities: [{ name: '/help', type: Discord.ActivityType.Listening }],
            status: 'online'
        });

        client.uptimeBot = new Date();

        for (let guildArray of client.guilds.cache) {
            const guild = guildArray[1];

            try {
                await guild.members.me.setNickname(Config.discord.username);
            }
            catch (e) {
                client.log(client.intlGet(null, 'warningCap'), client.intlGet(null, 'ignoreSetNickname'));
            }
            await client.syncCredentialsWithUsers(guild);
            await client.setupGuild(guild);
            await Migrations(client, guild);
        }

        /* The AI assistant reads one knowledge file per item from AI/, built from src/staticFiles. */
        const exported = AiExport.exportAiItems();
        client.log(client.intlGet(null, 'infoCap'), `AI knowledge export: ${exported.written} items, ` +
            `${exported.blocks} building blocks, ${exported.errors} errors.`);

        TrackerHandler.handler(client);
        client.trackerIntervalId = setInterval(TrackerHandler.handler, 60000, client);

        client.log(client.intlGet(null, 'infoCap'), 'Creating RustPlus instances from configuration...');
        client.createRustplusInstancesFromConfig();
        
        // Start connection manager (health monitoring + reconnection + watchdog)
        client.log(client.intlGet(null, 'infoCap'), 'Starting connection manager...');
        client.connectionManager.start();

        client.log(client.intlGet(null, 'infoCap'), 'Bot initialization completed successfully');
    },
};