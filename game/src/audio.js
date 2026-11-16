// EMBERLINE — procedural sound. Every sound is synthesized with WebAudio, so
// the game ships no audio files and makes no network request. One shared
// noise buffer, one master gain, distance attenuation by ear.

let ctx = null;
let master = null;
let noiseBuf = null;
let listenerX = 0;
let listenerZ = 0;
let ready = false;

export function initAudio() {
  if (ready) {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1.2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ready = true;
  } catch (err) {
    ready = false;
  }
}

export function setListener(x, z) {
  listenerX = x;
  listenerZ = z;
}

function volFor(x, z, base) {
  if (x === undefined) return base;
  const dx = x - listenerX;
  const dz = z - listenerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const v = base * Math.max(0, 1 - dist / 42);
  return v;
}

function noise(dur, gain, filterFreq, type, when) {
  if (!ready) return;
  const t = when || ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type, slideTo, when) {
  if (!ready) return;
  const t = when || ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function click(gain, when) {
  noise(0.03, gain, 4000, 'highpass', when);
}

export const sfx = {
  shot(kind, x, z) {
    const v = volFor(x, z, 1);
    if (v <= 0.01) return;
    if (kind === 'shotgun') { noise(0.28, 0.9 * v, 900); tone(90, 0.2, 0.5 * v, 'sine', 40); }
    else if (kind === 'dmr') { noise(0.3, 0.85 * v, 1400); tone(120, 0.22, 0.4 * v, 'sine', 45); }
    else if (kind === 'pistol') { noise(0.14, 0.7 * v, 1800); tone(160, 0.1, 0.3 * v, 'sine', 60); }
    else if (kind === 'smg') { noise(0.1, 0.55 * v, 2200); tone(200, 0.07, 0.22 * v, 'sine', 70); }
    else { noise(0.16, 0.75 * v, 1600); tone(140, 0.12, 0.35 * v, 'sine', 55); }
  },
  dryFire() { click(0.25); },
  reload() {
    click(0.3);
    click(0.3, ctx ? ctx.currentTime + 0.35 : 0);
    click(0.4, ctx ? ctx.currentTime + 0.7 : 0);
  },
  hit(head) {
    tone(head ? 1400 : 950, 0.07, 0.35, 'square');
  },
  kill() {
    tone(700, 0.09, 0.3, 'square');
    tone(1050, 0.12, 0.3, 'square', null, ctx ? ctx.currentTime + 0.08 : 0);
  },
  step(x, z, run) {
    const v = volFor(x, z, run ? 0.16 : 0.07);
    if (v <= 0.01) return;
    noise(0.06, v, 500);
  },
  bounce(x, z) {
    const v = volFor(x, z, 0.3);
    if (v > 0.01) tone(320, 0.06, v, 'triangle', 180);
  },
  throwWhoosh() { noise(0.15, 0.2, 900, 'bandpass'); },
  smokePop(x, z) {
    const v = volFor(x, z, 0.5);
    if (v > 0.01) noise(0.5, v, 700);
  },
  explosion(x, z) {
    const v = volFor(x, z, 1);
    if (v <= 0.01) return;
    noise(1.4, 1.0 * v, 300);
    tone(70, 1.1, 0.8 * v, 'sine', 26);
    noise(0.5, 0.5 * v, 3000, 'highpass');
  },
  beep(fast) {
    tone(fast ? 1250 : 950, 0.07, 0.32, 'square');
  },
  plant() {
    tone(500, 0.15, 0.3, 'square');
    tone(750, 0.2, 0.3, 'square', null, ctx ? ctx.currentTime + 0.15 : 0);
  },
  defuseTick() { tone(1100, 0.05, 0.2, 'square'); },
  roundWin() {
    tone(523, 0.14, 0.3, 'triangle');
    tone(659, 0.14, 0.3, 'triangle', null, ctx ? ctx.currentTime + 0.13 : 0);
    tone(784, 0.26, 0.32, 'triangle', null, ctx ? ctx.currentTime + 0.26 : 0);
  },
  roundLose() {
    tone(392, 0.16, 0.28, 'triangle');
    tone(311, 0.3, 0.28, 'triangle', null, ctx ? ctx.currentTime + 0.15 : 0);
  },
  buy() { tone(880, 0.08, 0.25, 'triangle'); tone(1320, 0.1, 0.2, 'triangle', null, ctx ? ctx.currentTime + 0.07 : 0); },
  denied() { tone(220, 0.15, 0.25, 'square'); },
  hurt() { noise(0.1, 0.3, 400); },
};
