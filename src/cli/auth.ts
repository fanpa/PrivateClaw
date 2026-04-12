import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

interface AuthOptions {
  url: string;
  configPath: string;
  waitForUrl?: string;
  timeout?: number;
}

interface AuthResult {
  domain: string;
  cookieCount: number;
  cookieHeader: string;
}

function detectBrowserChannel(): string {
  // Try Chrome first, then Edge
  // playwright-core accepts 'chrome', 'msedge', 'chromium'
  // On Windows, Edge is always available
  // On macOS, Chrome is most common
  if (process.platform === 'win32') return 'msedge';
  return 'chrome';
}

export async function executeAuth(options: AuthOptions): Promise<AuthResult> {
  const { url, configPath, timeout = 300000 } = options;
  const targetUrl = new URL(url);
  const domain = targetUrl.hostname;

  const channel = detectBrowserChannel();

  console.log(`Opening ${channel} browser...`);
  console.log(`Please log in at: ${url}`);
  console.log(`Browser will close automatically after login is detected.\n`);

  const browser = await chromium.launch({
    channel,
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);

  // Wait for user to complete login
  // Strategy: wait for cookies to appear on the domain, or timeout
  // If waitForUrl is specified, wait until the URL changes to that pattern
  if (options.waitForUrl) {
    await page.waitForURL(options.waitForUrl, { timeout });
  } else {
    // Wait for any navigation away from the login page (user completed login)
    // Or wait for the user to press Enter in the terminal
    console.log('Press Enter in this terminal after you have logged in...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  // Capture cookies for the domain
  const cookies = await context.cookies();
  const domainCookies = cookies.filter(
    (c) => c.domain === domain || c.domain === `.${domain}` || domain.endsWith(c.domain.replace(/^\./, '')),
  );

  await browser.close();

  if (domainCookies.length === 0) {
    throw new Error(`No cookies found for domain: ${domain}`);
  }

  // Build Cookie header value
  const cookieHeader = domainCookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Update config file
  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);

  if (!config.security) config.security = {};
  if (!config.security.defaultHeaders) config.security.defaultHeaders = {};
  if (!config.security.defaultHeaders[domain]) config.security.defaultHeaders[domain] = {};

  config.security.defaultHeaders[domain]['Cookie'] = cookieHeader;

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  return {
    domain,
    cookieCount: domainCookies.length,
    cookieHeader,
  };
}
