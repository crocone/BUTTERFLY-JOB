import type { ContractId } from '../data/contracts';
import type { Decisions } from './causality';
import type { ScriptStep } from './script';

/**
 * Reference solutions: one per route family and contract.  Used by the automated tests (each
 * must escape unseen in the real simulation) and by the in-game "attract" verification.
 */
export interface ReferenceSolution {
  id: string;
  contract: ContractId;
  family: string;
  plan: Decisions;
  steps: ScriptStep[];
}

const W: ScriptStep = { safeWait: true };

const STREET_EAST: ScriptStep[] = [W, { move: ['G', 12, 19] }, W, { move: ['G', 22, 19] }];

const ROOF_IN: ScriptStep[] = [
  ...STREET_EAST,
  W, { move: ['G', 25, 18] },
  W, { move: ['G', 26, 11] },
  W, { move: ['G', 26, 8] },
  W, { move: ['G', 25, 5] },
  W, { move: ['U', 23, 5] },
  W, { move: ['U', 21, 5] },
];
const ROOF_OUT: ScriptStep[] = [
  W, { move: ['U', 21, 5] },
  W, { move: ['U', 23, 5] },
  W, { move: ['G', 25, 5] },
  W, { move: ['G', 26, 8] },
  W, { move: ['G', 26, 11] },
  W, { move: ['G', 25, 18] },
  W, { move: ['G', 12, 19] },
  W, { interact: 'exit' },
];

const SEWER_IN: ScriptStep[] = [W, { move: ['G', 8, 20] }, W, { move: ['S', 8, 19] }, W, { move: ['S', 12, 9] }, W, { move: ['B', 12, 8] }];
const SEWER_OUT: ScriptStep[] = [W, { move: ['B', 12, 8] }, W, { move: ['S', 12, 10] }, W, { move: ['S', 8, 20] }, W, { move: ['G', 8, 20] }, W, { interact: 'exit' }];

const ALLEY_IN: ScriptStep[] = [W, { move: ['G', 9, 19] }, W, { move: ['G', 9, 14] }, W, { move: ['G', 9, 10] }, W, { move: ['G', 11, 7] }];
const ALLEY_OUT: ScriptStep[] = [W, { move: ['G', 11, 7] }, W, { move: ['G', 9, 10] }, W, { move: ['G', 9, 14] }, W, { move: ['G', 9, 19] }, W, { interact: 'exit' }];

const FRONT_IN: ScriptStep[] = [W, { move: ['G', 9, 19] }, W, { move: ['G', 10, 16] }, W, { move: ['G', 11, 13] }, W, { move: ['G', 12, 9] }];
const FRONT_OUT: ScriptStep[] = [W, { move: ['G', 12, 9] }, W, { move: ['G', 11, 13] }, W, { move: ['G', 10, 16] }, W, { move: ['G', 9, 19] }, W, { interact: 'exit' }];

/** from the ground-floor service corridor / stairwell down to the archive and back */
const G_TO_ARCHIVE: ScriptStep[] = [W, { move: ['G', 11, 5] }, W, { move: ['B', 12, 4] }, W, { interact: 'target' }, W, { move: ['B', 12, 4] }, W, { move: ['G', 11, 5] }];
const U_TO_ARCHIVE: ScriptStep[] = [W, { move: ['U', 11, 4] }, W, { move: ['B', 12, 4] }, W, { interact: 'target' }, W, { move: ['B', 12, 4] }, W, { move: ['U', 11, 4] }];
const B_TO_ARCHIVE: ScriptStep[] = [W, { move: ['B', 12, 6] }, W, { interact: 'target' }, W, { move: ['B', 12, 6] }];

export const SOLUTIONS: readonly ReferenceSolution[] = [
  // ------------------------------------------------------------------ contract 1
  { id: 'c1-roof', contract: 'c1', family: 'rooftop', plan: { 'oak.plant': 'yard', 'oak.renovation': 'preserve' }, steps: [...ROOF_IN, ...U_TO_ARCHIVE, ...ROOF_OUT] },
  { id: 'c1-sewer', contract: 'c1', family: 'underground', plan: { 'drain.route': 'creek', 'drain.renovation': 'hatch' }, steps: [...SEWER_IN, ...B_TO_ARCHIVE, ...SEWER_OUT] },
  { id: 'c1-alley', contract: 'c1', family: 'service', plan: { 'alley.fate': 'kept', 'service.door': 'alley' }, steps: [...ALLEY_IN, ...G_TO_ARCHIVE, ...ALLEY_OUT] },
  { id: 'c1-canopy', contract: 'c1', family: 'canopy+service', plan: { 'oak.plant': 'square', 'oak.renovation': 'preserve' }, steps: [...FRONT_IN, ...G_TO_ARCHIVE, ...FRONT_OUT] },
  // ------------------------------------------------------------------ contract 2
  {
    id: 'c2-skylight',
    contract: 'c2',
    family: 'rooftop',
    plan: { 'oak.plant': 'yard', 'oak.renovation': 'preserve' },
    steps: [
      ...ROOF_IN.slice(0, -2),
      W, { move: ['U', 21, 8] },
      W, { move: ['R', 20, 8] },
      W, { move: ['R', 16, 3] },
      W, { move: ['R', 15, 3] },
      W, { interact: 'target' },
      W, { move: ['R', 16, 3] },
      W, { move: ['R', 20, 8] },
      W, { move: ['U', 21, 8] },
      W, { move: ['U', 23, 5] },
      ...ROOF_OUT.slice(4),
    ],
  },
  {
    id: 'c2-sewer-power',
    contract: 'c2',
    family: 'underground+power',
    plan: { 'drain.route': 'creek', 'drain.renovation': 'hatch', 'alarm.wiring': 'workshop' },
    steps: [
      ...SEWER_IN,
      W, { move: ['B', 12, 4] },
      W, { move: ['G', 11, 3] },
      W, { interact: 'junction' },
      W, { move: ['G', 12, 3] },
      W, { move: ['U', 11, 4] },
      W, { move: ['U', 16, 5] },
      W, { interact: 'target' },
      W, { move: ['U', 11, 4] },
      W, { move: ['B', 12, 4] },
      ...SEWER_OUT,
    ],
  },
  {
    id: 'c2-alley-power',
    contract: 'c2',
    family: 'service+power',
    plan: { 'alley.fate': 'kept', 'service.door': 'alley', 'alarm.wiring': 'workshop' },
    steps: [
      W, { move: ['G', 9, 19] },
      W, { move: ['G', 9, 14] },
      W, { move: ['G', 9, 10] },
      W, { interact: 'junction' },
      W, { move: ['G', 9, 9] },
      W, { move: ['G', 11, 7] },
      W, { move: ['G', 11, 5] },
      W, { move: ['U', 11, 4] },
      W, { move: ['U', 16, 5] },
      W, { interact: 'target' },
      W, { move: ['U', 11, 4] },
      W, { move: ['G', 11, 5] },
      ...ALLEY_OUT,
    ],
  },
  // ------------------------------------------------------------------ contract 3
  {
    id: 'c3-roof-power',
    contract: 'c3',
    family: 'rooftop+power',
    plan: { 'oak.plant': 'yard', 'oak.renovation': 'preserve', 'alarm.wiring': 'workshop' },
    steps: [
      ...ROOF_IN,
      W, { move: ['U', 11, 4] },
      W, { move: ['G', 11, 3] },
      W, { interact: 'junction' },
      W, { move: ['G', 11, 3] },
      W, { move: ['B', 12, 4] },
      W, { interact: 'target' },
      W, { move: ['B', 12, 4] },
      W, { move: ['U', 11, 4] },
      ...ROOF_OUT,
    ],
  },
  {
    id: 'c3-alley-power',
    contract: 'c3',
    family: 'service+power',
    plan: { 'alley.fate': 'kept', 'service.door': 'alley', 'alarm.wiring': 'workshop' },
    steps: [
      W, { move: ['G', 9, 19] },
      W, { move: ['G', 9, 14] },
      W, { move: ['G', 9, 10] },
      W, { interact: 'junction' },
      W, { move: ['G', 9, 9] },
      W, { move: ['G', 11, 7] },
      W, { move: ['G', 11, 4] },
      W, { move: ['B', 12, 4] },
      W, { interact: 'target' },
      W, { move: ['B', 12, 4] },
      W, { move: ['G', 11, 4] },
      ...ALLEY_OUT,
    ],
  },
];
