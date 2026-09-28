import * as THREE from 'three';

/**
 * Paper material factory.
 *
 * Blender exports every surface as `vertex colour × grey print texture` (bj_* materials).
 * At runtime these are replaced with shared Lambert materials that keep the Blender texture and
 * vertex colours, add a warm "printed ink" response and support the ghost / highlight states the
 * era transitions need.  One material per (print texture × state) is shared by all meshes.
 */

export type PaperState = 'normal' | 'ghost' | 'highlight' | 'section';

const ROUGH_KEYS = ['paper', 'wall', 'brick', 'roof', 'paving', 'cobble', 'edge', 'foliage', 'wood', 'grass', 'plank', 'glass'] as const;
export type PaperKey = (typeof ROUGH_KEYS)[number];

const textureCache = new Map<string, THREE.Texture>();
const materialCache = new Map<string, THREE.Material>();

/** Keep one GPU texture per Blender print texture name (every .glb embeds its own copy). */
export function dedupeTexture(tex: THREE.Texture | null | undefined, anisotropy: number): THREE.Texture | null {
  if (!tex) return null;
  const key = tex.name || (tex.image && (tex.image as { src?: string }).src) || tex.uuid;
  const hit = textureCache.get(key);
  if (hit) {
    if (hit !== tex) tex.dispose();
    return hit;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

export function paperKeyOf(materialName: string): PaperKey {
  const k = materialName.replace(/^bj_/, '').replace(/\.\d+$/, '') as PaperKey;
  return (ROUGH_KEYS as readonly string[]).includes(k) ? k : 'paper';
}

export interface PaperOptions {
  key: PaperKey;
  map: THREE.Texture | null;
  state?: PaperState;
}

export function paperMaterial({ key, map, state = 'normal' }: PaperOptions): THREE.Material {
  const cacheKey = `${key}|${map ? map.uuid : 'none'}|${state}`;
  const hit = materialCache.get(cacheKey);
  if (hit) return hit;
  let mat: THREE.Material;
  if (state === 'ghost') {
    // tracing paper: translucent, colourless, no depth write so the real scene reads through it
    mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#9fb2c4'),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  } else {
    const m = new THREE.MeshLambertMaterial({
      map: map ?? null,
      vertexColors: true,
      flatShading: true,
      side: key === 'foliage' ? THREE.FrontSide : THREE.FrontSide,
    });
    if (state === 'highlight') {
      m.emissive = new THREE.Color('#f0a63a');
      m.emissiveIntensity = 0.35;
    }
    m.onBeforeCompile = (shader) => {
      // Slightly lift shadows toward warm paper and compress highlights: printed-card look.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `outgoingLight = mix(outgoingLight, outgoingLight * vec3(1.02, 0.99, 0.95) + vec3(0.018, 0.014, 0.008), 0.6);
#include <opaque_fragment>`,
      );
    };
    m.customProgramCacheKey = () => `paper-${state}`;
    mat = m;
  }
  mat.name = `paper_${key}_${state}`;
  materialCache.set(cacheKey, mat);
  return mat;
}

/** Replace Blender materials on an imported subtree with shared paper materials. */
export function applyPaper(root: THREE.Object3D, anisotropy = 4): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const keys: PaperKey[] = [];
    const convert = (src: THREE.Material): THREE.Material => {
      const key = paperKeyOf(src.name);
      keys.push(key);
      const map = dedupeTexture((src as THREE.MeshStandardMaterial).map, anisotropy);
      const out = paperMaterial({ key, map });
      if (src !== out) src.dispose();
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.paperKeys = keys;
  });
}

export function sharedMaterialCount(): number {
  return materialCache.size;
}

export function sharedTextureCount(): number {
  return textureCache.size;
}
