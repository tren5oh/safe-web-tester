const fs = require('fs');
const {chromium} = require('playwright');
const path = require('path');
const config = require('./config.json');
const { checkLinks, checkButtons } = require('./functionalityChecker');
const { checkResponsiveness } = require('./responsivenessChecker');
const { runSecurityAudit } = require('./modules/securityAudit');


// STEP 1: Validate command line arguments
const [url, label] = process.argv.slice(2);

if (!url || !label) {
    console.log('❌ Usage: node runner.js <url> <label>');
    console.log('Example: node runner.js https://example.com acme-corp');
    process.exit(1);
}

// Validate label format (alphanumeric, hyphens, and underscores only)
if (!/^[a-zA-Z0-9-_]+$/.test(label)) {
    console.log('❌ Label must contain only letters, numbers, hyphens, and underscores');
    process.exit(1);
}

// STEP 2: Set up output directories
const baseDir = path.join(__dirname, 'reports', label);
const screenshotsDir = path.join(baseDir, 'screenshots');

// Create directories
try {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
} catch (error) {
    console.error('❌ Error creating directories:', error);
    process.exit(1);
}

// STEP 3: Get Domain from URL
const extractDomain = (url) => {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return null;
    }
};

/**
 * Format HTTP status code with description
 * @param {number} status - HTTP status code
 * @returns {string} Formatted status
 */
const formatStatus = (status) => {
    const statusText = {
        200: 'OK',
        201: 'Created',
        301: 'Moved Permanently',
        302: 'Found',
        304: 'Not Modified',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    return `${status} ${statusText[status] || ''}`.trim();
};

/**
 * Format the report for display in a client-friendly way
 * @param {Object} report - The report object
 * @returns {string} Formatted report
 */
const formatReportForDisplay = (report) => {
    const lines = [
        '\n📊 WEBSITE TEST REPORT',
        '==================',
        `🌐 URL: ${report.url}`,
        `🏠 Domain: ${report.domain}`,
        `🔖 Label: ${report.label}`,
        `📡 Status: ${report.status}`,
        `📝 Page Title: ${report.title}`,
        `⏱️  Load Time: ${report.loadTime.seconds} (${report.loadTime.ms}ms)`,
        `🕒 Timestamp: ${new Date(report.timestamp).toLocaleString()}`,
        `📂 Report Location: ${report.reportPath}`,
    ];

    if (report.error) {
        lines.push(`❌ Error: ${report.error}`);
    }

    // Format functionality section
    lines.push('\n🔍 FUNCTIONALITY CHECK');
    lines.push('------------------');

    // Broken Links Section
    lines.push('\n📎 BROKEN LINKS');
    if (report.functionality.brokenLinks.length === 0) {
        lines.push('✅ No broken links found');
    } else {
        lines.push(`Found ${report.functionality.brokenLinks.length} broken links:`);
        report.functionality.brokenLinks.forEach((link, index) => {
            lines.push(`${index + 1}. ${link.text || 'Unnamed Link'} (${link.href})`);
            lines.push(`   Status: ${link.status}`);
            if (link.error) lines.push(`   Error: ${link.error}`);
        });
    }

    // Disabled Buttons Section
    lines.push('\n🔘 DISABLED BUTTONS');
    if (report.functionality.disabledButtons.length === 0) {
        lines.push('✅ No disabled buttons found');
    } else {
        lines.push(`Found ${report.functionality.disabledButtons.length} disabled buttons:`);
        report.functionality.disabledButtons.forEach((button, index) => {
            lines.push(`${index + 1}. "${button.text}"`);
            lines.push(`   Type: ${button.type}`);
            lines.push(`   Location: ${button.location}`);
            if (button.parentElement) {
                lines.push(`   Container: ${button.parentElement}`);
            }
            if (button.ariaLabel) {
                lines.push(`   Accessibility Label: ${button.ariaLabel}`);
            }
            if (button.error) {
                lines.push(`   Error: ${button.error}`);
            }
            // Add a blank line between buttons for readability
            if (index < report.functionality.disabledButtons.length - 1) {
                lines.push('');
            }
        });
    }

    // Responsiveness Section
    if (report.responsiveness) {
        lines.push('\n📱 RESPONSIVENESS CHECK');
        lines.push('------------------');
        lines.push(`Screenshots saved to: ${report.responsiveness.screenshotDir}`);
        
        report.responsiveness.results.forEach((result) => {
            lines.push(`\n${result.device} (${result.viewport.width}x${result.viewport.height})`);
            if (result.error) {
                lines.push(`❌ Error: ${result.error}`);
            } else {
                lines.push(`✅ Status: ${result.status}`);
                if (result.warning) {
                    lines.push(`⚠️  Warning: ${result.warning}`);
                }
                lines.push(`📸 Screenshot: ${result.screenshotPath}`);
            }
        });
    }

    // Security Audit Section
    if (report.securityAudit && report.securityAudit.https) {
        lines.push('\n🛡️ SECURITY AUDIT');
        lines.push('------------------');
    
        lines.push(`\n🔒 HTTPS Enforcement: ${report.securityAudit.https.message}`);
    
        lines.push('\n📑 Security Headers:');
        report.securityAudit.headers.forEach(header => {
            lines.push(`- ${header.message}`);
        });
    
        if (report.securityAudit.techExposed.length > 0) {
            lines.push('\n🧪 Exposed Technologies:');
            report.securityAudit.techExposed.forEach(msg => lines.push(`- ${msg}`));
        }
    
        if (report.securityAudit.cookies.length > 0) {
            lines.push('\n🍪 Insecure Cookies:');
            report.securityAudit.cookies.forEach(msg => lines.push(`- ${msg}`));
        }
    
        if (report.securityAudit.openAdminPaths.length > 0) {
            lines.push('\n🚪 Open Admin Paths:');
            report.securityAudit.openAdminPaths.forEach(msg => lines.push(`- ${msg}`));
        }
    }
    

    return lines.join('\n');
};

const domain = extractDomain(url);

// STEP 4: Check if domain is allowed
if (!config.allowedDomains.includes(domain)) {
    console.log(`❌ Domain ${domain} is not in the allowed domains list.`);
    process.exit(1);
}

//STEP 5: Run the test
(async () => {
    const browser = await chromium.launch();        //Start Headless browser
    const page = await browser.newPage();           //Opens new tab

    const start = Date.now();                       //Time to load
    let status = null;
    let title = '';
    let error = null;
    let brokenLinks = [];
    let disabledButtons = [];
    let responsivenessResults = null;
    let securityAudit = null; 

    try {
        const response = await page.goto(url, {timeout: 15000});
        status = response.status();                //Get HTTP Status Code
        await page.waitForLoadState('load');       //Wait for full page load
        title = await page.title();                 //Get page title

        // Run functionality checks
        console.log('🔍 Checking links and buttons...');
        [brokenLinks, disabledButtons] = await Promise.all([
            checkLinks(page),
            checkButtons(page)
        ]);

        // Run responsiveness check
        responsivenessResults = await checkResponsiveness(page, url, baseDir);

        // Run passive security audit
        console.log('🛡️ Running passive security audit...');
        securityAudit = await runSecurityAudit(page, url);

    } catch (e) {
        error = e.message;                          // Save error message


    }

    const end = Date.now();
    const loadTimeMS = end - start;

    // Create the report
    const reportPath = path.join(baseDir, 'report.json');
    const report = {
        url,
        domain,
        label,
        status: status,
        title,
        loadTime: {
            ms: loadTimeMS,
            seconds: (loadTimeMS / 1000).toFixed(2) + 's'
        },
        timestamp: new Date().toISOString(),
        error,
        functionality: {
            brokenLinks,
            disabledButtons
        },
        responsiveness: responsivenessResults,
        reportPath: path.relative(process.cwd(), reportPath),
        securityAudit
    };
    
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('📁 Report saved successfully to:', reportPath);
    } catch (error) {
        console.error('❌ Error saving report:', error);
    }
    
    // Display formatted report
    console.log(formatReportForDisplay(report));

    // STEP 6: Delay so we don't spam sites/server
    await new Promise(res => setTimeout(res, config.delayMs));
    await browser.close();                        //closes browser
})();