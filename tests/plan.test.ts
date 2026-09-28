import { describe, expect, it } from 'vitest';
import { PlanHistory, planCost, setDecision } from '../src/sim/plan';

describe('plan budget', () => {
  it('counts only active deviations and refunds on undo', () => {
    let r = setDecision({}, 'oak.plant', 'yard', 5);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(1);
    r = setDecision(r.decisions, 'oak.renovation', 'preserve', 5);
    expect(r.cost).toBe(2);
    // choosing the original option again is an undo of that decision → refund
    r = setDecision(r.decisions, 'oak.renovation', 'prune', 5);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(1);
    expect(planCost({})).toBe(0);
  });

  it('rejects changes over budget without altering the plan', () => {
    let d = setDecision({}, 'oak.plant', 'yard', 3).decisions;
    d = setDecision(d, 'oak.renovation', 'preserve', 3).decisions;
    d = setDecision(d, 'alarm.wiring', 'workshop', 3).decisions;
    const over = setDecision(d, 'alley.fate', 'kept', 3);
    expect(over.ok).toBe(false);
    expect(over.error).toBe('budget');
    expect(over.decisions).toEqual(d);
  });

  it('rejects decisions with unmet prerequisites and explains which', () => {
    const r = setDecision({}, 'drain.renovation', 'hatch', 5);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('prereq');
    expect(r.blockedBy).toEqual([['drain.route', '==', 'creek']]);
  });

  it('removes dependent decisions when a prerequisite is withdrawn, and undo restores them', () => {
    const hist = new PlanHistory();
    let d = setDecision({}, 'drain.route', 'creek', 5).decisions;
    d = setDecision(d, 'drain.renovation', 'hatch', 5).decisions;
    d = setDecision(d, 'cafe.valve', 'valve', 5).decisions;
    expect(planCost(d)).toBe(3);
    hist.push(d);
    const r = setDecision(d, 'drain.route', 'street', 5);
    expect(r.ok).toBe(true);
    expect(r.decisions).toEqual({});
    expect(r.removed.map((x) => x.id).sort()).toEqual(['cafe.valve', 'drain.renovation']);
    expect(r.removed[0].reasons[0][0]).toBe('drain.route');
    expect(r.cost).toBe(0);
    const restored = hist.pop()!;
    expect(restored).toEqual(d);
    expect(planCost(restored)).toBe(3);
  });

  it('unknown interventions/options are rejected safely', () => {
    expect(setDecision({}, 'nope', 'x', 5).ok).toBe(false);
    expect(setDecision({}, 'oak.plant', 'moon', 5).ok).toBe(false);
  });
});
