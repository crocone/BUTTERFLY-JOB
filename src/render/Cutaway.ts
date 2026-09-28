import * as THREE from 'three';
import type { Level } from '../sim/types';
import type { World } from './World';

const ORDER: Record<string, number> = { S: 0, B: 1, G: 2, U: 3, R: 4 };
const SIDE_NORMAL: Record<string, [number, number]> = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
/** buildings cut together (the bank complex) */
const COMPLEX: Record<string, string[]> = {
  bank: ['bank', 'westwing', 'annex'],
  westwing: ['bank', 'westwing', 'annex'],
  annex: ['bank', 'westwing', 'annex'],
};

export interface Focus {
  /** building the thief is in (or behind), null = none */
  building: string | null;
  level: Level;
  /** show the underground: everything above ground becomes tracing paper */
  xray: boolean;
}

const ghost = new THREE.MeshBasicMaterial({ color: '#9fb0bf', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const ghostLine = new THREE.Color('#5b6f82');

/**
 * Interior cutaway and X-ray.  Only scales/visibility of Blender level/side/roof groups change
 * (their pivots sit on each level's floor), so geometry is never rebuilt.
 */
export class Cutaway {
  private focus: Focus = { building: null, level: 'G', xray: false };
  private camDir = new THREE.Vector2(0.7, 0.7);
  private xrayOn = false;
  private readonly swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  /** meshes that belong below ground (stay solid in X-ray) */
  private readonly underground = new Set<THREE.Object3D>();
  private targets = new Map<THREE.Object3D, number>();
  /** true while the cutaway owns level/side scales (never during era transitions) */
  private managing = false;
  reducedMotion = false;

  constructor(private readonly world: World) {
    world.root.traverse((o) => {
      const lv = o.userData.bj_level;
      if (lv === 'S' || lv === 'B') o.traverse((c) => this.underground.add(c));
    });
    void ghostLine;
  }

  setFocus(focus: Focus, camDir: THREE.Vector2): void {
    this.focus = focus;
    this.camDir.copy(camDir).normalize();
    this.computeTargets();
    if (focus.building || focus.xray) this.managing = true;
    if (focus.xray !== this.xrayOn) this.setXray(focus.xray);
  }

  get current(): Focus {
    return this.focus;
  }

  private computeTargets(): void {
    const f = this.focus;
    const inside = f.building ? COMPLEX[f.building] ?? [f.building] : [];
    const lvl = ORDER[f.level] ?? 2;
    this.targets.clear();
    for (const L of this.world.levels) {
      const hide = inside.includes(L.building) && !f.xray && ORDER[L.level] > lvl;
      this.targets.set(L.node, hide ? 0 : 1);
    }
    for (const R of this.world.roofs) {
      const hide = inside.includes(R.building) && !f.xray && ORDER[R.level] > lvl;
      this.targets.set(R.node, hide ? 0 : 1);
    }
    for (const S of this.world.sides) {
      let t = 1;
      if (inside.includes(S.building) && !f.xray && S.level === f.level) {
        const n = SIDE_NORMAL[S.side];
        if (n && n[0] * this.camDir.x + n[1] * this.camDir.y > 0.15) t = 0.16;
      }
      this.targets.set(S.node, t);
    }
    for (const C of this.world.cutParts) {
      const t = inside.includes(C.building) && !f.xray && C.level === f.level ? 0.3 : 1;
      this.targets.set(C.node, t);
    }
  }

  /** Is `level` of this building currently shown (used by tile picking)? */
  levelShown(building: string | undefined, level: Level): boolean {
    const f = this.focus;
    if (f.xray) return level === 'S' || level === 'B';
    if (level === 'S' || level === 'B') return false;
    if (!building || !f.building) return true;
    const inside = COMPLEX[f.building] ?? [f.building];
    if (!inside.includes(building)) return true;
    return ORDER[level] <= ORDER[f.level];
  }

  update(dt: number): void {
    if (!this.managing) return;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 12);
    let settled = true;
    for (const [node, t] of this.targets) {
      const s = node.scale.y + (t - node.scale.y) * k;
      node.scale.y = Math.abs(s - t) < 0.002 ? t : s;
      if (node.scale.y !== t || t !== 1) settled = false;
      // hidden levels stop rendering entirely (and stop catching picks)
      node.visible = node.scale.y > 0.02;
    }
    if (settled && !this.focus.building && !this.focus.xray) this.managing = false;
  }

  private setXray(on: boolean): void {
    this.xrayOn = on;
    if (on) {
      this.world.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || this.underground.has(o) || this.swapped.has(m)) return;
        this.swapped.set(m, m.material);
        m.material = ghost;
        m.castShadow = false;
      });
    } else {
      for (const [m, mat] of this.swapped) {
        m.material = mat;
        m.castShadow = true;
      }
      this.swapped.clear();
    }
  }

  get xray(): boolean {
    return this.xrayOn;
  }
}
