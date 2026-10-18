// DXF (R12, ASCII) export van de zaagplaten met contouren, boorgaten en nummering.
// Laag-conventie:
//   PLAAT        – omtrek van de ruwe plaat
//   SNIJ         – buitencontour van elk onderdeel (gesloten polyline)
//   BOOR_A_D8    – deuvelgat Ø8 aan de zichtbare zijde (zoals getekend)
//   BOOR_B_D8    – deuvelgat Ø8 aan de achterzijde (gespiegeld boren)
//   BOOR_A_D5 / BOOR_B_D5 – gaatjesrij planksteunen Ø5
//   POT_B_D35    – scharnierpot Ø35 (achterzijde front)
//   TEKST        – nummers, maten en nerfrichting

const LAYERS = [
  ['PLAAT', 8], ['SNIJ', 7], ['BOOR_A_D8', 1], ['BOOR_B_D8', 6],
  ['BOOR_A_D5', 5], ['BOOR_B_D5', 4], ['BOOR_A_D6', 1], ['BOOR_B_D6', 6], ['POT_A_D35', 30], ['POT_B_D35', 30], ['TEKST', 3],
];

class Dxf {
  constructor() { this.out = []; }
  g(code, val) { this.out.push(String(code), String(val)); }
  poly(layer, pts) {
    this.g(0, 'POLYLINE'); this.g(8, layer); this.g(66, 1); this.g(10, 0); this.g(20, 0); this.g(30, 0); this.g(70, 1);
    for (const [x, y] of pts) { this.g(0, 'VERTEX'); this.g(8, layer); this.g(10, f(x)); this.g(20, f(y)); this.g(30, 0); }
    this.g(0, 'SEQEND'); this.g(8, layer);
  }
  line(layer, x1, y1, x2, y2) {
    this.g(0, 'LINE'); this.g(8, layer); this.g(10, f(x1)); this.g(20, f(y1)); this.g(30, 0); this.g(11, f(x2)); this.g(21, f(y2)); this.g(31, 0);
  }
  circle(layer, x, y, r) { this.g(0, 'CIRCLE'); this.g(8, layer); this.g(10, f(x)); this.g(20, f(y)); this.g(30, 0); this.g(40, f(r)); }
  text(layer, x, y, h, s, rot = 0, center = true) {
    this.g(0, 'TEXT'); this.g(8, layer); this.g(10, f(x)); this.g(20, f(y)); this.g(30, 0); this.g(40, f(h)); this.g(1, s);
    if (rot) this.g(50, f(rot));
    if (center) { this.g(72, 1); this.g(11, f(x)); this.g(21, f(y)); this.g(31, 0); this.g(73, 2); }
  }
  toString() {
    const head = [];
    const G = (c, v) => head.push(String(c), String(v));
    G(0, 'SECTION'); G(2, 'HEADER'); G(9, '$ACADVER'); G(1, 'AC1009'); G(9, '$INSUNITS'); G(70, 4); G(0, 'ENDSEC');
    G(0, 'SECTION'); G(2, 'TABLES');
    G(0, 'TABLE'); G(2, 'LTYPE'); G(70, 1);
    G(0, 'LTYPE'); G(2, 'CONTINUOUS'); G(70, 0); G(3, 'Solid line'); G(72, 65); G(73, 0); G(40, 0);
    G(0, 'ENDTAB');
    G(0, 'TABLE'); G(2, 'LAYER'); G(70, LAYERS.length);
    for (const [n, c] of LAYERS) { G(0, 'LAYER'); G(2, n); G(70, 0); G(62, c); G(6, 'CONTINUOUS'); }
    G(0, 'ENDTAB'); G(0, 'ENDSEC');
    G(0, 'SECTION'); G(2, 'ENTITIES');
    return [...head, ...this.out, '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
  }
}

const f = v => (Math.round(v * 1000) / 1000).toString();
const ascii = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×/g, 'x').replace(/–/g, '-').replace(/Ø/g, 'D').replace(/[^\x20-\x7E]/g, '');

export function buildDxf(nestGroups, sheet, projectName) {
  const dx = new Dxf();
  let ox = 0;
  const gap = 300;
  dx.text('TEKST', 0, sheet.W + 260, 60, ascii(projectName || 'Ontwerp'), 0, false);
  for (const g of nestGroups) {
    g.sheets.forEach((s, si) => {
      dx.poly('PLAAT', [[ox, 0], [ox + sheet.L, 0], [ox + sheet.L, sheet.W], [ox, sheet.W]]);
      dx.text('TEKST', ox, sheet.W + 80, 40, ascii(`Plaat ${si + 1}/${g.sheets.length} - ${g.label} - ${sheet.L}x${sheet.W}`), 0, false);
      for (const q of s.placed) drawPart(dx, q, ox, g.grain);
      ox += sheet.L + gap;
    });
  }
  return dx.toString();
}

function drawPart(dx, q, ox, grain) {
  const p = q.p, L = p.size.L, B = p.size.B;
  const X = (u, v) => q.rot ? ox + q.x + (B - v) : ox + q.x + u;
  const Y = (u, v) => q.rot ? q.y + u : q.y + v;
  dx.poly('SNIJ', p.outline.map(([u, v]) => [X(u, v), Y(u, v)]));
  for (const h of p.holes) {
    const { u, v } = h;
    const side = h.dir > 0 ? 'A' : 'B';
    const layer = h.kind === 'pot' ? `POT_${side}_D35` : `BOOR_${side}_D${h.d}`;
    dx.circle(layer, X(u, v), Y(u, v), h.d / 2);
  }
  const cx = ox + q.x + q.w / 2, cy = q.y + q.h / 2;
  const rot = q.h > q.w * 1.6 ? 90 : 0;
  const short = Math.min(q.w, q.h);
  const th = Math.max(14, Math.min(60, short * 0.22));
  dx.text('TEKST', cx, cy + (rot ? 0 : th * 0.35), th, String(p.num), rot);
  const sub = ascii(`${p.name} ${Math.round(L)}x${Math.round(B)}${p.notes && p.notes.length ? ' - ' + p.notes.join(', ') : ''}`);
  const sh = Math.max(7, Math.min(18, short * 0.08));
  if (rot) dx.text('TEKST', cx + th * 0.9, cy, sh, sub, 90);
  else dx.text('TEKST', cx, cy - th * 0.75, sh, sub, 0);
  if (grain) {
    // nerfpijl langs u
    const a = Math.min(120, L * 0.25), v0 = Math.min(30, B * 0.2);
    const [x1, y1, x2, y2] = [X(L / 2 - a / 2, v0), Y(L / 2 - a / 2, v0), X(L / 2 + a / 2, v0), Y(L / 2 + a / 2, v0)];
    dx.line('TEKST', x1, y1, x2, y2);
    const hx = q.rot ? 0 : -10, hy = q.rot ? -10 : 0;
    dx.line('TEKST', x2, y2, x2 + hx + (q.rot ? 6 : 0), y2 + hy + (q.rot ? 0 : 6));
    dx.line('TEKST', x2, y2, x2 + hx - (q.rot ? 6 : 0), y2 + hy - (q.rot ? 0 : 6));
  }
}
