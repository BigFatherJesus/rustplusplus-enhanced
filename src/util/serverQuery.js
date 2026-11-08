/*
    Steam server query (A2S) for Rust servers.

    Rust servers answer the public Steam query that server browsers use, including
    A2S_PLAYER with the names of everyone online. Trackers use it instead of the
    BattleMetrics API, which needs a paid subscription since 2026-07-19.
*/

const Axios = require('axios');
const Dgram = require('node:dgram');
const Dns = require('node:dns/promises');
const Net = require('node:net');

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const NO_CHALLENGE = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const RUST_APP_ID = 252490;
const TIMEOUT_MS = 5000;

function request(host, port, buildPayload) {
    return new Promise((resolve, reject) => {
        const socket = Dgram.createSocket('udp4');
        const parts = new Map();
        let done = false;
        const timer = setTimeout(() => finish(new Error(`No answer from ${host}:${port}`)), TIMEOUT_MS);

        function finish(error, response) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            socket.close();
            if (error) reject(error);
            else resolve(response);
        }

        function handle(response) {
            if (response[0] === 0x41) { /* 'A': server wants the request again with this challenge */
                socket.send(Buffer.concat([HEADER, buildPayload(response.subarray(1, 5))]), port, host);
                return;
            }
            finish(null, response);
        }

        socket.on('error', finish);
        socket.on('message', (message) => {
            if (message.length < 5) return;
            if (message.readInt32LE(0) === -1) {
                handle(message.subarray(4));
                return;
            }
            if (message.readInt32LE(0) !== -2 || message.length < 12) return;

            /* Split response (a full Rust server's player list): id, total, number, size, payload. */
            const total = message[8];
            parts.set(message[9], message.subarray(12));
            if (parts.size < total) return;

            const joined = Buffer.concat(Array.from({ length: total }, (_, i) => parts.get(i) ?? Buffer.alloc(0)));
            parts.clear();
            handle(joined.subarray(4));
        });

        socket.send(Buffer.concat([HEADER, buildPayload(null)]), port, host);
    });
}

function readString(buffer, offset) {
    const end = buffer.indexOf(0, offset);
    if (end === -1) throw new Error('Malformed server query reply');
    return [buffer.toString('utf8', offset, end), end + 1];
}

module.exports = {
    info: async function (host, port) {
        const response = await request(host, port, (challenge) =>
            Buffer.concat([Buffer.from('TSource Engine Query\0'), challenge ?? Buffer.alloc(0)]));
        if (response[0] !== 0x49) throw new Error('Unexpected server info reply');

        let [name, offset] = readString(response, 2);
        for (let i = 0; i < 3; i++) [, offset] = readString(response, offset); /* map, folder, game */
        offset += 2; /* app id */

        return { name: name, players: response[offset], maxPlayers: response[offset + 1] };
    },

    /* Names of everyone online. The count byte overflows above 255 players, so read to the end. */
    players: async function (host, port) {
        const response = await request(host, port, (challenge) =>
            Buffer.concat([Buffer.from('U'), challenge ?? NO_CHALLENGE]));
        if (response[0] !== 0x44) throw new Error('Unexpected player list reply');

        const names = [];
        let offset = 2;
        while (offset < response.length) {
            let name;
            [name, offset] = readString(response, offset + 1); /* skip the index byte */
            offset += 8; /* score and duration */
            names.push(name);
        }
        return names;
    },

    /* Query address of the Rust server with exactly this name, from Steam's server list, or null.
       Relay-paired servers never tell the bot their IP, so this is the only automatic way to get it. */
    findByName: async function (name, apiKey) {
        const response = await Axios.get('https://api.steampowered.com/IGameServersService/GetServerList/v1/', {
            params: { key: apiKey, filter: `\\appid\\${RUST_APP_ID}\\name_match\\${name}`, limit: 50 },
            timeout: TIMEOUT_MS
        });
        const server = (response.data.response.servers ?? []).find(e => e.name === name);
        if (!server) return null;

        const [host, port] = server.addr.split(':');
        return { host: host, port: parseInt(port), name: server.name };
    },

    /* Turn "ip:port" or "host:port" (the game port players connect to, or the query port) into the
       server's query address, or null if nothing answers. Steam's public server list maps game ports
       to query ports. */
    resolveAddress: async function (input) {
        const match = input.trim().replace(/^connect\s+/i, '').match(/^([^\s:]+):(\d+)$/);
        if (!match) return null;

        const port = parseInt(match[2]);
        let ip = match[1];
        if (!Net.isIP(ip)) {
            try {
                ip = (await Dns.lookup(ip, { family: 4 })).address;
            }
            catch (e) {
                return null;
            }
        }

        const candidates = [];
        try {
            const response = await Axios.get('https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/',
                { params: { addr: ip }, timeout: TIMEOUT_MS });
            const servers = (response.data.response.servers ?? []).filter(e => e.appid === RUST_APP_ID);
            const exact = servers.find(e => e.gameport === port || e.addr.endsWith(`:${port}`));
            if (exact) candidates.push(parseInt(exact.addr.split(':')[1]));
            else if (servers.length === 1) candidates.push(parseInt(servers[0].addr.split(':')[1]));
        }
        catch (e) {
            /* Steam's list is only a shortcut; the given port is still tried below. */
        }
        if (!candidates.includes(port)) candidates.push(port);

        for (const queryPort of candidates) {
            try {
                const serverInfo = await module.exports.info(ip, queryPort);
                return { host: ip, port: queryPort, name: serverInfo.name };
            }
            catch (e) {
                /* Not this port; try the next candidate. */
            }
        }
        return null;
    },
};
