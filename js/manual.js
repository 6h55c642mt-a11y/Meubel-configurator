// Montagehandleiding in IKEA-stijl: onderdelen, beslag, gereedschap en genummerde stappen
// met 3D-lijntekeningen (nieuwe onderdelen geaccentueerd) en detailtekeningen.
import { jsPDF } from 'jspdf';
import { HANDLE_TYPES } from './model.js';
import { drawPrep, drawGlossary } from './prep.js';

const PW = 297, PH = 210, M = 12;
const INK = [30, 30, 30], MUTED = [130, 126, 118], ACC = [201, 115, 58], PALE = [242, 201, 168], LINE = [215, 210, 200];

export async function buildManual(d, geo, viewer, progress = () => {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${d.name} – montagehandleiding`, creator: 'Meubel-configurator' });
  const parts = geo.parts;
  const byNum = new Map(parts.map(p => [p.num, p]));
  const is = {
    side: p => p.name.startsWith('Zijwand'),
    bottom: p => p.name.startsWith('Bodem'),
    divider: p => p.meta?.drag === 'divider',
    shelf: p => p.meta?.drag === 'shelf' && !p.meta.loose,
    loose: p => p.meta?.drag === 'shelf' && p.meta.loose,
    top: p => p.meta?.role === 'top',
    plinth: p => p.group === 'plint',
    back: p => p.group === 'achterwand',
    drawerFront: p => p.group === 'front' && p.meta.type === 'drawer',
    door: p => p.group === 'front' && p.meta.type !== 'drawer',
    box: p => p.group === 'lade' && !p.meta.inner,
    innerBox: p => p.group === 'lade' && p.meta.inner,
  };
  const nums = f => parts.filter(f).map(p => p.num);
  const sides = parts.filter(is.side);
  const leftSides = sides.filter(p => p.name.includes('links')).map(p => p.num);
  const rightSides = sides.filter(p => p.name.includes('rechts')).map(p => p.num);
  const hwQty = re => geo.hardware.filter(h => re.test(h.name)).reduce((a, h) => a + h.qty, 0);
  const hwItems = re => geo.hardware.filter(h => re.test(h.name));

  // ---------- deuvels per stap: koppel elk gat aan het tegenstuk ----------
  const joints = [];
  for (const p of parts) for (const h of p.holes) {
    if (!['deuvel', 'confirmat', 'cab-pilot'].includes(h.kind)) continue;
    const n = p.frame.n, q = h.p.map((v, i) => v + n[i] * h.dir * 2);
    const mate = parts.find(o => o !== p && [0, 1, 2].every(i => q[i] > o.box[i * 2] + 0.01 && q[i] < o.box[i * 2 + 1] - 0.01));
    if (mate) joints.push({ a: p.num, b: mate.num, d: h.d, kind: h.kind });
  }
  const counted = new Set();
  const dowelsFor = (present, added) => {
    let c8 = 0, c6 = 0;
    joints.forEach((j, i) => {
      if (counted.has(i)) return;
      if (present.has(j.a) && present.has(j.b) && (added.has(j.a) || added.has(j.b))) { counted.add(i); j.d === 6 && j.kind === 'deuvel' ? c6++ : c8++; }
    });
    return { c8, c6 };
  };

  // ---------- stappen ----------
  const steps = [];
  const present = new Set();
  const step = (title, addList, opts = {}) => {
    const add = new Set(addList.filter(Boolean));
    if (!add.size && !opts.always) return;
    add.forEach(n => present.add(n));
    const dw = opts.noDowels ? { c8: 0, c6: 0 } : dowelsFor(present, add);
    const hw = [...(opts.hw || [])];
    if (dw.c8) hw.unshift({ name: JL.name, qty: dw.c8, icon: JL.icon });
    if (dw.c6) hw.unshift({ name: 'Deuvel Ø6×30', qty: dw.c6, icon: 'deuvel' });
    steps.push({ title, add, visible: new Set(present), hw, text: opts.text || [], detail: opts.detail, cam: opts.cam, openAmt: opts.openAmt ?? 0, handles: !!opts.handles, rails: !!opts.rails, hlHandles: !!opts.hlHandles, mode: opts.mode });
  };

  const JS = geo.joinery || 'deuvel';
  const JL = {
    deuvel: { name: 'Deuvel Ø8×35', icon: 'deuvel', fix: 'Doe een beetje lijm in de gaten en sla de deuvels erin.', join: 'Lijm de deuvels en druk de delen op elkaar.' },
    confirmat: { name: 'Confirmat 7×50', icon: 'schroef', fix: 'Boor de kopse kanten voor met Ø5 door het gat in de zijwand.', join: 'Schroef de Confirmats vast met een inbusbit; niet te hard aandraaien.' },
    cabineo: { name: 'Lamello Cabineo 8', icon: 'verbinder', fix: 'Druk de Cabineo-verbinders in de gefreesde zakken.', join: 'Zet de delen tegen elkaar en draai de Cabineo-schroeven vast met de T20-bit.' },
  }[JS];
  const det = JS === 'deuvel' ? 'deuvel' : JS === 'confirmat' ? 'confirmat' : 'cabineo';
  step('Zijwand en plint', [...leftSides, ...nums(is.plinth)], {
    text: ['Leg de linker zijwand plat op een schone, zachte ondergrond met de gaten naar boven.', JL.fix, 'Plaats de plintdelen.' + (geo.seams?.length ? ' Lijm de verbindingslat achter de plintnaad.' : '')],
    detail: det,
  });
  step('Bodem', nums(is.bottom), {
    text: [JL.join + ' Plaats de bodem op de plint, tegen de zijwand.', ...(geo.seams?.length ? ['De bodem bestaat uit meerdere delen: koppel de naad met de naadverbinders voordat je verder gaat.'] : []), ...(JS === 'deuvel' ? ['Veeg uitgeperste lijm direct weg met een vochtige doek.'] : [])],
    detail: geo.seams?.length ? 'naad' : det,
    hw: geo.seams?.length ? geo.hardware.filter(h => /Clamex|Werkbladverbinder/.test(h.name)).map(h => ({ name: h.name.replace(/ \(.*\)/, ''), qty: Math.ceil(h.qty / 2), icon: 'verbinder' })) : [],
  });
  step('Tussenschotten', nums(is.divider), { text: ['Zet de tussenschotten op de bodem. ' + JL.join, 'Controleer met een winkelhaak of ze haaks staan.'], detail: 'haaks' });
  step('Vaste legplanken', nums(is.shelf), { text: ['Plaats de vaste legplanken tussen de zijwand en de schotten.', 'Werk van onder naar boven.'], detail: det });
  step('Zijwand rechts', rightSides, { text: ['Druk de rechter zijwand op alle planken en de bodem. ' + JL.join, ...(JS === 'deuvel' ? ['Gebruik lijmklemmen en laat ze zitten tot de lijm droog is.'] : [])], detail: JS === 'deuvel' ? 'klem' : det });
  step('Bovenblad', nums(is.top), {
    text: ['Plaats het bovenblad op de zijwanden en schotten. ' + JL.join,
      ...(geo.dims.shaped ? ['Schuine bladen: zet de verstekken eerst droog tegen elkaar. De zaaghoeken staan in de zaaglijst.'] : []),
      ...(geo.seams?.length ? ['Koppel de naad tussen de bladdelen met de naadverbinders.'] : []),
      ...(JS === 'deuvel' ? ['Klem vast en laat minstens een uur drogen.'] : [])],
    detail: geo.dims.shaped ? 'verstek' : geo.seams?.length ? 'naad' : det,
    hw: geo.seams?.length ? geo.hardware.filter(h => /Clamex|Werkbladverbinder/.test(h.name)).map(h => ({ name: h.name.replace(/ \(.*\)/, ''), qty: Math.floor(h.qty / 2), icon: 'verbinder' })) : [],
  });
  step('Achterwand', nums(is.back), {
    text: ['Leg de kast op de voorkant.', 'Meet beide diagonalen: zijn ze gelijk, dan staat de kast haaks.', 'Schroef de achterwand vast, ongeveer elke 150 mm, ook op de schotten.'],
    hw: hwItems(/Schroef 3,5/).map(h => ({ name: 'Schroef 3,5×16', qty: h.qty, icon: 'schroef' })),
    detail: 'diagonaal', cam: { dir: [-0.55, 0.42, -1] }, noDowels: true,
  });
  const drawerHW = hwItems(/Ladegeleider/).map(h => ({ name: h.name.replace('Ladegeleider volledig uittrekbaar', 'Geleider'), qty: h.qty, icon: 'geleider' }));
  if (parts.some(is.box) || parts.some(is.innerBox)) {
    const firstDrawer = parts.find(p => p.group === 'lade')?.meta.drawer;
    step('Ladebakken', [...nums(is.box), ...nums(is.innerBox)], {
      text: ['Zet elke ladebak in elkaar: zijkanten met deuvels op voor- en achterkant, bodem eronder lijmen en nieten of schroeven.', 'Controleer de diagonalen.'],
      detail: { kind: 'lade', drawer: firstDrawer }, openAmt: 0.5,
    });
    step('Ladegeleiders en ladefronten', nums(is.drawerFront), {
      always: true, text: [
        'Schroef de geleiders in de kast, 15 mm boven de onderkant van het vak en 2 mm terug van de voorkant.',
        ...(hwQty(/Opvullat/) ? ['Bij binnenlades achter een deur: eerst de opvullatten van 20 mm aan de scharnierzijde.'] : []),
        'Klik de lades in en schroef de fronten van binnenuit vast. Houd 3 mm voeg aan.'],
      hw: [...drawerHW, ...hwItems(/Opvullat/).map(h => ({ name: 'Opvullat 20 mm', qty: h.qty, icon: 'lat' }))],
      detail: 'geleider', openAmt: 0.5,
    });
  }
  if (parts.some(is.door)) {
    step('Deuren en kleppen', nums(is.door), {
      text: ['Druk de scharnierpotten in de geboorde gaten van Ø35 en schroef ze vast.', 'Schroef de montageplaten op de zijwanden en klik de deuren erop.', 'Stel de voegen af met de drie stelschroeven.'],
      hw: [...hwItems(/Potscharnier/).map(h => ({ name: h.name.replace(' incl. montageplaat', ''), qty: h.qty, icon: 'scharnier' })),
        ...hwItems(/Klepsteun|Kleplift/).map(h => ({ name: h.name, qty: h.qty, icon: 'klep' })),
        ...hwItems(/Push-to-open drukschakelaar/).map(h => ({ name: 'Drukschakelaar', qty: h.qty, icon: 'push' }))],
      detail: 'scharnier', openAmt: 0.45, noDowels: true,
    });
  }
  if (parts.some(is.loose) || geo.rails.length) {
    step('Legplanken en garderobestang', nums(is.loose), {
      always: true, text: ['Steek de planksteunen op de gewenste hoogte in de gaatjesrij en leg de planken erop.', ...(geo.rails.length ? ['Schroef de stangdragers vast en leg de garderobestang erin.'] : [])],
      hw: [...hwItems(/Planksteun/).map(h => ({ name: 'Planksteun Ø5', qty: h.qty, icon: 'pin' })), ...hwItems(/Garderobestang|stangdrager/i).map(h => ({ name: h.name, qty: h.qty, icon: 'stang' }))],
      detail: parts.some(is.loose) ? 'pins' : null, rails: true, noDowels: true,
    });
  }
  if (d.handle.type !== 'push' && geo.handles.length) {
    step('Grepen', [], {
      always: true, text: ['Markeer de gaten met een boormal of de maten hiernaast en boor van voren door met een stuk afvalhout erachter.', 'Schroef de grepen vast.'],
      hw: hwItems(new RegExp(HANDLE_TYPES[d.handle.type].label)).map(h => ({ name: h.name, qty: h.qty, icon: 'greep' })),
      detail: 'greep', handles: true, rails: true, hlHandles: true, noDowels: true,
    });
  }
  step('Klaar', [], { always: true, text: ['Zet de kast waterpas en veranker hoge kasten aan de muur.'], handles: true, rails: true, mode: 'render', noDowels: true });

  // ---------- pagina's ----------
  let first = true;
  const page = () => { if (!first) doc.addPage(); first = false; };
  const foot = () => { const i = doc.getNumberOfPages(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${clean(d.name)}  ·  montagehandleiding`, M, PH - 6); doc.text(String(i), PW - M, PH - 6, { align: 'right' }); };
  const ctx = { page, foot, heading: (dd, t) => heading(dd, t) };

  // omslag
  progress('Omslag…');
  page();
  const cover = viewer.renderImage({ w: 1500, h: 1000, mode: 'render', fronts: 'dicht' });
  doc.addImage(cover.url, 'PNG', M + 30, 34, PW - 2 * M - 60, (PW - 2 * M - 60) * 1000 / 1500, undefined, 'FAST');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...INK);
  doc.text(clean(d.name), M, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...MUTED);
  doc.text(`Montagehandleiding  ·  ${d.W} × ${d.H} × ${d.D + d.t} mm  ·  ${parts.length} onderdelen  ·  ${steps.length} stappen`, M, 29);
  // twee personen
  drawPeople(doc, PW - M - 22, PH - 22);
  doc.setFontSize(8); doc.text('Monteer met twee personen', PW - M - 10, PH - 9, { align: 'right' });
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text('Inhoud: voorbereiding · planning · gereedschap en beslag · onderdelen · montagestappen · begrippenlijst', M, PH - 9);

  // voorbereiding en planning
  progress('Voorbereiding…');
  const A = drawPrep(doc, ctx, d, geo);

  // gereedschap + beslag
  progress('Beslag…');
  page();
  heading(doc, 'Gereedschap en beslag');
  const tools = ['Boormachine met houtboren Ø5, Ø6, Ø8', 'Cilinderkopboor Ø35 (scharnieren)', 'Houtlijm (D3)', 'Lijmklemmen, min. 2 stuks', 'Rubberen hamer', 'Schroevendraaier PZ2 / accuboor', 'Rolmaat, winkelhaak, waterpas'];
  doc.setFontSize(9.5); doc.setTextColor(...INK);
  tools.forEach((t, i) => { toolIcon(doc, M + 3, 40 + i * 9); doc.text(t, M + 10, 41.5 + i * 9); });
  const items = geo.hardware.map(h => ({ name: h.name, qty: h.qty, icon: iconFor(h.name) }));
  hwGrid(doc, 105, 34, PW - 105 - M, items);
  foot();

  // onderdelen (opengewerkt)
  progress('Onderdelen…');
  page();
  heading(doc, 'Onderdelen');
  const offset = explodeOffsets(parts, d);
  const ex = viewer.renderImage({
    w: 1600, h: 1100, override: { visible: null, highlight: new Set(), offset, handles: false, rails: false },
    cam: { dir: [0.62, 0.38, 1] }, project: parts.map(p => centerOf(p, offset[p.num])),
  });
  const imgW = 186, imgH = imgW * 1100 / 1600, ix = M, iy = 26;
  doc.addImage(ex.url, 'PNG', ix, iy, imgW, imgH, undefined, 'FAST');
  ex.pts.forEach((pt, i) => bubble(doc, ix + pt[0] / ex.w * imgW, iy + pt[1] / ex.h * imgH, parts[i].num, false));
  partList(doc, ix + imgW + 6, 30, PW - M - (ix + imgW + 6), parts);
  foot();

  // stappen
  for (let si = 0; si < steps.length; si++) {
    const s = steps[si];
    progress(`Stap ${si + 1} van ${steps.length}…`);
    page();
    const show = s.mode === 'render';
    const img = viewer.renderImage({
      w: 1500, h: 1100, mode: show ? 'render' : 'lines', fronts: 'dicht', openAmt: s.openAmt,
      override: show ? null : { visible: s.visible, highlight: s.add, handles: s.handles, rails: s.rails, hlHandles: s.hlHandles },
      cam: s.cam || {}, project: [...s.add].map(n => centerOf(byNum.get(n))),
    });
    const w = 190, h = w * 1100 / 1500, x = M, y = 22;
    doc.addImage(img.url, 'PNG', x, y, w, h, undefined, 'FAST');
    [...s.add].forEach((n, i) => { const pt = img.pts[i]; if (pt) bubble(doc, x + pt[0] / img.w * w, y + pt[1] / img.h * h, n, true); });
    // stapnummer
    doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.setTextColor(...INK);
    doc.text(String(si + 1), M, 24);
    doc.setFontSize(13); doc.text(clean(s.title), M + 18, 16);
    doc.setFont('helvetica', 'normal');
    // rechterkolom
    const cx = M + w + 6, cw = PW - M - cx;
    let cy = 22;
    if (s.add.size) {
      doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text('ONDERDELEN', cx, cy); cy += 4;
      let bx = cx + 4;
      for (const n of s.add) { if (bx > cx + cw - 4) { bx = cx + 4; cy += 9; } bubble(doc, bx, cy + 2.5, n, true); bx += 9; }
      cy += 10;
    }
    if (s.hw.length) {
      doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text('BESLAG', cx, cy); cy += 3;
      for (const hItem of s.hw) {
        drawIcon(doc, hItem.icon, cx + 5, cy + 4, 4.2);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(`${hItem.qty}×`, cx + 12, cy + 5.2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(doc.splitTextToSize(clean(hItem.name), cw - 24)[0], cx + 22, cy + 5.2);
        cy += 9;
      }
      cy += 2;
    }
    doc.setFontSize(9); doc.setTextColor(...INK);
    for (const t of s.text) { const l = doc.splitTextToSize(clean(t), cw); doc.text(l, cx, cy + 3); cy += l.length * 4 + 2; }
    // detail in vergrootcirkel
    if (s.detail) {
      const r = Math.min(30, (PH - 16 - cy) / 2 - 2);
      if (r > 16) {
        const dcx = cx + cw / 2, dcy = PH - 14 - r;
        await drawDetail(doc, s.detail, dcx, dcy, r, d, geo, viewer);
      }
    }
    foot();
  }
  progress('Begrippen…');
  drawGlossary(doc, ctx, A);
  progress('PDF opslaan…');
  return doc.output('blob');
}

// ---------- hulpfuncties ----------
const clean = s => String(s).replace(/[^\x20-\x7E -ÿ×–°²]/g, '');

function heading(doc, t) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text(t, M, 18);
  doc.setFont('helvetica', 'normal');
}

function centerOf(p, off = [0, 0, 0]) {
  if (p.prism) {
    const xs = p.prism.poly.map(q => q[0]), ys = p.prism.poly.map(q => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2 + off[0], (Math.min(...ys) + Math.max(...ys)) / 2 + off[1], p.prism.z1 + off[2]];
  }
  const b = p.box;
  // nummer op het voorvlak (of bovenvlak bij liggende delen)
  return [(b[0] + b[1]) / 2 + off[0], (b[2] + b[3]) / 2 + off[1], b[5] + off[2]];
}

function explodeOffsets(parts, d) {
  const o = {};
  const s = Math.max(d.W, d.H) * 0.18;
  for (const p of parts) {
    const b = p.box, cx = (b[0] + b[1]) / 2;
    let v = [0, 0, 0];
    if (p.name.startsWith('Zijwand')) v = [cx < d.W / 2 ? -s : s, 0, 0];
    else if (p.meta?.role === 'top') v = [0, s, 0];
    else if (p.name.startsWith('Bodem')) v = [0, -s * 0.35, 0];
    else if (p.group === 'plint') v = [0, -s * 0.8, p.name.includes('voor') ? s * 0.4 : 0];
    else if (p.group === 'achterwand') v = [0, 0, -s * 1.6];
    else if (p.group === 'front') v = [0, 0, s * 2.2];
    else if (p.group === 'lade') v = [0, 0, s * 1.2];
    else if (p.meta?.drag === 'shelf') v = [0, 0, s * 0.7];
    o[p.num] = v;
  }
  return o;
}

function bubble(doc, x, y, n, accent) {
  const r = n > 99 ? 3.4 : 2.9;
  doc.setLineWidth(0.3);
  doc.setDrawColor(...(accent ? ACC : INK)); doc.setFillColor(255, 255, 255);
  doc.circle(x, y, r, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(n > 99 ? 6 : 7); doc.setTextColor(...(accent ? ACC : INK));
  doc.text(String(n), x, y + 1.05, { align: 'center' });
  doc.setFont('helvetica', 'normal');
}

function partList(doc, x, y, w, parts) {
  // identieke onderdelen samenvoegen
  const groups = new Map();
  for (const p of parts) {
    const k = `${p.name.replace(/ [A-Z]$| \(.*\)$/g, '')}|${Math.round(p.size.L)}|${Math.round(p.size.B)}|${p.t}`;
    if (!groups.has(k)) groups.set(k, { nums: [], p });
    groups.get(k).nums.push(p.num);
  }
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text('NR', x, y); doc.text('ONDERDEEL', x + 16, y); doc.text('MAAT', x + w, y, { align: 'right' });
  y += 2; doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.line(x, y, x + w, y); y += 3.6;
  const rowH = Math.min(4.2, (PH - 20 - y) / groups.size);
  const fs = Math.max(5.5, Math.min(7.5, rowH * 1.75));
  for (const { nums, p } of groups.values()) {
    doc.setFontSize(fs); doc.setTextColor(...INK);
    doc.text(rangeTxt(nums), x, y);
    doc.text(doc.splitTextToSize(clean(`${nums.length > 1 ? nums.length + '× ' : ''}${p.name.replace(/ \(module \d+\)/, '')}`), w - 40)[0], x + 16, y);
    doc.setTextColor(...MUTED);
    doc.text(`${Math.round(p.size.L)} × ${Math.round(p.size.B)} × ${p.t}`, x + w, y, { align: 'right' });
    y += rowH;
  }
}
function rangeTxt(nums) {
  const out = []; let a = nums[0], b = nums[0];
  for (const n of nums.slice(1)) { if (n === b + 1) b = n; else { out.push(a === b ? `${a}` : `${a}–${b}`); a = b = n; } }
  out.push(a === b ? `${a}` : `${a}–${b}`);
  const s = out.join(', ');
  return s.length > 9 ? s.slice(0, 8) + '…' : s;
}

function iconFor(name) {
  const n = name.toLowerCase();
  if (n.includes('deuvel')) return 'deuvel';
  if (n.includes('scharnier')) return 'scharnier';
  if (n.includes('geleider')) return 'geleider';
  if (n.includes('schroef 3,5')) return 'schroef';
  if (n.includes('verbinder')) return 'verbinder';
  if (n.includes('planksteun')) return 'pin';
  if (n.includes('garderobe') || n.includes('drager')) return 'stang';
  if (n.includes('klep')) return 'klep';
  if (n.includes('push')) return 'push';
  if (n.includes('opvullat')) return 'lat';
  if (n.includes('glijder')) return 'glijder';
  return 'greep';
}

function hwGrid(doc, x, y, w, items) {
  const cols = 3, cw = w / cols, ch = 26;
  items.forEach((it, i) => {
    const cx = x + (i % cols) * cw, cy = y + Math.floor(i / cols) * ch;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.roundedRect(cx, cy, cw - 4, ch - 4, 2, 2, 'S');
    drawIcon(doc, it.icon, cx + 11, cy + 10, 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text(`${it.qty}×`, cx + cw - 7, cy + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text(doc.splitTextToSize(clean(it.name), cw - 26).slice(0, 3), cx + 22, cy + 14);
  });
}

function toolIcon(doc, x, y) { doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.circle(x, y, 1.6, 'S'); doc.line(x + 1.2, y + 1.2, x + 3.2, y + 3.2); }

// eenvoudige vectoriconen
function drawIcon(doc, kind, x, y, s) {
  doc.setDrawColor(...INK); doc.setFillColor(...INK); doc.setLineWidth(0.3);
  const k = s / 7;
  switch (kind) {
    case 'deuvel':
      doc.roundedRect(x - 6 * k, y - 1.6 * k, 12 * k, 3.2 * k, 1.4 * k, 1.4 * k, 'S');
      for (let i = -4; i <= 4; i += 2) doc.line(x + i * k, y - 1.6 * k, x + (i + 1) * k, y + 1.6 * k);
      break;
    case 'schroef':
      doc.circle(x - 4.5 * k, y, 1.8 * k, 'S'); doc.line(x - 2.7 * k, y, x + 6 * k, y);
      for (let i = -2; i <= 5; i += 1.5) doc.line(x + i * k, y - 0.9 * k, x + (i + 0.7) * k, y + 0.9 * k);
      break;
    case 'scharnier':
      doc.circle(x - 3 * k, y, 3 * k, 'S'); doc.rect(x, y - 1.3 * k, 6 * k, 2.6 * k, 'S'); doc.rect(x + 3 * k, y - 3 * k, 3 * k, 6 * k, 'S');
      break;
    case 'geleider':
      doc.rect(x - 6 * k, y - 1.5 * k, 12 * k, 3 * k, 'S'); doc.rect(x - 4 * k, y - 0.6 * k, 12 * k, 1.2 * k, 'S');
      break;
    case 'verbinder':
      doc.circle(x - 4 * k, y, 2 * k, 'S'); doc.rect(x - 2 * k, y - 0.8 * k, 8 * k, 1.6 * k, 'S'); doc.circle(x + 6 * k, y, 1.6 * k, 'S');
      break;
    case 'pin':
      doc.rect(x - 1 * k, y - 4 * k, 2 * k, 6 * k, 'S'); doc.rect(x - 3 * k, y + 2 * k, 6 * k, 1.4 * k, 'F');
      break;
    case 'stang':
      doc.roundedRect(x - 6 * k, y - 1 * k, 12 * k, 2 * k, 1 * k, 1 * k, 'S'); doc.line(x - 5 * k, y - 1 * k, x - 5 * k, y - 4 * k);
      break;
    case 'klep':
      doc.line(x - 5 * k, y + 3 * k, x + 4 * k, y - 3 * k); doc.circle(x - 5 * k, y + 3 * k, 1 * k, 'S'); doc.rect(x + 2 * k, y - 4 * k, 3 * k, 2 * k, 'S');
      break;
    case 'push':
      doc.rect(x - 5 * k, y - 1.8 * k, 7 * k, 3.6 * k, 'S'); doc.circle(x + 3.5 * k, y, 1.6 * k, 'F');
      break;
    case 'lat':
      doc.rect(x - 6 * k, y - 1 * k, 12 * k, 2 * k, 'S');
      break;
    case 'glijder':
      doc.circle(x, y, 3 * k, 'S'); doc.circle(x, y, 1.6 * k, 'F');
      break;
    default: // greep
      doc.line(x - 5 * k, y + 2 * k, x - 5 * k, y - 1 * k); doc.line(x + 5 * k, y + 2 * k, x + 5 * k, y - 1 * k);
      doc.setLineWidth(0.9); doc.line(x - 6 * k, y - 1 * k, x + 6 * k, y - 1 * k); doc.setLineWidth(0.3);
  }
}

function drawPeople(doc, x, y) {
  doc.setDrawColor(...INK); doc.setLineWidth(0.4);
  for (const dx of [-5, 5]) { doc.circle(x + dx, y - 6, 2, 'S'); doc.line(x + dx, y - 4, x + dx, y + 3); doc.line(x + dx, y + 3, x + dx - 2, y + 8); doc.line(x + dx, y + 3, x + dx + 2, y + 8); doc.line(x + dx - 3, y - 2, x + dx + 3, y - 2); }
}

// ---------- detailtekeningen (vergrootcirkel) ----------
async function drawDetail(doc, det, cx, cy, r, d, geo, viewer) {
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'FD');
  const kind = typeof det === 'string' ? det : det.kind;
  doc.setLineWidth(0.3); doc.setFontSize(6.5); doc.setTextColor(...INK);
  const T = d.t, s = r / 30; // 1 eenheid ~ 1 mm*s
  const lbl = (t, x, y, al = 'left') => { doc.setFontSize(6.5); doc.setTextColor(...INK); doc.text(clean(t), x, y, { align: al }); };
  if (kind === 'deuvel' || kind === 'klem') {
    // L-verbinding in doorsnede: verticale plaat + liggende plaat met deuvel
    const k = s * 0.9;
    const x0 = cx - 18 * k, y0 = cy - 18 * k;
    doc.setFillColor(...PALE);
    doc.rect(x0, y0, T * k, 40 * k, 'FD');                    // zijwand
    doc.rect(x0 + T * k, y0 + 18 * k, 26 * k, T * k, 'FD');    // plank
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x0 + (T - 12) * k, y0 + (18 + T / 2 - 4) * k, 35 * k, 8 * k, 1.5 * k, 1.5 * k, 'FD');
    lbl('Ø8 × 35', x0 + 30 * k, y0 + 14 * k);
    lbl('12', x0 + (T - 6) * k, y0 + 33 * k, 'center');
    lbl('lijm', x0 + 22 * k, y0 + 42 * k);
    if (kind === 'klem') { doc.setLineWidth(0.8); doc.line(cx - r * 0.8, cy - r * 0.55, cx + r * 0.8, cy - r * 0.55); doc.setLineWidth(0.3); lbl('klemmen ± 1 uur', cx, cy - r * 0.62, 'center'); }
  } else if (kind === 'confirmat') {
    const k = s * 0.9, x0 = cx - 18 * k, y0 = cy - 18 * k;
    doc.setFillColor(...PALE); doc.rect(x0, y0, T * k, 40 * k, 'FD'); doc.rect(x0 + T * k, y0 + 18 * k, 26 * k, T * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.rect(x0 - 3 * k, y0 + (18 + T / 2 - 3.5) * k, (T + 3 + 30) * k, 7 * k, 'FD');
    doc.setFillColor(...INK); doc.rect(x0 - 3 * k, y0 + (18 + T / 2 - 4.5) * k, 3 * k, 9 * k, 'F');
    lbl('7 × 50', x0 + 30 * k, y0 + 14 * k); lbl('Ø7 door · Ø5 voor', x0 + 22 * k, y0 + 42 * k);
  } else if (kind === 'cabineo') {
    const k = s * 0.9, x0 = cx - 18 * k, y0 = cy - 18 * k;
    doc.setFillColor(...PALE); doc.rect(x0, y0, T * k, 40 * k, 'FD'); doc.rect(x0 + T * k, y0 + 18 * k, 26 * k, T * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.roundedRect(x0 + (T + 3) * k, y0 + (18 + T - 7) * k, 14 * k, 7 * k, 2 * k, 2 * k, 'FD');
    doc.setLineWidth(0.6); doc.line(x0 + (T + 3) * k, y0 + (18 + T - 3.5) * k, x0 + (T - 9) * k, y0 + (18 + T - 3.5) * k); doc.setLineWidth(0.3);
    lbl('Cabineo in zak', x0 + 22 * k, y0 + 44 * k); lbl('schroef in vlak', x0 - 2 * k, y0 + 14 * k);
  } else if (kind === 'naad') {
    const k = s;
    doc.setFillColor(...PALE); doc.rect(cx - 26 * k, cy - 4 * k, 26 * k, T * k * 0.8, 'FD'); doc.rect(cx, cy - 4 * k, 26 * k, T * k * 0.8, 'FD');
    doc.rect(cx - 9 * k * 2, cy + (T * 0.8 - 4) * k, 18 * k, 22 * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.roundedRect(cx - 7 * k, cy - 1 * k, 14 * k, 6 * k, 2 * k, 2 * k, 'FD');
    lbl('naadverbinder', cx, cy - 7 * k, 'center'); lbl('schot', cx - 9 * k, cy + 22 * k, 'center');
  } else if (kind === 'verstek') {
    const k = s;
    doc.setFillColor(...PALE);
    doc.lines([[30 * k, 0], [0, 9 * k], [-27 * k, 0]], cx - 30 * k, cy - 6 * k, [1, 1], 'FD', true);
    doc.lines([[24 * k, 14 * k], [-5 * k, 8 * k], [-22 * k, -13 * k]], cx, cy - 6 * k, [1, 1], 'FD', true);
    lbl('zaaghoek = halve knik', cx, cy + 20 * k, 'center');
  } else if (kind === 'haaks') {
    doc.setFillColor(...PALE);
    doc.rect(cx - r * 0.55, cy + r * 0.25, r * 1.1, r * 0.12, 'FD');
    doc.rect(cx - r * 0.06, cy - r * 0.55, r * 0.12, r * 0.8, 'FD');
    doc.setLineWidth(0.6); doc.line(cx + r * 0.1, cy + r * 0.25, cx + r * 0.1, cy - r * 0.15); doc.line(cx + r * 0.1, cy + r * 0.25, cx + r * 0.45, cy + r * 0.25);
    doc.setLineWidth(0.3); lbl('90°', cx + r * 0.2, cy + r * 0.15);
  } else if (kind === 'diagonaal') {
    const w = r * 1.1, h = r * 0.8, x0 = cx - w / 2, y0 = cy - h / 2;
    doc.setFillColor(...PALE); doc.rect(x0, y0, w, h, 'FD');
    doc.setLineDashPattern([1.2, 0.8], 0); doc.line(x0, y0, x0 + w, y0 + h); doc.line(x0 + w, y0, x0, y0 + h); doc.setLineDashPattern([], 0);
    lbl('A', x0 + w * 0.22, y0 + h * 0.3); lbl('B', x0 + w * 0.74, y0 + h * 0.3);
    doc.setFontSize(9); doc.text('A = B', cx, y0 + h + 6, { align: 'center' });
  } else if (kind === 'verbinder') {
    const k = s;
    doc.setFillColor(...PALE);
    doc.rect(cx - T * k, cy - 20 * k, T * k, 40 * k, 'FD'); doc.rect(cx, cy - 20 * k, T * k, 40 * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.rect(cx - (T + 3) * k, cy - 2 * k, (2 * T + 6) * k, 4 * k, 'FD');
    lbl('kastverbinder Ø5', cx, cy + 25 * k, 'center');
  } else if (kind === 'geleider') {
    const k = s * 1.3;
    doc.setFillColor(...PALE);
    doc.rect(cx - 16 * k, cy - 18 * k, T * k, 36 * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.rect(cx + (-16 + T) * k, cy - 4 * k, 13 * k, 10 * k, 'FD');
    doc.setFillColor(...PALE); doc.rect(cx + (-3 + T) * k, cy - 12 * k, d.drawerBoxT * k, 24 * k, 'FD');
    lbl('13', cx + (-9.5 + T) * k, cy - 6 * k, 'center');
    lbl('zijwand', cx - 16 * k, cy + 23 * k); lbl('ladebak', cx + (T - 3) * k, cy - 14 * k);
  } else if (kind === 'scharnier') {
    const k = s * 1.2;
    doc.setFillColor(...PALE); doc.rect(cx - 20 * k, cy - 4 * k, 40 * k, T * k, 'FD');
    doc.setFillColor(255, 255, 255); doc.rect(cx - 17.5 * k, cy - 4 * k, 35 * k, 12.5 * k, 'FD');
    lbl('Ø35 × 12,5', cx, cy - 7 * k, 'center');
    doc.line(cx - 20 * k, cy + 18 * k, cx, cy + 18 * k); lbl('22,5', cx - 10 * k, cy + 17 * k, 'center');
    lbl('stelschroeven: zij · diepte · hoogte', cx, cy + 25 * k, 'center');
  } else if (kind === 'pins') {
    const k = s * 1.1;
    doc.setFillColor(...PALE); doc.rect(cx - 12 * k, cy - 24 * k, 24 * k, 48 * k, 'FD');
    for (let i = -3; i <= 3; i++) doc.circle(cx, cy + i * 6.4 * k, 1.2 * k, 'S');
    lbl('32 mm', cx + 4 * k, cy + 3 * k); lbl('Ø5', cx + 4 * k, cy - 13 * k);
  } else if (kind === 'greep') {
    const h = HANDLE_TYPES[d.handle.type];
    const k = s;
    doc.setFillColor(...PALE); doc.rect(cx - 22 * k, cy - 18 * k, 44 * k, 36 * k, 'FD');
    doc.setFillColor(...INK);
    if (h.cc) {
      doc.circle(cx - 12 * k, cy, 1 * k, 'F'); doc.circle(cx + 12 * k, cy, 1 * k, 'F');
      doc.line(cx - 12 * k, cy + 6 * k, cx + 12 * k, cy + 6 * k); lbl(`${h.cc} hart-op-hart`, cx, cy + 5 * k, 'center');
    } else {
      doc.circle(cx, cy, 1 * k, 'F'); lbl(d.handle.type === 'knop' ? '1 gat Ø4' : 'kantgreep: 2 schroeven', cx, cy + 6 * k, 'center');
    }
  } else if (kind === 'lade') {
    // opengewerkte ladebak als 3D-detail
    const dp = geo.parts.filter(p => p.meta?.drawer === det.drawer);
    if (dp.length) {
      const off = {};
      const cxm = (Math.min(...dp.map(p => p.box[0])) + Math.max(...dp.map(p => p.box[1]))) / 2;
      for (const p of dp) {
        const pc = (p.box[0] + p.box[1]) / 2;
        off[p.num] = p.name.includes('zijkant') ? [pc < cxm ? -60 : 60, 0, 0] : p.name.includes('bodem') ? [0, -50, 0] : p.name.includes('achter') ? [0, 0, -60] : [0, 0, 60];
      }
      const img = viewer.renderImage({ w: 700, h: 700, override: { visible: new Set(dp.map(p => p.num)), highlight: new Set(dp.map(p => p.num)), offset: off }, cam: { dir: [0.7, 0.6, 1], pad: 0.95 }, openAmt: 0 });
      const sz = r * 1.6;
      doc.addImage(img.url, 'PNG', cx - sz / 2, cy - sz / 2, sz, sz, undefined, 'FAST');
      doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.circle(cx, cy, r, 'S');
    }
  }
}
