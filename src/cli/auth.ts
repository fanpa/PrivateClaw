import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

export interface AuthOptions {
  url: string;
  configPath: string;
  waitForUrl?: string;
  timeout?: number;
  extraHeaders?: Record<string, string>;
}

interface AuthResult {
  domain: string;
  cookieCount: number;
  cookieHeader: string;
}

const EDGE_PATH_WIN = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function launchBrowser(headless: boolean) {
  if (process.platform === 'win32') {
    try {
      return await puppeteer.launch({ channel: 'chrome', headless });
    } catch {
      console.log('Chrome not found, falling back to Edge...');
      return puppeteer.launch({ executablePath: EDGE_PATH_WIN, headless });
    }
  }
  return puppeteer.launch({ channel: 'chrome', headless });
}

export async function executeAuth(options: AuthOptions): Promise<AuthResult> {
  const { url, configPath, timeout = 300000 } = options;
  const targetUrl = new URL(url);
  const domain = targetUrl.hostname;

  console.log('Opening browser...');
  console.log(`Please log in at: ${url}`);
  console.log('Browser will close automatically after login is detected.\n');

  const browser = await launchBrowser(false);
  const page = await browser.newPage();

  if (options.extraHeaders && Object.keys(options.extraHeaders).length > 0) {
    await page.setExtraHTTPHeaders(options.extraHeaders);
  }

  await page.goto(url);

  if (options.waitForUrl) {
    const pattern = options.waitForUrl;
    const deadline = Date.now() + timeout;
    let matched = false;
    while (!matched && Date.now() < deadline) {
      const currentUrl = page.url();
      try {
        matched = new RegExp(pattern).test(currentUrl);
      } catch {
        matched = currentUrl.startsWith(pattern) || currentUrl.includes(pattern);
      }
      if (!matched) {
        await page
          .waitForNavigation({ timeout: Math.min(5000, deadline - Date.now()) })
          .catch(() => {});
      }
    }
    if (!matched) {
      throw new Error(`Timed out waiting for URL matching: ${pattern}`);
    }
  } else {
    console.log('Press Enter in this terminal after you have logged in...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  // Capture all cookies via CDP to get cross-domain cookies after redirects
  const cdpSession = await page.createCDPSession();
  const { cookies } = await cdpSession.send('Network.getAllCookies');
  await cdpSession.detach();

  const domainCookies = cookies.filter(
    (c) => c.domain === domain || c.domain === `.${domain}` || domain.endsWith(c.domain.replace(/^\./, '')),
  );

  await browser.close();

  if (domainCookies.length === 0) {
    throw new Error(`No cookies found for domain: ${domain}`);
  }

  const cookieHeader = domainCookies.map((c) => `${c.name}=${c.value}`).join('; ');

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
