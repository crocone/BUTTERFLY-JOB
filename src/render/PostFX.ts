import * as THREE from 'three';

/**
 * Ink-outline + paper-grain post pass.
 * The scene is rendered into a target with a depth texture.  With an orthographic camera the
 * depth buffer is linear in view space, so a first-order jump marks silhouettes and the discrete
 * Laplacian marks folds/creases between flat paper faces.  The pass then darkens those pixels
 * with warm ink and lays a subtle paper grain over the image.
 */
export class PostFX {
  readonly target: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.ShaderMaterial;

  constructor(width: number, height: number, samples: number) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      samples,
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.target.depthTexture = new THREE.DepthTexture(width, height);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new THREE.Vector2(width, height) },
        depthRange: { value: 600 },
        worldPerPixel: { value: 0.03 },
        inkColor: { value: new THREE.Color('#3b3236') },
        inkStrength: { value: 0.72 },
        grain: { value: 0.035 },
        time: { value: 0 },
        vignette: { value: 0.12 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float depthRange;
        uniform float worldPerPixel;
        uniform vec3 inkColor;
        uniform float inkStrength;
        uniform float grain;
        uniform float time;
        uniform float vignette;
        varying vec2 vUv;
        float D(vec2 uv) { return texture2D(tDepth, uv).x * depthRange; }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 px = 1.0 / resolution;
          float c = D(vUv);
          float l = D(vUv - vec2(px.x, 0.0));
          float r = D(vUv + vec2(px.x, 0.0));
          float t = D(vUv + vec2(0.0, px.y));
          float b = D(vUv - vec2(0.0, px.y));
          vec4 col = texture2D(tColor, vUv);
          float bg = step(0.9999 * depthRange, c);
          // silhouettes: depth jump larger than a few pixels' worth of world distance
          float jump = max(max(abs(l - c), abs(r - c)), max(abs(t - c), abs(b - c)));
          float sil = smoothstep(worldPerPixel * 2.5, worldPerPixel * 6.0, jump);
          // folds: change of slope (second derivative) between flat faces
          float lap = abs(l + r + t + b - 4.0 * c);
          float fold = smoothstep(worldPerPixel * 0.35, worldPerPixel * 1.1, lap);
          float edge = clamp(max(sil, fold * 0.75), 0.0, 1.0);
          vec3 rgb = col.rgb;
          rgb = mix(rgb, inkColor * (0.55 + 0.45 * rgb), edge * inkStrength * (1.0 - bg));
          // paper grain in screen space (static, so it reads as the print, not noise)
          vec2 gp = floor(gl_FragCoord.xy * 0.75);
          float g = hash(gp) - 0.5;
          rgb *= 1.0 + g * grain * (1.0 - 0.5 * bg);
          // soft vignette like a lamp over the desk
          vec2 q = vUv - 0.5;
          rgb *= 1.0 - vignette * dot(q, q) * 1.6;
          gl_FragColor = vec4(rgb, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, worldPerPixel: number): void {
    const u = this.material.uniforms;
    u.depthRange.value = camera.far - camera.near;
    u.worldPerPixel.value = worldPerPixel;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.target.dispose();
    this.target.depthTexture?.dispose();
    this.material.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}
