import { describe, expect, it } from 'vitest';
import { CONTRACT_BY_ID } from '../src/data/contracts';
import { computeTimeline } from '../src/sim/causality';
import { presentWorld } from '../src/sim/heist';
import { planCost } from '../src/sim/plan';
import { solveScript, type ScriptStep } from '../src/sim/script';
import { SOLUTIONS } from '../src/sim/solutions';

/**
 * Every designed solution must work through the real simulation (actual geometry, doors,
 * guards, cameras, deliveries): the solver only chooses *when* to move, never *where*.
 */
describe('reference solutions escape unseen', () => {
  for (const s of SOLUTIONS) {
    it(`${s.id} (${s.family})`, () => {
      const contract = CONTRACT_BY_ID.get(s.contract)!;
      expect(planCost(s.plan)).toBeLessThanOrEqual(contract.budget);
      const world = presentWorld(contract, computeTimeline(s.plan).facts);
      const run = solveScript(world, s.steps, { step: 0.5 });
      expect(run.reason).toBe('ok');
      expect(run.sim.status).toBe('escaped');
      expect(run.sim.carrying).toBe(true);
      expect(run.sim.detections).toBe(0);
      // the route family really was used
      const fam = run.sim.approach();
      for (const f of s.family.split('+')) expect(fam).toContain(f);
    }, 180000);
  }

  it('contract 1 has at least three distinct families plus a combined solution', () => {
    const fams = new Set(SOLUTIONS.filter((s) => s.contract === 'c1').map((s) => s.family));
    expect(fams.has('rooftop') && fams.has('underground') && fams.has('service')).toBe(true);
    expect([...fams].some((f) => f.includes('+'))).toBe(true);
  });
});

describe('the untouched timeline cannot be robbed', () => {
  it('rushing the watched front service door gets the thief caught, however it is timed', () => {
    const W: ScriptStep = { safeWait: true, max: 60 };
    const steps: ScriptStep[] = [
      W, { move: ['G', 9, 19] },
      W, { move: ['G', 11, 13] },
      W, { move: ['G', 12, 9] },
      W, { move: ['G', 11, 4] },
      W, { move: ['B', 12, 4] },
      W, { interact: 'target' },
    ];
    const world = presentWorld(CONTRACT_BY_ID.get('c1')!, computeTimeline({}).facts);
    // even allowing the thief to be spotted many times, no timing avoids capture
    const run = solveScript(world, steps, { step: 0.5, allowDetections: 99, budget: 2500 });
    expect(run.ok).toBe(false);
  }, 180000);
});

describe('contract conditions separate clean and dirty solutions', () => {
  it('contract 3: the underground route floods the café and the fix breaks the budget', () => {
    const dirty = computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch', 'alarm.wiring': 'workshop' }).facts;
    expect(dirty['cafe.open']).toBe(false);
    expect(planCost({ 'drain.route': 'creek', 'drain.renovation': 'hatch', 'alarm.wiring': 'workshop', 'cafe.valve': 'valve' })).toBeGreaterThan(CONTRACT_BY_ID.get('c3')!.budget);
  });

  it('contract 3 reference solutions keep the garden and the café', () => {
    for (const s of SOLUTIONS.filter((x) => x.contract === 'c3')) {
      const f = computeTimeline(s.plan).facts;
      expect(f['garden.exists']).toBe(true);
      expect(f['cafe.open']).toBe(true);
    }
  });
});
