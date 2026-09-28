/**
 * Dev tool: inspect Blender-exported assets exactly as the game loads them
 * (same loader, Draco decoder, paper materials).  ?asset=<id>&layout=grid|world
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetLibrary } from '../render/assets';

declare global {
  interface Window {
    __viewer?: { ready: boolean; error?: string; triangles: number; drawCalls: number; variants: string[] };
  }
}

const params = new URLSearchParams(location.search);
const assetId = params.get('asset') ?? 'trees';
const layout = params.get('layout') ?? 'grid';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe8da');
const aspect = innerWidth / innerHeight;
const frustum = 14;
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, -200, 400);
camera.position.set(30, 26, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#fff8ec', '#b9ab93', 1.4));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(-12, 30, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
scene.add(sun);

// dev-only reference ground (not part of the game scene)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#e6dcc8' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const status = document.getElementById('status')!;
const list = document.getElementById('list')!;

async function main() {
  const lib = new AssetLibrary('./');
  const manifest = await lib.loadManifest();
  const gltf = await lib.load(assetId);
  const root = gltf.scene;
  scene.add(root);
  const variants = root.children.filter((c) => c.userData.bj_role === 'variant' || c.userData.bj_role === 'dynamic' || c.userData.bj_role === 'character');
  if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(variants.length));
    const box = new THREE.Box3();
    let cell = 0;
    for (const v of variants) {
      box.setFromObject(v);
      const size = box.getSize(new THREE.Vector3());
      cell = Math.max(cell, size.x, size.z);
    }
    cell += 1.2;
    variants.forEach((v, i) => {
      box.setFromObject(v);
      const c = box.getCenter(new THREE.Vector3());
      const gx = (i % cols) - (cols - 1) / 2;
      const gz = Math.floor(i / cols) - (Math.ceil(variants.length / cols) - 1) / 2;
      v.position.x += gx * cell - c.x;
      v.position.z += gz * cell - c.z;
    });
    camera.zoom = 14 / Math.max(8, cell * cols * 0.55);
    camera.updateProjectionMatrix();
  }
  list.innerHTML = '';
  for (const v of variants) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.onchange = () => (v.visible = cb.checked);
    label.append(cb, ` ${v.userData.bj_variant ?? v.name}`);
    list.appendChild(label);
  }
  const entry = manifest.assets[assetId];
  renderer.render(scene, camera);
  status.textContent = `${assetId}: ${entry?.stats.triangles ?? '?'} tris · ${(entry?.stats.glb_bytes ?? 0) / 1024 | 0} KB · Blender ${manifest.blender} · draw calls ${renderer.info.render.calls}`;
  window.__viewer = {
    ready: true,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    variants: variants.map((v) => String(v.userData.bj_variant ?? v.name)),
  };
}

function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

main().catch((err) => {
  status.textContent = `ERROR: ${err.message}`;
  window.__viewer = { ready: true, error: String(err.message), triangles: 0, drawCalls: 0, variants: [] };
  console.error(err);
});
loop();

addEventListener('resize', () => {
  const a = innerWidth / innerHeight;
  camera.left = -frustum * a;
  camera.right = frustum * a;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
