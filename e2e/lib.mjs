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
export async function openPage(browser, url, { width = 1400, height = 860, storage = null, route = null, noWebGL = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  if (route) await context.route(route[0], (r) => (route[1] === 'abort' ? r.abort() : r.continue()));
  if (noWebGL) {
    await context.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(String(type)) ? null : orig.call(this, type, ...rest);
      };
    });
  }
  if (storage) {
    // seed the save only when none exists, so reloads keep what the game wrote
    await context.addInitScript((s) => {
      try {
        if (!localStorage.getItem('butterfly-job.save.v1')) localStorage.setItem('butterfly-job.save.v1', s);
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

/** A save that skips the intro/onboarding, with the given overrides. */
export function seededSave(over = {}) {
  const base = {
    v: 1,
    current: 'c1',
    unlocked: ['c1'],
    completed: {},
    approaches: {},
    plans: {},
    discovered: [],
    hintLevel: {},
    introSeen: true,
    onboardingDone: true,
    settings: { volume: 0.7, muted: false, reducedMotion: false, quality: 'medium', showFps: false, overlays: true },
  };
  const out = { ...base, ...over, settings: { ...base.settings, ...(over.settings ?? {}) } };
  return JSON.stringify(out);
}
