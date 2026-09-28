import type { ContractDef } from './contracts';
import type { Facts, Level, When } from '../sim/types';

/**
 * Present-day (2026) security definitions.  Guard B's route is derived from the timeline facts
 * so every change has a readable cause (kept alley → alley round, café open → coffee stop,
 * paved garden → walks around the Garden Wing).
 */

export interface Waypoint {
  x: number;
  z: number;
  /** seconds to stand still here */
  pause?: number;
  /** facing while paused, degrees (0 = east, 90 = south, 180 = west, 270 = north) */
  face?: number;
  /** why this stop exists (text key suffix, shown in the guard card) */
  note?: string;
}

export interface GuardDef {
  id: 'guardA' | 'guardB';
  level: Level;
  waypoints: Waypoint[];
  speed: number;
  fov: number;
  range: number;
}

export interface CameraDef {
  id: string;
  fov: number;
  range: number;
  /** sweep amplitude in degrees (0 = static); ignored when `rotate` */
  sweep: number;
  period: number;
  phase: number;
  rotate?: boolean;
  /** detection speed multiplier (live-monitored cameras fill the meter faster) */
  alert?: number;
  when?: When;
}

export const GUARD_SPEED = 1.4;
export const GUARD_FOV = 90;
export const GUARD_RANGE = 6;

export const CAMERAS: readonly CameraDef[] = [
  { id: 'C1', fov: 70, range: 8, sweep: 40, period: 9, phase: 0 },
  // basement: looks down the corridor only part of each sweep (walls the rest of the time)
  { id: 'C2', fov: 40, range: 10, sweep: 55, period: 8, phase: 0.25 },
  { id: 'C3', fov: 60, range: 7, sweep: 35, period: 8, phase: 0.1 },
  { id: 'C4', fov: 60, range: 6, sweep: 0, period: 8, phase: 0, rotate: true },
  // square: static, live-monitored; covers the bank front but not the café side of the square
  { id: 'C5', fov: 70, range: 9, sweep: 0, period: 1, phase: 0, alert: 2.5 },
  // roof: alternates between the oak landing and the ladder end of the annex roof
  { id: 'C6', fov: 45, range: 8, sweep: 50, period: 10, phase: 0.5, when: [['roof.camera', '==', true]] },
];

const GUARD_A_ROUTES: Record<ContractDef['guardA'], { level: Level; waypoints: Waypoint[] }> = {
  lobby: {
    level: 'G',
    waypoints: [
      { x: 14, z: 8 },
      { x: 19, z: 8, pause: 1.5, face: 90, note: 'mainDoors' },
      { x: 19, z: 6 },
      { x: 14, z: 6 },
      { x: 13, z: 7, pause: 3, face: 180, note: 'serviceCorridor' },
    ],
  },
  upper: {
    level: 'U',
    waypoints: [
      { x: 12, z: 6 },
      { x: 19, z: 6, pause: 2, face: 0, note: 'roofDoor' },
      { x: 19, z: 5 },
      { x: 16, z: 5, pause: 2.5, face: 270, note: 'glassRoom' },
      { x: 12, z: 5, pause: 1.5, face: 180, note: 'stairwell' },
    ],
  },
  basement: {
    level: 'B',
    waypoints: [
      { x: 11, z: 6 },
      { x: 15, z: 5 },
      { x: 15, z: 3, pause: 3, face: 270, note: 'archive' },
      { x: 15, z: 5 },
      { x: 18, z: 5, pause: 2, face: 270, note: 'vault' },
      { x: 13, z: 6 },
      { x: 12, z: 6 },
      { x: 12, z: 8, pause: 2, face: 90, note: 'boiler' },
      { x: 12, z: 6 },
    ],
  },
};

export function guardARoute(contract: ContractDef): GuardDef {
  const r = GUARD_A_ROUTES[contract.guardA];
  return { id: 'guardA', level: r.level, waypoints: r.waypoints, speed: GUARD_SPEED, fov: GUARD_FOV, range: GUARD_RANGE };
}

/** Guard B: outdoor round.  Built from the 2026 facts. */
export function guardBRoute(facts: Facts): GuardDef {
  const alley = facts['guardB.alley'] === true;
  const garden = facts['garden.exists'] === true;
  const coffee = facts['guardB.coffee'] === true;
  const wp: Waypoint[] = [{ x: 13, z: 11 }];
  if (garden) {
    wp.push({ x: 20, z: 11 }, { x: 21, z: 14 }, { x: 23, z: 14 }, { x: 26, z: 11 }, { x: 26, z: 8 });
  } else {
    // Garden Wing: walk round it by the street and the east walk
    wp.push({ x: 20, z: 11, pause: 1.5, face: 0, note: 'gardenWing' }, { x: 21, z: 18 }, { x: 28, z: 18 }, { x: 29, z: 16 }, { x: 29, z: 9 }, { x: 27, z: 8 });
  }
  if (alley) {
    wp.push({ x: 26, z: 3, pause: 2, face: 180, note: 'yard' }, { x: 25, z: 1 }, { x: 11, z: 1 }, { x: 10, z: 2 });
    wp.push({ x: 10, z: 8, pause: 1.5, face: 90, note: 'alley' }, { x: 10, z: 10 });
  } else {
    wp.push({ x: 26, z: 4, pause: 2.5, face: 270, note: 'yard' }, { x: 26, z: 8 });
    if (garden) wp.push({ x: 26, z: 11 }, { x: 23, z: 14 }, { x: 21, z: 14 });
    wp.push({ x: 16, z: 16 }, { x: 11, z: 13 });
  }
  wp.push(coffee ? { x: 10, z: 12, pause: 4, face: 180, note: 'coffee' } : { x: 10, z: 12 });
  return { id: 'guardB', level: 'G', waypoints: wp, speed: GUARD_SPEED, fov: GUARD_FOV, range: GUARD_RANGE };
}

/** Deliveries: a fixed cycle.  The courier props the service door open while inside. */
export const DELIVERY = {
  firstArrival: 6,
  period: 30,
  arriveTime: 2,
  insideTime: 8,
  leaveTime: 1.5,
  courierSpeed: 1.5,
  courierFov: 70,
  courierRange: 2.5,
};
