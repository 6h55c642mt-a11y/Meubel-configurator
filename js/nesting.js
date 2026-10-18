// Plaatoptimalisatie met MaxRects (best short side fit).
import { MATERIALS, matLabel, grainOn } from './model.js';

class MaxRects {
  constructor(w, h) { this.w = w; this.h = h; this.free = [{ x: 0, y: 0, w, h }]; }

  find(w, h, canRotate) {
    let best = null;
    for (const r of this.free) {
      for (const rot of canRotate ? [false, true] : [false]) {
        const pw = rot ? h : w, ph = rot ? w : h;
        if (pw <= r.w + 1e-6 && ph <= r.h + 1e-6) {
          const ss = Math.min(r.w - pw, r.h - ph), ls = Math.max(r.w - pw, r.h - ph);
          if (!best || ss < best.ss || (ss === best.ss && ls < best.ls) || (ss === best.ss && ls === best.ls && r.y < best.y)) {
            best = { x: r.x, y: r.y, w: pw, h: ph, rot, ss, ls };
          }
        }
      }
    }
    return best;
  }

  place(n) {
    const out = [];
    for (const r of this.free) {
      if (n.x >= r.x + r.w || n.x + n.w <= r.x || n.y >= r.y + r.h || n.y + n.h <= r.y) { out.push(r); continue; }
      if (n.x > r.x) out.push({ x: r.x, y: r.y, w: n.x - r.x, h: r.h });
      if (n.x + n.w < r.x + r.w) out.push({ x: n.x + n.w, y: r.y, w: r.x + r.w - n.x - n.w, h: r.h });
      if (n.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: n.y - r.y });
      if (n.y + n.h < r.y + r.h) out.push({ x: r.x, y: n.y + n.h, w: r.w, h: r.y + r.h - n.y - n.h });
    }
    this.free = out.filter((a, i) => !out.some((b, j) => j !== i &&
      a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  }
}

export function groupKey(p) { return `${p.mat.type}|${p.t}`; }

export function nestParts(parts, sheet, d) {
  const { L, W, kerf, margin } = sheet;
  const uw = L - 2 * margin, uh = W - 2 * margin;
  const groups = new Map();
  for (const p of parts) {
    const k = groupKey(p);
    if (!groups.has(k)) {
      const info = MATERIALS[p.mat.type] || MATERIALS.berken;
      groups.set(k, { key: k, type: p.mat.type, label: info.paint ? `${info.label} ${p.t} mm` : matLabel(p.mat, p.t), grain: d ? grainOn(d, p.mat.type) : info.grain, parts: [] });
    }
    groups.get(k).parts.push(p);
  }

  const fill = s => s.placed.reduce((a, q) => a + q.w * q.h, 0);
  const lastFill = sheets => 1e5 * (1 - fill(sheets[sheets.length - 1]) / (L * W));
  const result = [];
  for (const g of groups.values()) {
    const pack = items => {
      const sheets = [], unplaced = [];
      for (const it of items) {
        let best = null, bestSheet = null;
        for (const s of sheets) {
          const f = s.bin.find(it.w, it.h, !g.grain);
          if (f && (!best || f.ss < best.ss)) { best = f; bestSheet = s; }
        }
        if (!best) {
          const s = { bin: new MaxRects(uw + kerf, uh + kerf), placed: [] };
          const f = s.bin.find(it.w, it.h, !g.grain);
          if (!f) { unplaced.push(it.p); continue; }
          sheets.push(s); best = f; bestSheet = s;
        }
        bestSheet.bin.place(best);
        bestSheet.placed.push({ p: it.p, x: margin + best.x, y: margin + best.y, rot: best.rot,
          w: best.rot ? it.p.size.B : it.p.size.L, h: best.rot ? it.p.size.L : it.p.size.B });
      }
      return { sheets, unplaced };
    };
    const base = g.parts.map(p => ({ p, w: p.size.L + kerf, h: p.size.B + kerf }));
    const sorts = [
      (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
      (a, b) => b.w * b.h - a.w * a.h,
      (a, b) => b.w - a.w || b.h - a.h,
      (a, b) => b.h - a.h || b.w - a.w,
      (a, b) => (b.w + b.h) - (a.w + a.h),
      (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    ];
    let bestRun = null;
    for (const s of sorts) {
      const run = pack([...base].sort(s));
      const score = run.sheets.length * 1e6 + run.unplaced.length * 1e9 - (run.sheets.length ? lastFill(run.sheets) : 0);
      if (!bestRun || score < bestRun.score) bestRun = { ...run, score, order: [...base].sort(s) };
    }
    // lokale zoektocht: wissel willekeurig twee items in de beste volgorde
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const iters = Math.min(400, 20 * base.length);
    for (let i = 0; i < iters && bestRun.sheets.length > 1; i++) {
      const order = [...bestRun.order];
      const a = Math.floor(rnd() * order.length), b = Math.floor(rnd() * order.length);
      [order[a], order[b]] = [order[b], order[a]];
      const run = pack(order);
      const score = run.sheets.length * 1e6 + run.unplaced.length * 1e9 - (run.sheets.length ? lastFill(run.sheets) : 0);
      if (score <= bestRun.score) bestRun = { ...run, score, order };
    }
    const { sheets, unplaced } = bestRun;
    const area = L * W;
    for (const s of sheets) {
      s.used = s.placed.reduce((a, q) => a + q.w * q.h, 0) / area;
      delete s.bin;
    }
    result.push({ ...g, sheets, unplaced });
  }
  return result;
}
