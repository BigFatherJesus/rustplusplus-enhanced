/*
    Item Data Scraper for RustHelp.com
    Scrapes item data including crafting recipes, durability, costs, etc.
    Runs weekly to keep item database up-to-date
*/

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class ItemScraper {
    constructor() {
        this.baseUrl = 'https://rusthelp.com';
        this.categories = [
            '/browse/items',
            '/browse/building',
            '/browse/world'
        ];
        this.itemData = {};
        this.craftData = {};
        this.delay = 1000; // 1 second delay between requests
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchPage(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching ${url}:`, error.message);
            return null;
        }
    }

    extractItemLinks(html) {
        const $ = cheerio.load(html);
        const links = [];
        
        $('a[href*="/items/"], a[href*="/building/"], a[href*="/world/"]').each((i, element) => {
            const href = $(element).attr('href');
            if (href && href.startsWith('/')) {
                links.push(this.baseUrl + href);
            }
        });
        
        return [...new Set(links)]; // Remove duplicates
    }

    extractItemData(html, url) {
        const $ = cheerio.load(html);
        const itemData = {};
        
        try {
            // Extract item name from title or h1
            const title = $('h1').first().text().trim() || $('title').text().trim();
            itemData.name = title.replace(' | RustHelp', '').trim();
            
            // Extract short name and ID from page content
            const shortNameMatch = html.match(/Short Name[:\s]+["]?([^"<\n]+)["]?/i);
            if (shortNameMatch) {
                itemData.shortname = shortNameMatch[1].trim();
            }
            
            const idMatch = html.match(/ID[:\s]+(-?\d+)/i);
            if (idMatch) {
                itemData.id = idMatch[1];
            }
            
            // Extract stack size
            const stackMatch = html.match(/Stack Size[:\s]+×?(\d+)/i);
            if (stackMatch) {
                itemData.stackSize = parseInt(stackMatch[1]);
            }
            
            // Extract despawn time
            const despawnMatch = html.match(/Despawn Time[:\s]+([^<\n]+)/i);
            if (despawnMatch) {
                itemData.despawnTime = despawnMatch[1].trim();
            }
            
            // Extract workbench requirement
            const workbenchMatch = html.match(/Workbench[:\s]+Level\s+(\d+)/i);
            if (workbenchMatch) {
                itemData.workbenchLevel = parseInt(workbenchMatch[1]);
            }
            
            // Extract crafting materials
            const craftingSection = html.match(/Crafting[^{]*{([^}]*)}/i);
            if (craftingSection) {
                const materials = [];
                const materialMatches = craftingSection[1].matchAll(/(\d+)x?\s*([^,\n]+)/g);
                for (const match of materialMatches) {
                    materials.push({
                        quantity: parseInt(match[1]),
                        name: match[2].trim()
                    });
                }
                itemData.craftingMaterials = materials;
            }
            
            // Extract research cost
            const researchMatch = html.match(/Research Table[:\s]+(\d+)\s*Scrap/i);
            if (researchMatch) {
                itemData.researchCost = parseInt(researchMatch[1]);
            }
            
            // Extract tech tree cost
            const techTreeMatch = html.match(/Tech Tree[^:]*:\s*(\d+)\s*Scrap/i);
            if (techTreeMatch) {
                itemData.techTreeCost = parseInt(techTreeMatch[1]);
            }
            
            // Extract recycling yields
            const recyclingMatches = html.matchAll(/(\d+)x?\s*([^,\n]+)/g);
            const recyclingYields = [];
            for (const match of recyclingMatches) {
                if (match[0].toLowerCase().includes('recycl')) {
                    recyclingYields.push({
                        quantity: parseInt(match[1]),
                        name: match[2].trim()
                    });
                }
            }
            if (recyclingYields.length > 0) {
                itemData.recyclingYields = recyclingYields;
            }
            
            // Extract durability if mentioned
            const durabilityMatch = html.match(/Durability[:\s]+(\d+)/i);
            if (durabilityMatch) {
                itemData.durability = parseInt(durabilityMatch[1]);
            }
            
            return itemData;
        } catch (error) {
            console.error(`Error extracting data from ${url}:`, error.message);
            return null;
        }
    }

    async scrapeAllItems() {
        console.log('Starting item scraping...');
        
        // Get all item links from category pages
        const allLinks = new Set();
        
        for (const category of this.categories) {
            console.log(`Scraping category: ${category}`);
            const categoryUrl = this.baseUrl + category;
            const html = await this.fetchPage(categoryUrl);
            
            if (html) {
                const links = this.extractItemLinks(html);
                links.forEach(link => allLinks.add(link));
                console.log(`Found ${links.length} items in ${category}`);
            }
            
            await this.sleep(this.delay);
        }
        
        console.log(`Total items to scrape: ${allLinks.size}`);
        
        // Scrape each item page
        let count = 0;
        for (const link of allLinks) {
            count++;
            console.log(`Scraping item ${count}/${allLinks.size}: ${link}`);
            
            const html = await this.fetchPage(link);
            if (html) {
                const itemData = this.extractItemData(html, link);
                if (itemData && itemData.id) {
                    this.itemData[itemData.id] = itemData;
                    
                    // Also store craft data if available
                    if (itemData.craftingMaterials && itemData.craftingMaterials.length > 0) {
                        this.craftData[itemData.id] = {
                            ingredients: itemData.craftingMaterials.map(mat => ({
                                name: mat.name,
                                quantity: mat.quantity
                            })),
                            workbench: itemData.workbenchLevel || null,
                            time: null // Not available from this source
                        };
                    }
                }
            }
            
            await this.sleep(this.delay);
        }
        
        console.log(`Scraped ${Object.keys(this.itemData).length} items`);
        return {
            items: this.itemData,
            crafting: this.craftData
        };
    }

    async saveData() {
        const staticFilesPath = path.join(__dirname, '..', 'staticFiles');
        
        // Save items data
        const itemsPath = path.join(staticFilesPath, 'items.json');
        const existingItems = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};
        
        // Merge new data with existing data
        const mergedItems = { ...existingItems, ...this.itemData };
        fs.writeFileSync(itemsPath, JSON.stringify(mergedItems, null, 2));
        
        // Save crafting data
        const craftPath = path.join(staticFilesPath, 'rustlabsCraftData.json');
        const existingCraft = fs.existsSync(craftPath) ? JSON.parse(fs.readFileSync(craftPath, 'utf8')) : {};
        
        // Convert name-based ingredients to ID-based (would need item name to ID mapping)
        const mergedCraft = { ...existingCraft, ...this.craftData };
        fs.writeFileSync(craftPath, JSON.stringify(mergedCraft, null, 2));
        
        console.log('Data saved successfully');
    }

    async run() {
        try {
            await this.scrapeAllItems();
            await this.saveData();
            console.log('Scraping completed successfully');
        } catch (error) {
            console.error('Scraping failed:', error);
        }
    }
}

module.exports = ItemScraper;