/*
    Proactive AI commentary on notable in-game events (e.g. raid/smart alarms).

    Opt-in via RPP_AI_ALERTS_ENABLED. When an event fires, the AI is given the
    event plus access to live tools (team status, etc.) and posts a short
    tactical heads-up in team chat. Best-effort and fully guarded — never throws
    into the event pipeline.
*/

const Config = require('../../../config');
const Ai = require('./index.js');

/* A raid fires the alarm every few seconds for minutes, with pauses of a few minutes between waves.
   Only the first trigger after this much quiet gets an AI alert, so one raid gets one alert. */
const RAID_QUIET_MS = 10 * 60 * 1000;
const lastTriggerByGuild = new Map();

module.exports = {
    /**
     * Generate and post an AI tactical note for a triggered smart/raid alarm.
     * @param {Object} client - Discord client
     * @param {Object} rustplus - The operational RustPlus instance
     * @param {string} alarmName
     * @param {string} alarmMessage
     */
    onSmartAlarm: async function (client, rustplus, alarmName, alarmMessage) {
        if (!Config.ai.alertsEnabled) return;
        if (!rustplus || rustplus.isDeleted || !rustplus.isOperational) return;

        const now = Date.now();
        const lastTrigger = lastTriggerByGuild.get(rustplus.guildId);
        lastTriggerByGuild.set(rustplus.guildId, now);
        if (lastTrigger !== undefined && now - lastTrigger < RAID_QUIET_MS) return;

        /* Asked for "tactical" advice, the model invented strategy-game moves ("place bandits on high
           ground"). It cannot see the fight, so it only reports what get_team says. */
        const question =
            `A smart alarm just triggered. Alarm name: "${alarmName}". ` +
            `Alarm message: "${alarmMessage}". This usually means the base is being raided. ` +
            `Call get_team, then say in one short sentence which teammates are online (alive or dead, ` +
            `and their grid) and who is offline. Report only those facts. Give no advice or tactics: ` +
            `you cannot see the fight.`;

        try {
            const result = await Ai.askAi(client, question, {
                source: 'ingame',
                guildId: rustplus.guildId,
                canControl: false,
                conversationId: null /* don't pollute user conversation memory */
            });
            if (result.success && result.answer && !rustplus.isDeleted && rustplus.isOperational) {
                rustplus.sendInGameMessage(`AI: ${result.answer}`);
            }
        }
        catch (error) {
            client.log(client.intlGet(null, 'warningCap'), `AI alarm alert failed: ${error.message}`);
        }
    }
};
