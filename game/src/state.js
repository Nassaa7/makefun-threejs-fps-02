// EMBERLINE — the single state store. Every module reads and writes this one
// object; there is no other mutable game state. Rendering reads it, the fixed
// step simulation writes it, and the HUD drains its event queue.
export const S = {
  time: 0,
  phase: 'menu', // menu | buy | live | ended | match
  round: 0,
  scores: { V: 0, S: 0 },
  timer: 0,
  roundWinner: null,
  roundReason: '',
  matchWinner: null,
  agents: [],
  player: null,
  grenades: [],
  smokes: [],
  noises: [],
  bomb: null,
  events: [],
  killfeed: [],
  paused: false,
  buyOpen: false,
  started: false,
  shake: 0,
  hitmark: 0,
  hitmarkHead: false,
  damageFlash: 0,
  damageDir: 0,
  spectateId: -1,
  lossStreak: { V: 0, S: 0 },
};

export function pushEvent(type, data) {
  S.events.push({ type, ...data });
}

export function freshBomb() {
  return {
    state: 'carried', // carried | dropped | planted | exploded | defused
    carrierId: -1,
    x: 0, z: 0,
    site: null,
    plantT: 0,
    fuse: 0,
    defuseT: 0,
    defuserId: -1,
    beepT: 0,
  };
}

export function resetStore() {
  S.time = 0;
  S.phase = 'menu';
  S.round = 0;
  S.scores.V = 0;
  S.scores.S = 0;
  S.timer = 0;
  S.roundWinner = null;
  S.roundReason = '';
  S.matchWinner = null;
  S.agents.length = 0;
  S.player = null;
  S.grenades.length = 0;
  S.smokes.length = 0;
  S.noises.length = 0;
  S.bomb = freshBomb();
  S.events.length = 0;
  S.killfeed.length = 0;
  S.paused = false;
  S.buyOpen = false;
  S.started = false;
  S.shake = 0;
  S.hitmark = 0;
  S.damageFlash = 0;
  S.spectateId = -1;
  S.lossStreak.V = 0;
  S.lossStreak.S = 0;
}

export function aliveAgents(team) {
  const out = [];
  for (const a of S.agents) if (a.alive && (!team || a.team === team)) out.push(a);
  return out;
}

export function agentById(id) {
  for (const a of S.agents) if (a.id === id) return a;
  return null;
}
