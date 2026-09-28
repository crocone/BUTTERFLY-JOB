import * as THREE from 'three';

/**
 * Tiny tween system + the era-change choreography for Blender variant nodes.
 * appear:  rise (floors grow from paper layers) · fold (façade/prop folds up about its authored
 *          base pivot) · unfurl (canopy segments open one by one) · pop · flatten (ground plates)
 * vanish:  a tracing-paper ghost of the old version lingers and fades while the real object
 *          flattens onto the base like an architectural drawing.
 */

type Ease = (t: number) => number;
export const ease = {
  outBack: ((t: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }) as Ease,
  outCubic: ((t: number) => 1 - (1 - t) ** 3) as Ease,
  inCubic: ((t: number) => t * t * t) as Ease,
  inOut: ((t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)) as Ease,
  linear: ((t: number) => t) as Ease,
};

interface Tween {
  key: THREE.Object3D;
  delay: number;
  duration: number;
  t: number;
  step: (e: number) => void;
  ease: Ease;
  done?: () => void;
}

export class Animator {
  private tweens: Tween[] = [];

  add(key: THREE.Object3D, duration: number, step: (e: number) => void, opts: { delay?: number; ease?: Ease; done?: () => void } = {}): void {
    this.tweens.push({ key, delay: opts.delay ?? 0, duration: Math.max(0.001, duration), t: 0, step, ease: opts.ease ?? ease.outCubic, done: opts.done });
  }

  /** finish (jump to end) all tweens touching this node */
  finish(key: THREE.Object3D): void {
    for (const tw of this.tweens.filter((x) => x.key === key)) {
      tw.step(1);
      tw.done?.();
    }
    this.tweens = this.tweens.filter((x) => x.key !== key);
  }

  finishAll(): void {
    const all = this.tweens;
    this.tweens = [];
    for (const tw of all) {
      tw.step(1);
      tw.done?.();
    }
  }

  update(dt: number): void {
    const active = this.tweens;
    this.tweens = []; // callbacks may add new tweens here
    const keep: Tween[] = [];
    for (const tw of active) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) {
          keep.push(tw);
          continue;
        }
        tw.step(tw.ease(0));
      }
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      tw.step(tw.ease(tw.t));
      if (tw.t >= 1) tw.done?.();
      else keep.push(tw);
    }
    this.tweens = keep.concat(this.tweens);
  }

  get busy(): boolean {
    return this.tweens.length > 0;
  }
}

const LEVEL_ORDER: Record<string, number> = { S: 0, B: 1, G: 2, U: 3, R: 4 };

export interface TransitionOptions {
  reducedMotion: boolean;
  /** seconds to wait before appearing things start */
  appearDelay: number;
}

const ghostMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#8fa7bd'),
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** Hide/show a variant root with the animation its Blender metadata asks for. */
export class VariantTransitions {
  readonly ghosts = new THREE.Group();

  constructor(private readonly anim: Animator) {
    this.ghosts.name = 'tracing-paper-ghosts';
  }

  appear(node: THREE.Object3D, opts: TransitionOptions): void {
    this.anim.finish(node);
    node.visible = true;
    const style = String(node.userData.bj_anim ?? 'pop');
    if (opts.reducedMotion || style === 'none') {
      resetTransform(node);
      return;
    }
    const d0 = opts.appearDelay;
    if (style === 'rise') {
      const parts = childrenWith(node, (c) => c.userData.bj_level !== undefined || c.userData.bj_order !== undefined);
      if (parts.length) {
        parts.sort((a, b) => orderOf(a) - orderOf(b));
        parts.forEach((p, i) => this.scaleY(p, d0 + i * 0.13, 0.45));
      } else this.scaleY(node, d0, 0.5);
      return;
    }
    if (style === 'fold') {
      this.fold(node, String(node.userData.bj_side ?? 's'), d0);
      return;
    }
    if (style === 'unfurl') {
      const segs = childrenWith(node, (c) => c.userData.bj_anim === 'unfurl' || c.userData.bj_order !== undefined);
      if (segs.length) {
        const trunk = childrenWith(node, (c) => c.userData.bj_anim === 'rise');
        trunk.forEach((t) => this.scaleY(t, d0, 0.35));
        segs.sort((a, b) => orderOf(a) - orderOf(b));
        segs.forEach((s, i) => this.unfurl(s, d0 + 0.2 + i * 0.07));
      } else this.unfurl(node, d0);
      return;
    }
    if (style === 'flatten') {
      node.visible = false;
      this.anim.add(node, 0.001, () => {}, { delay: d0 * 0.6, done: () => ((node.visible = true), resetTransform(node)) });
      return;
    }
    this.pop(node, d0);
  }

  vanish(node: THREE.Object3D, opts: TransitionOptions): void {
    this.anim.finish(node);
    const style = String(node.userData.bj_anim ?? 'pop');
    if (opts.reducedMotion || style === 'none' || !node.visible) {
      node.visible = false;
      resetTransform(node);
      return;
    }
    if (style === 'flatten') {
      this.anim.add(node, 0.001, () => {}, { delay: opts.appearDelay * 0.6, done: () => (node.visible = false) });
      return;
    }
    this.spawnGhost(node);
    const base = node.scale.y || 1;
    this.anim.add(
      node,
      0.34,
      (e) => {
        node.scale.y = Math.max(0.02, base * (1 - e));
      },
      {
        ease: ease.inCubic,
        done: () => {
          node.visible = false;
          resetTransform(node);
        },
      },
    );
  }

  private scaleY(n: THREE.Object3D, delay: number, dur: number): void {
    n.scale.y = 0.001;
    this.anim.add(n, dur, (e) => (n.scale.y = Math.max(0.001, e)), { delay, ease: ease.outBack });
  }

  private unfurl(n: THREE.Object3D, delay: number): void {
    n.scale.setScalar(0.001);
    const r0 = n.rotation.y;
    this.anim.add(
      n,
      0.5,
      (e) => {
        n.scale.setScalar(Math.max(0.001, e));
        n.rotation.y = r0 + (1 - e) * 0.6;
      },
      { delay, ease: ease.outBack, done: () => (n.rotation.y = r0) },
    );
  }

  private pop(n: THREE.Object3D, delay: number): void {
    n.scale.setScalar(0.001);
    this.anim.add(n, 0.35, (e) => n.scale.setScalar(Math.max(0.001, e)), { delay, ease: ease.outBack });
  }

  private fold(n: THREE.Object3D, side: string, delay: number): void {
    // lie flat outward, then fold up about the authored base pivot
    const axis = side === 'e' || side === 'w' ? 'z' : 'x';
    const sign = side === 's' ? 1 : side === 'n' ? -1 : side === 'e' ? -1 : 1;
    const start = (Math.PI / 2) * sign;
    n.rotation[axis] = start;
    this.anim.add(n, 0.5, (e) => (n.rotation[axis] = start * (1 - e)), { delay, ease: ease.outBack, done: () => (n.rotation[axis] = 0) });
  }

  private spawnGhost(node: THREE.Object3D): void {
    node.updateWorldMatrix(true, true);
    const g = new THREE.Group();
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      const ghost = new THREE.Mesh(m.geometry, ghostMaterial);
      ghost.matrixAutoUpdate = false;
      ghost.matrix.copy(m.matrixWorld);
      ghost.renderOrder = 5;
      g.add(ghost);
    });
    if (!g.children.length) return;
    const mat = ghostMaterial.clone();
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = mat) : null));
    this.ghosts.add(g);
    this.anim.add(g, 0.95, (e) => (mat.opacity = 0.34 * (1 - e)), {
      ease: ease.linear,
      done: () => {
        this.ghosts.remove(g);
        mat.dispose();
      },
    });
  }
}

function childrenWith(node: THREE.Object3D, pred: (o: THREE.Object3D) => boolean): THREE.Object3D[] {
  return node.children.filter(pred);
}

function orderOf(o: THREE.Object3D): number {
  if (o.userData.bj_level !== undefined) return LEVEL_ORDER[String(o.userData.bj_level)] ?? 0;
  return Number(o.userData.bj_order ?? 0);
}

export function resetTransform(n: THREE.Object3D): void {
  n.scale.set(1, 1, 1);
  n.rotation.set(0, 0, 0);
  for (const c of n.children) {
    if (c.userData.bj_level !== undefined || c.userData.bj_order !== undefined || c.userData.bj_anim) {
      c.scale.set(1, 1, 1);
      if (c.userData.bj_anim === 'unfurl') c.rotation.y = 0;
    }
  }
}
