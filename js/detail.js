// Gedetailleerd model: beslag als 3D-objecten en uitsparingen als boorvolumes.
// Alles in app-coördinaten (mm, Y omhoog). Cilinder = { a, b, r } (as van a naar b).
import { containsPoint } from './geometry.js';

const add = (p, v, s = 1) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];
const neg = v => v.map(x => -x);

export function buildDetail(d, geo) {
  const t = d.t;
  const parts = geo.parts;
  const cuts = [];          // { part, a, b, r, kind }
  const items = [];         // { layer, name, cyl?: {a,b,r}, box?: [x0,x1,y0,y1,z0,z1] }
  const cyl = (layer, name, a, b, r) => items.push({ layer, name, cyl: { a, b, r } });
  const box = (layer, name, bx) => items.push({ layer, name, box: bx });

  const mateOf = (p, h) => { const n = p.frame.n; const q = add(h.p, n, h.dir * 2); return parts.find(o => o !== p && containsPoint(o, q)); };

  for (const p of parts) {
    const n = p.frame.n;
    for (const h of p.holes) {
      const out = n.map(v => v * h.dir);          // uit het vlak (naar het tegenstuk / de buitenkant)
      const into = neg(out);                      // de plaat in
      const r = h.d / 2;
      if (h.kind === 'deuvel') {
        const dIn = h.d === 6 ? 10 : 12, dEdge = h.d === 6 ? 20 : 23;
        cuts.push({ part: p.num, a: h.p, b: add(h.p, into, dIn + 1), r, kind: 'deuvel' });
        const m = mateOf(p, h);
        if (m) cuts.push({ part: m.num, a: h.p, b: add(h.p, out, dEdge + 1), r, kind: 'deuvel' });
        cyl('Deuvels', `Deuvel Ø${h.d}×${dIn + dEdge}`, add(h.p, into, dIn), add(h.p, out, dEdge), r - 0.05);
      } else if (h.kind === 'pin') {
        cuts.push({ part: p.num, a: h.p, b: add(h.p, into, 10), r, kind: 'pin' });
      } else if (h.kind === 'pot') {
        cuts.push({ part: p.num, a: add(h.p, out, 0.01), b: add(h.p, into, 12.5), r, kind: 'pot' });
      } else if (h.kind === 'confirmat') {
        // doorboring Ø7 door de ontvangende plaat, voorboring Ø5 × 45 in het tegenstuk
        const back = add(h.p, into, p.t);
        cuts.push({ part: p.num, a: add(back, into, -0.01), b: add(h.p, out, 0.01), r: 3.5, kind: 'confirmat' });
        cuts.push({ part: p.num, a: add(back, into, -0.01), b: add(back, out, 2), r: 5, kind: 'verzinking' });
        const m = mateOf(p, h);
        if (m) cuts.push({ part: m.num, a: h.p, b: add(h.p, out, 46), r: 2.5, kind: 'confirmat' });
        cyl('Schroeven', 'Confirmat 7×50', back, add(back, out, 50), 3.4);
        cyl('Schroeven', 'Confirmat kop', back, add(back, out, 1.8), 4.9);
      } else if (h.kind === 'cab-pilot') {
        cuts.push({ part: p.num, a: h.p, b: add(h.p, into, 11), r: 2.5, kind: 'cabineo' });
        cyl('Schroeven', 'Cabineo schroef', add(h.p, into, 10), add(h.p, out, 10), 2.4);
      } else if (h.kind === 'cabineo') {
        cuts.push({ part: p.num, a: add(h.p, out, 0.01), b: add(h.p, into, 12), r: 6, kind: 'cabineo' });
        cyl('Verbinders', 'Lamello Cabineo 8', h.p, add(h.p, into, 11), 5.9);
      }
    }
  }

  // planksteuntjes: vier per losse plank, in de gaten direct onder de plank
  for (const s of parts.filter(p => p.meta?.loose)) {
    const yb = s.box[2];
    for (const [xf, side] of [[s.box[0] - 1, -1], [s.box[1] + 1, 1]]) {
      const cands = [];
      for (const p of parts) for (const h of p.holes) {
        if (h.kind !== 'pin' || Math.abs(h.p[0] - xf) > 1.5) continue;
        if (h.dir !== -side) continue;
        if (h.p[1] > yb - 2) continue;
        cands.push(h);
      }
      const zs = [...new Set(cands.map(h => Math.round(h.p[2])))];
      for (const z of zs) {
        const h = cands.filter(q => Math.round(q.p[2]) === z).sort((a, b) => b.p[1] - a.p[1])[0];
        if (!h || yb - h.p[1] > 40) continue;
        const dir = [-side, 0, 0];
        cyl('Planksteunen', 'Planksteun Ø5', add(h.p, dir, -8), add(h.p, dir, 8), 2.45);
        box('Planksteunen', 'Planksteun lip', [Math.min(h.p[0], h.p[0] + dir[0] * 12), Math.max(h.p[0], h.p[0] + dir[0] * 12), h.p[1] + 2, yb, h.p[2] - 4, h.p[2] + 4]);
      }
    }
  }

  // scharnieren: kom in de deur, arm en montageplaat op de wand
  const verticals = parts.filter(p => p.meta?.role === 'side' || p.meta?.drag === 'divider');
  for (const f of parts.filter(p => p.group === 'front' && p.meta.hinge)) {
    const hg = f.meta.hinge;
    for (const h of f.holes.filter(q => q.kind === 'pot')) {
      const c = h.p; // op de binnenzijde van de deur (z = zF)
      cyl('Scharnieren', 'Potscharnier kom', c, add(c, [0, 0, -12.5], 1), 17.4);
      if (hg === 'l' || hg === 'r') {
        // wandvlak aan de scharnierzijde
        const s = hg === 'l' ? 1 : -1;
        const wall = verticals.map(v => (hg === 'l' ? v.box[1] : v.box[0]))
          .filter(x => (hg === 'l' ? x >= f.box[0] - 0.5 && x <= f.box[0] + t + 2 : x <= f.box[1] + 0.5 && x >= f.box[1] - t - 2))
          .sort((a, b) => Math.abs(a - c[0]) - Math.abs(b - c[0]))[0];
        if (wall === undefined) continue;
        const zArmF = c[2] - 4;
        box('Scharnieren', 'Scharnierarm', [Math.min(c[0], wall + s * 8), Math.max(c[0], wall + s * 8), c[1] - 7, c[1] + 7, zArmF - 52, zArmF]);
        box('Scharnieren', 'Montageplaat', [Math.min(wall, wall + s * 10), Math.max(wall, wall + s * 10), c[1] - 25, c[1] + 25, zArmF - 52, zArmF - 22]);
      } else {
        const s = hg === 't' ? 1 : -1;
        box('Scharnieren', 'Scharnierarm', [c[0] - 7, c[0] + 7, Math.min(c[1], c[1] + s * 30), Math.max(c[1], c[1] + s * 30), c[2] - 56, c[2] - 4]);
      }
    }
  }

  // ladegeleiders
  const drawers = new Map();
  for (const p of parts.filter(q => q.group === 'lade')) {
    const k = p.meta.drawer; if (!drawers.has(k)) drawers.set(k, []); drawers.get(k).push(p);
  }
  for (const [, ps] of drawers) {
    const sides = ps.filter(p => p.name.includes('zijkant')).sort((a, b) => a.box[0] - b.box[0]);
    if (sides.length < 2) continue;
    const y0 = Math.min(...ps.map(p => p.box[2]));
    const z0 = Math.min(...ps.map(p => p.box[4])), z1 = Math.max(...ps.map(p => p.box[5]));
    const L = Math.round(z1 - z0);
    const [sl, sr] = [sides[0], sides[sides.length - 1]];
    for (const [xa, xb] of [[sl.box[0] - 12.7, sl.box[0] - 0.3], [sr.box[1] + 0.3, sr.box[1] + 12.7]]) {
      box('Ladegeleiders', `Ladegeleider ${L} mm (kastdeel)`, [xa, xa + (xb - xa) * 0.45, y0, y0 + 45, z0, z1]);
      box('Ladegeleiders', `Ladegeleider ${L} mm (ladedeel)`, [xa + (xb - xa) * 0.5, xb, y0 + 4, y0 + 41, z0, z1]);
    }
  }

  // hoekverbinders bij het schot op de naad
  for (const b of geo.brackets || []) {
    const s = b.side, up = b.where === 'bodem' ? 1 : -1; // onder het blad wijst de staande poot omlaag
    const x0 = b.x, y0 = b.y;
    box('Verbinders', 'Hoekverbinder', [Math.min(x0, x0 + s * 20), Math.max(x0, x0 + s * 20), Math.min(y0, y0 + up * 2), Math.max(y0, y0 + up * 2), b.z - 20, b.z + 20]);
    box('Verbinders', 'Hoekverbinder', [Math.min(x0, x0 + s * 2), Math.max(x0, x0 + s * 2), Math.min(y0, y0 + up * 20), Math.max(y0, y0 + up * 20), b.z - 20, b.z + 20]);
  }

  // achterwandschroeven (indicatief, rondom op 150 mm)
  for (const bp of parts.filter(p => p.group === 'achterwand')) {
    const [x0, x1, y0, y1] = bp.box;
    const pts = [];
    for (let x = x0 + 40; x <= x1 - 40; x += 150) pts.push([x, y0 + d.t / 2], [x, Math.min(y1, y1) - d.t / 2]);
    for (let y = y0 + 150; y <= y1 - 150; y += 150) pts.push([x0 + d.t / 2, y], [x1 - d.t / 2, y]);
    for (const [x, y] of pts) {
      if (bp.prism && !insidePoly(bp.prism.poly, x, y)) continue;
      cyl('Schroeven', 'Schroef 3,5×16', [x, y, -1.5], [x, y, 16 - 1.5], 1.75);
    }
  }

  const counts = {};
  for (const it of items) counts[it.layer] = (counts[it.layer] || 0) + 1;
  return { cuts, items, counts };
}

function insidePoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
