/** Shared simulation types.  Nothing in src/sim depends on Three.js or the DOM. */

export type Era = 1946 | 1986 | 2026;
export const ERAS: readonly Era[] = [1946, 1986, 2026] as const;

export type Level = 'S' | 'B' | 'G' | 'U' | 'R';
export const LEVELS: readonly Level[] = ['S', 'B', 'G', 'U', 'R'] as const;

export type FactValue = string | number | boolean;
export type Facts = Readonly<Record<string, FactValue>>;

/** [fact, op, value] — all entries of a condition list must hold (AND). */
export type Cond = [string, '==' | '!=', FactValue];
export type When = readonly Cond[] | undefined;

export interface TileRef {
  level: Level;
  x: number;
  z: number;
}

export function tileKey(t: TileRef): string {
  return `${t.level}:${t.x},${t.z}`;
}

export function evalWhen(when: When, facts: Facts): boolean {
  if (!when) return true;
  for (const [fact, op, value] of when) {
    const v = facts[fact];
    if (v === undefined) throw new Error(`Unknown fact "${fact}" in condition`);
    if (op === '==' ? v !== value : v === value) return false;
  }
  return true;
}
