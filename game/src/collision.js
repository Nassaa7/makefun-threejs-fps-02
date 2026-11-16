// EMBERLINE — collision and visibility math. Pure functions over plain data,
// no three.js dependency, so the simulation stays deterministic and testable.
// Colliders are axis-aligned boxes {x0,z0,x1,z1,h} standing on y=0.

export function makeBox(x0, z0, x1, z1, h) {
  return { x0, z0, x1, z1, h };
}

// Push a circle (agent feet at px,pz, radius r) out of every box it overlaps.
// Mutates pos {x,z} in place; returns true when a push happened.
export function collideCircle(pos, r, boxes) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = pos.x < b.x0 ? b.x0 : pos.x > b.x1 ? b.x1 : pos.x;
    const cz = pos.z < b.z0 ? b.z0 : pos.z > b.z1 ? b.z1 : pos.z;
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.x0 + r;
      const pr = b.x1 - pos.x + r;
      const pn = pos.z - b.z0 + r;
      const ps = b.z1 - pos.z + r;
      const m = Math.min(pl, pr, pn, ps);
      if (m === pl) pos.x = b.x0 - r;
      else if (m === pr) pos.x = b.x1 + r;
      else if (m === pn) pos.z = b.z0 - r;
      else pos.z = b.z1 + r;
    }
  }
  return hit;
}

// Slab test: does the segment a->b hit the box? Boxes stand on y=0 up to h.
export function segmentHitsBox(ax, ay, az, bx, by, bz, box) {
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (ax < box.x0 || ax > box.x1) return false;
  } else {
    let t1 = (box.x0 - ax) / dx;
    let t2 = (box.x1 - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  // Y slab (0..h)
  if (Math.abs(dy) < 1e-9) {
    if (ay < 0 || ay > box.h) return false;
  } else {
    let t1 = (0 - ay) / dy;
    let t2 = (box.h - ay) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (az < box.z0 || az > box.z1) return false;
  } else {
    let t1 = (box.z0 - az) / dz;
    let t2 = (box.z1 - az) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

// Is the line of sight between two points blocked by a wall or a smoke cloud?
export function segmentBlocked(ax, ay, az, bx, by, bz, boxes, smokes) {
  for (let i = 0; i < boxes.length; i++) {
    if (segmentHitsBox(ax, ay, az, bx, by, bz, boxes[i])) return true;
  }
  if (smokes) {
    for (let i = 0; i < smokes.length; i++) {
      if (segmentHitsSphere(ax, ay, az, bx, by, bz, smokes[i])) return true;
    }
  }
  return false;
}

function segmentHitsSphere(ax, ay, az, bx, by, bz, s) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-9) {
    t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }
  const px = ax + dx * t - s.x;
  const py = ay + dy * t - s.y;
  const pz = az + dz * t - s.z;
  return px * px + py * py + pz * pz < s.r * s.r;
}

// Nearest distance from a ray to any box, or Infinity. Ray dir must be unit.
export function rayWallDist(ox, oy, oz, dx, dy, dz, boxes, maxDist) {
  let best = maxDist;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let tmin = 0;
    let tmax = best;
    let ok = true;
    // X
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) ok = false; }
    else {
      let t1 = (b.x0 - ox) / dx;
      let t2 = (b.x1 - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
    if (!ok) continue;
    // Y
    if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > b.h) ok = false; }
    else {
      let t1 = (0 - oy) / dy;
      let t2 = (b.h - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
    if (!ok) continue;
    // Z
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) ok = false; }
    else {
      let t1 = (b.z0 - oz) / dz;
      let t2 = (b.z1 - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
    if (ok && tmin < best && tmin > 0) best = tmin;
  }
  return best;
}

// Ray vs sphere. Returns the nearest positive t, or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  return t > 0 ? t : tca + thc;
}

export function pointInRect(x, z, r) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Smallest signed angle difference, wrapped to [-PI, PI].
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
