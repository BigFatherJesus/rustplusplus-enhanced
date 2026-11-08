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

const Axios = require('axios');

const Constants = require('../util/constants.js');

module.exports = {
    /* Steam's XML profile (?xml=1) carries the name and avatar in fixed tags, unlike the HTML page,
       whose layout changes. Returns the XML text, or null with an error logged. */
    scrapeSteamProfileXml: async function (client, steamId) {
        const url = `${Constants.STEAM_PROFILES_URL}${steamId}?xml=1`;
        try {
            /* Steam answers axios's default headers with 429 Too Many Requests; browser-like ones pass. */
            const response = await Axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'text/xml' },
                timeout: 15000
            });
            return typeof response.data === 'string' ? response.data : null;
        }
        catch (e) {
            client.log(client.intlGet(null, 'errorCap'), `Steam profile request failed: ${url} (${e.message})`, 'error');
            return null;
        }
    },

    scrapeSteamProfilePicture: async function (client, steamId) {
        const xml = await module.exports.scrapeSteamProfileXml(client, steamId);
        const match = xml ? xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/) : null;
        if (!match) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfilePicture', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        return match[1];
    },

    scrapeSteamProfileName: async function (client, steamId) {
        const xml = await module.exports.scrapeSteamProfileXml(client, steamId);
        const match = xml ? xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/s) : null;
        if (!match) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfileName', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        return match[1];
    },
}
