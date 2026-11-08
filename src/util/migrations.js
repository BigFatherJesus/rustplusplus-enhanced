/*
    One-time cleanup after v1.27.0 removed features that stopped working: map events and shops (Rust+
    no longer sends those markers), BattleMetrics (paid API), the voice announcer and custom event
    timers. Runs at startup for every guild and does nothing once the old data is gone.
*/

const DiscordMessages = require('../discordTools/discordMessages.js');
const DiscordTools = require('../discordTools/discordTools.js');

const DEAD_GENERAL_SETTINGS = [
    'voiceGender', 'fcmAlarmNotificationEveryone', 'itemAvailableInVendingMachineNotifyInGame',
    'displayInformationBattlemetricsAllOnlinePlayers', 'battlemetricsServerNameChanges',
    'battlemetricsTrackerNameChanges', 'battlemetricsGlobalNameChanges', 'battlemetricsGlobalLogin',
    'battlemetricsGlobalLogout'
];

module.exports = async (client, guild) => {
    const instance = client.getInstance(guild.id);
    const hasOldData = 'notificationSettings' in instance || 'marketSubscriptionList' in instance ||
        'events' in instance.channelId || 'event' in instance.informationMessageId ||
        'battlemetricsPlayers' in instance.informationMessageId ||
        DEAD_GENERAL_SETTINGS.some(e => e in instance.generalSettings);
    if (!hasOldData) return;

    /* Discord first, while the channel and message ids are still known. */
    if (instance.channelId.events) {
        const channel = DiscordTools.getTextChannelById(guild.id, instance.channelId.events);
        if (channel) {
            try {
                await channel.delete();
            }
            catch (e) {
                client.log(client.intlGet(null, 'warningCap'), `Could not delete the events channel: ${e.message}`);
            }
        }
    }
    for (const key of ['event', 'battlemetricsPlayers']) {
        if (instance.informationMessageId[key]) {
            await DiscordTools.deleteMessageById(guild.id, instance.channelId.information,
                instance.informationMessageId[key]);
        }
    }

    delete instance.notificationSettings;
    delete instance.marketSubscriptionList;
    delete instance.channelId.events;
    delete instance.informationMessageId.event;
    delete instance.informationMessageId.battlemetricsPlayers;
    for (const key of DEAD_GENERAL_SETTINGS) delete instance.generalSettings[key];
    for (const server of Object.values(instance.serverList)) {
        delete server.cargoShipEgressTimeMs;
        delete server.oilRigLockedCrateUnlockTimeMs;
        delete server.battlemetricsId;
        delete server.connect;
    }
    for (const tracker of Object.values(instance.trackers)) {
        delete tracker.battlemetricsId;
        for (const player of tracker.players) delete player.playerId;
    }
    client.setInstance(guild.id, instance);

    /* Replace messages that still carry buttons or text for the removed features. */
    await require('../discordTools/SetupSettingsMenu')(client, guild, true);
    for (const serverId of Object.keys(instance.serverList)) {
        await DiscordMessages.sendServerMessage(guild.id, serverId);
    }
    await require('../discordTools/commandsGuide').createCommandsGuide(client, guild);

    client.log(client.intlGet(null, 'infoCap'), `Removed data and messages of retired features for guild ${guild.id}.`);
};
