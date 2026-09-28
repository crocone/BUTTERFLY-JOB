import { INTERVENTIONS, INTERVENTION_BY_ID, originalOption, type Prereq } from '../data/interventions';
import type { Era, FactValue, Facts } from './types';

/**
 * Causality engine.
 *
 * The world history is a pure function of the active decisions:
 *     computeTimeline(decisions) → facts (+ which interventions caused each fact)
 * Rules run in a fixed order and may only read facts computed earlier, so the rule graph is a
 * DAG by construction (reading a not-yet-computed fact throws).  Nothing is stored between calls:
 * switching eras or recomputing never accumulates effects.
 */

/** interventionId → chosen option (only non-original choices are meaningful). */
export type Decisions = Readonly<Record<string, string>>;

interface RuleCtx {
  fact(name: string): FactValue;
  decision(id: string): string;
}

interface Rule {
  fact: string;
  era: Era;
  compute: (c: RuleCtx) => FactValue;
}

const b = (v: FactValue): boolean => v === true;

/** Ordered rule list.  `era` is the era in which the fact is first decided (used by the UI). */
export const RULES: readonly Rule[] = [
  // 1946 — the neighbourhood takes shape
  { fact: 'oak.location', era: 1946, compute: (c) => c.decision('oak.plant') },
  { fact: 'drain.route', era: 1946, compute: (c) => c.decision('drain.route') },
  { fact: 'alarm.feed', era: 1946, compute: (c) => c.decision('alarm.wiring') },
  // 1986 — renovations
  { fact: 'oak.preserved', era: 1986, compute: (c) => c.fact('oak.location') !== 'garden' && c.decision('oak.renovation') === 'preserve' },
  { fact: 'oak.pruned', era: 1986, compute: (c) => c.fact('oak.location') !== 'garden' && !b(c.fact('oak.preserved')) },
  { fact: 'drain.hatch', era: 1986, compute: (c) => c.fact('drain.route') === 'creek' && c.decision('drain.renovation') === 'hatch' },
  { fact: 'cafe.valve', era: 1986, compute: (c) => c.fact('drain.route') === 'creek' && c.decision('cafe.valve') === 'valve' },
  { fact: 'alley.kept', era: 1986, compute: (c) => c.decision('alley.fate') === 'kept' },
  { fact: 'service.door', era: 1986, compute: (c) => (b(c.fact('alley.kept')) && c.decision('service.door') === 'alley' ? 'alley' : 'front') },
  { fact: 'garden.petition', era: 1986, compute: (c) => c.decision('garden.petition') === 'signed' },
  { fact: 'garden.protected', era: 1986, compute: (c) => c.fact('oak.location') === 'garden' || b(c.fact('garden.petition')) },
  {
    fact: 'bank.expansion',
    era: 1986,
    compute: (c) => (!b(c.fact('alley.kept')) ? 'alley' : b(c.fact('garden.protected')) ? 'none' : 'garden'),
  },
  { fact: 'garden.exists', era: 1986, compute: (c) => c.fact('bank.expansion') !== 'garden' },
  { fact: 'oak.felled', era: 1986, compute: (c) => c.fact('oak.location') === 'yard' && c.fact('bank.expansion') === 'garden' },
  { fact: 'oak.squareCanopy', era: 1986, compute: (c) => c.fact('oak.location') === 'square' && b(c.fact('oak.preserved')) },
  { fact: 'cafe.terrace1986', era: 1986, compute: (c) => !b(c.fact('oak.squareCanopy')) },
  { fact: 'delivery.stop', era: 1986, compute: (c) => (c.fact('service.door') === 'alley' ? 'lane' : 'square') },
  {
    fact: 'junction.box',
    era: 1986,
    compute: (c) => (c.fact('alarm.feed') !== 'workshop' ? 'none' : c.fact('bank.expansion') === 'alley' ? 'westwing' : 'alley'),
  },
  // 2026 — the accumulated present
  {
    fact: 'oak.roofAccess',
    era: 2026,
    compute: (c) => c.fact('oak.location') === 'yard' && b(c.fact('oak.preserved')) && !b(c.fact('oak.felled')),
  },
  { fact: 'roof.camera', era: 2026, compute: (c) => b(c.fact('oak.roofAccess')) },
  { fact: 'car.spot', era: 2026, compute: (c) => (b(c.fact('oak.roofAccess')) ? 'lane' : 'yard') },
  { fact: 'sewer.creek', era: 2026, compute: (c) => c.fact('drain.route') === 'creek' },
  {
    fact: 'cafe.state',
    era: 2026,
    compute: (c) =>
      b(c.fact('oak.squareCanopy'))
        ? 'closed_terrace'
        : c.fact('drain.route') === 'creek' && !b(c.fact('cafe.valve'))
          ? 'closed_flood'
          : 'open',
  },
  { fact: 'cafe.open', era: 2026, compute: (c) => c.fact('cafe.state') === 'open' },
  { fact: 'guardB.alley', era: 2026, compute: (c) => b(c.fact('alley.kept')) },
  { fact: 'guardB.coffee', era: 2026, compute: (c) => b(c.fact('cafe.open')) },
];

export const FACT_ERA: ReadonlyMap<string, Era> = new Map(RULES.map((r) => [r.fact, r.era]));
export const FACT_NAMES: readonly string[] = RULES.map((r) => r.fact);

export interface Timeline {
  /** Decisions that are actually in effect (invalid ones filtered out). */
  decisions: Decisions;
  facts: Facts;
  /** fact → interventions (ids) whose decisions influenced it. */
  causes: Readonly<Record<string, readonly string[]>>;
}

function prereqHolds(p: Prereq, decisions: Decisions): boolean {
  const [id, op, option] = p;
  const current = decisions[id] ?? originalOption(id);
  return op === '==' ? current === option : current !== option;
}

/**
 * Filter decisions down to the valid, non-original ones.  Evaluated in intervention order
 * (1946 before 1986), so a decision whose prerequisite was itself invalid is dropped too.
 */
export function effectiveDecisions(decisions: Decisions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of INTERVENTIONS) {
    const choice = decisions[def.id];
    if (choice === undefined) continue;
    if (!def.options.some((o) => o.id === choice)) continue;
    if (choice === def.options[0].id) continue;
    if ((def.requires ?? []).every((p) => prereqHolds(p, out))) out[def.id] = choice;
  }
  return out;
}

/** Why a decision is not (or no longer) allowed; null when allowed. */
export function blockedPrereqs(id: string, decisions: Decisions): Prereq[] {
  const def = INTERVENTION_BY_ID.get(id);
  if (!def) return [];
  const eff = effectiveDecisions(decisions);
  return (def.requires ?? []).filter((p) => !prereqHolds(p, eff));
}

export function computeTimeline(decisions: Decisions): Timeline {
  const eff = effectiveDecisions(decisions);
  const facts: Record<string, FactValue> = {};
  const causes: Record<string, string[]> = {};
  for (const rule of RULES) {
    const read = new Set<string>();
    const ctx: RuleCtx = {
      fact(name) {
        if (!(name in facts)) throw new Error(`Rule for "${rule.fact}" reads "${name}" before it is computed`);
        for (const cId of causes[name]) read.add(cId);
        return facts[name];
      },
      decision(id) {
        if (!INTERVENTION_BY_ID.has(id)) throw new Error(`Unknown intervention ${id}`);
        if (id in eff) read.add(id);
        return eff[id] ?? originalOption(id);
      },
    };
    facts[rule.fact] = rule.compute(ctx);
    causes[rule.fact] = [...read].sort();
  }
  return { decisions: eff, facts, causes };
}

let originalCache: Timeline | null = null;
export function originalTimeline(): Timeline {
  if (!originalCache) originalCache = computeTimeline({});
  return originalCache;
}

/** Facts that differ from the original timeline. */
export function deviations(t: Timeline): string[] {
  const o = originalTimeline().facts;
  return FACT_NAMES.filter((f) => o[f] !== t.facts[f]);
}

/**
 * Observable consequences shown to the player (object cards, era toasts, causal lines, replay).
 * A consequence is active when its fact has the given value *and* that differs from the
 * original timeline.
 */
export interface ConsequenceDef {
  id: string;
  era: Era;
  fact: string;
  value: FactValue;
  kind: 'route' | 'obstacle' | 'side' | 'condition';
  /** Location for highlights / causal lines. */
  at: { level: 'S' | 'B' | 'G' | 'U' | 'R'; x: number; z: number };
  /** Objects whose cards list this consequence. */
  sites: string[];
}

export const CONSEQUENCES: readonly ConsequenceDef[] = [
  { id: 'oak.pruned', era: 1986, fact: 'oak.pruned', value: true, kind: 'obstacle', at: { level: 'G', x: 24, z: 5 }, sites: ['oak'] },
  { id: 'cafe.terraceLost', era: 1986, fact: 'cafe.terrace1986', value: false, kind: 'side', at: { level: 'G', x: 9, z: 12 }, sites: ['oak', 'cafe'] },
  { id: 'bank.gardenWing', era: 1986, fact: 'bank.expansion', value: 'garden', kind: 'side', at: { level: 'G', x: 25, z: 13 }, sites: ['alley', 'garden', 'oak'] },
  { id: 'bank.noExpansion', era: 1986, fact: 'bank.expansion', value: 'none', kind: 'side', at: { level: 'G', x: 10, z: 5 }, sites: ['alley', 'garden'] },
  { id: 'garden.charter', era: 1986, fact: 'garden.petition', value: true, kind: 'condition', at: { level: 'G', x: 25, z: 13 }, sites: ['garden'] },
  { id: 'oak.felled', era: 1986, fact: 'oak.felled', value: true, kind: 'obstacle', at: { level: 'G', x: 24, z: 5 }, sites: ['oak', 'alley', 'garden'] },
  { id: 'alley.open', era: 2026, fact: 'alley.kept', value: true, kind: 'route', at: { level: 'G', x: 10, z: 5 }, sites: ['alley'] },
  { id: 'service.alleyDoor', era: 2026, fact: 'service.door', value: 'alley', kind: 'route', at: { level: 'G', x: 10, z: 7 }, sites: ['bankService', 'alley'] },
  { id: 'delivery.lane', era: 2026, fact: 'delivery.stop', value: 'lane', kind: 'side', at: { level: 'G', x: 9, z: 0 }, sites: ['bankService'] },
  { id: 'guard.alleyRound', era: 2026, fact: 'guardB.alley', value: true, kind: 'obstacle', at: { level: 'G', x: 9, z: 5 }, sites: ['alley'] },
  { id: 'sewer.underBank', era: 2026, fact: 'sewer.creek', value: true, kind: 'route', at: { level: 'S', x: 12, z: 10 }, sites: ['drain'] },
  { id: 'bank.hatch', era: 2026, fact: 'drain.hatch', value: true, kind: 'route', at: { level: 'B', x: 12, z: 8 }, sites: ['drain'] },
  { id: 'cafe.flooded', era: 2026, fact: 'cafe.state', value: 'closed_flood', kind: 'side', at: { level: 'G', x: 5, z: 12 }, sites: ['cafe', 'drain'] },
  { id: 'cafe.closedTerrace', era: 2026, fact: 'cafe.state', value: 'closed_terrace', kind: 'side', at: { level: 'G', x: 5, z: 12 }, sites: ['cafe', 'oak'] },
  { id: 'guard.noCoffee', era: 2026, fact: 'guardB.coffee', value: false, kind: 'obstacle', at: { level: 'G', x: 10, z: 12 }, sites: ['cafe'] },
  { id: 'oak.roofAccess', era: 2026, fact: 'oak.roofAccess', value: true, kind: 'route', at: { level: 'U', x: 23, z: 5 }, sites: ['oak'] },
  { id: 'roof.camera', era: 2026, fact: 'roof.camera', value: true, kind: 'obstacle', at: { level: 'U', x: 21, z: 2 }, sites: ['oak'] },
  { id: 'car.lane', era: 2026, fact: 'car.spot', value: 'lane', kind: 'side', at: { level: 'G', x: 22, z: 0 }, sites: ['oak'] },
  { id: 'oak.squareCanopy', era: 2026, fact: 'oak.squareCanopy', value: true, kind: 'route', at: { level: 'G', x: 15, z: 13 }, sites: ['oak'] },
  { id: 'junction.westwing', era: 2026, fact: 'junction.box', value: 'westwing', kind: 'route', at: { level: 'G', x: 9, z: 4 }, sites: ['workshop'] },
  { id: 'junction.alley', era: 2026, fact: 'junction.box', value: 'alley', kind: 'route', at: { level: 'G', x: 9, z: 4 }, sites: ['workshop'] },
];

export interface ActiveConsequence {
  def: ConsequenceDef;
  causes: readonly string[];
}

export function activeConsequences(t: Timeline): ActiveConsequence[] {
  const o = originalTimeline().facts;
  const out: ActiveConsequence[] = [];
  for (const def of CONSEQUENCES) {
    if (t.facts[def.fact] === def.value && o[def.fact] !== def.value) {
      out.push({ def, causes: t.causes[def.fact] ?? [] });
    }
  }
  return out;
}

/** Stable string of the facts (used to test determinism and to key cached derived data). */
export function factsSignature(facts: Facts): string {
  return FACT_NAMES.map((f) => `${f}=${String(facts[f])}`).join(';');
}
