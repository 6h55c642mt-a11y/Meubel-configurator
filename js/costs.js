// Kostenraming (richtprijzen, instelbaar) en geschatte montage-uren.
import { MATERIALS } from './model.js';

// richtprijs per plaat 2500 × 1250 × 18 mm, incl. btw, NL 2026 (indicatief)
const SHEET_BASE = { berken: 125, populier: 70, eiken: 145, noten: 195, multiplex_kleur: 125, mdf_kleur: 42 };

// richtprijzen beslag per stuk (of per paar/set zoals in de naam)
const HW_PRICES = [
  [/Deuvel.*Ø8/, 0.06], [/Deuvel.*Ø6/, 0.05], [/Confirmat/, 0.18], [/Cabineo/, 1.35], [/Clamex/, 2.6],
  [/Werkbladverbinder/, 3.5], [/Verbindingslat/, 2], [/Schroef 3,5/, 0.03],
  [/Potscharnier.*/, 4.5], [/Ladegeleider.*push/, 32], [/Ladegeleider/, 19],
  [/Kleplift/, 38], [/Klepsteun/, 16], [/Push-to-open drukschakelaar/, 4.5],
  [/Planksteun/, 0.15], [/Garderobestang/, 9], [/stangdrager/i, 2.5], [/Opvullat/, 1],
  [/Meubelglijder/, 0.4], [/Staafgreep/, 7], [/Greeplijst/, 14], [/Kantgreep/, 9], [/Platte greep/, 8], [/Knop/, 4.5],
];

export const SERVICES = {
  cnc:   { label: 'CNC-service', setup: 35, perSheet: 6, perMeter: 1.4, perHole: 0.15 },
  zagen: { label: 'Zaagservice', setup: 0, perSheet: 4, perMeter: 0.9, perHole: 0 },
  zelf:  { label: 'Zelf zagen', setup: 0, perSheet: 0, perMeter: 0, perHole: 0 },
};

export function sheetKey(type, t) { return `${type}|${t}`; }

export function defaultSheetPrice(d, type, t) {
  const base = SHEET_BASE[type] ?? 100;
  const area = (d.sheet.L * d.sheet.W) / (2500 * 1250);
  return Math.round(base * Math.pow(t / 18, 0.8) * area);
}
export function sheetPrice(d, type, t) {
  const o = d.prices?.sheet?.[sheetKey(type, t)];
  return o != null ? o : defaultSheetPrice(d, type, t);
}
export function defaultHwPrice(name) {
  const m = HW_PRICES.find(([re]) => re.test(name));
  return m ? m[1] : 5;
}
export function hwPrice(d, name) {
  const o = d.prices?.hw?.[name];
  return o != null ? o : defaultHwPrice(name);
}
export function serviceRates(d) {
  const mode = d.prices?.service?.mode || 'cnc';
  return { mode, ...SERVICES[mode], ...(d.prices?.service?.rates?.[mode] || {}) };
}

const perim = p => { let s = 0; const o = p.outline; for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; };

export function estimate(d, geo, nest) {
  const sheets = nest.map(g => {
    const [type, t] = g.key.split('|');
    const unit = sheetPrice(d, type, +t);
    return { key: g.key, label: g.label, qty: g.sheets.length, unit, total: unit * g.sheets.length };
  });
  const hw = geo.hardware.map(h => { const unit = hwPrice(d, h.name); return { name: h.name, qty: h.qty, unit, total: unit * h.qty }; });
  const sr = serviceRates(d);
  const meters = geo.parts.reduce((a, p) => a + perim(p), 0) / 1000;
  const holes = geo.parts.reduce((a, p) => a + p.holes.length, 0);
  const nSheets = sheets.reduce((a, s) => a + s.qty, 0);
  const service = [
    { name: 'Opstart / programmeren', qty: sr.setup ? 1 : 0, unit: sr.setup, total: sr.setup },
    { name: 'Per plaat', qty: nSheets, unit: sr.perSheet, total: nSheets * sr.perSheet },
    { name: `Zaag-/freesweg ${meters.toFixed(1)} m`, qty: meters, unit: sr.perMeter, total: meters * sr.perMeter },
    { name: `Boringen (${holes} gaten)`, qty: holes, unit: sr.perHole, total: holes * sr.perHole },
  ].filter(l => l.total > 0);
  const sum = a => a.reduce((x, l) => x + l.total, 0);
  const totals = { sheets: sum(sheets), hw: sum(hw), service: sum(service) };
  totals.all = totals.sheets + totals.hw + totals.service;
  return { sheets, hw, service, serviceMode: sr.mode, totals, hours: hours(d, geo, sr.mode), meters, holes };
}

// grove urenschatting voor één persoon met ervaring, excl. lakken/afwerken
export function hours(d, geo, mode) {
  const parts = geo.parts;
  const kinds = k => parts.reduce((a, p) => a + p.holes.filter(h => h.kind === k).length, 0);
  const drawers = new Set(parts.filter(p => p.group === 'lade').map(p => p.meta.drawer)).size;
  const fronts = parts.filter(p => p.group === 'front');
  const doors = fronts.filter(p => p.meta.type !== 'drawer').length;
  const bevels = parts.reduce((a, p) => a + (p.bevels?.length || 0), 0);
  const L = [];
  const add = (name, min) => { if (min > 0) L.push({ name, h: min / 60 }); };
  if (mode === 'zelf') add('Zagen van de platen', parts.length * 6 + 30);
  add('Schuren en kanten breken', parts.length * 4);
  const dw = kinds('deuvel'), cf = kinds('confirmat'), cb = kinds('cab-pilot');
  if (dw) add(`Deuvels: kopse gaten boren met mal, lijmen (${dw})`, dw * (mode === 'cnc' ? 2.5 : 4));
  if (cf) add(`Confirmat voorboren en schroeven (${cf})`, cf * (mode === 'cnc' ? 1.5 : 3));
  if (cb) add(`Cabineo plaatsen (${cb})`, cb * 1);
  if (dw) add('Korpus lijmen en klemmen', 45);
  else add('Korpus in elkaar zetten', 25);
  if (mode !== 'cnc' && (cf || cb)) add('Verbindingen aftekenen', 30);
  if (bevels) add(`Schuine sneden (${bevels})`, bevels * (mode === 'zelf' ? 12 : 4));
  if (geo.seams?.length) add('Naden bovenblad/bodem', geo.seams.length * 25);
  if (d.back) add('Achterwand haaks zetten en schroeven', 25);
  if (drawers) add(`Ladebakken maken en plaatsen (${drawers})`, drawers * 40);
  if (doors) add(`Scharnieren, deuren hangen en afstellen (${doors})`, doors * (mode === 'cnc' ? 15 : 25));
  if (geo.handles.length) add(`Grepen boren en monteren (${geo.handles.length})`, geo.handles.length * 6);
  if (geo.rails.length) add('Garderobestangen', geo.rails.length * 10);
  const total = L.reduce((a, l) => a + l.h, 0);
  return { lines: L, total };
}

export const euro = v => '€ ' + v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const matLabelShort = type => MATERIALS[type]?.label || type;
