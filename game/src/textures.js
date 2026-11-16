// EMBERLINE — procedural textures. The map's art is painted on canvases at
// load: asphalt, concrete, corrugated container steel, wood crates and hazard
// striping. No image files ship with the game.
import * as THREE from 'three';

function canvasTex(size, paint, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, size, colors, n, maxR) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = 1 + Math.random() * maxR;
    g.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
}

export function makeTextures() {
  const asphalt = canvasTex(256, (g, s) => {
    g.fillStyle = '#3d3a36';
    g.fillRect(0, 0, s, s);
    speckle(g, s, ['#464240', '#35322e', '#4c4844', '#2e2b28'], 2600, 3);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      const y = Math.random() * s;
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + 8 - Math.random() * 16, s * 0.6, y + 8 - Math.random() * 16, s, y);
      g.stroke();
    }
  }, 10, 8);

  const concrete = canvasTex(256, (g, s) => {
    g.fillStyle = '#8a847c';
    g.fillRect(0, 0, s, s);
    speckle(g, s, ['#948e84', '#7e7870', '#9c968c', '#6f6960'], 2200, 3);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, s, 6);
    g.fillRect(0, s - 6, s, 6);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 6, s, 3);
  }, 3, 1);

  const wood = canvasTex(256, (g, s) => {
    g.fillStyle = '#8a6a44';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      g.fillStyle = y % 84 === 0 ? '#7d5f3c' : '#96744c';
      g.fillRect(0, y, s, 40);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, y + 40, s, 2);
      g.strokeStyle = 'rgba(60,40,20,0.35)';
      g.beginPath();
      g.moveTo(0, y + 20 + Math.random() * 8);
      g.lineTo(s, y + 16 + Math.random() * 10);
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,20,10,0.55)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, s - 6, s - 6);
  }, 1, 1);

  function containerTex(base, dark, light) {
    return canvasTex(256, (g, s) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        g.fillStyle = dark;
        g.fillRect(x, 0, 5, s);
        g.fillStyle = light;
        g.fillRect(x + 11, 0, 3, s);
      }
      speckle(g, s, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.07)', 'rgba(40,20,10,0.25)'], 500, 4);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 0, s, 8);
      g.fillRect(0, s - 8, s, 8);
    }, 2, 1);
  }

  const hazard = canvasTex(128, (g, s) => {
    g.fillStyle = '#d9a521';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#1c1c1e';
    for (let x = -s; x < s * 2; x += 32) {
      g.beginPath();
      g.moveTo(x, s);
      g.lineTo(x + 16, s);
      g.lineTo(x + 16 + s, 0);
      g.lineTo(x + s, 0);
      g.closePath();
      g.fill();
    }
  }, 4, 1);

  const metal = canvasTex(256, (g, s) => {
    g.fillStyle = '#565b60';
    g.fillRect(0, 0, s, s);
    speckle(g, s, ['#60666b', '#4b5054', '#6a7075'], 1400, 3);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (s / 4) * i);
      g.lineTo(s, (s / 4) * i);
      g.stroke();
    }
  }, 2, 1);

  // Big painted ground letters for the two sites.
  function siteLetter(letter, color) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = color;
    g.font = 'bold 190px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.55;
    g.fillText(letter, 128, 134);
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.globalAlpha = 0.4;
    g.strokeRect(14, 14, 228, 228);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Dusk sky gradient, painted once and wrapped on a dome.
  const sky = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#101a2e');
    grad.addColorStop(0.45, '#2c3a5c');
    grad.addColorStop(0.68, '#7a5a52');
    grad.addColorStop(0.8, '#d98a4b');
    grad.addColorStop(1, '#3a2f28');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  return {
    asphalt, concrete, wood, hazard, metal, sky,
    containerRust: containerTex('#a4442c', '#7e3220', '#c05a3c'),
    containerTeal: containerTex('#2e6f6a', '#21524e', '#3f8a84'),
    containerSand: containerTex('#b98a3c', '#8f6a2c', '#d3a24e'),
    siteA: siteLetter('A', '#f2a33c'),
    siteB: siteLetter('B', '#3ec6b8'),
  };
}
