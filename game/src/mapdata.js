// EMBERLINE — map data for "Harbor Yard": an original dockside container yard
// at dusk. Three lanes (west A lane, mid courtyard, east B lane), two bomb
// sites, and a top yard linking them. Walls and props are axis-aligned boxes;
// the waypoint graph is what bots walk. Coordinates: x east, z south.
// Attackers spawn south (z+), defenders north (z-), sites at the north corners.
import { makeBox } from './collision.js';

// [x0, z0, x1, z1, height] — full-height concrete walls.
export const WALLS = [
  [-31, -23, 31, -22, 4], // outer north
  [-31, 22, 31, 23, 4], // outer south
  [-31, -23, -30, 23, 4], // outer west
  [30, -23, 31, 23, 4], // outer east
  [-30, -10, -20, -9, 3.2], // A site south wall, west part
  [-17, -10, -14, -9, 3.2], // A site south wall, east part (gap = A entry)
  [14, -10, 17, -9, 3.2], // B site south wall, west part
  [20, -10, 30, -9, 3.2], // B site south wall, east part (gap = B entry)
  [-10, -6, -1.5, -5, 3.2], // mid north wall, west part
  [1.5, -6, 10, -5, 3.2], // mid north wall, east part (gap = mid doors)
  [-10, 5, -3, 6, 3.2], // mid south wall, west part
  [3, 5, 10, 6, 3.2], // mid south wall, east part (gap = mid south)
  [-14, -22, -13, -13, 3.2], // A site divider (passage around its south end)
  [13, -22, 14, -13, 3.2], // B site divider
  [-10, 14, -4, 15, 3.2], // spawn yard divider, west
  [4, 14, 10, 15, 3.2], // spawn yard divider, east
];

// Props: cover the player can hide behind and shoot over. Low crates (1.2 m)
// block movement but not standing shots; containers (2.6 m) block both.
export const PROPS = [
  { x0: -3, z0: -1.2, x1: 3, z1: 1.2, h: 2.6, kind: 'container', variant: 'containerRust' },
  { x0: -6, z0: -3.5, x1: -4.8, z1: -2.3, h: 1.2, kind: 'crate' },
  { x0: 4.8, z0: 2.3, x1: 6, z1: 3.5, h: 1.2, kind: 'crate' },
  { x0: -6, z0: 2.5, x1: -4.8, z1: 3.7, h: 1.2, kind: 'crate' },
  { x0: -28, z0: -20, x1: -22, z1: -17.6, h: 2.6, kind: 'container', variant: 'containerTeal' },
  { x0: -19, z0: -19, x1: -17.8, z1: -17.8, h: 1.2, kind: 'crate' },
  { x0: -26, z0: -13, x1: -24.8, z1: -11.8, h: 1.2, kind: 'crate' },
  { x0: -18, z0: -14, x1: -16.8, z1: -12.8, h: 2.4, kind: 'crateTall' },
  { x0: -22.4, z0: -12.9, x1: -21.6, z1: -12.1, h: 1.1, kind: 'barrel' },
  { x0: 22, z0: -20, x1: 28, z1: -17.6, h: 2.6, kind: 'container', variant: 'containerSand' },
  { x0: 17.8, z0: -19, x1: 19, z1: -17.8, h: 1.2, kind: 'crate' },
  { x0: 24.8, z0: -13, x1: 26, z1: -11.8, h: 1.2, kind: 'crate' },
  { x0: 16.8, z0: -14, x1: 18, z1: -12.8, h: 2.4, kind: 'crateTall' },
  { x0: 21.6, z0: -12.9, x1: 22.4, z1: -12.1, h: 1.1, kind: 'barrel' },
  { x0: -27, z0: 2, x1: -25.8, z1: 3.2, h: 1.2, kind: 'crate' },
  { x0: -27, z0: 10, x1: -25.8, z1: 11.2, h: 1.2, kind: 'crate' },
  { x0: 25.8, z0: 2, x1: 27, z1: 3.2, h: 1.2, kind: 'crate' },
  { x0: 25.8, z0: 10, x1: 27, z1: 11.2, h: 1.2, kind: 'crate' },
  { x0: -14, z0: 16, x1: -8, z1: 18.4, h: 2.6, kind: 'container', variant: 'containerSand' },
  { x0: 8, z0: 16, x1: 14, z1: 18.4, h: 2.6, kind: 'container', variant: 'containerRust' },
  { x0: -5, z0: 8, x1: -3.8, z1: 9.2, h: 1.2, kind: 'crate' },
  { x0: 3.8, z0: 8, x1: 5, z1: 9.2, h: 1.2, kind: 'crate' },
  { x0: -5, z0: -9, x1: -3.8, z1: -7.8, h: 1.2, kind: 'crate' },
  { x0: 3.8, z0: -9, x1: 5, z1: -7.8, h: 1.2, kind: 'crate' },
  { x0: -9, z0: -8.5, x1: -8.2, z1: -7.7, h: 1.1, kind: 'barrel' },
  { x0: 8.2, z0: -8.5, x1: 9, z1: -7.7, h: 1.1, kind: 'barrel' },
  { x0: -3, z0: -20, x1: -1.8, z1: -18.8, h: 1.2, kind: 'crate' },
  { x0: 1.8, z0: -20, x1: 3, z1: -18.8, h: 1.2, kind: 'crate' },
];

export const SITES = {
  A: { key: 'A', x0: -29, z0: -21, x1: -16, z1: -11, plantX: -21, plantZ: -16, labelX: -22.5, labelZ: -16 },
  B: { key: 'B', x0: 16, z0: -21, x1: 29, z1: -11, plantX: 21, plantZ: -16, labelX: 22.5, labelZ: -16 },
};

export const ATTACKER_SPAWNS = [
  { x: -24, z: 19 }, { x: -20, z: 20 }, { x: 24, z: 19 }, { x: 20, z: 20 },
];
export const DEFENDER_SPAWNS = [
  { x: -8, z: -19 }, { x: 8, z: -19 }, { x: -2, z: -20 }, { x: 2, z: -20 },
];

// Waypoint graph. Every edge crosses open ground only; bots path with BFS.
export const WAYPOINTS = [
  [-24, 19], [-24, 12], [-24, 4], [-24, -4], [-18.5, -8.5], [-22, -14],
  [-18, -18], [-26, -18], [24, 19], [24, 12], [24, 4], [24, -4],
  [18.5, -8.5], [22, -14], [18, -18], [26, -18], [0, 19], [0, 10],
  [-5, 3], [-5, -3], [5, 3], [5, -3], [0, -3.5], [0, -8],
  [-8, -8], [8, -8], [-11, -11.5], [11, -11.5], [-16, -12], [16, -12],
  [0, -19], [-6, -17], [6, -17],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [6, 7],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [13, 15], [14, 15],
  [0, 16], [8, 16], [16, 17], [17, 18], [17, 20], [18, 19], [20, 21],
  [19, 22], [21, 22], [22, 23], [23, 24], [23, 25], [24, 26], [25, 27],
  [26, 28], [27, 29], [28, 5], [29, 13], [3, 19], [11, 21], [2, 18], [10, 20],
  [4, 26], [12, 27], [30, 31], [30, 32], [31, 24], [32, 25], [31, 23], [32, 23], [30, 23],
];

export function buildGraph() {
  const adj = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

export const GRAPH = buildGraph();

// BFS shortest path between waypoint indices. Returns node indices, start
// excluded, or [] when unreachable. Preallocated queue, no per-call garbage
// beyond the returned path.
export function findPath(from, to) {
  if (from === to) return [to];
  const n = WAYPOINTS.length;
  const prev = new Int16Array(n).fill(-1);
  const queue = new Int16Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  prev[from] = from;
  while (head < tail) {
    const cur = queue[head++];
    const nb = GRAPH[cur];
    for (let i = 0; i < nb.length; i++) {
      const w = nb[i];
      if (prev[w] !== -1) continue;
      prev[w] = cur;
      if (w === to) {
        const path = [to];
        let p = cur;
        while (p !== from) { path.push(p); p = prev[p]; }
        path.reverse();
        return path;
      }
      queue[tail++] = w;
    }
  }
  return [];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function buildColliders() {
  const boxes = [];
  for (const w of WALLS) boxes.push(makeBox(w[0], w[1], w[2], w[3], w[4]));
  for (const p of PROPS) boxes.push(makeBox(p.x0, p.z0, p.x1, p.z1, p.h));
  return boxes;
}

export const LAMPS = [
  { x: -22, z: -16, color: 0xffc27a },
  { x: 22, z: -16, color: 0xffc27a },
  { x: 0, z: 0, color: 0x9fd8ff },
  { x: 0, z: 18, color: 0xffc27a },
];
