// EMBERLINE — main: boot, the fixed-step loop, and the pointer-lock flow.
// The simulation steps at a fixed 60 Hz in an accumulator while rendering
// runs every animation frame; the two never share a timestep.
import { S, resetStore, freshBomb } from './state.js';
import { SIM_DT } from './config.js';
import { buildColliders, ATTACKER_SPAWNS, DEFENDER_SPAWNS } from './mapdata.js';
import { createRoster, resetAgentForRound } from './agents.js';
import { Input } from './input.js';
import { initAudio } from './audio.js';
import { initRender, renderFrame } from './render.js';
import { initHud, updateHud, showOverlay, setBuyMenu } from './hud.js';
import { step, buyItem } from './sim.js';
import { startMatch } from './rounds.js';

const boxes = buildColliders();
const input = new Input();

resetStore();
S.agents = createRoster();
S.player = S.agents[0];
S.bomb = freshBomb();
// Menu backdrop: everyone staged at their spawns before the match begins.
{
  let vi = 0;
  let si = 0;
  for (const a of S.agents) {
    if (a.team === 'V') resetAgentForRound(a, ATTACKER_SPAWNS[vi++ % ATTACKER_SPAWNS.length], 0, 1, false);
    else resetAgentForRound(a, DEFENDER_SPAWNS[si++ % DEFENDER_SPAWNS.length], Math.PI, 1, false);
  }
  S.phase = 'menu';
  S.round = 0;
}

initRender(document.getElementById('game'));
initHud({
  onStart: () => {
    initAudio();
    S.started = true;
    startMatch();
    showOverlay('game');
    input.requestLock();
  },
  onResume: () => {
    input.requestLock();
  },
  onRestart: () => {
    initAudio();
    startMatch();
    showOverlay('game');
    input.requestLock();
  },
  onBuy: (key) => buyItem(key),
  onBuyClose: () => closeBuy(),
});

function openBuy() {
  if (S.phase !== 'buy') {
    return;
  }
  S.buyOpen = true;
  setBuyMenu(true);
  input.releaseLock();
}

function closeBuy() {
  S.buyOpen = false;
  setBuyMenu(false);
  if (S.started && S.phase !== 'match') input.requestLock();
}

input.onBuyKey = () => {
  if (!S.started || S.phase === 'match') return;
  if (S.buyOpen) closeBuy();
  else openBuy();
};

input.onLockChange = (locked) => {
  if (!S.started) return;
  if (S.phase === 'match') {
    S.paused = false;
    return;
  }
  if (!locked && !S.buyOpen) {
    S.paused = true;
    showOverlay('pause');
  } else if (locked) {
    S.paused = false;
    showOverlay('game');
  }
};

input.attach();
showOverlay('start');

let last = performance.now() / 1000;
let acc = 0;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;
  let dt = now - last;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (S.phase === 'menu') {
    // Slow cinematic pan behind the title screen.
    S.player.yaw += dt * 0.045;
  }
  if (!S.paused) {
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n < 4) {
      step(input, boxes, SIM_DT);
      acc -= SIM_DT;
      n += 1;
    }
    if (n === 4) acc = 0;
  }
  renderFrame(dt, S.time);
  updateHud(dt);
}

requestAnimationFrame(frame);
