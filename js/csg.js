// Platen met uitsparingen als driehoeksnet (CSG in de browser met three-bvh-csg).
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

function partGeometry(p) {
  if (p.prism) {
    const shape = new THREE.Shape(p.prism.poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: p.prism.z1 - p.prism.z0, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, p.prism.z0);
    return g;
  }
  const b = p.box;
  const g = new THREE.BoxGeometry(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
  g.translate((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
  return g;
}

function cylGeometry(a, b, r, seg = 20) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

const strip = g => {
  // three-bvh-csg wil identieke attributen: alleen position + normal + uv
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
};

export async function cutMeshes(geo, detail, progress = () => {}) {
  const ev = new Evaluator();
  ev.attributes = ['position', 'normal'];
  ev.useGroups = false;
  const byPart = new Map();
  for (const c of detail.cuts) { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
  const out = [];
  let i = 0;
  for (const p of geo.parts) {
    let brush = new Brush(strip(partGeometry(p)));
    brush.updateMatrixWorld();
    const cs = byPart.get(p.num) || [];
    for (const c of cs) {
      const cb = new Brush(strip(cylGeometry(c.a, c.b, c.r, c.r > 10 ? 32 : 16)));
      cb.updateMatrixWorld();
      try { brush = ev.evaluate(brush, cb, SUBTRACTION); } catch (e) { /* gat overslaan */ }
    }
    const g = brush.geometry.index ? brush.geometry : brush.geometry;
    const pos = Array.from(g.attributes.position.array);
    const index = g.index ? Array.from(g.index.array) : Array.from({ length: pos.length / 3 }, (_, k) => k);
    out.push({ name: `${String(p.num).padStart(2, '0')} ${p.name} (met uitsparingen)`, positions: pos, index, holes: cs.length });
    if (++i % 4 === 0) { progress(`Uitsparingen ${i}/${geo.parts.length}…`); await new Promise(r => setTimeout(r, 0)); }
  }
  return out;
}

export { cylGeometry };
