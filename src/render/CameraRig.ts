import * as THREE from 'three';

/**
 * Angled orthographic camera orbiting the diorama.  All motion goes through smoothed goals so
 * user input, follow mode and scripted shots (intro, replay) blend without jumps.
 */
export interface CameraView {
  target: THREE.Vector3;
  azimuth: number;
  elevation: number;
  viewSize: number;
}

const DEG = Math.PI / 180;
export const DEFAULT_VIEW: CameraView = {
  target: new THREE.Vector3(0.5, 0.2, 0.8),
  azimuth: 45 * DEG,
  elevation: 34 * DEG,
  viewSize: 14.5,
};

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = DEFAULT_VIEW.target.clone();
  azimuth = DEFAULT_VIEW.azimuth;
  elevation = DEFAULT_VIEW.elevation;
  viewSize = DEFAULT_VIEW.viewSize;
  private goal: CameraView = { ...DEFAULT_VIEW, target: DEFAULT_VIEW.target.clone() };
  private aspect = 1.6;
  private tween: { from: CameraView; to: CameraView; t: number; duration: number; resolve?: () => void } | null = null;
  /** follow a moving point (heist) */
  followPoint: THREE.Vector3 | null = null;
  minView = 3.2;
  maxView = 20;
  reducedMotion = false;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 220);
    this.apply();
  }

  setAspect(a: number): void {
    this.aspect = a;
    this.apply();
  }

  /** jump or glide to a view; resolves when done */
  flyTo(view: Partial<CameraView>, duration = 1.2): Promise<void> {
    const to: CameraView = {
      target: (view.target ?? this.goal.target).clone(),
      azimuth: view.azimuth ?? this.goal.azimuth,
      elevation: view.elevation ?? this.goal.elevation,
      viewSize: view.viewSize ?? this.goal.viewSize,
    };
    // take the short way round
    while (to.azimuth - this.azimuth > Math.PI) to.azimuth -= Math.PI * 2;
    while (to.azimuth - this.azimuth < -Math.PI) to.azimuth += Math.PI * 2;
    if (duration <= 0 || this.reducedMotion) {
      this.goal = to;
      this.setNow(to);
      this.tween = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tween = { from: this.current(), to, t: 0, duration, resolve };
      this.goal = to;
    });
  }

  current(): CameraView {
    return { target: this.target.clone(), azimuth: this.azimuth, elevation: this.elevation, viewSize: this.viewSize };
  }

  private setNow(v: CameraView): void {
    this.target.copy(v.target);
    this.azimuth = v.azimuth;
    this.elevation = v.elevation;
    this.viewSize = v.viewSize;
    this.apply();
  }

  rotate(dx: number, dy: number): void {
    this.tween = null;
    this.goal.azimuth -= dx * 0.006;
    this.goal.elevation = THREE.MathUtils.clamp(this.goal.elevation + dy * 0.004, 20 * DEG, 68 * DEG);
  }

  zoom(delta: number): void {
    this.tween = null;
    this.goal.viewSize = THREE.MathUtils.clamp(this.goal.viewSize * Math.exp(delta * 0.0012), this.minView, this.maxView);
  }

  pan(dx: number, dy: number, viewportHeight: number): void {
    this.tween = null;
    const s = (this.viewSize * 2) / viewportHeight;
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const fwd = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    this.goal.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s / Math.sin(this.elevation));
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, -18, 18);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, -14, 14);
  }

  reset(duration = 0.8): Promise<void> {
    return this.flyTo(DEFAULT_VIEW, duration);
  }

  update(dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.target.lerpVectors(tw.from.target, tw.to.target, e);
      this.azimuth = tw.from.azimuth + (tw.to.azimuth - tw.from.azimuth) * e;
      this.elevation = tw.from.elevation + (tw.to.elevation - tw.from.elevation) * e;
      this.viewSize = tw.from.viewSize + (tw.to.viewSize - tw.from.viewSize) * e;
      if (tw.t >= 1) {
        this.tween = null;
        tw.resolve?.();
      }
    } else {
      if (this.followPoint) {
        this.goal.target.lerp(this.followPoint, 1 - Math.exp(-dt * 3));
      }
      const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
      this.target.lerp(this.goal.target, k);
      this.azimuth += (this.goal.azimuth - this.azimuth) * k;
      this.elevation += (this.goal.elevation - this.elevation) * k;
      this.viewSize += (this.goal.viewSize - this.viewSize) * k;
    }
    this.apply();
  }

  private apply(): void {
    const R = 90;
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.azimuth) * Math.cos(this.elevation) * R,
      this.target.y + Math.sin(this.elevation) * R,
      this.target.z + Math.cos(this.azimuth) * Math.cos(this.elevation) * R,
    );
    c.lookAt(this.target);
    c.left = -this.viewSize * this.aspect;
    c.right = this.viewSize * this.aspect;
    c.top = this.viewSize;
    c.bottom = -this.viewSize;
    c.near = 1;
    c.far = 220;
    c.updateProjectionMatrix();
  }

  /** unit vector from the target toward the camera, projected on the ground */
  viewDirXZ(): THREE.Vector2 {
    return new THREE.Vector2(Math.sin(this.azimuth), Math.cos(this.azimuth));
  }
}
