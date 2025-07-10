/*
    Scheduled Item Scraper
    Runs the item scraper on a weekly schedule
*/

const cron = require('node-cron');
const ItemScraper = require('./itemScraper.js');

class ScheduledScraper {
    constructor() {
        this.scraper = new ItemScraper();
        this.cronJob = null;
    }

    start() {
        // Run every Sunday at 2 AM
        this.cronJob = cron.schedule('0 2 * * 0', async () => {
            console.log('Starting scheduled item scraping...');
            try {
                await this.scraper.run();
                console.log('Scheduled item scraping completed successfully');
            } catch (error) {
                console.error('Scheduled item scraping failed:', error);
            }
        });

        console.log('Scheduled item scraper started - will run every Sunday at 2 AM');
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('Scheduled item scraper stopped');
        }
    }

    async runNow() {
        console.log('Running item scraper immediately...');
        try {
            await this.scraper.run();
            console.log('Manual item scraping completed successfully');
        } catch (error) {
            console.error('Manual item scraping failed:', error);
        }
    }
}

module.exports = ScheduledScraper;