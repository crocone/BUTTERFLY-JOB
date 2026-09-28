import type { ContractDef } from '../data/contracts';
import { CAMERAS, DELIVERY, GUARD_HEARING, guardARoute, guardBRoute, type CameraDef, type GuardDef, type Waypoint } from '../data/security';
import { factsSignature } from './causality';
import { buildGrid, LAYOUT, type DoorDef, type EdgeInfo, type WorldGrid } from './layout';
import { findPath, isPathFailure, THIEF_SPEED, type DoorPolicy, type PathFailure, type PathResult, type PathStep } from './nav';
import { evalWhen, type Facts, type Level, type TileRef } from './types';
import { canSee, defaultEdgeBlocks, type Observer, type SightContext } from './vision';

/**
 * The heist: a deterministic fixed-step simulation of the present day.
 * Given the same plan and the same sequence of thief commands, it always produces the same
 * outcome (used for automated solution tests and for the replay).
 */

export const DT = 1 / 30;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Patrol routes
// ---------------------------------------------------------------------------------------------

interface RouteEntry {
  kind: 'walk' | 'pause';
  t0: number;
  duration: number;
  /** walk: polyline in tile-centre coordinates */
  pts?: Array<[number, number]>;
  lengths?: number[];
  total?: number;
  /** pause */
  at?: [number, number];
  face?: number;
  note?: string;
}

export interface PatrolRoute {
  guard: GuardDef;
  entries: RouteEntry[];
  duration: number;
  /** full polyline (for overlays) */
  polyline: Array<[number, number]>;
  stops: Array<{ x: number; z: number; pause: number; face?: number; note?: string }>;
}

const guardDoorPolicy: DoorPolicy = (d) => (d.kind === 'open' || d.kind === 'gate' ? 'pass' : 'block');

function buildRoute(grid: WorldGrid, guard: GuardDef): PatrolRoute {
  const entries: RouteEntry[] = [];
  const polyline: Array<[number, number]> = [];
  const stops: PatrolRoute['stops'] = [];
  let t = 0;
  const wps = guard.waypoints;
  for (let i = 0; i < wps.length; i++) {
    const a: Waypoint = wps[i];
    const b: Waypoint = wps[(i + 1) % wps.length];
    if (a.pause) {
      entries.push({ kind: 'pause', t0: t, duration: a.pause, at: [a.x + 0.5, a.z + 0.5], face: a.face, note: a.note });
      stops.push({ x: a.x, z: a.z, pause: a.pause, face: a.face, note: a.note });
      t += a.pause;
    }
    const res = findPath(grid, { level: guard.level, x: a.x, z: a.z }, { level: guard.level, x: b.x, z: b.z }, { doorPolicy: guardDoorPolicy, speed: guard.speed });
    if (isPathFailure(res)) throw new Error(`${guard.id} route broken between (${a.x},${a.z}) and (${b.x},${b.z}): ${res.reason}`);
    const pts = res.steps.map((s) => [s.x + 0.5, s.z + 0.5] as [number, number]);
    const lengths: number[] = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      lengths.push(L);
      total += L;
    }
    if (total > 0) {
      const duration = total / guard.speed;
      entries.push({ kind: 'walk', t0: t, duration, pts, lengths, total });
      t += duration;
      for (const p of pts) polyline.push(p);
    }
  }
  return { guard, entries, duration: t, polyline, stops };
}

export interface GuardPose {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  note?: string;
}

export function routePose(route: PatrolRoute, progress: number): GuardPose {
  const t = ((progress % route.duration) + route.duration) % route.duration;
  let e = route.entries[route.entries.length - 1];
  for (const entry of route.entries) {
    if (t < entry.t0 + entry.duration) {
      e = entry;
      break;
    }
  }
  if (e.kind === 'pause') {
    // face given direction, or keep the heading of the previous walk
    let yaw = e.face !== undefined ? e.face * DEG : 0;
    if (e.face === undefined) {
      const i = route.entries.indexOf(e);
      const prev = route.entries[(i - 1 + route.entries.length) % route.entries.length];
      if (prev.pts && prev.pts.length > 1) {
        const n = prev.pts.length;
        yaw = Math.atan2(prev.pts[n - 1][1] - prev.pts[n - 2][1], prev.pts[n - 1][0] - prev.pts[n - 2][0]);
      }
    }
    return { x: e.at![0], z: e.at![1], yaw, moving: false, note: e.note };
  }
  let d = ((t - e.t0) / e.duration) * e.total!;
  const pts = e.pts!;
  for (let k = 0; k < e.lengths!.length; k++) {
    const L = e.lengths![k];
    if (d <= L || k === e.lengths!.length - 1) {
      const f = L > 0 ? Math.min(1, d / L) : 0;
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, yaw: Math.atan2(bz - az, bx - ax), moving: true };
    }
    d -= L;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], z: last[1], yaw: 0, moving: true };
}

// ---------------------------------------------------------------------------------------------
// Present-day world (grid + security) for a contract and a timeline
// ---------------------------------------------------------------------------------------------

export interface CameraInstance {
  def: CameraDef;
  level: Level;
  x: number;
  z: number;
  baseYaw: number;
  circuit: boolean;
}

export interface DeliveryInstance {
  stop: 'square' | 'lane';
  door: DoorDef;
  vanTiles: Array<[number, number]>;
  courierPath: Array<[number, number]>;
  walkTime: number;
}

export interface PresentWorld {
  contract: ContractDef;
  facts: Facts;
  grid: WorldGrid;
  routes: PatrolRoute[];
  cameras: CameraInstance[];
  delivery: DeliveryInstance | null;
  junction: TileRef | null;
  target: TileRef;
  start: TileRef;
  exit: TileRef;
}

const worldCache = new Map<string, PresentWorld>();

export function presentWorld(contract: ContractDef, facts: Facts): PresentWorld {
  const key = `${contract.id}|${factsSignature(facts)}`;
  const hit = worldCache.get(key);
  if (hit) return hit;
  const grid = buildGrid(facts, factsSignature(facts));
  const routes = [buildRoute(grid, guardARoute(contract)), buildRoute(grid, guardBRoute(facts))];
  const cameras: CameraInstance[] = [];
  for (const def of CAMERAS) {
    if (!evalWhen(def.when, facts)) continue;
    const mount = LAYOUT.cameras.find((c) => c.id === def.id)!;
    cameras.push({ def, level: mount.level, x: mount.x + 0.5, z: mount.z + 0.5, baseYaw: mount.yaw * DEG, circuit: contract.circuitCameras.includes(def.id) });
  }
  const stop = facts['delivery.stop'] === 'lane' ? 'lane' : 'square';
  const doorId = stop === 'lane' ? 'door.bank.service_alley' : 'door.bank.service_front';
  const door = grid.doors.find((d) => d.id === doorId) ?? null;
  let delivery: DeliveryInstance | null = null;
  if (door) {
    const van = LAYOUT.anchors[`van.${stop}`].tiles as number[][];
    const path = LAYOUT.anchors[`courier.${stop}`].path as number[][];
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    delivery = {
      stop,
      door,
      vanTiles: van.map((t) => [t[0], t[1]] as [number, number]),
      courierPath: path.map((t) => [t[0] + 0.5, t[1] + 0.5] as [number, number]),
      walkTime: len / DELIVERY.courierSpeed,
    };
  }
  const j = LAYOUT.anchors.junction;
  const junction = facts['junction.box'] !== 'none' ? { level: j.level, x: j.x!, z: j.z! } : null;
  const start = LAYOUT.anchors.start;
  const exit = LAYOUT.anchors.exit;
  const w: PresentWorld = {
    contract,
    facts,
    grid,
    routes,
    cameras,
    delivery,
    junction,
    target: { level: contract.target.level, x: contract.target.x, z: contract.target.z },
    start: { level: start.level, x: start.x!, z: start.z! },
    exit: { level: exit.level, x: exit.x!, z: exit.z! },
  };
  worldCache.set(key, w);
  return w;
}

/** Delivery phase at time t: where the van/courier are and whether the door is propped open. */
export interface DeliveryState {
  vanPresent: boolean;
  /** 0..1 arrival/leave animation */
  vanArrive: number;
  courier: { x: number; z: number; yaw: number } | null;
  doorOpen: boolean;
  /** seconds until the door next opens (0 when open) */
  nextOpenIn: number;
  /** seconds until the propped door closes again (0 when closed) */
  closesIn: number;
  cycleTime: number;
}

export function deliveryState(d: DeliveryInstance | null, t: number): DeliveryState {
  if (!d) return { vanPresent: false, vanArrive: 0, courier: null, doorOpen: false, nextOpenIn: Infinity, closesIn: 0, cycleTime: 0 };
  const { firstArrival, period, arriveTime, insideTime, leaveTime } = DELIVERY;
  const openAt = arriveTime + d.walkTime;
  const closeAt = openAt + insideTime;
  const backAt = closeAt + d.walkTime;
  const goneAt = backAt + leaveTime;
  if (t < firstArrival) {
    return { vanPresent: false, vanArrive: 0, courier: null, doorOpen: false, nextOpenIn: firstArrival - t + openAt, closesIn: 0, cycleTime: -1 };
  }
  const u = (t - firstArrival) % period;
  const vanPresent = u < goneAt;
  const vanArrive = u < arriveTime ? u / arriveTime : u > backAt ? Math.max(0, 1 - (u - backAt) / leaveTime) : 1;
  let courier: DeliveryState['courier'] = null;
  const path = d.courierPath;
  const along = (f: number) => {
    // position along the courier path, f ∈ [0,1]
    const segs = path.length - 1;
    const x = Math.min(segs - 1e-6, Math.max(0, f * segs));
    const k = Math.floor(x);
    const r = x - k;
    const a = path[k];
    const b = path[Math.min(segs, k + 1)];
    return { x: a[0] + (b[0] - a[0]) * r, z: a[1] + (b[1] - a[1]) * r, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  if (u >= arriveTime && u < openAt) courier = along((u - arriveTime) / d.walkTime);
  else if (u >= closeAt && u < backAt) {
    const p = along(1 - (u - closeAt) / d.walkTime);
    courier = { ...p, yaw: p.yaw + Math.PI };
  }
  const doorOpen = u >= openAt && u < closeAt;
  const nextOpenIn = doorOpen ? 0 : u < openAt ? openAt - u : period - u + openAt;
  const closesIn = doorOpen ? closeAt - u : 0;
  return { vanPresent, vanArrive, courier, doorOpen, nextOpenIn, closesIn, cycleTime: u };
}

export function cameraYaw(c: CameraInstance, t: number): number {
  const d = c.def;
  if (d.rotate) return c.baseYaw + ((t / d.period + d.phase) % 1) * Math.PI * 2;
  if (!d.sweep) return c.baseYaw;
  return c.baseYaw + Math.sin((t / d.period + d.phase) * Math.PI * 2) * d.sweep * DEG;
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

export type Interactable = 'target' | 'junction' | 'exit';

export interface HeistEvent {
  t: number;
  type: 'spotted' | 'caught' | 'pickup' | 'powerCut' | 'portal' | 'door' | 'escaped' | 'waitDoor';
  observer?: string;
  id?: string;
  level?: Level;
  x?: number;
  z?: number;
}

export type ThiefAnim = 'idle' | 'walk' | 'climb' | 'stairs' | 'interact' | 'crouch';

export interface ThiefView {
  level: Level;
  x: number;
  z: number;
  /** vertical blend for portals (0 = from level, 1 = to level) */
  portal?: { id: string; kind: string; from: TileRef; to: TileRef; f: number };
  yaw: number;
  anim: ThiefAnim;
  carrying: boolean;
}

export interface GuardView {
  id: string;
  level: Level;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  alert: boolean;
  seeing: boolean;
}

export interface CameraView {
  id: string;
  yaw: number;
  powered: boolean;
  seeing: boolean;
}

export interface Snapshot {
  t: number;
  thief: ThiefView;
  guards: GuardView[];
  cameras: CameraView[];
  delivery: DeliveryState;
  power: boolean;
  meter: number;
}

export interface CommandResult {
  ok: boolean;
  failure?: PathFailure;
  path?: PathResult;
}

interface GuardRuntime {
  route: PatrolRoute;
  progress: number;
  alert: boolean;
  lost: number;
  pose: GuardPose;
  seeing: boolean;
}

export class HeistSim {
  readonly world: PresentWorld;
  t = 0;
  status: 'running' | 'caught' | 'escaped' = 'running';
  meter = 0;
  detections = 0;
  power = true;
  carrying = false;
  events: HeistEvent[] = [];
  caughtBy: HeistEvent | null = null;
  /** thief */
  private tile: TileRef;
  private px: number;
  private pz: number;
  private level: Level;
  private yaw = -Math.PI / 2;
  private path: PathStep[] | null = null;
  private pathIndex = 0;
  private segT = 0;
  private portalT = 0;
  private action: { kind: Interactable; t: number; duration: number } | null = null;
  private pendingInteract: Interactable | null = null;
  private hold = false;
  private waitingDoor: DoorDef | null = null;
  private spotted = false;
  private unseen = 0;
  private guards: GuardRuntime[];
  private camSeeing = new Map<string, boolean>();
  private lastObserver = '';
  readonly preview: boolean;
  /** recorded snapshots (10 Hz) for the replay */
  readonly recording: Snapshot[] = [];
  private tick = 0;
  /** portals and doors used, in order (approach classification) */
  readonly used: string[] = [];

  constructor(world: PresentWorld, opts: { preview?: boolean; startTime?: number } = {}) {
    this.world = world;
    this.preview = !!opts.preview;
    this.t = opts.startTime ?? 0;
    this.tile = { ...world.start };
    this.px = world.start.x + 0.5;
    this.pz = world.start.z + 0.5;
    this.level = world.start.level;
    this.guards = world.routes.map((route) => ({ route, progress: this.t, alert: false, lost: 0, pose: routePose(route, this.t), seeing: false }));
  }

  // -- door rules ---------------------------------------------------------------------------
  delivery(): DeliveryState {
    return deliveryState(this.world.delivery, this.t);
  }

  doorPassableNow(d: DoorDef, from: TileRef): boolean {
    switch (d.kind) {
      case 'open':
      case 'gate':
      case 'roofdoor':
        return true;
      case 'locked':
        return false;
      case 'service':
        if (d.inside && from.x === d.inside[0] && from.z === d.inside[1]) return true; // push bar
        return this.world.delivery?.door.id === d.id && this.delivery().doorOpen;
      case 'glass':
        return this.world.contract.glassDoor === 'laser' && !this.power;
      case 'vault':
        return this.world.contract.vaultDoor === 'maglock' && !this.power;
    }
    return false;
  }

  /** Door policy used when planning a path from the current moment. */
  readonly planPolicy: DoorPolicy = (d, from) => {
    if (this.doorPassableNow(d, from)) return 'pass';
    if (d.kind === 'service' && this.world.delivery?.door.id === d.id) return 'wait';
    return 'block';
  };

  /** Line-of-sight rules at time `t` (defaults to now; the replay asks for recorded moments). */
  sightContext(t = this.t): SightContext {
    const del = deliveryState(this.world.delivery, t);
    const propped = del.doorOpen ? this.world.delivery?.door.id : undefined;
    const dyn = new Set<string>();
    if (del.vanPresent && this.world.delivery) for (const [x, z] of this.world.delivery.vanTiles) dyn.add(`G:${x},${z}`);
    const edgeBlocks = (key: string, info: EdgeInfo): boolean => {
      const d = info.door;
      if (d && d.kind === 'service') return d.id !== propped;
      // vault: a released maglock unlocks the door, but it stays a closed, opaque door
      return defaultEdgeBlocks(key, info);
    };
    return { grid: this.world.grid, edgeBlocks, dynamicOpaque: dyn };
  }

  blockedNow(): Set<string> {
    const s = new Set<string>();
    const del = this.delivery();
    if (del.vanPresent && this.world.delivery) for (const [x, z] of this.world.delivery.vanTiles) s.add(`G:${x},${z}`);
    return s;
  }

  // -- commands -----------------------------------------------------------------------------
  interactionTile(what: Interactable): TileRef | null {
    if (what === 'target') return this.world.target;
    if (what === 'junction') return this.world.junction;
    return this.world.exit;
  }

  /** Tile the thief will stand on when the current step completes (paths start there). */
  private planOrigin(): { from: TileRef; prefix: PathStep[] } {
    if (this.path && this.segT > 0 && this.pathIndex < this.path.length) {
      const cur = this.path[this.pathIndex];
      return { from: { level: cur.level, x: cur.x, z: cur.z }, prefix: [{ ...this.tile, via: 'start' }, cur] };
    }
    return { from: this.tile, prefix: [] };
  }

  planTo(to: TileRef): PathResult | PathFailure {
    return findPath(this.world.grid, this.planOrigin().from, to, { doorPolicy: this.planPolicy, blocked: this.blockedNow() });
  }

  moveTo(to: TileRef): CommandResult {
    if (this.status !== 'running' || this.action) return { ok: false };
    if (this.inPortal()) return { ok: false };
    const { prefix } = this.planOrigin();
    const res = this.planTo(to);
    if (isPathFailure(res)) return { ok: false, failure: res };
    if (prefix.length) {
      // finish the step in progress, then follow the new route
      this.path = [...prefix, ...res.steps.slice(1)];
      this.pathIndex = 1;
    } else {
      this.path = res.steps;
      this.pathIndex = 1;
      this.segT = 0;
    }
    this.pendingInteract = null;
    this.waitingDoor = null;
    return { ok: true, path: res };
  }

  interact(what: Interactable): CommandResult {
    if (what === 'junction' && (!this.world.junction || !this.power)) return { ok: false };
    if (what === 'target' && this.carrying) return { ok: false };
    const tile = this.interactionTile(what);
    if (!tile) return { ok: false };
    if (sameTile(tile, this.tile) && !this.path) {
      this.startAction(what);
      return { ok: true };
    }
    const r = this.moveTo(tile);
    if (r.ok) this.pendingInteract = what;
    return r;
  }

  setHold(hold: boolean): void {
    this.hold = hold;
  }

  stop(): void {
    if (this.inPortal()) return;
    if (this.path && this.segT > 0) {
      // finish the current step to stay on the grid
      this.path = this.path.slice(0, this.pathIndex + 1);
    } else {
      this.path = null;
    }
    this.pendingInteract = null;
  }

  get thiefTile(): TileRef {
    return this.tile;
  }

  get busy(): boolean {
    return !!this.path || !!this.action;
  }

  get waitingForDoor(): DoorDef | null {
    return this.waitingDoor;
  }

  private inPortal(): boolean {
    return !!this.path && this.pathIndex < this.path.length && this.path[this.pathIndex].via === 'portal' && this.portalT > 0;
  }

  private startAction(what: Interactable) {
    if (what === 'exit') {
      if (this.carrying) this.finish();
      return;
    }
    const duration = what === 'target' ? 1.2 : 1.0;
    this.action = { kind: what, t: 0, duration };
  }

  private finish() {
    this.status = 'escaped';
    this.events.push({ t: this.t, type: 'escaped', level: this.level, x: this.tile.x, z: this.tile.z });
  }

  // -- stepping -------------------------------------------------------------------------------
  step(): void {
    if (this.status !== 'running') return;
    this.t += DT;
    this.tick++;
    if (!this.preview) this.stepThief();
    this.stepGuardsAndDetection();
    // the planning preview runs indefinitely and is never replayed: only real heists record
    if (!this.preview && this.tick % 3 === 0) this.recording.push(this.snapshot());
  }

  run(seconds: number): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n && this.status === 'running'; i++) this.step();
  }

  private stepThief() {
    if (this.action) {
      this.action.t += DT;
      if (this.action.t >= this.action.duration) {
        const kind = this.action.kind;
        this.action = null;
        if (kind === 'target' && !this.carrying) {
          this.carrying = true;
          this.events.push({ t: this.t, type: 'pickup', level: this.level, x: this.tile.x, z: this.tile.z });
        } else if (kind === 'junction' && this.power) {
          this.power = false;
          this.events.push({ t: this.t, type: 'powerCut', level: this.level, x: this.tile.x, z: this.tile.z });
          this.used.push('powerCut');
        }
      }
      return;
    }
    if (!this.path) return;
    if (this.hold && !this.inPortal()) return;
    let budget = THIEF_SPEED * DT; // tiles of movement this tick
    while (this.path && budget > 1e-9) {
      if (this.pathIndex >= this.path.length) {
        this.arrive();
        break;
      }
      const next = this.path[this.pathIndex];
      if (next.via === 'portal' && next.portal) {
        const p = next.portal;
        if (this.portalT === 0) {
          this.events.push({ t: this.t, type: 'portal', id: p.id, level: this.level, x: this.tile.x, z: this.tile.z });
          this.used.push(p.id);
        }
        this.portalT += DT;
        const f = Math.min(1, this.portalT / p.time);
        this.px = this.tile.x + 0.5 + (next.x - this.tile.x) * f;
        this.pz = this.tile.z + 0.5 + (next.z - this.tile.z) * f;
        this.level = f < 0.5 ? this.tile.level : next.level;
        if (f >= 1) {
          this.tile = { level: next.level, x: next.x, z: next.z };
          this.level = next.level;
          this.px = next.x + 0.5;
          this.pz = next.z + 0.5;
          this.portalT = 0;
          this.pathIndex++;
        }
        break; // portals consume the whole tick
      }
      if (this.segT === 0 && next.door) {
        if (!this.doorPassableNow(next.door, this.tile)) {
          if (this.waitingDoor !== next.door) {
            this.waitingDoor = next.door;
            this.events.push({ t: this.t, type: 'waitDoor', id: next.door.id, level: this.level, x: this.tile.x, z: this.tile.z });
          }
          // can it still ever open?  if not, give up the path
          if (this.planPolicy(next.door, this.tile, next) === 'block') this.path = null;
          break;
        }
        if (this.waitingDoor || next.door.kind === 'service') {
          this.events.push({ t: this.t, type: 'door', id: next.door.id, level: this.level, x: this.tile.x, z: this.tile.z });
          if (!(next.door.inside && this.tile.x === next.door.inside[0] && this.tile.z === next.door.inside[1])) this.used.push(next.door.id);
        }
        if (next.door.id === 'door.bank.upper_service' && !this.used.includes(next.door.id)) this.used.push(next.door.id);
        this.waitingDoor = null;
      }
      if (next.via === 'walk' && this.blockedNow().has(`${next.level}:${next.x},${next.z}`)) break; // van in the way
      const dx = next.x - this.tile.x;
      const dz = next.z - this.tile.z;
      const segLen = Math.hypot(dx, dz) || 1;
      const remaining = (1 - this.segT) * segLen;
      const move = Math.min(budget, remaining);
      this.segT += move / segLen;
      budget -= move;
      this.yaw = Math.atan2(dz, dx);
      this.px = this.tile.x + 0.5 + dx * this.segT;
      this.pz = this.tile.z + 0.5 + dz * this.segT;
      if (this.segT >= 1 - 1e-9) {
        this.tile = { level: next.level, x: next.x, z: next.z };
        this.px = next.x + 0.5;
        this.pz = next.z + 0.5;
        this.segT = 0;
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.arrive();
          break;
        }
      }
    }
  }

  private arrive() {
    this.path = null;
    this.pathIndex = 0;
    this.segT = 0;
    const pending = this.pendingInteract;
    this.pendingInteract = null;
    if (pending) this.startAction(pending);
    else if (this.carrying && sameTile(this.tile, this.world.exit)) this.finish();
  }

  private observers(): Array<{ id: string; obs: Observer; guard?: GuardRuntime; alert: number }> {
    const out: Array<{ id: string; obs: Observer; guard?: GuardRuntime; alert: number }> = [];
    for (const g of this.guards) {
      out.push({ id: g.route.guard.id, guard: g, alert: 1, obs: { level: g.route.guard.level, x: g.pose.x, z: g.pose.z, yaw: g.pose.yaw, fov: g.route.guard.fov * DEG, range: g.route.guard.range, near: GUARD_HEARING } });
    }
    for (const c of this.world.cameras) {
      if (c.circuit && !this.power) continue;
      out.push({ id: c.def.id, alert: c.def.alert ?? 1, obs: { level: c.level, x: c.x, z: c.z, yaw: cameraYaw(c, this.t), fov: c.def.fov * DEG, range: c.def.range } });
    }
    const del = this.delivery();
    if (del.courier) {
      out.push({ id: 'courier', alert: 1, obs: { level: 'G', x: del.courier.x, z: del.courier.z, yaw: del.courier.yaw, fov: DELIVERY.courierFov * DEG, range: DELIVERY.courierRange } });
    }
    return out;
  }

  private stepGuardsAndDetection() {
    for (const g of this.guards) {
      if (!g.alert) g.progress += DT;
      const base = routePose(g.route, g.progress);
      g.pose = g.alert ? { ...g.pose, moving: false } : base;
    }
    if (this.preview) {
      for (const g of this.guards) g.seeing = false;
      return;
    }
    const ctx = this.sightContext();
    let seen = false;
    let rate = 0;
    let who = '';
    this.camSeeing.clear();
    for (const o of this.observers()) {
      const r = canSee(ctx, o.obs, this.level, this.px, this.pz);
      if (o.guard) o.guard.seeing = r.visible;
      else this.camSeeing.set(o.id, r.visible);
      if (r.visible) {
        seen = true;
        // closer observers (and live-monitored cameras) fill the meter faster
        const k = o.alert / (0.8 + 0.18 * r.distance);
        if (k > rate) {
          rate = k;
          who = o.id;
        }
      }
    }
    for (const g of this.guards) {
      if (g.seeing) {
        g.alert = true;
        g.lost = 0;
        g.pose = { ...g.pose, yaw: Math.atan2(this.pz - g.pose.z, this.px - g.pose.x), moving: false };
      } else if (g.alert) {
        g.lost += DT;
        if (g.lost > 1.6) g.alert = false;
      }
    }
    if (seen) {
      this.unseen = 0;
      this.lastObserver = who;
      if (!this.spotted) {
        this.spotted = true;
        this.detections++;
        this.events.push({ t: this.t, type: 'spotted', observer: who, level: this.level, x: this.px, z: this.pz });
      }
      this.meter += DT * rate;
      if (this.meter >= 1) {
        this.meter = 1;
        this.status = 'caught';
        const ev: HeistEvent = { t: this.t, type: 'caught', observer: who, level: this.level, x: this.px, z: this.pz };
        this.caughtBy = ev;
        this.events.push(ev);
        this.recording.push(this.snapshot());
      }
    } else {
      this.unseen += DT;
      if (this.unseen > 1.0) this.spotted = false;
      this.meter = Math.max(0, this.meter - 0.4 * DT);
    }
  }

  // -- views ----------------------------------------------------------------------------------
  thiefView(): ThiefView {
    let anim: ThiefAnim = 'idle';
    let portal: ThiefView['portal'];
    if (this.action) anim = 'interact';
    else if (this.path && this.pathIndex < this.path.length) {
      const next = this.path[this.pathIndex];
      if (next.via === 'portal' && next.portal && this.portalT > 0) {
        anim = next.portal.kind === 'stairs' ? 'stairs' : 'climb';
        portal = { id: next.portal.id, kind: next.portal.kind, from: this.tile, to: next, f: Math.min(1, this.portalT / next.portal.time) };
      } else if (this.hold || this.waitingDoor) anim = 'crouch';
      else anim = 'walk';
    } else if (this.hold) anim = 'crouch';
    return { level: this.level, x: this.px, z: this.pz, yaw: this.yaw, anim, carrying: this.carrying, portal };
  }

  snapshot(): Snapshot {
    return {
      t: this.t,
      thief: this.thiefView(),
      guards: this.guards.map((g) => ({ id: g.route.guard.id, level: g.route.guard.level, x: g.pose.x, z: g.pose.z, yaw: g.pose.yaw, moving: g.pose.moving, alert: g.alert, seeing: g.seeing })),
      cameras: this.world.cameras.map((c) => ({ id: c.def.id, yaw: cameraYaw(c, this.t), powered: !(c.circuit && !this.power), seeing: this.camSeeing.get(c.def.id) ?? false })),
      delivery: this.delivery(),
      power: this.power,
      meter: this.meter,
    };
  }

  lastSeenBy(): string {
    return this.lastObserver;
  }

  /** Families of routes used (for the results screen). */
  approach(): string[] {
    const fam = new Set<string>();
    for (const u of this.used) {
      if (u === 'portal.manhole' || u === 'portal.hatch') fam.add('underground');
      if (u === 'portal.oak' || u === 'portal.skylight' || u === 'portal.roof_ladder' || u === 'door.bank.upper_service') fam.add('rooftop');
      if (u === 'door.bank.service_front' || u === 'door.bank.service_alley') fam.add('service');
      if (u === 'powerCut') fam.add('power');
    }
    // the preserved square oak used as cover for the watched front door
    if (this.used.includes('door.bank.service_front') && this.world.facts['oak.squareCanopy'] === true) fam.add('canopy');
    return [...fam];
  }
}

export function sameTile(a: TileRef, b: TileRef): boolean {
  return a.level === b.level && a.x === b.x && a.z === b.z;
}
