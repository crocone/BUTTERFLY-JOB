import { INTERVENTIONS, INTERVENTION_BY_ID, optionCost, originalOption, type Prereq } from '../data/interventions';
import { blockedPrereqs, effectiveDecisions, type Decisions } from './causality';

/**
 * Plan = the set of active deviations from the original timeline.
 * Budget = sum of option costs of active deviations; undoing refunds automatically because the
 * cost is always recomputed from the current plan.  Exploring and switching eras are free.
 */

export function planCost(decisions: Decisions): number {
  let total = 0;
  for (const [id, option] of Object.entries(effectiveDecisions(decisions))) total += optionCost(id, option);
  return total;
}

export interface RemovedDecision {
  id: string;
  option: string;
  /** prerequisites that no longer hold */
  reasons: Prereq[];
}

export type PlanError = 'unknown' | 'prereq' | 'budget';

export interface PlanChange {
  ok: boolean;
  decisions: Record<string, string>;
  removed: RemovedDecision[];
  error?: PlanError;
  blockedBy?: Prereq[];
  cost: number;
}

/** Set (or clear, when choosing the original option) one decision; prune dependents. */
export function setDecision(current: Decisions, id: string, option: string, budget: number): PlanChange {
  const def = INTERVENTION_BY_ID.get(id);
  const base = effectiveDecisions(current);
  if (!def || !def.options.some((o) => o.id === option)) {
    return { ok: false, decisions: base, removed: [], error: 'unknown', cost: planCost(base) };
  }
  const next: Record<string, string> = { ...base };
  if (option === originalOption(id)) {
    delete next[id];
  } else {
    const blocked = blockedPrereqs(id, base);
    if (blocked.length) {
      return { ok: false, decisions: base, removed: [], error: 'prereq', blockedBy: blocked, cost: planCost(base) };
    }
    next[id] = option;
  }
  const pruned = effectiveDecisions(next);
  const removed: RemovedDecision[] = [];
  for (const [rid, ropt] of Object.entries(next)) {
    if (!(rid in pruned)) removed.push({ id: rid, option: ropt, reasons: blockedPrereqs(rid, pruned) });
  }
  const cost = planCost(pruned);
  if (cost > budget) {
    return { ok: false, decisions: base, removed: [], error: 'budget', cost: planCost(base) };
  }
  return { ok: true, decisions: pruned, removed, cost };
}

/** Decisions sorted by era, then by intervention order (timeline panel order). */
export function orderedDecisions(decisions: Decisions): Array<{ id: string; option: string }> {
  const eff = effectiveDecisions(decisions);
  return INTERVENTIONS.filter((d) => d.id in eff).map((d) => ({ id: d.id, option: eff[d.id] }));
}

/** Snapshot undo stack.  Each entry is a complete plan, so undo restores dependents too. */
export class PlanHistory {
  private stack: Array<Record<string, string>> = [];
  constructor(private limit = 64) {}

  push(snapshot: Decisions): void {
    this.stack.push({ ...snapshot });
    if (this.stack.length > this.limit) this.stack.shift();
  }

  pop(): Record<string, string> | null {
    return this.stack.pop() ?? null;
  }

  clear(): void {
    this.stack = [];
  }

  get size(): number {
    return this.stack.length;
  }
}
