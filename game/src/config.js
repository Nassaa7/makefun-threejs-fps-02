// EMBERLINE — config: every tunable number in one place. No imports, so the
// simulation, bots and HUD all read the same values and nothing is duplicated.
export const SIM_DT = 1 / 60;
export const GRAVITY = 22;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.12;
export const AGENT_RADIUS = 0.35;
export const WALK_SPEED = 4.4;
export const RUN_SPEED = 5.6;
export const CROUCH_SPEED = 2.6;
export const JUMP_SPEED = 7.2;
export const ACCEL_GROUND = 42;
export const ACCEL_AIR = 12;

export const ROUND_TIME = 100;
export const BUY_TIME = 12;
export const END_TIME = 4;
export const BOMB_FUSE = 40;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const TEAM = { V: 'V', S: 'S' };
export const TEAM_NAME = { V: 'Vanguard', S: 'Sentinel' };
export const TEAM_COLOR = { V: 0xf2a33c, S: 0x3ec6b8 };
export const TEAM_CSS = { V: '#f2a33c', S: '#3ec6b8' };

// One weapon definition drives the buy menu, the HUD, the viewmodel and the
// hitscan code. spread is radians at rest; bloom grows per shot and decays;
// moveSpread is added in full at sprint speed, so stopping to aim pays.
export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', slot: 'secondary', price: 0,
    damage: 26, headMul: 3.2, mag: 12, reserve: 48, interval: 0.16,
    reload: 1.4, spread: 0.011, moveSpread: 0.03, bloom: 0.006, bloomMax: 0.03,
    recoil: 0.011, rangeNear: 14, rangeFar: 38, pellets: 1, auto: false,
    zoomFov: 62, sound: 'pistol',
  },
  smg: {
    key: 'smg', name: 'Kestrel-9 SMG', slot: 'primary', price: 1500,
    damage: 22, headMul: 3.0, mag: 30, reserve: 90, interval: 0.075,
    reload: 1.8, spread: 0.02, moveSpread: 0.026, bloom: 0.005, bloomMax: 0.05,
    recoil: 0.007, rangeNear: 12, rangeFar: 32, pellets: 1, auto: true,
    zoomFov: 62, sound: 'smg',
  },
  rifle: {
    key: 'rifle', name: 'KR-7 Carbine', slot: 'primary', price: 2700,
    damage: 30, headMul: 3.6, mag: 30, reserve: 90, interval: 0.1,
    reload: 2.2, spread: 0.008, moveSpread: 0.038, bloom: 0.007, bloomMax: 0.045,
    recoil: 0.01, rangeNear: 18, rangeFar: 46, pellets: 1, auto: true,
    zoomFov: 60, sound: 'rifle',
  },
  shotgun: {
    key: 'shotgun', name: 'Breacher-12', slot: 'primary', price: 1700,
    damage: 9, headMul: 2.0, mag: 6, reserve: 24, interval: 0.8,
    reload: 2.6, spread: 0.05, moveSpread: 0.03, bloom: 0.01, bloomMax: 0.06,
    recoil: 0.035, rangeNear: 7, rangeFar: 20, pellets: 8, auto: false,
    zoomFov: 62, sound: 'shotgun',
  },
  dmr: {
    key: 'dmr', name: 'Longbow DMR', slot: 'primary', price: 4000,
    damage: 85, headMul: 2.2, mag: 5, reserve: 15, interval: 1.1,
    reload: 3.0, spread: 0.014, moveSpread: 0.05, bloom: 0.02, bloomMax: 0.05,
    recoil: 0.03, rangeNear: 30, rangeFar: 70, pellets: 1, auto: false,
    zoomFov: 34, sound: 'dmr', scopedSpread: 0.0015,
  },
};

export const ECONOMY = {
  start: 800, kill: 300, win: 1400, loss: 1000, plant: 300, defuse: 300, max: 9000,
};
export const PRICES = { armor: 650, frag: 300, smoke: 300, ammo: 200 };
export const GRENADE = { fragFuse: 2.2, fragRadius: 7, fragDamage: 115, smokeTime: 14, smokeRadius: 2.3 };

export const BOT_NAMES = {
  V: ['Rook', 'Sable', 'Juno'],
  S: ['Vex', 'Koda', 'Nyx', 'Bram'],
};

export function weaponDef(key) { return WEAPONS[key]; }
export function newWeapon(key) {
  const d = WEAPONS[key];
  return { key, mag: d.mag, reserve: d.reserve };
}
