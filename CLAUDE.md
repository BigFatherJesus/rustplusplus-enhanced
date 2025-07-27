# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start the Bot
```bash
npm start
```
Uses ts-node to run the TypeScript entry point directly.

### Type Check
```bash
npm test
```
Runs TypeScript compiler with --noEmit flag to check for type errors without generating output files.

### Install Dependencies
```bash
npm install
```
Installs dependencies with npm-force-resolutions for dependency resolution.

### Update Scripts
```bash
# Windows
update.bat

# Linux/Mac
./update.sh
```

## Architecture Overview

### Core Entry Flow
- **Entry Point**: `index.ts` - Creates necessary directories and initializes the DiscordBot instance
- **Main Bot Class**: `src/structures/DiscordBot.js` - Extends Discord.Client with custom rustplus integration
- **Rust+ Integration**: `src/structures/RustPlus.js` - Handles WebSocket connections to Rust+ servers
- **Connection Health**: `src/util/connectionHealthMonitor.js` and `src/util/autoReconnectManager.js` - Manages connection stability

### Key Systems

#### Discord Integration
- Discord.js v14 with gateway intents for guilds, messages, and voice
- Slash command system in `src/commands/` with interaction handlers
- Event handlers in `src/discordEvents/` (ready, messageCreate, interactionCreate, etc.)
- Multi-language support via FormatJS internationalization in `src/languages/`

#### Rust+ API Integration
- FCM listeners (`src/util/FcmListener.js`) for push notifications from Rust+ companion app
- WebSocket connections to game servers for real-time data
- Smart device control (switches, alarms, storage monitors) via `src/handlers/`
- Game event monitoring (helicopter, cargo, etc.) with notification system

#### Data Management
- Instance-based configuration system with JSON files in `instances/` directory
- Credentials stored in `credentials/` directory (created at runtime)
- Static game data in `src/staticFiles/` (items.json, craftData, etc.)
- Winston logging system with logs stored in `logs/` directory

#### Enhanced Features (Fork-specific)
- **Automated Item Database Updates**: Weekly scraping via Firecrawl API (`src/util/firecrawlScraper.js`)
- **Advanced Crafting System**: Comprehensive crafting calculations in `src/util/craftingCalculator.js`
- **Connection Management**: Robust reconnection system with health monitoring
- **TypeScript Support**: Mixed JS/TS codebase with TypeScript entry point

### Important File Locations

#### Configuration
- `config/index.js` - Main configuration file
- `src/templates/` - Default settings templates
- `instances/{guildId}.json` - Per-server configuration (created at runtime)
- `credentials/{guildId}.json` - Authentication data (created at runtime)

#### Core Classes
- `src/structures/DiscordBot.js` - Main bot class with Discord and Rust+ integration
- `src/structures/RustPlus.js` - Rust+ API wrapper with game state management
- `src/structures/Items.js` - Item database management
- `src/structures/RustLabs.js` - Crafting and recipe data management

#### Handler Systems
- `src/handlers/inGameCommandHandler.js` - Processes commands from in-game chat
- `src/handlers/smartSwitchHandler.js` - Manages smart switch device control
- `src/handlers/storageMonitorHandler.js` - Monitors storage containers
- `src/handlers/battlemetricsHandler.js` - Player tracking integration

### Environment Variables
- `RPP_DISCORD_CLIENT_ID` - Discord application client ID (required)
- `RPP_DISCORD_TOKEN` - Discord bot token (required)
- `RPP_FIRECRAWL_API_KEY` - For automated item database updates (optional)

### Development Notes
- The codebase is a mix of JavaScript and TypeScript
- Main entry is TypeScript (`index.ts`) but most logic is in JavaScript files
- Bot requires Rust+ credentials obtained via the companion app
- Each Discord server must be paired with a Rust game server
- Smart devices must be paired in-game before Discord control is available
- The bot maintains persistent WebSocket connections for real-time monitoring

### Testing and Validation
- TypeScript type checking via `npm test`
- No traditional unit tests - validation happens through runtime type checking
- Bot functionality testing requires live Rust server connections

### Docker Support
Available via docker-compose.yml or direct docker run commands with proper environment variables.