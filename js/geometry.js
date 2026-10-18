// Zet een ontwerp om in concrete plaatdelen, fronten, grepen en beslag.
// Elk deel krijgt een lokaal assenstelsel (frame): u = lengte/nerf, v = breedte, n = dikte (zijde A).
import {
  plinthH, backT, colX, cellY, matLabel, HANDLE_TYPES, FINISHES, SLIDE_LENGTHS,
  segments, topOuter, topInner, innerPts, innerRange, modules, profile,
} from './model.js';

const AX = { x: 0, y: 1, z: 2 };
const GAP = 3;            // voeg tussen fronten
const SLIDE_CLEAR = 13;   // ruimte per zijde voor ladegeleider
const HINGE_EDGE = 22.5;  // hart potgat vanaf kant
const POT_D = 35;
const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = a => a.map(v => -v);
const r1 = v => Math.round(v * 10) / 10;

function dowelPositions(a, b) {
  const len = b - a;
  if (len < 80) return [a + len / 2];
  const n = Math.max(2, Math.ceil((len - 74) / 192) + 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + 37 + (len - 74) * i / (n - 1));
  return out;
}
const hingeCount = len => (len <= 900 ? 2 : len <= 1500 ? 3 : len <= 2000 ? 4 : 5);
function evenly(a, b, n, margin) {
  if (n === 1) return [(a + b) / 2];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + margin + (b - a - 2 * margin) * i / (n - 1));
  return out;
}

// Polygoon: rechthoek [x0,x1]×[y0,y1] begrensd door bovenlijn top(x)
function clipUnder(x0, x1, y0, y1, topFn, breaks) {
  const xs = [x0, x1, ...breaks.filter(x => x > x0 + 0.01 && x < x1 - 0.01)];
  // snijpunten met y1
  const sorted0 = [...new Set(xs)].sort((a, b) => a - b);
  for (let i = 0; i < sorted0.length - 1; i++) {
    const a = sorted0[i], b = sorted0[i + 1], ya = topFn(a) - y1, yb = topFn(b) - y1;
    if (ya * yb < 0) xs.push(a + (b - a) * ya / (ya - yb));
  }
  const sorted = [...new Set(xs.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const tops = sorted.map(x => [x, Math.max(y0, Math.min(y1, topFn(x)))]);
  const clipped = tops.some(([, y]) => y < y1 - 0.05);
  const poly = [[x0, y0], [x1, y0], ...tops.reverse()];
  // dubbele punten weg
  const out = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05; });
  return { poly: out, clipped, maxY: Math.max(...tops.map(t => t[1])) };
}

// interval(len) binnen [a,b] waar fn(x) >= y
function intervalAbove(fn, a, b, y, breaks) {
  const xs = [a, b, ...breaks.filter(x => x > a && x < b)].sort((p, q) => p - q);
  const pts = [];
  for (let i = 0; i < xs.length; i++) {
    pts.push(xs[i]);
    if (i < xs.length - 1) {
      const fa = fn(xs[i]) - y, fb = fn(xs[i + 1]) - y;
      if (fa * fb < 0) pts.push(xs[i] + (xs[i + 1] - xs[i]) * fa / (fa - fb));
    }
  }
  let best = null, cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const m = (pts[i] + pts[i + 1]) / 2;
    if (fn(m) >= y - 0.01) { if (!cur) cur = [pts[i], pts[i + 1]]; else cur[1] = pts[i + 1]; }
    else { if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur; cur = null; }
  }
  if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
  return best;
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
  const segs = segments(d);
  const shaped = !!(d.shape && d.shape.on);
  const fOut = x => topOuter(d, x, segs);
  const gIn = x => topInner(d, x, segs);
  const breaks = [...profile(d).map(p => p[0]), ...innerPts(d, segs).map(p => p[0])];
  const mods = modules(d);

  const parts = [], handles = [], rails = [], picks = [], warnings = [];
  const maxL = d.sheet.L - 2 * d.sheet.margin, maxB = d.sheet.W - 2 * d.sheet.margin;
  const hw = new Map();
  const addHW = (key, qty, unit = 'st') => { const e = hw.get(key) || { name: key, qty: 0, unit }; e.qty += qty; hw.set(key, e); };

  const panel = (name, group, mat, tt, box, thin, grain, extra = {}) => {
    if (!grain) {
      const s = [box[1] - box[0], box[3] - box[2], box[5] - box[4]];
      const c = ['x', 'y', 'z'].filter(a => a !== thin);
      grain = s[AX[c[0]]] >= s[AX[c[1]]] ? c[0] : c[1];
    }
    const p = { name, group, mat, t: tt, box, thin, grain, holes: [], notes: [], meta: {}, ...extra };
    parts.push(p);
    return p;
  };
  const hole = (p, pos, dia, dir, kind) => p.holes.push({ p: pos, d: dia, dir, kind });

  const colRight = i => colX(d, i) + d.columns[i].w;
  const modOf = ci => mods.find(m => ci >= m.c0 && ci <= m.c1);

  const shelfCenters = ci => {
    const col = d.columns[ci], out = [];
    for (let k = 0; k < col.cells.length - 1; k++) out.push({ k, y: cellY(d, ci, k).bot - t / 2, top: cellY(d, ci, k).bot, loose: col.loose[k] });
    return out;
  };
  const zDowels = dowelPositions(zB, zF);
  const pinRows = [zB + 37, zF - 37];
  const colHasLoose = ci => d.columns[ci].loose.some(Boolean);
  const pinYs = (xFace) => { const out = []; const top = Math.min(gIn(xFace), H - t) - 96; for (let y = P + t + 96; y <= top; y += 32) out.push(y); return out; };

  // planken eerst bepalen (lengte kan door schuine bovenrand korter worden)
  const shelfSpan = {}; // `${ci}:${k}` -> [xa, xb]
  d.columns.forEach((col, ci) => {
    const x0 = colX(d, ci), w = col.w;
    for (let k = 0; k < col.cells.length - 1; k++) {
      const yTop = cellY(d, ci, k).bot;
      const iv = shaped ? intervalAbove(gIn, x0, x0 + w, yTop, breaks) : [x0, x0 + w];
      if (!iv || iv[1] - iv[0] < 60) { warnings.push(`Kolom ${ci + 1}: plank ${k + 1} past niet onder de schuine bovenrand.`); continue; }
      shelfSpan[`${ci}:${k}`] = iv;
    }
  });
  const shelfTouches = (ci, k, x) => { const iv = shelfSpan[`${ci}:${k}`]; return iv && Math.abs(iv[0] - x) < 0.5 || iv && Math.abs(iv[1] - x) < 0.5; };

  // ---------- per module het korpus ----------
  mods.forEach((m, mi) => {
    const lbl = mods.length > 1 ? ` (module ${mi + 1})` : '';
    const mx0 = m.x0, mx1 = m.x1;
    // zijwanden
    for (const [side, xa] of [['links', mx0], ['rechts', mx1 - t]]) {
      const hTop = Math.max(gIn(xa), gIn(xa + t));
      const p = panel(`Zijwand ${side}${lbl}`, 'korpus', cm, t, [xa, xa + t, 0, hTop, zB, zF], 'x', 'y', { meta: { module: mi, role: 'side' } });
      if (Math.abs(gIn(xa) - gIn(xa + t)) > 0.5) p.notes.push(`bovenkant afschuinen ${bevelDeg(segs, xa)}°`);
      const xFace = side === 'links' ? xa + t : xa, dir = side === 'links' ? 1 : -1;
      const ci = side === 'links' ? m.c0 : m.c1;
      for (const z of zDowels) hole(p, [xFace, P + t / 2, z], 8, dir, 'deuvel');
      for (const s of shelfCenters(ci)) if (!s.loose && shelfTouches(ci, s.k, xFace)) for (const z of zDowels) hole(p, [xFace, s.y, z], 8, dir, 'deuvel');
      if (colHasLoose(ci)) for (const y of pinYs(xFace)) for (const z of pinRows) hole(p, [xFace, y, z], 5, dir, 'pin');
      m[side] = p;
    }
    // bodem
    const bottom = panel(`Bodem${lbl}`, 'korpus', cm, t, [mx0 + t, mx1 - t, P, P + t, zB, zF], 'y', 'x', { meta: { module: mi, role: 'bottom' } });
    // tussenschotten binnen de module
    const divCenters = [];
    for (let i = m.c0; i < m.c1; i++) {
      const xl = colRight(i);
      const hTop = Math.max(gIn(xl), gIn(xl + t));
      if (hTop < P + t + 60) { warnings.push(`Tussenschot ${i + 1} is te laag onder de bovenrand.`); continue; }
      const dv = panel(`Tussenschot ${i + 1}`, 'korpus', cm, t, [xl, xl + t, P + t, hTop, zB, zF], 'x', 'y', { meta: { drag: 'divider', i, module: mi } });
      if (Math.abs(gIn(xl) - gIn(xl + t)) > 0.5) dv.notes.push(`bovenkant afschuinen ${bevelDeg(segs, xl)}°`);
      divCenters.push(xl + t / 2);
      for (const [ci, xFace, dir] of [[i, xl, -1], [i + 1, xl + t, 1]]) {
        for (const s of shelfCenters(ci)) if (!s.loose && shelfTouches(ci, s.k, xFace)) for (const z of zDowels) hole(dv, [xFace, s.y, z], 8, dir, 'deuvel');
        if (colHasLoose(ci)) for (const y of pinYs(xFace)) for (const z of pinRows) hole(dv, [xFace, y, z], 5, dir, 'pin');
      }
      for (const z of zDowels) hole(bottom, [xl + t / 2, P + t, z], 8, 1, 'deuvel');
    }
    // bovenblad(en): één per segment van de bovenrand binnen de module
    const xsAll = [mx0, ...profile(d).map(p => p[0]).filter(x => x > mx0 + 1 && x < mx1 - 1), mx1];
    const topHoleXs = [mx0 + t / 2, mx1 - t / 2, ...divCenters];
    for (let i = 0; i < xsAll.length - 1; i++) {
      const xa = xsAll[i], xb = xsAll[i + 1];
      const sg = segs.find(s => (xa + xb) / 2 >= s.x0 - 1e-6 && (xa + xb) / 2 <= s.x1 + 1e-6);
      const name = (xsAll.length > 2 ? `Bovenblad ${i + 1}` : 'Bovenblad') + lbl;
      let p;
      if (Math.abs(sg.k) < 1e-6) {
        p = panel(name, 'korpus', cm, t, [xa, xb, sg.y0 - t, sg.y0, zB, zF], 'y', 'x', { meta: { module: mi, role: 'top' } });
        for (const x of topHoleXs) if (x > xa && x < xb) for (const z of zDowels) hole(p, [x, sg.y0 - t, z], 8, -1, 'deuvel');
      } else {
        p = slopedPanel(name, sg, xa, xb, i === 0, i === xsAll.length - 2, mi);
        for (const x of topHoleXs) if (x > xa && x < xb) for (const z of zDowels) hole(p, [x, gIn(x), z], 8, -1, 'deuvel');
      }
      // verstek aan knikken
      const kinks = [];
      if (i > 0) kinks.push(xa); if (i < xsAll.length - 2) kinks.push(xb);
      if (kinks.length) p.notes.push('verstek aan knik');
    }
    // plint
    if (P > 0) {
      const s = d.plinth.setback;
      const pls = [panel(`Plint voor${lbl}`, 'plint', cm, t, [mx0 + t, mx1 - t, 0, P, zF - s - t, zF - s], 'z', 'x', { meta: { module: mi } })];
      if (zF - s - t > zB + 2 * t + 40) pls.push(panel(`Plint achter${lbl}`, 'plint', cm, t, [mx0 + t, mx1 - t, 0, P, zB, zB + t], 'z', 'x', { meta: { module: mi } }));
      else if (mi === 0) warnings.push('Plint-terugsprong is zo diep dat er geen achterplint past.');
      const ys = P >= 90 ? [P / 3, 2 * P / 3] : [P / 2];
      for (const pl of pls) {
        const zc = (pl.box[4] + pl.box[5]) / 2;
        for (const y of ys) { hole(m.links, [mx0 + t, y, zc], 8, 1, 'deuvel'); hole(m.rechts, [mx1 - t, y, zc], 8, -1, 'deuvel'); }
      }
    }
    // achterwand (zo nodig gesplitst op het hart van een tussenschot)
    if (d.back) {
      const fitsSheet = (w, h) => (w <= maxB && h <= maxL) || (w <= maxL && h <= maxB);
      const hMax = clipUnder(mx0, mx1, P, H, fOut, breaks).maxY - P;
      const cuts = [mx0];
      if (!fitsSheet(mx1 - mx0, hMax)) {
        let cur = mx0;
        while (!fitsSheet(mx1 - cur, hMax)) {
          const lim = hMax <= maxB ? maxL : maxB;
          const c = divCenters.filter(x => x > cur + 100 && x - cur <= lim).pop();
          if (c === undefined) { warnings.push(`Achterwand${lbl} past niet op de plaat; voeg een tussenschot toe.`); break; }
          cuts.push(c); cur = c;
        }
      }
      cuts.push(mx1);
      for (let i = 0; i < cuts.length - 1; i++) {
        const c = clipUnder(cuts[i], cuts[i + 1], P, H, fOut, breaks);
        const nm = `Achterwand${cuts.length > 2 ? ' ' + String.fromCharCode(65 + i) : ''}${lbl}`;
        const bp = panel(nm, 'achterwand', cm, bt, [cuts[i], cuts[i + 1], P, c.maxY, 0, bt], 'z', null, { meta: { module: mi } });
        if (c.clipped) bp.prism = { poly: c.poly, z0: 0, z1: bt };
      }
      if (cuts.length > 2) warnings.push(`Achterwand${lbl} is in ${cuts.length - 1} delen gesplitst op het hart van een tussenschot.`);
      addHW('Schroef 3,5×16 (achterwand)', Math.ceil((2 * (mx1 - mx0) + 2 * hMax + (m.c1 - m.c0 + cuts.length - 2) * hMax) / 150));
    }
  });
  if (mods.length > 1) {
    for (let i = 0; i < mods.length - 1; i++) {
      const h = Math.min(gIn(mods[i].x1), H) - P;
      addHW('Kastverbinder (verbindingsschroef Ø5)', Math.max(4, 2 * Math.ceil(h / 450)));
    }
    warnings.push(`De kast is opgedeeld in ${mods.length} modules van max. ${d.sheet.L - 2 * d.sheet.margin} mm, met kastverbinders gekoppeld.`);
  }

  function slopedPanel(name, sg, xa, xb, firstInMod, lastInMod, mi) {
    // binnenhoeken: snijpunt met buurlijnen of verticale snede op module/kastgrens
    const A = [xa, fOut(xa)], B = [xb, fOut(xb)];
    const Ai = [xa, gIn(xa)], Bi = [xb, gIn(xb)];
    // knik binnen kast: binnenhoek ligt op het verstekpunt
    const ip = innerPts(d, segs);
    const near = x => ip.find(p => Math.abs(p[0] - x) < Math.abs(sg.x1 - sg.x0)) ;
    if (!firstInMod && xa > 0.5) { const q = ip.reduce((b, p) => Math.abs(p[0] - xa) < Math.abs(b[0] - xa) ? p : b); Ai[0] = q[0]; Ai[1] = q[1]; }
    if (!lastInMod && xb < W - 0.5) { const q = ip.reduce((b, p) => Math.abs(p[0] - xb) < Math.abs(b[0] - xb) ? p : b); Bi[0] = q[0]; Bi[1] = q[1]; }
    void near;
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const u = [(B[0] - A[0]) / len, (B[1] - A[1]) / len, 0];
    const N = [-u[1], u[0], 0];
    // projecties langs u t.o.v. A
    const pr = q => (q[0] - A[0]) * u[0] + (q[1] - A[1]) * u[1];
    const us = [0, len, pr(Ai), pr(Bi)];
    const umin = Math.min(...us), umax = Math.max(...us);
    const o = [A[0] + u[0] * umin - N[0] * t, A[1] + u[1] * umin - N[1] * t, zF];
    const ys = [A[1], B[1], Ai[1], Bi[1]], xs = [A[0], B[0], Ai[0], Bi[0]];
    const p = panel(name, 'korpus', cm, t, [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), zB, zF], 'n', 'u', {
      meta: { module: mi, role: 'top', sloped: true },
      frame: { o, u, v: [0, 0, -1], n: N, L: umax - umin, B: Ds },
      prism: { poly: [Ai, Bi, B, A], z0: zB, z1: zF },
    });
    const ang = Math.round(Math.abs(Math.atan(sg.k)) * 180 / Math.PI * 10) / 10;
    p.notes.push(`helling ${ang}°`);
    return p;
  }

  // ---------- legplanken ----------
  d.columns.forEach((col, ci) => {
    for (let k = 0; k < col.cells.length - 1; k++) {
      const iv = shelfSpan[`${ci}:${k}`]; if (!iv) continue;
      const y = cellY(d, ci, k).bot;
      const loose = col.loose[k];
      const box = loose ? [iv[0] + 1, iv[1] - 1, y - t, y, zB + 2, zF - 2] : [iv[0], iv[1], y - t, y, zB, zF];
      const p = panel(loose ? 'Legplank (los)' : 'Legplank', 'korpus', cm, t, box, 'y', 'x', { meta: { drag: 'shelf', col: ci, k, loose } });
      if (loose) addHW('Planksteun Ø5 mm', 4);
    }
    col.cells.forEach((c, k) => {
      const x0 = colX(d, ci), cy = cellY(d, ci, k);
      const cl = shaped ? clipUnder(x0, x0 + col.w, cy.bot, cy.top, gIn, breaks) : null;
      picks.push({ col: ci, k, x0, x1: x0 + col.w, y0: cy.bot, y1: cl ? cl.maxY : cy.top, poly: cl && cl.clipped ? cl.poly : null });
    });
  });

  // ---------- fronten ----------
  const animIds = { n: 0 };
  const handleType = d.handle.type;
  const finishLabel = FINISHES[d.handle.finish]?.label || '';
  const frontTop = x => fOut(x);

  d.columns.forEach((col, ci) => {
    const m = col.cells.length, mod = modOf(ci);
    const x0c = colX(d, ci), w = col.w;
    let k = 0;
    while (k < m) {
      const cell = col.cells[k];
      const span = cell.span, k1 = k + span - 1;
      if (cell.front !== 'none') {
        const outerL = ci === mod.c0, outerR = ci === mod.c1, outerT = k === 0, outerB = k1 === m - 1;
        const g = GAP / 2;
        // bij modulegrens: voeg tussen de modules
        let xl = outerL ? mod.x0 + (ci === 0 ? 0 : g) : x0c - t / 2 + g;
        let xr = outerR ? mod.x1 - (ci === n - 1 ? 0 : g) : x0c + w + t / 2 - g;
        let yt = outerT ? Math.max(cellY(d, ci, k).top + t, H) : cellY(d, ci, k).top + t / 2 - g;
        let yb = outerB ? (P > 0 ? P : g) : cellY(d, ci, k1).bot - t / 2 + g;
        if (outerT && !shaped) yt = H;
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
          const clip = clipUnder(lf.x0, lf.x1, yb, yt, x => frontTop(x) - (outerT ? 0 : 0), breaks);
          const ytop = clip.maxY;
          const box = [lf.x0, lf.x1, yb, ytop, zF, zF + tf];
          const fp = panel(name, 'front', fm, tf, box, 'z', isDrawer || isFlap ? 'x' : 'y', {
            meta: { col: ci, k0: k, k1, type, hinge: lf.hinge, anim: { id: animId, kind: isDrawer ? 'drawer' : 'hinge', hinge: lf.hinge } },
          });
          if (clip.clipped) fp.prism = { poly: clip.poly, z0: zF, z1: zF + tf };
          const topAt = x => Math.min(ytop, frontTop(x));
          if (lf.hinge) {
            const vertical = lf.hinge === 'l' || lf.hinge === 'r';
            const xe = lf.hinge === 'l' ? lf.x0 + HINGE_EDGE : lf.x1 - HINGE_EDGE;
            const ye = lf.hinge === 't' ? Math.min(topAt(lf.x0), topAt(lf.x1)) - HINGE_EDGE : yb + HINGE_EDGE;
            const a = vertical ? yb : lf.x0, b = vertical ? topAt(xe) : lf.x1;
            const len = b - a;
            const cnt = hingeCount(len);
            const outer = (lf.hinge === 'l' && outerL && lf.x0 === xl) || (lf.hinge === 'r' && outerR && lf.x1 === xr)
              || (lf.hinge === 't' && outerT) || (lf.hinge === 'b' && outerB);
            for (const v of evenly(a, b, cnt, Math.min(100, len / 4))) {
              hole(fp, vertical ? [xe, v, zF] : [v, ye, zF], POT_D, -1, 'pot');
            }
            if (lf.hinge === 't' && clip.clipped) warnings.push(`Kolom ${ci + 1}: klep omhoog onder een schuine rand — controleer de scharnierlijn.`);
            addHW(`Potscharnier 110° ${outer ? 'vol opdek' : 'half opdek'} incl. montageplaat`, cnt);
            if (lf.hinge === 't') addHW('Kleplift (opwaarts, set)', 1);
            if (lf.hinge === 'b') addHW('Klepsteun (neerwaarts, set)', 1);
            if (handleType === 'push') addHW('Push-to-open drukschakelaar', 1);
          }
          if (handleType !== 'push') handles.push(placeHandle(handleType, type, lf, yb, ytop, topAt, zF + tf, animId));
          if (isDrawer) {
            const cy = cellY(d, ci, k);
            const room = innerRange(d, x0c, x0c + w, segs).min - cy.bot - 15;
            buildDrawer({ x0: x0c, w, yb: cy.bot, h: cell.h, animId, zFront: zF - 2, push: handleType === 'push', maxH: Math.min(cell.h - 40, room), where: `Kolom ${ci + 1}, vak ${k + 1}: ` });
          }
        }
      }
      k += span;
    }
  });

  // interieur
  d.columns.forEach((col, ci) => {
    const x0 = colX(d, ci), w = col.w;
    const gMin = innerRange(d, x0, x0 + w, segs).min;
    col.cells.forEach((cell, k) => {
      let ownerK = k; { let j = 0; while (j < col.cells.length) { const s = col.cells[j].span; if (k >= j && k < j + s) { ownerK = j; break; } j += s; } }
      const owner = col.cells[ownerK];
      if (owner.front === 'drawer') return;
      const cy = cellY(d, ci, k);
      if (cell.interior === 'rail') {
        const y = Math.min(cy.top, gMin) - 55;
        rails.push({ x0, x1: x0 + w, y, z: (zB + zF) / 2 });
        addHW(`Garderobestang ovaal, lengte ${Math.round(w - 2)} mm`, 1);
        addHW('Garderobestangdrager', 2);
        if (y - cy.bot < 650) warnings.push(`Kolom ${ci + 1}, vak ${k + 1}: garderobestang in een vak lager dan 700 mm.`);
      } else if (cell.interior === 'inner') {
        const q = cell.count, ft = owner.front;
        let sL = 0, sR = 0;
        if (ft === 'door-l' || ft === 'door-dbl') sL = 20;
        if (ft === 'door-r' || ft === 'door-dbl') sR = 20;
        if (sL || sR) addHW('Opvullat 20 mm voor ladegeleider (scharnierzijde)', 2 * q * ((sL ? 1 : 0) + (sR ? 1 : 0)));
        const top = Math.min(cy.top, gMin);
        const pitch = (top - cy.bot) / q;
        for (let j = 0; j < q; j++) {
          buildDrawer({ x0: x0 + sL, w: w - sL - sR, yb: cy.bot + j * pitch, h: pitch, animId: ++animIds.n, zFront: zF - 4, inner: true, push: false, maxH: pitch - 25, where: `Kolom ${ci + 1}, vak ${k + 1}: ` });
        }
      }
    });
  });

  function buildDrawer({ x0, w, yb, h, animId, zFront, inner = false, push, maxH, where = '' }) {
    const tb = d.drawerBoxT, tbot = d.thinT;
    const L = [...SLIDE_LENGTHS].reverse().find(l => l <= Ds - 12);
    if (!L) { warnings.push('Kast te ondiep voor ladegeleiders (min. 282 mm binnendiepte).'); return; }
    const bw = w - 2 * SLIDE_CLEAR;
    const hb = Math.min(maxH ?? (h - 40), 260);
    if (hb < 50) { warnings.push(`${where}${inner ? 'binnenlade' : 'lade'} is te laag (min. 50 mm ladebak) en is weggelaten.`); return; }
    const y0 = yb + (inner ? 10 : 15);
    const z1 = zFront, z0 = z1 - L;
    const x1 = x0 + SLIDE_CLEAR, x2 = x1 + bw;
    const yS = y0 + tbot, yT = y0 + hb;
    const anim = { id: animId, kind: 'drawer' };
    const lbl = inner ? 'Binnenlade' : 'Lade';
    const did = `${lbl}-${animId}`;
    const mk = (nm, tt, box, thin, grain) => panel(`${lbl} ${nm}`, 'lade', boxMat, tt, box, thin, grain, { meta: { anim, drawer: did, inner } });
    const sL = mk('zijkant', tb, [x1, x1 + tb, yS, yT, z0, z1], 'x', 'z');
    const sR = mk('zijkant', tb, [x2 - tb, x2, yS, yT, z0, z1], 'x', 'z');
    const fr = mk(inner ? 'voorkant' : 'binnenvoorkant', tb, [x1 + tb, x2 - tb, yS, yT, z1 - tb, z1], 'z', 'x');
    const bk = mk('achterkant', tb, [x1 + tb, x2 - tb, yS, yT, z0, z0 + tb], 'z', 'x');
    mk('bodem', tbot, [x1, x2, y0, yS, z0, z1], 'y', 'x');
    // deuvels: voor/achter in de zijkanten
    const ysD = dowelPositions(yS, yT).filter((v, i, a) => a.length <= 2 || i === 0 || i === a.length - 1);
    for (const [side, xf, dir] of [[sL, x1 + tb, 1], [sR, x2 - tb, -1]]) {
      for (const y of ysD) { hole(side, [xf, y, z1 - tb / 2], 6, dir, 'deuvel'); hole(side, [xf, y, z0 + tb / 2], 6, dir, 'deuvel'); }
    }
    void fr; void bk;
    addHW(`Ladegeleider volledig uittrekbaar ${L} mm${push ? ' met push-to-open' : ''} (paar)`, 1);
  }

  function placeHandle(htype, ftype, lf, yb, yt, topAt, z, animId) {
    const fw = lf.x1 - lf.x0;
    const cx = (lf.x0 + lf.x1) / 2;
    const def = HANDLE_TYPES[htype];
    const isEdge = htype === 'kant' || htype === 'lijst';
    const isDoor = ftype.startsWith('door');
    let len = def.len || 0;
    if (htype === 'lijst') len = Math.round(Math.min(isDoor ? 300 : 500, fw - 80));
    let x = cx, y, orient = 'h', edge = null;
    if (isDoor) x = lf.hinge === 'l' ? lf.x1 - (isEdge ? 30 + len / 2 : 40) : lf.x0 + (isEdge ? 30 + len / 2 : 40);
    const top = topAt(x);
    const cy = (yb + top) / 2, fh = top - yb;
    if (isEdge) {
      if (ftype === 'flap-up') edge = 'bottom';
      else if (ftype === 'drawer' || ftype === 'flap-down') edge = 'top';
      else edge = cy < 1100 ? 'top' : 'bottom';
      y = edge === 'top' ? top : yb;
      if (edge === 'top' && Math.abs(topAt(x - len / 2) - topAt(x + len / 2)) > 1) { edge = 'bottom'; y = yb; }
    } else if (isDoor) {
      orient = htype === 'knop' ? 'p' : 'v';
      const half = len / 2 + 60;
      y = Math.min(Math.max(1050, yb + half), top - half);
    } else {
      orient = htype === 'knop' ? 'p' : 'h';
      if (ftype === 'drawer') y = fh < 220 ? cy : top - 70;
      else if (ftype === 'flap-down') y = top - 50;
      else y = yb + 50;
    }
    addHW(`${def.label}${len && htype === 'lijst' ? ` ${len} mm` : ''} – ${finishLabel}`, 1);
    return { type: htype, x, y, z, orient, edge, len, animId };
  }

  // ---------- afronden: frames, lokale coördinaten ----------
  const order = { korpus: 0, plint: 1, achterwand: 2, front: 3, lade: 4 };
  parts.sort((p, q) => order[p.group] - order[q.group]);
  parts.forEach((p, i) => { p.num = i + 1; finalize(p); p.matLabel = matLabel(p.mat, p.t); });

  for (const p of parts) {
    const fits = (p.size.L <= maxL && p.size.B <= maxB) || (p.size.L <= maxB && p.size.B <= maxL);
    if (!fits) warnings.push(`Deel ${p.num} (${p.name}, ${Math.round(p.size.L)} × ${Math.round(p.size.B)}) past niet op de plaat.`);
  }
  // controle: elk boorgat moet binnen de plaat liggen, met marge
  for (const p of parts) for (const h of p.holes) {
    const mr = h.d / 2 + 2;
    if (h.u < mr - 0.01 || h.v < mr - 0.01 || h.u > p.size.L - mr + 0.01 || h.v > p.size.B - mr + 0.01) {
      warnings.push(`Boorgat Ø${h.d} in deel ${p.num} (${p.name}) ligt te dicht bij de rand.`);
      break;
    }
  }

  const dowelCount = parts.reduce((a, p) => a + p.holes.filter(h => h.kind === 'deuvel' && h.d === 8).length, 0);
  const dowel6 = parts.reduce((a, p) => a + p.holes.filter(h => h.kind === 'deuvel' && h.d === 6).length, 0);
  if (dowelCount) addHW('Deuvel beuken Ø8×35', dowelCount);
  if (dowel6) addHW('Deuvel beuken Ø6×30 (ladebakken)', dowel6);
  if (P === 0) addHW('Meubelglijder / viltje', 4 + (n - 1) * 2);

  return {
    parts, handles, rails, picks, warnings: [...new Set(warnings)],
    hardware: [...hw.values()], modules: mods,
    dims: { W, H, D, P, t, bt, zB, zF, Ds, tf, shaped, profile: profile(d), inner: innerPts(d, segs) },
  };
}

function bevelDeg(segs, x) {
  const s = segs.find(q => x >= q.x0 - 1e-6 && x <= q.x1 + 1e-6) || segs[0];
  return Math.round(Math.abs(Math.atan(s.k)) * 180 / Math.PI * 10) / 10;
}

// Frame en lokale (u,v) coördinaten
function finalize(p) {
  if (!p.frame) {
    const b = p.box;
    const ti = AX[p.thin], gi = AX[p.grain], oi = [0, 1, 2].find(i => i !== ti && i !== gi);
    const cyclic = (gi + 1) % 3 === oi;
    const u = E[gi], v = cyclic ? E[oi] : neg(E[oi]), nn = E[ti];
    const o = [b[0], b[2], b[4]];
    if (!cyclic) o[oi] = b[oi * 2 + 1];
    p.frame = { o, u, v, n: nn, L: b[gi * 2 + 1] - b[gi * 2], B: b[oi * 2 + 1] - b[oi * 2] };
  }
  const f = p.frame;
  const uv = q => { const r = sub(q, f.o); return [dot(r, f.u), dot(r, f.v)]; };
  p.size = { L: r1(f.L), B: r1(f.B), T: p.t };
  p.outline = p.prism && p.thin === 'z'
    ? p.prism.poly.map(([x, y]) => uv([x, y, p.prism.z0]))
    : [[0, 0], [f.L, 0], [f.L, f.B], [0, f.B]];
  for (const h of p.holes) { const [u, v] = uv(h.p); h.u = u; h.v = v; }
}
