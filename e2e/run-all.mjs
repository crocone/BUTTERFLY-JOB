// End-to-end checks in headless Chromium (software WebGL via SwiftShader).
//
//   node e2e/run-all.mjs [baseUrl] [test,test,...]
//
// baseUrl defaults to the production preview (npm run build && npm run preview).
// Every test fails on console errors/warnings, uncaught exceptions, failed requests or HTTP
// errors.  Results go to e2e/out/report.json (+ screenshots in e2e/out/).
import fs from 'node:fs';
import { launch, openPage, seededSave, sleep, waitFor } from './lib.mjs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const OUT = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const browser = await launch();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(name, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  const t0 = Date.now();
  const ctx = { logs: [], contexts: [], notes: {} };
  ctx.open = async (url, opts = {}) => {
    const r = await openPage(browser, url, opts);
    ctx.contexts.push(r.context);
    r.log.push = (...items) => Array.prototype.push.apply(ctx.logs, items);
    await waitFor(r.page, 'window.__bj && window.__bj.ready', 120000);
    return r.page;
  };
  let ok = true;
  let error = '';
  try {
    await fn(ctx);
    if (ctx.logs.length) throw new Error(`console/network problems:\n  ${ctx.logs.join('\n  ')}`);
  } catch (e) {
    ok = false;
    error = String(e && e.stack ? e.stack : e);
  } finally {
    for (const c of ctx.contexts) await c.close().catch(() => {});
  }
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  results.push({ name, ok, secs, notes: ctx.notes, error: ok ? undefined : error });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${secs}s)${ok ? '' : '\n' + error}`);
  if (Object.keys(ctx.notes).length) console.log('      ', JSON.stringify(ctx.notes));
}

const bj = (page, fn, arg) => page.evaluate(fn, arg);
const mode = (page) => bj(page, () => window.__bj.mode);
const settle = (page) => waitFor(page, '!window.__bj.transitioning && !window.__bj.cameraMoving', 60000);
const toasts = (page) => page.$$eval('.toast', (els) => els.map((e) => e.textContent));
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const save = (page) => bj(page, () => JSON.parse(localStorage.getItem('butterfly-job.save.v1') ?? 'null'));

async function clickText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = (await el.textContent()) ?? '';
    if (t.includes(text)) {
      await el.click();
      return;
    }
  }
  throw new Error(`no ${selector} containing "${text}"`);
}

async function clickSite(page, site) {
  const p = await bj(page, (s) => window.__bj.screenOf(s), site);
  await page.mouse.move(p.x, p.y);
  await sleep(150);
  await page.mouse.click(p.x, p.y);
}

// ------------------------------------------------------------------------------------------------
await test('boot-intro-onboarding', async (ctx) => {
  const page = await ctx.open(BASE, { width: 1280, height: 780 });
  assert((await mode(page)) === 'intro', 'first visit should open with the intro');
  await waitFor(page, "document.querySelector('.caption')?.textContent.includes('Riverdale')");
  await shot(page, 'intro');
  await sleep(1200);
  await page.mouse.click(640, 300); // click skips the intro
  await waitFor(page, 'window.__bj.mode === "planning"', 30000);
  assert((await bj(page, () => window.__bj.era)) === 1946, 'the intro ends in 1946');
  await settle(page);
  await sleep(300);
  const label = await page.$$eval('.labels .label', (els) => els.filter((e) => e.style.display !== 'none').map((e) => e.textContent).join('|'));
  assert(label.includes('Inspect the sapling'), `onboarding pointer missing (labels: ${label})`);
  const s = await save(page);
  assert(s && s.introSeen === true, 'introSeen persisted');
  // step 1: inspect the sapling with a real click on the canvas
  await clickSite(page, 'oak');
  await waitFor(page, "document.querySelector('.panel.right h2')?.textContent === 'THE OAK'");
  const hint = await page.$eval('.panel.right', (e) => e.textContent);
  assert(hint.includes('Choose where it grows'), 'card shows the onboarding hint');
  // step 2: plant it by the yard (DOM option button)
  await clickText(page, '.panel.right button.opt', 'service yard');
  await sleep(300);
  let d = await bj(page, () => window.__bj.decisions);
  assert(d['oak.plant'] === 'yard', `decision recorded (${JSON.stringify(d)})`);
  assert((await page.$eval('.budget .num', (e) => e.textContent)) === '1 / 5', 'budget shows 1 / 5');
  // step 3: see 2026 (keyboard)
  await settle(page);
  await page.keyboard.press('3');
  await settle(page);
  await sleep(1500);
  const cons = await bj(page, () => window.__bj.discovered());
  assert(cons.includes('oak.pruned'), `pruning discovered (${cons})`);
  // step 4: back to 1986 and preserve it
  await page.keyboard.press('2');
  await settle(page);
  await clickSite(page, 'oak');
  await waitFor(page, "document.querySelector('.panel.right h2')?.textContent === 'THE OAK'");
  await settle(page);
  await clickText(page, '.panel.right button.opt', 'Preserve');
  await settle(page);
  await page.keyboard.press('3');
  await settle(page);
  await sleep(2500);
  d = await bj(page, () => window.__bj.decisions);
  assert(d['oak.renovation'] === 'preserve', 'preserve recorded');
  const all = (await toasts(page)).join(' | ');
  ctx.notes.toasts = all.slice(0, 300);
  assert((await save(page)).onboardingDone === true, 'onboarding completes once a route exists');
  await shot(page, 'onboarding-done');
  // undo / reset / undo
  await page.keyboard.press('Control+z');
  await settle(page);
  d = await bj(page, () => window.__bj.decisions);
  assert(!('oak.renovation' in d) && d['oak.plant'] === 'yard', `undo removed the last change (${JSON.stringify(d)})`);
  await clickText(page, '.panel.left button', 'Reset');
  await settle(page);
  assert(Object.keys(await bj(page, () => window.__bj.decisions)).length === 0, 'reset clears the plan');
  await clickText(page, '.panel.left button', 'Undo');
  await settle(page);
  assert((await bj(page, () => window.__bj.decisions))['oak.plant'] === 'yard', 'reset can be undone');
});

// ------------------------------------------------------------------------------------------------
await test('save-and-reload', async (ctx) => {
  const page = await ctx.open(BASE, { width: 1100, height: 700, storage: seededSave() });
  await bj(page, () => window.__bj.loadPlan('c1', { 'drain.route': 'creek', 'drain.renovation': 'hatch' }));
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'window.__bj && window.__bj.ready && window.__bj.mode === "planning"', 120000);
  const d = await bj(page, () => window.__bj.decisions);
  assert(d['drain.route'] === 'creek' && d['drain.renovation'] === 'hatch', `plan restored (${JSON.stringify(d)})`);
  const items = await page.$$eval('.tl-list li', (els) => els.map((e) => e.textContent));
  assert(items.length === 2, `timeline lists both changes (${items})`);
  // a corrupted save falls back to defaults instead of crashing
  await bj(page, () => localStorage.setItem('butterfly-job.save.v1', '{"v":1,"current":"c9","unlocked":"nope","plans":{"c1":{"oak.plant":"moon"}},"settings":{"volume":"loud"}}'));
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'window.__bj && window.__bj.ready', 120000);
  await sleep(1500);
  assert((await bj(page, () => window.__bj.contract)) === 'c1', 'bad contract falls back to c1');
  assert(Object.keys(await bj(page, () => window.__bj.decisions)).length === 0, 'invalid plan entries dropped');
});

// ------------------------------------------------------------------------------------------------
await test('plan-links', async (ctx) => {
  const saved = { 'alley.fate': 'kept' };
  const storage = seededSave({ plans: { c1: saved } });
  // valid link
  let page = await ctx.open(`${BASE}#plan=1.c1.Oy-Pk`, { width: 1000, height: 640, storage });
  await waitFor(page, "[...document.querySelectorAll('.toast')].length > 0", 15000);
  let d = await bj(page, () => window.__bj.decisions);
  assert(d['oak.plant'] === 'yard' && d['oak.renovation'] === 'preserve' && !d['alley.fate'], `link plan loaded (${JSON.stringify(d)})`);
  assert(!page.url().includes('#plan'), 'hash cleared after loading');
  assert((await toasts(page)).some((t) => t.includes('Plan loaded from link')), 'confirmation toast');
  // the copy-link button produces a link that decodes to the same plan
  const link = await bj(page, () => window.__bj.planLink('c1', window.__bj.decisions));
  assert(link.endsWith('#plan=1.c1.Oy-Pk'), `plan link format (${link})`);
  // hashchange while playing
  await bj(page, () => (location.hash = '#plan=1.c1.Dc-Hh'));
  await sleep(1500);
  d = await bj(page, () => window.__bj.decisions);
  assert(d['drain.route'] === 'creek' && d['drain.renovation'] === 'hatch', 'hashchange loads the new plan');
  // malformed links: rejected with a message, the saved plan stays, nothing crashes
  const bad = ['garbage', '1.c1.ZZ', '1.c1.Oy-Oy', '2.c1.Oy', '1.c7.Oy', '%E0%A4%A', 'x'.repeat(400), '1.c1.Oy-Dc-Wk-Pk-Hh-Vv-Ak-Sa-Gs', '1.c1.', '<script>alert(1)</script>'];
  const outcomes = {};
  for (const b of bad) {
    page = await ctx.open(`${BASE}#plan=${b}`, { width: 900, height: 600, storage });
    await waitFor(page, "[...document.querySelectorAll('.toast')].length > 0", 15000).catch(() => {});
    const t = (await toasts(page)).join(' ');
    d = await bj(page, () => window.__bj.decisions);
    assert(t.includes('could not be read'), `malformed link "${b.slice(0, 20)}" reported (toasts: ${t})`);
    assert(JSON.stringify(d) === JSON.stringify(saved), `saved plan untouched for "${b.slice(0, 20)}" (${JSON.stringify(d)})`);
    assert((await mode(page)) === 'planning', 'still planning');
    outcomes[b.slice(0, 16)] = 'rejected';
    await page.context().close();
  }
  ctx.notes.malformed = Object.keys(outcomes).length;
  // a locked contract
  page = await ctx.open(`${BASE}#plan=1.c3.Ww`, { width: 900, height: 600, storage });
  await waitFor(page, "[...document.querySelectorAll('.toast')].length > 0", 15000);
  assert((await toasts(page)).some((t) => t.includes('not unlocked')), 'locked contract link reported');
  assert((await bj(page, () => window.__bj.contract)) === 'c1', 'stays on the unlocked contract');
});

// ------------------------------------------------------------------------------------------------
const SOLUTION_IDS = ['c1-roof', 'c1-sewer', 'c1-alley', 'c1-canopy', 'c2-skylight', 'c2-sewer-power', 'c2-alley-power', 'c3-roof-power', 'c3-alley-power'];
await test('reference-solutions', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 960, height: 600, storage: seededSave({ settings: { quality: 'low' } }) });
  const table = {};
  for (const id of SOLUTION_IDS) {
    const r = await bj(page, (s) => window.__bj.playSolution(s, 16), id);
    assert(r.ok, `${id}: could not start (${r.error})`);
    await waitFor(page, 'window.__bj.mode !== "heist"', 300000);
    const h = await bj(page, () => window.__bj.heist());
    assert(h.status === 'escaped', `${id}: ended ${h.status}`);
    assert(h.detections === r.expected.detections, `${id}: ${h.detections} detections, offline run had ${r.expected.detections}`);
    assert(Math.abs(h.t - r.expected.t) < 0.02, `${id}: finished at ${h.t.toFixed(2)} s, offline run at ${r.expected.t}`);
    await bj(page, () => window.__bj.skip());
    await waitFor(page, 'window.__bj.mode === "results"', 120000);
    const text = await page.$eval('.dialog', (e) => e.textContent);
    assert(text.includes('JOB DONE'), `${id}: results screen`);
    table[id] = `${h.t.toFixed(1)}s, ${h.detections} spotted`;
  }
  await shot(page, 'results');
  const s = await save(page);
  assert(s.completed.c1 && s.completed.c2 && s.completed.c3, 'all three contracts recorded as completed');
  assert(s.unlocked.includes('c3'), 'contract 3 unlocked by play');
  ctx.notes.solutions = table;
  ctx.notes.approachesC1 = s.approaches.c1;
});

// ------------------------------------------------------------------------------------------------
await test('caught-and-retry', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 1100, height: 700, storage: seededSave() });
  await clickText(page, 'button.start', 'START THE JOB');
  await waitFor(page, 'window.__bj.mode === "heist"');
  await sleep(1500);
  // walk straight across the watched square toward the bank's front door
  assert(await bj(page, () => window.__bj.move('G', 15, 11)), 'move accepted');
  await bj(page, () => window.__bj.setTimeScale(4));
  await waitFor(page, 'window.__bj.mode === "failed"', 180000);
  await waitFor(page, "document.querySelector('.dialog h2')?.textContent === 'CAUGHT'", 20000);
  const body = await page.$eval('.dialog', (e) => e.textContent);
  ctx.notes.cause = body.replace(/\s+/g, ' ').slice(0, 160);
  assert(/caught you after/.test(body), 'failure names who caught the thief and when');
  await shot(page, 'caught');
  await clickText(page, '.dialog button', 'Retry');
  await waitFor(page, 'window.__bj.mode === "heist"');
  const h = await bj(page, () => window.__bj.heist());
  assert(h.t < 2 && h.detections === 0, `retry restarts the heist (${JSON.stringify(h)})`);
  await page.keyboard.press('Escape');
  await waitFor(page, 'window.__bj.mode === "paused"');
  const t1 = (await bj(page, () => window.__bj.heist())).t;
  await sleep(1500);
  assert((await bj(page, () => window.__bj.heist())).t === t1, 'time stands still while paused');
  await clickText(page, '.dialog button', 'Back to planning');
  await waitFor(page, 'window.__bj.mode === "planning"');
});

// ------------------------------------------------------------------------------------------------
await test('conditions-and-practice', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 1100, height: 700, storage: seededSave({ unlocked: ['c1', 'c2', 'c3'], current: 'c3' }) });
  await bj(page, () => window.__bj.loadPlan('c3', { 'drain.route': 'creek', 'drain.renovation': 'hatch' }));
  await settle(page);
  await clickText(page, 'button.start', 'START THE JOB');
  await waitFor(page, "document.querySelector('.dialog h2')?.textContent === 'CONDITIONS NOT MET'");
  const text = await page.$eval('.dialog', (e) => e.textContent);
  assert(text.includes('Café Kopp'), `the flooded café is named (${text.slice(0, 200)})`);
  await clickText(page, '.dialog button', 'practice');
  await waitFor(page, 'window.__bj.mode === "heist"');
  await sleep(800);
  assert((await page.$eval('.heist-info', (e) => e.textContent)).toLowerCase().includes('practice'), 'practice run is labelled');
});

// ------------------------------------------------------------------------------------------------
await test('heist-mouse-and-keys', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 1100, height: 700, storage: seededSave({ plans: { c1: { 'oak.plant': 'yard', 'oak.renovation': 'preserve' } } }) });
  await clickText(page, 'button.start', 'START THE JOB');
  await waitFor(page, 'window.__bj.mode === "heist"');
  await sleep(2500); // camera settles on the thief
  const from = (await bj(page, () => window.__bj.heist())).tile;
  const p = await bj(page, () => window.__bj.screenOfTile('G', 5, 20));
  await page.mouse.move(p.x, p.y);
  await sleep(400);
  const cls = await page.$eval('.stage', (e) => e.className);
  assert(cls.includes('walk'), `hovering a reachable tile shows the walk cursor (${cls})`);
  await page.mouse.click(p.x, p.y);
  await waitFor(page, `(() => { const t = window.__bj.heist().tile; return t.x !== ${from.x} || t.z !== ${from.z}; })()`, 60000);
  // hold Space: the thief waits in place while time runs
  await page.keyboard.down('Space');
  await sleep(300);
  const a = await bj(page, () => window.__bj.heist());
  await sleep(2000);
  const b = await bj(page, () => window.__bj.heist());
  await page.keyboard.up('Space');
  assert(b.t > a.t && a.tile.x === b.tile.x && a.tile.z === b.tile.z, `space holds position (${JSON.stringify([a, b])})`);
  await waitFor(page, "(() => { const t = window.__bj.heist().tile; return t.x === 5 && t.z === 20; })()", 60000);
  // clicking an unreachable tile (inside the locked bank office) is refused with a message
  const q = await bj(page, () => window.__bj.screenOfTile('G', 16, 3));
  await page.mouse.click(q.x, q.y);
  await sleep(600);
  ctx.notes.refusal = (await toasts(page)).slice(0, 2);
});

// ------------------------------------------------------------------------------------------------
await test('contracts-hints-settings-audio', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 1200, height: 740, storage: seededSave({ unlocked: ['c1', 'c2'] }) });
  // audio starts with the first gesture
  assert((await bj(page, () => window.__bj.audio())) === 'none', 'no audio before a gesture');
  await clickText(page, '.topbar button', 'Hint');
  await sleep(300);
  assert(['running', 'suspended'].includes(await bj(page, () => window.__bj.audio())), 'audio context created on first press');
  ctx.notes.audio = await bj(page, () => window.__bj.audio());
  for (let i = 0; i < 3; i++) await clickText(page, '.dialog button', i === 0 ? 'Show a hint' : 'more specific');
  assert((await page.$$('.dialog ol li')).length === 3, 'three hint levels');
  assert((await save(page)).hintLevel.c1 === 3, 'hint level saved');
  await clickText(page, '.dialog button', 'Close');
  // contracts
  await clickText(page, '.topbar button', 'Contracts');
  const items = await page.$$eval('.contract-item', (els) => els.map((e) => ({ t: e.textContent, disabled: e.disabled })));
  assert(items.length === 3 && items[2].disabled && !items[1].disabled, `contract list (${JSON.stringify(items)})`);
  await clickText(page, '.contract-item', 'Glass Diamond');
  await waitFor(page, "document.querySelector('.dialog .stamp')?.textContent === 'NEW JOB'");
  await clickText(page, '.dialog button', 'Open the case file');
  assert((await bj(page, () => window.__bj.contract)) === 'c2', 'switched to contract 2');
  assert((await page.$eval('.topbar .goal', (e) => e.textContent)).length > 10, 'objective shown');
  // settings: quality, reduced motion, mute
  await clickText(page, '.topbar button', 'Settings');
  for (const q of ['low', 'high', 'medium']) {
    await page.selectOption('.dialog select', q);
    await sleep(700);
    assert((await bj(page, () => window.__bj.debug().quality)) === q, `quality ${q}`);
  }
  const boxes = await page.$$('.dialog input[type=checkbox]');
  // [mute, reduced motion, fps]
  await boxes[1].check();
  await clickText(page, '.dialog button', 'Close');
  await bj(page, () => window.__bj.setEra(1946));
  await sleep(50);
  assert((await bj(page, () => window.__bj.transitioning)) === false, 'reduced motion: era changes are instant');
  assert((await save(page)).settings.reducedMotion === true, 'reduced motion saved');
});

// ------------------------------------------------------------------------------------------------
await test('errors-tabs-and-queue', async (ctx) => {
  // a model that fails to load: a readable message and a reload button, no hang
  const { page: p1, context: c1, log: l1 } = await openPage(browser, `${BASE}?nointro`, { width: 900, height: 600, storage: seededSave(), route: ['**/models/bank.glb', 'abort'] });
  ctx.contexts.push(c1);
  await waitFor(p1, "document.querySelector('.loading .error') !== null", 60000);
  const msg = await p1.$eval('.loading .error', (e) => e.textContent);
  assert(msg.includes('failed to load') && msg.includes('bank'), `asset error message (${msg})`);
  assert((await p1.$$('.loading button')).length === 1, 'reload button offered');
  ctx.notes.assetError = msg;
  // expected noise from the deliberately failed request only
  const unexpected = l1.filter((l) => !/bank\.glb|Failed to load|ERR_FAILED|AssetError/.test(l));
  assert(unexpected.length === 0, `unexpected console output: ${unexpected.join(' | ')}`);
  // no WebGL at all
  const { page: p2, context: c2 } = await openPage(browser, `${BASE}?nointro`, { width: 900, height: 600, storage: seededSave(), noWebGL: true });
  ctx.contexts.push(c2);
  await waitFor(p2, "document.querySelector('.loading .error') !== null", 30000);
  assert((await p2.$eval('.loading .error', (e) => e.textContent)).includes('WebGL'), 'WebGL message');
  // hiding the tab pauses a heist
  const page = await ctx.open(`${BASE}?nointro`, { width: 1000, height: 640, storage: seededSave() });
  await bj(page, () => window.__bj.start(true));
  await waitFor(page, 'window.__bj.mode === "heist"');
  await sleep(800);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(page, 'window.__bj.mode === "paused"', 5000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await clickText(page, '.dialog button', 'Back to planning');
  await waitFor(page, 'window.__bj.mode === "planning"');
  await settle(page);
  // era requests during a transition are held and the last one wins
  await page.keyboard.press('1');
  await sleep(60);
  const busy = await bj(page, () => window.__bj.transitioning);
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await page.keyboard.press('2');
  await settle(page);
  await sleep(300);
  await settle(page);
  assert((await bj(page, () => window.__bj.era)) === 1986, 'the last era asked for is shown');
  ctx.notes.queuedWhileBusy = busy;
});

// ------------------------------------------------------------------------------------------------
await test('window-sizes', async (ctx) => {
  const sizes = [[1920, 1080], [1366, 768], [1280, 720], [1024, 640], [800, 600], [390, 844]];
  const page = await ctx.open(`${BASE}?nointro`, { width: 1280, height: 720, storage: seededSave() });
  const seen = {};
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(1200);
    const m = await page.evaluate(() => {
      const r = (sel) => {
        const e = document.querySelector(sel);
        if (!e || e.offsetParent === null) return null;
        const b = e.getBoundingClientRect();
        return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)];
      };
      const c = document.querySelector('canvas').getBoundingClientRect();
      return { canvas: [Math.round(c.width), Math.round(c.height)], start: r('button.start'), eras: r('.eras'), left: r('.panel.left'), scrollW: document.documentElement.scrollWidth };
    });
    assert(m.canvas[0] === w && m.canvas[1] === h, `${w}x${h}: canvas ${m.canvas}`);
    for (const k of ['start', 'eras']) {
      const b = m[k];
      assert(b && b[0] >= 0 && b[1] >= 0 && b[2] <= w && b[3] <= h, `${w}x${h}: ${k} inside the window (${b})`);
    }
    assert(m.scrollW <= w, `${w}x${h}: no horizontal scroll`);
    seen[`${w}x${h}`] = 'ok';
    await shot(page, `size-${w}x${h}`);
  }
  ctx.notes.sizes = Object.keys(seen);
});

// ------------------------------------------------------------------------------------------------
await test('stress-and-resources', async (ctx) => {
  const page = await ctx.open(`${BASE}?nointro`, { width: 960, height: 600, storage: seededSave({ unlocked: ['c1', 'c2', 'c3'], plans: { c1: { 'oak.plant': 'yard', 'oak.renovation': 'preserve' } } }) });
  await sleep(1500);
  // warm-up: GPU counters only include what has been drawn at least once, so visit every era,
  // the compare/underground views and a heist before taking the baseline
  const eras = [1946, 1986, 2026];
  for (const e of eras) {
    await bj(page, (x) => window.__bj.setEra(x), e);
    await settle(page);
  }
  for (const t of ['compare', 'underground']) {
    await bj(page, (x) => window.__bj.toggle(x, true), t);
    await sleep(600);
    await bj(page, (x) => window.__bj.toggle(x, false), t);
  }
  await bj(page, () => window.__bj.start(true));
  await waitFor(page, 'window.__bj.mode === "heist"');
  await sleep(1500);
  await page.keyboard.press('Escape');
  await waitFor(page, 'window.__bj.mode === "paused"');
  await clickText(page, '.dialog button', 'Back to planning');
  await waitFor(page, 'window.__bj.mode === "planning"');
  await settle(page);
  await sleep(1500);
  const m0 = await bj(page, () => window.__bj.memory());
  for (let i = 0; i < 24; i++) {
    await bj(page, (e) => window.__bj.setEra(e), eras[i % 3]);
    await sleep(120); // switch again mid-transition half of the time
    if (i % 2) await settle(page);
  }
  await settle(page);
  await bj(page, () => window.__bj.setEra(2026));
  await settle(page);
  await sleep(1500);
  const m1 = await bj(page, () => window.__bj.memory());
  for (let i = 0; i < 6; i++) {
    await bj(page, () => window.__bj.start(true));
    await waitFor(page, 'window.__bj.mode === "heist"');
    await sleep(700);
    await page.keyboard.press('Escape');
    await waitFor(page, 'window.__bj.mode === "paused"');
    await clickText(page, '.dialog button', 'Back to planning');
    await waitFor(page, 'window.__bj.mode === "planning"');
    await bj(page, (c) => window.__bj.switchContract(c), ['c2', 'c3', 'c1'][i % 3]);
    await sleep(500);
    await page.keyboard.press('Escape'); // dismiss the brief
    await settle(page);
  }
  await sleep(1500);
  const m2 = await bj(page, () => window.__bj.memory());
  ctx.notes.memory = { start: m0, afterEraSwitches: m1, afterRestarts: m2 };
  assert(m2.geometries <= m0.geometries + 12, `geometries grew from ${m0.geometries} to ${m2.geometries}`);
  assert(m2.textures <= m0.textures + 2, `textures grew from ${m0.textures} to ${m2.textures}`);
  assert(m2.programs <= m0.programs + 6, `shader programs grew from ${m0.programs} to ${m2.programs}`);
});

// ------------------------------------------------------------------------------------------------
await test('frame-rate-sample', async (ctx) => {
  // Headless Chromium renders WebGL on the CPU (SwiftShader); these numbers describe this test
  // machine only and say nothing about a GPU-equipped browser.
  const out = {};
  for (const q of ['low', 'medium']) {
    const page = await ctx.open(`${BASE}?nointro`, { width: 1280, height: 720, storage: seededSave({ settings: { quality: q, showFps: true } }) });
    await sleep(4000);
    const a = await bj(page, () => window.__bj.debug());
    await sleep(4000);
    const b = await bj(page, () => window.__bj.debug());
    out[`planning-${q}`] = { fps: +((a.fps + b.fps) / 2).toFixed(1), drawCalls: b.calls, triangles: b.triangles };
    await page.context().close();
  }
  ctx.notes.fps = out;
});

// ------------------------------------------------------------------------------------------------
await browser.close();
fs.writeFileSync(`${OUT}report.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
