// Rhino .3dm-export: elk plaatdeel als gesloten extrusie (solid), met naam, nummer,
// laag per groep en kenmerken als user text. Grepen en stangen als mesh.
import { MATERIALS, matInfo } from './model.js';

const LAYERS = {
  korpus:     { name: 'Korpus',      color: [196, 160, 110] },
  plint:      { name: 'Plint',       color: [150, 120, 90] },
  achterwand: { name: 'Achterwand',  color: [170, 170, 160] },
  front:      { name: 'Fronten',     color: [201, 115, 58] },
  lade:       { name: 'Lades',       color: [120, 150, 170] },
  beslag:     { name: 'Beslag',      color: [60, 60, 60] },
};

let rhinoPromise = null;
async function loadRhino() {
  if (!rhinoPromise) rhinoPromise = import('rhino3dm').then(m => m.default());
  return rhinoPromise;
}

// zorg voor tegen de klok in (normaal +z)
function ccw(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a < 0 ? [...poly].reverse() : poly;
}

export function partPrism(p) {
  if (p.prism) return p.prism;
  const b = p.box;
  return { poly: [[b[0], b[2]], [b[1], b[2]], [b[1], b[3]], [b[0], b[3]]], z0: b[4], z1: b[5] };
}

export async function build3dm(d, geo, { extraMeshes = null } = {}) {
  const rh = await loadRhino();
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  const layerIdx = {};
  for (const [k, l] of Object.entries(LAYERS)) {
    const la = new rh.Layer();
    la.name = l.name;
    la.color = { r: l.color[0], g: l.color[1], b: l.color[2], a: 255 };
    layerIdx[k] = doc.layers().add(la);
  }
  const hex = h => { const n = parseInt((h || '#cccccc').slice(1), 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 255 }; };

  for (const p of geo.parts) {
    const pr = partPrism(p);
    const poly = ccw(pr.poly);
    const pl = new rh.Polyline(poly.length + 1);
    for (const [x, y] of poly) pl.add(x, y, 0);
    pl.add(poly[0][0], poly[0][1], 0);
    const crv = pl.toPolylineCurve();
    const ex = rh.Extrusion.create(crv, pr.z1 - pr.z0, true);
    if (!ex) continue;
    ex.translate([0, 0, pr.z0]);
    const at = new rh.ObjectAttributes();
    at.name = `${String(p.num).padStart(2, '0')} ${p.name}`;
    at.layerIndex = layerIdx[p.group] ?? layerIdx.korpus;
    at.colorSource = rh.ObjectColorSource.ColorFromObject;
    at.objectColor = hex(matInfo(p.mat).color || MATERIALS.berken.color);
    at.setUserString('Nummer', String(p.num));
    at.setUserString('Onderdeel', p.name);
    at.setUserString('Materiaal', p.matLabel);
    at.setUserString('Lengte_mm', String(p.size.L));
    at.setUserString('Breedte_mm', String(p.size.B));
    at.setUserString('Dikte_mm', String(p.size.T));
    if (p.notes?.length) at.setUserString('Opmerking', p.notes.join(', '));
    doc.objects().add(ex, at);
  }

  // grepen en stangen (driehoeksnetten), aangeleverd door de viewer
  if (extraMeshes) {
    for (const m of extraMeshes) {
      const mesh = rh.Mesh.createFromThreejsJSON({ data: {
        attributes: { position: { itemSize: 3, type: 'Float32Array', array: m.positions, normalized: false } },
        index: { type: 'Uint32Array', array: m.index },
      } });
      if (!mesh) continue;
      const at = new rh.ObjectAttributes();
      at.name = m.name; at.layerIndex = layerIdx.beslag;
      doc.objects().add(mesh, at);
    }
  }
  doc.strings().set('Project', d.name);
  return doc.toByteArray();
}
