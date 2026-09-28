// Usage: node e2e/shot.mjs <url> <out.png> [readyExpression] [width] [height]
// Opens the page in headless Chromium (software WebGL), waits for readyExpression to be truthy,
// prints console errors and saves a screenshot.
import { chromium } from 'playwright';

const [url, out, readyExpr = 'true', w = '1400', h = '860'] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction(readyExpr, null, { timeout: 60000, polling: 250 });
} catch (e) {
  errors.push(`[timeout] ${readyExpr}`);
}
await page.waitForTimeout(600);
await page.screenshot({ path: out });
const info = await page.evaluate(() => JSON.stringify(window.__viewer ?? window.__bj?.debug?.() ?? null));
console.log('info', info);
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
