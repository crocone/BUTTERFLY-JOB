import { describe, expect, it } from 'vitest';
import { CONTRACTS, CONTRACT_BY_ID } from '../src/data/contracts';
import { INTERVENTIONS } from '../src/data/interventions';
import { computeTimeline, effectiveDecisions, factsSignature, type Decisions } from '../src/sim/causality';
import { presentWorld } from '../src/sim/heist';
import { buildGrid, isWalkable } from '../src/sim/layout';
import { findPath, isPathFailure, reachable, type DoorPolicy } from '../src/sim/nav';
import { canSee, defaultEdgeBlocks, type SightContext } from '../src/sim/vision';
import type { TileRef } from '../src/sim/types';

function validPlans(): Decisions[] {
  let sets: Array<Record<string, string>> = [{}];
  for (const def of INTERVENTIONS) {
    const next: Array<Record<string, string>> = [];
    for (const s of sets) for (const o of def.options) next.push(o.id === def.options[0].id ? { ...s } : { ...s, [def.id]: o.id });
    sets = next;
  }
  const seen = new Set<string>();
  return sets
    .map((s) => effectiveDecisions(s))
    .filter((s) => {
      const k = JSON.stringify(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const START: TileRef = { level: 'G', x: 1, z: 20 };
const ARCHIVE: TileRef = { level: 'B', x: 13, z: 2 };

/** policy: service doors usable (from outside when a delivery props them open) */
const withService: DoorPolicy = (d) => (d.kind === 'locked' || d.kind === 'glass' || d.kind === 'vault' ? 'block' : 'pass');
/** policy: no service doors from outside */
const noService: DoorPolicy = (d, from) => {
  if (d.kind === 'service') return d.inside && d.inside[0] === from.x && d.inside[1] === from.z ? 'pass' : 'block';
  return withService(d, from, from);
};

describe('layout expansion', () => {
  it('builds a consistent grid and guard routes for every valid plan in every contract', () => {
    const plans = validPlans();
    expect(plans.length).toBeGreaterThan(100);
    for (const p of plans) {
      const facts = computeTimeline(p).facts;
      const g = buildGrid(facts, factsSignature(facts));
      expect(isWalkable(g, START)).toBe(true);
      for (const c of CONTRACTS) {
        const w = presentWorld(c, facts); // throws if a patrol route is broken
        expect(w.routes).toHaveLength(2);
        expect(isWalkable(g, w.target)).toBe(true);
      }
    }
  });

  it('the untouched timeline only lets you in through the watched front service door', () => {
    const g = buildGrid(computeTimeline({}).facts);
    expect(reachable(g, START, noService).has('B:13,2')).toBe(false);
    expect(reachable(g, START, withService).has('B:13,2')).toBe(true);
  });

  it('each route family physically reaches the archive', () => {
    const roof = buildGrid(computeTimeline({ 'oak.plant': 'yard', 'oak.renovation': 'preserve' }).facts);
    const sewer = buildGrid(computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch' }).facts);
    const alley = buildGrid(computeTimeline({ 'alley.fate': 'kept', 'service.door': 'alley' }).facts);
    for (const g of [roof, sewer]) {
      const r = findPath(g, START, ARCHIVE, { doorPolicy: noService });
      expect(isPathFailure(r)).toBe(false);
    }
    const viaAlley = findPath(alley, START, ARCHIVE, { doorPolicy: withService });
    expect(isPathFailure(viaAlley)).toBe(false);
    if (!isPathFailure(viaAlley)) expect(viaAlley.steps.some((s) => s.door?.id === 'door.bank.service_alley')).toBe(true);
    // the roof route really climbs the oak, the sewer route really uses the hatch
    const r1 = findPath(roof, START, ARCHIVE, { doorPolicy: noService });
    const r2 = findPath(sewer, START, ARCHIVE, { doorPolicy: noService });
    if (!isPathFailure(r1)) expect(r1.steps.some((s) => s.portal?.id === 'portal.oak')).toBe(true);
    if (!isPathFailure(r2)) expect(r2.steps.some((s) => s.portal?.id === 'portal.hatch')).toBe(true);
  });

  it('half-done plans do not open a route', () => {
    const halfPlans: Decisions[] = [{ 'oak.plant': 'yard' }, { 'drain.route': 'creek' }, { 'alley.fate': 'kept' }, { 'oak.plant': 'square' }];
    for (const p of halfPlans) {
      const g = buildGrid(computeTimeline(p).facts);
      expect(reachable(g, START, noService).has('B:13,2')).toBe(false);
    }
  });

  it('diagonal steps never cut through wall corners or doors', () => {
    const g = buildGrid(computeTimeline({ 'alley.fate': 'kept', 'service.door': 'alley' }).facts);
    const r = findPath(g, { level: 'G', x: 10, z: 8 }, { level: 'G', x: 11, z: 6 }, { doorPolicy: withService });
    expect(isPathFailure(r)).toBe(false);
    if (!isPathFailure(r)) {
      const doorStep = r.steps.findIndex((s) => s.door);
      expect(doorStep).toBeGreaterThan(0);
      const a = r.steps[doorStep - 1];
      const b = r.steps[doorStep];
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it('closed doors explain unreachable destinations', () => {
    const w = presentWorld(CONTRACT_BY_ID.get('c3')!, computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch' }).facts);
    const r = findPath(w.grid, { level: 'B', x: 18, z: 6 }, { level: 'B', x: 20, z: 3 }, { doorPolicy: (d) => (d.kind === 'vault' ? 'block' : 'pass') });
    expect(isPathFailure(r)).toBe(true);
    if (isPathFailure(r)) {
      expect(r.reason).toBe('blocked-door');
      expect(r.door?.id).toBe('door.bank.vault');
    }
  });

  it('the Glass Room laser can be bypassed through the skylight (reached via the roof door)', () => {
    const w = presentWorld(CONTRACT_BY_ID.get('c2')!, computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch' }).facts);
    const r = findPath(w.grid, { level: 'U', x: 16, z: 6 }, { level: 'U', x: 15, z: 3 }, { doorPolicy: (d) => (d.kind === 'glass' ? 'block' : 'pass') });
    expect(isPathFailure(r)).toBe(false);
    if (!isPathFailure(r)) expect(r.steps.some((s) => s.portal?.id === 'portal.skylight')).toBe(true);
  });
});

describe('vision', () => {
  const facts = computeTimeline({ 'oak.plant': 'yard', 'oak.renovation': 'preserve' }).facts;
  const g = buildGrid(facts);
  const ctx: SightContext = { grid: g, edgeBlocks: defaultEdgeBlocks };
  const deg = Math.PI / 180;

  it('does not see through walls', () => {
    // guard in the lobby looking west at the service corridor wall; thief in the stairwell
    const obs = { level: 'G' as const, x: 14.5, z: 5.5, yaw: 180 * deg, fov: 120 * deg, range: 10 };
    expect(canSee(ctx, obs, 'G', 12.5, 3.5).visible).toBe(false);
    // through the open doorway on the same line of sight: visible
    const obs2 = { level: 'G' as const, x: 13.5, z: 7.5, yaw: 180 * deg, fov: 90 * deg, range: 10 };
    expect(canSee(ctx, obs2, 'G', 11.5, 7.5).visible).toBe(true);
  });

  it('does not see between floors', () => {
    const obs = { level: 'G' as const, x: 26.5, z: 6.5, yaw: 180 * deg, fov: 180 * deg, range: 10 };
    expect(canSee(ctx, obs, 'U', 22.5, 6.5).visible).toBe(false);
    expect(canSee(ctx, obs, 'G', 22.5, 6.5).visible).toBe(false); // annex interior is solid
  });

  it('respects field of view and range', () => {
    const obs = { level: 'G' as const, x: 12.5, z: 14.5, yaw: 0, fov: 90 * deg, range: 5 };
    expect(canSee(ctx, obs, 'G', 16.5, 14.5).visible).toBe(true);
    expect(canSee(ctx, obs, 'G', 8.5 + 3, 18.5).visible).toBe(false); // behind-ish / outside FOV
    expect(canSee(ctx, obs, 'G', 19.5, 14.5).visible).toBe(false); // too far
  });

  it('the preserved yard canopy hides the climbing spot from the yard camera', () => {
    const cam = { level: 'G' as const, x: 28.5, z: 2.5, yaw: 135 * deg, fov: 120 * deg, range: 9 };
    expect(canSee(ctx, cam, 'G', 25.5, 5.5).visible).toBe(false);
    const bare = buildGrid(computeTimeline({}).facts);
    expect(canSee({ grid: bare, edgeBlocks: defaultEdgeBlocks }, cam, 'G', 25.5, 5.5).visible).toBe(true);
  });

  it('the preserved square canopy hides the front service door from C5; the bare square does not', () => {
    const cam = { level: 'G' as const, x: 15.5, z: 17.5, yaw: 270 * deg, fov: 80 * deg, range: 9 };
    const canopy = buildGrid(computeTimeline({ 'oak.plant': 'square', 'oak.renovation': 'preserve' }).facts);
    const bare = buildGrid(computeTimeline({}).facts);
    const pruned = buildGrid(computeTimeline({ 'oak.plant': 'square' }).facts);
    expect(canSee({ grid: canopy, edgeBlocks: defaultEdgeBlocks }, cam, 'G', 12.5, 10.5).visible).toBe(false);
    expect(canSee({ grid: bare, edgeBlocks: defaultEdgeBlocks }, cam, 'G', 12.5, 10.5).visible).toBe(true);
    expect(canSee({ grid: pruned, edgeBlocks: defaultEdgeBlocks }, cam, 'G', 12.5, 10.5).visible).toBe(true);
  });

  it('garden fence does not block sight but blocks movement', () => {
    const obs = { level: 'G' as const, x: 20.5, z: 12.5, yaw: 0, fov: 90 * deg, range: 6 };
    expect(canSee(ctx, obs, 'G', 23.5, 12.5).visible).toBe(true);
    const r = findPath(g, { level: 'G', x: 21, z: 12 }, { level: 'G', x: 22, z: 12 }, { doorPolicy: () => 'pass' });
    expect(isPathFailure(r)).toBe(false);
    if (!isPathFailure(r)) expect(r.steps.length).toBeGreaterThan(2); // detour through the gate
  });
});
