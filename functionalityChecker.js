const fetch = require('node-fetch');

/**
 * Functionality checker module for web testing
 * Provides methods to check links and buttons on a webpage
 */

/**
 * Checks all links on the page and returns an array of problematic links
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<Array<{href: string, status: number|string, error: string|null}>>}
 */
async function checkLinks(page) {
    try {
        // Get all links on the page with their text content
        const links = await page.$$eval('a[href]', (elements) =>
            elements.map(el => ({
                href: el.href,
                text: el.textContent?.trim() || '',
                isExternal: el.href.startsWith('http://') || el.href.startsWith('https://')
            }))
        );

        console.log(`Found ${links.length} total links on the page`);

        // Filter external links and test them
        const externalLinks = links.filter(link => link.isExternal);
        console.log(`Testing ${externalLinks.length} external links...`);

        const results = await Promise.all(
            externalLinks.map(async (link) => {
                try {
                    // Try GET request first, then fallback to HEAD if it fails
                    let response;
                    try {
                        response = await page.request.get(link.href, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; WebTester/1.0; +http://example.com)'
                            }
                        });
                    } catch (getError) {
                        // If GET fails, try HEAD request
                        response = await page.request.head(link.href, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; WebTester/1.0; +http://example.com)'
                            }
                        });
                    }

                    const status = response.status();
                    console.log(`Checked ${link.href} - Status: ${status}`);
                    
                    if (status >= 400) {
                        return {
                            href: link.href,
                            text: link.text,
                            status: status,
                            error: `HTTP ${status} - ${response.statusText()}`
                        };
                    }
                    return null;
                } catch (error) {
                    // Handle different types of errors
                    let errorMessage = error.message;
                    if (error.message.includes('timeout')) {
                        errorMessage = 'Request timed out after 10 seconds';
                    } else if (error.message.includes('ECONNREFUSED')) {
                        errorMessage = 'Connection refused';
                    } else if (error.message.includes('ENOTFOUND')) {
                        errorMessage = 'Domain not found';
                    }

                    console.log(`Error checking ${link.href}: ${errorMessage}`);
                    return {
                        href: link.href,
                        text: link.text,
                        status: 'failed',
                        error: errorMessage
                    };
                }
            })
        );

        // Filter out successful checks and return failed ones
        const brokenLinks = results.filter(result => result !== null);
        console.log(`Found ${brokenLinks.length} broken links`);
        return brokenLinks;
    } catch (error) {
        console.error('Error in checkLinks:', error);
        return [{
            href: 'general_error',
            text: '',
            status: 'failed',
            error: error.message
        }];
    }
}

/**
 * Checks all buttons on the page and returns disabled ones with detailed information
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<Array<{
 *   text: string,
 *   type: string,
 *   location: string,
 *   ariaLabel: string|null,
 *   parentElement: string|null
 * }>>}
 */
async function checkButtons(page) {
    try {
        const disabledButtons = await page.$$eval('button, input[type="button"], input[type="submit"]', (elements) => {
            function getButtonType(element) {
                if (element.tagName.toLowerCase() === 'input') {
                    return element.type || 'button';
                }
                return 'button';
            }

            function getButtonText(element) {
                if (element.tagName.toLowerCase() === 'input') {
                    return element.value || element.placeholder || element.name || 'Unnamed Input Button';
                }
                return element.textContent?.trim() || 'Unnamed Button';
            }

            function getParentContext(element) {
                const parent = element.parentElement;
                if (!parent) return null;

                // Check if parent is a form
                if (parent.tagName.toLowerCase() === 'form') {
                    return `Form${parent.id ? ` (ID: ${parent.id})` : ''}`;
                }

                // Check for common container elements
                const containers = ['div', 'section', 'nav', 'header', 'footer', 'main'];
                if (containers.includes(parent.tagName.toLowerCase())) {
                    // Try to get a meaningful name from various attributes
                    const name = parent.getAttribute('aria-label') || 
                               parent.getAttribute('data-testid') || 
                               parent.id ||
                               parent.className;
                    if (name) {
                        return `${parent.tagName.toLowerCase()} (${name})`;
                    }
                }

                return parent.tagName.toLowerCase();
            }

            function getLocation(element) {
                // Get the element's position in the page
                const rect = element.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;

                // Determine the general location
                let verticalPosition = 'middle';
                let horizontalPosition = 'center';

                if (rect.top < viewportHeight * 0.33) verticalPosition = 'top';
                else if (rect.top > viewportHeight * 0.66) verticalPosition = 'bottom';

                if (rect.left < viewportWidth * 0.33) horizontalPosition = 'left';
                else if (rect.left > viewportWidth * 0.66) horizontalPosition = 'right';

                return `${verticalPosition} ${horizontalPosition} of page`;
            }

            return elements
                .filter(el => el.disabled)
                .map(el => ({
                    text: getButtonText(el),
                    type: getButtonType(el),
                    location: getLocation(el),
                    ariaLabel: el.getAttribute('aria-label') || null,
                    parentElement: getParentContext(el)
                }));
        });

        return disabledButtons;
    } catch (error) {
        console.error('Error in checkButtons:', error);
        return [{
            text: 'Error checking buttons',
            type: 'unknown',
            location: 'unknown',
            ariaLabel: null,
            parentElement: null,
            error: error.message
        }];
    }
}

module.exports = {
    checkLinks,
    checkButtons
}; 