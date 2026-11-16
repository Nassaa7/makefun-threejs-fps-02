// EMBERLINE — bots: perception, routes, holds and reactions. Bots think on a
// stagger (every 0.12 s), steer along the waypoint graph with BFS paths, hold
// angles, investigate noise, flee grenades, plant the charge and defuse it.
// They shoot through the same tryFire/fireHitscan path as the player.
import { S, agentById, aliveAgents } from './state.js';
import { WAYPOINTS, findPath, nearestWaypoint, SITES } from './mapdata.js';
import { segmentBlocked, pointInRect, angleDiff, clamp } from './collision.js';
import { eyeHeight, currentWeapon } from './agents.js';
import { spreadFor, tryFire, startReload, updateWeaponTimers } from './weapons.js';
import { fireHitscan } from './combat.js';
import { weaponDef } from './config.js';

const HOLD_SPOTS = {
  holdA: { node: 7, lookX: -18.5, lookZ: -8.5 },
  holdB: { node: 15, lookX: 18.5, lookZ: -8.5 },
  holdMid: { node: 23, lookX: 0, lookZ: -3 },
  flex: { node: 24, lookX: 0, lookZ: -8 },
};

export function yawTo(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

export function assignBotStarts() {
  for (const a of S.agents) {
    if (!a.bot) continue;
    const b = a.bot;
    if (a.team === 'S') {
      const spot = HOLD_SPOTS[b.role] || HOLD_SPOTS.flex;
      b.holdNode = spot.node;
      b.holdYaw = yawTo(WAYPOINTS[spot.node][0], WAYPOINTS[spot.node][1], spot.lookX, spot.lookZ);
      b.destNode = spot.node;
      b.state = 'move';
      planPath(a);
    } else {
      b.destNode = b.role === 'pushMid' ? 23 : 6;
      b.state = 'wait';
      b.path.length = 0;
      b.pathI = 0;
    }
  }
}

function planPath(a) {
  const b = a.bot;
  const from = nearestWaypoint(a.pos.x, a.pos.z);
  b.path = findPath(from, b.destNode);
  b.pathI = 0;
  b.stuckT = 0;
  b.lastX = a.pos.x;
  b.lastZ = a.pos.z;
}

function canSee(a, t, boxes) {
  const dx = t.pos.x - a.pos.x;
  const dz = t.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 40) return 0;
  const want = yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z);
  if (dist > 5 && Math.abs(angleDiff(a.yaw, want)) > 1.05) return 0;
  const blocked = segmentBlocked(
    a.pos.x, a.pos.y + eyeHeight(a), a.pos.z,
    t.pos.x, t.pos.y + 1.25, t.pos.z, boxes, S.smokes,
  );
  if (blocked) return 0;
  return dist;
}

function nearestVisibleEnemy(a, boxes) {
  let best = null;
  let bestD = Infinity;
  for (const t of S.agents) {
    if (!t.alive || t.team === a.team) continue;
    const d = canSee(a, t, boxes);
    if (d > 0 && d < bestD) { bestD = d; best = t; }
  }
  return best ? { target: best, dist: bestD } : null;
}

function setDest(a, node) {
  const b = a.bot;
  if (b.destNode === node && b.path.length > 0) return;
  b.destNode = node;
  planPath(a);
}

function steerTo(a, tx, tz, speed) {
  const dx = tx - a.pos.x;
  const dz = tz - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) { a.wishX = 0; a.wishZ = 0; return d; }
  a.wishX = (dx / d) * speed;
  a.wishZ = (dz / d) * speed;
  return d;
}

function faceToward(a, targetYaw, dt, rate) {
  const diff = angleDiff(a.yaw, targetYaw);
  const maxTurn = rate * dt;
  a.yaw += clamp(diff, -maxTurn, maxTurn);
  return Math.abs(diff);
}

export function updateBot(a, dt, boxes, now) {
  const b = a.bot;
  a.wishX = 0;
  a.wishZ = 0;
  a.wantCrouch = false;
  if (!a.alive) return;
  updateWeaponTimers(a, now);

  // Staggered perception: see, hear, and notice grenades.
  b.thinkT -= dt;
  const thinking = b.thinkT <= 0;
  if (thinking) {
    b.thinkT = 0.12 + Math.random() * 0.04;
    const seen = nearestVisibleEnemy(a, boxes);
    if (seen) {
      if (b.targetId !== seen.target.id) {
        b.reactT = now + 0.26 + (1 - b.skill) * 0.38 + seen.dist * 0.004;
        b.aimErr = 0.05 + (1 - b.skill) * 0.05;
      }
      b.targetId = seen.target.id;
      b.lastKnownX = seen.target.pos.x;
      b.lastKnownZ = seen.target.pos.z;
      b.lastKnownT = now;
      seen.target.seenT = now;
      if (b.state !== 'engage') b.state = 'engage';
    } else if (b.targetId !== -1 && now - b.lastKnownT > 1.2) {
      b.targetId = -1;
      if (b.state === 'engage') b.state = 'move';
    }
    // Hearing: a recent loud noise nearby becomes a place to check.
    if (b.targetId === -1 && b.state !== 'plant' && b.state !== 'defuse') {
      for (const n of S.noises) {
        if (now - n.t > 0.9) continue;
        const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
        if (d < n.radius && d > 3) {
          b.lastKnownX = n.x;
          b.lastKnownZ = n.z;
          b.lastKnownT = now;
          if (b.state === 'hold' || b.state === 'move') {
            b.state = 'investigate';
            b.investigateT = now + 3.5;
            setDest(a, nearestWaypoint(n.x, n.z));
          }
          break;
        }
      }
    }
  }

  // Flee a live frag grenade: it outranks everything but a channel.
  let fleeing = false;
  for (const g of S.grenades) {
    if (g.kind !== 'frag') continue;
    const d = Math.hypot(g.x - a.pos.x, g.z - a.pos.z);
    if (d < 6.5) {
      fleeing = true;
      const away = yawTo(g.x, g.z, a.pos.x, a.pos.z);
      a.wishX = -Math.sin(away) * 5.2;
      a.wishZ = -Math.cos(away) * 5.2;
      break;
    }
  }

  // Objective logic outranks roaming.
  const bomb = S.bomb;
  if (!fleeing && a.team === 'V' && bomb.state === 'dropped' && !a.hasBomb) {
    // Nearest living Vanguard bot goes for the dropped charge.
    let nearest = null;
    let nd = Infinity;
    for (const m of aliveAgents('V')) {
      if (m.isPlayer || m.hasBomb) continue;
      const d = Math.hypot(bomb.x - m.pos.x, bomb.z - m.pos.z);
      if (d < nd) { nd = d; nearest = m; }
    }
    if (nearest === a && nd > 0.9) {
      if (nd < 7 && b.targetId === -1) {
        // Close enough to walk straight to the charge, past the last waypoint.
        steerTo(a, bomb.x, bomb.z, 4.6);
        faceToward(a, yawTo(a.pos.x, a.pos.z, bomb.x, bomb.z), dt, 5);
        return;
      }
      setDest(a, nearestWaypoint(bomb.x, bomb.z));
      b.state = 'move';
    }
  }
  if (!fleeing && a.team === 'V' && a.hasBomb && S.phase === 'live') {
    const site = nearestSite(a.pos.x, a.pos.z);
    if (pointInRect(a.pos.x, a.pos.z, site)) {
      const seen = b.targetId !== -1;
      if (!seen && !a.channel) {
        a.channel = { type: 'plant', t: 0 };
        b.state = 'plant';
      }
    } else if (b.state !== 'engage') {
      setDest(a, site.key === 'A' ? 6 : 14);
      b.state = 'move';
    }
  }
  if (!fleeing && a.team === 'S' && bomb.state === 'planted' && S.phase === 'live') {
    const dBomb = Math.hypot(bomb.x - a.pos.x, bomb.z - a.pos.z);
    if (dBomb < 2.4 && b.targetId === -1) {
      if (!a.channel) {
        a.channel = { type: 'defuse', t: 0 };
        b.state = 'defuse';
      }
    } else if (dBomb < 7 && b.targetId === -1) {
      // Close enough to walk straight to the charge, past the last waypoint.
      steerTo(a, bomb.x, bomb.z, 4.6);
      faceToward(a, yawTo(a.pos.x, a.pos.z, bomb.x, bomb.z), dt, 5);
      b.state = 'rotate';
      return;
    } else if (b.state !== 'engage' && b.state !== 'defuse') {
      setDest(a, nearestWaypoint(bomb.x, bomb.z));
      b.state = 'rotate';
    }
  }

  // Channeling: stand still, face the objective.
  if (a.channel) {
    a.wishX = 0;
    a.wishZ = 0;
    if (a.channel.type === 'defuse') faceToward(a, yawTo(a.pos.x, a.pos.z, bomb.x, bomb.z), dt, 4);
    return;
  }
  if (fleeing) return;

  // Engage: aim, stop at range, strafe up close, fire in bursts.
  if (b.state === 'engage' && b.targetId !== -1) {
    const t = agentById(b.targetId);
    if (t && t.alive) {
      const dx = t.pos.x - a.pos.x;
      const dz = t.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantYaw = yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z);
      const wantPitch = Math.atan2((t.pos.y + 1.2) - (a.pos.y + eyeHeight(a)), dist);
      b.aimErr = Math.max(0.008, b.aimErr - dt * 0.03);
      const errYaw = (Math.random() - 0.5) * b.aimErr * 2;
      const errPitch = (Math.random() - 0.5) * b.aimErr;
      const off = faceToward(a, wantYaw + errYaw, dt, 3.2 + b.skill * 1.6);
      a.pitch += clamp(wantPitch + errPitch - a.pitch, -2.4 * dt, 2.4 * dt);
      // Stop to shoot at range; strafe when close.
      if (dist > 11) {
        a.wishX = 0;
        a.wishZ = 0;
      } else {
        b.strafeT -= dt;
        if (b.strafeT <= 0) {
          b.strafeT = 0.6 + Math.random() * 0.7;
          b.strafeDir *= -1;
        }
        const px = -Math.cos(wantYaw) * b.strafeDir;
        const pz = Math.sin(wantYaw) * b.strafeDir;
        a.wishX = px * 3.4;
        a.wishZ = pz * 3.4;
      }
      if (now >= b.reactT && off < 0.09) {
        const w = currentWeapon(a);
        if (w && w.mag === 0) startReload(a, now);
        else if (w) {
          if (b.burstLeft <= 0) {
            if (now >= b.nextShotT) b.burstLeft = 2 + ((Math.random() * 3) | 0);
          }
          if (b.burstLeft > 0) {
            const def = weaponDef(w.key);
            const res = tryFire(a, now, true);
            if (res === 'shot') {
              b.burstLeft -= 1;
              const speed = Math.hypot(a.vel.x, a.vel.z);
              const spread = spreadFor(a, def, speed, false, !a.onGround) + (1 - b.skill) * 0.014;
              fireHitscan(a, spread, boxes, now);
              if (b.burstLeft === 0) b.nextShotT = now + 0.3 + Math.random() * 0.35;
            }
          }
        }
      }
      return;
    }
    b.targetId = -1;
  }

  // Attackers hold at spawn until the round goes live.
  if (a.team === 'V' && S.phase === 'buy') {
    b.state = 'wait';
    return;
  }
  if (b.state === 'wait' && S.phase === 'live') {
    b.state = 'move';
    planPath(a);
  }

  // Investigate: reach the noise, scan, then resume the job.
  if (b.state === 'investigate' && now > b.investigateT) {
    if (a.team === 'S') {
      setDest(a, b.holdNode);
      b.state = 'move';
    } else {
      b.state = 'move';
      planPath(a);
    }
  }

  // Follow the path; arrive and hold, or push through the site.
  if (b.state === 'move' || b.state === 'rotate' || b.state === 'investigate') {
    if (b.pathI >= b.path.length) {
      if (a.team === 'S' && (b.state === 'move' || b.state === 'investigate') && bomb.state !== 'planted') {
        b.state = 'hold';
      } else if (a.team === 'V' && S.phase === 'live' && !a.hasBomb && bomb.state !== 'planted') {
        // Reached the site area without the bomb: hold the angle taken.
        b.state = 'hold';
        b.holdYaw = a.yaw;
      } else {
        b.state = 'hold';
        b.holdYaw = a.yaw;
      }
    } else {
      const node = WAYPOINTS[b.path[b.pathI]];
      const d = steerTo(a, node[0], node[1], 4.6);
      faceToward(a, yawTo(a.pos.x, a.pos.z, node[0], node[1]), dt, 5);
      a.pitch += clamp(0 - a.pitch, -2 * dt, 2 * dt);
      if (d < 0.9) b.pathI += 1;
      // Stuck: replan once, then sidestep.
      b.stuckT += dt;
      if (b.stuckT > 1.2) {
        const moved = Math.hypot(a.pos.x - b.lastX, a.pos.z - b.lastZ);
        b.lastX = a.pos.x;
        b.lastZ = a.pos.z;
        b.stuckT = 0;
        if (moved < 0.35) {
          if (b.path.length > 0) planPath(a);
          else {
            a.wishX += -Math.cos(a.yaw) * 3;
            a.wishZ += Math.sin(a.yaw) * 3;
          }
        }
      }
    }
    return;
  }

  // Hold: face the assigned angle with a slow scan, crouch when settled.
  if (b.state === 'hold') {
    const scan = Math.sin(now * 0.45 + a.id * 1.7) * 0.45;
    faceToward(a, b.holdYaw + scan, dt, 1.6);
    a.pitch += clamp(0 - a.pitch, -1.5 * dt, 1.5 * dt);
    a.wantCrouch = now - b.lastKnownT > 4 && a.team === 'S';
  }
}

function nearestSite(x, z) {
  const da = Math.hypot(SITES.A.plantX - x, SITES.A.plantZ - z);
  const db = Math.hypot(SITES.B.plantX - x, SITES.B.plantZ - z);
  return da <= db ? SITES.A : SITES.B;
}
