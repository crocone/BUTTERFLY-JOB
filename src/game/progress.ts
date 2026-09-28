import { CONTRACTS, type ConditionId, type ContractDef, type ContractId } from '../data/contracts';
import type { Facts } from '../sim/types';

/** Contract conditions and unlocking. */
export function planConditionHolds(id: ConditionId, facts: Facts, changes: number): boolean | null {
  switch (id) {
    case 'garden':
      return facts['garden.exists'] === true;
    case 'cafe':
      return facts['cafe.open'] === true;
    case 'lean':
      return changes <= 2;
    default:
      return null; // decided by the heist itself
  }
}

export function heistConditionHolds(id: ConditionId, facts: Facts, changes: number, heist: { detections: number; powerCut: boolean }): boolean {
  const p = planConditionHolds(id, facts, changes);
  if (p !== null) return p;
  if (id === 'undetected') return heist.detections === 0;
  if (id === 'quiet') return !heist.powerCut;
  return false;
}

/** Required conditions that fail for the current plan (checked before the job starts). */
export function failingRequirements(c: ContractDef, facts: Facts, changes: number): ConditionId[] {
  return c.required.filter((id) => planConditionHolds(id, facts, changes) === false);
}

export function nextContract(id: ContractId): ContractId | null {
  const i = CONTRACTS.findIndex((c) => c.id === id);
  return i >= 0 && i + 1 < CONTRACTS.length ? CONTRACTS[i + 1].id : null;
}
