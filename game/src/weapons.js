// EMBERLINE — weapons: fire timing, spread, recoil and reload. This module
// decides whether a trigger pull becomes a shot; combat.js resolves the shot.
import { weaponDef } from './config.js';
import { currentWeapon } from './agents.js';
import { sfx } from './audio.js';

export function spreadFor(a, def, speed, aiming, airborne) {
  let s = def.spread;
  if (aiming && def.scopedSpread !== undefined) s = def.scopedSpread;
  else if (aiming) s *= 0.55;
  s += a.bloom;
  const moveF = Math.min(1, speed / 5.6);
  s += def.moveSpread * moveF;
  if (airborne) s += 0.045;
  if (a.crouch) s *= 0.7;
  return s;
}

export function damageAt(def, dist) {
  if (dist <= def.rangeNear) return def.damage;
  const t = Math.min(1, (dist - def.rangeNear) / Math.max(1, def.rangeFar - def.rangeNear));
  const floor = def.key === 'shotgun' ? 0.3 : 0.6;
  return def.damage * (1 - (1 - floor) * t);
}

// Returns 'shot' when a round leaves the barrel, 'dry' on an empty trigger
// pull, null when the weapon cannot fire yet. Consumes ammo and recoil.
export function tryFire(a, now, trigger) {
  if (!a.alive || a.channel) return null;
  if (now < a.reloadUntil || now < a.switchUntil) return null;
  const w = currentWeapon(a);
  if (!w) return null;
  const def = weaponDef(w.key);
  if (now - a.lastShotT < def.interval) return null;
  if (!trigger) return null;
  if (w.mag <= 0) {
    a.lastShotT = now;
    if (a.isPlayer) sfx.dryFire();
    return 'dry';
  }
  w.mag -= 1;
  a.lastShotT = now;
  a.bloom = Math.min(def.bloomMax, a.bloom + def.bloom);
  a.recoilPitch += def.recoil;
  a.recoilYaw += (Math.random() - 0.5) * def.recoil * 0.6;
  return 'shot';
}

export function startReload(a, now) {
  const w = currentWeapon(a);
  if (!w || !a.alive || a.channel) return false;
  const def = weaponDef(w.key);
  if (w.mag >= def.mag || w.reserve <= 0) return false;
  if (now < a.reloadUntil) return false;
  a.reloadUntil = now + def.reload;
  a.reloadKey = w.key;
  if (a.isPlayer) sfx.reload();
  return true;
}

export function updateWeaponTimers(a, now) {
  if (a.reloadUntil && now >= a.reloadUntil) {
    const w = currentWeapon(a);
    if (w && w.key === a.reloadKey) {
      const def = weaponDef(w.key);
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    a.reloadUntil = 0;
    a.reloadKey = null;
  }
  // Recoil and bloom decay every step, so burst discipline matters.
  a.recoilPitch *= 0.9;
  a.recoilYaw *= 0.9;
  a.bloom = Math.max(0, a.bloom - 0.028 * (1 / 60));
}

export function switchSlot(a, slot, now) {
  if (!a.alive || a.channel) return false;
  if (slot === 'primary' && !a.primary) return false;
  if (slot === 'frag' && a.frags <= 0) return false;
  if (slot === 'smoke' && a.smokes <= 0) return false;
  if (a.slot === slot) return false;
  a.slot = slot;
  a.reloadUntil = 0;
  a.reloadKey = null;
  a.switchUntil = now + 0.28;
  return true;
}
