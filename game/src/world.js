// EMBERLINE — world: turns map data into three.js meshes, lights and sky.
// One job: build the static scene. Dynamic things (agents, effects) live in
// render.js; the simulation never touches this module's meshes.
import * as THREE from 'three';
import { WALLS, PROPS, SITES, LAMPS } from './mapdata.js';

export function buildWorld(scene, tex) {
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.94, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.85, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.6, metalness: 0.55 }),
    rust: new THREE.MeshStandardMaterial({ map: tex.containerRust, roughness: 0.7, metalness: 0.35 }),
    teal: new THREE.MeshStandardMaterial({ map: tex.containerTeal, roughness: 0.7, metalness: 0.35 }),
    sand: new THREE.MeshStandardMaterial({ map: tex.containerSand, roughness: 0.7, metalness: 0.35 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8, metalness: 0.1 }),
    barrelRed: new THREE.MeshStandardMaterial({ color: 0x8c3a26, roughness: 0.55, metalness: 0.5 }),
    barrelTeal: new THREE.MeshStandardMaterial({ color: 0x2e6f6a, roughness: 0.55, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.9, metalness: 0.1 }),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14);

  function box(x0, z0, x1, z1, h, mat, y0) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(x1 - x0, h, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 || 0) + h / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // Ground: asphalt yard with a darker apron under the walls.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 56),
    new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Walls, with a hazard stripe cap on the two mid walls' door posts.
  for (const w of WALLS) {
    box(w[0], w[1], w[2], w[3], w[4], mats.concrete);
  }
  box(-1.5, -6, -1.1, -5, 3.2, mats.hazard);
  box(1.1, -6, 1.5, -5, 3.2, mats.hazard);

  // Props.
  let barrelFlip = false;
  for (const p of PROPS) {
    if (p.kind === 'crate') {
      box(p.x0, p.z0, p.x1, p.z1, p.h, mats.wood);
    } else if (p.kind === 'crateTall') {
      box(p.x0, p.z0, p.x1, p.z1, 1.2, mats.wood);
      box(p.x0 + 0.08, p.z0 + 0.08, p.x1 - 0.08, p.z1 - 0.08, 1.2, mats.wood, 1.2);
    } else if (p.kind === 'container') {
      const mat = p.variant === 'containerTeal' ? mats.teal : p.variant === 'containerSand' ? mats.sand : mats.rust;
      box(p.x0, p.z0, p.x1, p.z1, p.h, mat);
      box(p.x0, p.z0, p.x1, p.z1, 0.14, mats.dark, p.h);
    } else if (p.kind === 'barrel') {
      const m = new THREE.Mesh(cylGeo, barrelFlip ? mats.barrelTeal : mats.barrelRed);
      barrelFlip = !barrelFlip;
      m.position.set((p.x0 + p.x1) / 2, 0.55, (p.z0 + p.z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Site decals: painted letters and a tinted zone on the ground.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: key === 'A' ? tex.siteA : tex.siteB, transparent: true, depthWrite: false,
      }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(s.labelX, 0.02, s.labelZ);
    scene.add(decal);
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0),
      new THREE.MeshBasicMaterial({
        color: key === 'A' ? 0xf2a33c : 0x3ec6b8, transparent: true, opacity: 0.07, depthWrite: false,
      }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set((s.x0 + s.x1) / 2, 0.015, (s.z0 + s.z1) / 2);
    scene.add(zone);
    // Beacon poles at the site corners.
    for (const [bx, bz] of [[s.x0 + 0.6, s.z0 + 0.6], [s.x1 - 0.6, s.z0 + 0.6]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), mats.dark);
      pole.position.set(bx, 1.7, bz);
      pole.castShadow = true;
      scene.add(pole);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({
          color: key === 'A' ? 0xf2a33c : 0x3ec6b8, emissive: key === 'A' ? 0xf2a33c : 0x3ec6b8,
          emissiveIntensity: 2.2,
        }),
      );
      tip.position.set(bx, 3.5, bz);
      scene.add(tip);
    }
  }

  // Lamp posts with warm point lights.
  for (const lamp of LAMPS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.6, 8), mats.dark);
    pole.position.set(lamp.x, 2.3, lamp.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: lamp.color, emissiveIntensity: 2.6 }),
    );
    head.position.set(lamp.x, 4.7, lamp.z);
    scene.add(head);
    const light = new THREE.PointLight(lamp.color, 26, 20, 1.8);
    light.position.set(lamp.x, 4.5, lamp.z);
    scene.add(light);
  }

  // Distant skyline silhouettes beyond the walls: cranes and warehouses.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x1a2233, fog: true });
  const rng = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2;
    const r = 52 + rng() * 14;
    const w = 6 + rng() * 10;
    const h = 8 + rng() * 16;
    const m = new THREE.Mesh(boxGeo, skylineMat);
    m.scale.set(w, h, 6);
    m.position.set(Math.cos(ang) * r, h / 2 - 0.5, Math.sin(ang) * r);
    scene.add(m);
  }
  // Two dock cranes, built from boxes.
  for (const cx of [-38, 38]) {
    const legMat = new THREE.MeshBasicMaterial({ color: 0x141b29 });
    for (const off of [-2.2, 2.2]) {
      const leg = new THREE.Mesh(boxGeo, legMat);
      leg.scale.set(0.8, 22, 0.8);
      leg.position.set(cx + off, 11, -30);
      scene.add(leg);
    }
    const jib = new THREE.Mesh(boxGeo, legMat);
    jib.scale.set(18, 0.9, 0.9);
    jib.position.set(cx + 3, 22, -30);
    scene.add(jib);
  }

  // Sky dome with the painted dusk gradient.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 14),
    new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Lighting: low warm sun plus cool sky fill, and dusk fog.
  scene.fog = new THREE.Fog(0x2c3550, 55, 150);
  const hemi = new THREE.HemisphereLight(0x8fb4d9, 0x3a2f28, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.1);
  sun.position.set(-34, 26, 20);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
}

function mulberry(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
