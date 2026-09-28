import layoutJson from '../data/layout.json';
import { evalWhen, LEVELS, type Facts, type Level, type TileRef, type When } from './types';

/**
 * Expands src/data/layout.json + 2026 facts into a concrete grid used by navigation and vision.
 * The Blender generators read the same JSON, so doors/walls/portals in the geometry and in the
 * rules come from one definition.
 */

export type AreaKind = 'outdoor' | 'indoor' | 'roof' | 'tunnel';
export type Boundary = 'open' | 'wall' | 'fence';

export interface AreaDef {
  id: string;
  level: Level;
  kind: AreaKind;
  rects: number[][];
  boundary?: Boundary;
  walkable?: boolean;
  building?: string;
  group?: string;
  when?: When;
}

export type DoorKind = 'open' | 'locked' | 'service' | 'glass' | 'vault' | 'gate' | 'roofdoor';

export interface DoorDef {
  id: string;
  level: Level;
  a: [number, number];
  b: [number, number];
  kind: DoorKind;
  inside?: [number, number];
  when?: When;
}

export type PortalKind = 'stairs' | 'ladder' | 'climb' | 'rope';

export interface PortalDef {
  id: string;
  kind: PortalKind;
  a: TileRef;
  b: TileRef;
  time: number;
  when?: When;
}

export interface BlockerDef {
  id: string;
  level: Level;
  tiles?: number[][];
  rects?: number[][];
  exclude?: number[][];
  move: boolean;
  sight: boolean;
  canopy?: boolean;
  when?: When;
}

export interface CameraMount {
  id: string;
  level: Level;
  x: number;
  z: number;
  mount: number;
  yaw: number;
  wall: string;
}

export interface LayoutData {
  grid: { w: number; h: number };
  levels: Record<Level, { y: number; height: number }>;
  areas: AreaDef[];
  solids: Array<{ id: string; level: Level; rects: number[][]; when?: When }>;
  doors: DoorDef[];
  portals: PortalDef[];
  blockers: BlockerDef[];
  cameras: CameraMount[];
  anchors: Record<string, { level: Level; x?: number; z?: number; tiles?: number[][]; path?: number[][]; [k: string]: unknown }>;
  oakSites: Record<string, [number, number]>;
}

export const LAYOUT = layoutJson as unknown as LayoutData;
export const GRID_W = LAYOUT.grid.w;
export const GRID_H = LAYOUT.grid.h;

export interface EdgeInfo {
  /** static wall/fence on this edge (null = open) */
  wall: Boundary | null;
  door: DoorDef | null;
}

export interface WorldGrid {
  facts: Facts;
  /** active area per tile (null = not part of any active area) */
  area: Record<Level, Array<AreaDef | null>>;
  /** walkable for movement (area walkable and not blocked by a move blocker) */
  walk: Record<Level, Uint8Array>;
  /** tiles that stop sight: solid footprints, closed rooms, sight blockers */
  opaque: Record<Level, Uint8Array>;
  /** canopy tiles (hide what is under them from observers outside the canopy) */
  canopy: Record<Level, Uint8Array>;
  /** blocker ids covering each tile (for UI feedback) */
  blockerAt: Record<Level, Array<string | null>>;
  edges: Map<string, EdgeInfo>;
  doors: DoorDef[];
  portals: PortalDef[];
  blockers: BlockerDef[];
}

export function idx(x: number, z: number): number {
  return z * GRID_W + x;
}

export function inBounds(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < GRID_W && z < GRID_H;
}

/** Edge key between two 4-adjacent tiles (order independent). */
export function edgeKey(level: Level, ax: number, az: number, bx: number, bz: number): string {
  if (ax === bx) {
    const z = Math.min(az, bz);
    return `${level}:${ax},${z}:S`;
  }
  const x = Math.min(ax, bx);
  return `${level}:${x},${az}:E`;
}

function rectTiles(rects: number[][] | undefined, out: Array<[number, number]>): void {
  for (const r of rects ?? []) {
    const [x0, z0, x1, z1] = r;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]);
  }
}

export function blockerTiles(b: BlockerDef): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const t of b.tiles ?? []) out.push([t[0], t[1]]);
  rectTiles(b.rects, out);
  if (b.exclude) {
    const ex = new Set(b.exclude.map((t) => `${t[0]},${t[1]}`));
    return out.filter(([x, z]) => !ex.has(`${x},${z}`));
  }
  return out;
}

function perLevel<T>(make: () => T): Record<Level, T> {
  const out = {} as Record<Level, T>;
  for (const l of LEVELS) out[l] = make();
  return out;
}

const gridCache = new Map<string, WorldGrid>();

export function buildGrid(facts: Facts, cacheKey?: string): WorldGrid {
  if (cacheKey) {
    const hit = gridCache.get(cacheKey);
    if (hit) return hit;
  }
  const n = GRID_W * GRID_H;
  const area = perLevel<Array<AreaDef | null>>(() => new Array(n).fill(null));
  const walk = perLevel(() => new Uint8Array(n));
  const opaque = perLevel(() => new Uint8Array(n));
  const canopy = perLevel(() => new Uint8Array(n));
  const blockerAt = perLevel<Array<string | null>>(() => new Array(n).fill(null));

  for (const a of LAYOUT.areas) {
    if (!evalWhen(a.when, facts)) continue;
    const tiles: Array<[number, number]> = [];
    rectTiles(a.rects, tiles);
    for (const [x, z] of tiles) {
      const i = idx(x, z);
      if (area[a.level][i]) throw new Error(`Areas overlap at ${a.level}:${x},${z} (${area[a.level][i]!.id} / ${a.id})`);
      area[a.level][i] = a;
      if (a.walkable === false) opaque[a.level][i] = 1;
      else walk[a.level][i] = 1;
    }
  }
  for (const s of LAYOUT.solids) {
    if (!evalWhen(s.when, facts)) continue;
    const tiles: Array<[number, number]> = [];
    rectTiles(s.rects, tiles);
    for (const [x, z] of tiles) {
      const i = idx(x, z);
      if (walk[s.level][i]) throw new Error(`Solid ${s.id} covers walkable tile ${s.level}:${x},${z}`);
      opaque[s.level][i] = 1;
    }
  }
  const blockers: BlockerDef[] = [];
  for (const b of LAYOUT.blockers) {
    if (!evalWhen(b.when, facts)) continue;
    blockers.push(b);
    for (const [x, z] of blockerTiles(b)) {
      const i = idx(x, z);
      if (b.move) {
        walk[b.level][i] = 0;
        blockerAt[b.level][i] = b.id;
      }
      if (b.canopy) canopy[b.level][i] = 1;
      else if (b.sight) opaque[b.level][i] = 1;
    }
  }

  const doors = LAYOUT.doors.filter((d) => evalWhen(d.when, facts));
  const doorByEdge = new Map<string, DoorDef>();
  for (const d of doors) {
    const k = edgeKey(d.level, d.a[0], d.a[1], d.b[0], d.b[1]);
    if (Math.abs(d.a[0] - d.b[0]) + Math.abs(d.a[1] - d.b[1]) !== 1) throw new Error(`Door ${d.id} is not on a tile edge`);
    doorByEdge.set(k, d);
  }

  const edges = new Map<string, EdgeInfo>();
  for (const level of LEVELS) {
    for (let z = 0; z < GRID_H; z++) {
      for (let x = 0; x < GRID_W; x++) {
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ]) {
          const bx = x + dx;
          const bz = z + dz;
          if (!inBounds(bx, bz)) continue;
          const A = area[level][idx(x, z)];
          const B = area[level][idx(bx, bz)];
          const key = edgeKey(level, x, z, bx, bz);
          const door = doorByEdge.get(key) ?? null;
          let wall: Boundary | null = null;
          if (A && B && A !== B && !(A.group && A.group === B.group)) {
            const ba = A.boundary ?? 'open';
            const bb = B.boundary ?? 'open';
            if (ba === 'wall' || bb === 'wall') wall = 'wall';
            else if (ba === 'fence' || bb === 'fence') wall = 'fence';
          } else if ((A && !B) || (!A && B)) {
            // an enclosed area facing empty space keeps its outer wall (sight never leaks out)
            if (((A ?? B)!.boundary ?? 'open') === 'wall') wall = 'wall';
          }
          if (door && !(A && B)) throw new Error(`Door ${door.id} does not join two active areas`);
          if (wall || door) edges.set(key, { wall, door });
        }
      }
    }
  }

  const portals = LAYOUT.portals.filter((p) => evalWhen(p.when, facts));
  for (const p of portals) {
    for (const end of [p.a, p.b]) {
      if (!walk[end.level][idx(end.x, end.z)]) throw new Error(`Portal ${p.id} ends on a non-walkable tile ${end.level}:${end.x},${end.z}`);
    }
  }

  const grid: WorldGrid = { facts, area, walk, opaque, canopy, blockerAt, edges, doors, portals, blockers };
  if (cacheKey) gridCache.set(cacheKey, grid);
  return grid;
}

export function areaAt(grid: WorldGrid, t: TileRef): AreaDef | null {
  if (!inBounds(t.x, t.z)) return null;
  return grid.area[t.level][idx(t.x, t.z)];
}

export function isWalkable(grid: WorldGrid, t: TileRef): boolean {
  return inBounds(t.x, t.z) && grid.walk[t.level][idx(t.x, t.z)] === 1;
}

export function levelY(level: Level): number {
  return LAYOUT.levels[level].y;
}
