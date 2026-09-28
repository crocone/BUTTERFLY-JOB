/**
 * Dev tool: inspect Blender-exported assets exactly as the game loads them
 * (same loader, Draco decoder, paper materials).
 *   ?asset=trees               gallery of one asset's variants (layout=grid, default)
 *   ?asset=terrain,bank&era=2026&plan=O:y,P:k   world layout, variants filtered like the game
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AssetLibrary } from '../render/assets';
import { variantVisible } from '../render/variants';
import { computeTimeline } from '../sim/causality';
import type { Era } from '../sim/types';

declare global {
  interface Window {
    __viewer?: { ready: boolean; error?: string; triangles: number; drawCalls: number; variants: string[] };
  }
}

const params = new URLSearchParams(location.search);
const assetIds = (params.get('asset') ?? 'trees').split(',');
const era = params.get('era') ? (Number(params.get('era')) as Era) : null;
const layout = era ? 'world' : (params.get('layout') ?? 'grid');
const contract = (params.get('contract') ?? 'c1') as 'c1' | 'c2' | 'c3';
const plan: Record<string, string> = {};
for (const kv of (params.get('plan') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  plan[k] = v;
}
const facts = computeTimeline(plan).facts;

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
const frustum = Number(params.get('frustum') ?? 14);
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, -200, 400);
const az = (Number(params.get('az') ?? 45) * Math.PI) / 180;
const el = (Number(params.get('el') ?? 35) * Math.PI) / 180;
camera.position.set(Math.sin(az) * Math.cos(el) * 60, Math.sin(el) * 60, Math.cos(az) * Math.cos(el) * 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(Number(params.get('tx') ?? 0), 0, Number(params.get('tz') ?? 0));
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight('#fff8ec', '#b9ab93', 1.5));
const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
sun.position.set(-14, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun);

if (layout === 'grid') {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#e6dcc8' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

const status = document.getElementById('status')!;
const mixers: THREE.AnimationMixer[] = [];
const clock = new THREE.Timer();
const list = document.getElementById('list')!;

async function main() {
  const lib = new AssetLibrary('./');
  const manifest = await lib.loadManifest();
  const allVariants: THREE.Object3D[] = [];
  if (assetIds[0] === 'characters') {
    const gltf = await lib.load('characters');
    const names = gltf.scene.children.flatMap((c) => (c.userData.bj_role === 'rig' ? c.children : [c])).filter((o) => o.userData.bj_role === 'character').map((o) => o.name);
    const clipName = params.get('clip') ?? 'walk';
    names.forEach((n, i) => {
      const inst = cloneSkinned(gltf.scene);
      inst.traverse((o) => {
        if (o.userData.bj_role === 'character') o.visible = o.name === n;
      });
      inst.position.x = (i - (names.length - 1) / 2) * 0.7;
      scene.add(inst);
      const mixer = new THREE.AnimationMixer(inst);
      const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations[0];
      mixer.clipAction(clip).play();
      mixer.setTime(0.2 + i * 0.07);
      mixers.push(mixer);
    });
    camera.zoom = 4.5;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0.45, 0);
    renderer.render(scene, camera);
    status.textContent = `characters: ${names.join(', ')} · clips ${gltf.animations.map((c) => c.name).join(', ')}`;
    window.__viewer = { ready: true, triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls, variants: names };
    return;
  }
  for (const id of assetIds) {
    const gltf = await lib.load(id);
    scene.add(gltf.scene);
    gltf.scene.traverse((o) => {
      if (o.userData.bj_role === 'variant' || o.userData.bj_role === 'character') allVariants.push(o);
      if (o.userData.bj_role === 'proxy' || o.userData.bj_role === 'anchor') o.visible = false;
    });
  }
  if (era) {
    for (const v of allVariants) {
      if (v.userData.bj_variant) v.visible = variantVisible(String(v.userData.bj_variant), era, facts, contract);
    }
  } else if (layout === 'grid') {
    const roots = allVariants.filter((v) => !allVariants.some((p) => p !== v && isAncestor(p, v)));
    const cols = Math.ceil(Math.sqrt(roots.length));
    const box = new THREE.Box3();
    let cell = 0;
    for (const v of roots) {
      box.setFromObject(v);
      const size = box.getSize(new THREE.Vector3());
      cell = Math.max(cell, size.x, size.z);
    }
    cell += 1.2;
    roots.forEach((v, i) => {
      box.setFromObject(v);
      const c = box.getCenter(new THREE.Vector3());
      const gx = (i % cols) - (cols - 1) / 2;
      const gz = Math.floor(i / cols) - (Math.ceil(roots.length / cols) - 1) / 2;
      v.position.x += gx * cell - c.x;
      v.position.z += gz * cell - c.z;
    });
    camera.zoom = 14 / Math.max(8, cell * cols * 0.55);
    camera.updateProjectionMatrix();
  }
  list.innerHTML = '';
  for (const v of allVariants) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = v.visible;
    cb.onchange = () => (v.visible = cb.checked);
    label.append(cb, ` ${v.userData.bj_variant ?? v.name}`);
    list.appendChild(label);
  }
  renderer.render(scene, camera);
  const tris = assetIds.reduce((s, id) => s + (manifest.assets[id]?.stats.triangles ?? 0), 0);
  status.textContent = `${assetIds.join(', ')}: ${tris} tris · Blender ${manifest.blender} · draw calls ${renderer.info.render.calls}`;
  window.__viewer = {
    ready: true,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    variants: allVariants.filter((v) => v.visible).map((v) => String(v.userData.bj_variant ?? v.name)),
  };
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D): boolean {
  let p = b.parent;
  while (p) {
    if (p === a) return true;
    p = p.parent;
  }
  return false;
}

function loop() {
  clock.update();
  const dt = clock.getDelta();
  for (const m of mixers) m.update(dt);
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
