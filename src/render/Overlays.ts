import * as THREE from 'three';
import { levelY } from '../sim/layout';
import type { Level } from '../sim/types';

/**
 * Technical overlays (runtime geometry is allowed for these): vision fans, patrol routes, path
 * previews, the hovered tile, highlight rings and causal lines.  All share a few materials.
 */
export const COLORS = {
  danger: new THREE.Color('#d33b35'),
  dangerSoft: new THREE.Color('#e8746c'),
  alert: new THREE.Color('#f0a63a'),
  route: new THREE.Color('#4f9463'),
  amber: new THREE.Color('#f0a63a'),
  ink: new THREE.Color('#2e2d30'),
  patrol: new THREE.Color('#6b5f73'),
  blocked: new THREE.Color('#d33b35'),
};

const Y_LIFT = 0.07;

function mat(color: THREE.Color, opacity: number, depthTest = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest, side: THREE.DoubleSide });
}

export class Overlays {
  readonly root = new THREE.Group();
  private fans = new Map<string, THREE.Mesh>();
  private fanGroup = new THREE.Group();
  private patrolGroup = new THREE.Group();
  private pathGroup = new THREE.Group();
  private hover: THREE.Mesh;
  private pulses: Array<{ mesh: THREE.Mesh; t: number; dur: number }> = [];
  private causal: Array<{ mesh: THREE.Mesh; t: number; dur: number; mat: THREE.MeshBasicMaterial }> = [];
  private readonly dot = new THREE.CircleGeometry(0.075, 10);
  private readonly dash = new THREE.PlaneGeometry(0.28, 0.07);
  private readonly arrow: THREE.BufferGeometry;
  private readonly matRoute = mat(COLORS.route, 0.95, false);
  private readonly matBlocked = mat(COLORS.blocked, 0.95, false);
  private readonly matPatrol = mat(COLORS.patrol, 0.75);
  private readonly matWait = mat(COLORS.amber, 0.95, false);
  fanOpacity = 0.2;

  constructor() {
    this.root.name = 'overlays';
    this.root.renderOrder = 10;
    this.root.add(this.fanGroup, this.patrolGroup, this.pathGroup);
    this.arrow = new THREE.BufferGeometry();
    this.arrow.setAttribute('position', new THREE.Float32BufferAttribute([0.16, 0, 0, -0.1, 0, 0.11, -0.1, 0, -0.11], 3));
    const hoverGeo = new THREE.RingGeometry(0.36, 0.46, 4, 1, Math.PI / 4);
    hoverGeo.rotateX(-Math.PI / 2);
    this.hover = new THREE.Mesh(hoverGeo, mat(COLORS.route, 0.9, false));
    this.hover.visible = false;
    this.hover.renderOrder = 12;
    this.root.add(this.hover);
  }

  // ------------------------------------------------------------------ vision
  setFan(id: string, level: Level, origin: [number, number], pts: Array<[number, number]>, state: 'calm' | 'seeing' | 'alert', visible: boolean): void {
    let m = this.fans.get(id);
    if (!m) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3 * 40), 3));
      m = new THREE.Mesh(g, mat(COLORS.danger, this.fanOpacity));
      m.renderOrder = 9;
      m.frustumCulled = false;
      this.fans.set(id, m);
      this.fanGroup.add(m);
    }
    m.visible = visible && pts.length > 1;
    if (!m.visible) return;
    const y = levelY(level) + Y_LIFT + (id.startsWith('C') ? 0.01 : 0);
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(pts.length - 1, 39);
    const ox = origin[0] - 15;
    const oz = origin[1] - 11;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i * 3, ox, y, oz);
      pos.setXYZ(i * 3 + 1, pts[i][0] - 15, y, pts[i][1] - 11);
      pos.setXYZ(i * 3 + 2, pts[i + 1][0] - 15, y, pts[i + 1][1] - 11);
    }
    m.geometry.setDrawRange(0, n * 3);
    pos.needsUpdate = true;
    m.geometry.computeBoundingSphere();
    const mm = m.material as THREE.MeshBasicMaterial;
    mm.color.copy(state === 'calm' ? COLORS.danger : state === 'seeing' ? COLORS.alert : COLORS.danger);
    mm.opacity = state === 'calm' ? this.fanOpacity : Math.min(0.55, this.fanOpacity * 2.2);
  }

  hideFans(): void {
    for (const m of this.fans.values()) m.visible = false;
  }

  // ------------------------------------------------------------------ patrol routes
  setPatrols(routes: Array<{ level: Level; polyline: Array<[number, number]> }>, visible: boolean): void {
    this.clearGroup(this.patrolGroup);
    this.patrolGroup.visible = visible;
    for (const r of routes) {
      const y = levelY(r.level) + Y_LIFT - 0.01;
      const pts = r.polyline.map(([x, z]) => new THREE.Vector3(x - 15, y, z - 11));
      let carry = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = a.distanceTo(b);
        if (len < 1e-4) continue;
        const dir = b.clone().sub(a).normalize();
        const ang = Math.atan2(-dir.z, dir.x);
        for (let d = carry; d < len; d += 0.55) {
          const p = a.clone().addScaledVector(dir, d);
          const m = new THREE.Mesh(this.dash, this.matPatrol);
          m.position.copy(p);
          m.rotation.set(-Math.PI / 2, 0, ang);
          this.patrolGroup.add(m);
          if (Math.round(d / 0.55) % 5 === 2) {
            const ar = new THREE.Mesh(this.arrow, this.matPatrol);
            ar.position.copy(p).add(new THREE.Vector3(0, 0.002, 0));
            ar.rotation.y = ang;
            this.patrolGroup.add(ar);
          }
          carry = d + 0.55 - len;
        }
        if (carry < 0) carry = 0;
      }
    }
  }

  setPatrolsVisible(v: boolean): void {
    this.patrolGroup.visible = v;
  }

  // ------------------------------------------------------------------ path preview
  setPath(points: Array<{ x: number; z: number; level: Level }> | null, ok: boolean, waits: Array<{ x: number; z: number; level: Level }> = []): void {
    this.clearGroup(this.pathGroup);
    if (!points || points.length < 1) return;
    const material = ok ? this.matRoute : this.matBlocked;
    let prev: THREE.Vector3 | null = null;
    for (const p of points) {
      const v = new THREE.Vector3(p.x - 15, levelY(p.level) + Y_LIFT + 0.02, p.z - 11);
      if (prev && prev.y === v.y) {
        const len = prev.distanceTo(v);
        const steps = Math.max(1, Math.round(len / 0.34));
        for (let i = 1; i <= steps; i++) {
          const q = prev.clone().lerp(v, i / steps);
          const d = new THREE.Mesh(this.dot, material);
          d.position.copy(q);
          d.rotation.x = -Math.PI / 2;
          d.renderOrder = 11;
          this.pathGroup.add(d);
        }
      }
      prev = v;
    }
    const end = points[points.length - 1];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 16), material);
    ring.position.set(end.x - 15, levelY(end.level) + Y_LIFT + 0.03, end.z - 11);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 11;
    ring.userData.disposeGeometry = true;
    this.pathGroup.add(ring);
    for (const w of waits) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 12), this.matWait);
      r.position.set(w.x - 15, levelY(w.level) + Y_LIFT + 0.04, w.z - 11);
      r.rotation.x = -Math.PI / 2;
      r.renderOrder = 11;
      r.userData.disposeGeometry = true;
      this.pathGroup.add(r);
    }
  }

  setHover(tile: { x: number; z: number; level: Level } | null, ok: boolean): void {
    this.hover.visible = !!tile;
    if (!tile) return;
    this.hover.position.set(tile.x + 0.5 - 15, levelY(tile.level) + Y_LIFT + 0.02, tile.z + 0.5 - 11);
    (this.hover.material as THREE.MeshBasicMaterial).color.copy(ok ? COLORS.route : COLORS.blocked);
  }

  // ------------------------------------------------------------------ highlights
  pulse(p: THREE.Vector3, color = COLORS.amber, dur = 1.4, size = 1): void {
    const g = new THREE.RingGeometry(0.55 * size, 0.7 * size, 32);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat(color, 0.9, false));
    m.position.copy(p).add(new THREE.Vector3(0, 0.09, 0));
    m.renderOrder = 13;
    this.root.add(m);
    this.pulses.push({ mesh: m, t: 0, dur });
  }

  /** amber dashed arc from a cause to a consequence */
  causalLine(a: THREE.Vector3, b: THREE.Vector3, dur = 4.5): void {
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.max(a.y, b.y) + 1.2 + a.distanceTo(b) * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(a.clone().add(new THREE.Vector3(0, 0.3, 0)), mid, b.clone().add(new THREE.Vector3(0, 0.3, 0)));
    const g = new THREE.TubeGeometry(curve, 40, 0.035, 5, false);
    const m2 = mat(COLORS.amber, 0.95, false);
    const mesh = new THREE.Mesh(g, m2);
    mesh.renderOrder = 14;
    this.root.add(mesh);
    this.causal.push({ mesh, t: 0, dur, mat: m2 });
    this.pulse(b, COLORS.amber, 1.6, 0.8);
  }

  clearCausal(): void {
    for (const c of this.causal) {
      this.root.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mat.dispose();
    }
    this.causal = [];
  }

  update(dt: number): void {
    this.pulses = this.pulses.filter((p) => {
      p.t += dt / p.dur;
      const s = 0.6 + p.t * 1.1;
      p.mesh.scale.set(s, 1, s);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p.t);
      if (p.t >= 1) {
        this.root.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    this.causal = this.causal.filter((c) => {
      c.t += dt / c.dur;
      c.mat.opacity = 0.95 * Math.min(1, (1 - c.t) * 3) * Math.min(1, c.t * 6);
      if (c.t >= 1) {
        this.root.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mat.dispose();
        return false;
      }
      return true;
    });
  }

  private clearGroup(g: THREE.Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      if (c.userData.disposeGeometry) (c as THREE.Mesh).geometry.dispose();
    }
  }
}

/** DOM labels anchored to world positions (crisp icons and tags over the canvas). */
export class Labels {
  readonly el: HTMLDivElement;
  private items = new Map<string, { el: HTMLDivElement; pos: THREE.Vector3; visible: boolean }>();
  private readonly v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'labels';
    parent.appendChild(this.el);
  }

  set(id: string, pos: THREE.Vector3, html: string, cls = ''): void {
    let it = this.items.get(id);
    if (!it) {
      const el = document.createElement('div');
      this.el.appendChild(el);
      it = { el, pos: pos.clone(), visible: true };
      this.items.set(id, it);
    }
    it.pos.copy(pos);
    it.visible = true;
    if (it.el.innerHTML !== html) it.el.innerHTML = html;
    const c = `label ${cls}`;
    if (it.el.className !== c) it.el.className = c;
  }

  hide(id: string): void {
    const it = this.items.get(id);
    if (it) it.visible = false;
  }

  hidePrefix(prefix: string): void {
    for (const [id, it] of this.items) if (id.startsWith(prefix)) it.visible = false;
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    for (const it of this.items.values()) {
      if (!it.visible) {
        if (it.el.style.display !== 'none') it.el.style.display = 'none';
        continue;
      }
      this.v.copy(it.pos).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      it.el.style.display = '';
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
