import variantsJson from '../data/variants.json';
import type { ContractId } from '../data/contracts';
import { evalWhen, type Era, type Facts, type When } from '../sim/types';

/** Visibility rules for Blender variant nodes (src/data/variants.json). Pure logic. */
export interface VariantRule {
  eras?: Era[];
  when?: When;
  contracts?: ContractId[];
}

export const VARIANT_RULES = (variantsJson as unknown as { variants: Record<string, VariantRule> }).variants;

export function variantVisible(id: string, era: Era, facts: Facts, contract: ContractId | null): boolean {
  const rule = VARIANT_RULES[id];
  if (!rule) return false;
  if (rule.eras && !rule.eras.includes(era)) return false;
  if (rule.contracts && (!contract || !rule.contracts.includes(contract))) return false;
  return evalWhen(rule.when, facts);
}

export function visibleVariantSet(era: Era, facts: Facts, contract: ContractId | null): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(VARIANT_RULES)) if (variantVisible(id, era, facts, contract)) out.add(id);
  return out;
}
