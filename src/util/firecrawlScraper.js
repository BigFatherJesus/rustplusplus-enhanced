/*
    Copyright (C) 2024 Nuallan

    Enhanced Firecrawl Item Database Scraper
    - Uses firecrawl API to scrape rustclash.com for accurate Rust item data
    - Replaces static files with fresh data including crafting recipes, recycling yields, research costs
    - Supports rate limiting, error handling, and resume functionality
    - Weekly scheduler for new items, manual updates via Discord commands
*/

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

class FirecrawlScraper {
    constructor() {
        // Configuration from environment variables
        this.apiKey = process.env.FIRECRAWL_API_KEY || process.env.RPP_FIRECRAWL_API_KEY;
        this.baseUrl = 'https://api.firecrawl.dev/v1/scrape';
        this.rustclashBaseUrl = 'https://wiki.rustclash.com';
        this.itemListUrl = 'https://wiki.rustclash.com/group=itemlist';
        
        // Rate limiting configuration
        this.minDelay = parseInt(process.env.RPP_SCRAPER_MIN_DELAY) || 7000; // 7 seconds
        this.maxDelay = parseInt(process.env.RPP_SCRAPER_MAX_DELAY) || 10000; // 10 seconds
        this.maxRetries = parseInt(process.env.RPP_SCRAPER_MAX_RETRIES) || 3;
        this.rateLimitRetryDelay = parseInt(process.env.RPP_SCRAPER_RATE_LIMIT_DELAY) || 3600000; // 1 hour
        
        // File paths
        this.staticFilesPath = path.join(__dirname, '../staticFiles');
        this.humanReadablePath = path.join(__dirname, '../humanReadableItems');
        this.progressFile = path.join(__dirname, 'scraper-progress.json');
        this.logFile = path.join(__dirname, 'scraper.log');
        
        // Material ID mapping for bot compatibility
        this.materialIdMap = {
            'wood': '-151838493',
            'stone': '-1298527', 'stones': '-1298527',
            'metal fragments': '69511070', 'metal fragment': '69511070', 'metal': '69511070',
            'high quality metal': '317398316',
            'cloth': '36123821', 'leather': '69239131', 'rope': '199825479',
            'metal spring': '1605650710', 'rifle body': '1588492232', 'scrap': '-932201673',
            'gunpowder': '-265292885', 'gun powder': '-265292885',
            'low grade fuel': '28178745', 'charcoal': '-1938052175',
            'coal': '-2118132208', 'sulfur': '-1581843485', 'crude oil': '498591726',
            'animal fat': '-1018587433', 'pipe': '1655650080', 'metal pipe': '1655650080',
            'gears': '60391246', 'gear': '60391246', 'steel pipe': '1655650080',
            'tarp': '1159736249', 'sheet metal': '1159736249',
            'bone fragments': '-2059362492', 'targeting computer': '1523195708',
            'cctv camera': '634478325', 'medical syringe': '-1211166256',
            'syringe': '-1211166256', 'tech trash': '1819281075',
            'smg body': '1588977225', 'semi body': '1588492225', 'pistol body': '1588492226'
        };
        
        this.workbenchIds = { 1: "1524187186", 2: "-103865038", 3: "-2139699379" };
    }
    
    // ===== LOGGING AND PROGRESS =====
    
    log(level, message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logMessage);
        
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            // Ignore log file errors
        }
    }
    
    saveProgress(progress) {
        try {
            fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
        } catch (error) {
            this.log('error', `Failed to save progress: ${error.message}`);
        }
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(this.progressFile)) {
                return JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
            }
        } catch (error) {
            this.log('error', `Failed to load progress: ${error.message}`);
        }
        
        return {
            lastRun: null,
            completedItems: [],
            failedItems: [],
            rateLimitedUntil: null,
            creditsExhausted: false,
            lastItemListCheck: null
        };
    }
    
    // ===== API CALLS WITH ERROR HANDLING =====
    
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async makeFirecrawlRequest(config, retryCount = 0) {
        if (!this.apiKey) {
            throw new Error('FIRECRAWL_API_KEY not configured. Set RPP_FIRECRAWL_API_KEY environment variable.');
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };
        
        try {
            this.log('info', `Making firecrawl request to ${config.url}`);
            const response = await axios.post(this.baseUrl, config, { headers });
            
            if (response.status === 200 && response.data.success) {
                return response.data.data;
            } else {
                throw new Error(`API request failed: ${response.data.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                
                // Rate limit (429) or quota exceeded (402)
                if (status === 429 || status === 402) {
                    this.log('warn', `Rate limited or credits exhausted (${status}). Will retry later.`);
                    
                    const progress = this.loadProgress();
                    progress.rateLimitedUntil = Date.now() + this.rateLimitRetryDelay;
                    if (status === 402) {
                        progress.creditsExhausted = true;
                    }
                    this.saveProgress(progress);
                    
                    throw new Error(`RATE_LIMITED:${status}`);
                }
                
                // Temporary server error (5xx) - retry
                if (status >= 500 && retryCount < this.maxRetries) {
                    this.log('warn', `Server error ${status}, retrying (${retryCount + 1}/${this.maxRetries})`);
                    await this.sleep(this.minDelay * (retryCount + 1));
                    return this.makeFirecrawlRequest(config, retryCount + 1);
                }
                
                throw new Error(`API error ${status}: ${errorData.error || error.message}`);
            }
            
            // Network error - retry
            if (retryCount < this.maxRetries) {
                this.log('warn', `Network error, retrying (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
                await this.sleep(this.minDelay * (retryCount + 1));
                return this.makeFirecrawlRequest(config, retryCount + 1);
            }
            
            throw error;
        }
    }
    
    // ===== ITEM DISCOVERY =====
    
    async getItemListFromRustclash() {
        const config = {
            url: this.itemListUrl,
            formats: ['markdown', 'html', 'links']
        };
        
        const data = await this.makeFirecrawlRequest(config);
        const items = [];
        
        // Extract items from links
        if (data.links) {
            for (const link of data.links) {
                if (link.includes('/item/')) {
                    const itemName = this.extractItemNameFromUrl(link);
                    if (itemName) {
                        items.push({
                            name: itemName,
                            url: link.startsWith('http') ? link : this.rustclashBaseUrl + link
                        });
                    }
                }
            }
        }
        
        // Also try to extract from markdown if available
        if (data.markdown) {
            const markdownItems = this.extractItemsFromMarkdown(data.markdown);
            items.push(...markdownItems);
        }
        
        // Remove duplicates
        const uniqueItems = items.filter((item, index, self) => 
            index === self.findIndex(t => t.name === item.name)
        );
        
        this.log('info', `Found ${uniqueItems.length} items in item list`);
        return uniqueItems;
    }
    
    extractItemNameFromUrl(url) {
        const match = url.match(/\/item\/([^\/\?]+)/);
        if (match) {
            return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        return null;
    }
    
    extractItemsFromMarkdown(markdown) {
        const items = [];
        const linkMatches = markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
        
        for (const match of linkMatches) {
            const name = match[1].trim();
            const url = match[2].trim();
            
            if (url.includes('/item/')) {
                items.push({
                    name: name,
                    url: url.startsWith('http') ? url : this.rustclashBaseUrl + url
                });
            }
        }
        
        return items;
    }
    
    // ===== ITEM SCRAPING =====
    
    async scrapeItemDetails(itemUrl, itemName) {
        const config = {
            url: itemUrl,
            formats: ['json', 'markdown', 'html'],
            jsonOptions: {
                prompt: `Extract ALL detailed information about the Rust game item '${itemName}'. Include:
                
1. Basic Properties: name, category, description, identifier, stack_size, despawn_time, blueprint_required, research_cost
2. Crafting: crafting_ingredients with quantities, crafting_time, workbench_level
3. Recycling: regular recycling_yield AND safe_zone_recycler yield
4. Combat: damage, fire_rate, reload_time, magazine_size, ammo_types for weapons
5. Building: durability, raid_costs for construction items
6. Electrical: power_usage, inputs, outputs for electrical items
7. Other: any item-specific properties

Format as comprehensive structured JSON. Return NULL for fields not applicable to this item.`
            }
        };
        
        const data = await this.makeFirecrawlRequest(config);
        return this.processItemData(data, itemName);
    }
    
    processItemData(data, itemName) {
        let itemData = { name: itemName };
        
        // Try to use extracted JSON first
        if (data.json && typeof data.json === 'object') {
            itemData = { ...itemData, ...data.json };
        }
        
        // Fallback to HTML/markdown parsing if needed
        if (!itemData.identifier && data.html) {
            const htmlData = this.parseHTMLForBasicInfo(data.html);
            itemData = { ...itemData, ...htmlData };
        }
        
        return itemData;
    }
    
    parseHTMLForBasicInfo(html) {
        const data = {};
        
        // Extract ID
        const idMatch = html.match(/(?:ID|identifier)[:\\s]*([0-9]+)/i);
        if (idMatch) {
            data.identifier = parseInt(idMatch[1]);
        }
        
        // Extract stack size
        const stackMatch = html.match(/stack[\\s]*size[:\\s]*([0-9]+)/i);
        if (stackMatch) {
            data.stack_size = parseInt(stackMatch[1]);
        }
        
        return data;
    }
    
    // ===== FORMAT CONVERSION FOR BOT COMPATIBILITY =====
    
    convertToBotFormat(items) {
        const botData = {
            items: {},
            craftData: {},
            recycleData: {},
            researchData: {}
        };
        
        for (const item of items) {
            if (!item.identifier) continue;
            
            const itemId = item.identifier.toString();
            
            // items.json format
            botData.items[itemId] = {
                shortname: this.generateShortname(item),
                name: item.name,
                description: item.description || `${item.name} - Scraped from rustclash.com`
            };
            
            // Crafting data
            if (item.crafting_ingredients) {
                const ingredients = [];
                for (const [materialName, quantity] of Object.entries(item.crafting_ingredients)) {
                    ingredients.push({
                        id: this.getMaterialId(materialName),
                        quantity: quantity
                    });
                }
                
                botData.craftData[itemId] = {
                    ingredients: ingredients,
                    workbench: item.workbench_level ? this.workbenchIds[item.workbench_level] : null,
                    time: this.parseCraftingTime(item.crafting_time) || 30,
                    timeString: item.crafting_time || "30 sec"
                };
            }
            
            // Recycling data
            if (item.recycling_yield) {
                const recycleData = {
                    recycler: { efficiency: "0.6", yield: [] },
                    "safe-zone-recycler": { efficiency: "0.4", yield: [] },
                    shredder: { efficiency: null, yield: [] }
                };
                
                if (item.recycling_yield.regular) {
                    for (const [mat, qty] of Object.entries(item.recycling_yield.regular)) {
                        recycleData.recycler.yield.push({
                            id: this.getMaterialId(mat),
                            probability: 1,
                            quantity: qty
                        });
                    }
                }
                
                if (item.recycling_yield.safe_zone_recycler) {
                    for (const [mat, qty] of Object.entries(item.recycling_yield.safe_zone_recycler)) {
                        recycleData["safe-zone-recycler"].yield.push({
                            id: this.getMaterialId(mat),
                            probability: 1,
                            quantity: qty
                        });
                    }
                }
                
                botData.recycleData[itemId] = recycleData;
            }
            
            // Research data
            if (item.research_cost || item.workbench_level) {
                botData.researchData[itemId] = {
                    researchTable: typeof item.research_cost === 'object' ? item.research_cost.scrap : item.research_cost,
                    workbench: item.workbench_level ? {
                        type: this.workbenchIds[item.workbench_level],
                        scrap: typeof item.research_cost === 'object' ? item.research_cost.scrap : item.research_cost,
                        totalScrap: typeof item.research_cost === 'object' ? item.research_cost.scrap : item.research_cost
                    } : null
                };
            }
        }
        
        return botData;
    }
    
    generateShortname(item) {
        const name = item.name.toLowerCase();
        
        // Known mappings for consistency with existing bot data
        const mappings = {
            'assault rifle': 'rifle.ak',
            'bolt action rifle': 'rifle.bolt',
            'large medkit': 'largemedkit',
            'auto turret': 'autoturret',
            'beehive': 'beehive',
            'metal chest plate': 'metal.plate.torso',
            'metal facemask': 'metal.facemask'
        };
        
        if (mappings[name]) {
            return mappings[name];
        }
        
        return name.replace(/\\s+/g, '.');
    }
    
    parseCraftingTime(timeString) {
        if (!timeString) return 30;
        const match = timeString.toString().match(/(\\d+)/);
        return match ? parseInt(match[1]) : 30;
    }
    
    getMaterialId(materialName) {
        const key = materialName.toLowerCase().trim();
        return this.materialIdMap[key] || materialName;
    }
    
    // ===== SAVE RESULTS =====
    
    async saveResults(items, appendMode = false) {
        // Ensure directories exist
        if (!fs.existsSync(this.humanReadablePath)) {
            fs.mkdirSync(this.humanReadablePath, { recursive: true });
        }
        
        // Save human-readable format
        this.saveHumanReadableFormat(items);
        
        // Convert to bot format
        const botData = this.convertToBotFormat(items);
        
        // Save bot format files (merge with existing if append mode)
        const botFiles = [
            { name: 'items.json', data: botData.items },
            { name: 'rustlabsCraftData.json', data: botData.craftData },
            { name: 'rustlabsRecycleData.json', data: botData.recycleData },
            { name: 'rustlabsResearchData.json', data: botData.researchData }
        ];
        
        for (const file of botFiles) {
            const filepath = path.join(this.staticFilesPath, file.name);
            let finalData = file.data;
            
            if (appendMode && fs.existsSync(filepath)) {
                const existingData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                finalData = { ...existingData, ...file.data };
            }
            
            // Create backup of original file
            if (fs.existsSync(filepath) && !appendMode) {
                const backupPath = filepath + '.backup';
                fs.copyFileSync(filepath, backupPath);
            }
            
            fs.writeFileSync(filepath, JSON.stringify(finalData, null, 2));
            this.log('info', `Updated ${file.name} with ${Object.keys(finalData).length} items`);
        }
    }
    
    saveHumanReadableFormat(items) {
        // Group by category for human-readable organization
        const categories = {};
        for (const item of items) {
            const category = item.category || 'Uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        }
        
        // Save each category
        for (const [category, categoryItems] of Object.entries(categories)) {
            const categoryDir = path.join(this.humanReadablePath, category);
            if (!fs.existsSync(categoryDir)) {
                fs.mkdirSync(categoryDir, { recursive: true });
            }
            
            for (const item of categoryItems) {
                const filename = this.sanitizeFilename(item.name) + '.json';
                const filepath = path.join(categoryDir, filename);
                fs.writeFileSync(filepath, JSON.stringify(item, null, 2));
            }
        }
        
        this.log('info', `Saved ${items.length} items in human-readable format across ${Object.keys(categories).length} categories`);
    }
    
    sanitizeFilename(name) {
        return name.replace(/[^\\w\\-\\.]/g, '_');
    }
    
    // ===== MAIN SCRAPING FUNCTIONS =====
    
    async scrapeAllItems() {
        this.log('info', 'Starting full scrape of all items');
        
        const progress = this.loadProgress();
        
        // Check if we're rate limited
        if (progress.rateLimitedUntil && Date.now() < progress.rateLimitedUntil) {
            const waitTime = Math.ceil((progress.rateLimitedUntil - Date.now()) / 60000);
            this.log('warn', `Still rate limited. Will retry in ${waitTime} minutes.`);
            return { success: false, reason: 'rate_limited', retryIn: waitTime };
        }
        
        try {
            // Get all items
            const allItems = await this.getItemListFromRustclash();
            const itemsToScrape = allItems.filter(item => 
                !progress.completedItems.includes(item.name)
            );
            
            this.log('info', `Found ${itemsToScrape.length} items to scrape (${progress.completedItems.length} already completed)`);
            
            const scrapedItems = [];
            let successCount = 0;
            let errorCount = 0;
            
            for (const item of itemsToScrape) {
                try {
                    this.log('info', `Scraping item: ${item.name}`);
                    
                    const itemData = await this.scrapeItemDetails(item.url, item.name);
                    scrapedItems.push(itemData);
                    
                    // Mark as completed
                    progress.completedItems.push(item.name);
                    this.saveProgress(progress);
                    
                    successCount++;
                    
                    // Rate limiting delay
                    const delay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
                    await this.sleep(delay);
                    
                } catch (error) {
                    if (error.message.startsWith('RATE_LIMITED')) {
                        this.log('warn', 'Hit rate limit, stopping scrape');
                        break;
                    }
                    
                    this.log('error', `Failed to scrape ${item.name}: ${error.message}`);
                    progress.failedItems.push({ name: item.name, error: error.message });
                    errorCount++;
                }
            }
            
            if (scrapedItems.length > 0) {
                await this.saveResults(scrapedItems);
            }
            
            progress.lastRun = new Date().toISOString();
            this.saveProgress(progress);
            
            this.log('info', `Scrape completed. Success: ${successCount}, Errors: ${errorCount}`);
            return { 
                success: true, 
                itemsScraped: successCount, 
                errors: errorCount,
                totalItems: scrapedItems.length 
            };
            
        } catch (error) {
            this.log('error', `Scrape failed: ${error.message}`);
            return { success: false, reason: 'error', error: error.message };
        }
    }
    
    async scrapeNewItems() {
        this.log('info', 'Checking for new items');
        
        const progress = this.loadProgress();
        
        try {
            const currentItems = await this.getItemListFromRustclash();
            const existingItems = new Set(progress.completedItems);
            
            const newItems = currentItems.filter(item => !existingItems.has(item.name));
            
            if (newItems.length === 0) {
                this.log('info', 'No new items found');
                return { success: true, newItems: 0 };
            }
            
            this.log('info', `Found ${newItems.length} new items to scrape`);
            
            const scrapedItems = [];
            for (const item of newItems) {
                try {
                    const itemData = await this.scrapeItemDetails(item.url, item.name);
                    scrapedItems.push(itemData);
                    
                    progress.completedItems.push(item.name);
                    
                    const delay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
                    await this.sleep(delay);
                    
                } catch (error) {
                    this.log('error', `Failed to scrape new item ${item.name}: ${error.message}`);
                }
            }
            
            if (scrapedItems.length > 0) {
                await this.saveResults(scrapedItems, true); // Append mode
            }
            
            progress.lastItemListCheck = new Date().toISOString();
            this.saveProgress(progress);
            
            return { success: true, newItems: scrapedItems.length };
            
        } catch (error) {
            this.log('error', `New items check failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    async scrapeSingleItem(itemName) {
        this.log('info', `Scraping single item: ${itemName}`);
        
        try {
            // Find the item in the list
            const allItems = await this.getItemListFromRustclash();
            const item = allItems.find(i => 
                i.name.toLowerCase().includes(itemName.toLowerCase()) ||
                itemName.toLowerCase().includes(i.name.toLowerCase())
            );
            
            if (!item) {
                throw new Error(`Item "${itemName}" not found in the item list`);
            }
            
            const itemData = await this.scrapeItemDetails(item.url, item.name);
            await this.saveResults([itemData], true); // Append mode
            
            // Update progress
            const progress = this.loadProgress();
            if (!progress.completedItems.includes(item.name)) {
                progress.completedItems.push(item.name);
                this.saveProgress(progress);
            }
            
            return { success: true, item: itemData };
            
        } catch (error) {
            this.log('error', `Failed to scrape item ${itemName}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // ===== SCHEDULER =====
    
    startWeeklyScheduler() {
        // Every Thursday at 20:00 (8 PM) UTC
        cron.schedule('0 20 * * 4', async () => {
            this.log('info', 'Weekly scrape triggered - checking for new items');
            await this.scrapeNewItems();
        }, {
            timezone: "UTC"
        });
        
        this.log('info', 'Weekly scheduler started - will check for new items every Thursday at 20:00 UTC');
    }
    
    // ===== STATUS AND MANAGEMENT =====
    
    getStatus() {
        const progress = this.loadProgress();
        const isRateLimited = progress.rateLimitedUntil && Date.now() < progress.rateLimitedUntil;
        
        return {
            completedItems: progress.completedItems.length,
            failedItems: progress.failedItems.length,
            lastRun: progress.lastRun,
            lastItemListCheck: progress.lastItemListCheck,
            isRateLimited: isRateLimited,
            rateLimitedUntil: progress.rateLimitedUntil,
            creditsExhausted: progress.creditsExhausted,
            apiKeyConfigured: !!this.apiKey
        };
    }
    
    resetProgress() {
        const emptyProgress = {
            lastRun: null,
            completedItems: [],
            failedItems: [],
            rateLimitedUntil: null,
            creditsExhausted: false,
            lastItemListCheck: null
        };
        this.saveProgress(emptyProgress);
        this.log('info', 'Progress reset');
    }
}

module.exports = FirecrawlScraper;