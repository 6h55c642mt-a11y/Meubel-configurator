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
export const innerW = d => d.W - 2 * d.t;
export const innerH = d => d.H - 2 * d.t - plinthH(d);

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
  const t = d.t;
  const n = d.columns.length;
  const ws = fitInts(d.columns.map(c => c.w), innerW(d) - (n - 1) * t, MIN_COL);
  d.columns.forEach((c, i) => { c.w = ws[i]; });
  const ih = innerH(d);
  for (const col of d.columns) {
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
  }
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
  const h = (innerH(d) - (m - 1) * d.t) / m;
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
  const h = (innerH(d) - (m - 1) * d.t) / m;
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

export function cellY(d, ci, k) {
  const cells = d.columns[ci].cells;
  let top = d.H - d.t;
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
