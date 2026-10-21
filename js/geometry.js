// Zet een ontwerp om in concrete plaatdelen, fronten, grepen en beslag.
// Elk deel krijgt een lokaal assenstelsel (frame): u = lengte/nerf, v = breedte, n = dikte (zijde A).
import {
  plinthH, backT, colX, cellY, matLabel, HANDLE_TYPES, FINISHES, SLIDE_LENGTHS,
  segments, topOuter, topInner, innerPts, innerRange, profile, floorEnds,
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
  // alleen het deel waar de bovenlijn boven y0 ligt (voorkomt nul-hoge staarten bij een rand tot de vloer)
  const tr = intervalAbove(topFn, x0, x1, y0 + 0.5, breaks);
  if (tr) { x0 = Math.max(x0, tr[0]); x1 = Math.min(x1, tr[1]); }
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
  return { poly: out, clipped, maxY: Math.max(...tops.map(t => t[1])), minX: x0, maxX: x1 };
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
      // lengte op de onderzijde van de plank; tegen een schuine plaat krijgt de kop een schuine snede
      const iv = shaped ? intervalAbove(gIn, x0, x0 + w, yTop - t, breaks) : [x0, x0 + w];
      if (!iv || iv[1] - iv[0] < 60) { warnings.push(`Kolom ${ci + 1}: plank ${k + 1} past niet onder de schuine bovenrand.`); continue; }
      // een eind is alleen een wandaansluiting als de hele plankdikte onder de schuine lijn past
      const ivTop = shaped ? intervalAbove(gIn, x0, x0 + w, yTop + 1, breaks) : iv;
      iv.wallL = !!ivTop && Math.abs(ivTop[0] - x0) < 0.5 && Math.abs(iv[0] - x0) < 0.5;
      iv.wallR = !!ivTop && Math.abs(ivTop[1] - (x0 + w)) < 0.5 && Math.abs(iv[1] - (x0 + w)) < 0.5;
      shelfSpan[`${ci}:${k}`] = iv;
    }
  });
  const shelfTouches = (ci, k, x) => { const iv = shelfSpan[`${ci}:${k}`]; return !!iv && ((iv.wallL && Math.abs(iv[0] - x) < 0.5) || (iv.wallR && Math.abs(iv[1] - x) < 0.5)); };

  // ---------- verbindingen ----------
  // A ontvangt in zijn vlak; B sluit er met zijn kopse kant op aan.
  const JS = d.joinery || 'deuvel';
  const jointCount = { deuvel: 0, confirmat: 0, cabineo: 0 };
  const connect = (A, pA, dirA, outward, B, bFace) => {
    if (JS === 'confirmat') hole(A, pA, 7, dirA, 'confirmat');
    else if (JS === 'cabineo') {
      hole(A, pA, 5, dirA, 'cab-pilot');
      if (B && bFace) {
        const q = pA.map((v, i) => v + outward[i] * 10);
        q[bFace.axis] = bFace.value;
        hole(B, q, 12, bFace.dir, 'cabineo');
      }
    } else hole(A, pA, 8, dirA, 'deuvel');
    jointCount[JS]++;
  };
  const zAlt = zDowels.map(z => (z < (zB + zF) / 2 ? z + 32 : z - 32));

  // ---------- naden: bladen/bodem langer dan de plaat ----------
  // naad op het hart van een tussenschot: elk deel ligt 9 mm (t/2) op het schot.
  // Het schot wordt daar niet gedeuveld (de naad zit op die plek) maar met hoekverbinders vastgezet.
  const seamCands = d.columns.slice(0, -1).map((c, i) => colRight(i) + t / 2);
  const seams = [];
  {
    let cur = 0;
    const pieces = Math.ceil(W / maxL);
    while (W - cur > maxL) {
      const target = (seams.length + 1) * W / pieces;
      const cands = seamCands.filter(x => x > cur + 150 && x - cur <= maxL && W - x > 150);
      if (!cands.length) { warnings.push(`De kast is breder dan de plaat (${maxL} mm): voeg een tussenschot toe binnen ${maxL} mm van de vorige naad.`); break; }
      const c = cands.reduce((bb, x) => (Math.abs(x - target) < Math.abs(bb - target) ? x : bb), cands[0]);
      seams.push(c); cur = c;
    }
  }
  const pieceName = (base, i, nPieces) => (nPieces > 1 ? `${base} ${String.fromCharCode(65 + i)}` : base);

  // ---------- korpus ----------
  const FE = floorEnds(d);
  const brackets = [];
  const slopeDeg = x => bevelDeg(segs, x);
  const floorIv = shaped && (FE.links || FE.rechts) ? intervalAbove(gIn, 0, W, P, breaks) : null;
  const sideParts = {};
  for (const [side, xa] of [['links', 0], ['rechts', W - t]]) {
    if (FE[side]) continue; // schuin blad loopt tot de vloer: geen zijwand
    const hTop = innerRange(d, xa, xa + t, segs).max;
    const p = panel(`Zijwand ${side}`, 'korpus', cm, t, [xa, xa + t, 0, hTop, zB, zF], 'x', 'y', { meta: { role: 'side' } });
    if (Math.abs(gIn(xa) - gIn(xa + t)) > 0.5) p.bevels = [{ end: 'u1', angle: bevelDeg(segs, xa), longA: gIn(xa + t) > gIn(xa) }];
    sideParts[side] = p;
  }
  // bodem(en)
  const xL0 = FE.links ? floorIv[0] : t, xR0 = FE.rechts ? floorIv[1] : W - t;
  const bEdges = [xL0, ...seams, xR0];
  const bottoms = [];
  for (let i = 0; i < bEdges.length - 1; i++) {
    const bp = panel(pieceName('Bodem', i, bEdges.length - 1), 'korpus', cm, t, [bEdges[i], bEdges[i + 1], P, P + t, zB, zF], 'y', 'x', { meta: { role: 'bottom' } });
    const atL = i === 0 && FE.links, atR = i === bEdges.length - 2 && FE.rechts;
    if (atL || atR) {
      const c = clipUnder(bEdges[i], bEdges[i + 1], P, P + t, gIn, breaks);
      bp.prism = { poly: c.poly, z0: zB, z1: zF };
      bp.bevels = [];
      if (atL) bp.bevels.push({ end: 'u0', angle: Math.round((90 - slopeDeg(xL0 + 1)) * 10) / 10, longA: false });
      if (atR) bp.bevels.push({ end: 'u1', angle: Math.round((90 - slopeDeg(xR0 - 1)) * 10) / 10, longA: false });
    }
    bottoms.push(bp);
  }
  const bottomAt = x => bottoms.find(b => x > b.box[0] && x < b.box[1]);
  // zijwand ↔ bodem
  for (const [side, xFace, dir] of [['links', t, 1], ['rechts', W - t, -1]]) {
    if (!sideParts[side]) continue;
    const B = bottomAt(side === 'links' ? t + 1 : W - t - 1);
    for (const z of zDowels) connect(sideParts[side], [xFace, P + t / 2, z], dir, [dir, 0, 0], B, { axis: 1, value: P, dir: -1 });
  }
  // zijwand ↔ vaste planken + gaatjesrij
  for (const [side, xFace, dir, ci] of [['links', t, 1, 0], ['rechts', W - t, -1, n - 1]]) {
    const sp = sideParts[side];
    if (!sp) continue;
    for (const s of shelfCenters(ci)) if (!s.loose && shelfTouches(ci, s.k, xFace)) for (const z of zDowels) connect(sp, [xFace, s.y, z], dir, [dir, 0, 0], null, null);
    if (colHasLoose(ci)) for (const y of pinYs(xFace)) for (const z of pinRows) hole(sp, [xFace, y, z], 5, dir, 'pin');
  }
  // bodem ↔ schuin blad aan een eind dat tot de vloer loopt
  for (const [side, x, s] of [['links', xL0, -1], ['rechts', xR0, 1]]) {
    if (!FE[side]) continue;
    const xTop = side === 'links' ? intervalAbove(gIn, 0, W, P + t, breaks)[0] : intervalAbove(gIn, 0, W, P + t, breaks)[1];
    for (const z of zDowels) brackets.push({ x: xTop - s * 30, side: s, y: P + t, z, where: 'voet' });
  }
  // tussenschotten
  const divCenters = [], dividers = [];
  const isSeam = x => seams.some(sx => Math.abs(sx - x) < 0.5);
  for (let i = 0; i < n - 1; i++) {
    const xl = colRight(i);
    const hTop = innerRange(d, xl, xl + t, segs).max;
    if (hTop < P + t + 60) { warnings.push(`Tussenschot ${i + 1} is te laag onder de bovenrand.`); continue; }
    const dv = panel(`Tussenschot ${i + 1}`, 'korpus', cm, t, [xl, xl + t, P + t, hTop, zB, zF], 'x', 'y', { meta: { drag: 'divider', i } });
    if (Math.abs(gIn(xl) - gIn(xl + t)) > 0.5) {
      const kinkIn = innerPts(d, segs).some(q => q[0] > xl + 0.5 && q[0] < xl + t - 0.5);
      dv.bevels = [{ end: 'u1', angle: Math.max(bevelDeg(segs, xl + 0.1), bevelDeg(segs, xl + t - 0.1)), longA: gIn(xl + t) > gIn(xl), half: kinkIn }];
    }
    divCenters.push(xl + t / 2); dividers.push(dv);
    const leftYs = shelfCenters(i).filter(s => !s.loose && shelfTouches(i, s.k, xl)).map(s => s.y);
    for (const [ci, xFace, dir] of [[i, xl, -1], [i + 1, xl + t, 1]]) {
      for (const s of shelfCenters(ci)) if (!s.loose && shelfTouches(ci, s.k, xFace)) {
        const clash = dir > 0 && leftYs.some(y => Math.abs(y - s.y) < 16);
        for (const z of clash ? zAlt : zDowels) connect(dv, [xFace, s.y, z], dir, [dir, 0, 0], null, null);
      }
      if (colHasLoose(ci)) for (const y of pinYs(xFace)) for (const z of pinRows) hole(dv, [xFace, y, z], 5, dir, 'pin');
    }
    if (isSeam(xl + t / 2)) {
      dv.meta.seam = true;
      // naad in de bodem: schot aan beide zijden met hoekverbinders op de bodem
      for (const [xf, side] of [[xl, -1], [xl + t, 1]]) for (const z of zDowels) brackets.push({ x: xf, side, y: P + t, z, where: 'bodem' });
    } else {
      const B = bottomAt(xl + t / 2);
      for (const z of zDowels) connect(B, [xl + t / 2, P + t, z], 1, [0, 1, 0], dv, { axis: 0, value: xl, dir: -1 });
    }
  }
  // naden in het bovenblad: los van de bodem, alleen waar een bladdeel (gemeten langs de helling) langer is dan de plaat
  const knots = [...new Set([0, W, ...profile(d).map(p => p[0])].map(x => Math.round(x * 100) / 100))].sort((p, q) => p - q);
  const along = (a, b) => Math.hypot(b - a, fOut(b) - fOut(a)) + 2 * t;
  const topSeams = [];
  for (let i = 0; i < knots.length - 1; i++) {
    let a = knots[i]; const b = knots[i + 1];
    let guard = 0;
    while (along(a, b) > maxL && guard++ < 10) {
      const n2 = Math.ceil(along(a, b) / maxL);
      const target = a + (b - a) / n2;
      const cands = divCenters.filter(x => x > a + 100 && x < b - 100 && along(a, x) <= maxL);
      if (!cands.length) { warnings.push(`Bovenblad tussen x = ${Math.round(a)} en ${Math.round(b)} is langer dan de plaat; voeg een tussenschot toe om het te kunnen splitsen.`); break; }
      const c = cands.reduce((bb, x) => (Math.abs(x - target) < Math.abs(bb - target) ? x : bb), cands[0]);
      topSeams.push(c); a = c;
    }
  }
  for (const dv of dividers) {
    const xc = dv.box[0] + t / 2;
    if (!topSeams.some(x => Math.abs(x - xc) < 0.5)) continue;
    dv.meta.topSeam = true;
    const yTopIn = innerRange(d, dv.box[0], dv.box[1], segs).min;
    for (const [xf, side] of [[dv.box[0], -1], [dv.box[1], 1]]) for (const z of zDowels) brackets.push({ x: xf, side, y: yTopIn, z, where: 'blad' });
  }
  // knik in de bovenrand die niet boven een wand of schot ligt
  for (const [kx] of profile(d).slice(1, -1)) {
    const near = [t / 2, W - t / 2, ...divCenters].reduce((bb, x) => (Math.abs(x - kx) < Math.abs(bb - kx) ? x : bb));
    if (Math.abs(near - kx) > t / 2) warnings.push(`De knik in de bovenrand op x = ${Math.round(kx)} ligt niet boven een schot; zet hem op x = ${Math.round(near)} (hart schot), dan wordt het verstek gedragen.`);
  }
  const xsAll = [...new Set([...knots, ...topSeams].map(x => Math.round(x * 100) / 100))].sort((p, q) => p - q);
  const vertical = [0, W, ...topSeams];
  const topHoles = [
    { x: t / 2, B: sideParts.links, bFace: { axis: 0, value: t, dir: 1 } },
    { x: W - t / 2, B: sideParts.rechts, bFace: { axis: 0, value: W - t, dir: -1 } },
    ...dividers.filter(dv => !dv.meta.topSeam).map(dv => ({ x: dv.box[0] + t / 2, B: dv, bFace: { axis: 0, value: dv.box[0], dir: -1 } })),
  ];
  for (let i = topHoles.length - 1; i >= 0; i--) if (!topHoles[i].B) topHoles.splice(i, 1);
  const nTop = xsAll.length - 1;
  for (let i = 0; i < nTop; i++) {
    const xa = xsAll[i], xb = xsAll[i + 1];
    const sg = segs.find(q => (xa + xb) / 2 >= q.x0 - 1e-6 && (xa + xb) / 2 <= q.x1 + 1e-6);
    const name = nTop > 1 ? `Bovenblad ${i + 1}` : 'Bovenblad';
    let p;
    if (!shaped) {
      p = panel(name, 'korpus', cm, t, [xa, xb, sg.y0 - t, sg.y0, zB, zF], 'y', 'x', { meta: { role: 'top' } });
      for (const th of topHoles) if (th.x > xa && th.x < xb) for (const z of zDowels) connect(p, [th.x, sg.y0 - t, z], -1, [0, -1, 0], th.B, th.bFace);
    } else {
      p = slopedPanel(name, sg, xa, xb, vertical.some(v => Math.abs(v - xa) < 0.5), vertical.some(v => Math.abs(v - xb) < 0.5));
      const Nn = p.frame.n;
      const angle = Math.abs(Math.atan(sg.k)) * 180 / Math.PI;
      if (angle <= 10) {
        for (const th of topHoles) if (th.x > xa && th.x < xb) for (const z of zDowels) connect(p, [th.x, gIn(th.x), z], -1, [-Nn[0], -Nn[1], 0], th.B, th.bFace);
      } else {
        // loodrecht boren loopt bij een helling > 10° de kopse kant van de 18 mm-plaat uit: hoekverbinders
        p.meta.brackets = true;
        for (const th of topHoles) if (th.x > xa && th.x < xb) {
          const faces = th.B === sideParts.links ? [[t, 1]] : th.B === sideParts.rechts ? [[W - t, -1]] : [[th.x - t / 2, -1], [th.x + t / 2, 1]];
          for (const [xf, side] of faces) {
            const yy = Math.min(gIn(xf), gIn(xf + side * 20));
            for (const z of zDowels) brackets.push({ x: xf, side, y: yy, z, where: 'schuin' });
          }
        }
      }
    }
  }
  // plint
  if (P > 0) {
    const s = d.plinth.setback;
    const edges = [xL0 + (FE.links ? 1 : 0), ...seams, xR0 - (FE.rechts ? 1 : 0)];
    const rows = [['voor', zF - s - t, zF - s, -1]];
    if (zF - s - t > zB + 2 * t + 40) rows.push(['achter', zB, zB + t, 1]);
    else warnings.push('Plint-terugsprong is zo diep dat er geen achterplint past.');
    const ys = P >= 90 ? [P / 3, 2 * P / 3] : [P / 2];
    for (const [nm, z0, z1, inDir] of rows) {
      for (let i = 0; i < edges.length - 1; i++) {
        const pl = panel(pieceName(`Plint ${nm}`, i, edges.length - 1), 'plint', cm, t, [edges[i], edges[i + 1], 0, P, z0, z1], 'z', 'x', { meta: {} });
        const zc = (z0 + z1) / 2, zFace = inDir < 0 ? z0 : z1;
        if (i === 0) {
          if (sideParts.links) for (const y of ys) connect(sideParts.links, [t, y, zc], 1, [1, 0, 0], pl, { axis: 2, value: zFace, dir: inDir });
          else brackets.push({ x: edges[0] + 25, side: 1, y: P, z: zc + inDir * (t / 2 + 0.5) * -1, where: 'plint', zAxis: inDir });
        }
        if (i === edges.length - 2) {
          if (sideParts.rechts) for (const y of ys) connect(sideParts.rechts, [W - t, y, zc], -1, [-1, 0, 0], pl, { axis: 2, value: zFace, dir: inDir });
          else brackets.push({ x: edges[edges.length - 1] - 25, side: -1, y: P, z: zc + inDir * (t / 2 + 0.5) * -1, where: 'plint', zAxis: inDir });
        }
      }
    }
  }
  // naadverbinders
  if (seams.length || topSeams.length) {
    const per = Math.max(2, Math.ceil(Ds / 220));
    const nm = JS === 'cabineo' ? 'Lamello Clamex P-14 (naad blad/bodem)' : 'Werkbladverbinder 150 mm + lamello (naad blad/bodem)';
    addHW(nm, (seams.length + topSeams.length) * per);
    if (P > 0 && seams.length) addHW('Verbindingslat plint (achter de naad, gelijmd)', seams.length);
    const parts2 = [];
    if (seams.length) parts2.push(`bodem${P > 0 ? ' en plint' : ''}: ${seams.length} naad`);
    if (topSeams.length) parts2.push(`bovenblad: ${topSeams.length} naad`);
    warnings.push(`Langer dan de plaat (max. ${maxL} mm), daarom naden op het hart van een tussenschot (${parts2.join(', ')}); elk deel ligt ${t / 2} mm op het schot.`);
  }
  if (brackets.length) {
    addHW('Hoekverbinder staal 20×20×40 mm + 4 schroeven 3,5×16', brackets.length);
    if (brackets.some(b => b.where === 'schuin')) warnings.push('Schuine bladen (helling > 10°) worden met hoekverbinders op de wanden gezet; haaks boren zou de kopse kant uitlopen.');
  }
  // achterwand (zo nodig gesplitst op het hart van een tussenschot)
  if (d.back) {
    const fitsSheet = (w, h) => (w <= maxB && h <= maxL) || (w <= maxL && h <= maxB);
    const hMax = clipUnder(0, W, P, H, fOut, breaks).maxY - P;
    const cuts = [0];
    if (!fitsSheet(W, hMax)) {
      let cur = 0;
      while (!fitsSheet(W - cur, hMax)) {
        const lim = hMax <= maxB ? maxL : maxB;
        const c = divCenters.filter(x => x > cur + 100 && x - cur <= lim).pop();
        if (c === undefined) { warnings.push('Achterwand past niet op de plaat; voeg een tussenschot toe.'); break; }
        cuts.push(c); cur = c;
      }
    }
    cuts.push(W);
    for (let i = 0; i < cuts.length - 1; i++) {
      const c = clipUnder(cuts[i], cuts[i + 1], P, H, fOut, breaks);
      const bp = panel(pieceName('Achterwand', i, cuts.length - 1), 'achterwand', cm, bt, [cuts[i], cuts[i + 1], P, c.maxY, 0, bt], 'z', null, { meta: {} });
      if (c.clipped) bp.prism = { poly: c.poly, z0: 0, z1: bt };
    }
    if (cuts.length > 2) warnings.push(`Achterwand is in ${cuts.length - 1} delen gesplitst op het hart van een tussenschot.`);
    addHW('Schroef 3,5×16 (achterwand)', Math.ceil((2 * W + 2 * hMax + (n - 1 + cuts.length - 2) * hMax) / 150));
  }

  function slopedPanel(name, sg, xa, xb, cutA, cutB) {
    // binnenhoeken: snijpunt met buurlijnen of verticale snede op module/kastgrens
    const A = [xa, fOut(xa)], B = [xb, fOut(xb)];
    let Ai = [xa, gIn(xa)], Bi = [xb, gIn(xb)];
    // knik binnen kast: binnenhoek ligt op het verstekpunt
    const ip = innerPts(d, segs);
    const near = x => ip.find(p => Math.abs(p[0] - x) < Math.abs(sg.x1 - sg.x0)) ;
    if (!cutA) { const q = ip.reduce((b, p) => Math.abs(p[0] - xa) < Math.abs(b[0] - xa) ? p : b); Ai[0] = q[0]; Ai[1] = q[1]; }
    if (!cutB) { const q = ip.reduce((b, p) => Math.abs(p[0] - xb) < Math.abs(b[0] - xb) ? p : b); Bi[0] = q[0]; Bi[1] = q[1]; }
    void near;
    // tot de vloer: voet horizontaal afzagen (binnenlijn snijden met y = 0)
    const yInner = x => sg.y0 - sg.off + sg.k * (x - sg.x0);
    const xFloor = sg.x0 + (sg.off - sg.y0) / sg.k;
    if (Bi[1] < 0) Bi = [xFloor, 0];
    if (Ai[1] < 0) Ai = [xFloor, 0];
    void yInner;
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
      meta: { role: 'top', sloped: true },
      frame: { o, u, v: [0, 0, -1], n: N, L: umax - umin, B: Ds },
      prism: { poly: [Ai, Bi, B, A], z0: zB, z1: zF },
    });
    const ang = Math.round(Math.abs(Math.atan(sg.k)) * 180 / Math.PI * 10) / 10;
    if (ang > 0.05) p.notes.push(`helling ${String(ang).replace('.', ',')}°`);
    // schuine kopse kanten: hoek t.o.v. haaks, en welke zijde langer is (A = buitenzijde)
    const endAngle = (o, i) => { const dx = o[0] - i[0], dy = o[1] - i[1]; const c = Math.abs(dx * u[0] + dy * u[1]) / Math.hypot(dx, dy); return Math.round(Math.asin(Math.min(1, c)) * 180 / Math.PI * 10) / 10; };
    p.bevels = [];
    const a0 = endAngle(A, Ai), a1 = endAngle(B, Bi);
    if (a0 > 0.2) p.bevels.push({ end: 'u0', angle: a0, longA: pr(A) < pr(Ai) });
    if (a1 > 0.2) p.bevels.push({ end: 'u1', angle: a1, longA: pr(B) > pr(Bi) });
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
      if (shaped) {
        const x0c = colX(d, ci), x1c = x0c + col.w;
        const endL = !iv.wallL, endR = !iv.wallR;
        if (endL || endR) {
          const c = clipUnder(box[0], box[1], box[2], box[3], gIn, breaks);
          if (c.clipped) p.prism = { poly: c.poly, z0: box[4], z1: box[5] };
          p.bevels = [];
          if (endL && c.clipped) p.bevels.push({ end: 'u0', angle: Math.round((90 - slopeDeg(iv[0] + 1)) * 10) / 10, longA: false });
          if (endR && c.clipped) p.bevels.push({ end: 'u1', angle: Math.round((90 - slopeDeg(iv[1] - 1)) * 10) / 10, longA: false });
          if (loose) warnings.push(`Kolom ${ci + 1}: verstelbare plank ${k + 1} stopt tegen de schuine plaat en rust daar niet op een steun; maak hem vast of schroef er een latje onder.`);
          else for (const [x, sd, on] of [[iv[0], -1, endL], [iv[1], 1, endR]]) if (on) for (const z of zDowels) brackets.push({ x: x - sd * 30, side: sd, y: y - t, z, where: 'plank' });
        }
      }
      if (!loose && JS === 'cabineo') {
        // zak aan de onderzijde van de plank, 10 mm van elke kopse kant, bij elke aansluiting
        const yc = y - t / 2;
        const zs = side => (side === 'l' && ci > 0 && shelfCenters(ci - 1).some(q => !q.loose && shelfTouches(ci - 1, q.k, colRight(ci - 1)) && Math.abs(q.y - yc) < 16) ? zAlt : zDowels);
        for (const [x, sd, on] of [[iv[0] + 10, 'l', iv.wallL], [iv[1] - 10, 'r', iv.wallR]]) if (on) for (const z of zs(sd)) hole(p, [x, y - t, z], 12, -1, 'cabineo');
      }
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
    const m = col.cells.length;
    const x0c = colX(d, ci), w = col.w;
    let k = 0;
    while (k < m) {
      const cell = col.cells[k];
      const span = cell.span, k1 = k + span - 1;
      if (cell.front !== 'none') {
        const outerL = ci === 0, outerR = ci === n - 1, outerT = k === 0, outerB = k1 === m - 1;
        const g = GAP / 2;
        let xl = outerL ? 0 : x0c - t / 2 + g;
        let xr = outerR ? W : x0c + w + t / 2 - g;
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
          if (clip.maxX - clip.minX < 40) continue;
          lf.x0 = Math.max(lf.x0, clip.minX); lf.x1 = Math.min(lf.x1, clip.maxX);
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
            if (vertical && len < 150) warnings.push(`Kolom ${ci + 1}: de ${lf.hinge === 'l' ? 'linker' : 'rechter'} kant van de deur is te kort voor scharnieren (${Math.max(0, Math.round(len))} mm); kies de andere draairichting.`);
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

  const cnt = kind => parts.reduce((a, p) => a + p.holes.filter(h => h.kind === kind).length, 0);
  if (cnt('confirmat')) addHW('Confirmat 7×50 + afdekdop', cnt('confirmat'));
  if (cnt('cab-pilot')) addHW('Lamello Cabineo 8', cnt('cab-pilot'));
  const dowelCount = parts.reduce((a, p) => a + p.holes.filter(h => h.kind === 'deuvel' && h.d === 8).length, 0);
  const dowel6 = parts.reduce((a, p) => a + p.holes.filter(h => h.kind === 'deuvel' && h.d === 6).length, 0);
  if (dowelCount) addHW('Deuvel beuken Ø8×35', dowelCount);
  if (dowel6) addHW('Deuvel beuken Ø6×30 (ladebakken)', dowel6);
  if (P === 0) addHW('Meubelglijder / viltje', 4 + (n - 1) * 2);

  return {
    parts, handles, rails, picks, warnings: [...new Set(warnings)],
    hardware: [...hw.values()], seams: [...new Set([...seams, ...topSeams])], bottomSeams: seams, topSeams, brackets, joinery: JS, jointCount,
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
  for (const b of p.bevels || []) {
    const where = p.meta?.role === 'side' || p.meta?.drag === 'divider' ? 'bovenkant' : b.end === 'u0' ? 'kop 1' : 'kop 2';
    p.notes.push(b.half
      ? `${where} met knik: deels vlak, deels schuin ${String(b.angle).replace('.', ',')}°`
      : `${where} schuin ${String(b.angle).replace('.', ',')}° (lang aan zijde ${b.longA ? 'A' : 'B'})`);
  }
}

// Ligt punt q (app-coördinaten) in de werkelijke vorm van onderdeel p?
export function containsPoint(p, q, eps = 0.01) {
  const b = p.box;
  if (![0, 1, 2].every(i => q[i] > b[i * 2] + eps && q[i] < b[i * 2 + 1] - eps)) return false;
  if (!p.prism) return true;
  const pr = p.prism;
  if (q[2] < pr.z0 + eps || q[2] > pr.z1 - eps) return false;
  let c = false;
  for (let i = 0, j = pr.poly.length - 1; i < pr.poly.length; j = i++) {
    const [xi, yi] = pr.poly[i], [xj, yj] = pr.poly[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
