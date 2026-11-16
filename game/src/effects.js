// EMBERLINE — effects: pooled tracers, spark particles, smoke clouds and
// explosion flashes. Fixed pools, allocated once; the hot loop only writes
// into preallocated buffers.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 400;

let sceneRef = null;
let tracers = [];
let pGeo = null;
let pPos = null;
let pCol = null;
let pVel = null;
let pLife = null;
let pMax = null;
let pGrav = null;
let pHead = 0;
let points = null;
let flashLight = null;
let flashSphere = null;
let flashT = 0;
let smokeMeshes = new Map();
let smokeGeo = null;
let smokeMat = null;
const tmpColor = { r: 0, g: 0, b: 0 };

export function initEffects(scene) {
  sceneRef = scene;
  tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  pPos = new Float32Array(MAX_PARTICLES * 3);
  pCol = new Float32Array(MAX_PARTICLES * 3);
  pVel = new Float32Array(MAX_PARTICLES * 3);
  pLife = new Float32Array(MAX_PARTICLES);
  pMax = new Float32Array(MAX_PARTICLES);
  pGrav = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -100;
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);

  flashLight = new THREE.PointLight(0xff9a3c, 0, 26, 1.6);
  scene.add(flashLight);
  flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashSphere.visible = false;
  scene.add(flashSphere);

  smokeGeo = new THREE.SphereGeometry(1, 14, 10);
  smokeMat = new THREE.MeshStandardMaterial({
    color: 0xcfd4d6, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false,
  });
}

export function spawnTracer(fx, fy, fz, tx, ty, tz, color) {
  let slot = null;
  for (const t of tracers) if (t.life <= 0) { slot = t; break; }
  if (!slot) slot = tracers[0];
  const pos = slot.line.geometry.attributes.position.array;
  pos[0] = fx; pos[1] = fy; pos[2] = fz;
  pos[3] = tx; pos[4] = ty; pos[5] = tz;
  slot.line.geometry.attributes.position.needsUpdate = true;
  slot.line.material.color.setHex(color || 0xffd27a);
  slot.line.material.opacity = 0.9;
  slot.line.visible = true;
  slot.life = 0.07;
}

function hexToRgb(hex, out) {
  out.r = ((hex >> 16) & 255) / 255;
  out.g = ((hex >> 8) & 255) / 255;
  out.b = (hex & 255) / 255;
}

export function spawnBurst(x, y, z, color, count, speed, life, gravity) {
  hexToRgb(color, tmpColor);
  for (let n = 0; n < count; n++) {
    const i = pHead;
    pHead = (pHead + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    pPos[i3] = x;
    pPos[i3 + 1] = y;
    pPos[i3 + 2] = z;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = speed * (0.3 + Math.random() * 0.7);
    pVel[i3] = Math.sin(ph) * Math.cos(th) * sp;
    pVel[i3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.8 + 0.5;
    pVel[i3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    pCol[i3] = tmpColor.r;
    pCol[i3 + 1] = tmpColor.g;
    pCol[i3 + 2] = tmpColor.b;
    pLife[i] = life * (0.6 + Math.random() * 0.4);
    pMax[i] = pLife[i];
    pGrav[i] = gravity === undefined ? 6 : gravity;
  }
  pGeo.attributes.color.needsUpdate = true;
}

export function explosionFlash(x, y, z) {
  flashLight.position.set(x, y + 0.6, z);
  flashLight.intensity = 320;
  flashSphere.position.set(x, y + 0.6, z);
  flashSphere.scale.setScalar(0.5);
  flashSphere.material.opacity = 0.9;
  flashSphere.visible = true;
  flashT = 0.45;
}

export function addSmokeMesh(id, x, y, z, r) {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(smokeGeo, smokeMat);
    const a = (i / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * r * 0.45, 0.4 + (i % 2) * 0.7, Math.sin(a) * r * 0.45);
    m.scale.setScalar(r * (0.8 + (i % 3) * 0.15));
    group.add(m);
  }
  group.position.set(x, y, z);
  sceneRef.add(group);
  smokeMeshes.set(id, { group, seed: Math.random() * 10 });
}

export function removeSmokeMesh(id) {
  const e = smokeMeshes.get(id);
  if (e) {
    sceneRef.remove(e.group);
    smokeMeshes.delete(id);
  }
}

export function clearEffects() {
  for (const t of tracers) { t.life = 0; t.line.visible = false; }
  for (let i = 0; i < MAX_PARTICLES; i++) { pLife[i] = 0; pPos[i * 3 + 1] = -100; }
  for (const id of [...smokeMeshes.keys()]) removeSmokeMesh(id);
  flashT = 0;
  flashLight.intensity = 0;
  flashSphere.visible = false;
}

export function updateEffects(dt, now) {
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
    else t.line.material.opacity = t.life / 0.07 * 0.9;
  }
  let dirty = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    dirty = true;
    pLife[i] -= dt;
    const i3 = i * 3;
    if (pLife[i] <= 0) { pPos[i3 + 1] = -100; continue; }
    pVel[i3 + 1] -= pGrav[i] * dt;
    pPos[i3] += pVel[i3] * dt;
    pPos[i3 + 1] += pVel[i3 + 1] * dt;
    pPos[i3 + 2] += pVel[i3 + 2] * dt;
    if (pPos[i3 + 1] < 0.03) { pPos[i3 + 1] = 0.03; pVel[i3 + 1] = 0; }
  }
  if (dirty) pGeo.attributes.position.needsUpdate = true;
  if (flashT > 0) {
    flashT -= dt;
    flashLight.intensity = Math.max(0, flashT / 0.45) * 320;
    flashSphere.scale.setScalar(0.5 + (0.45 - Math.max(0, flashT)) * 14);
    flashSphere.material.opacity = Math.max(0, flashT / 0.45) * 0.9;
    if (flashT <= 0) { flashLight.intensity = 0; flashSphere.visible = false; }
  }
  for (const e of smokeMeshes.values()) {
    const s = 1 + Math.sin(now * 0.7 + e.seed) * 0.05;
    e.group.scale.setScalar(s);
    e.group.rotation.y += dt * 0.12;
  }
}
