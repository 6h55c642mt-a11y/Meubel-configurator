// Zet een ontwerp om in concrete plaatdelen, fronten, grepen en beslag.
import {
  plinthH, backT, colX, cellY, matLabel, HANDLE_TYPES, FINISHES, SLIDE_LENGTHS,
} from './model.js';

const AX = { x: 0, y: 1, z: 2 };
const GAP = 3;            // voeg tussen fronten
const SLIDE_CLEAR = 13;   // ruimte per zijde voor ladegeleider
const HINGE_EDGE = 22.5;  // hart potgat vanaf kant
const POT_D = 35;

export function partSize(p) {
  const b = p.box;
  const s = [b[1] - b[0], b[3] - b[2], b[5] - b[4]];
  const thinI = AX[p.thin], grainI = AX[p.grain];
  const otherI = [0, 1, 2].find(i => i !== thinI && i !== grainI);
  return { L: round1(s[grainI]), B: round1(s[otherI]), T: round1(s[thinI]), grainI, otherI, thinI };
}

const round1 = v => Math.round(v * 10) / 10;

function dowelPositions(a, b) {
  const len = b - a;
  if (len < 80) return [a + len / 2];
  const n = Math.max(2, Math.ceil((len - 74) / 192) + 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + 37 + (len - 74) * (n === 1 ? 0.5 : i / (n - 1)));
  return out;
}

function hingeCount(len) {
  if (len <= 900) return 2;
  if (len <= 1500) return 3;
  if (len <= 2000) return 4;
  return 5;
}

function evenly(a, b, n, margin) {
  if (n === 1) return [(a + b) / 2];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + margin + (b - a - 2 * margin) * i / (n - 1));
  return out;
}

export function buildGeometry(d) {
  const t = d.t, W = d.W, H = d.H, D = d.D;
  const P = plinthH(d), bt = backT(d);
  const zB = bt, zF = D, Ds = zF - zB;
  const n = d.columns.length;
  const cm = d.material.carcass;
  const fm = d.material.same ? d.material.carcass : d.material.fronts;
  const boxMat = { type: 'berken', color: null };
  const tf = t;

  const parts = [];
  const handles = [];
  const rails = [];
  const picks = [];
  const warnings = [];
  const hw = new Map();
  const addHW = (key, qty, unit = 'st') => {
    const e = hw.get(key) || { name: key, qty: 0, unit };
    e.qty += qty; hw.set(key, e);
  };

  const panel = (name, group, mat, tt, box, thin, grain, extra = {}) => {
    if (!grain) {
      const s = [box[1] - box[0], box[3] - box[2], box[5] - box[4]];
      const cands = ['x', 'y', 'z'].filter(a => a !== thin);
      grain = s[AX[cands[0]]] >= s[AX[cands[1]]] ? cands[0] : cands[1];
    }
    const p = { name, group, mat, t: tt, box, thin, grain, holes: [], meta: {}, ...extra };
    parts.push(p);
    return p;
  };
  const hole = (p, pos, dia, dir, kind) => p.holes.push({ p: pos, d: dia, dir, kind });

  const colRight = i => colX(d, i) + d.columns[i].w;
  const dividerCenters = [];
  for (let i = 0; i < n - 1; i++) dividerCenters.push(colRight(i) + t / 2);

  const shelfCenters = ci => {
    const col = d.columns[ci], out = [];
    for (let k = 0; k < col.cells.length - 1; k++) out.push({ k, y: cellY(d, ci, k).bot - t / 2, loose: col.loose[k] });
    return out;
  };
  const zDowels = dowelPositions(zB, zF);
  const pinRows = [zB + 37, zF - 37];
  const pinYs = () => {
    const out = []; const y0 = P + t + 96, y1 = H - t - 96;
    for (let y = y0; y <= y1; y += 32) out.push(y);
    return out;
  };
  const colHasLoose = ci => d.columns[ci].loose.some(Boolean);

  // ---------- korpus ----------
  const sideL = panel('Zijwand links', 'korpus', cm, t, [0, t, 0, H - t, zB, zF], 'x', 'y');
  const sideR = panel('Zijwand rechts', 'korpus', cm, t, [W - t, W, 0, H - t, zB, zF], 'x', 'y');
  for (const [side, xFace, dir, ci] of [[sideL, t, 1, 0], [sideR, W - t, -1, n - 1]]) {
    for (const z of zDowels) hole(side, [xFace, P + t / 2, z], 8, dir, 'deuvel');
    for (const s of shelfCenters(ci)) if (!s.loose) for (const z of zDowels) hole(side, [xFace, s.y, z], 8, dir, 'deuvel');
    if (colHasLoose(ci)) for (const y of pinYs()) for (const z of pinRows) hole(side, [xFace, y, z], 5, dir, 'pin');
  }

  const top = panel('Bovenblad', 'korpus', cm, t, [0, W, H - t, H, zB, zF], 'y', 'x');
  for (const x of [t / 2, W - t / 2, ...dividerCenters]) for (const z of zDowels) hole(top, [x, H - t, z], 8, -1, 'deuvel');

  const bottom = panel('Bodem', 'korpus', cm, t, [t, W - t, P, P + t, zB, zF], 'y', 'x');
  for (const x of dividerCenters) for (const z of zDowels) hole(bottom, [x, P + t, z], 8, 1, 'deuvel');

  for (let i = 0; i < n - 1; i++) {
    const xl = colRight(i);
    const dv = panel(`Tussenschot ${i + 1}`, 'korpus', cm, t, [xl, xl + t, P + t, H - t, zB, zF], 'x', 'y',
      { meta: { drag: 'divider', i } });
    for (const [ci, xFace, dir] of [[i, xl, -1], [i + 1, xl + t, 1]]) {
      for (const s of shelfCenters(ci)) if (!s.loose) for (const z of zDowels) hole(dv, [xFace, s.y, z], 8, dir, 'deuvel');
      if (colHasLoose(ci)) for (const y of pinYs()) for (const z of pinRows) hole(dv, [xFace, y, z], 5, dir, 'pin');
    }
  }

  d.columns.forEach((col, ci) => {
    const x0 = colX(d, ci), w = col.w;
    for (let k = 0; k < col.cells.length - 1; k++) {
      const y = cellY(d, ci, k).bot;
      const loose = col.loose[k];
      const box = loose ? [x0 + 1, x0 + w - 1, y - t, y, zB + 2, zF - 2] : [x0, x0 + w, y - t, y, zB, zF];
      panel(loose ? 'Legplank (los)' : 'Legplank', 'korpus', cm, t, box, 'y', 'x',
        { meta: { drag: 'shelf', col: ci, k, loose } });
      if (loose) addHW('Planksteun Ø5 mm', 4);
    }
    col.cells.forEach((c, k) => {
      const { top: yt, bot: yb } = cellY(d, ci, k);
      picks.push({ col: ci, k, x0, x1: x0 + w, y0: yb, y1: yt });
    });
  });

  // ---------- plint ----------
  if (P > 0) {
    const s = d.plinth.setback;
    const pf = panel('Plint voor', 'plint', cm, t, [t, W - t, 0, P, zF - s - t, zF - s], 'z', 'x');
    const plinths = [pf];
    if (zF - s - t > zB + 2 * t + 40) plinths.push(panel('Plint achter', 'plint', cm, t, [t, W - t, 0, P, zB, zB + t], 'z', 'x'));
    else warnings.push('Plint-terugsprong is zo diep dat er geen achterplint past.');
    const ys = P >= 90 ? [P / 3, 2 * P / 3] : [P / 2];
    for (const pl of plinths) {
      const zc = (pl.box[4] + pl.box[5]) / 2;
      for (const y of ys) { hole(sideL, [t, y, zc], 8, 1, 'deuvel'); hole(sideR, [W - t, y, zc], 8, -1, 'deuvel'); }
    }
  }

  // ---------- achterwand ----------
  if (d.back) {
    panel('Achterwand', 'achterwand', cm, bt, [0, W, P, H, 0, bt], 'z');
    const perim = 2 * (W + (H - P)) + (n - 1) * (H - P);
    addHW('Schroef 3,5×16 (achterwand)', Math.ceil(perim / 150));
  }

  // ---------- fronten ----------
  const animIds = { n: 0 };
  const handleType = d.handle.type;
  const finishLabel = FINISHES[d.handle.finish]?.label || '';

  d.columns.forEach((col, ci) => {
    const m = col.cells.length;
    const x0c = colX(d, ci), w = col.w;
    let k = 0;
    while (k < m) {
      const cell = col.cells[k];
      const span = cell.span, k1 = k + span - 1;
      if (cell.front !== 'none') {
        const outerL = ci === 0, outerR = ci === n - 1, outerT = k === 0, outerB = k1 === m - 1;
        let xl = outerL ? 0 : x0c - t / 2;
        let xr = outerR ? W : x0c + w + t / 2;
        let yt = outerT ? H : cellY(d, ci, k).top + t / 2;
        let yb = outerB ? P : cellY(d, ci, k1).bot - t / 2;
        const g = GAP / 2;
        xl += outerL ? 0 : g; xr -= outerR ? 0 : g;
        yt -= outerT ? 0 : g; yb += outerB && P > 0 ? 0 : g;

        const type = cell.front;
        let leaves;
        if (type === 'door-dbl') {
          const mid = (xl + xr) / 2;
          leaves = [{ x0: xl, x1: mid - g, hinge: 'l' }, { x0: mid + g, x1: xr, hinge: 'r' }];
        } else {
          const hinge = { 'door-l': 'l', 'door-r': 'r', 'flap-up': 't', 'flap-down': 'b' }[type] || null;
          leaves = [{ x0: xl, x1: xr, hinge }];
        }
        const isDrawer = type === 'drawer', isFlap = type.startsWith('flap');
        const name = isDrawer ? 'Ladefront' : isFlap ? 'Klep' : 'Deur';

        for (const lf of leaves) {
          const animId = ++animIds.n;
          const box = [lf.x0, lf.x1, yb, yt, zF, zF + tf];
          const fp = panel(name, 'front', fm, tf, box, 'z', isDrawer || isFlap ? 'x' : 'y', {
            meta: { col: ci, k0: k, k1, type, hinge: lf.hinge, anim: { id: animId, kind: isDrawer ? 'drawer' : 'hinge', hinge: lf.hinge } },
          });
          // scharnieren
          if (lf.hinge) {
            const vertical = lf.hinge === 'l' || lf.hinge === 'r';
            const len = vertical ? yt - yb : lf.x1 - lf.x0;
            const cnt = hingeCount(len);
            const outer = (lf.hinge === 'l' && outerL && lf.x0 === xl) || (lf.hinge === 'r' && outerR && lf.x1 === xr)
              || (lf.hinge === 't' && outerT) || (lf.hinge === 'b' && outerB);
            const pos = evenly(vertical ? yb : lf.x0, vertical ? yt : lf.x1, cnt, Math.min(100, len / 4));
            for (const v of pos) {
              let p;
              if (lf.hinge === 'l') p = [lf.x0 + HINGE_EDGE, v, zF];
              else if (lf.hinge === 'r') p = [lf.x1 - HINGE_EDGE, v, zF];
              else if (lf.hinge === 't') p = [v, yt - HINGE_EDGE, zF];
              else p = [v, yb + HINGE_EDGE, zF];
              hole(fp, p, POT_D, -1, 'pot');
            }
            addHW(`Potscharnier 110° ${outer ? 'vol opdek' : 'half opdek'} incl. montageplaat`, cnt);
            if (lf.hinge === 't') addHW('Kleplift (opwaarts, set)', 1);
            if (lf.hinge === 'b') addHW('Klepsteun (neerwaarts, set)', 1);
            if (handleType === 'push') addHW('Push-to-open drukschakelaar', 1);
          }
          // greep
          if (handleType !== 'push') {
            handles.push(placeHandle(handleType, type, lf, yb, yt, zF + tf, animId));
          }
          // lade
          if (isDrawer) {
            const cy = cellY(d, ci, k);
            buildDrawer({ x0: x0c, w, yb: cy.bot, h: cell.h, animId, zFront: zF - 2, push: handleType === 'push' });
          }
        }
      }
      k += span;
    }
  });

  // interieur: garderobestangen en binnenlades
  d.columns.forEach((col, ci) => {
    const x0 = colX(d, ci), w = col.w;
    col.cells.forEach((cell, k) => {
      const ownerK = (() => { let j = 0; while (j < col.cells.length) { const s = col.cells[j].span; if (k >= j && k < j + s) return j; j += s; } return k; })();
      const owner = col.cells[ownerK];
      if (owner.front === 'drawer') return;
      const cy = cellY(d, ci, k);
      if (cell.interior === 'rail') {
        rails.push({ x0, x1: x0 + w, y: cy.top - 55, z: (zB + zF) / 2 });
        addHW(`Garderobestang ovaal, lengte ${Math.round(w - 2)} mm`, 1);
        addHW('Garderobestangdrager', 2);
        if (cell.h < 700) warnings.push(`Kolom ${ci + 1}, vak ${k + 1}: garderobestang in een vak lager dan 700 mm.`);
      } else if (cell.interior === 'inner') {
        const q = cell.count;
        const ft = owner.front;
        let spacerL = 0, spacerR = 0;
        if (ft === 'door-l' || ft === 'door-dbl') spacerL = 20;
        if (ft === 'door-r' || ft === 'door-dbl') spacerR = 20;
        if (spacerL || spacerR) addHW('Opvullat 20 mm voor ladegeleider (scharnierzijde)', 2 * q * ((spacerL ? 1 : 0) + (spacerR ? 1 : 0)));
        const pitch = cell.h / q;
        for (let j = 0; j < q; j++) {
          const yb = cy.bot + j * pitch;
          buildDrawer({
            x0: x0 + spacerL, w: w - spacerL - spacerR, yb, h: pitch, animId: ++animIds.n,
            zFront: zF - 4, inner: true, push: false, maxH: pitch - 25,
          });
        }
      }
    });
  });

  function buildDrawer({ x0, w, yb, h, animId, zFront, inner = false, push, maxH }) {
    const tb = d.drawerBoxT, tbot = d.thinT;
    const L = [...SLIDE_LENGTHS].reverse().find(l => l <= Ds - 12);
    if (!L) { warnings.push('Kast te ondiep voor ladegeleiders (min. 282 mm binnendiepte).'); return; }
    const bw = w - 2 * SLIDE_CLEAR;
    const hb = Math.max(50, Math.min(maxH ?? (h - 40), 260));
    const y0 = yb + (inner ? 10 : 15);
    const z1 = zFront, z0 = z1 - L;
    const x1 = x0 + SLIDE_CLEAR, x2 = x1 + bw;
    const yS = y0 + tbot, yT = y0 + hb;
    const anim = { id: animId, kind: 'drawer' };
    const lbl = inner ? 'Binnenlade' : 'Lade';
    panel(`${lbl} zijkant`, 'lade', boxMat, tb, [x1, x1 + tb, yS, yT, z0, z1], 'x', 'z', { meta: { anim } });
    panel(`${lbl} zijkant`, 'lade', boxMat, tb, [x2 - tb, x2, yS, yT, z0, z1], 'x', 'z', { meta: { anim } });
    panel(`${lbl} ${inner ? 'voorkant' : 'binnenvoorkant'}`, 'lade', boxMat, tb, [x1 + tb, x2 - tb, yS, yT, z1 - tb, z1], 'z', 'x', { meta: { anim } });
    panel(`${lbl} achterkant`, 'lade', boxMat, tb, [x1 + tb, x2 - tb, yS, yT, z0, z0 + tb], 'z', 'x', { meta: { anim } });
    panel(`${lbl} bodem`, 'lade', boxMat, tbot, [x1, x2, y0, yS, z0, z1], 'y', 'x', { meta: { anim } });
    addHW(`Ladegeleider volledig uittrekbaar ${L} mm${push ? ' met push-to-open' : ''} (paar)`, 1);
  }

  function placeHandle(htype, ftype, lf, yb, yt, z, animId) {
    const fw = lf.x1 - lf.x0, fh = yt - yb;
    const cx = (lf.x0 + lf.x1) / 2, cy = (yb + yt) / 2;
    const def = HANDLE_TYPES[htype];
    const isEdge = htype === 'kant' || htype === 'lijst';
    const isDoor = ftype.startsWith('door');
    let len = def.len || 0;
    if (htype === 'lijst') len = Math.round(Math.min(isDoor ? 300 : 500, fw - 80));
    let x = cx, y = cy, orient = 'h', edge = null;
    if (isEdge) {
      if (ftype === 'flap-up') edge = 'bottom';
      else if (ftype === 'drawer' || ftype === 'flap-down') edge = 'top';
      else edge = cy < 1100 ? 'top' : 'bottom';
      y = edge === 'top' ? yt : yb;
      if (isDoor) x = lf.hinge === 'l' ? lf.x1 - 30 - len / 2 : lf.x0 + 30 + len / 2;
    } else if (isDoor) {
      orient = htype === 'knop' ? 'p' : 'v';
      x = lf.hinge === 'l' ? lf.x1 - 40 : lf.x0 + 40;
      const half = len / 2 + 60;
      y = Math.min(Math.max(1050, yb + half), yt - half);
    } else if (ftype === 'drawer') {
      orient = htype === 'knop' ? 'p' : 'h';
      y = fh < 220 ? cy : yt - 70;
    } else if (ftype === 'flap-down') {
      orient = htype === 'knop' ? 'p' : 'h'; y = yt - 50;
    } else if (ftype === 'flap-up') {
      orient = htype === 'knop' ? 'p' : 'h'; y = yb + 50;
    }
    addHW(`${def.label}${len && htype === 'lijst' ? ` ${len} mm` : ''} – ${finishLabel}`, 1);
    return { type: htype, x, y, z, orient, edge, len, animId };
  }

  // ---------- te lange delen splitsen ----------
  const maxLen = d.sheet.L - 2 * d.sheet.margin;
  const out = [];
  for (const p of parts) {
    const sz = partSize(p);
    if (sz.L <= maxLen || !['Bovenblad', 'Bodem', 'Achterwand', 'Plint voor', 'Plint achter'].includes(p.name)) {
      out.push(p);
      if (sz.L > maxLen) warnings.push(`${p.name} (${Math.round(sz.L)} mm) is langer dan de plaat.`);
      continue;
    }
    // splits langs x op hart van tussenschotten
    const a = p.box[0], b = p.box[1];
    const cuts = [];
    let cur = a;
    const pieces = Math.ceil((b - a) / maxLen);
    while (b - cur > maxLen) {
      const target = a + (cuts.length + 1) * (b - a) / pieces;
      const cands = dividerCenters.filter(x => x > cur + 100 && x - cur <= maxLen && b - x > 100);
      if (!cands.length) { warnings.push(`${p.name} kan niet gesplitst worden: voeg een tussenschot toe binnen ${maxLen} mm.`); break; }
      const c = cands.reduce((best, x) => Math.abs(x - target) < Math.abs(best - target) ? x : best, cands[0]);
      cuts.push(c); cur = c;
    }
    const edges = [a, ...cuts, b];
    for (let i = 0; i < edges.length - 1; i++) {
      const box = [...p.box]; box[0] = edges[i]; box[1] = edges[i + 1];
      const piece = { ...p, box, holes: p.holes.filter(h => h.p[0] >= edges[i] - 0.01 && h.p[0] < edges[i + 1] + (i === edges.length - 2 ? 0.01 : -0.01)), name: edges.length > 2 ? `${p.name} ${String.fromCharCode(65 + i)}` : p.name };
      out.push(piece);
    }
    if (cuts.length) warnings.push(`${p.name} is in ${edges.length - 1} delen gesplitst op het hart van een tussenschot.`);
  }

  // nummeren
  const order = { korpus: 0, plint: 1, achterwand: 2, front: 3, lade: 4 };
  out.sort((p, q) => order[p.group] - order[q.group]);
  out.forEach((p, i) => { p.num = i + 1; p.matLabel = matLabel(p.mat, p.t); p.size = partSize(p); });
  for (const p of out) {
    if (p.size.T !== p.t) p.size.T = p.t;
    if (p.size.B > d.sheet.W - 2 * d.sheet.margin && p.size.L > d.sheet.W - 2 * d.sheet.margin) {
      warnings.push(`Deel ${p.num} (${p.name}) past niet op het plaatformaat.`);
    }
    if (p.size.L > maxLen && p.grain && p.mat && p.size.B > d.sheet.W) warnings.push(`Deel ${p.num} past niet op de plaat.`);
  }

  const dowelCount = out.reduce((a, p) => a + p.holes.filter(h => h.kind === 'deuvel').length, 0);
  if (dowelCount) addHW('Deuvel beuken Ø8×35', dowelCount);
  if (P === 0) addHW('Meubelglijder / viltje', 4 + (n - 1) * 2);

  return {
    parts: out, handles, rails, picks, warnings: [...new Set(warnings)],
    hardware: [...hw.values()],
    dims: { W, H, D, P, t, bt, zB, zF, Ds, tf, dividerCenters },
  };
}
