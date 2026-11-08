/*
    AI assistant orchestrator.

    askAi() runs an agentic loop: the model can call tools (live server data,
    item/knowledge lookups, device control) before answering. Used by the
    in-game !ai command and the /ai Discord slash command.
*/

const Config = require('../../../config');
const AiClient = require('./client.js');
const Knowledge = require('./knowledge.js');
const Tools = require('./tools.js');
const Memory = require('./memory.js');

/* Shared behaviour rules baked into every system prompt. */
const RULES =
    'You are a Rust (the survival game) expert assistant. Use the tools to look up ' +
    'live server data, item/raid data and knowledge before answering. ' +
    'CRITICAL: report the EXACT numbers from tool results — never round, estimate, ' +
    'average, or invent quantities. If a tool says 4 satchels, say 4, not "2-3". ' +
    'Be as concise as possible: shortest sentences, plain language, no filler, ' +
    'no preamble. State the answer directly. ' +
    'destroyOptions has three groups: "explosives" (sulfur raiding, sorted cheapest ' +
    'first), "gunsAndAmmo" (bullet/shell methods — quantities are for the listed ' +
    'weapon, the most efficient one), and "meleeAndTools" (eco options, no sulfur). ' +
    'The "fastest" method is the lowest timeSeconds; "cheapest" is the lowest ' +
    'sulfurCost. Side matters: quantityHardSide = the strong side (raiding from ' +
    'outside — DEFAULT to this), quantitySoftSide = the weak smooth side. Always say ' +
    'which side your number is for. If a method is not listed, say the data does not ' +
    'include it — do NOT claim the method cannot destroy the target. ' +
    'Rust+ no longer reports vending machines or world events (cargo, heli, oil rig), ' +
    'so say you cannot see shops or events instead of guessing. ' +
    'Players use slang and abbreviations (e.g. "AK" = Assault Rifle, "bolty" = Bolt ' +
    'Action Rifle, "full metal kit" = a gear loadout). If get_item does not find a ' +
    'name, DO NOT give up: search_knowledge for "slang" or "kits" to translate the ' +
    'term, and/or call search_items to find the real name, then retry get_item with ' +
    'the corrected name. A "kit" or "set" is multiple items: first read its component ' +
    'list from search_knowledge (the slang/kits doc), then call get_item for EACH ' +
    'component to get real costs, and sum them multiplied by the requested quantity. ' +
    'NEVER state a craft cost, recipe, or quantity from your own memory or "standard ' +
    'recipes" — every number MUST come from a get_item result. If you have not called ' +
    'get_item for an item yet, call it; do not guess. Keep trying alternative names a ' +
    'few times before concluding something cannot be found. ' +
    'When costing a kit or multiple items, do NOT print a long per-item breakdown — ' +
    'add the components up and report the TOTAL resources needed (and the per-kit total ' +
    'if useful). Keep the final answer compact. ' +
    'For monument questions (puzzles, keycards, fuses, what spawns where) and loot ' +
    'questions (what is in a crate, what does an animal drop), use search_knowledge. ' +
    'For time questions use get_time and quote its preformatted values: inGameTime is ' +
    'the in-game clock (HH:MM), realTimeUntilNightfall/Daylight is the REAL-WORLD wait.';

const IN_GAME_SYSTEM_PROMPT = RULES +
    ' Output plain text only (no markdown, no bullet lists, no semicolons). Use plain ASCII ' +
    'punctuation. For lists use the form "F7 - 1500 Sulfur Ore, M13 - 35 HQ Metal". Keep it ' +
    'to one or two short sentences, or for lists at most ~10 entries.';

const DISCORD_SYSTEM_PROMPT = RULES +
    ' Compact Discord markdown allowed. Keep it under ~120 words.';

module.exports = {
    /**
     * Ask the AI assistant a question.
     * @param {Object} client - Discord client
     * @param {string} question - The user's question
     * @param {Object} [options] - { source, guildId, callerSteamId, callerDiscordId, canControl }
     * @returns {Promise<{success: boolean, answer: string}>}
     */
    askAi: async function (client, question, options = {}) {
        const source = options.source ?? 'discord';

        if (!AiClient.isEnabled()) {
            return { success: false, answer: 'AI assistant is disabled (RPP_AI_ENABLED=false).' };
        }

        const trimmedQuestion = (question ?? '').trim();
        if (trimmedQuestion === '') {
            return { success: false, answer: 'Ask a question, e.g: cheapest way to raid a stone wall?' };
        }

        const systemPrompt = source === 'ingame' ? IN_GAME_SYSTEM_PROMPT : DISCORD_SYSTEM_PROMPT;

        const ctx = {
            client,
            guildId: options.guildId ?? null,
            caller: {
                steamId: options.callerSteamId ?? null,
                discordId: options.callerDiscordId ?? null,
                canControl: options.canControl === true
            }
        };

        const useTools = Config.ai.toolsEnabled && ctx.guildId !== null;

        const messages = [{ role: 'system', content: systemPrompt }];

        /* Inject short-term conversation history for follow-up questions. */
        const now = Date.now();
        const convId = options.conversationId ?? null;
        for (const turn of Memory.getHistory(convId, now)) {
            messages.push({ role: turn.role, content: turn.content });
        }

        /* Static context as a fallback hint (also helps models with weak tool use).
           Tools provide the authoritative live data. */
        if (!useTools) {
            let staticContext = '';
            try { staticContext = Knowledge.buildContext(client, trimmedQuestion); }
            catch (error) { /* non-fatal */ }
            messages.push({
                role: 'user',
                content: staticContext !== ''
                    ? `CONTEXT:\n${staticContext}\n\nQUESTION: ${trimmedQuestion}`
                    : `QUESTION: ${trimmedQuestion}`
            });
        }
        else {
            messages.push({ role: 'user', content: trimmedQuestion });
        }

        try {
            const answer = useTools
                ? await runToolLoop(client, ctx, messages)
                : await AiClient.chatCompletion(messages);
            Memory.append(convId, trimmedQuestion, answer, now);
            return { success: true, answer: answer };
        }
        catch (error) {
            const status = error.response ? error.response.status : null;
            const body = error.response?.data ? JSON.stringify(error.response.data).slice(0, 500) : '';
            client.log(client.intlGet(null, 'errorCap'), `AI request failed (${status}): ${error.message} ${body}`, 'error');
            let answer = 'AI request failed — check that the configured endpoint is reachable.';
            if (status === 429) answer = 'AI is rate limited right now — try again in a moment.';
            else if (status && status >= 500) answer = 'AI service is busy/overloaded — try again in a moment.';
            return { success: false, answer: answer };
        }
    }
};

/**
 * Run the tool-calling loop until the model produces a final answer or the
 * iteration cap is hit.
 * @returns {Promise<string>} Final answer text
 */
async function runToolLoop(client, ctx, messages) {
    const toolDefs = Tools.getDefinitions();

    for (let iteration = 0; iteration < Config.ai.maxToolIterations; iteration++) {
        const { message } = await AiClient.createChatCompletion(messages, { tools: toolDefs });

        const toolCalls = message.tool_calls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            /* Final answer. */
            return (message.content || '').trim() || 'No answer produced.';
        }

        /* Record the assistant's tool-call turn (sanitized — strip provider-specific
           fields like gpt-oss "reasoning" that cause 400 when echoed back). */
        messages.push({
            role: 'assistant',
            content: message.content ?? '',
            tool_calls: message.tool_calls
        });

        for (const call of toolCalls) {
            const name = call.function?.name;
            let args = {};
            let argsValid = true;
            try {
                const raw = call.function?.arguments;
                args = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            }
            catch (error) {
                argsValid = false;
                client.log(client.intlGet(null, 'warningCap'),
                    `AI tool call ${name}: malformed arguments JSON: ${String(call.function?.arguments).slice(0, 200)}`);
            }

            const result = argsValid
                ? await Tools.execute(name, args, ctx)
                : 'Invalid tool arguments (malformed JSON). Re-issue the call with valid JSON.';
            client.log(client.intlGet(null, 'infoCap'), `AI tool call: ${name}(${JSON.stringify(args)})`);

            messages.push({
                role: 'tool',
                tool_call_id: call.id || name,
                content: typeof result === 'string' ? result : JSON.stringify(result)
            });
        }
    }

    /* Iteration cap hit — ask once more. Tools MUST still be passed: the message
       history now contains tool-role messages, and most providers 400 if you send
       tool messages without a tools definition. */
    const { message } = await AiClient.createChatCompletion(messages, { tools: toolDefs });
    return (message.content || '').trim() || 'Could not complete the request — try a simpler question.';
}
