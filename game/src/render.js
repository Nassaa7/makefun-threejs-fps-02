// EMBERLINE — render: three.js renderer, agent bodies, the first-person
// viewmodel, the bomb prop and the camera. It only reads the state store; it
// never steps the simulation. Meshes are built once and reused every frame.
import * as THREE from 'three';
import { S, agentById } from './state.js';
import { TEAM_COLOR, weaponDef } from './config.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './world.js';
import { initEffects, updateEffects } from './effects.js';
import { eyeHeight, currentWeapon } from './agents.js';

let renderer;
let scene;
let camera;
let viewmodel;
let gunGroups = {};
let hands;
let muzzleFlash;
let muzzleLight;
let bombMesh;
let bombLight;
let grenadePool = [];
let adsT = 0;
let bobPhase = 0;
let fovNow = 74;

export function initRender(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 320);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const tex = makeTextures();
  buildWorld(scene, tex);
  initEffects(scene);
  buildViewmodel();
  buildBombMesh();
  buildGrenadePool();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

function mat(color, rough, metal) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough === undefined ? 0.8 : rough, metalness: metal || 0 });
}

export function buildAgentMesh(a) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const jacket = mat(TEAM_COLOR[a.team], 0.85, 0);
  const pants = mat(0x2b2e33, 0.9, 0);
  const skin = mat(0xc9a184, 0.7, 0);
  const dark = mat(0x1d2024, 0.6, 0.4);
  const legGeo = new THREE.BoxGeometry(0.16, 0.72, 0.17);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.36, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  g.add(legL);
  g.add(legR);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 12), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.3), dark);
  vest.position.set(0, 1.18, 0.03);
  g.add(vest);
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), dark);
    pad.position.set(sx * 0.3, 1.36, 0);
    g.add(pad);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10), dark);
  helmet.scale.y = 0.72;
  helmet.position.y = 1.68;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), mat(0x0e1418, 0.3, 0.7));
  visor.position.set(0, 1.63, 0.15);
  g.add(visor);
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.6), dark);
  gun.add(body);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), mat(0x33373d, 0.7, 0.2));
  mag.position.set(0, -0.12, 0.05);
  gun.add(mag);
  gun.position.set(0.2, 1.3, 0.32);
  g.add(gun);
  g.visible = false;
  scene.add(g);
  a.mesh = { group: g, legL, legR, gun, walkPhase: Math.random() * 6, fall: 0, crouchK: 0 };
}

function gunBox(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.55, 0.45));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildGun(key) {
  const g = new THREE.Group();
  const dark = 0x23262b;
  const mid = 0x3a3e44;
  if (key === 'pistol') {
    gunBox(0.055, 0.06, 0.24, dark, 0, 0, -0.05, g);
    gunBox(0.05, 0.12, 0.07, mid, 0, -0.08, 0.03, g);
    gunBox(0.02, 0.02, 0.06, 0x111315, 0, 0.045, -0.14, g);
  } else if (key === 'smg') {
    gunBox(0.06, 0.08, 0.42, dark, 0, 0, -0.08, g);
    gunBox(0.05, 0.18, 0.07, mid, 0, -0.12, -0.05, g);
    gunBox(0.04, 0.04, 0.2, 0x111315, 0, 0.01, -0.36, g);
    gunBox(0.05, 0.07, 0.12, mid, 0, -0.06, 0.16, g);
  } else if (key === 'rifle') {
    gunBox(0.065, 0.09, 0.5, dark, 0, 0, -0.1, g);
    gunBox(0.055, 0.16, 0.08, mid, 0, -0.11, -0.08, g);
    gunBox(0.03, 0.03, 0.3, 0x111315, 0, 0.02, -0.48, g);
    gunBox(0.05, 0.08, 0.16, mid, 0, -0.05, 0.2, g);
    gunBox(0.02, 0.03, 0.1, 0x111315, 0, 0.06, -0.18, g);
  } else if (key === 'shotgun') {
    gunBox(0.075, 0.1, 0.5, 0x4a3423, 0, 0, -0.1, g);
    gunBox(0.05, 0.05, 0.34, dark, 0, 0.03, -0.5, g);
    gunBox(0.06, 0.05, 0.14, mid, 0, -0.06, -0.32, g);
    gunBox(0.06, 0.09, 0.18, 0x4a3423, 0, -0.04, 0.2, g);
  } else if (key === 'dmr') {
    gunBox(0.06, 0.08, 0.55, dark, 0, 0, -0.12, g);
    gunBox(0.05, 0.13, 0.07, mid, 0, -0.1, -0.1, g);
    gunBox(0.025, 0.025, 0.42, 0x111315, 0, 0.02, -0.58, g);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 10), mat(0x111315, 0.4, 0.6));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.1);
    g.add(scope);
    gunBox(0.05, 0.08, 0.16, mid, 0, -0.05, 0.2, g);
  } else if (key === 'frag') {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat(0x3a4a2a, 0.6, 0.3));
    g.add(n);
  } else if (key === 'smoke') {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12), mat(0x8a8f92, 0.6, 0.4));
    g.add(n);
  }
  g.visible = false;
  return g;
}

function buildViewmodel() {
  viewmodel = new THREE.Group();
  viewmodel.position.set(0.28, -0.26, -0.55);
  camera.add(viewmodel);
  for (const key of ['pistol', 'smg', 'rifle', 'shotgun', 'dmr', 'frag', 'smoke']) {
    gunGroups[key] = buildGun(key);
    viewmodel.add(gunGroups[key]);
  }
  hands = new THREE.Group();
  const glove = mat(0x2b2e33, 0.9, 0);
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), glove);
  h1.position.set(0.02, -0.09, 0.02);
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), glove);
  h2.position.set(-0.03, -0.07, -0.2);
  hands.add(h1);
  hands.add(h2);
  viewmodel.add(hands);
  muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  muzzleFlash.position.set(0, 0.02, -0.72);
  muzzleFlash.visible = false;
  viewmodel.add(muzzleFlash);
  muzzleLight = new THREE.PointLight(0xffc27a, 0, 7, 2);
  muzzleLight.position.set(0.2, -0.1, -0.8);
  camera.add(muzzleLight);
}

function buildBombMesh() {
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), mat(0x22252a, 0.6, 0.4));
  body.position.y = 0.1;
  bombMesh.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.27), mat(0xf2a33c, 0.6, 0.2));
  stripe.position.y = 0.16;
  bombMesh.add(stripe);
  bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 3 }),
  );
  bombLight.position.set(0.12, 0.23, 0);
  bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

function buildGrenadePool() {
  grenadePool = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(geo, mat(0x3a4a2a, 0.6, 0.3));
    m.visible = false;
    scene.add(m);
    grenadePool.push(m);
  }
}

function syncAgents(dt, now) {
  for (const a of S.agents) {
    if (!a.mesh) buildAgentMesh(a);
    const m = a.mesh;
    const g = m.group;
    const hidden = a.isPlayer || a.id === S.spectateId;
    g.visible = !hidden;
    if (hidden) continue;
    g.position.set(a.pos.x, a.pos.y, a.pos.z);
    const targetFall = a.alive ? 0 : 1;
    m.fall += (targetFall - m.fall) * Math.min(1, dt * 7);
    const targetCrouch = a.crouch && a.alive ? 1 : 0;
    m.crouchK += (targetCrouch - m.crouchK) * Math.min(1, dt * 9);
    g.rotation.y = a.yaw + Math.PI;
    g.rotation.x = -1.45 * m.fall;
    g.scale.y = 1 - 0.22 * m.crouchK;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (a.alive && speed > 0.4 && a.onGround) {
      m.walkPhase += dt * speed * 1.7;
      const sw = Math.sin(m.walkPhase) * 0.5;
      m.legL.rotation.x = sw;
      m.legR.rotation.x = -sw;
    } else {
      m.legL.rotation.x *= 0.8;
      m.legR.rotation.x *= 0.8;
    }
  }
}

function syncViewmodel(dt, now) {
  const p = S.player;
  if (!p || !p.alive) {
    viewmodel.visible = false;
    return;
  }
  viewmodel.visible = true;
  const w = currentWeapon(p);
  const key = w ? w.key : p.slot;
  for (const k of Object.keys(gunGroups)) gunGroups[k].visible = k === key;
  hands.visible = key !== 'frag' && key !== 'smoke';
  const aiming = !!S.aiming;
  adsT += ((aiming ? 1 : 0) - adsT) * Math.min(1, dt * 11);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed > 0.4 && p.onGround) bobPhase += dt * speed * 1.55;
  const bobX = Math.sin(bobPhase) * 0.008 * (1 - adsT * 0.7);
  const bobY = Math.abs(Math.cos(bobPhase)) * 0.007 * (1 - adsT * 0.7);
  const kickT = Math.max(0, 0.12 - (now - (S.shotFlashT || -9))) / 0.12;
  let dip = 0;
  if (p.reloadUntil > now) {
    const def = w ? weaponDef(w.key) : null;
    if (def) {
      const prog = 1 - (p.reloadUntil - now) / def.reload;
      dip = Math.sin(Math.min(1, Math.max(0, prog)) * Math.PI);
    }
  }
  const hipX = 0.28;
  const hipY = -0.26;
  viewmodel.position.x = hipX * (1 - adsT) + bobX;
  viewmodel.position.y = hipY + adsT * 0.045 + bobY - dip * 0.09;
  viewmodel.position.z = -0.55 + kickT * 0.05;
  viewmodel.rotation.x = kickT * 0.14 - dip * 0.55;
  viewmodel.rotation.y = 0;
  const flash = now - (S.shotFlashT || -9) < 0.05 && w;
  muzzleFlash.visible = !!flash;
  if (flash) {
    muzzleFlash.rotation.z = Math.random() * Math.PI;
    const tipZ = key === 'dmr' ? -0.82 : key === 'rifle' || key === 'shotgun' ? -0.72 : key === 'smg' ? -0.55 : -0.3;
    muzzleFlash.position.z = tipZ;
    muzzleLight.intensity = 9;
  } else {
    muzzleLight.intensity = 0;
  }
  // Field of view: base 74, down to the weapon's zoom when aiming.
  let targetFov = 74;
  if (aiming && w) targetFov = weaponDef(w.key).zoomFov;
  fovNow += (targetFov - fovNow) * Math.min(1, dt * 12);
  if (Math.abs(fovNow - camera.fov) > 0.05) {
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }
}

function syncBomb(now) {
  const b = S.bomb;
  if (b.state === 'dropped' || b.state === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(b.x, 0, b.z);
    if (b.state === 'planted') {
      const frac = b.fuse / 40;
      const rate = 2 + (1 - frac) * 10;
      bombLight.material.emissiveIntensity = Math.sin(now * rate * Math.PI) > 0 ? 3.5 : 0.3;
    } else {
      bombLight.material.emissiveIntensity = 1.2;
    }
  } else {
    bombMesh.visible = false;
  }
}

function syncGrenades() {
  for (let i = 0; i < grenadePool.length; i++) {
    const m = grenadePool[i];
    const g = S.grenades[i];
    if (!g) { m.visible = false; continue; }
    m.visible = true;
    m.position.set(g.x, g.y, g.z);
    m.material.color.setHex(g.kind === 'frag' ? 0x3a4a2a : 0x8a8f92);
  }
}

function syncCamera(dt) {
  const p = S.player;
  let view = p;
  if (p && !p.alive && S.spectateId >= 0) {
    const t = agentById(S.spectateId);
    if (t && t.alive) view = t;
  }
  if (!view) return;
  const eye = eyeHeight(view);
  camera.position.set(view.pos.x, view.pos.y + eye, view.pos.z);
  const shake = S.shake;
  const shX = shake > 0.01 ? (Math.random() - 0.5) * shake * 0.05 : 0;
  const shY = shake > 0.01 ? (Math.random() - 0.5) * shake * 0.05 : 0;
  camera.rotation.y = view.yaw + shX;
  camera.rotation.x = view.pitch + view.recoilPitch + shY;
  // Lean into strafing slightly.
  const rx = Math.cos(view.yaw);
  const rz = -Math.sin(view.yaw);
  const lateral = view.vel.x * rx + view.vel.z * rz;
  camera.rotation.z = -lateral * 0.006;
}

export function renderFrame(dt, now) {
  syncAgents(dt, now);
  syncViewmodel(dt, now);
  syncBomb(now);
  syncGrenades();
  syncCamera(dt);
  updateEffects(dt, now);
  renderer.render(scene, camera);
}
