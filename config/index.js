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
    general: {
        language: process.env.RPP_LANGUAGE || 'en',
        pollingIntervalMs: process.env.RPP_POLLING_INTERVAL || 10000,
        showCallStackError: process.env.RPP_LOG_CALL_STACK || false,
        reconnectIntervalMs: process.env.RPP_RECONNECT_INTERVAL || 15000,
        maxReconnectDelay: process.env.RPP_MAX_RECONNECT_DELAY || 300000,
        maxReconnectRetries: process.env.RPP_MAX_RECONNECT_RETRIES || 10,
        reconnectBackoffMultiplier: process.env.RPP_RECONNECT_BACKOFF_MULTIPLIER || 2,
        resetRetriesAfterSuccess: process.env.RPP_RESET_RETRIES_AFTER_SUCCESS || 60000,
        connectionHealthCheckInterval: process.env.RPP_CONNECTION_HEALTH_CHECK_INTERVAL || 30000,
        reconnectExhaustedCooldown: parseInt(process.env.RPP_RECONNECT_EXHAUSTED_COOLDOWN) || 300000,
    },
    discord: {
        username: process.env.RPP_DISCORD_USERNAME || 'rustplusplus',
        clientId: process.env.RPP_DISCORD_CLIENT_ID || '',
        token: process.env.RPP_DISCORD_TOKEN || '',
        needAdminPrivileges: process.env.RPP_NEED_ADMIN_PRIVILEGES !== 'false', /* If true, only admins can delete (server, switch..), manage credentials and reset a channel */
    },
    ai: {
        /* Any OpenAI-compatible chat completions endpoint works:
           Ollama:     http://localhost:11434/v1
           OpenAI:     https://api.openai.com/v1
           OpenRouter: https://openrouter.ai/api/v1
           Gemini:     https://generativelanguage.googleapis.com/v1beta/openai
           Anthropic:  https://api.anthropic.com/v1 */
        enabled: process.env.RPP_AI_ENABLED !== 'false',
        baseUrl: process.env.RPP_AI_BASE_URL || 'http://localhost:11434/v1',
        apiKey: process.env.RPP_AI_API_KEY || '',
        model: process.env.RPP_AI_MODEL || 'llama3.1',
        maxTokens: parseInt(process.env.RPP_AI_MAX_TOKENS || '1500', 10),
        temperature: parseFloat(process.env.RPP_AI_TEMPERATURE || '0.3'),
        requestTimeoutMs: parseInt(process.env.RPP_AI_TIMEOUT_MS || '120000', 10),

        /* Tool calling: lets the model query live server data (team, server info,
           time, devices) and search the AI/ knowledge folder. Requires a
           model that supports OpenAI tool calling (llama3.1, qwen2.5, ...). */
        toolsEnabled: process.env.RPP_AI_TOOLS_ENABLED !== 'false',
        maxToolIterations: parseInt(process.env.RPP_AI_MAX_TOOL_ITERATIONS || '8', 10),
        /* Control tools (toggle smart switches) — destructive, so OPT-IN: set
           RPP_AI_CONTROL_ENABLED=true to allow the AI to physically toggle devices.
           In-game callers are team members; Discord control is additionally
           restricted to admins. */
        controlEnabled: process.env.RPP_AI_CONTROL_ENABLED === 'true',

        /* Optional extra knowledge folder searched in addition to the baked-in AI/
           folder. Mount a host dir here to edit slang/kit/strategy docs without
           rebuilding the image. Files with the same name override the baked-in copy. */
        knowledgeDir: process.env.RPP_AI_KNOWLEDGE_DIR || '',

        /* Short-term conversation memory (follow-up questions). */
        memoryTurns: parseInt(process.env.RPP_AI_MEMORY_TURNS || '6', 10),
        memoryTtlMs: parseInt(process.env.RPP_AI_MEMORY_TTL_MS || '600000', 10),

        /* Proactive AI commentary on notable events (raid alarms, etc.).
           Default off — frequent events would cost tokens / spam. */
        alertsEnabled: process.env.RPP_AI_ALERTS_ENABLED === 'true',
    },
    steam: {
        /* Free Steam Web API key (steamcommunity.com/dev/apikey). Optional: lets trackers find their
           server's address by name; without it the address is entered with EDIT. */
        apiKey: process.env.RPP_STEAM_API_KEY || ''
    }
};
