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

export async function build3dm(d, geo, { extraMeshes = null, detail = null, cut = null } = {}) {
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
    // three.js is Y-omhoog, Rhino Z-omhoog: (x, y, z) → (x, −z, y). Voorkant wijst naar −Y (Front-view),
    // vloer = XY-vlak. Dezelfde omzetting als Mesh.createFromThreejsJSON voor de grepen.
    ex.rotate(Math.PI / 2, [1, 0, 0], [0, 0, 0]);
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
  if (detail) addDetail(rh, doc, detail, cut);
  doc.strings().set('Project', d.name);
  const wo = new rh.File3dmWriteOptions(); wo.version = 7; // opent in Rhino 7 en 8
  return doc.toByteArrayOptions(wo);
}

// ---------- gedetailleerd model ----------
const DLAYERS = {
  Deuvels: [190, 150, 90], Schroeven: [90, 90, 95], Verbinders: [70, 110, 160], Scharnieren: [150, 155, 160],
  Ladegeleiders: [120, 125, 130], Planksteunen: [60, 60, 60], Uitsparingen: [220, 60, 60], 'Platen met uitsparingen': [196, 160, 110],
};
const toRhino = g => { g.rotate(Math.PI / 2, [1, 0, 0], [0, 0, 0]); return g; };

function cylSolid(rh, a, b, r) {
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...v); if (len < 0.01) return null;
  const u = v.map(x => x / len);
  const ex = rh.Extrusion.createCylinderExtrusion(new rh.Cylinder(new rh.Circle(r), len), true, true);
  if (!ex) return null;
  // Z-as naar richting u draaien
  const dz = u[2];
  if (dz < -0.999999) ex.rotate(Math.PI, [1, 0, 0], [0, 0, 0]);
  else if (dz < 0.999999) {
    const axis = [-u[1], u[0], 0]; const n = Math.hypot(axis[0], axis[1]);
    ex.rotate(Math.acos(dz), [axis[0] / n, axis[1] / n, 0], [0, 0, 0]);
  }
  ex.translate(a);
  return toRhino(ex);
}

function boxSolid(rh, b) {
  if (b[1] - b[0] < 0.01 || b[3] - b[2] < 0.01 || b[5] - b[4] < 0.01) return null;
  const pl = new rh.Polyline(5);
  for (const [x, y] of [[b[0], b[2]], [b[1], b[2]], [b[1], b[3]], [b[0], b[3]], [b[0], b[2]]]) pl.add(x, y, 0);
  const ex = rh.Extrusion.create(pl.toPolylineCurve(), b[5] - b[4], true);
  if (!ex) return null;
  ex.translate([0, 0, b[4]]);
  return toRhino(ex);
}

function addDetail(rh, doc, detail, cut) {
  const idx = {};
  for (const [name, c] of Object.entries(DLAYERS)) {
    const la = new rh.Layer();
    la.name = name; la.color = { r: c[0], g: c[1], b: c[2], a: 255 };
    if (name === 'Platen met uitsparingen' || name === 'Uitsparingen') la.visible = false;
    idx[name] = doc.layers().add(la);
  }
  const put = (geom, layer, name) => {
    if (!geom) return;
    const at = new rh.ObjectAttributes(); at.name = name; at.layerIndex = idx[layer] ?? idx.Planksteunen;
    doc.objects().add(geom, at);
  };
  for (const it of detail.items) {
    put(it.cyl ? cylSolid(rh, it.cyl.a, it.cyl.b, it.cyl.r) : boxSolid(rh, it.box), it.layer, it.name);
  }
  for (const c of detail.cuts) put(cylSolid(rh, c.a, c.b, c.r), 'Uitsparingen', `Uitsparing ${c.kind} · deel ${c.part}`);
  for (const m of cut || []) {
    const mesh = rh.Mesh.createFromThreejsJSON({ data: {
      attributes: { position: { itemSize: 3, type: 'Float32Array', array: m.positions, normalized: false } },
      index: { type: 'Uint32Array', array: m.index },
    } });
    if (mesh) { mesh.normals().computeNormals?.(); put(mesh, 'Platen met uitsparingen', m.name); }
  }
}
