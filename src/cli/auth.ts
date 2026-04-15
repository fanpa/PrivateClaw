import { existsSync, readFileSync } from 'node:fs';

export interface AuthOptions {
  url: string;
  waitForUrl?: string;
  timeout?: number;
  extraHeaders?: Record<string, string>;
}

export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
}

export interface AuthResult {
  domain: string;
  cookies: CapturedCookie[];
}

const EDGE_PATH_WIN = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_WSL_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_WSL_PATH = '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function isWSL(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    const release = readFileSync('/proc/version', 'utf-8');
    return /microsoft|wsl/i.test(release);
  } catch {
    return false;
  }
}

async function loadPuppeteer() {
  try {
    const mod = await import('puppeteer-core');
    return mod.default;
  } catch {
    throw new Error(
      'puppeteer-core is not available. ' +
      'Install it with: npm install -g puppeteer-core',
    );
  }
}

async function launchBrowser(headless: boolean) {
  const puppeteer = await loadPuppeteer();
  if (isWSL()) {
    // In WSL, use Windows Chrome/Edge via WSL interop so no X server is needed
    const wslArgs = ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'];
    if (existsSync(CHROME_WSL_PATH)) {
      return puppeteer.launch({ executablePath: CHROME_WSL_PATH, headless, args: wslArgs });
    }
    if (existsSync(EDGE_WSL_PATH)) {
      return puppeteer.launch({ executablePath: EDGE_WSL_PATH, headless, args: wslArgs });
    }
    throw new Error(
      'No browser found for WSL. Install Google Chrome or Microsoft Edge on Windows, ' +
      'or run with xvfb-run if a Linux browser is installed.',
    );
  }
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
  const { url, timeout = 300000 } = options;
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

  return {
    domain,
    cookies: domainCookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain })),
  };
}
