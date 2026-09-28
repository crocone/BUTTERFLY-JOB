import { isContractId, CONTRACT_BY_ID, type ContractId } from '../data/contracts';
import { INTERVENTIONS } from '../data/interventions';
import { effectiveDecisions, type Decisions } from '../sim/causality';
import { planCost, orderedDecisions } from '../sim/plan';

/**
 * Plan links without a backend:  #plan=1.c1.Oy-Pk
 *   1       format version
 *   c1      contract id
 *   Oy-Pk   interventions as <intervention code><option code>, '-' separated ('0' = none)
 * Decoding validates every token; anything malformed is rejected with a reason and the game
 * starts from the untouched timeline.
 */
export const PLAN_FORMAT = 1;

export function encodePlan(contract: ContractId, decisions: Decisions): string {
  const toks = orderedDecisions(decisions).map(({ id, option }) => {
    const def = INTERVENTIONS.find((d) => d.id === id)!;
    return def.code + def.options.find((o) => o.id === option)!.code;
  });
  return `${PLAN_FORMAT}.${contract}.${toks.length ? toks.join('-') : '0'}`;
}

export type DecodeResult =
  | { ok: true; contract: ContractId; decisions: Record<string, string>; dropped: number }
  | { ok: false; error: 'format' | 'version' | 'contract' | 'token' | 'duplicate' | 'budget' };

export function decodePlan(raw: string): DecodeResult {
  if (typeof raw !== 'string' || raw.length > 80) return { ok: false, error: 'format' };
  const s = raw.trim();
  if (!/^[0-9]+\.[a-z0-9]+\.[A-Za-z0-9-]+$/.test(s)) return { ok: false, error: 'format' };
  const [ver, contract, body] = s.split('.');
  if (Number(ver) !== PLAN_FORMAT) return { ok: false, error: 'version' };
  if (!isContractId(contract)) return { ok: false, error: 'contract' };
  const decisions: Record<string, string> = {};
  if (body !== '0') {
    for (const tok of body.split('-')) {
      if (tok.length !== 2) return { ok: false, error: 'token' };
      const def = INTERVENTIONS.find((d) => d.code === tok[0]);
      const opt = def?.options.find((o) => o.code === tok[1]);
      if (!def || !opt) return { ok: false, error: 'token' };
      if (def.id in decisions) return { ok: false, error: 'duplicate' };
      if (opt.id !== def.options[0].id) decisions[def.id] = opt.id;
    }
  }
  const eff = effectiveDecisions(decisions);
  if (planCost(eff) > CONTRACT_BY_ID.get(contract)!.budget) return { ok: false, error: 'budget' };
  return { ok: true, contract, decisions: eff, dropped: Object.keys(decisions).length - Object.keys(eff).length };
}

/** Read a plan from a location hash like "#plan=1.c1.Oy-Pk". */
export function planFromHash(hash: string): DecodeResult | null {
  const m = /(?:^#|&)plan=([^&]*)/.exec(hash);
  if (!m) return null;
  let v: string;
  try {
    v = decodeURIComponent(m[1]);
  } catch {
    return { ok: false, error: 'format' };
  }
  return decodePlan(v);
}

export function planUrl(base: string, contract: ContractId, decisions: Decisions): string {
  const u = base.split('#')[0];
  return `${u}#plan=${encodePlan(contract, decisions)}`;
}
