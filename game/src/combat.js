// EMBERLINE — combat: hitscan shooting against body hitboxes, grenade
// physics, explosions and hearing. Damage flows through damageAgent so kills,
// rewards, the killfeed and the bomb drop all happen in exactly one place.
import { S, pushEvent, agentById } from './state.js';
import { ECONOMY, GRENADE, weaponDef } from './config.js';
import { bodySpheres, eyeHeight, currentWeapon } from './agents.js';
import { rayWallDist, raySphere, segmentBlocked } from './collision.js';
import { spawnTracer, spawnBurst, explosionFlash, addSmokeMesh } from './effects.js';
import { sfx } from './audio.js';

const SPHERES = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
let grenadeId = 0;
let smokeId = 0;

export function aimDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function muzzlePos(a, out) {
  const cp = Math.cos(a.pitch);
  const fx = -Math.sin(a.yaw) * cp;
  const fy = Math.sin(a.pitch);
  const fz = -Math.cos(a.yaw) * cp;
  const rx = Math.cos(a.yaw);
  const rz = -Math.sin(a.yaw);
  out.x = a.pos.x + fx * 0.5 + rx * 0.16;
  out.y = a.pos.y + eyeHeight(a) + fy * 0.5 - 0.12;
  out.z = a.pos.z + fz * 0.5 + rz * 0.16;
  return out;
}

function randn() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}

// One trigger pull resolved: pellets leave the muzzle with spread jitter,
// the nearest of walls and enemy bodies wins, head spheres pay the bonus.
export function fireHitscan(shooter, spread, boxes, now) {
  const w = currentWeapon(shooter);
  if (!w) return;
  const def = weaponDef(w.key);
  const ox = shooter.pos.x;
  const oy = shooter.pos.y + eyeHeight(shooter);
  const oz = shooter.pos.z;
  const base = { x: 0, y: 0, z: 0 };
  aimDir(shooter.yaw + shooter.recoilYaw, shooter.pitch + shooter.recoilPitch, base);
  const muzzle = { x: 0, y: 0, z: 0 };
  muzzlePos(shooter, muzzle);
  // Orthonormal basis around the aim direction for spread jitter.
  const rx = Math.cos(shooter.yaw);
  const rz = -Math.sin(shooter.yaw);
  const ux = base.y * rz - base.z * 0;
  const uy = base.z * rx - base.x * rz;
  const uz = base.x * 0 - base.y * rx;
  const ulen = Math.hypot(ux, uy, uz) || 1;
  const upx = ux / ulen;
  const upy = uy / ulen;
  const upz = uz / ulen;

  for (let p = 0; p < def.pellets; p++) {
    const jx = randn() * spread;
    const jy = randn() * spread;
    let dx = base.x + rx * jx + upx * jy;
    let dy = base.y + jy * upy;
    let dz = base.z + rz * jx + upz * jy;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const maxDist = 90;
    const wallT = rayWallDist(ox, oy, oz, dx, dy, dz, boxes, maxDist);
    let bestT = wallT;
    let bestVictim = null;
    let bestHead = false;
    for (const v of S.agents) {
      if (v === shooter || !v.alive || v.team === shooter.team) continue;
      bodySpheres(v, v.crouch, SPHERES);
      for (let s = 0; s < 4; s++) {
        const t = raySphere(ox, oy, oz, dx, dy, dz, v.pos.x, v.pos.y + SPHERES[s][0], v.pos.z, SPHERES[s][1]);
        if (t > 0 && t < bestT) {
          bestT = t;
          bestVictim = v;
          bestHead = SPHERES[s][2] === 1;
        }
      }
    }
    const hx = ox + dx * bestT;
    const hy = oy + dy * bestT;
    const hz = oz + dz * bestT;
    spawnTracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz, shooter.team === 'V' ? 0xffd27a : 0x9fe8e0);
    if (bestVictim) {
      let dmg = def.damage;
      if (bestT > def.rangeNear) {
        const t = Math.min(1, (bestT - def.rangeNear) / Math.max(1, def.rangeFar - def.rangeNear));
        dmg *= 1 - (1 - (def.key === 'shotgun' ? 0.3 : 0.6)) * t;
      }
      if (bestHead) dmg *= def.headMul;
      damageAgent(bestVictim, dmg, shooter, bestHead, now, w.key);
      spawnBurst(hx, hy, hz, 0xa8231a, 5, 2.2, 0.4, 5);
    } else if (bestT < maxDist) {
      spawnBurst(hx, hy, hz, 0xd8c9a8, 4, 1.8, 0.35, 7);
      if (hy < 0.1) spawnBurst(hx, 0.06, hz, 0x8a847c, 3, 1.4, 0.3, 6);
    }
  }
  sfx.shot(def.sound, shooter.pos.x, shooter.pos.z);
  addNoise(shooter.pos.x, shooter.pos.z, 27);
}

export function damageAgent(victim, dmg, attacker, isHead, now, weaponKey) {
  if (!victim.alive) return;
  let hpDmg = dmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg * 0.45);
    victim.armor -= absorbed;
    hpDmg = dmg - absorbed * 0.7;
  }
  victim.hp -= hpDmg;
  victim.lastDamageT = now;
  if (attacker) {
    victim.lastDamageDir = Math.atan2(-(attacker.pos.x - victim.pos.x), -(attacker.pos.z - victim.pos.z));
  }
  if (victim.isPlayer) {
    S.damageFlash = 1;
    if (attacker) {
      const ang = Math.atan2(-(attacker.pos.x - victim.pos.x), -(attacker.pos.z - victim.pos.z));
      S.damageDir = ang - victim.yaw;
    }
    sfx.hurt();
  }
  if (attacker && attacker.isPlayer) {
    S.hitmark = 0.14;
    S.hitmarkHead = isHead;
    sfx.hit(isHead);
  }
  // Getting shot breaks a plant or defuse channel.
  if (victim.channel) victim.channel = null;
  if (victim.hp > 0) return;

  victim.hp = 0;
  victim.alive = false;
  victim.deaths += 1;
  victim.deathT = now;
  victim.channel = null;
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.money = Math.min(ECONOMY.max, attacker.money + ECONOMY.kill);
  }
  S.killfeed.unshift({
    killer: attacker ? attacker.name : '—',
    killerTeam: attacker ? attacker.team : null,
    victim: victim.name,
    victimTeam: victim.team,
    head: isHead,
    weapon: weaponKey || '',
    t: now,
  });
  if (S.killfeed.length > 5) S.killfeed.length = 5;
  if (attacker && attacker.isPlayer) sfx.kill();
  if (victim.hasBomb) {
    victim.hasBomb = false;
    S.bomb.state = 'dropped';
    S.bomb.carrierId = -1;
    S.bomb.x = victim.pos.x;
    S.bomb.z = victim.pos.z;
    pushEvent('bombDrop', { x: victim.pos.x, z: victim.pos.z });
  }
  if (victim.isPlayer) {
    const ally = S.agents.find((a) => a.team === 'V' && a.alive && !a.isPlayer);
    S.spectateId = ally ? ally.id : -1;
    pushEvent('msg', { text: 'You were eliminated — spectating a teammate', tone: 'bad' });
  }
  pushEvent('kill', { victimId: victim.id, attackerId: attacker ? attacker.id : -1 });
}

export function addNoise(x, z, radius) {
  S.noises.push({ x, z, radius, t: S.time });
  if (S.noises.length > 24) S.noises.shift();
}

export function throwGrenade(a, kind, now) {
  if (kind === 'frag' && a.frags <= 0) return false;
  if (kind === 'smoke' && a.smokes <= 0) return false;
  const dir = { x: 0, y: 0, z: 0 };
  aimDir(a.yaw, a.pitch + 0.08, dir);
  const speed = 13.5;
  if (kind === 'frag') a.frags -= 1;
  else a.smokes -= 1;
  S.grenades.push({
    id: grenadeId++,
    kind,
    x: a.pos.x,
    y: a.pos.y + eyeHeight(a) - 0.15,
    z: a.pos.z,
    vx: dir.x * speed + a.vel.x * 0.4,
    vy: dir.y * speed + 1.6,
    vz: dir.z * speed + a.vel.z * 0.4,
    fuse: kind === 'frag' ? GRENADE.fragFuse : 1.4,
    ownerId: a.id,
    bounced: false,
  });
  if (a.isPlayer) sfx.throwWhoosh();
  return true;
}

export function updateGrenades(dt, boxes, now) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i];
    g.fuse -= dt;
    const px = g.x;
    const py = g.y;
    const pz = g.z;
    g.vy -= 20 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    // Ground bounce.
    if (g.y < 0.09) {
      g.y = 0.09;
      if (Math.abs(g.vy) > 1.2) {
        sfx.bounce(g.x, g.z);
        addNoise(g.x, g.z, 9);
      }
      g.vy = Math.abs(g.vy) * 0.35;
      g.vx *= 0.7;
      g.vz *= 0.7;
      g.bounced = true;
    }
    // Wall and prop bounce: reflect along the axis the grenade entered on.
    const r = 0.09;
    for (const b of boxes) {
      if (g.x < b.x0 - r || g.x > b.x1 + r || g.z < b.z0 - r || g.z > b.z1 + r || g.y > b.h + r) continue;
      if (px < b.x0 - r || px > b.x1 + r) {
        g.vx *= -0.4;
        g.x = px < b.x0 ? b.x0 - r : b.x1 + r;
      } else if (pz < b.z0 - r || pz > b.z1 + r) {
        g.vz *= -0.4;
        g.z = pz < b.z0 ? b.z0 - r : b.z1 + r;
      } else if (py >= b.h) {
        g.y = b.h + r;
        g.vy = Math.abs(g.vy) * 0.35;
      } else {
        g.vx *= -0.4;
        g.vz *= -0.4;
      }
      g.bounced = true;
      break;
    }
    if (g.fuse > 0) continue;
    S.grenades.splice(i, 1);
    if (g.kind === 'frag') {
      const owner = agentById(g.ownerId);
      explode(g.x, Math.max(0.3, g.y), g.z, GRENADE.fragRadius, GRENADE.fragDamage, owner, boxes, now);
    } else {
      const smoke = {
        id: smokeId++, x: g.x, y: 1.1, z: g.z, r: GRENADE.smokeRadius, until: now + GRENADE.smokeTime,
      };
      S.smokes.push(smoke);
      addSmokeMesh(smoke.id, smoke.x, smoke.y, smoke.z, smoke.r);
      sfx.smokePop(g.x, g.z);
      addNoise(g.x, g.z, 12);
    }
  }
}

export function explode(x, y, z, radius, damage, owner, boxes, now) {
  explosionFlash(x, y, z);
  spawnBurst(x, y, z, 0xff9a3c, 42, 7, 0.7, 4);
  spawnBurst(x, y, z, 0x554a3e, 26, 4, 1.1, 2);
  spawnBurst(x, y, z, 0xffd27a, 20, 10, 0.4, 5);
  sfx.explosion(x, z);
  addNoise(x, z, 60);
  const p = S.player;
  if (p) {
    const dx = p.pos.x - x;
    const dz = p.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 20) S.shake = Math.min(1, S.shake + (1 - d / 20) * 0.9);
  }
  for (const v of S.agents) {
    if (!v.alive) continue;
    if (owner && v.team === owner.team && v !== owner) continue;
    const dx = v.pos.x - x;
    const dy = v.pos.y + 1.0 - y;
    const dz = v.pos.z - z;
    const d = Math.hypot(dx, dy, dz);
    if (d > radius) continue;
    const blocked = segmentBlocked(x, y, z, v.pos.x, v.pos.y + 1.0, v.pos.z, boxes, null);
    let dmg = damage * (1 - (d / radius) * 0.85);
    if (blocked) dmg *= 0.35;
    damageAgent(v, dmg, owner, false, now, 'frag');
  }
}
