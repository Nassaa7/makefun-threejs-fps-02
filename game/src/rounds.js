// EMBERLINE — rounds: the match state machine. Buy phase, live round, bomb
// fuse, elimination and timer wins, economy payouts, and the match result.
// Win conditions are checked here and nowhere else.
import { S, pushEvent, aliveAgents } from './state.js';
import {
  BUY_TIME, ROUND_TIME, END_TIME, BOMB_FUSE, PLANT_TIME, DEFUSE_TIME,
  WIN_ROUNDS, MAX_ROUNDS, ECONOMY,
} from './config.js';
import { ATTACKER_SPAWNS, DEFENDER_SPAWNS, SITES } from './mapdata.js';
import { resetAgentForRound } from './agents.js';
import { pointInRect } from './collision.js';
import { assignBotStarts } from './bots.js';
import { explode } from './combat.js';
import { clearEffects } from './effects.js';
import { sfx } from './audio.js';

export function startMatch() {
  S.scores.V = 0;
  S.scores.S = 0;
  S.round = 0;
  S.lossStreak.V = 0;
  S.lossStreak.S = 0;
  S.matchWinner = null;
  for (const a of S.agents) {
    a.money = ECONOMY.start;
    a.kills = 0;
    a.deaths = 0;
    a.survived = false;
  }
  startRound();
}

export function startRound() {
  S.round += 1;
  S.phase = 'buy';
  S.timer = BUY_TIME;
  S.roundWinner = null;
  S.roundReason = '';
  S.grenades.length = 0;
  S.smokes.length = 0;
  S.noises.length = 0;
  S.spectateId = -1;
  clearEffects();
  let vi = 0;
  let si = 0;
  for (const a of S.agents) {
    const keep = a.survived;
    if (a.team === 'V') {
      resetAgentForRound(a, ATTACKER_SPAWNS[vi++ % ATTACKER_SPAWNS.length], 0, S.round, keep);
    } else {
      resetAgentForRound(a, DEFENDER_SPAWNS[si++ % DEFENDER_SPAWNS.length], Math.PI, S.round, keep);
    }
    a.survived = false;
  }
  // The player carries the charge every round; a bot takes it if they fall.
  S.bomb.state = 'carried';
  S.bomb.carrierId = S.player.id;
  S.bomb.site = null;
  S.bomb.plantT = 0;
  S.bomb.fuse = 0;
  S.bomb.defuseT = 0;
  S.bomb.defuserId = -1;
  S.player.hasBomb = true;
  assignBotStarts();
  pushEvent('msg', { text: `Round ${S.round} — buy phase`, tone: 'info' });
  pushEvent('roundStart', { round: S.round });
}

function endRound(winner, reason) {
  if (S.phase === 'ended' || S.phase === 'match') return;
  S.phase = 'ended';
  S.timer = END_TIME;
  S.roundWinner = winner;
  S.roundReason = reason;
  S.scores[winner] += 1;
  const loser = winner === 'V' ? 'S' : 'V';
  S.lossStreak[winner] = 0;
  S.lossStreak[loser] += 1;
  for (const a of S.agents) {
    a.survived = a.alive;
    if (a.team === winner) a.money = Math.min(ECONOMY.max, a.money + ECONOMY.win);
    else a.money = Math.min(ECONOMY.max, a.money + ECONOMY.loss + Math.min(600, (S.lossStreak[loser] - 1) * 200));
    a.channel = null;
  }
  if (winner === 'V') sfx.roundWin();
  else sfx.roundLose();
  pushEvent('roundEnd', { winner, reason });
}

function matchDecided() {
  if (S.scores.V >= WIN_ROUNDS) return 'V';
  if (S.scores.S >= WIN_ROUNDS) return 'S';
  if (S.round >= MAX_ROUNDS) {
    if (S.scores.V > S.scores.S) return 'V';
    if (S.scores.S > S.scores.V) return 'S';
    return 'draw';
  }
  return null;
}

function updateChannels(dt, now) {
  for (const a of S.agents) {
    if (!a.alive || !a.channel) continue;
    const ch = a.channel;
    if (ch.type === 'plant') {
      if (!a.hasBomb || S.bomb.state !== 'carried') { a.channel = null; continue; }
      const site = siteAt(a.pos.x, a.pos.z);
      if (!site) { a.channel = null; continue; }
      ch.t += dt;
      S.bomb.plantT = ch.t / PLANT_TIME;
      if (ch.t >= PLANT_TIME) {
        a.channel = null;
        a.hasBomb = false;
        S.bomb.state = 'planted';
        S.bomb.site = site.key;
        S.bomb.x = a.pos.x;
        S.bomb.z = a.pos.z;
        S.bomb.fuse = BOMB_FUSE;
        S.bomb.beepT = 0;
        a.money = Math.min(ECONOMY.max, a.money + ECONOMY.plant);
        sfx.plant();
        pushEvent('msg', { text: `Charge planted at site ${site.key}!`, tone: 'warn' });
        pushEvent('planted', { site: site.key });
      }
    } else if (ch.type === 'defuse') {
      if (S.bomb.state !== 'planted') { a.channel = null; continue; }
      const d = Math.hypot(S.bomb.x - a.pos.x, S.bomb.z - a.pos.z);
      if (d > 2.6) { a.channel = null; continue; }
      ch.t += dt;
      S.bomb.defuseT = ch.t / DEFUSE_TIME;
      S.bomb.defuserId = a.id;
      if (Math.floor(ch.t * 2) !== Math.floor((ch.t - dt) * 2)) sfx.defuseTick();
      if (ch.t >= DEFUSE_TIME) {
        a.channel = null;
        S.bomb.state = 'defused';
        a.money = Math.min(ECONOMY.max, a.money + ECONOMY.defuse);
        endRound('S', 'Charge defused');
      }
    }
  }
  // A broken channel leaves no stale progress behind.
  let planting = false;
  let defusing = false;
  for (const a of S.agents) {
    if (a.channel && a.channel.type === 'plant') planting = true;
    if (a.channel && a.channel.type === 'defuse') defusing = true;
  }
  if (!planting) S.bomb.plantT = 0;
  if (!defusing) { S.bomb.defuseT = 0; S.bomb.defuserId = -1; }
}

function siteAt(x, z) {
  if (pointInRect(x, z, SITES.A)) return SITES.A;
  if (pointInRect(x, z, SITES.B)) return SITES.B;
  return null;
}

export function updateRounds(dt, boxes, now) {
  if (S.phase === 'buy') {
    S.timer -= dt;
    if (S.timer <= 0) {
      S.phase = 'live';
      S.timer = ROUND_TIME;
      S.buyOpen = false;
      pushEvent('msg', { text: 'Round live — plant the charge or eliminate the Sentinels', tone: 'info' });
      pushEvent('live', {});
    }
    return;
  }
  if (S.phase === 'live') {
    updateChannels(dt, now);
    if (S.phase !== 'live') return; // a defuse may have ended the round
    if (S.bomb.state === 'planted') {
      S.bomb.fuse -= dt;
      S.bomb.beepT -= dt;
      if (S.bomb.beepT <= 0) {
        const frac = S.bomb.fuse / BOMB_FUSE;
        S.bomb.beepT = 0.25 + frac * 0.75;
        sfx.beep(frac < 0.3);
      }
      if (S.bomb.fuse <= 0) {
        S.bomb.state = 'exploded';
        explode(S.bomb.x, 0.5, S.bomb.z, 13, 240, null, boxes, now);
        endRound('V', 'Charge detonated');
        return;
      }
    } else {
      S.timer -= dt;
      if (S.timer <= 0) {
        endRound('S', 'Time expired — charge never planted');
        return;
      }
    }
    const vAlive = aliveAgents('V').length;
    const sAlive = aliveAgents('S').length;
    if (sAlive === 0) {
      endRound('V', 'Sentinel team eliminated');
      return;
    }
    if (vAlive === 0 && S.bomb.state !== 'planted') {
      endRound('S', 'Vanguard team eliminated');
      return;
    }
    return;
  }
  if (S.phase === 'ended') {
    S.timer -= dt;
    if (S.timer <= 0) {
      const winner = matchDecided();
      if (winner) {
        S.phase = 'match';
        S.matchWinner = winner;
        pushEvent('matchEnd', { winner });
      } else {
        startRound();
      }
    }
  }
}
