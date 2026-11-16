// EMBERLINE — agents: the player and the seven bots. One factory builds them,
// one reset prepares them for a round. Hitbox spheres live here so shooting
// and rendering agree on where a body is.
import { BOT_NAMES, ECONOMY, newWeapon } from './config.js';

let nextId = 0;

export function eyeHeight(a) {
  return a.crouch ? 1.12 : 1.62;
}

export function headPos(a, out) {
  out.x = a.pos.x;
  out.y = a.pos.y + (a.crouch ? 1.05 : 1.52);
  out.z = a.pos.z;
  return out;
}

// Body hit spheres: [dy from feet, radius, part]. Crouching lowers them.
export function bodySpheres(a, crouch, out) {
  const c = crouch ? 1 : 0;
  out[0][0] = c ? 1.05 : 1.52; out[0][1] = 0.17; out[0][2] = 1; // head
  out[1][0] = c ? 0.88 : 1.25; out[1][1] = 0.30; out[1][2] = 0; // chest
  out[2][0] = c ? 0.58 : 0.85; out[2][1] = 0.30; out[2][2] = 0; // gut
  out[3][0] = c ? 0.3 : 0.4; out[3][1] = 0.28; out[3][2] = 0; // legs
  return out;
}

function makeBotBrain(role, skill) {
  return {
    role,
    skill,
    state: 'wait',
    path: [],
    pathI: 0,
    destNode: -1,
    holdNode: -1,
    holdYaw: 0,
    targetId: -1,
    lastKnownX: 0,
    lastKnownZ: 0,
    lastKnownT: -99,
    reactT: 0,
    burstLeft: 0,
    nextShotT: 0,
    strafeT: 0,
    strafeDir: 1,
    scanT: 0,
    repathT: 0,
    stuckT: 0,
    lastX: 0,
    lastZ: 0,
    investigateT: 0,
    fleeX: 0,
    fleeZ: 0,
    aimErr: 0,
    thinkT: 0,
  };
}

export function createAgent(team, name, isPlayer, role, skill) {
  const a = {
    id: nextId++,
    name,
    team,
    isPlayer,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    alive: true,
    crouch: false,
    onGround: true,
    primary: null,
    secondary: newWeapon('pistol'),
    slot: 'secondary',
    frags: 0,
    smokes: 0,
    hasBomb: false,
    money: ECONOMY.start,
    kills: 0,
    deaths: 0,
    survived: false,
    recoilPitch: 0,
    recoilYaw: 0,
    bloom: 0,
    lastShotT: -99,
    reloadUntil: 0,
    reloadKey: null,
    switchUntil: 0,
    channel: null,
    stepAcc: 0,
    bot: isPlayer ? null : makeBotBrain(role, skill),
    lastDamageT: -99,
    lastDamageDir: 0,
    seenT: -99,
    deathT: 0,
    mesh: null,
  };
  return a;
}

export function createRoster() {
  nextId = 0;
  const agents = [];
  agents.push(createAgent('V', 'You', true, null, 1));
  const allyRoles = ['pushA', 'pushA', 'pushMid'];
  for (let i = 0; i < 3; i++) {
    agents.push(createAgent('V', BOT_NAMES.V[i], false, allyRoles[i], 0.72 + i * 0.09));
  }
  const foeRoles = ['holdA', 'holdB', 'holdMid', 'flex'];
  for (let i = 0; i < 4; i++) {
    agents.push(createAgent('S', BOT_NAMES.S[i], false, foeRoles[i], 0.7 + i * 0.08));
  }
  return agents;
}

export function currentWeapon(a) {
  if (a.slot === 'primary') return a.primary;
  if (a.slot === 'secondary') return a.secondary;
  return null;
}

export function resetAgentForRound(a, spawn, facingYaw, round, keepLoadout) {
  a.pos.x = spawn.x;
  a.pos.y = 0;
  a.pos.z = spawn.z;
  a.vel.x = 0;
  a.vel.y = 0;
  a.vel.z = 0;
  a.yaw = facingYaw;
  a.pitch = 0;
  a.hp = 100;
  a.alive = true;
  a.crouch = false;
  a.onGround = true;
  a.recoilPitch = 0;
  a.recoilYaw = 0;
  a.bloom = 0;
  a.lastShotT = -99;
  a.reloadUntil = 0;
  a.reloadKey = null;
  a.switchUntil = 0;
  a.channel = null;
  a.hasBomb = false;
  a.seenT = -99;
  if (!keepLoadout) {
    a.primary = null;
    a.secondary = newWeapon('pistol');
    a.slot = 'secondary';
    a.frags = 0;
    a.smokes = 0;
    a.armor = 0;
    if (!a.isPlayer) giveBotLoadout(a, round);
  }
  if (a.bot) {
    const b = a.bot;
    b.state = 'wait';
    b.path.length = 0;
    b.pathI = 0;
    b.destNode = -1;
    b.targetId = -1;
    b.lastKnownT = -99;
    b.reactT = 0;
    b.burstLeft = 0;
    b.nextShotT = 0;
    b.strafeT = 0;
    b.investigateT = 0;
    b.thinkT = Math.random() * 0.15;
    b.holdNode = -1;
  }
}

// Bots "buy" by round: pistols on round 1, rifles from round 2, armor later.
function giveBotLoadout(a, round) {
  if (round === 1) {
    if (a.id % 2 === 0) a.primary = newWeapon('smg');
    a.slot = a.primary ? 'primary' : 'secondary';
    return;
  }
  const pick = a.id % 4 === 3 ? 'smg' : 'rifle';
  a.primary = newWeapon(pick);
  a.slot = 'primary';
  if (round >= 3) a.armor = 100;
}
