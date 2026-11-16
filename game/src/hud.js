// EMBERLINE — HUD: every DOM element the player reads. It pulls from the
// state store each frame, drains the event queue, and owns the buy menu, the
// killfeed, the minimap and the overlays. It never writes simulation state.
import { S } from './state.js';
import { WEAPONS, PRICES, TEAM_NAME, TEAM_CSS } from './config.js';
import { WALLS, PROPS, SITES } from './mapdata.js';
import { currentWeapon } from './agents.js';

const $ = (id) => document.getElementById(id);
const els = {};
const cache = {};
let callbacks = {};
let msgT = 0;
let bannerT = 0;
let mapStatic = null;
let mapT = 0;
let scoreOpen = false;

function setText(key, el, text) {
  if (cache[key] !== text) {
    cache[key] = text;
    el.textContent = text;
  }
}

const BUY_ITEMS = [
  { key: 'rifle', label: 'KR-7 Carbine', desc: 'Accurate automatic rifle', price: WEAPONS.rifle.price },
  { key: 'smg', label: 'Kestrel-9 SMG', desc: 'Fast, mobile, close range', price: WEAPONS.smg.price },
  { key: 'shotgun', label: 'Breacher-12', desc: 'Devastating up close', price: WEAPONS.shotgun.price },
  { key: 'dmr', label: 'Longbow DMR', desc: 'Scoped precision, slow fire', price: WEAPONS.dmr.price },
  { key: 'armor', label: 'Kevlar Vest', desc: 'Reduces damage taken', price: PRICES.armor },
  { key: 'frag', label: 'Frag Grenade', desc: 'Timed explosive — key 4', price: PRICES.frag },
  { key: 'smoke', label: 'Smoke Grenade', desc: 'Blocks sight — key 5', price: PRICES.smoke },
  { key: 'ammo', label: 'Refill Ammo', desc: 'Top up reserves', price: PRICES.ammo },
];

export function initHud(cb) {
  callbacks = cb;
  for (const id of ['crosshair', 'hitmarker', 'health-num', 'health-fill', 'armor-num', 'ammo-mag',
    'ammo-reserve', 'weapon-name', 'nade-frag', 'nade-smoke', 'money', 'timer', 'score-v', 'score-s',
    'alive-v', 'alive-s', 'killfeed', 'bomb-chip', 'bomb-text', 'prompt', 'center-msg', 'banner',
    'banner-sub', 'vignette', 'dir-hit', 'minimap', 'buy-menu', 'buy-items', 'buy-money',
    'start-overlay', 'pause-overlay', 'match-overlay', 'match-title', 'match-sub', 'scoreboard',
    'score-rows', 'scope', 'channel-wrap', 'channel-fill', 'channel-label', 'round-label']) {
    els[id] = $(id);
  }
  // Buy menu buttons.
  for (const item of BUY_ITEMS) {
    const b = document.createElement('button');
    b.className = 'buy-item';
    b.innerHTML = `<span class="buy-name">${item.label}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    b.addEventListener('click', () => callbacks.onBuy && callbacks.onBuy(item.key));
    b.dataset.key = item.key;
    els['buy-items'].appendChild(b);
  }
  $('start-btn').addEventListener('click', () => callbacks.onStart && callbacks.onStart());
  $('resume-btn').addEventListener('click', () => callbacks.onResume && callbacks.onResume());
  $('restart-btn').addEventListener('click', () => callbacks.onRestart && callbacks.onRestart());
  $('buy-close').addEventListener('click', () => callbacks.onBuyClose && callbacks.onBuyClose());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') scoreOpen = true;
    if (S.buyOpen && e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= BUY_ITEMS.length) callbacks.onBuy && callbacks.onBuy(BUY_ITEMS[n - 1].key);
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Tab') scoreOpen = false; });
  buildMapStatic();
}

function buildMapStatic() {
  mapStatic = document.createElement('canvas');
  mapStatic.width = 180;
  mapStatic.height = 180;
  const g = mapStatic.getContext('2d');
  g.fillStyle = '#20262e';
  g.fillRect(0, 0, 180, 180);
  const sx = 180 / 62;
  const oy = (180 - 46 * sx) / 2;
  const X = (x) => (x + 31) * sx;
  const Z = (z) => (z + 23) * sx + oy;
  g.fillStyle = 'rgba(242,163,60,0.14)';
  g.fillRect(X(SITES.A.x0), Z(SITES.A.z0), (SITES.A.x1 - SITES.A.x0) * sx, (SITES.A.z1 - SITES.A.z0) * sx);
  g.fillStyle = 'rgba(62,198,184,0.14)';
  g.fillRect(X(SITES.B.x0), Z(SITES.B.z0), (SITES.B.x1 - SITES.B.x0) * sx, (SITES.B.z1 - SITES.B.z0) * sx);
  g.fillStyle = '#8a847c';
  for (const w of WALLS) g.fillRect(X(w[0]), Z(w[1]), (w[2] - w[0]) * sx, (w[3] - w[1]) * sx);
  g.fillStyle = '#5a564e';
  for (const p of PROPS) g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * sx, (p.z1 - p.z0) * sx);
  g.fillStyle = '#e9e6df';
  g.font = 'bold 13px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('A', X(SITES.A.labelX), Z(SITES.A.labelZ) + 4);
  g.fillText('B', X(SITES.B.labelX), Z(SITES.B.labelZ) + 4);
}

function drawMinimap() {
  const cv = els.minimap;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 180, 180);
  g.drawImage(mapStatic, 0, 0);
  const sx = 180 / 62;
  const oy = (180 - 46 * sx) / 2;
  const X = (x) => (x + 31) * sx;
  const Z = (z) => (z + 23) * sx + oy;
  const bomb = S.bomb;
  if (bomb.state === 'dropped' || bomb.state === 'planted') {
    g.fillStyle = bomb.state === 'planted' ? '#ff5040' : '#f2a33c';
    g.beginPath();
    g.arc(X(bomb.x), Z(bomb.z), 5, 0, Math.PI * 2);
    g.fill();
  }
  for (const a of S.agents) {
    if (!a.alive) continue;
    if (a.team === 'S' && S.time - a.seenT > 2.5) continue;
    const x = X(a.pos.x);
    const y = Z(a.pos.z);
    if (a.isPlayer) {
      g.save();
      g.translate(x, y);
      g.rotate(-a.yaw);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4.4, 4.5);
      g.lineTo(-4.4, 4.5);
      g.closePath();
      g.fill();
      g.restore();
    } else {
      g.fillStyle = TEAM_CSS[a.team];
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drainEvents() {
  while (S.events.length > 0) {
    const e = S.events.shift();
    if (e.type === 'msg') {
      els['center-msg'].textContent = e.text;
      els['center-msg'].className = `show ${e.tone || 'info'}`;
      msgT = 3.2;
    } else if (e.type === 'roundEnd') {
      const won = e.winner === 'V';
      els.banner.textContent = won ? 'ROUND WON' : 'ROUND LOST';
      els.banner.className = won ? 'show win' : 'show lose';
      els['banner-sub'].textContent = e.reason;
      els['banner-sub'].className = 'show';
      bannerT = 3.4;
    } else if (e.type === 'matchEnd') {
      els['match-title'].textContent = e.winner === 'V' ? 'VICTORY' : e.winner === 'S' ? 'DEFEAT' : 'DRAW';
      els['match-title'].className = e.winner === 'V' ? 'win' : e.winner === 'S' ? 'lose' : '';
      els['match-sub'].textContent = `Final score — Vanguard ${S.scores.V} : ${S.scores.S} Sentinel`;
      els['match-overlay'].hidden = false;
    } else if (e.type === 'planted') {
      els['center-msg'].textContent = `Charge planted at site ${e.site} — defend it!`;
      els['center-msg'].className = 'show warn';
      msgT = 3.2;
    } else if (e.type === 'live') {
      // Buy time ran out with the menu open: close it and pause for a click.
      if (S.buyOpen) {
        S.buyOpen = false;
        setBuyMenu(false);
        S.paused = true;
        showOverlay('pause');
      }
    } else if (e.type === 'roundStart') {
      S.buyOpen = false;
      setBuyMenu(false);
    }
  }
}

function renderKillfeed() {
  const key = S.killfeed.map((k) => `${k.killer}>${k.victim}${k.head ? 'h' : ''}`).join('|');
  if (cache.killfeed === key) return;
  cache.killfeed = key;
  els.killfeed.innerHTML = '';
  for (const k of S.killfeed) {
    const row = document.createElement('div');
    row.className = 'kf-row';
    const killer = `<b style="color:${k.killerTeam ? TEAM_CSS[k.killerTeam] : '#888'}">${k.killer}</b>`;
    const victim = `<b style="color:${TEAM_CSS[k.victimTeam]}">${k.victim}</b>`;
    row.innerHTML = `${killer} <span class="kf-weapon">${k.head ? '☠ ' : ''}${k.weapon || ''}</span> ${victim}`;
    els.killfeed.appendChild(row);
  }
}

function renderScoreboard() {
  els.scoreboard.hidden = !scoreOpen;
  if (!scoreOpen) return;
  const key = S.agents.map((a) => `${a.name}${a.kills}/${a.deaths}${a.alive ? 1 : 0}`).join('|');
  if (cache.scoreboard === key) return;
  cache.scoreboard = key;
  let html = '';
  for (const team of ['V', 'S']) {
    html += `<div class="sb-team" style="color:${TEAM_CSS[team]}">${TEAM_NAME[team]} — ${S.scores[team]}</div>`;
    for (const a of S.agents) {
      if (a.team !== team) continue;
      html += `<div class="sb-row ${a.alive ? '' : 'dead'}"><span>${a.name}${a.isPlayer ? ' (you)' : ''}</span><span>${a.kills} / ${a.deaths}</span><span>$${a.money}</span></div>`;
    }
  }
  els['score-rows'].innerHTML = html;
}

export function updateHud(dt) {
  drainEvents();
  const p = S.player;
  if (!p) return;

  if (msgT > 0) {
    msgT -= dt;
    if (msgT <= 0) els['center-msg'].className = '';
  }
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) {
      els.banner.className = '';
      els['banner-sub'].className = '';
    }
  }

  setText('hp', els['health-num'], String(Math.max(0, Math.ceil(p.hp))));
  els['health-fill'].style.width = `${Math.max(0, p.hp)}%`;
  els['health-fill'].style.background = p.hp > 50 ? '#7fd08a' : p.hp > 25 ? '#f2a33c' : '#ff5040';
  setText('armor', els['armor-num'], String(Math.ceil(p.armor)));
  setText('money', els.money, `$${p.money}`);

  const w = currentWeapon(p);
  if (w) {
    const def = WEAPONS[w.key];
    setText('wname', els['weapon-name'], def.name);
    setText('mag', els['ammo-mag'], String(w.mag));
    setText('res', els['ammo-reserve'], `/ ${w.reserve}`);
    els['ammo-mag'].parentElement.classList.toggle('empty', w.mag === 0);
  } else {
    setText('wname', els['weapon-name'], p.slot === 'frag' ? 'Frag Grenade' : 'Smoke Grenade');
    setText('mag', els['ammo-mag'], String(p.slot === 'frag' ? p.frags : p.smokes));
    setText('res', els['ammo-reserve'], '');
  }
  setText('frag', els['nade-frag'], `◉ ${p.frags}`);
  setText('smoke', els['nade-smoke'], `◎ ${p.smokes}`);

  let timerText = '';
  if (S.phase === 'buy') timerText = `BUY ${fmtTime(S.timer)}`;
  else if (S.phase === 'live' && S.bomb.state === 'planted') timerText = `BOMB ${fmtTime(S.bomb.fuse)}`;
  else if (S.phase === 'live') timerText = fmtTime(S.timer);
  else if (S.phase === 'ended') timerText = '—';
  setText('timer', els.timer, timerText);
  els.timer.classList.toggle('urgent', S.phase === 'live' && S.bomb.state === 'planted');
  setText('round', els['round-label'], S.round > 0 ? `ROUND ${S.round} / ${9}` : 'EMBERLINE');
  setText('sv', els['score-v'], String(S.scores.V));
  setText('ss', els['score-s'], String(S.scores.S));
  let av = 0;
  let as = 0;
  for (const a of S.agents) {
    if (!a.alive) continue;
    if (a.team === 'V') av += 1;
    else as += 1;
  }
  setText('av', els['alive-v'], `${av} alive`);
  setText('as', els['alive-s'], `${as} alive`);

  // Bomb chip.
  const bomb = S.bomb;
  let bombText = '';
  if (bomb.state === 'carried') bombText = p.hasBomb ? '◈ YOU CARRY THE CHARGE' : '◈ Teammate carries the charge';
  else if (bomb.state === 'dropped') bombText = '◈ Charge dropped — pick it up';
  else if (bomb.state === 'planted') bombText = `◈ CHARGE LIVE AT ${bomb.site} — ${fmtTime(bomb.fuse)}`;
  setText('bomb', els['bomb-text'], bombText);
  els['bomb-chip'].hidden = bomb.state === 'exploded' || bomb.state === 'defused' || !S.started;
  els['bomb-chip'].classList.toggle('live', bomb.state === 'planted');

  // Crosshair gap follows the live spread; scoped DMR collapses to a dot.
  const aimingDmr = S.aiming && w && w.key === 'dmr';
  els.crosshair.style.setProperty('--gap', `${4 + (S.spreadNow || 0.01) * 900}px`);
  els.crosshair.classList.toggle('scoped', !!aimingDmr);
  els.scope.hidden = !aimingDmr;
  els.hitmarker.classList.toggle('on', S.hitmark > 0);
  els.hitmarker.classList.toggle('head', S.hitmarkHead);

  // Damage feedback.
  els.vignette.style.opacity = String(Math.min(0.85, S.damageFlash));
  if (S.damageFlash > 0.05) {
    els['dir-hit'].style.opacity = '1';
    els['dir-hit'].style.transform = `translate(-50%,-50%) rotate(${S.damageDir}rad)`;
  } else {
    els['dir-hit'].style.opacity = '0';
  }

  // Interact prompt and channel bar.
  setText('prompt', els.prompt, S.promptText || '');
  els.prompt.hidden = !S.promptText;
  if (p.channel) {
    const total = p.channel.type === 'plant' ? 3.5 : 5;
    els['channel-wrap'].hidden = false;
    els['channel-fill'].style.width = `${(p.channel.t / total) * 100}%`;
    setText('chlabel', els['channel-label'], p.channel.type === 'plant' ? 'PLANTING CHARGE…' : 'DEFUSING…');
  } else if (bomb.state === 'planted' && bomb.defuseT > 0) {
    els['channel-wrap'].hidden = false;
    els['channel-fill'].style.width = `${bomb.defuseT * 100}%`;
    setText('chlabel', els['channel-label'], 'ENEMY DEFUSING!');
  } else {
    els['channel-wrap'].hidden = true;
  }

  // Buy menu affordability.
  if (S.buyOpen) {
    setText('buymoney', els['buy-money'], `$${p.money}`);
    for (const b of els['buy-items'].children) {
      const item = BUY_ITEMS.find((i) => i.key === b.dataset.key);
      b.classList.toggle('poor', p.money < item.price);
      b.classList.toggle('owned', item.key === 'armor' && p.armor >= 100);
    }
  }

  renderKillfeed();
  renderScoreboard();
  mapT -= dt;
  if (mapT <= 0) {
    mapT = 0.1;
    drawMinimap();
  }
}

export function showOverlay(name) {
  els['start-overlay'].hidden = name !== 'start';
  els['pause-overlay'].hidden = name !== 'pause';
  if (name !== 'match') els['match-overlay'].hidden = true;
}

export function setBuyMenu(open) {
  els['buy-menu'].hidden = !open;
}
