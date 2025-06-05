const fs = require('fs');
const path = require('path');

// Define common device viewports
const DEVICE_SIZES = [
    {
        name: 'Mobile Portrait',
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true
    },
    {
        name: 'Mobile Landscape',
        width: 844,
        height: 390,
        deviceScaleFactor: 2,
        isMobile: true
    },
    {
        name: 'Tablet Portrait',
        width: 810,
        height: 1080,
        deviceScaleFactor: 2,
        isMobile: true
    },
    {
        name: 'Tablet Landscape',
        width: 1080,
        height: 810,
        deviceScaleFactor: 2,
        isMobile: true
    },
    {
        name: 'Laptop',
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        isMobile: false
    },
    {
        name: 'Desktop',
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false
    }
];

/**
 * Check website responsiveness across different device sizes
 * @param {import('playwright').Page} page - Playwright page object
 * @param {string} baseUrl - The URL being tested
 * @param {string} baseDir - Base directory for output files
 * @returns {Promise<Object>} Test results for each device size
 */
async function checkResponsiveness(page, baseUrl, baseDir) {
    // Use the screenshots directory inside the provided base directory
    const screenshotDir = path.join(baseDir, 'screenshots');
    
    // Ensure screenshots directory exists
    fs.mkdirSync(screenshotDir, { recursive: true });

    console.log('\n📱 Testing responsiveness across different devices...');

    const results = [];
    
    for (const device of DEVICE_SIZES) {
        console.log(`\n🔍 Testing ${device.name} (${device.width}x${device.height})`);
        
        try {
            // Set viewport size
            await page.setViewportSize({
                width: device.width,
                height: device.height
            });

            // Reload the page
            const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
            const status = response.status();

            // Generate screenshot filename
            const screenshotFilename = `${device.name.toLowerCase().replace(/\s+/g, '-')}.png`;
            const screenshotPath = path.join(screenshotDir, screenshotFilename);
            
            // Take a screenshot
            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });

            // Get page metrics
            const metrics = {
                title: await page.title(),
                url: baseUrl,
                viewport: {
                    width: device.width,
                    height: device.height,
                    deviceScaleFactor: device.deviceScaleFactor,
                    isMobile: device.isMobile
                },
                status,
                device: device.name,
                screenshotPath: path.relative(process.cwd(), screenshotPath),
                timestamp: new Date().toISOString()
            };

            // Check for horizontal scrollbar (potential responsiveness issue)
            const hasHorizontalScrollbar = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });

            if (hasHorizontalScrollbar) {
                metrics.warning = 'Horizontal scrollbar detected - possible responsiveness issue';
            }

            // Check for tiny text (potential readability issue on mobile)
            if (device.isMobile) {
                const hasTinyText = await page.evaluate(() => {
                    const MIN_FONT_SIZE = 12; // minimum readable font size on mobile
                    const textElements = document.querySelectorAll('p, span, div, a, button');
                    for (const el of textElements) {
                        const fontSize = parseInt(window.getComputedStyle(el).fontSize);
                        if (fontSize < MIN_FONT_SIZE) return true;
                    }
                    return false;
                });

                if (hasTinyText) {
                    metrics.warning = (metrics.warning || '') + 
                        '\nSmall text detected - might be hard to read on mobile devices';
                }
            }

            results.push(metrics);
            console.log(`✅ ${device.name} test complete`);

        } catch (error) {
            console.error(`❌ Error testing ${device.name}:`, error.message);
            results.push({
                device: device.name,
                viewport: {
                    width: device.width,
                    height: device.height,
                    deviceScaleFactor: device.deviceScaleFactor,
                    isMobile: device.isMobile
                },
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    return {
        screenshotDir: path.relative(process.cwd(), screenshotDir),
        results
    };
}

module.exports = {
    checkResponsiveness
}; 