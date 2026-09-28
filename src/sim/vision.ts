import { edgeKey, GRID_H, GRID_W, idx, type EdgeInfo, type WorldGrid } from './layout';
import type { Level } from './types';

/**
 * Line of sight on the tile grid (Amanatides–Woo traversal).
 * Blocks: wall edges, closed doors, opaque tiles (buildings, closed rooms, props), canopies
 * (for observers outside the canopy) and dynamic blockers such as the delivery van.
 * Observers only see their own level — no detection through floors.
 */

export interface Observer {
  level: Level;
  /** continuous position in tile units (tile x spans [x, x+1)) */
  x: number;
  z: number;
  /** facing in radians; 0 = +x (east), π/2 = +z (south) */
  yaw: number;
  fov: number;
  range: number;
}

export interface SightContext {
  grid: WorldGrid;
  /** does this edge currently block sight? (walls, closed doors) */
  edgeBlocks: (key: string, info: EdgeInfo) => boolean;
  /** extra opaque tiles right now, keyed `${level}:${x},${z}` */
  dynamicOpaque?: Set<string>;
}

export function defaultEdgeBlocks(_key: string, info: EdgeInfo): boolean {
  if (info.door) {
    switch (info.door.kind) {
      case 'open':
      case 'gate':
      case 'glass':
        return false;
      default:
        return true;
    }
  }
  return info.wall === 'wall';
}

function edgeBlocked(ctx: SightContext, level: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const k = edgeKey(level, ax, az, bx, bz);
  const info = ctx.grid.edges.get(k);
  return info ? ctx.edgeBlocks(k, info) : false;
}

function tileBlocks(ctx: SightContext, level: Level, x: number, z: number, isEnd: boolean, obsInCanopy: boolean): boolean {
  if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) return true;
  const i = idx(x, z);
  if (!obsInCanopy && ctx.grid.canopy[level][i]) return true;
  if (isEnd) return false;
  if (ctx.grid.opaque[level][i]) return true;
  if (ctx.dynamicOpaque?.has(`${level}:${x},${z}`)) return true;
  return false;
}

/**
 * Walk the segment (ax,az)→(bx,bz) on `level`.  Returns the parameter t∈[0,1] where sight is
 * first blocked, or 1 when the end is reached unobstructed.  `endIsTarget` treats the final tile
 * as the target's own tile (not opaque, but still hidden under a canopy).
 */
export function traceSight(
  ctx: SightContext,
  level: Level,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  endIsTarget: boolean,
): number {
  let cx = Math.floor(ax);
  let cz = Math.floor(az);
  const ex = Math.floor(bx);
  const ez = Math.floor(bz);
  const obsInCanopy = cx >= 0 && cz >= 0 && cx < GRID_W && cz < GRID_H && ctx.grid.canopy[level][idx(cx, cz)] === 1;
  const dx = bx - ax;
  const dz = bz - az;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - ax) / dx : stepX < 0 ? (cx - ax) / dx : Infinity;
  let tMaxZ = stepZ > 0 ? (cz + 1 - az) / dz : stepZ < 0 ? (cz - az) / dz : Infinity;
  let guard = 0;
  const eps = 1e-9;
  while (!(cx === ex && cz === ez)) {
    if (++guard > 256) return 0;
    let tEnter: number;
    if (Math.abs(tMaxX - tMaxZ) < eps) {
      // passing exactly through a corner: blocked if either way round is blocked
      tEnter = tMaxX;
      if (tEnter > 1) return 1;
      const nx = cx + stepX;
      const nz = cz + stepZ;
      const viaX =
        edgeBlocked(ctx, level, cx, cz, nx, cz) ||
        tileBlocks(ctx, level, nx, cz, false, obsInCanopy) ||
        edgeBlocked(ctx, level, nx, cz, nx, nz);
      const viaZ =
        edgeBlocked(ctx, level, cx, cz, cx, nz) ||
        tileBlocks(ctx, level, cx, nz, false, obsInCanopy) ||
        edgeBlocked(ctx, level, cx, nz, nx, nz);
      if (viaX || viaZ) return tEnter;
      cx = nx;
      cz = nz;
      tMaxX += tDeltaX;
      tMaxZ += tDeltaZ;
    } else if (tMaxX < tMaxZ) {
      tEnter = tMaxX;
      if (tEnter > 1) return 1;
      if (edgeBlocked(ctx, level, cx, cz, cx + stepX, cz)) return tEnter;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      tEnter = tMaxZ;
      if (tEnter > 1) return 1;
      if (edgeBlocked(ctx, level, cx, cz, cx, cz + stepZ)) return tEnter;
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    const isEnd = cx === ex && cz === ez;
    if (tileBlocks(ctx, level, cx, cz, isEnd && endIsTarget, obsInCanopy)) return tEnter;
  }
  return 1;
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface SeeResult {
  visible: boolean;
  distance: number;
}

export function canSee(ctx: SightContext, obs: Observer, level: Level, tx: number, tz: number): SeeResult {
  const dx = tx - obs.x;
  const dz = tz - obs.z;
  const distance = Math.hypot(dx, dz);
  if (level !== obs.level || distance > obs.range) return { visible: false, distance };
  if (distance > 0.35) {
    const ang = Math.atan2(dz, dx);
    if (Math.abs(angleDiff(ang, obs.yaw)) > obs.fov / 2) return { visible: false, distance };
  }
  const t = traceSight(ctx, level, obs.x, obs.z, tx, tz, true);
  return { visible: t >= 1, distance };
}

/** Visibility fan for overlays: end points of rays across the field of view. */
export function visionFan(ctx: SightContext, obs: Observer, rays = 24): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= rays; i++) {
    const a = obs.yaw - obs.fov / 2 + (obs.fov * i) / rays;
    const ex = obs.x + Math.cos(a) * obs.range;
    const ez = obs.z + Math.sin(a) * obs.range;
    const t = traceSight(ctx, obs.level, obs.x, obs.z, ex, ez, false);
    const tt = Math.max(0, Math.min(1, t));
    pts.push([obs.x + (ex - obs.x) * tt, obs.z + (ez - obs.z) * tt]);
  }
  return pts;
}
