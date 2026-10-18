// PDF-overzicht: axonometrie, vooraanzicht en zijaanzicht met maatvoering,
// beslaglijst, frontenlijst, zaaglijst en zaagplannen.
import { jsPDF } from 'jspdf';
import { MATERIALS, FINISHES, HANDLE_TYPES, FRONT_TYPES, colorName, plinthH, grainOn, JOINERY } from './model.js';
import { estimate, euro, SERVICES } from './costs.js';

const PW = 297, PH = 210, M = 14;
const INK = [35, 34, 32], MUTED = [139, 134, 124], LINE = [210, 205, 195], ACC = [201, 115, 58];

export async function exportPdf(d, geo, nest, { axo }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: d.name, creator: 'Meubel-configurator' });
  const date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  let page = 0;
  const pages = [];
  const header = (title) => {
    if (page++) doc.addPage();
    pages.push(title);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text(clean(d.name), M, M + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`${title}  ·  ${d.W} × ${d.H} × ${d.D + d.t} mm  ·  ${date}`, M, M + 10);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, M + 13, PW - M, M + 13);
  };

  // ---------- 1. overzicht ----------
  header('Overzicht');
  const imgW = 168, imgH = imgW * 1100 / 1500;
  doc.addImage(axo, 'PNG', M - 4, M + 18, imgW, imgH, undefined, 'FAST');
  const fronts = geo.parts.filter(p => p.group === 'front');
  const cnt = t => fronts.filter(p => p.meta.type === t).length;
  const cm = d.material.carcass, fm = d.material.same ? cm : d.material.fronts;
  const matTxt = m => `${MATERIALS[m.type].label}${MATERIALS[m.type].paint ? ', ' + colorName(m.color) : ''}`;
  const spec = [
    ['Buitenmaten (b × h × d)', `${d.W} × ${d.H} × ${d.D + d.t} mm`],
    ['Korpusdiepte', `${d.D} mm (incl. achterwand)`],
    ['Korpus', `${matTxt(cm)}, ${d.t} mm`],
    ['Fronten', `${matTxt(fm)}, ${d.t} mm, opgelegd`],
    ['Achterwand', d.back ? `${d.thinT} mm, opgelegd en geschroefd` : 'geen'],
    ['Sokkel', d.plinth.on ? `${d.plinth.h} mm hoog, ${d.plinth.setback} mm terug` : 'geen'],
    ['Indeling', `${d.columns.length} kolommen, ${d.columns.reduce((a, c) => a + c.cells.length, 0)} vakken`],
    ['Deuren', String(cnt('door-l') + cnt('door-r') + cnt('door-dbl'))],
    ['Lades', `${cnt('drawer')} lades, ${geo.parts.filter(p => p.name === 'Binnenlade bodem').length} binnenlades`],
    ['Kleppen', String(cnt('flap-up') + cnt('flap-down'))],
    ['Grepen', d.handle.type === 'push' ? 'Push-to-open' : `${HANDLE_TYPES[d.handle.type].label}, ${FINISHES[d.handle.finish].label}`],
    ['Verbindingen', JOINERY[d.joinery || 'deuvel'].label + (geo.seams?.length ? `, ${geo.seams.length} naad in blad/bodem` : '')],
    ['Plaatdelen', `${geo.parts.length} st, ${nest.reduce((a, n) => a + n.sheets.length, 0)} platen ${d.sheet.L} × ${d.sheet.W}`],
  ];
  let y = M + 24;
  const x0 = 186;
  for (const [k, v] of spec) {
    doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(k.toUpperCase(), x0, y);
    doc.setFontSize(9.5); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(clean(v), PW - M - x0);
    doc.text(lines, x0, y + 4.2);
    y += 6 + lines.length * 4.2;
  }
  if (geo.warnings.length) {
    y += 2; doc.setFontSize(8); doc.setTextColor(...ACC);
    for (const w of geo.warnings) { const l = doc.splitTextToSize('• ' + clean(w), PW - M - x0); doc.text(l, x0, y); y += l.length * 3.6; }
  }

  // ---------- kostenraming ----------
  header('Kostenraming en montage-uren');
  {
    const e = estimate(d, geo, nest);
    const half = (PW - 2 * M) / 2 - 5;
    let yy = M + 22;
    yy = table(doc, M, yy, [{ t: 'Plaatmateriaal', w: 70 }, { t: 'Platen', w: 16, a: 'right' }, { t: 'Per plaat', w: 24, a: 'right' }, { t: 'Totaal', w: 24, a: 'right' }],
      e.sheets.map(r => [r.label, String(r.qty), euro(r.unit), euro(r.total)]), header, 'Kostenraming (vervolg)', half);
    yy += 4;
    yy = table(doc, M, yy, [{ t: SERVICES[e.serviceMode].label, w: 86 }, { t: '', w: 24 }, { t: 'Totaal', w: 24, a: 'right' }],
      e.service.length ? e.service.map(r => [r.name, '', euro(r.total)]) : [['Geen', '', euro(0)]], header, 'Kostenraming (vervolg)', half);
    yy += 6;
    doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(M, yy, M + half, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text('Totaal (indicatief, incl. btw)', M, yy + 6); doc.text(euro(e.totals.all), M + half, yy + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`Plaat ${euro(e.totals.sheets)}  ·  beslag ${euro(e.totals.hw)}  ·  ${SERVICES[e.serviceMode].label.toLowerCase()} ${euro(e.totals.service)}`, M, yy + 12);
    doc.text(doc.splitTextToSize('Richtprijzen, aanpasbaar in de configurator. Exclusief lakwerk/olie, kantenband en transport.', half), M, yy + 17);
    // uren
    let y2 = yy + 30;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(`Montage: ± ${Math.ceil(e.hours.total * 2) / 2} uur`, M, y2); doc.setFont('helvetica', 'normal');
    y2 = table(doc, M, y2 + 6, [{ t: 'Onderdeel werk', w: 110 }, { t: 'Uren', w: 24, a: 'right' }], e.hours.lines.map(l => [l.name, l.h.toFixed(1)]), header, 'Montage-uren (vervolg)', half);
    // beslag rechts
    table(doc, M + half + 10, M + 22, [{ t: 'Beslag', w: 76 }, { t: 'Aantal', w: 14, a: 'right' }, { t: 'Per st.', w: 20, a: 'right' }, { t: 'Totaal', w: 22, a: 'right' }],
      e.hw.map(r => [r.name, String(r.qty), euro(r.unit), euro(r.total)]), header, 'Kostenraming (vervolg)', half);
  }

  // ---------- 2. aanzichten ----------
  header('Aanzichten en maatvoering');
  drawViews(doc, d, geo);

  // ---------- 3. beslag & fronten ----------
  header('Beslag en onderdelen');
  y = M + 22;
  y = table(doc, M, y, [{ t: 'Beslag / onderdeel', w: 140 }, { t: 'Aantal', w: 20, a: 'right' }],
    geo.hardware.map(h => [h.name, `${h.qty}`]), header, 'Beslag en onderdelen (vervolg)');
  const fr = fronts.map(p => [String(p.num), `${FRONT_TYPES[p.meta.type].label}${p.meta.type === 'door-dbl' ? (p.meta.hinge === 'l' ? ' (links)' : ' (rechts)') : ''}`,
    `K${p.meta.col + 1} · vak ${p.meta.k0 + 1}${p.meta.k1 > p.meta.k0 ? '–' + (p.meta.k1 + 1) : ''}`, `${Math.round(p.box[1] - p.box[0])} × ${Math.round(p.box[3] - p.box[2])}`]);
  if (fr.length) {
    y += 8;
    if (y > PH - 40) { header('Fronten'); y = M + 22; }
    table(doc, M, y, [{ t: 'Nr', w: 12 }, { t: 'Front', w: 60 }, { t: 'Positie', w: 40 }, { t: 'b × h (mm)', w: 48, a: 'right' }], fr, header, 'Fronten (vervolg)');
  }

  // ---------- 4. zaaglijst ----------
  header('Zaaglijst');
  const rows = geo.parts.map(p => [String(p.num), p.name + (p.notes?.length ? ` (${p.notes.join(', ')})` : ''), `${fmt(p.size.L)}`, `${fmt(p.size.B)}`, `${p.size.T}`,
    shortMat(p), grainOn(d, p.mat.type) ? 'L' : '–', String(p.holes.filter(h => h.kind !== 'pin').length || ''), String(p.holes.filter(h => h.kind === 'pin').length || '')]);
  table(doc, M, M + 22, [
    { t: 'Nr', w: 12 }, { t: 'Onderdeel', w: 84 }, { t: 'Lengte', w: 22, a: 'right' }, { t: 'Breedte', w: 22, a: 'right' }, { t: 'Dikte', w: 16, a: 'right' },
    { t: 'Materiaal', w: 52 }, { t: 'Nerf', w: 12, a: 'center' }, { t: 'Boorgaten', w: 22, a: 'right' }, { t: 'Gaatjesrij', w: 22, a: 'right' },
  ], rows, header, 'Zaaglijst (vervolg)');
  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('Lengte = langs de nerf. Maten zijn netto zaagmaten in mm. Boorgaten: deuvels Ø8 en scharnierpotten Ø35, zie DXF voor posities.', M, PH - 8);

  // ---------- 5. zaagplannen ----------
  for (const g of nest) g.sheets.forEach((s, i) => {
    header(`Zaagplan · ${g.label} · plaat ${i + 1}/${g.sheets.length}`);
    drawSheet(doc, d.sheet, s, g.grain);
  });

  // paginanummers
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${i} / ${total}`, PW - M, PH - 8, { align: 'right' });
  }
  return doc.output('blob');
}

const fmt = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
const clean = s => String(s).replace(/≡|●|→|↕|↔/g, '');
function shortMat(p) {
  const m = MATERIALS[p.mat.type];
  return clean(`${m.label}${m.paint ? ' (' + colorName(p.mat.color) + ')' : ''}`);
}

function table(doc, x, y, cols, rows, header, contTitle, maxW) {
  const rowH = 5.4;
  const W = cols.reduce((a, c) => a + c.w, 0);
  const scale = maxW && W > maxW ? maxW / W : 1;
  cols = cols.map(c => ({ ...c, w: c.w * scale }));
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    let cx = x;
    for (const c of cols) { doc.text(c.t.toUpperCase(), c.a === 'right' ? cx + c.w - 1.5 : c.a === 'center' ? cx + c.w / 2 : cx + 1.5, y, { align: c.a || 'left' }); cx += c.w; }
    y += 2; doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(x, y, x + cols.reduce((a, c) => a + c.w, 0), y); y += 4;
    doc.setFont('helvetica', 'normal');
  };
  head();
  for (const r of rows) {
    if (y > PH - 16) { header(contTitle); y = M + 22; head(); }
    doc.setFontSize(8.5); doc.setTextColor(...INK);
    let cx = x;
    r.forEach((v, i) => {
      const c = cols[i];
      const txt = doc.splitTextToSize(clean(v), c.w - 3)[0];
      doc.text(txt, c.a === 'right' ? cx + c.w - 1.5 : c.a === 'center' ? cx + c.w / 2 : cx + 1.5, y, { align: c.a || 'left' });
      cx += c.w;
    });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(x, y + 1.8, cx, y + 1.8);
    y += rowH;
  }
  return y;
}

// ---------- aanzichten ----------
function drawViews(doc, d, geo) {
  const dm = geo.dims, tf = dm.tf;
  const DD = d.D + tf;
  const areaX = M + 18, areaY = M + 30, areaW = PW - 2 * M - 30, areaH = PH - areaY - 26;
  const gap = 260;
  const s = Math.min(areaW / (d.W + gap + DD + 200), areaH / (d.H + 260));
  const ox = areaX + 10, oy = areaY + areaH - 12; // vloer
  const X = x => ox + x * s, Y = y => oy - y * s;

  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`VOORAANZICHT  1:${niceScale(s)}`, X(0), M + 21);

  // korpus
  doc.setDrawColor(...INK);
  const rect = (b, lw, fill) => {
    doc.setLineWidth(lw);
    doc.rect(X(b[0]), Y(b[3]), (b[1] - b[0]) * s, (b[3] - b[2]) * s, fill ? 'FD' : 'S');
  };
  const shape = (p, lw, fill) => {
    if (!p.prism) return rect(p.box, lw, fill);
    doc.setLineWidth(lw);
    const pts = p.prism.poly.map(([x, y]) => [X(x), Y(y)]);
    const rel = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]);
    doc.lines(rel, pts[0][0], pts[0][1], [1, 1], fill ? 'FD' : 'S', true);
  };
  doc.setFillColor(255, 255, 255);
  for (const p of geo.parts) if (p.group === 'korpus' || p.group === 'plint') shape(p, 0.2);
  // fronten
  for (const p of geo.parts.filter(q => q.group === 'front')) {
    shape(p, 0.35, true);
    const b = p.box, h = p.meta.hinge;
    if (h) {
      doc.setLineDashPattern([1.2, 1], 0); doc.setLineWidth(0.15);
      const [x0, x1, y0, y1] = [X(b[0]), X(b[1]), Y(b[2]), Y(b[3])];
      // bovenrand van het front (bij geknipte fronten de schuine lijn)
      const topAt = xm => {
        if (!p.prism) return b[3];
        const tops = p.prism.poly.slice(2).slice().sort((a2, b2) => a2[0] - b2[0]);
        for (let i = 0; i < tops.length - 1; i++) if (xm >= tops[i][0] - 0.01 && xm <= tops[i + 1][0] + 0.01) { const f = (xm - tops[i][0]) / ((tops[i + 1][0] - tops[i][0]) || 1); return tops[i][1] + (tops[i + 1][1] - tops[i][1]) * f; }
        return b[3];
      };
      const yL = Y(topAt(b[0])), yR = Y(topAt(b[1]));
      if (h === 'l') { const ym = (y0 + Y(topAt(b[0]))) / 2; doc.line(x1, yR, x0, ym); doc.line(x1, y0, x0, ym); }
      if (h === 'r') { const ym = (y0 + Y(topAt(b[1]))) / 2; doc.line(x0, yL, x1, ym); doc.line(x0, y0, x1, ym); }
      if (h === 't') { doc.line(x0, y0, (x0 + x1) / 2, y1); doc.line(x1, y0, (x0 + x1) / 2, y1); }
      if (h === 'b') { doc.line(x0, y1, (x0 + x1) / 2, y0); doc.line(x1, y1, (x0 + x1) / 2, y0); }
      doc.setLineDashPattern([], 0);
    }
  }
  // grepen
  doc.setFillColor(...INK);
  for (const h of geo.handles) {
    let w = 10, hh = 10;
    if (h.type === 'staaf') { w = 10; hh = 176; } else if (h.type === 'plat') { w = 20; hh = 140; }
    if (h.type === 'knop') { doc.circle(X(h.x), Y(h.y), 12 * s, 'F'); continue; }
    if (h.type === 'kant' || h.type === 'lijst') {
      const drop = h.type === 'lijst' ? 22 : 18;
      const yA = h.edge === 'top' ? h.y + 3 : h.y - 3, yB = h.edge === 'top' ? h.y + 3 - drop : h.y - 3 + drop;
      doc.rect(X(h.x - h.len / 2), Y(Math.max(yA, yB)), h.len * s, Math.abs(yA - yB) * s, 'F'); continue;
    }
    if (h.orient === 'h') [w, hh] = [hh, w];
    doc.rect(X(h.x - w / 2), Y(h.y + hh / 2), w * s, hh * s, 'F');
  }
  // garderobestang
  for (const r of geo.rails) { doc.setLineWidth(0.5); doc.line(X(r.x0 + 5), Y(r.y), X(r.x1 - 5), Y(r.y)); }
  // vloer
  doc.setLineWidth(0.5); doc.line(X(-150), Y(0), X(d.W + gap + DD + 150), Y(0));

  // vakmaten in de vakken
  doc.setFontSize(6.5); doc.setTextColor(...MUTED);
  for (const c of geo.picks) {
    const h = c.y1 - c.y0; if (h * s < 4) continue;
    doc.text(String(Math.round(h)), X((c.x0 + c.x1) / 2), Y((c.y0 + c.y1) / 2) + 1, { align: 'center' });
  }
  // maatlijnen
  doc.setTextColor(...INK);
  dimH(doc, X(0), X(d.W), Y(d.H) - 12, String(d.W));
  const xs = [0, ...geo.picks.filter(q => q.k === 0).flatMap(q => [q.x0, q.x1]), d.W].sort((a, b) => a - b);
  const chainX = []; for (const x of xs) if (!chainX.length || Math.abs(chainX[chainX.length - 1] - x) > 0.5) chainX.push(x);
  for (let i = 0; i < chainX.length - 1; i++) {
    const a = chainX[i], b = chainX[i + 1];
    dimH(doc, X(a), X(b), Y(0) + 8, (b - a) * s > 6 ? String(Math.round(b - a)) : '', true);
  }
  const prof = geo.dims.profile;
  dimV(doc, X(0) - 9, Y(0), Y(prof[0][1]), String(prof[0][1]));
  if (geo.dims.shaped) {
    doc.setFontSize(6.5); doc.setTextColor(...ACC);
    prof.forEach(([x, y], i) => { doc.circle(X(x), Y(y), 0.7, 'S'); doc.text(`P${i + 1} (${x}, ${y})`, X(x), Y(y) - 2.2, { align: i === 0 ? 'left' : i === prof.length - 1 ? 'right' : 'center' }); });
    doc.setTextColor(...INK);
  }
  // rechts: ketting laatste kolom + sokkel
  const last = d.columns.length - 1;
  const ys = [0]; const P = plinthH(d);
  if (P) ys.push(P);
  geo.picks.filter(q => q.col === last).forEach(q => ys.push(q.y0, q.y1));
  ys.push(geo.dims.profile[geo.dims.profile.length - 1][1]);
  const chainY = [...new Set(ys.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  for (let i = 0; i < chainY.length - 1; i++) {
    const a = chainY[i], b = chainY[i + 1];
    dimV(doc, X(d.W) + 7, Y(a), Y(b), (b - a) * s > 5 ? String(Math.round(b - a)) : '', true, true);
  }

  // ---------- zijaanzicht ----------
  const sx = d.W + gap; // x-positie (mm) van zijaanzicht
  const Z = z => X(sx + z);
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('ZIJAANZICHT', Z(0), M + 21);
  doc.setDrawColor(...INK);
  const sideRect = (z0, z1, y0, y1, lw = 0.3) => { doc.setLineWidth(lw); doc.rect(Z(z0), Y(y1), (z1 - z0) * s, (y1 - y0) * s); };
  sideRect(dm.zB, dm.zF, 0, d.H - d.t, 0.35);          // zijwand
  sideRect(dm.zB, dm.zF, d.H - d.t, d.H, 0.25);        // blad
  if (d.back) sideRect(0, dm.bt, P, d.H, 0.25);
  if (P && d.plinth.on) { doc.setLineDashPattern([1, 0.8], 0); sideRect(dm.zF - d.plinth.setback - d.t, dm.zF - d.plinth.setback, 0, P, 0.15); doc.setLineDashPattern([], 0); }
  // fronten in doorsnede (kopse kant)
  for (const p of geo.parts.filter(q => q.group === 'front')) sideRect(dm.zF, dm.zF + tf, p.box[2], p.box[3], 0.3);
  doc.setTextColor(...INK);
  dimH(doc, Z(0), Z(DD), Y(d.H) - 8, String(DD));
  dimH(doc, Z(0), Z(d.D), Y(0) + 8, String(d.D), true);
  if (P) dimV(doc, Z(DD) + 7, Y(0), Y(P), String(P), true, true);
}

function niceScale(s) {
  // s = mm papier per mm werkelijk
  const r = 1 / s; const opts = [5, 10, 15, 20, 25, 30, 40, 50];
  return opts.find(o => o >= r) || Math.round(r);
}

function tick(doc, x, y) { doc.setLineWidth(0.35); doc.line(x - 1, y + 1, x + 1, y - 1); }
function dimH(doc, x1, x2, y, label, below = false) {
  doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.15);
  doc.line(x1, y, x2, y);
  doc.line(x1, y - 1.8, x1, y + 1.8); doc.line(x2, y - 1.8, x2, y + 1.8);
  tick(doc, x1, y); tick(doc, x2, y);
  doc.setFontSize(7); doc.setTextColor(...INK);
  if (label) doc.text(label, (x1 + x2) / 2, below ? y + 3.6 : y - 1.2, { align: 'center' });
}
function dimV(doc, x, y1, y2, label, small = false, right = false) {
  doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.15);
  doc.line(x, y1, x, y2);
  doc.line(x - 1.8, y1, x + 1.8, y1); doc.line(x - 1.8, y2, x + 1.8, y2);
  tick(doc, x, y1); tick(doc, x, y2);
  doc.setFontSize(small ? 6.5 : 7); doc.setTextColor(...INK);
  if (label) {
    if (right) doc.text(label, x + 1.6, (y1 + y2) / 2 + 1, { align: 'left' });
    else doc.text(label, x - 1.4, (y1 + y2) / 2, { angle: 90, align: 'center' });
  }
}

// ---------- zaagplan ----------
function drawSheet(doc, sheet, s, grain) {
  const areaW = PW - 2 * M, areaH = PH - M - 30 - 16;
  const sc = Math.min(areaW / sheet.L, areaH / sheet.W);
  const ox = M, oy = M + 22;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3); doc.setFillColor(244, 241, 235);
  doc.rect(ox, oy, sheet.L * sc, sheet.W * sc, 'FD');
  for (const q of s.placed) {
    const x = ox + q.x * sc, y = oy + q.y * sc, w = q.w * sc, h = q.h * sc;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...INK); doc.setLineWidth(0.3);
    doc.rect(x, y, w, h, 'FD');
    const fs = Math.max(5, Math.min(13, Math.min(w, h) * 0.5));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(...INK);
    doc.text(String(q.p.num), x + w / 2, y + h / 2 + fs * 0.12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    if (Math.min(w, h) > 9 && w > 22) {
      doc.setFontSize(6); doc.setTextColor(...MUTED);
      doc.text(`${fmt(q.p.size.L)} × ${fmt(q.p.size.B)}`, x + w / 2, y + h / 2 + fs * 0.12 + 3.4, { align: 'center' });
    }
    if (grain) { // nerfpijl
      doc.setDrawColor(...MUTED); doc.setLineWidth(0.15);
      const a = Math.min(8, (q.rot ? h : w) * 0.3);
      if (!q.rot) { doc.line(x + 2, y + 2.5, x + 2 + a, y + 2.5); doc.line(x + 2 + a, y + 2.5, x + a, y + 1.6); doc.line(x + 2 + a, y + 2.5, x + a, y + 3.4); }
    }
  }
  doc.setFontSize(8.5); doc.setTextColor(...INK);
  doc.text(`${sheet.L} × ${sheet.W} mm  ·  ${s.placed.length} delen  ·  benutting ${Math.round(s.used * 100)}%  ·  zaagsnede ${sheet.kerf} mm, randmarge ${sheet.margin} mm${grain ? '  ·  nerf in lengterichting van de plaat' : ''}`,
    ox, oy + sheet.W * sc + 6);
}
