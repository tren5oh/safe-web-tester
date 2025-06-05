// modules/securityAudit.js

const { URL } = require('url');

async function runSecurityAudit(page, url) {
  const results = {
    https: {
      enforced: false,
      message: 'HTTPS is not enforced.',
    },
    headers: [],
    techExposed: [],
    cookies: [],
    openAdminPaths: []
  };

  // ✅ Check if HTTPS is used
  try {
    const testUrl = new URL(url);
    if (testUrl.protocol === 'https:') {
      results.https.enforced = true;
      results.https.message = '✅ HTTPS is properly enforced.';
    }
  } catch {}

  // 🌐 Check headers
  const response = await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  const headers = response.headers();

  const importantHeaders = {
    'strict-transport-security': 'Helps prevent downgrade attacks',
    'content-security-policy': 'Protects against cross-site scripting',
    'x-frame-options': 'Prevents clickjacking',
    'x-content-type-options': 'Prevents MIME-type sniffing',
    'referrer-policy': 'Controls what referrer info is sent',
    'permissions-policy': 'Controls use of browser features'
  };

  for (const [header, description] of Object.entries(importantHeaders)) {
    const exists = headers.hasOwnProperty(header);
    results.headers.push({
      name: header,
      present: exists,
      message: exists ? `✅ ${header} is set.` : `❌ ${header} is missing. ${description}`
    });
  }

  // 🔍 Check for generator/meta tag (tech exposure)
  try {
    const generatorTag = await page.$('meta[name="generator"]');
    if (generatorTag) {
      const content = await generatorTag.getAttribute('content');
      if (content) {
        results.techExposed.push(`⚠️ Page reveals technology used: "${content}"`);
      }
    }
  } catch {}

  // 🍪 Check for insecure cookies
  const cookies = await page.context().cookies();
  cookies.forEach(cookie => {
    if (!cookie.secure || !cookie.httpOnly) {
      results.cookies.push(`⚠️ Insecure cookie "${cookie.name}" - secure: ${cookie.secure}, httpOnly: ${cookie.httpOnly}`);
    }
  });

  // 🚪 Check for exposed admin paths
  const commonPaths = ['/admin', '/login', '/dashboard', '/wp-admin'];
  for (const path of commonPaths) {
    try {
      const fullUrl = new URL(path, url).toString();
      const res = await page.goto(fullUrl, { timeout: 5000 });
      if (res.status() < 400) {
        results.openAdminPaths.push(`⚠️ Open admin page found: ${path}`);
      }
    } catch {}
  }

  return results;
}

module.exports = { runSecurityAudit };
