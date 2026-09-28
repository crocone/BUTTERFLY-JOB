import * as THREE from 'three';
import type { ContractId } from '../data/contracts';
import type { Era, Facts } from '../sim/types';
import type { AssetLibrary } from './assets';
import { Animator, VariantTransitions, resetTransform } from './Transitions';
import { variantVisible, VARIANT_RULES } from './variants';

/** Assets placed in the diorama (characters are handled by Actors). */
export const WORLD_ASSETS = ['terrain', 'bank', 'cafe', 'workshop', 'townhouses', 'trees', 'props'];

/** Which inspectable site a variant belongs to (planning-mode picking). */
const SITE_PREFIXES: Array<[string, string | null]> = [
  ['oak.', 'oak'],
  ['trench.', 'drain'], ['survey.', 'drain'], ['sewer.', 'drain'], ['manhole.', 'drain'], ['repair.', 'drain'], ['utility.', 'drain'], ['drainworks.', 'drain'],
  ['bank.hatch', 'drain'],
  ['workshop.junction', 'workshop'], ['workshop.', 'workshop'],
  ['cafe.', 'cafe'],
  ['ground.alley', 'alley'], ['site.alleyNotice', 'alley'], ['bank.westwing', 'alley'],
  ['bank.slot.front', 'bankService'], ['bank.slot.alley', 'bankService'], ['site.blueprint', 'bankService'],
  ['garden.', 'garden'], ['ground.garden', 'garden'], ['fence.garden', 'garden'], ['site.petition', 'garden'], ['bank.gardenwing', 'garden'],
  ['bank.cam', 'cameras'], ['bank.laser', 'bank'], ['prop.', 'bank'], ['bank.', 'bank'],
  ['townhouses.', 'townhouses'], ['car.', 'car'], ['bike.', 'exit'],
  ['props.', null], ['trees.', null], ['terrain.', null], ['ground.', null],
];

export function siteOfVariant(v: string): string | null {
  for (const [p, s] of SITE_PREFIXES) if (v.startsWith(p)) return s;
  return null;
}

export interface LevelNode {
  node: THREE.Object3D;
  building: string;
  level: string;
}

export interface SideNode extends LevelNode {
  side: string;
}

export class World {
  readonly root = new THREE.Group();
  readonly variants = new Map<string, THREE.Object3D[]>();
  readonly cameras = new Map<string, THREE.Object3D>();
  readonly dynamics = new Map<string, THREE.Object3D>();
  readonly anchors = new Map<string, THREE.Vector3>();
  readonly levels: LevelNode[] = [];
  readonly sides: SideNode[] = [];
  readonly cutParts: LevelNode[] = [];
  readonly roofs: LevelNode[] = [];
  readonly proxies: THREE.Object3D[] = [];
  /** meshes that belong to the underground (sewers, basement): stay solid in X-ray view */
  readonly animator = new Animator();
  readonly transitions: VariantTransitions;
  private visible = new Set<string>();
  era: Era = 2026;
  contract: ContractId | null = 'c1';
  private applied = false;

  constructor(lib: AssetLibrary) {
    this.root.name = 'diorama';
    this.transitions = new VariantTransitions(this.animator);
    this.root.add(this.transitions.ghosts);
    for (const id of WORLD_ASSETS) {
      const scene = lib.scene(id);
      scene.name = `asset:${id}`;
      this.root.add(scene);
    }
    this.root.traverse((o) => this.index(o));
    for (const nodes of this.variants.values()) for (const n of nodes) n.visible = false;
  }

  private index(o: THREE.Object3D): void {
    const u = o.userData;
    if (u.bj_role === 'variant' && u.bj_variant) {
      const id = String(u.bj_variant);
      if (!this.variants.has(id)) this.variants.set(id, []);
      this.variants.get(id)!.push(o);
    }
    if (u.bj_role === 'camera' && u.bj_camera) this.cameras.set(String(u.bj_camera), o);
    if (u.bj_role === 'dynamic' && u.bj_dynamic) this.dynamics.set(String(u.bj_dynamic), o);
    if (u.bj_role === 'anchor') {
      o.visible = false;
      o.updateWorldMatrix(true, false);
      this.anchors.set(String(u.bj_anchor), new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
    }
    if (u.bj_role === 'proxy') {
      o.visible = false;
      this.proxies.push(o);
    }
    if (u.bj_role === 'level' && u.bj_level) this.levels.push({ node: o, building: String(u.bj_building ?? ''), level: String(u.bj_level) });
    if (u.bj_role === 'side' && u.bj_side) this.sides.push({ node: o, building: String(u.bj_building ?? ''), level: String(u.bj_level ?? 'G'), side: String(u.bj_side) });
    if (u.bj_role === 'roof') this.roofs.push({ node: o, building: String(u.bj_building ?? ''), level: String(u.bj_level ?? 'R') });
    if (u.bj_cut) {
      let p: THREE.Object3D | null = o.parent;
      while (p && !p.userData.bj_level) p = p.parent;
      this.cutParts.push({ node: o, building: String(p?.userData.bj_building ?? ''), level: String(p?.userData.bj_level ?? 'G') });
    }
  }

  /** Show exactly the variants of (era, facts, contract).  Returns the ids that changed. */
  apply(era: Era, facts: Facts, contract: ContractId | null, opts: { animate: boolean; reducedMotion: boolean }): { shown: string[]; hidden: string[] } {
    const next = new Set<string>();
    for (const id of Object.keys(VARIANT_RULES)) if (variantVisible(id, era, facts, contract)) next.add(id);
    const shown: string[] = [];
    const hidden: string[] = [];
    const animate = opts.animate && this.applied;
    const topts = { reducedMotion: opts.reducedMotion, appearDelay: this.anyVanishing(next) ? 0.3 : 0.05 };
    for (const [id, nodes] of this.variants) {
      const want = next.has(id);
      const had = this.visible.has(id);
      if (want === had && this.applied) continue;
      for (const n of nodes) {
        if (!animate) {
          this.animator.finish(n);
          n.visible = want;
          resetTransform(n);
        } else if (want) this.transitions.appear(n, topts);
        else this.transitions.vanish(n, topts);
      }
      (want ? shown : hidden).push(id);
    }
    this.visible = next;
    this.era = era;
    this.contract = contract;
    this.applied = true;
    return { shown, hidden };
  }

  private anyVanishing(next: Set<string>): boolean {
    for (const id of this.visible) if (!next.has(id)) return true;
    return false;
  }

  isVisible(variant: string): boolean {
    return this.visible.has(variant);
  }

  get busy(): boolean {
    return this.animator.busy;
  }

  update(dt: number): void {
    this.animator.update(dt);
  }

  /** Walk up from a picked object to its variant / proxy and report the inspectable site. */
  siteOf(o: THREE.Object3D | null): string | null {
    let p: THREE.Object3D | null = o;
    while (p) {
      const u = p.userData;
      if (u.bj_proxy) return String(u.bj_proxy).replace(/^site\./, '');
      if (u.bj_role === 'camera') return `camera:${u.bj_camera}`;
      if (u.bj_variant) {
        const s = siteOfVariant(String(u.bj_variant));
        if (s) return s;
      }
      if (u.bj_building === 'bank') return 'bank';
      p = p.parent;
    }
    return null;
  }

  /** Meshes of a site (for hover highlight). */
  meshesOfSite(site: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [id, nodes] of this.variants) {
      if (!this.visible.has(id) || siteOfVariant(id) !== site) continue;
      for (const n of nodes) n.traverse((o) => ((o as THREE.Mesh).isMesh && o.visible ? out.push(o as THREE.Mesh) : null));
    }
    return out;
  }

  /** World-space centre of a site's visible geometry. */
  siteCenter(site: string): THREE.Vector3 | null {
    const box = new THREE.Box3();
    let any = false;
    for (const m of this.meshesOfSite(site)) {
      box.expandByObject(m);
      any = true;
    }
    return any ? box.getCenter(new THREE.Vector3()) : null;
  }
}
