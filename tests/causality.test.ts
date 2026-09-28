import { describe, expect, it } from 'vitest';
import { INTERVENTIONS, INTERVENTION_BY_ID } from '../src/data/interventions';
import {
  activeConsequences,
  computeTimeline,
  effectiveDecisions,
  factsSignature,
  originalTimeline,
  RULES,
  type Decisions,
} from '../src/sim/causality';

function allDecisionSets(): Decisions[] {
  // every combination of options (768), including invalid ones that must be filtered
  let sets: Array<Record<string, string>> = [{}];
  for (const def of INTERVENTIONS) {
    const next: Array<Record<string, string>> = [];
    for (const s of sets) for (const o of def.options) next.push(o.id === def.options[0].id ? { ...s } : { ...s, [def.id]: o.id });
    sets = next;
  }
  return sets;
}

describe('original timeline', () => {
  it('matches the designed baseline', () => {
    const f = originalTimeline().facts;
    expect(f['oak.location']).toBe('garden');
    expect(f['oak.roofAccess']).toBe(false);
    expect(f['bank.expansion']).toBe('alley');
    expect(f['garden.exists']).toBe(true);
    expect(f['cafe.state']).toBe('open');
    expect(f['service.door']).toBe('front');
    expect(f['drain.hatch']).toBe(false);
    expect(f['junction.box']).toBe('none');
    expect(f['roof.camera']).toBe(false);
    expect(activeConsequences(originalTimeline())).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('identical interventions always produce the same present, regardless of key order or repetition', () => {
    const d1 = { 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alley.fate': 'kept' };
    const d2 = { 'alley.fate': 'kept', 'oak.renovation': 'preserve', 'oak.plant': 'yard' };
    const sig = factsSignature(computeTimeline(d1).facts);
    for (let i = 0; i < 200; i++) {
      expect(factsSignature(computeTimeline(i % 2 ? d1 : d2).facts)).toBe(sig);
    }
  });

  it('recomputation never accumulates: computing other plans in between changes nothing', () => {
    const plan = { 'drain.route': 'creek', 'drain.renovation': 'hatch' };
    const before = factsSignature(computeTimeline(plan).facts);
    for (const d of allDecisionSets().slice(0, 300)) computeTimeline(d);
    expect(factsSignature(computeTimeline(plan).facts)).toBe(before);
    expect(factsSignature(computeTimeline({}).facts)).toBe(factsSignature(originalTimeline().facts));
  });

  it('every one of the 768 option combinations resolves without errors', () => {
    for (const d of allDecisionSets()) {
      const t = computeTimeline(d);
      for (const r of RULES) expect(t.facts[r.fact]).not.toBeUndefined();
    }
  });
});

describe('dependencies', () => {
  it('prerequisite graph is acyclic (topological order exists)', () => {
    const deps = new Map(INTERVENTIONS.map((d) => [d.id, (d.requires ?? []).map((p) => p[0])]));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`cycle through ${id}`);
      visiting.add(id);
      for (const dep of deps.get(id) ?? []) {
        expect(INTERVENTION_BY_ID.has(dep)).toBe(true);
        visit(dep);
      }
      visiting.delete(id);
      done.add(id);
    };
    for (const d of INTERVENTIONS) visit(d.id);
    // prerequisites only point to the same or an earlier era
    for (const d of INTERVENTIONS) for (const [dep] of d.requires ?? []) expect(INTERVENTION_BY_ID.get(dep)!.era).toBeLessThanOrEqual(d.era);
  });

  it('rules only read facts computed earlier (engine throws otherwise) — covered by computing all combos', () => {
    expect(() => computeTimeline({ 'oak.plant': 'square', 'oak.renovation': 'preserve' })).not.toThrow();
  });

  it('drops decisions whose prerequisites fail', () => {
    expect(effectiveDecisions({ 'oak.renovation': 'preserve' })).toEqual({});
    expect(effectiveDecisions({ 'drain.renovation': 'hatch', 'cafe.valve': 'valve' })).toEqual({});
    expect(effectiveDecisions({ 'service.door': 'alley' })).toEqual({});
    expect(effectiveDecisions({ 'oak.plant': 'garden' })).toEqual({});
    expect(effectiveDecisions({ 'oak.plant': 'bogus' })).toEqual({});
    expect(effectiveDecisions({ 'nope.nope': 'x' })).toEqual({});
  });
});

describe('route families', () => {
  it('rooftop: oak beside the yard only reaches the roof when preserved', () => {
    expect(computeTimeline({ 'oak.plant': 'yard' }).facts['oak.roofAccess']).toBe(false);
    expect(computeTimeline({ 'oak.plant': 'yard' }).facts['oak.pruned']).toBe(true);
    const t = computeTimeline({ 'oak.plant': 'yard', 'oak.renovation': 'preserve' });
    expect(t.facts['oak.roofAccess']).toBe(true);
    expect(t.facts['roof.camera']).toBe(true);
    expect(t.facts['car.spot']).toBe('lane');
    expect(t.causes['oak.roofAccess']).toEqual(['oak.plant', 'oak.renovation']);
  });

  it('underground: hatch needs the creek route and the 1986 renovation', () => {
    expect(computeTimeline({ 'drain.route': 'creek' }).facts['drain.hatch']).toBe(false);
    const t = computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch' });
    expect(t.facts['drain.hatch']).toBe(true);
    expect(t.facts['sewer.creek']).toBe(true);
  });

  it('service: alley door needs the kept alley; deliveries move to the lane; guard patrols the alley', () => {
    const t = computeTimeline({ 'alley.fate': 'kept', 'service.door': 'alley' });
    expect(t.facts['service.door']).toBe('alley');
    expect(t.facts['delivery.stop']).toBe('lane');
    expect(t.facts['guardB.alley']).toBe(true);
    // heritage oak protects the garden, so the bank shelves the expansion
    expect(t.facts['bank.expansion']).toBe('none');
    expect(t.facts['garden.exists']).toBe(true);
  });
});

describe('side effects and conflicts', () => {
  it('creek drain floods the café unless the valve is fitted', () => {
    expect(computeTimeline({ 'drain.route': 'creek' }).facts['cafe.state']).toBe('closed_flood');
    expect(computeTimeline({ 'drain.route': 'creek', 'cafe.valve': 'valve' }).facts['cafe.state']).toBe('open');
  });

  it('preserved square oak takes the terrace and closes the café', () => {
    const t = computeTimeline({ 'oak.plant': 'square', 'oak.renovation': 'preserve' });
    expect(t.facts['cafe.state']).toBe('closed_terrace');
    expect(t.facts['oak.squareCanopy']).toBe(true);
    expect(t.facts['guardB.coffee']).toBe(false);
  });

  it('yard oak + kept alley: Garden Wing on the unprotected garden fells the oak; petition resolves it', () => {
    const conflict = computeTimeline({ 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alley.fate': 'kept' });
    expect(conflict.facts['bank.expansion']).toBe('garden');
    expect(conflict.facts['garden.exists']).toBe(false);
    expect(conflict.facts['oak.felled']).toBe(true);
    expect(conflict.facts['oak.roofAccess']).toBe(false);
    const fixed = computeTimeline({ 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alley.fate': 'kept', 'garden.petition': 'signed' });
    expect(fixed.facts['bank.expansion']).toBe('none');
    expect(fixed.facts['oak.roofAccess']).toBe(true);
    expect(fixed.facts['garden.exists']).toBe(true);
  });

  it('junction box location follows the West Wing', () => {
    expect(computeTimeline({ 'alarm.wiring': 'workshop' }).facts['junction.box']).toBe('westwing');
    expect(computeTimeline({ 'alarm.wiring': 'workshop', 'alley.fate': 'kept' }).facts['junction.box']).toBe('alley');
  });

  it('consequences list their causes', () => {
    const t = computeTimeline({ 'drain.route': 'creek', 'drain.renovation': 'hatch' });
    const ids = activeConsequences(t).map((c) => c.def.id);
    expect(ids).toContain('bank.hatch');
    expect(ids).toContain('cafe.flooded');
    const flood = activeConsequences(t).find((c) => c.def.id === 'cafe.flooded')!;
    expect(flood.causes).toContain('drain.route');
  });
});
