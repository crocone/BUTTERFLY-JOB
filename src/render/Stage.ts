import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { PostFX } from './PostFX';

export type Quality = 'low' | 'medium' | 'high';

export const BACKGROUND = '#efe9dd';

/**
 * Renderer, lights, desk shadow and post-processing.  Quality presets trade decorative effects
 * (outlines, shadows, resolution, MSAA) for speed; gameplay overlays are unaffected.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private post: PostFX | null = null;
  private deskShadow: THREE.Mesh;
  quality: Quality = 'medium';
  private width = 1;
  private height = 1;
  /** frame timing (measured, not assumed) */
  fps = 0;
  private frames = 0;
  private fpsStart = performance.now();

  constructor(readonly container: HTMLElement, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.className = 'stage-canvas';
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(BACKGROUND);

    this.hemi = new THREE.HemisphereLight('#fff8ec', '#bdb09a', 1.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.0);
    this.sun.position.set(-16, 30, -9);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -24, right: 24, top: 22, bottom: -22, near: 1, far: 90 });
    this.scene.add(this.sun, this.sun.target);

    // soft shadow of the diorama on the desk (a shadow-only helper plane under the plinth)
    this.deskShadow = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.16 }));
    this.deskShadow.rotation.x = -Math.PI / 2;
    this.deskShadow.position.y = -4.46;
    this.deskShadow.receiveShadow = true;
    this.scene.add(this.deskShadow);

    this.rig = new CameraRig();
    this.setQuality(quality);
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(1.5, dpr) : Math.min(2, dpr));
    this.renderer.shadowMap.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.map && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sun.shadow.mapSize.set(size, size);
    this.sun.castShadow = q !== 'low';
    this.deskShadow.visible = q !== 'low';
    this.post?.dispose();
    this.post = null;
    if (q !== 'low') {
      const w = Math.max(1, Math.floor(this.width * this.renderer.getPixelRatio()));
      const h = Math.max(1, Math.floor(this.height * this.renderer.getPixelRatio()));
      this.post = new PostFX(w, h, q === 'high' ? 4 : 0);
      this.post.material.uniforms.grain.value = q === 'high' ? 0.035 : 0.025;
    }
    // materials depend on shadow state
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.resize();
  }

  resize(): void {
    const r = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(r.width));
    this.height = Math.max(1, Math.floor(r.height));
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.domElement.style.width = `${this.width}px`;
    this.renderer.domElement.style.height = `${this.height}px`;
    this.rig.setAspect(this.width / this.height);
    if (this.post) {
      const pr = this.renderer.getPixelRatio();
      this.post.setSize(Math.floor(this.width * pr), Math.floor(this.height * pr));
    }
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  render(): void {
    this.renderer.info.reset();
    const cam = this.rig.camera;
    if (this.post) {
      const wpp = (this.rig.viewSize * 2) / (this.height * this.renderer.getPixelRatio());
      this.post.render(this.renderer, this.scene, cam, wpp);
    } else {
      this.renderer.render(this.scene, cam);
    }
    this.frames++;
    const now = performance.now();
    if (now - this.fpsStart >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsStart);
      this.frames = 0;
      this.fpsStart = now;
    }
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }

  dispose(): void {
    this.post?.dispose();
    this.renderer.dispose();
  }
}
