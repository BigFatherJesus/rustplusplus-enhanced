<p align="center">
<img src="./rustplusplus.png" width="500"></a>
</p>

<p align="center">
<a href="https://discord.gg/vcrKbKVAbc"><img src="https://img.shields.io/badge/Discord-Alexemanuel-%237289DA?style=flat&logo=discord" alt="discord"/></a>
<a href="https://www.reddit.com/user/Alexemanuelol"><img src="https://img.shields.io/badge/Reddit-Alexemanuelol-FF4500?style=flat&logo=reddit" alt="reddit"/></a>
<a href="https://ko-fi.com/alexemanuelol"><img src="https://img.shields.io/badge/Donate%20a%20Coffee-alexemanuelol-yellow?style=flat&logo=buy-me-a-coffee" alt="donate on ko-fi"/></a>

<p align="center">
<a href="https://crowdin.com/project/rustplusplus"><img src="https://badges.crowdin.net/rustplusplus/localized.svg" alt="donate on ko-fi"/></a>
</p>

<p align="center">
    <a href="https://discord.gg/vcrKbKVAbc">
        <img src="./join_discord.png" width="250">
    </a>
</p>

<h1 align="center"><em><b>rustplusplus Enhanced</b> ~ Advanced Rust+ Discord Bot</em></h1>
</p>

**rustplusplus Enhanced** is a comprehensive fork of the original [rustplusplus](https://github.com/alexemanuelol/rustplusplus) by Alexemanuelol, enhanced by me with a little help from Claude, featuring advanced crafting features, storage integration, and optimization tools.

This NodeJS Discord Bot uses the [rustplus.js](https://github.com/liamcottle/rustplus.js) library to utilize the power of the [Rust+ Companion App](https://rust.facepunch.com/companion) with additional Quality-of-Life features and enhanced functionality.

## **Enhanced Features**

### **Original Features**
* Receive notifications for [In-Game Events](docs/discord_text_channels.md#events-channel) (Patrol Helicopter, Cargo Ship, Chinook 47, Oil Rigs triggered)
* Control [Smart Switches](docs/smart_devices.md#smart-switches) or Groups of Smart Switches via Discord or In-Game Team Chat
* Setup [Smart Alarms](docs/smart_devices.md#smart-alarms) to notify in Discord or In-Game Team Chat whenever they are triggered
* Use [Storage Monitors](docs/smart_devices.md#storage-monitors) to keep track of Tool Cupboard Upkeep or Large Wooden Box/Vending Machine content
* Head over to the [Information Text Channel](docs/images/information_channel.png) to see all sorts of information about the server, ongoing events and team member status
* Communicate with teammates from [Discord to In-Game](docs/discord_text_channels.md#teamchat-channel) and vice versa
* Keep track of other teams on the server with the [Player Tracker](docs/discord_text_channels.md#trackers-channel)
* Extensive [QoL Commands](docs/commands.md) that can be used In-Game or from Discord

### **Enhanced Features**
* **Advanced Crafting Analysis** - Comprehensive crafting calculation system with optimization tools
* **Enhanced Storage Integration** - Advanced storage monitoring and management capabilities
* **Automatic Reconnection System** - Robust connection management with health monitoring
* **API Systems** - Extended API integration for better server connectivity
* **Optimization Tools** - Performance enhancements and resource optimization
* **TypeScript Support** - Full TypeScript implementation for better code quality
* **Enhanced Error Handling** - Improved error management and logging systems
* **🆕 Automated Item Database Updates** - Weekly automated scraping of the latest Rust item data from rusthelp.com (no API key needed) with manual controls via `/updatedatabase`
* **🆕 AI Assistant** - Ask game questions in-game (`!ai`) or via `/ai` — answers from live server state + the scraped item/monument database; works with any OpenAI-compatible endpoint (Ollama, GROQ, Gemini)

## **Quick Start**

### **Development Commands**

#### Starting the Bot
```bash
npm start
```

#### Type Checking
```bash
npm test
```
This runs TypeScript compiler with --noEmit flag to check for type errors without generating output.

#### Installation
```bash
npm install
```
Note: Uses npm-force-resolutions for dependency resolution.

#### Updates
```bash
# Windows
update.bat

# Linux/Mac
./update.sh
```

## **Architecture Overview**

### **Core Structure**
- **Entry Point**: `index.ts` - Initializes Discord bot and creates necessary directories
- **Main Bot Class**: `src/structures/DiscordBot.js` - Extends Discord.Client with custom functionality
- **Event Handlers**: `src/discordEvents/` - Discord event handlers (ready, messageCreate, etc.)
- **Command System**: `src/commands/` - Slash commands for Discord interactions
- **Rust+ Integration**: `src/structures/RustPlus.js` - Handles Rust+ API connections
- **Smart Device Management**: `src/handlers/` - Various handlers for smart devices and features

### **Key Components**

#### Discord Integration
- Uses Discord.js v14 with gateway intents for guilds, messages, and voice
- Slash commands system with interaction handlers
- Multi-language support via internationalization
- Voice channel integration for TTS features

#### Rust+ API Integration
- FCM (Firebase Cloud Messaging) listeners for push notifications
- WebSocket connections to Rust+ servers
- Smart device control (switches, alarms, storage monitors)
- Real-time game event monitoring

#### Data Storage
- Instance-based configuration system
- JSON-based settings and templates
- Logging system with Winston
- Credential management for authentication

## **Key Technologies**
- **Runtime**: Node.js with TypeScript
- **Discord**: Discord.js v14
- **Rust+ API**: Custom rustplus.js library
- **Image Processing**: Jimp and GraphicsMagick
- **Authentication**: FCM push notifications
- **Voice**: Discord voice integration with ffmpeg

## **Documentation**

> Documentation can be found [here](https://github.com/alexemanuelol/rustplusplus/blob/master/docs/documentation.md). The documentation explains the features as well as `how to setup the bot`, so make sure to take a look at it 😉

## **Credentials**

> You can get your credentials by running the `rustplusplus credential application`. Download it [here](https://github.com/alexemanuelol/rustplusplus-credential-application/releases/download/v1.4.0/rustplusplus-1.4.0-win-x64.exe)

## **Running via Docker**

```bash
docker run --rm -it -v ${pwd}/credentials:/app/credentials -v ${pwd}/instances:/app/instances -v ${pwd}/logs:/app/logs -e RPP_DISCORD_CLIENT_ID=111....1111 -e RPP_DISCORD_TOKEN=token --name rpp nuallan/rustplusplus-forked
```

or

```bash
docker-compose up -d
```

Make sure you use the correct values for DISCORD_CLIENT_ID as well as DISCORD_TOKEN in the docker command/docker-compose.yml

### **Environment Variables**
- `RPP_DISCORD_CLIENT_ID` - Discord application client ID
- `RPP_DISCORD_TOKEN` - Discord bot token
- `RPP_SCRAPER_CRON` - (Optional) Cron override for the scheduled item scraper (default: `0 5 * * 5`, Friday 05:00)
- `RPP_AI_ENABLED` - (Optional) Enable/disable the AI assistant (default: `true`; set `false` to disable)
- `RPP_AI_BASE_URL` - (Optional) OpenAI-compatible endpoint, e.g. `http://host.docker.internal:11434/v1` for Ollama (default: `http://localhost:11434/v1`)
- `RPP_AI_API_KEY` - (Optional) API key for the AI endpoint (leave empty for Ollama)
- `RPP_AI_MODEL` - (Optional) Model name (default: `llama3.1`)
- `RPP_AI_KNOWLEDGE_DIR` - (Optional) Extra editable AI knowledge folder, e.g. `/app/knowledge` mounted as a volume
- `RPP_AI_MAX_TOKENS` - (Optional) Max answer tokens (default: `1500`)
- `RPP_AI_TEMPERATURE` - (Optional) Sampling temperature (default: `0.3`)
- `RPP_AI_TIMEOUT_MS` - (Optional) AI request timeout in ms (default: `120000`)

See `docker-compose.yml` for a fully commented example and the `ai` block of `config/index.js` for the complete `RPP_AI_*` list (tool calling, device control, memory, alerts).

## **Project Structure**

```
rustplusplus-enhanced/
├── src/
│   ├── commands/       # Discord slash commands
│   ├── discordEvents/  # Discord event handlers
│   ├── handlers/       # Feature-specific handlers
│   ├── structures/     # Core classes (DiscordBot, RustPlus, etc.)
│   ├── util/          # Utility functions and helpers
│   ├── languages/     # Internationalization files
│   ├── resources/     # Static assets (images, fonts)
│   └── staticFiles/   # Game data files (items, recipes, etc.)
├── docs/              # Documentation and setup guides
├── config/            # Configuration files
├── credentials/       # User authentication data (created at runtime)
├── instances/         # Server-specific configurations (created at runtime)
├── logs/             # Application logs (created at runtime)
├── index.ts          # Main entry point
├── package.json      # Dependencies and scripts
└── tsconfig.json     # TypeScript configuration
```

## **Configuration Notes**
- The bot requires Rust+ credentials obtained via the companion app
- Each Discord server requires pairing with a Rust game server
- Smart devices must be paired in-game before Discord control
- The bot maintains persistent connections to monitor real-time events
- Multi-language support requires proper locale configuration

## **New Features: Automated Item Database Updates**

### **RustHelp Data Pipeline**
The bot includes an automated, keyless system for keeping Rust item data up-to-date by scraping [rusthelp.com](https://rusthelp.com) — no API key required:

- **Weekly Automation**: Runs every Friday at 05:00 by default (the morning after Thursday wipes/force wipes); override the schedule with the `RPP_SCRAPER_CRON` environment variable
- **Manual Control**: Use the `/updatedatabase` command for immediate updates (admin only)
- **Polite Scraping**: Built-in rate limiting (stays under rusthelp.com's ~1 req/s limit, backs off on 429s) plus an on-disk HTML cache so unchanged pages are not re-fetched

### **Commands**
The `/updatedatabase` command takes a required `target` option and an optional `item-name`:
- `/updatedatabase target:ALL` - Full database refresh (admin only)
- `/updatedatabase target:NEW` - Check for new items only
- `/updatedatabase target:ITEM item-name:<name>` - Update a specific item

### **Setup**
No setup needed — the scraper is keyless. The bot automatically starts the weekly schedule on startup.

### **Data Output**
- **Bot Format**: Updates existing static files in `src/staticFiles/` (`items.json`, `rustlabsCraftData.json`, etc.) plus the new `rusthelpExtras.json`, `rusthelpBuildingExtras.json`, `rusthelpMonuments.json` and `rusthelpWorldEntities.json`
- **AI Knowledge Export**: Per-item/monument/world-entity JSON files in `AI/items/`, `AI/monuments/` and `AI/world/` (gitignored, regenerated after each scrape) used by the AI assistant

## **Thanks to**

**liamcottle**@GitHub - for the [rustplus.js](https://github.com/liamcottle/rustplus.js) library.
<br>
**.Vegas.#4844**@Discord - for the awesome icons!
<br>
**Alexemanuelol**@GitHub - for the original [rustplusplus](https://github.com/alexemanuelol/rustplusplus) project.