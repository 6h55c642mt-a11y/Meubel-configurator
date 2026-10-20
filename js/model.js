// Datamodel van een kast. Alle maten in millimeters.
// Coördinaten: x = breedte (0 links), y = hoogte (0 vloer), z = diepte (0 achterkant, D = voorkant korpus).

export const MATERIALS = {
  berken:          { label: 'Berken multiplex',        color: '#e3cfa8', grain: true,  ply: true,  wood: 'berken' },
  populier:        { label: 'Populier multiplex',      color: '#e6d6b4', grain: true,  ply: true,  wood: 'populier' },
  eiken:           { label: 'Eiken fineer',            color: '#c49a63', grain: true,  ply: false, wood: 'eiken' },
  noten:           { label: 'Noten fineer',            color: '#6e4b33', grain: true,  ply: false, wood: 'noten' },
  multiplex_kleur: { label: 'Multiplex gelakt',        color: null,      grain: false, ply: true,  paint: true },
  mdf_kleur:       { label: 'MDF gelakt',              color: null,      grain: false, ply: false, paint: true },
};

export const PALETTE = [
  { name: 'Sneeuw',     hex: '#F3F1EC' },
  { name: 'Kalk',       hex: '#E6E0D4' },
  { name: 'Havermout',  hex: '#D7C9AF' },
  { name: 'Zand',       hex: '#C4AE8F' },
  { name: 'Klei',       hex: '#B98468' },
  { name: 'Roest',      hex: '#9C5A42' },
  { name: 'Mosterd',    hex: '#C8A248' },
  { name: 'Salie',      hex: '#A5B097' },
  { name: 'Mos',        hex: '#6C7859' },
  { name: 'Mistblauw',  hex: '#8DA1B4' },
  { name: 'Fjord',      hex: '#4D6477' },
  { name: 'Antraciet',  hex: '#3A3B3A' },
];

export const FRONT_TYPES = {
  none:        { label: 'Geen front' },
  'door-l':    { label: 'Deur, scharnier links' },
  'door-r':    { label: 'Deur, scharnier rechts' },
  'door-dbl':  { label: 'Dubbele deur' },
  'flap-up':   { label: 'Klep omhoog' },
  'flap-down': { label: 'Klep omlaag' },
  drawer:      { label: 'Lade' },
};

export const INTERIORS = {
  open:   { label: 'Open vak' },
  rail:   { label: 'Garderobestang' },
  inner:  { label: 'Binnenlades' },
};

export const HANDLE_TYPES = {
  push:  { label: 'Push-to-open' },
  staaf: { label: 'Staafgreep', len: 176, cc: 160 },
  lijst: { label: 'Greeplijst' },
  kant:  { label: 'Kantgreep', len: 100 },
  plat:  { label: 'Platte greep', len: 140, cc: 128 },
  knop:  { label: 'Knop' },
};

export const FINISHES = {
  chroom:    { label: 'Chroom',     color: '#e9ebee', metal: 1.0, rough: 0.08 },
  rvs:       { label: 'RVS',        color: '#c3c7cc', metal: 1.0, rough: 0.38 },
  zwart:     { label: 'Mat zwart',  color: '#1e1e1e', metal: 0.2, rough: 0.75 },
  wit:       { label: 'Mat wit',    color: '#f1f0ec', metal: 0.0, rough: 0.65 },
  messing:   { label: 'Messing',    color: '#c7a25c', metal: 1.0, rough: 0.32 },
  antraciet: { label: 'Antraciet',  color: '#404246', metal: 0.6, rough: 0.5 },
};

export const SLIDE_LENGTHS = [270, 300, 350, 400, 450, 500, 550, 600];

const MIN_COL = 120;
const MIN_CELL = 60;

export const JOINERY = {
  deuvel:    { label: 'Deuvels', hint: 'Goedkoop en sterk. Gaten in het vlak via CNC, kopse gaten zelf boren met een deuvelmal. Verlijmd.' },
  confirmat: { label: 'Confirmat', hint: 'Snel en sterk, geen lijm. Schroefkoppen zichtbaar aan de buitenkant (afdekdopjes).' },
  cabineo:   { label: 'Lamello Cabineo', hint: 'Onzichtbaar en demonteerbaar, alle bewerkingen in het vlak: ideaal voor CNC. Duurder per verbinding.' },
};

export const SHAPE_PRESETS = [['rect', 'Rechthoek'], ['slope-r', 'Schuin ↘'], ['slope-l', 'Schuin ↙'], ['knee-r', 'Knieschot ↘'], ['knee-l', 'Knieschot ↙'], ['gable', 'Puntdak']];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newCell(h) {
  return { h, front: 'none', span: 1, interior: 'open', count: 2 };
}

export function defaultDesign() {
  const d = {
    version: 1,
    id: uid(),
    name: 'Dressoir woonkamer',
    W: 1800, H: 900, D: 420,
    t: 18, thinT: 8,
    back: true,
    plinth: { on: true, h: 70, setback: 30 },
    material: {
      carcass: { type: 'multiplex_kleur', color: '#8DA1B4' },
      fronts:  { type: 'multiplex_kleur', color: '#8DA1B4' },
      same: true,
    },
    drawerBoxT: 12,
    handle: { type: 'kant', finish: 'zwart' },
    sheet: { L: 2500, W: 1250, kerf: 4, margin: 10 },
    shape: { on: false, pts: [] },
    joinery: 'deuvel',
    prices: {},
    detail3dm: false,
    grain: {},
    columns: [],
  };
  const iw = innerW(d), ih = innerH(d);
  const n = 3, cw = (iw - (n - 1) * d.t) / n;
  for (let i = 0; i < n; i++) {
    const m = 2; const ch = (ih - (m - 1) * d.t) / m;
    d.columns.push({ w: cw, cells: [newCell(ch), newCell(ch)], loose: [false] });
  }
  d.columns[0].cells[0].front = 'drawer';
  d.columns[0].cells[1].front = 'drawer';
  d.columns[1].cells[0].front = 'door-dbl'; d.columns[1].cells[0].span = 2;
  d.columns[2].cells[1].front = 'door-r';
  return normalize(d);
}

export const plinthH = d => (d.plinth.on ? d.plinth.h : 0);
export const backT = d => (d.back ? d.thinT : 0);
export const breakCount = () => 0;
export const innerW = d => d.W - 2 * d.t - breakCount(d) * d.t;
export const innerH = d => d.H - 2 * d.t - plinthH(d);

// ---------- bovenrand (vrije vorm) ----------
// Bovenrand als polylijn van links (x=0) naar rechts (x=W); buitenkant van het blad.
export function profile(d) {
  if (d.shape && d.shape.on && d.shape.pts.length >= 2) return d.shape.pts;
  return [[0, d.H], [d.W, d.H]];
}
export function segments(d) {
  const pts = profile(d), segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x1 - x0 < 0.5) continue;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const cos = (x1 - x0) / len;
    segs.push({ x0, y0, x1, y1, len, cos, k: (y1 - y0) / (x1 - x0), off: d.t / cos });
  }
  return segs;
}
const segAt = (segs, x) => segs.find(s => x <= s.x1 + 1e-6) || segs[segs.length - 1];
// buitenlijn
export function topOuter(d, x, segs = segments(d)) { const s = segAt(segs, x); return s.y0 + s.k * (x - s.x0); }
// binnenlijn (onderkant blad): offsetpolylijn met verstekpunten op de knikken
export function innerPts(d, segs = segments(d)) {
  const line = s => ({ x: s.x0, y: s.y0 - s.off, k: s.k });
  const pts = [[segs[0].x0, segs[0].y0 - segs[0].off]];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = line(segs[i]), b = line(segs[i + 1]);
    let x;
    if (Math.abs(a.k - b.k) < 1e-9) x = segs[i].x1;
    else x = (b.y - a.y + a.k * a.x - b.k * b.x) / (a.k - b.k);
    pts.push([x, a.y + a.k * (x - a.x)]);
  }
  const L = segs[segs.length - 1];
  pts.push([L.x1, L.y1 - L.off]);
  return pts;
}
export function topInner(d, x, segs = segments(d)) {
  const P = innerPts(d, segs);
  if (x <= P[0][0]) return P[0][1] + segs[0].k * (x - P[0][0]);
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1];
    if (x <= x1 + 1e-9) return x1 - x0 < 1e-9 ? Math.min(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  const l = P[P.length - 1]; return l[1] + segs[segs.length - 1].k * (x - l[0]);
}
// extremen van de binnenlijn over [a,b]
export function innerRange(d, a, b, segs = segments(d)) {
  const xs = [a, b, ...innerPts(d, segs).map(p => p[0]).filter(x => x > a && x < b)];
  const ys = xs.map(x => topInner(d, x, segs));
  return { min: Math.min(...ys), max: Math.max(...ys) };
}
export function colTop(d, ci) {
  const x0 = colX(d, ci);
  return Math.round(innerRange(d, x0, x0 + d.columns[ci].w).max * 10) / 10;
}
export const colInnerH = (d, ci) => colTop(d, ci) - plinthH(d) - d.t;

export function setShapePreset(d, kind) {
  const W = d.W, H = d.H, lo = Math.max(plinthH(d) + 2 * d.t + 300, Math.round(H * 0.45));
  d.shape.on = kind !== 'rect';
  if (kind === 'slope-r') d.shape.pts = [[0, H], [W, lo]];
  if (kind === 'slope-l') d.shape.pts = [[0, lo], [W, H]];
  if (kind === 'knee-r') d.shape.pts = [[0, H], [Math.round(W * 0.45), H], [W, lo]];
  if (kind === 'knee-l') d.shape.pts = [[0, lo], [Math.round(W * 0.55), H], [W, H]];
  if (kind === 'gable') d.shape.pts = [[0, lo], [Math.round(W / 2), H], [W, lo]];
  if (kind === 'rect') d.shape.pts = [[0, H], [W, H]];
  return normalize(d);
}
export function addShapePoint(d) {
  const pts = d.shape.pts; let bi = 0, bl = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = pts[i + 1][0] - pts[i][0]; if (l > bl) { bl = l; bi = i; } }
  const a = pts[bi], b = pts[bi + 1];
  pts.splice(bi + 1, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]);
  return normalize(d);
}
export function moveShapePoint(d, i, x, y) {
  const pts = d.shape.pts, n = pts.length;
  const minY = plinthH(d) + 2 * d.t + 120;
  if (i > 0 && i < n - 1) pts[i][0] = clamp(Math.round(x), pts[i - 1][0] + 20, pts[i + 1][0] - 20);
  pts[i][1] = clamp(Math.round(y), minY, 3000);
}

// Verdeel een totaal over items naar verhouding, gehele mm, rest in laatste.
function fitInts(vals, total, min) {
  const sum = vals.reduce((a, b) => a + b, 0) || 1;
  let out = vals.map(v => Math.max(min, Math.round(v / sum * total)));
  const diff = total - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += diff;
  return out;
}

export function normalize(d) {
  d.W = clamp(Math.round(d.W), 300, 6000);
  d.H = clamp(Math.round(d.H), 200, 3000);
  d.D = clamp(Math.round(d.D), 150, 900);
  if (!d.columns.length) d.columns.push({ w: 500, cells: [newCell(400)], loose: [] });
  d.shape = d.shape || { on: false, pts: [] };
  d.grain = d.grain || {};
  const t = d.t;
  const n = d.columns.length;
  // vrije bovenrand
  if (d.shape.on) {
    let pts = d.shape.pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length < 2) pts = [[0, d.H], [d.W, d.H]];
    const lastX = pts[pts.length - 1][0] || d.W;
    if (Math.abs(lastX - d.W) > 0.5) pts = pts.map(([x, y]) => [Math.round(x * d.W / lastX), y]);
    pts[0][0] = 0; pts[pts.length - 1][0] = d.W;
    pts.sort((a, b) => a[0] - b[0]);
    const minY = plinthH(d) + 2 * t + 120;
    pts = pts.map(([x, y]) => [x, clamp(Math.round(y), minY, 3000)]);
    d.shape.pts = pts;
    d.H = Math.max(...pts.map(p => p[1]));
  }
  d.columns.forEach(c => { delete c.brk; });
  d.joinery = d.joinery || 'deuvel';
  d.prices = d.prices || {};
  const ws = fitInts(d.columns.map(c => c.w), innerW(d) - (n - 1) * t, MIN_COL);
  d.columns.forEach((c, i) => { c.w = ws[i]; });
  d.columns.forEach((col, ci) => {
    const ih = Math.max(MIN_CELL, Math.round(colInnerH(d, ci)));
    const m = col.cells.length;
    const hs = fitInts(col.cells.map(c => c.h), ih - (m - 1) * t, MIN_CELL);
    col.cells.forEach((c, k) => { c.h = hs[k]; });
    col.loose = Array.from({ length: m - 1 }, (_, k) => !!(col.loose && col.loose[k]));
    // fronten: overspanning consistent maken
    let k = 0;
    while (k < m) {
      const c = col.cells[k];
      if (c.front === 'drawer') c.span = 1;
      if (c.front === 'none') c.span = 1;
      c.span = clamp(c.span | 0 || 1, 1, m - k);
      for (let j = k + 1; j < k + c.span; j++) { col.cells[j].front = 'none'; col.cells[j].span = 1; }
      if (c.front === 'drawer') c.interior = 'open';
      k += c.span;
    }
    for (const c of col.cells) { c.count = clamp(c.count | 0 || 2, 1, 8); }
  });
  return d;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------- bewerkingen ----------
export function setColumnCount(d, n) {
  n = clamp(n, 1, 12);
  const ih = innerH(d);
  while (d.columns.length < n) {
    const last = d.columns[d.columns.length - 1];
    d.columns.push(JSON.parse(JSON.stringify(last || { w: 400, cells: [newCell(ih)], loose: [] })));
  }
  d.columns.length = n;
  const w = (innerW(d) - (n - 1) * d.t) / n;
  d.columns.forEach(c => { c.w = w; });
  return normalize(d);
}

export function setCellCount(d, ci, m) {
  m = clamp(m, 1, 20);
  const col = d.columns[ci];
  while (col.cells.length < m) col.cells.push(newCell(100));
  col.cells.length = m;
  const h = (colInnerH(d, ci) - (m - 1) * d.t) / m;
  col.cells.forEach(c => { c.h = h; });
  return normalize(d);
}

export function equalizeColumns(d) {
  const n = d.columns.length, w = (innerW(d) - (n - 1) * d.t) / n;
  d.columns.forEach(c => { c.w = w; });
  return normalize(d);
}

export function equalizeCells(d, ci) {
  const col = d.columns[ci], m = col.cells.length;
  const h = (colInnerH(d, ci) - (m - 1) * d.t) / m;
  col.cells.forEach(c => { c.h = h; });
  return normalize(d);
}

export function setColWidth(d, i, w) {
  const cols = d.columns; if (cols.length < 2) return false;
  const j = i < cols.length - 1 ? i + 1 : i - 1;
  const total = cols[i].w + cols[j].w;
  w = clamp(Math.round(w), MIN_COL, total - MIN_COL);
  cols[i].w = w; cols[j].w = total - w;
  return true;
}

export function setCellHeight(d, ci, k, h) {
  const cells = d.columns[ci].cells; if (cells.length < 2) return false;
  const j = k < cells.length - 1 ? k + 1 : k - 1;
  const total = cells[k].h + cells[j].h;
  h = clamp(Math.round(h), MIN_CELL, total - MIN_CELL);
  cells[k].h = h; cells[j].h = total - h;
  return true;
}

// plank tussen vak k en k+1 naar hoogte (bovenkant plank) yTop
export function moveShelfTo(d, ci, k, yTop) {
  const cells = d.columns[ci].cells;
  const top = cellY(d, ci, k).top;
  const total = cells[k].h + cells[k + 1].h;
  const hk = clamp(Math.round(top - yTop), MIN_CELL, total - MIN_CELL);
  cells[k].h = hk; cells[k + 1].h = total - hk;
}

// schot rechts van kolom i naar x (linkerzijde schot)
export function moveDividerTo(d, i, xLeft) {
  const cols = d.columns;
  const x0 = colX(d, i);
  const total = cols[i].w + cols[i + 1].w;
  const w = clamp(Math.round(xLeft - x0), MIN_COL, total - MIN_COL);
  cols[i].w = w; cols[i + 1].w = total - w;
}

export function colX(d, i) {
  let x = d.t;
  for (let j = 0; j < i; j++) x += d.columns[j].w + d.t;
  return x;
}

// modules: [{x0, x1, c0, c1}]
export function modules(d) {
  const out = []; let x0 = 0, c0 = 0;
  d.columns.forEach((c, i) => {
    if (c.brk || i === d.columns.length - 1) {
      const x1 = colX(d, i) + c.w + d.t;
      out.push({ x0, x1, c0, c1: i }); x0 = x1; c0 = i + 1;
    }
  });
  return out;
}

export function cellY(d, ci, k) {
  const cells = d.columns[ci].cells;
  let top = colTop(d, ci);
  for (let j = 0; j < k; j++) top -= cells[j].h + d.t;
  return { top, bot: top - cells[k].h };
}

// Welke cel bepaalt het front voor cel k (k zelf of een overspannende cel erboven)
export function frontOwner(col, k) {
  let j = 0;
  while (j < col.cells.length) {
    const c = col.cells[j];
    if (k >= j && k < j + c.span) return j;
    j += c.span;
  }
  return k;
}

// ---------- materialen ----------
export function grainOn(d, type) {
  if (d.grain && type in d.grain) return !!d.grain[type];
  return !!(MATERIALS[type] || MATERIALS.berken).grain;
}

export function matInfo(m) {
  const base = MATERIALS[m.type] || MATERIALS.berken;
  return { ...base, key: m.type, color: base.paint ? m.color : base.color };
}

export function matLabel(m, t) {
  const info = MATERIALS[m.type] || MATERIALS.berken;
  return `${info.label}${info.paint ? ' ' + colorName(m.color) : ''} ${t} mm`;
}

export function colorName(hex) {
  const p = PALETTE.find(p => p.hex.toLowerCase() === (hex || '').toLowerCase());
  return p ? p.name : (hex || '').toUpperCase();
}
