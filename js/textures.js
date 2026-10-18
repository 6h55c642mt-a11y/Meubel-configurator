// Procedurele houttexturen (canvas) zodat er geen afbeeldingen nodig zijn.
import * as THREE from 'three';

const cache = new Map();

const WOODS = {
  berken:   { base: '#e6d3ae', line: '#b8986a', pores: false, contrast: 0.5 },
  populier: { base: '#e8dab9', line: '#c2a97e', pores: false, contrast: 0.45 },
  eiken:    { base: '#c79f68', line: '#8a6236', pores: true,  contrast: 1.0 },
  noten:    { base: '#6f4b32', line: '#3b2416', pores: true,  contrast: 0.9 },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function woodTexture(kind) {
  const key = 'wood:' + kind;
  if (cache.has(key)) return cache.get(key);
  const w = WOODS[kind] || WOODS.berken;
  const S = 1024;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = w.base; g.fillRect(0, 0, S, S);
  const r = rng(kind.length * 977 + 13);
  // brede kleurbanden
  for (let i = 0; i < 18; i++) {
    const x = r() * S, bw = 20 + r() * 120;
    g.fillStyle = `rgba(${r() > 0.5 ? '255,245,225' : '120,80,40'},${0.04 * w.contrast + r() * 0.05 * w.contrast})`;
    g.fillRect(x, 0, bw, S); g.fillRect(x - S, 0, bw, S);
  }
  // nerflijnen (verticaal = langs v)
  g.strokeStyle = w.line;
  for (let i = 0; i < 260; i++) {
    const x0 = r() * S, amp = 2 + r() * 10, freq = 1 + Math.floor(r() * 3), ph = r() * 6.28;
    g.globalAlpha = (0.04 + r() * 0.16) * w.contrast;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let y = 0; y <= S; y += 8) {
      const x = x0 + Math.sin(y / S * 6.283 * freq + ph) * amp;
      y === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  if (w.pores) {
    g.fillStyle = w.line;
    for (let i = 0; i < 2600; i++) {
      g.globalAlpha = 0.08 + r() * 0.18;
      g.fillRect(r() * S, r() * S, 1 + r() * 1.5, 4 + r() * 14);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

// Kopse kant van multiplex: afwisselende fineerlagen over de dikte (v = 0..1)
export function plyTexture(t, painted) {
  const plies = Math.max(3, Math.round(t / 1.45) | 1);
  const key = `ply:${plies}:${painted}`;
  if (cache.has(key)) return cache.get(key);
  const H = plies * 16, Wd = 256;
  const c = document.createElement('canvas'); c.width = Wd; c.height = H;
  const g = c.getContext('2d');
  const r = rng(plies * 31);
  for (let i = 0; i < plies; i++) {
    const dark = i % 2 === 1;
    g.fillStyle = dark ? '#c8a676' : '#ead8b4';
    g.fillRect(0, i * 16, Wd, 16);
    g.fillStyle = 'rgba(90,60,30,0.35)';
    g.fillRect(0, i * 16, Wd, 1);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(110,75,40,${r() * 0.15})`; g.fillRect(r() * Wd, i * 16 + 2 + r() * 12, 4 + r() * 30, 1); }
  }
  if (painted) { // dunne laklaag aan buitenkanten
    g.fillStyle = 'rgba(0,0,0,0.0)';
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
