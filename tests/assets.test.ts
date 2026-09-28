import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import layout from '../src/data/layout.json';
import variants from '../src/data/variants.json';
import { visibleVariantSet } from '../src/render/variants';
import { computeTimeline } from '../src/sim/causality';

const ROOT = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/assets/manifest.json'), 'utf8'));
type Node = { node: string; role: string; variant?: string; anchor?: string; camera?: string; character?: string; position: number[] };
const nodes: Node[] = Object.values(manifest.assets).flatMap((a: any) => a.nodes);
const LEVEL_Y: Record<string, number> = { S: -3.6, B: -2.0, G: 0, U: 2.0, R: 4.1 };

describe('asset manifest ↔ game data', () => {
  it('every registered variant has Blender geometry and vice versa', () => {
    const registered = new Set(Object.keys((variants as any).variants));
    const exported = new Set(nodes.filter((n) => n.role === 'variant').map((n) => n.variant!));
    for (const v of registered) expect(exported, `variant ${v} missing from the .glb files`).toContain(v);
    for (const v of exported) expect(registered, `variant ${v} not registered`).toContain(v);
  });

  it('every .glb exists, was produced by Blender and is reasonably small', () => {
    for (const a of Object.values(manifest.assets) as any[]) {
      const f = resolve(ROOT, 'public', a.file);
      expect(existsSync(f), a.file).toBe(true);
      expect(statSync(f).size).toBe(a.stats.glb_bytes);
      expect(a.blender).toMatch(/^5\.0/);
      expect(existsSync(resolve(ROOT, a.source)), a.source).toBe(true);
      expect(statSync(f).size).toBeLessThan(1.5 * 1024 * 1024);
    }
  });

  it('door and portal anchors sit exactly where navigation expects them', () => {
    const anchors = new Map(nodes.filter((n) => n.role === 'anchor').map((n) => [n.anchor!, n.position]));
    const toWorld = (x: number, z: number, level: string) => [x - 15, LEVEL_Y[level], z - 11];
    for (const d of (layout as any).doors) {
      if (!d.id.startsWith('door.bank')) continue;
      const p = anchors.get(d.id);
      expect(p, `anchor for ${d.id}`).toBeDefined();
      const w = toWorld((d.a[0] + d.b[0]) / 2 + 0.5, (d.a[1] + d.b[1]) / 2 + 0.5, d.level);
      for (let i = 0; i < 3; i++) expect(p![i]).toBeCloseTo(w[i], 2);
    }
    for (const p of (layout as any).portals) {
      for (const k of ['a', 'b'] as const) {
        const end = p[k];
        const a = anchors.get(`${p.id}.${k}`);
        expect(a, `anchor for ${p.id}.${k}`).toBeDefined();
        const w = toWorld(end.x + 0.5, end.z + 0.5, end.level);
        for (let i = 0; i < 3; i++) expect(a![i]).toBeCloseTo(w[i], 2);
      }
    }
  });

  it('camera heads exist for every camera mount; characters and clips exist', () => {
    const cams = new Set(nodes.filter((n) => n.role === 'camera').map((n) => n.camera));
    for (const c of (layout as any).cameras) expect(cams).toContain(c.id);
    const chars = new Set(nodes.filter((n) => n.role === 'character').map((n) => n.character));
    for (const c of ['thief', 'guard', 'courier', 'gardener', 'worker']) expect(chars).toContain(c);
    expect(manifest.assets.characters.animations).toEqual(expect.arrayContaining(['idle', 'walk', 'climb', 'crouch', 'interact', 'sit']));
  });

  it('each era of each timeline shows exactly one oak state and one bank state', () => {
    const plans = [{}, { 'oak.plant': 'yard' }, { 'oak.plant': 'yard', 'oak.renovation': 'preserve' }, { 'oak.plant': 'square', 'oak.renovation': 'preserve' },
      { 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alley.fate': 'kept' }];
    for (const p of plans) {
      const f = computeTimeline(p).facts;
      for (const era of [1946, 1986, 2026] as const) {
        const vis = [...visibleVariantSet(era, f, 'c1')];
        const oaks = vis.filter((v) => v.startsWith('oak.'));
        expect(oaks.length, `${JSON.stringify(p)} ${era}: ${oaks}`).toBe(1);
        const banks = vis.filter((v) => v === 'bank.main' || v === 'bank.site1946');
        expect(banks.length).toBe(1);
        const cafes = vis.filter((v) => v === 'cafe.lot1946' || v === 'cafe.building');
        expect(cafes.length).toBe(1);
      }
    }
  });
});
