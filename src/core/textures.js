/**
 * Процедурные текстуры на canvas — внешние ассеты не нужны.
 */
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1, aniso = 4) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function baseNoise(ctx, size, rnd, amount = 26, alpha = 0.5) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (alpha < 1) d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, size, rnd, count, colors, rMin, rMax, alpha = 0.08) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = rMin + rnd() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = colors[(rnd() * colors.length) | 0];
    g.addColorStop(0, `rgba(${col},${alpha})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

/* ------------------------- материалы ------------------------- */

export function concreteTexture(seed = 1, tint = [122, 124, 118]) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rnd, 60, ['90,90,86', '160,158,150', '70,72,70'], 12, 60, 0.16);
  baseNoise(ctx, size, rnd, 30);
  // швы плит
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(size / 2 + 2, 0); ctx.lineTo(size / 2 + 2, size); ctx.stroke();
  // трещины
  ctx.strokeStyle = 'rgba(30,30,28,0.35)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = rnd() * size, y = rnd() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c;
}

export function sandTexture(seed = 7) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = 'rgb(150,134,102)';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rnd, 70, ['110,96,70', '186,170,136'], 14, 70, 0.2);
  baseNoise(ctx, size, rnd, 40);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#b9a67c' : '#7d6e50';
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  ctx.globalAlpha = 1;
  return c;
}

export function crateTexture(seed = 11, tint = [140, 106, 66]) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, size, size);
  // доски
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    ctx.fillStyle = `rgba(${tint[0] - 20},${tint[1] - 16},${tint[2] - 12},0.55)`;
    ctx.fillRect(0, y + 60, size, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, y + 1, size - 2, 62);
  }
  // волокна
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = rnd() > 0.5 ? '#3a2a18' : '#d0a878';
    ctx.lineWidth = 1;
    const y = rnd() * size;
    const x = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + rnd() * 60, y + (rnd() - 0.5) * 3); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // металлические углы
  ctx.fillStyle = 'rgba(60,60,64,0.85)';
  ctx.fillRect(0, 0, 14, 14); ctx.fillRect(size - 14, 0, 14, 14);
  ctx.fillRect(0, size - 14, 14, 14); ctx.fillRect(size - 14, size - 14, 14, 14);
  baseNoise(ctx, size, rnd, 18);
  return c;
}

export function metalTexture(seed = 21, tint = [86, 96, 104]) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rnd, 40, ['40,46,52', '150,160,170'], 10, 50, 0.18);
  baseNoise(ctx, size, rnd, 16);
  // вертикальные рёбра
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, 0, 2, size);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x + 3, 0, 2, size);
  }
  // заклёпки
  for (let x = 16; x < size; x += 32) {
    for (let y = 16; y < size; y += 64) {
      ctx.fillStyle = 'rgba(200,210,220,0.35)';
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(x + 1, y + 1, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

export function groundTexture(seed = 31) {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = 'rgb(126,120,104)';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rnd, 120, ['96,92,80', '168,160,140', '70,70,62'], 20, 120, 0.22);
  baseNoise(ctx, size, rnd, 34);
  // мелкая галька
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 900; i++) {
    const s = 1 + rnd() * 3.5;
    ctx.fillStyle = rnd() > 0.5 ? '#a49c88' : '#6d675a';
    ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

export function tileTexture(seed = 41, tint = [104, 108, 112]) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, size, size);
  const n = 4, s = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = (rnd() - 0.5) * 22;
      ctx.fillStyle = `rgba(${tint[0] + v},${tint[1] + v},${tint[2] + v},0.9)`;
      ctx.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    }
  }
  baseNoise(ctx, size, rnd, 14);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
  }
  return c;
}

export function siteMarkerTexture(letter = 'A', hue = '#ffb02e') {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = hue;
  ctx.globalAlpha = 0.16;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 10;
  ctx.strokeStyle = hue;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 14, 0, Math.PI * 2); ctx.stroke();
  ctx.font = 'bold 150px Arial Narrow, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 6);
  return c;
}

export function skyTexture() {
  const w = 8, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#1a3556');
  g.addColorStop(0.35, '#4a7ba8');
  g.addColorStop(0.62, '#a8c4d8');
  g.addColorStop(0.78, '#e2d3b4');
  g.addColorStop(1.0, '#8d7f68');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ------------------------- кэш материалов ------------------------- */

const cache = new Map();

function tex(key, canvasFn, repeat = 1) {
  if (cache.has(key)) return cache.get(key);
  const t = toTexture(canvasFn(), repeat);
  cache.set(key, t);
  return t;
}

export const Materials = {
  concrete: () => new THREE.MeshStandardMaterial({
    map: tex('concrete', () => concreteTexture(3), 1), roughness: 0.94, metalness: 0.02, color: 0xffffff,
  }),
  concreteWall: () => new THREE.MeshStandardMaterial({
    map: tex('concrete2', () => concreteTexture(9, [138, 132, 118]), 1), roughness: 0.95, metalness: 0.02,
  }),
  sand: () => new THREE.MeshStandardMaterial({
    map: tex('sand', () => sandTexture(7), 1), roughness: 1.0, metalness: 0.0,
  }),
  ground: () => new THREE.MeshStandardMaterial({
    map: tex('ground', () => groundTexture(31), 1), roughness: 1.0, metalness: 0.0,
  }),
  crate: () => new THREE.MeshStandardMaterial({
    map: tex('crate', () => crateTexture(11), 1), roughness: 0.85, metalness: 0.05,
  }),
  crateGreen: () => new THREE.MeshStandardMaterial({
    map: tex('crateG', () => crateTexture(17, [72, 108, 78]), 1), roughness: 0.8, metalness: 0.1,
  }),
  crateBlue: () => new THREE.MeshStandardMaterial({
    map: tex('crateB', () => crateTexture(23, [64, 92, 124]), 1), roughness: 0.8, metalness: 0.1,
  }),
  metal: () => new THREE.MeshStandardMaterial({
    map: tex('metal', () => metalTexture(21), 1), roughness: 0.45, metalness: 0.65,
  }),
  metalDark: () => new THREE.MeshStandardMaterial({
    map: tex('metal2', () => metalTexture(29, [58, 62, 68]), 1), roughness: 0.55, metalness: 0.6,
  }),
  tile: () => new THREE.MeshStandardMaterial({
    map: tex('tile', () => tileTexture(41), 1), roughness: 0.7, metalness: 0.1,
  }),
  enemy: () => new THREE.MeshStandardMaterial({ color: 0xb8483c, roughness: 0.75, metalness: 0.15 }),
  enemyDark: () => new THREE.MeshStandardMaterial({ color: 0x3a2a2c, roughness: 0.8, metalness: 0.2 }),
  boss: () => new THREE.MeshStandardMaterial({ color: 0x6b2f8a, roughness: 0.6, metalness: 0.35, emissive: 0x2a0b3a }),
  ally: () => new THREE.MeshStandardMaterial({ color: 0x4a7fd0, roughness: 0.75 }),
  siteColor: (letter) => new THREE.CanvasTexture(siteMarkerTexture(letter, letter === 'A' ? '#ffb02e' : '#35d0ff')),
  pure: (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts }),
};
