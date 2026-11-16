// EMBERLINE — sim: the fixed-step simulation, kept apart from rendering.
// main.js calls step() at 60 Hz; this module moves the player and bots,
// resolves shooting and channels, and advances grenades and rounds. No DOM,
// no three.js, no per-frame allocation beyond small scratch values.
import { S, pushEvent, aliveAgents } from './state.js';
import {
  GRAVITY, AGENT_RADIUS, WALK_SPEED, RUN_SPEED, CROUCH_SPEED,
  JUMP_SPEED, ACCEL_GROUND, ACCEL_AIR, WEAPONS, PRICES, newWeapon, weaponDef,
} from './config.js';
import { collideCircle, pointInRect, clamp } from './collision.js';
import { SITES } from './mapdata.js';
import { currentWeapon, eyeHeight } from './agents.js';
import { spreadFor, tryFire, startReload, updateWeaponTimers, switchSlot } from './weapons.js';
import { fireHitscan, throwGrenade, updateGrenades, addNoise } from './combat.js';
import { updateBot } from './bots.js';
import { updateRounds } from './rounds.js';
import { removeSmokeMesh } from './effects.js';
import { sfx, setListener } from './audio.js';

const prevKeys = new Set();

function pressed(input, code) {
  return input.down(code) && !prevKeys.has(code);
}

function moveAgent(a, dt, boxes) {
  const accel = a.onGround ? ACCEL_GROUND : ACCEL_AIR;
  // Accelerate toward the wish velocity without ever overshooting it.
  const tx = a.wishX !== undefined ? a.wishX : 0;
  const tz = a.wishZ !== undefined ? a.wishZ : 0;
  const dvx = tx - a.vel.x;
  const dvz = tz - a.vel.z;
  const dl = Math.hypot(dvx, dvz);
  const maxD = accel * dt;
  if (dl > 0.001) {
    const s = Math.min(1, maxD / dl);
    a.vel.x += dvx * s;
    a.vel.z += dvz * s;
  }
  a.vel.y -= GRAVITY * dt;
  a.pos.x += a.vel.x * dt;
  a.pos.y += a.vel.y * dt;
  a.pos.z += a.vel.z * dt;
  if (a.pos.y <= 0) {
    a.pos.y = 0;
    a.vel.y = 0;
    a.onGround = true;
  } else {
    a.onGround = false;
  }
  const p2 = { x: a.pos.x, z: a.pos.z };
  collideCircle(p2, AGENT_RADIUS, boxes);
  a.pos.x = p2.x;
  a.pos.z = p2.z;
}

function separateAgents() {
  const list = S.agents;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = AGENT_RADIUS * 2;
      if (d2 > 0.0001 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2 / d;
        a.pos.x -= dx * push;
        a.pos.z -= dz * push;
        b.pos.x += dx * push;
        b.pos.z += dz * push;
      }
    }
  }
}

function updatePlayer(input, dt, boxes, now) {
  const p = S.player;
  if (!p.alive) {
    S.aiming = false;
    S.spreadNow = 0.01;
    S.promptText = '';
    return;
  }
  // Mouse look.
  const m = input.takeMouse();
  const sens = 0.0022 * (S.aiming ? 0.7 : 1);
  p.yaw -= m.dx * sens;
  p.pitch = clamp(p.pitch - m.dy * sens, -1.45, 1.45);
  // Movement wish from keys, relative to facing.
  const fwd = input.down('KeyW') ? 1 : input.down('KeyS') ? -1 : 0;
  const str = input.down('KeyD') ? 1 : input.down('KeyA') ? -1 : 0;
  p.crouch = input.down('ControlLeft') || input.down('KeyC');
  const walking = input.down('ShiftLeft');
  let speed = p.crouch ? CROUCH_SPEED : walking ? WALK_SPEED : RUN_SPEED;
  const w = currentWeapon(p);
  S.aiming = input.aimHeld && !!w;
  if (S.aiming) speed *= w.key === 'dmr' ? 0.45 : 0.6;
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  let wx = -sy * fwd + cy * str;
  let wz = -cy * fwd - sy * str;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) {
    wx = (wx / wl) * speed;
    wz = (wz / wl) * speed;
  }
  p.wishX = wx;
  p.wishZ = wz;
  if (input.down('Space') && p.onGround) {
    p.vel.y = JUMP_SPEED;
    p.onGround = false;
  }
  updateWeaponTimers(p, now);

  // Weapon slots.
  if (pressed(input, 'Digit1')) switchSlot(p, 'primary', now);
  if (pressed(input, 'Digit2')) switchSlot(p, 'secondary', now);
  if (pressed(input, 'Digit4')) switchSlot(p, 'frag', now);
  if (pressed(input, 'Digit5')) switchSlot(p, 'smoke', now);
  if (pressed(input, 'KeyR')) startReload(p, now);
  if (pressed(input, 'KeyQ')) {
    switchSlot(p, p.slot === 'primary' ? 'secondary' : 'primary', now);
  }

  // Plant channel: hold E, stand still, stay in the site.
  const eHeld = input.down('KeyE');
  if (eHeld && !p.channel && S.phase === 'live' && p.hasBomb && siteAt(p.pos.x, p.pos.z)) {
    p.channel = { type: 'plant', t: 0 };
  }
  if (p.channel) {
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.6;
    if (!eHeld || moving || !siteAt(p.pos.x, p.pos.z)) p.channel = null;
  }

  // Fire / throw.
  const edge = input.takeAttackEdge();
  if (p.slot === 'frag' || p.slot === 'smoke') {
    if (edge && !p.channel) {
      const kind = p.slot;
      if (throwGrenade(p, kind, now)) {
        p.slot = p.primary ? 'primary' : 'secondary';
        p.switchUntil = now + 0.3;
      }
    }
  } else if (w) {
    const def = weaponDef(w.key);
    const trigger = def.auto ? input.attackHeld : edge;
    if (trigger && p.channel) p.channel = null;
    const res = tryFire(p, now, trigger);
    if (res === 'shot') {
      S.shotFlashT = now;
      const speedNow = Math.hypot(p.vel.x, p.vel.z);
      const spread = spreadFor(p, def, speedNow, S.aiming, !p.onGround);
      fireHitscan(p, spread, boxes, now);
    }
  }
  if (w) {
    const def = weaponDef(w.key);
    S.spreadNow = spreadFor(p, def, Math.hypot(p.vel.x, p.vel.z), S.aiming, !p.onGround);
  } else {
    S.spreadNow = 0.012;
  }

  // Footsteps: running is loud, walking and crouching are quiet.
  const spd = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && spd > 0.5) {
    p.stepAcc += spd * dt;
    if (p.stepAcc > 2.3) {
      p.stepAcc = 0;
      const loud = !walking && !p.crouch;
      sfx.step(p.pos.x, p.pos.z, loud);
      if (loud) addNoise(p.pos.x, p.pos.z, 6);
    }
  }

  // Pick up a dropped charge by walking over it.
  if (S.bomb.state === 'dropped' && S.phase === 'live') {
    const d = Math.hypot(S.bomb.x - p.pos.x, S.bomb.z - p.pos.z);
    if (d < 0.9) {
      S.bomb.state = 'carried';
      S.bomb.carrierId = p.id;
      p.hasBomb = true;
      pushEvent('msg', { text: 'You picked up the charge — plant it at A or B', tone: 'info' });
    }
  }

  // Context prompt.
  if (p.channel) S.promptText = '';
  else if (S.phase === 'buy') S.promptText = 'Press B for the buy menu';
  else if (p.hasBomb && S.phase === 'live' && siteAt(p.pos.x, p.pos.z)) S.promptText = 'Hold E to plant the charge';
  else if (S.bomb.state === 'dropped' && S.phase === 'live') S.promptText = 'The charge is dropped — recover it';
  else S.promptText = '';
}

function siteAt(x, z) {
  if (pointInRect(x, z, SITES.A)) return SITES.A;
  if (pointInRect(x, z, SITES.B)) return SITES.B;
  return null;
}

export function step(input, boxes, dt) {
  const now = S.time + dt;
  S.time = now;
  S.shake = Math.max(0, S.shake - dt * 2.2);
  S.hitmark = Math.max(0, S.hitmark - dt);
  S.damageFlash = Math.max(0, S.damageFlash - dt * 1.8);
  // Prune old noises and expired smoke.
  while (S.noises.length > 0 && now - S.noises[0].t > 2) S.noises.shift();
  for (let i = S.smokes.length - 1; i >= 0; i--) {
    if (S.smokes[i].until <= now) {
      removeSmokeMesh(S.smokes[i].id);
      S.smokes.splice(i, 1);
    }
  }
  if (S.phase === 'menu' || S.phase === 'match') {
    prevKeys.clear();
    for (const k of input.keys) prevKeys.add(k);
    return;
  }

  updatePlayer(input, dt, boxes, now);
  for (const a of S.agents) {
    if (a.bot) updateBot(a, dt, boxes, now);
  }
  for (const a of S.agents) {
    if (!a.alive) continue;
    if (a.wishX === undefined) { a.wishX = 0; a.wishZ = 0; }
    moveAgent(a, dt, boxes);
  }
  separateAgents();
  updateGrenades(dt, boxes, now);
  updateRounds(dt, boxes, now);
  if (S.player) setListener(S.player.pos.x, S.player.pos.z);

  prevKeys.clear();
  for (const k of input.keys) prevKeys.add(k);
}

// Buy menu purchase. Only during the buy phase, only for the player.
export function buyItem(key) {
  const p = S.player;
  if (!p || !p.alive || S.phase !== 'buy') {
    sfx.denied();
    return false;
  }
  let price = 0;
  if (WEAPONS[key]) price = WEAPONS[key].price;
  else if (PRICES[key] !== undefined) price = PRICES[key];
  else return false;
  if (key === 'armor' && p.armor >= 100) { sfx.denied(); return false; }
  if (key === 'frag' && p.frags >= 2) { sfx.denied(); return false; }
  if (key === 'smoke' && p.smokes >= 2) { sfx.denied(); return false; }
  if (p.money < price) {
    sfx.denied();
    pushEvent('msg', { text: 'Not enough money', tone: 'bad' });
    return false;
  }
  p.money -= price;
  if (WEAPONS[key]) {
    p.primary = newWeapon(key);
    p.slot = 'primary';
    p.switchUntil = S.time + 0.3;
  } else if (key === 'armor') {
    p.armor = 100;
  } else if (key === 'frag') {
    p.frags += 1;
  } else if (key === 'smoke') {
    p.smokes += 1;
  } else if (key === 'ammo') {
    for (const w of [p.primary, p.secondary]) {
      if (w) w.reserve = weaponDef(w.key).reserve;
    }
  }
  sfx.buy();
  return true;
}
