import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DECOR_PEOPLE } from '../data/decor';
import type { Snapshot } from '../sim/heist';
import { LAYOUT, levelY } from '../sim/layout';
import { evalWhen, type Era, type Facts, type Level } from '../sim/types';
import type { AssetLibrary } from './assets';
import type { World } from './World';

export type Clip = 'idle' | 'walk' | 'climb' | 'crouch' | 'interact' | 'sit';

/** tile-unit sim coordinates (x+0.5 = tile centre) → world */
export function simToWorld(x: number, z: number, level: Level, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - 15, levelY(level), z - 11);
}

export class Actor {
  readonly group: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  clipName = '';

  constructor(template: THREE.Object3D, clips: THREE.AnimationClip[], readonly character: string) {
    this.group = cloneSkinned(template) as THREE.Group;
    this.group.name = `actor:${character}`;
    this.group.traverse((o) => {
      if (o.userData.bj_role === 'character') o.visible = o.userData.bj_character === character;
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.group);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.play('idle', 0);
  }

  /**
   * Draw this actor as a flat tint wherever scenery hides it, so the thief and the guards stay
   * readable behind buildings and under canopies.  Draw order does the work: scenery (order 0)
   * fills the depth buffer, then the tint copies pass only where scenery is in front
   * (inverted depth test, order 1), then the real actor (order 2) paints over every part that
   * is actually visible — so the actor never tints itself.  The copies share the actor's
   * geometry and skeleton, so they animate for free.
   */
  addSilhouette(color: string, opacity: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: false, // stay in the opaque list so render order applies
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
    });
    const meshes: THREE.Mesh[] = [];
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.silhouette) meshes.push(o as THREE.Mesh);
    });
    for (const m of meshes) {
      const copy = m.clone();
      copy.material = mat;
      copy.castShadow = false;
      copy.receiveShadow = false;
      copy.renderOrder = 1;
      copy.userData.silhouette = true;
      m.renderOrder = 2;
      m.parent?.add(copy);
    }
  }

  play(name: Clip, fade = 0.18, timeScale = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (a === this.current) return;
    a.reset().play();
    if (this.current && fade > 0) this.current.crossFadeTo(a, fade, false);
    else if (this.current) this.current.stop();
    this.current = a;
    this.clipName = name;
  }

  place(p: THREE.Vector3, yaw: number): void {
    this.group.position.copy(p);
    this.group.rotation.y = -yaw;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

/**
 * Characters and moving parts: thief, guards, courier, townsfolk, plus the Blender dynamic
 * nodes (camera heads, van, service doors, vault door, hatch lid, laser beams, junction lever).
 */
export class Actors {
  readonly root = new THREE.Group();
  readonly thief: Actor;
  readonly guards: Record<'guardA' | 'guardB', Actor>;
  readonly courier: Actor;
  private decor: Array<{ actor: Actor; def: (typeof DECOR_PEOPLE)[number] }> = [];
  private readonly template: THREE.Object3D;
  private readonly clips: THREE.AnimationClip[];
  private readonly tmp = new THREE.Vector3();
  private readonly vanHome: THREE.Vector3;
  /** smoothed values for dynamic parts */
  private doorOpen = { front: 0, alley: 0 };
  private vaultOpen = 0;
  private hatchOpen = 0;
  private leverDown = 0;
  private blink = 0;

  constructor(lib: AssetLibrary, private readonly world: World) {
    this.root.name = 'actors';
    const gltf = lib.get('characters');
    this.template = gltf.scene;
    this.clips = gltf.animations;
    this.thief = this.make('thief');
    this.guards = { guardA: this.make('guard'), guardB: this.make('guard') };
    this.thief.addSilhouette('#2f7d4a', 0.55);
    this.guards.guardA.addSilhouette('#b8322d', 0.5);
    this.guards.guardB.addSilhouette('#b8322d', 0.5);
    this.courier = this.make('courier');
    for (const def of DECOR_PEOPLE) {
      const actor = this.make(def.character);
      actor.play(def.clip, 0);
      actor.mixer.setTime(Math.random() * 2);
      this.decor.push({ actor, def });
    }
    const van = world.dynamics.get('van');
    this.vanHome = van ? van.position.clone() : new THREE.Vector3();
    this.hideHeistActors();
  }

  private make(character: string): Actor {
    const a = new Actor(this.template, this.clips, character);
    this.root.add(a.group);
    return a;
  }

  hideHeistActors(): void {
    this.thief.group.visible = false;
    this.guards.guardA.group.visible = false;
    this.guards.guardB.group.visible = false;
    this.courier.group.visible = false;
    const van = this.world.dynamics.get('van');
    if (van) van.visible = false;
  }

  /** Decorative people of the displayed era/timeline. */
  showDecor(era: Era, facts: Facts, oakLocation: string): void {
    for (const { actor, def } of this.decor) {
      const on = def.era === era && evalWhen(def.when, facts);
      actor.group.visible = on;
      if (!on) continue;
      let x = def.x;
      let z = def.z;
      if (def.atOak) {
        const site = LAYOUT.oakSites[oakLocation] ?? LAYOUT.oakSites.garden;
        x = site[0] + 0.5 + def.x;
        z = site[1] + 0.5 + def.z;
      }
      actor.place(this.tmp.set(x - 15, def.y ?? 0, z - 11), (def.yaw * Math.PI) / 180);
    }
  }

  /** Drive all heist actors and dynamic parts from a simulation snapshot. */
  applySnapshot(s: Snapshot, opts: { showThief: boolean; laser: boolean; vault: boolean; hatchUsed: boolean; dt: number }): void {
    const th = s.thief;
    this.thief.group.visible = opts.showThief;
    if (opts.showThief) {
      simToWorld(th.x, th.z, th.level, this.tmp);
      if (th.portal) {
        const y0 = levelY(th.portal.from.level);
        const y1 = levelY(th.portal.to.level);
        const f = th.portal.f;
        this.tmp.y = y0 + (y1 - y0) * (th.portal.kind === 'stairs' ? f : Math.min(1, f * 1.05));
      }
      this.thief.place(this.tmp, th.yaw);
      const clip: Clip = th.anim === 'stairs' ? 'walk' : th.anim === 'climb' ? 'climb' : th.anim;
      this.thief.play(clip, 0.15, clip === 'walk' ? 1.35 : 1);
    }
    for (const g of s.guards) {
      const a = this.guards[g.id as 'guardA' | 'guardB'];
      if (!a) continue;
      a.group.visible = true;
      a.place(simToWorld(g.x, g.z, g.level, this.tmp), g.yaw);
      a.play(g.moving ? 'walk' : 'idle', 0.2);
    }
    const c = s.delivery.courier;
    this.courier.group.visible = !!c;
    if (c) {
      this.courier.place(simToWorld(c.x, c.z, 'G', this.tmp), c.yaw);
      this.courier.play('walk', 0.1);
    }
    // van: slides in from the lane / street end along its stop
    const van = this.world.dynamics.get('van');
    if (van) {
      van.visible = s.delivery.vanPresent;
      if (s.delivery.vanPresent) this.placeVan(van, s.delivery.vanArrive);
    }
    // camera heads
    for (const cam of s.cameras) {
      const head = this.world.cameras.get(cam.id);
      if (!head) continue;
      head.rotation.y = -cam.yaw;
      const led = head.children[0];
      if (led) led.visible = true;
    }
    const k = 1 - Math.exp(-opts.dt * 6);
    const target = s.delivery.doorOpen ? 1 : 0;
    const stop = this.vanStop;
    this.doorOpen.front += ((stop === 'square' ? target : 0) - this.doorOpen.front) * k;
    this.doorOpen.alley += ((stop === 'lane' ? target : 0) - this.doorOpen.alley) * k;
    const fd = this.world.dynamics.get('serviceDoor.front');
    if (fd) fd.rotation.y = -this.doorOpen.front * 1.7;
    const ad = this.world.dynamics.get('serviceDoor.alley');
    if (ad) ad.rotation.y = this.doorOpen.alley * 1.7;
    this.vaultOpen += ((opts.vault ? 1 : 0) - this.vaultOpen) * k;
    const vd = this.world.dynamics.get('vaultDoor');
    if (vd) vd.rotation.y = this.vaultOpen * 1.6;
    this.hatchOpen += ((opts.hatchUsed ? 1 : 0) - this.hatchOpen) * k;
    const hl = this.world.dynamics.get('hatchLid');
    if (hl) hl.rotation.z = this.hatchOpen * 1.9;
    this.leverDown += ((s.power ? 0 : 1) - this.leverDown) * k;
    const lv = this.world.dynamics.get('junctionLever');
    if (lv) lv.rotation.x = this.leverDown * 2.2;
    this.blink += opts.dt;
    const beams = this.world.dynamics.get('laserBeams');
    if (beams) beams.visible = opts.laser && s.power && Math.sin(this.blink * 9) > -0.85;
  }

  vanStop: 'square' | 'lane' = 'square';

  private placeVan(van: THREE.Object3D, arrive: number): void {
    const tiles = LAYOUT.anchors[`van.${this.vanStop}`].tiles as number[][];
    const cx = (tiles[0][0] + tiles[1][0]) / 2 + 0.5;
    const cz = (tiles[0][1] + tiles[1][1]) / 2 + 0.5;
    const e = 1 - (1 - arrive) ** 2;
    const off = (1 - e) * (this.vanStop === 'lane' ? -6 : 6);
    van.position.set(cx - 15 + off, 0, cz - 11);
    van.rotation.y = 0;
    void this.vanHome;
  }

  update(dt: number, animateDecor: boolean): void {
    this.thief.update(dt);
    this.guards.guardA.update(dt);
    this.guards.guardB.update(dt);
    this.courier.update(dt);
    if (animateDecor) for (const d of this.decor) if (d.actor.group.visible) d.actor.update(dt);
    // spinning diamond
    for (const n of this.world.variants.get('prop.diamond') ?? []) {
      n.traverse((o) => {
        if (o.userData.bj_spin) o.rotation.y += dt * 1.2;
      });
    }
  }
}
