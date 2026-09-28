import type { Level } from '../sim/types';

export type ContractId = 'c1' | 'c2' | 'c3';

/**
 * Condition ids evaluated by src/game/progress.ts.
 *  garden      the community garden still exists in 2026
 *  cafe        Café Kopp is open in 2026
 *  undetected  the heist finished with zero detection events
 *  lean        the plan uses at most 2 changes
 *  quiet       the alarm circuit was never cut
 */
export type ConditionId = 'garden' | 'cafe' | 'undetected' | 'lean' | 'quiet';

export interface ContractDef {
  id: ContractId;
  index: number;
  budget: number;
  target: { level: Level; x: number; z: number; prop: string };
  /** where guard A patrols (inside the bank) */
  guardA: 'lobby' | 'upper' | 'basement';
  /** Glass Room door: locked, or a laser curtain on the alarm circuit */
  glassDoor: 'locked' | 'laser';
  /** Vault door: locked, or a maglock on the alarm circuit */
  vaultDoor: 'locked' | 'maglock';
  /** cameras fed by the alarm circuit (can be cut at the workshop junction box) */
  circuitCameras: string[];
  required: ConditionId[];
  optional: ConditionId[];
}

export const CONTRACTS: readonly ContractDef[] = [
  {
    id: 'c1',
    index: 1,
    budget: 5,
    target: { level: 'B', x: 13, z: 2, prop: 'linden_file' },
    guardA: 'lobby',
    glassDoor: 'locked',
    vaultDoor: 'locked',
    circuitCameras: [],
    required: [],
    optional: ['undetected', 'lean'],
  },
  {
    id: 'c2',
    index: 2,
    budget: 5,
    target: { level: 'U', x: 15, z: 3, prop: 'diamond' },
    guardA: 'upper',
    glassDoor: 'laser',
    vaultDoor: 'locked',
    circuitCameras: ['C4'],
    required: [],
    optional: ['undetected', 'quiet'],
  },
  {
    id: 'c3',
    index: 3,
    budget: 3,
    target: { level: 'B', x: 20, z: 3, prop: 'deposit_box' },
    guardA: 'basement',
    glassDoor: 'locked',
    vaultDoor: 'maglock',
    // the vault maglock and the basement camera share the 1946 alarm circuit
    circuitCameras: ['C2'],
    required: ['garden', 'cafe'],
    optional: ['undetected'],
  },
];

export const CONTRACT_BY_ID: ReadonlyMap<ContractId, ContractDef> = new Map(CONTRACTS.map((c) => [c.id, c]));

export function isContractId(v: unknown): v is ContractId {
  return v === 'c1' || v === 'c2' || v === 'c3';
}
