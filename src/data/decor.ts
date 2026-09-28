import type { Era, When } from '../sim/types';

/** Decorative townsfolk per era (flavour only: they never observe the thief). */
export interface DecorPerson {
  character: 'gardener' | 'worker' | 'civA' | 'civB' | 'civC' | 'courier';
  era: Era;
  x: number;
  z: number;
  /** degrees, 0 = east */
  yaw: number;
  clip: 'idle' | 'sit' | 'interact' | 'walk';
  y?: number;
  when?: When;
  /** follow the oak's planting site (1946 gardener) */
  atOak?: boolean;
}

export const DECOR_PEOPLE: readonly DecorPerson[] = [
  { character: 'gardener', era: 1946, x: 0.75, z: 0.25, yaw: 200, clip: 'interact', atOak: true },
  { character: 'worker', era: 1946, x: 14.2, z: 8.2, yaw: 290, clip: 'interact' },
  { character: 'civC', era: 1946, x: 10.2, z: 16.8, yaw: 20, clip: 'idle' },
  { character: 'worker', era: 1986, x: 7.4, z: 20.1, yaw: 10, clip: 'interact' },
  { character: 'civB', era: 1986, x: 10.2, z: 11.5, yaw: 180, clip: 'sit', y: 0.02, when: [['cafe.terrace1986', '==', true]] },
  { character: 'civA', era: 1986, x: 19.0, z: 17.6, yaw: 270, clip: 'idle' },
  { character: 'civA', era: 2026, x: 10.2, z: 11.5, yaw: 180, clip: 'sit', y: 0.02, when: [['cafe.open', '==', true]] },
  { character: 'civB', era: 2026, x: 10.2, z: 13.5, yaw: 180, clip: 'sit', y: 0.02, when: [['cafe.open', '==', true]] },
  { character: 'civC', era: 2026, x: 5.2, z: 19.6, yaw: 0, clip: 'idle' },
];
