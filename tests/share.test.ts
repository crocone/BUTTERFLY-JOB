import { describe, expect, it } from 'vitest';
import { decodePlan, encodePlan, planFromHash, planUrl } from '../src/game/share';
import { defaultSave, loadSave, sanitize, writeSave } from '../src/game/save';

describe('plan links', () => {
  it('round-trips plans compactly', () => {
    const plan = { 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alarm.wiring': 'workshop' };
    const code = encodePlan('c3', plan);
    expect(code).toBe('1.c3.Oy-Ww-Pk');
    const back = decodePlan(code);
    expect(back).toEqual({ ok: true, contract: 'c3', decisions: plan, dropped: 0 });
    expect(encodePlan('c1', {})).toBe('1.c1.0');
    expect(decodePlan('1.c1.0')).toEqual({ ok: true, contract: 'c1', decisions: {}, dropped: 0 });
    const url = planUrl('https://x.test/game/#old', 'c1', { 'drain.route': 'creek' });
    expect(url).toBe('https://x.test/game/#plan=1.c1.Dc');
    expect(planFromHash('#plan=1.c1.Dc')).toMatchObject({ ok: true, decisions: { 'drain.route': 'creek' } });
  });

  it('rejects malformed links without throwing', () => {
    const bad = ['', 'garbage', '2.c1.Oy', '1.c9.Oy', '1.c1.Zz', '1.c1.O', '1.c1.Oy-Oy', '1.c1.Oy--Pk', '1.c1.Oy.Pk', '<script>', '1.c1.' + 'Oy-'.repeat(40),
      '%E0%A4%A', '1.c3.Oy-Pk-Ww-Ak']; // last: over contract 3's budget of 3
    for (const b of bad) {
      expect(() => decodePlan(b)).not.toThrow();
      expect(decodePlan(b).ok).toBe(false);
    }
    expect(planFromHash('#plan=%E0%A4%A')).toEqual({ ok: false, error: 'format' });
    expect(planFromHash('#nothing')).toBeNull();
  });

  it('drops decisions whose prerequisites are missing and reports it', () => {
    const r = decodePlan('1.c1.Pk-Hh');
    expect(r).toEqual({ ok: true, contract: 'c1', decisions: {}, dropped: 2 });
  });
});

describe('save data', () => {
  it('sanitizes garbage and keeps valid data', () => {
    expect(sanitize(null)).toEqual(defaultSave());
    expect(sanitize({ v: 2 })).toEqual(defaultSave());
    const s = sanitize({
      v: 1,
      current: 'c2',
      unlocked: ['c2', 'nope', 7],
      plans: { c1: { 'oak.plant': 'yard', 'oak.renovation': 'preserve' }, cX: {} },
      settings: { volume: 9, muted: true, quality: 'ultra', reducedMotion: true },
      hintLevel: { c1: 99 },
    });
    expect(s.current).toBe('c2');
    expect(s.unlocked).toEqual(['c1', 'c2']);
    expect(s.plans.c1).toEqual({ 'oak.plant': 'yard', 'oak.renovation': 'preserve' });
    expect(s.settings.volume).toBe(1);
    expect(s.settings.quality).toBe('medium');
    expect(s.hintLevel.c1).toBe(3);
  });

  it('restores what it writes (simulated page reload)', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    } as unknown as Storage;
    const d = defaultSave();
    d.unlocked = ['c1', 'c2'];
    d.current = 'c2';
    d.plans.c2 = { 'alarm.wiring': 'workshop' };
    writeSave(d, storage);
    const back = loadSave(storage);
    expect(back.current).toBe('c2');
    expect(back.plans.c2).toEqual({ 'alarm.wiring': 'workshop' });
    mem.set('butterfly-job.save.v1', '{broken json');
    expect(loadSave(storage)).toEqual(defaultSave());
  });
});
