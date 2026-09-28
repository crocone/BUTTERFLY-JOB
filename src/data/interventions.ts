import type { Era } from '../sim/types';

/**
 * Interventions: the only way the player changes the world.
 * The first option of each intervention is the original timeline.  Text lives in text.en.ts
 * under the same ids; share-link codes are single characters and must stay stable.
 */
export interface InterventionOption {
  id: string;
  code: string;
  cost: number;
}

/** Prerequisite on another intervention's decision (original option if undecided). */
export type Prereq = [interventionId: string, op: '==' | '!=', optionId: string];

export interface InterventionDef {
  id: string;
  era: Era;
  site: SiteId;
  code: string;
  options: InterventionOption[];
  requires?: Prereq[];
}

export type SiteId = 'oak' | 'drain' | 'workshop' | 'cafe' | 'alley' | 'bankService' | 'garden';

export const INTERVENTIONS: readonly InterventionDef[] = [
  {
    id: 'oak.plant',
    era: 1946,
    site: 'oak',
    code: 'O',
    options: [
      { id: 'garden', code: 'g', cost: 0 },
      { id: 'yard', code: 'y', cost: 1 },
      { id: 'square', code: 's', cost: 1 },
    ],
  },
  {
    id: 'drain.route',
    era: 1946,
    site: 'drain',
    code: 'D',
    options: [
      { id: 'street', code: 's', cost: 0 },
      { id: 'creek', code: 'c', cost: 1 },
    ],
  },
  {
    id: 'alarm.wiring',
    era: 1946,
    site: 'workshop',
    code: 'W',
    options: [
      { id: 'grid', code: 'g', cost: 0 },
      { id: 'workshop', code: 'w', cost: 1 },
    ],
  },
  {
    id: 'oak.renovation',
    era: 1986,
    site: 'oak',
    code: 'P',
    options: [
      { id: 'prune', code: 'p', cost: 0 },
      { id: 'preserve', code: 'k', cost: 1 },
    ],
    requires: [['oak.plant', '!=', 'garden']],
  },
  {
    id: 'drain.renovation',
    era: 1986,
    site: 'drain',
    code: 'H',
    options: [
      { id: 'seal', code: 's', cost: 0 },
      { id: 'hatch', code: 'h', cost: 1 },
    ],
    requires: [['drain.route', '==', 'creek']],
  },
  {
    id: 'cafe.valve',
    era: 1986,
    site: 'cafe',
    code: 'V',
    options: [
      { id: 'none', code: 'n', cost: 0 },
      { id: 'valve', code: 'v', cost: 1 },
    ],
    requires: [['drain.route', '==', 'creek']],
  },
  {
    id: 'alley.fate',
    era: 1986,
    site: 'alley',
    code: 'A',
    options: [
      { id: 'built_over', code: 'b', cost: 0 },
      { id: 'kept', code: 'k', cost: 1 },
    ],
  },
  {
    id: 'service.door',
    era: 1986,
    site: 'bankService',
    code: 'S',
    options: [
      { id: 'front', code: 'f', cost: 0 },
      { id: 'alley', code: 'a', cost: 1 },
    ],
    requires: [['alley.fate', '==', 'kept']],
  },
  {
    id: 'garden.petition',
    era: 1986,
    site: 'garden',
    code: 'G',
    options: [
      { id: 'none', code: 'n', cost: 0 },
      { id: 'signed', code: 's', cost: 1 },
    ],
  },
];

export const INTERVENTION_BY_ID: ReadonlyMap<string, InterventionDef> = new Map(INTERVENTIONS.map((d) => [d.id, d]));

export function originalOption(id: string): string {
  const def = INTERVENTION_BY_ID.get(id);
  if (!def) throw new Error(`Unknown intervention ${id}`);
  return def.options[0].id;
}

export function optionCost(id: string, option: string): number {
  const def = INTERVENTION_BY_ID.get(id);
  const opt = def?.options.find((o) => o.id === option);
  if (!def || !opt) throw new Error(`Unknown option ${id}=${option}`);
  return opt.cost;
}

export const SITES: readonly SiteId[] = ['oak', 'drain', 'workshop', 'cafe', 'alley', 'bankService', 'garden'];
