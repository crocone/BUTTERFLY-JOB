import { edgeKey, GRID_H, GRID_W, idx, inBounds, type DoorDef, type PortalDef, type WorldGrid } from './layout';
import { LEVELS, type Level, type TileRef } from './types';

/**
 * Grid navigation with explicit level connections (stairs, ladders, hatches, tree climb, rope).
 * 8-neighbour movement on a level; diagonals may not cut wall corners or pass doors.
 */

export type DoorVerdict = 'pass' | 'wait' | 'block';
export type DoorPolicy = (door: DoorDef, from: TileRef, to: TileRef) => DoorVerdict;

export interface PathStep extends TileRef {
  /** how the thief arrives at this tile */
  via: 'start' | 'walk' | 'portal';
  portal?: PortalDef;
  door?: DoorDef;
  /** door that may require waiting before stepping onto this tile */
  wait?: boolean;
}

export interface PathResult {
  steps: PathStep[];
  /** estimated seconds (walking + portal traversal; excludes waits) */
  time: number;
  waits: DoorDef[];
}

export interface PathFailure {
  reason: 'not-walkable' | 'blocked-door' | 'no-route';
  door?: DoorDef;
}

export const THIEF_SPEED = 2.6; // tiles per second

const LEVEL_INDEX: Record<Level, number> = { S: 0, B: 1, G: 2, U: 3, R: 4 };
const N = GRID_W * GRID_H;

function nodeId(t: TileRef): number {
  return LEVEL_INDEX[t.level] * N + idx(t.x, t.z);
}

function nodeRef(id: number): TileRef {
  const level = LEVELS[Math.floor(id / N)];
  const i = id % N;
  return { level, x: i % GRID_W, z: Math.floor(i / GRID_W) };
}

class Heap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, p: number) {
    const ids = this.ids;
    const pr = this.pr;
    ids.push(id);
    pr.push(p);
    let i = ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] < pr[i] || (pr[parent] === pr[i] && ids[parent] <= ids[i])) break;
      [ids[parent], ids[i]] = [ids[i], ids[parent]];
      [pr[parent], pr[i]] = [pr[i], pr[parent]];
      i = parent;
    }
  }
  pop(): number {
    const ids = this.ids;
    const pr = this.pr;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pr.pop()!;
    if (ids.length) {
      ids[0] = lastId;
      pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        const less = (a: number, c: number) => pr[a] < pr[c] || (pr[a] === pr[c] && ids[a] < ids[c]);
        if (l < ids.length && less(l, m)) m = l;
        if (r < ids.length && less(r, m)) m = r;
        if (m === i) break;
        [ids[m], ids[i]] = [ids[i], ids[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

function portalsByNode(grid: WorldGrid): Map<number, Array<{ portal: PortalDef; to: TileRef }>> {
  const cached = (grid as unknown as { __portalMap?: Map<number, Array<{ portal: PortalDef; to: TileRef }>> }).__portalMap;
  if (cached) return cached;
  const map = new Map<number, Array<{ portal: PortalDef; to: TileRef }>>();
  for (const p of grid.portals) {
    for (const [from, to] of [
      [p.a, p.b],
      [p.b, p.a],
    ] as const) {
      const id = nodeId(from);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push({ portal: p, to });
    }
  }
  (grid as unknown as { __portalMap?: unknown }).__portalMap = map;
  return map;
}

/** Can one step from `a` to 4-adjacent `b` on the same level, ignoring doors? */
function edgeOpen(grid: WorldGrid, level: Level, ax: number, az: number, bx: number, bz: number): { open: boolean; door: DoorDef | null } {
  const e = grid.edges.get(edgeKey(level, ax, az, bx, bz));
  if (!e) return { open: true, door: null };
  if (e.door) return { open: true, door: e.door };
  return { open: e.wall === null, door: null };
}

export interface NavOptions {
  doorPolicy: DoorPolicy;
  speed?: number;
  /** extra tiles that may not be entered (e.g. the delivery van right now) */
  blocked?: Set<string>;
  /** limit search effort */
  maxExpanded?: number;
}

function walkable(grid: WorldGrid, t: TileRef, blocked?: Set<string>): boolean {
  if (!inBounds(t.x, t.z)) return false;
  if (!grid.walk[t.level][idx(t.x, t.z)]) return false;
  if (blocked && blocked.has(`${t.level}:${t.x},${t.z}`)) return false;
  return true;
}

export function findPath(grid: WorldGrid, from: TileRef, to: TileRef, opts: NavOptions): PathResult | PathFailure {
  if (!walkable(grid, to, opts.blocked)) return { reason: 'not-walkable' };
  const res = search(grid, from, to, opts);
  if (res) return res;
  // Explain failure: would it succeed if closed doors could be passed?
  const permissive: NavOptions = { ...opts, doorPolicy: (d) => (d.kind === 'locked' ? 'block' : 'pass') };
  const alt = search(grid, from, to, permissive);
  if (alt) {
    const culprit = alt.steps.find((s) => s.door && opts.doorPolicy(s.door, alt.steps[alt.steps.indexOf(s) - 1], s) === 'block');
    return { reason: 'blocked-door', door: culprit?.door };
  }
  return { reason: 'no-route' };
}

export function isPathFailure(r: PathResult | PathFailure): r is PathFailure {
  return (r as PathFailure).reason !== undefined;
}

function search(grid: WorldGrid, from: TileRef, to: TileRef, opts: NavOptions): PathResult | null {
  const speed = opts.speed ?? THIEF_SPEED;
  const start = nodeId(from);
  const goal = nodeId(to);
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, { prev: number; via: PathStep['via']; portal?: PortalDef; door?: DoorDef; wait?: boolean }>();
  const heap = new Heap();
  const h = (t: TileRef) => Math.hypot(t.x - to.x, t.z - to.z) / speed;
  heap.push(start, h(from));
  const closed = new Set<number>();
  const portals = portalsByNode(grid);
  let expanded = 0;
  const maxExpanded = opts.maxExpanded ?? 40000;
  while (heap.size) {
    const cur = heap.pop();
    if (closed.has(cur)) continue;
    if (cur === goal) break;
    closed.add(cur);
    if (++expanded > maxExpanded) return null;
    const t = nodeRef(cur);
    const gc = g.get(cur)!;
    const relax = (nt: TileRef, cost: number, info: { via: PathStep['via']; portal?: PortalDef; door?: DoorDef; wait?: boolean }) => {
      const id = nodeId(nt);
      if (closed.has(id)) return;
      const ng = gc + cost;
      if (ng < (g.get(id) ?? Infinity) - 1e-9) {
        g.set(id, ng);
        came.set(id, { prev: cur, ...info });
        heap.push(id, ng + h(nt));
      }
    };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nt: TileRef = { level: t.level, x: t.x + dx, z: t.z + dz };
        if (!walkable(grid, nt, opts.blocked)) continue;
        if (dx && dz) {
          // diagonal: both orthogonal neighbours walkable, all four edges open, no doors
          const o1: TileRef = { level: t.level, x: t.x + dx, z: t.z };
          const o2: TileRef = { level: t.level, x: t.x, z: t.z + dz };
          if (!walkable(grid, o1, opts.blocked) || !walkable(grid, o2, opts.blocked)) continue;
          const e1 = edgeOpen(grid, t.level, t.x, t.z, o1.x, o1.z);
          const e2 = edgeOpen(grid, t.level, t.x, t.z, o2.x, o2.z);
          const e3 = edgeOpen(grid, t.level, o1.x, o1.z, nt.x, nt.z);
          const e4 = edgeOpen(grid, t.level, o2.x, o2.z, nt.x, nt.z);
          if (![e1, e2, e3, e4].every((e) => e.open && !e.door)) continue;
          relax(nt, Math.SQRT2 / speed, { via: 'walk' });
        } else {
          const e = edgeOpen(grid, t.level, t.x, t.z, nt.x, nt.z);
          if (!e.open) continue;
          if (e.door) {
            const verdict = opts.doorPolicy(e.door, t, nt);
            if (verdict === 'block') continue;
            relax(nt, 1 / speed + (verdict === 'wait' ? 0.5 : 0), { via: 'walk', door: e.door, wait: verdict === 'wait' });
          } else {
            relax(nt, 1 / speed, { via: 'walk' });
          }
        }
      }
    }
    for (const { portal, to: pt } of portals.get(cur) ?? []) {
      if (!walkable(grid, pt, opts.blocked)) continue;
      relax(pt, portal.time, { via: 'portal', portal });
    }
  }
  if (!g.has(goal)) return null;
  const steps: PathStep[] = [];
  const waits: DoorDef[] = [];
  let cur = goal;
  while (cur !== start) {
    const c = came.get(cur)!;
    const ref = nodeRef(cur);
    steps.push({ ...ref, via: c.via, portal: c.portal, door: c.door, wait: c.wait });
    if (c.wait && c.door) waits.push(c.door);
    cur = c.prev;
  }
  steps.push({ ...from, via: 'start' });
  steps.reverse();
  return { steps, time: g.get(goal)!, waits: waits.reverse() };
}

/** All tiles reachable from `from` (used by tests and route validation). */
export function reachable(grid: WorldGrid, from: TileRef, policy: DoorPolicy): Set<string> {
  const seen = new Set<string>();
  const key = (t: TileRef) => `${t.level}:${t.x},${t.z}`;
  const queue: TileRef[] = [from];
  seen.add(key(from));
  const portals = portalsByNode(grid);
  while (queue.length) {
    const t = queue.shift()!;
    const push = (nt: TileRef) => {
      const k = key(nt);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(nt);
      }
    };
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nt: TileRef = { level: t.level, x: t.x + dx, z: t.z + dz };
      if (!walkable(grid, nt)) continue;
      const e = edgeOpen(grid, t.level, t.x, t.z, nt.x, nt.z);
      if (!e.open) continue;
      if (e.door && policy(e.door, t, nt) === 'block') continue;
      push(nt);
    }
    for (const { to } of portals.get(nodeId(t)) ?? []) if (walkable(grid, to)) push(to);
  }
  return seen;
}
