// Shared Playwright helpers for the end-to-end checks (headless Chromium, software WebGL).
import { chromium } from 'playwright';

export const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function launch() {
  return chromium.launch({
    executablePath: CHROMIUM,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

/** New page that records console errors/warnings and uncaught exceptions. */
export async function openPage(browser, url, { width = 1400, height = 860, storage = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  if (storage) {
    await context.addInitScript((s) => {
      try {
        localStorage.setItem('butterfly-job.save', s);
      } catch {}
    }, storage);
  }
  const page = await context.newPage();
  const log = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') log.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => log.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, context, log };
}

export async function waitFor(page, expr, timeout = 90000) {
  await page.waitForFunction(expr, null, { timeout, polling: 200 });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
