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

module.exports = {
    name: 'error',
    async execute(client, error) {
        const errorMessage = error.message || error.toString();
        const errorStack = error.stack || 'No stack trace';
        
        client.log(client.intlGet(null, 'errorCap'), `Discord Error: ${errorMessage} | Stack: ${errorStack}`, 'error');
        
        // Only exit on truly fatal errors
        if (error.code === 'TOKEN_INVALID' || error.code === 'DISALLOWED_INTENTS') {
            client.log(client.intlGet(null, 'errorCap'), 'Fatal Discord error - exiting', 'error');
            process.exit(1);
        }
        
        // For all other errors, let Discord.js handle reconnection automatically
        client.log(client.intlGet(null, 'warningCap'), 'Discord error occurred, allowing Discord.js to handle reconnection', 'warn');
    },
}
