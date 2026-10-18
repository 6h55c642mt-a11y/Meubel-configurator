import {
  defaultDesign, normalize, setColumnCount, setCellCount, equalizeColumns, equalizeCells,
  setColWidth, setCellHeight, moveShelfTo, moveDividerTo, frontOwner, cellY,
  MATERIALS, PALETTE, FRONT_TYPES, INTERIORS, HANDLE_TYPES, FINISHES, colorName, uid, clamp,
  setShapePreset, addShapePoint, moveShapePoint, SHAPE_PRESETS, grainOn,
} from './model.js';
import { buildGeometry } from './geometry.js';
import { Viewer } from './viewer.js';
import { nestParts } from './nesting.js';
import { buildDxf } from './dxf.js';
import { FRONT_ICONS, INTERIOR_ICONS, HANDLE_ICONS } from './icons.js';
import * as store from './storage.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  d: null, geo: null,
  sel: { cells: [], shelf: null },
  step: 1, matTab: 'carcass',
  view: { dim: '3d', mode: 'render', fronts: 'dicht', dims: true },
  undo: [], redo: [],
};

// ---------- opstart ----------
state.d = store.loadInitial() || defaultDesign();
normalize(state.d);

const viewer = new Viewer($('#viewer'), {
  onSelectCell(col, k, add) {
    const has = state.sel.cells.findIndex(c => c.col === col && c.k === k);
    if (add) { if (has >= 0) state.sel.cells.splice(has, 1); else state.sel.cells.push({ col, k }); }
    else state.sel.cells = [{ col, k }];
    state.sel.shelf = null;
    if (state.step !== 5) state.step = 5;
    refresh();
  },
  onSelectShelf(col, k) {
    state.sel = { cells: [], shelf: { col, k } };
    state.step = 4;
    refresh();
  },
  onBackground() {
    if (state.sel.cells.length || state.sel.shelf) { state.sel = { cells: [], shelf: null }; refresh(); }
  },
  onMoveShelf(col, k, yTop) { dragUndo(); moveShelfTo(state.d, col, k, yTop); refresh(false); },
  onMoveDivider(i, x) { dragUndo(); moveDividerTo(state.d, i, x); refresh(false); },
  onMoveShapePoint(i, x, y) { dragUndo(); moveShapePoint(state.d, i, x, y); normalize(state.d); refresh(false); },
  onSelectShapePoint(i) { state.step = 1; renderPanel(); const el = document.querySelector(`input[data-field="pt"][data-i="${i}"]`); el && el.focus(); },
  onDragEnd() { dragging = false; renderPanel(); },
  onEditCellHeight(col, k, h) { commit(d => setCellHeight(d, col, k, h)); },
  onEditColWidth(i, w) { commit(d => setColWidth(d, i, w)); },
  onEditOverall(key, v) { commit(d => { if (key === 'H' && d.shape.on) { const f = v / d.H; d.shape.pts = d.shape.pts.map(([x, y]) => [x, y * f]); } else d[key] = v; }); },
});
viewer.setView(state.view);

let dragging = false;
function dragUndo() { if (!dragging) { dragging = true; pushUndo(); } }

function pushUndo() {
  state.undo.push(JSON.stringify(state.d));
  if (state.undo.length > 150) state.undo.shift();
  state.redo = [];
}
function commit(fn, { panel = true } = {}) {
  pushUndo();
  fn(state.d);
  normalize(state.d);
  refresh(panel);
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(JSON.stringify(state.d));
  state.d = JSON.parse(state.undo.pop());
  cleanSel(); refresh();
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(JSON.stringify(state.d));
  state.d = JSON.parse(state.redo.pop());
  cleanSel(); refresh();
}
function cleanSel() {
  state.sel.cells = state.sel.cells.filter(c => state.d.columns[c.col] && state.d.columns[c.col].cells[c.k]);
  if (state.sel.shelf) {
    const col = state.d.columns[state.sel.shelf.col];
    if (!col || state.sel.shelf.k >= col.cells.length - 1) state.sel.shelf = null;
  }
}

let saveTimer;
function refresh(panel = true) {
  cleanSel();
  viewer.view.shapeEdit = state.step === 1;
  state.geo = buildGeometry(state.d);
  viewer.update(state.d, state.geo, state.sel);
  if (panel) renderPanel();
  renderFoot();
  $('#projName').value = state.d.name;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.autosave(state.d), 400);
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- paneel ----------
const STEPS = [
  { n: 1, title: 'Project & afmetingen', sum: d => `${d.W}×${d.H}×${d.D}` },
  { n: 2, title: 'Materiaal & kleur', sum: d => MATERIALS[d.material.carcass.type].label + (MATERIALS[d.material.carcass.type].paint ? ' · ' + colorName(d.material.carcass.color) : '') },
  { n: 3, title: 'Sokkel', sum: d => d.plinth.on ? `${d.plinth.h} mm` : 'geen' },
  { n: 4, title: 'Kolommen & vakken', sum: d => `${d.columns.length} kol. · ${d.columns.reduce((a, c) => a + c.cells.length, 0)} vakken` },
  { n: 5, title: 'Fronten & interieur', sum: () => `${state.geo.parts.filter(p => p.group === 'front').length} fronten` },
  { n: 6, title: 'Grepen', sum: d => d.handle.type === 'push' ? 'push-to-open' : `${HANDLE_TYPES[d.handle.type].label} · ${FINISHES[d.handle.finish].label}` },
  { n: 7, title: 'Overzicht & export', sum: () => `${state.geo.parts.length} delen` },
];

function renderPanel() {
  const d = state.d;
  const html = STEPS.map(s => {
    const open = state.step === s.n;
    return `<section class="step ${open ? 'open' : ''}">
      <button class="stephead" data-act="step" data-n="${s.n}" aria-expanded="${open}">
        <span class="stepnum">${s.n}</span><span class="steptitle">${s.title}</span>
        <span class="stepsum">${esc(s.sum(d))}</span>
      </button>
      ${open ? `<div class="stepbody">${BODIES[s.n]()}${s.n < 7 ? `<button class="btn ghost stepnext" data-act="step" data-n="${s.n + 1}">Volgende stap →</button>` : ''}</div>` : ''}
    </section>`;
  }).join('');
  $('#panel').innerHTML = html;
}

const numField = (field, val, { min, max, step = 10, unit = 'mm', range = false, name } = {}) => `
  <div class="dim">
    <span class="name">${name}</span>
    <button class="pm" data-act="inc" data-field="${field}" data-step="${-step}" aria-label="min">−</button>
    <div class="num"><input data-field="${field}" data-min="${min}" data-max="${max}" value="${val}" inputmode="numeric"><span class="unit">${unit}</span></div>
    <button class="pm" data-act="inc" data-field="${field}" data-step="${step}" aria-label="plus">+</button>
    ${range ? `<span></span><input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${val}">` : ''}
  </div>`;

const seg = (act, items, cur, extra = '') => `<div class="seg">${items.map(([v, l]) =>
  `<button data-act="${act}" data-val="${v}" ${extra} class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

const BODIES = {
  1() {
    const d = state.d;
    return `
      <div class="field"><label>Projectnaam</label><input class="text" data-field="name" value="${esc(d.name)}"></div>
      <div class="field"><label>Buitenmaten</label>
        ${numField('W', d.W, { min: 300, max: 6000, step: 10, range: true, name: 'Breedte' })}
        ${numField('H', d.H, { min: 200, max: 3000, step: 10, range: true, name: 'Hoogte' })}
        ${numField('D', d.D, { min: 150, max: 900, step: 10, range: true, name: 'Diepte' })}
        <div class="hint">Diepte is de korpusdiepte inclusief achterwand; fronten komen daar ${d.t} mm bij. Totaal: <b>${d.D + d.t} mm</b>.${d.shape.on ? ' Hoogte = hoogste punt van de bovenrand.' : ''}</div>
      </div>
      <div class="field"><label>Vorm bovenrand</label>
        <div class="seg">${SHAPE_PRESETS.map(([k, l]) => `<button data-act="shape" data-val="${k}">${l}</button>`).join('')}</div>
        ${d.shape.on ? `
          <div class="pts">${d.shape.pts.map((p, i) => `
            <div class="ptrow"><span class="idx">P${i + 1}</span>
              <div class="num"><span class="unit">x</span><input data-field="pt" data-i="${i}" data-c="0" value="${p[0]}" ${i === 0 || i === d.shape.pts.length - 1 ? 'disabled' : ''}></div>
              <div class="num"><span class="unit">y</span><input data-field="pt" data-i="${i}" data-c="1" value="${p[1]}"></div>
              ${i > 0 && i < d.shape.pts.length - 1 ? `<button class="x" data-act="delpt" data-i="${i}" aria-label="Punt verwijderen">✕</button>` : '<span></span>'}
            </div>`).join('')}</div>
          <div class="row"><button class="btn ghost small" data-act="addpt">+ Punt toevoegen</button><span class="hint">Sleep de oranje punten in de weergave; in 2D gaat dat het makkelijkst.</span></div>` :
          '<div class="hint">Kies een vorm om een schuine of geknikte bovenrand te maken, bijvoorbeeld onder een schuin dak of een trap. Daarna kun je de punten verslepen of in mm invullen.</div>'}
      </div>
      <div class="field"><label>Plaatdikte korpus en fronten</label>${seg('set', [[15, '15 mm'], [18, '18 mm'], [22, '22 mm'], [25, '25 mm']], d.t, 'data-field="t"')}</div>
      <div class="field"><label>Achterwand</label>
        <label class="toggle"><input type="checkbox" data-field="back" ${d.back ? 'checked' : ''}> Opgelegde achterwand</label>
        ${seg('set', [[6, '6'], [8, '8'], [9, '9'], [12, '12 mm']], d.thinT, 'data-field="thinT"')}
        <div class="hint">Dunne plaat wordt ook gebruikt voor de ladebodems.</div>
      </div>
      <div class="field"><label>Ladebakken</label>${seg('set', [[12, '12 mm'], [15, '15 mm'], [18, '18 mm']], d.drawerBoxT, 'data-field="drawerBoxT"')}</div>`;
  },

  2() {
    const d = state.d, tab = state.matTab;
    const same = d.material.same;
    const m = tab === 'fronts' && !same ? d.material.fronts : d.material.carcass;
    const path = tab === 'fronts' && !same ? 'fronts' : 'carcass';
    const tiles = Object.entries(MATERIALS).map(([k, v]) => `
      <button class="tile ${m.type === k ? 'on' : ''}" data-act="mat" data-path="${path}" data-val="${k}">
        <span class="sw" style="background:${swatchBg(k, m.color)}"></span>${v.label}</button>`).join('');
    const paint = MATERIALS[m.type].paint;
    return `
      ${seg('mattab', [['carcass', 'Korpus'], ['fronts', 'Fronten']], tab)}
      ${tab === 'fronts' ? `<label class="toggle"><input type="checkbox" data-field="material.same" ${same ? 'checked' : ''}> Fronten gelijk aan korpus</label>` : ''}
      ${tab === 'fronts' && same ? '<div class="hint">Zet de schakelaar uit om de fronten een eigen materiaal of kleur te geven.</div>' : `
      <div class="tiles">${tiles}</div>
      ${paint ? `<div class="field"><label>Kleur · ${esc(colorName(m.color))}</label>
        <div class="swatches">${PALETTE.map(p => `<button class="swatch ${p.hex.toLowerCase() === (m.color || '').toLowerCase() ? 'on' : ''}" style="background:${p.hex}" data-act="color" data-path="${path}" data-val="${p.hex}" data-name="${p.name}" aria-label="${p.name}"></button>`).join('')}
        <input type="color" class="picker" data-act="picker" data-path="${path}" value="${m.color || '#8DA1B4'}" title="Eigen kleur"></div></div>` : ''}
      <div class="hint">${MATERIALS[m.type].grain ? 'Nerfrichting telt mee: onderdelen worden op de plaat niet gedraaid.' : 'Geen nerf: onderdelen mogen op de plaat gedraaid worden.'}${MATERIALS[m.type].ply ? ' De kopse kanten tonen de multiplexlagen.' : ''}</div>`}`;
  },

  3() {
    const d = state.d;
    return `
      <label class="toggle"><input type="checkbox" data-field="plinth.on" ${d.plinth.on ? 'checked' : ''}> Sokkel / plint</label>
      ${d.plinth.on ? `
        ${numField('plinth.h', d.plinth.h, { min: 20, max: 250, step: 5, range: true, name: 'Hoogte' })}
        ${numField('plinth.setback', d.plinth.setback, { min: 0, max: 120, step: 5, range: true, name: 'Terugsprong' })}
        <div class="hint">De zijwanden lopen door tot de vloer; de plint zit ertussen, ${d.plinth.setback} mm terug vanaf de voorkant.</div>` :
        '<div class="hint">Zonder sokkel staat de bodem op de vloer. Er worden glijders aan de onderdelenlijst toegevoegd.</div>'}`;
  },

  4() {
    const d = state.d;
    const shelf = state.sel.shelf;
    let shelfHtml = '';
    if (shelf) {
      const col = d.columns[shelf.col];
      const yTop = cellY(d, shelf.col, shelf.k).bot;
      shelfHtml = `<div class="card sel">
        <div class="row"><b>Plank · kolom ${shelf.col + 1}</b><span class="spacer"></span><button class="x" data-act="clearsel" aria-label="Sluiten">✕</button></div>
        ${numField('shelfY', Math.round(yTop), { min: 0, max: d.H, step: 1, name: 'Bovenkant' })}
        <div class="hint">Hoogte vanaf de vloer. Je kunt de plank ook verslepen in de weergave.</div>
        ${seg('shelfloose', [['0', 'Vast (deuvels)'], ['1', 'Verstelbaar (gaatjesrij)']], col.loose[shelf.k] ? '1' : '0')}
      </div>`;
    }
    return `
      <div class="row"><span class="lbl">Kolommen</span><span class="spacer"></span>
        <div class="mini"><button class="pm" data-act="cols" data-step="-1">−</button><b>${d.columns.length}</b><button class="pm" data-act="cols" data-step="1">+</button></div>
        <button class="btn ghost small" data-act="eqcols">Gelijk verdelen</button></div>
      <div class="cols">${d.columns.map((c, i) => `
        <div class="colrow">
          <span class="idx">${i + 1}</span>
          <div class="num"><input data-field="colw" data-i="${i}" value="${c.w}" ${d.columns.length < 2 ? 'disabled' : ''}><span class="unit">mm</span></div>
          <div class="mini">vakken <button class="pm" data-act="cells" data-i="${i}" data-step="-1">−</button><b>${c.cells.length}</b><button class="pm" data-act="cells" data-i="${i}" data-step="1">+</button>
            <button class="x" data-act="eqcells" data-i="${i}" title="Vakken gelijk verdelen">≡</button></div>
        </div>`).join('')}</div>
      ${shelfHtml}
      <div class="hint">Sleep planken ↕ en tussenschotten ↔ direct in de weergave, of typ een maat in de labels. Klik een plank om hem vast of verstelbaar te maken. Maten zijn binnenmaten in mm.</div>
      <div class="row"><span class="lbl">Alle planken</span><span class="spacer"></span>
        <button class="btn ghost small" data-act="allloose" data-val="0">Vast</button>
        <button class="btn ghost small" data-act="allloose" data-val="1">Verstelbaar</button></div>`;
  },

  5() {
    const d = state.d, sel = state.sel.cells;
    const tools = `<div class="row">
      <button class="btn ghost small" data-act="selcol">Hele kolom</button>
      <button class="btn ghost small" data-act="selall">Alles</button>
      ${sel.length ? '<button class="btn ghost small" data-act="clearsel">Wis selectie</button>' : ''}</div>`;
    if (!sel.length) return `<div class="empty">Klik een vak in de weergave om het te kiezen.<br>Shift- of Ctrl-klik voor meerdere vakken. Aaneengesloten vakken in één kolom krijgen samen één deur of klep.</div>${tools}`;
    const first = sel[0];
    const col = d.columns[first.col];
    const ownerK = frontOwner(col, first.k);
    const owner = col.cells[ownerK];
    const cell = col.cells[first.k];
    const curFront = owner.front;
    const allSameFront = sel.every(s => { const c = d.columns[s.col]; return c.cells[frontOwner(c, s.k)].front === curFront; });
    const frontTiles = Object.entries(FRONT_TYPES).map(([k, v]) => `
      <button class="tile ${allSameFront && curFront === k ? 'on' : ''}" data-act="front" data-val="${k}">${FRONT_ICONS[k]}${v.label}</button>`).join('');
    const isDrawer = curFront === 'drawer' && allSameFront;
    const intTiles = Object.entries(INTERIORS).map(([k, v]) => `
      <button class="tile ${sel.every(s => d.columns[s.col].cells[s.k].interior === cell.interior) && cell.interior === k ? 'on' : ''}" data-act="interior" data-val="${k}">${INTERIOR_ICONS[k]}${v.label}</button>`).join('');
    const spanCtl = sel.length === 1 && curFront !== 'none' && curFront !== 'drawer' ? `
      <div class="row"><span class="lbl">Front over</span><span class="spacer"></span>
        <div class="mini"><button class="pm" data-act="span" data-step="-1">−</button><b>${owner.span}</b><button class="pm" data-act="span" data-step="1">+</button></div><span class="hint">vak(ken)</span></div>` : '';
    return `
      <div class="card sel"><div class="row"><b>${sel.length === 1 ? `Kolom ${first.col + 1} · vak ${first.k + 1}` : `${sel.length} vakken gekozen`}</b>
        <span class="spacer"></span><span class="hint">${sel.length === 1 ? `${col.w} × ${cell.h} mm` : ''}</span></div></div>
      <div class="field"><label>Front</label><div class="tiles">${frontTiles}</div></div>
      ${spanCtl}
      ${isDrawer ? '<div class="hint">Een lade vult het hele vak; het interieur is de ladebak.</div>' : `
      <div class="field"><label>Interieur</label><div class="tiles">${intTiles}</div></div>
      ${cell.interior === 'inner' ? `<div class="row"><span class="lbl">Aantal binnenlades</span><span class="spacer"></span>
        <div class="mini"><button class="pm" data-act="icount" data-step="-1">−</button><b>${cell.count}</b><button class="pm" data-act="icount" data-step="1">+</button></div></div>` : ''}`}
      ${tools}`;
  },

  6() {
    const d = state.d;
    const tiles = Object.entries(HANDLE_TYPES).map(([k, v]) => `
      <button class="tile ${d.handle.type === k ? 'on' : ''}" data-act="handle" data-val="${k}">${HANDLE_ICONS[k]}${v.label}</button>`).join('');
    const fin = Object.entries(FINISHES).map(([k, v]) => `
      <button class="swatch ${d.handle.finish === k ? 'on' : ''}" data-act="finish" data-val="${k}" data-name="${v.label}" aria-label="${v.label}"
        style="background:${v.metal > 0.5 ? `radial-gradient(circle at 35% 30%, #fff 0%, ${v.color} 45%, #555 120%)` : v.color}"></button>`).join('');
    return `
      <div class="tiles">${tiles}</div>
      ${d.handle.type !== 'push' ? `<div class="field"><label>Afwerking · ${FINISHES[d.handle.finish].label}</label><div class="swatches">${fin}</div></div>` : ''}
      <div class="hint">${{
        push: 'Geen zichtbare greep. Deuren en kleppen krijgen een drukschakelaar, lades een push-to-open geleider.',
        staaf: 'Staafgreep 160 mm hart-op-hart. Verticaal op deuren aan de openingszijde, horizontaal op lades.',
        lijst: 'Greeplijst op de bovenkant van lades; op deuren op de kant aan de openingszijde.',
        kant: 'Korte kantgreep (100 mm) op de bovenkant van het front, bij deuren aan de openingszijde.',
        plat: 'Platte greep 128 mm hart-op-hart.',
        knop: 'Ronde knop Ø24 mm.',
      }[d.handle.type]}</div>`;
  },

  7() {
    const d = state.d, g = state.geo;
    const nest = nestParts(g.parts, d.sheet, d);
    const sheets = nest.reduce((a, n) => a + n.sheets.length, 0);
    const area = g.parts.reduce((a, p) => a + p.size.L * p.size.B, 0) / 1e6;
    const fronts = g.parts.filter(p => p.group === 'front').length;
    const saved = store.list();
    return `
      ${g.warnings.length ? `<div class="warn"><b>Let op</b><ul>${g.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="stats">
        <div class="stat"><b>${g.parts.length}</b><span>plaatdelen</span></div>
        <div class="stat"><b>${sheets}</b><span>platen ${d.sheet.L}×${d.sheet.W}</span></div>
        <div class="stat"><b>${area.toFixed(2)} m²</b><span>netto plaatoppervlak</span></div>
        <div class="stat"><b>${fronts}</b><span>fronten</span></div>
      </div>
      <div class="field"><label>Zaagplaten</label>
        <ul class="list">${nest.map(n => `<li><span>${esc(n.label)}</span>
          <label class="toggle mini-t" title="Nerfrichting aanhouden: onderdelen niet draaien"><input type="checkbox" data-grain="${n.type}" ${grainOn(d, n.type) ? 'checked' : ''}>nerf</label>
          <span class="q">${n.sheets.length}× · ${n.sheets.map(s => Math.round(s.used * 100) + '%').join(' ')}</span></li>`).join('')}</ul>
        <div class="hint">Zet nerf uit voor plaat zonder richting (MDF, gelakt): dan mogen delen gedraaid worden en nest hij zuiniger.</div></div>
      <div class="field"><label>Plaatformaat & zagen</label>
        ${numField('sheet.L', d.sheet.L, { min: 1000, max: 3100, step: 10, name: 'Lengte' })}
        ${numField('sheet.W', d.sheet.W, { min: 600, max: 2100, step: 10, name: 'Breedte' })}
        ${numField('sheet.kerf', d.sheet.kerf, { min: 0, max: 10, step: 1, name: 'Zaagsnede' })}
        ${numField('sheet.margin', d.sheet.margin, { min: 0, max: 50, step: 1, name: 'Randmarge' })}
      </div>
      <div class="field"><label>Exporteren</label>
        <button class="btn accent wide" data-act="pdf"><span>PDF-overzicht</span><span>tekening · beslag · zaaglijst</span></button>
        <button class="btn wide" data-act="dxf"><span>DXF-zaagbestand</span><span>genummerd · boorgaten</span></button>
        <button class="btn wide" data-act="manual"><span>Montagehandleiding</span><span>PDF · stap voor stap</span></button>
        <button class="btn wide" data-act="rhino"><span>3D-model voor Rhino</span><span>.3dm · lagen · namen</span></button>
        <div class="row">
          <button class="btn ghost small" data-act="json">Projectbestand (.json)</button>
          <button class="btn ghost small" data-act="open">Openen…</button>
          <button class="btn ghost small" data-act="share">Deellink</button>
        </div>
      </div>
      <div class="field"><label>Beslag & onderdelen</label>
        <ul class="list">${g.hardware.map(h => `<li><span>${esc(h.name)}</span><span class="q">${h.qty}×</span></li>`).join('')}</ul></div>
      <div class="field"><label>Opgeslagen ontwerpen</label>
        ${saved.length ? `<ul class="list saved">${saved.map(s => `<li>
          <span class="nm" data-act="load" data-id="${s.id}">${s.id === d.id ? '● ' : ''}${esc(s.name)}</span>
          <span class="dt">${new Date(s.updated).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
          <button class="x" data-act="del" data-id="${s.id}" aria-label="Verwijderen">✕</button></li>`).join('')}</ul>` : '<div class="hint">Nog niets opgeslagen.</div>'}
      </div>`;
  },
};

function swatchBg(type, color) {
  const m = MATERIALS[type];
  if (m.paint) return color || '#8DA1B4';
  return `repeating-linear-gradient(90deg, ${m.color} 0 5px, ${shade(m.color, -14)} 5px 6px, ${m.color} 6px 11px, ${shade(m.color, 8)} 11px 13px)`;
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => clamp(Math.round(c + c * pct / 100), 0, 255);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------- invoer ----------
function getPath(o, p) { return p.split('.').reduce((a, k) => a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

function applyField(field, raw, el) {
  const d = state.d;
  if (field === 'name') { commit(d => { d.name = raw.trim() || 'Naamloos'; }, { panel: false }); return; }
  if (field === 'pt') {
    const v = parseFloat(raw); if (!isFinite(v)) { renderPanel(); return; }
    const i = +el.dataset.i, c = +el.dataset.c;
    commit(d => { const p = d.shape.pts[i]; moveShapePoint(d, i, c === 0 ? v : p[0], c === 1 ? v : p[1]); });
    return;
  }
  if (field === 'H' && d.shape.on) {
    const v = parseFloat(raw); if (!isFinite(v)) return;
    const f = clamp(v, 200, 3000) / d.H;
    commit(d => { d.shape.pts = d.shape.pts.map(([x, y]) => [x, y * f]); });
    return;
  }
  if (field === 'colw') { const v = parseFloat(raw); if (isFinite(v)) commit(d => setColWidth(d, +el.dataset.i, v)); return; }
  if (field === 'shelfY') {
    const v = parseFloat(raw); const s = state.sel.shelf;
    if (isFinite(v) && s) commit(d => moveShelfTo(d, s.col, s.k, v));
    return;
  }
  const v = parseFloat(String(raw).replace(',', '.'));
  if (!isFinite(v)) { renderPanel(); return; }
  const min = el?.dataset.min !== undefined ? +el.dataset.min : -Infinity, max = el?.dataset.max !== undefined ? +el.dataset.max : Infinity;
  commit(d => setPath(d, field, clamp(Math.round(v), min, max)));
}

const panel = $('#panel');
panel.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.grain) { const ty = el.dataset.grain; commit(d => { d.grain[ty] = el.checked; }); return; }
  if (el.type === 'range') return;
  const f = el.dataset.field;
  if (!f) return;
  if (el.type === 'checkbox') { commit(d => setPath(d, f, el.checked)); return; }
  applyField(f, el.value, el);
});
panel.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[data-field]')) e.target.blur();
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.matches('.num input')) {
    e.preventDefault();
    const st = e.shiftKey ? 100 : 10;
    const el = e.target; el.value = (parseFloat(el.value) || 0) + (e.key === 'ArrowUp' ? st : -st);
    applyField(el.dataset.field, el.value, el);
    requestAnimationFrame(() => { const n = panel.querySelector(`.num input[data-field="${el.dataset.field}"]`); n && n.focus(); });
  }
});
let rangeUndo = false;
panel.addEventListener('pointerdown', e => { if (e.target.type === 'range') { pushUndo(); rangeUndo = true; } });
panel.addEventListener('input', e => {
  const el = e.target;
  if (el.type === 'color' && el.dataset.act === 'picker') {
    state.d.material[el.dataset.path].color = el.value; refresh(false); return;
  }
  if (el.type !== 'range') return;
  if (!rangeUndo) { pushUndo(); rangeUndo = true; }
  if (el.dataset.field === 'H' && state.d.shape.on) { const f = +el.value / state.d.H; state.d.shape.pts = state.d.shape.pts.map(([x, y]) => [x, y * f]); }
  else setPath(state.d, el.dataset.field, +el.value);
  normalize(state.d);
  const box = el.closest('.dim')?.querySelector('.num input'); if (box) box.value = el.value;
  refresh(false);
});
panel.addEventListener('change', e => {
  if (e.target.type === 'range') { rangeUndo = false; renderPanel(); }
  if (e.target.type === 'color' && e.target.dataset.act === 'picker') { pushUndo(); refresh(); }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.dataset.act === 'picker') return;
  const act = b.dataset.act, val = b.dataset.val;
  const d = state.d;
  switch (act) {
    case 'step': state.step = state.step === +b.dataset.n ? 0 : +b.dataset.n; onStep(); renderPanel(); break;
    case 'inc': { const f = b.dataset.field; const cur = f === 'shelfY' ? cellY(d, state.sel.shelf.col, state.sel.shelf.k).bot : getPath(d, f); applyField(f, cur + +b.dataset.step, panel.querySelector(`.num input[data-field="${f}"]`)); break; }
    case 'set': commit(d => setPath(d, b.dataset.field, +val)); break;
    case 'shape': commit(d => setShapePreset(d, val)); if (val !== 'rect' && state.view.dim === '3d') { state.view.dim = '2d'; viewer.setView(state.view); renderViewbar(); renderFoot(); } viewer.fit(); break;
    case 'addpt': commit(d => addShapePoint(d)); break;
    case 'delpt': commit(d => { d.shape.pts.splice(+b.dataset.i, 1); }); break;
    case 'rhino': export3dm(b); break;
    case 'manual': exportManual(b); break;
    case 'mattab': state.matTab = val; renderPanel(); break;
    case 'mat': commit(d => { const m = d.material[b.dataset.path]; m.type = val; if (MATERIALS[val].paint && !m.color) m.color = '#8DA1B4'; }); break;
    case 'color': commit(d => { d.material[b.dataset.path].color = val; }); break;
    case 'cols': commit(d => setColumnCount(d, d.columns.length + +b.dataset.step)); break;
    case 'eqcols': commit(d => equalizeColumns(d)); break;
    case 'cells': commit(d => setCellCount(d, +b.dataset.i, d.columns[+b.dataset.i].cells.length + +b.dataset.step)); break;
    case 'eqcells': commit(d => equalizeCells(d, +b.dataset.i)); break;
    case 'shelfloose': { const s = state.sel.shelf; commit(d => { d.columns[s.col].loose[s.k] = val === '1'; }); break; }
    case 'allloose': commit(d => d.columns.forEach(c => { c.loose = c.loose.map(() => val === '1'); })); break;
    case 'front': applyFront(val); break;
    case 'interior': commit(d => state.sel.cells.forEach(s => { d.columns[s.col].cells[s.k].interior = val; })); break;
    case 'icount': commit(d => state.sel.cells.forEach(s => { const c = d.columns[s.col].cells[s.k]; c.count = clamp(c.count + +b.dataset.step, 1, 8); })); break;
    case 'span': {
      const s = state.sel.cells[0]; const col = d.columns[s.col]; const ok = frontOwner(col, s.k);
      commit(d => { const c = d.columns[s.col].cells[ok]; c.span = clamp(c.span + +b.dataset.step, 1, col.cells.length - ok); });
      state.sel.cells = [{ col: s.col, k: ok }]; refresh(); break;
    }
    case 'selcol': {
      const c = state.sel.cells[0]?.col ?? state.sel.shelf?.col ?? 0;
      state.sel = { cells: d.columns[c].cells.map((_, k) => ({ col: c, k })), shelf: null }; refresh(); break;
    }
    case 'selall': state.sel = { cells: d.columns.flatMap((c, ci) => c.cells.map((_, k) => ({ col: ci, k }))), shelf: null }; refresh(); break;
    case 'clearsel': state.sel = { cells: [], shelf: null }; refresh(); break;
    case 'handle': commit(d => { d.handle.type = val; }); break;
    case 'finish': commit(d => { d.handle.finish = val; }); break;
    case 'pdf': exportPdfAction(b); break;
    case 'dxf': exportDxf(); break;
    case 'json': download(`${slug(d.name)}.json`, JSON.stringify(d, null, 2), 'application/json'); break;
    case 'open': $('#fileOpen').click(); break;
    case 'share': share(); break;
    case 'load': loadDesign(store.get(b.dataset.id)); break;
    case 'del': if (confirm('Ontwerp verwijderen?')) { store.remove(b.dataset.id); renderPanel(); } break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'new': if (confirm('Nieuw ontwerp beginnen? Het huidige ontwerp blijft opgeslagen.')) { store.autosave(d); loadDesign(defaultDesign(), true); } break;
    case 'save': store.autosave(d, true); toast('Ontwerp opgeslagen in deze browser'); if (state.step === 7) renderPanel(); break;
    case 'view': state.view[b.dataset.key] = b.dataset.key === 'dims' ? !state.view.dims : val; viewer.setView(state.view); if (b.dataset.key === 'dim') viewer.fit(); renderViewbar(); renderFoot(); break;
    case 'fit': viewer.fit(); break;
    case 'gowarn': state.step = 7; renderPanel(); break;
  }
});

function onStep() {
  if (state.step === 4 && state.view.fronts === 'dicht') { state.view.fronts = 'weg'; viewer.setView(state.view); renderViewbar(); }
  if ((state.step === 5 || state.step === 6) && state.view.fronts === 'weg') { state.view.fronts = 'dicht'; viewer.setView(state.view); renderViewbar(); }
}

function applyFront(type) {
  commit(d => {
    // groepeer selectie per kolom in aaneengesloten reeksen
    const byCol = new Map();
    for (const s of state.sel.cells) { if (!byCol.has(s.col)) byCol.set(s.col, []); byCol.get(s.col).push(s.k); }
    for (const [ci, ks] of byCol) {
      const col = d.columns[ci];
      ks.sort((a, b) => a - b);
      // eerst eventuele overspanningen die de selectie raken inkorten
      for (const k of ks) {
        const o = frontOwner(col, k);
        if (o !== k) col.cells[o].span = k - o;
        const c = col.cells[k];
        if (c.span > 1) { for (let j = k + 1; j < k + c.span; j++) if (!ks.includes(j)) col.cells[j].front = 'none'; }
        c.span = 1;
      }
      const runs = [];
      for (const k of ks) { const r = runs[runs.length - 1]; if (r && r[1] === k - 1) r[1] = k; else runs.push([k, k]); }
      for (const [a, b] of runs) {
        if (type === 'drawer' || type === 'none') { for (let k = a; k <= b; k++) { col.cells[k].front = type; col.cells[k].span = 1; } }
        else { col.cells[a].front = type; col.cells[a].span = b - a + 1; for (let k = a + 1; k <= b; k++) col.cells[k].front = 'none'; }
      }
    }
  });
}

// ---------- weergavebalk ----------
function renderViewbar() {
  const v = state.view;
  const sg = (key, items) => `<div class="seg">${items.map(([val, l]) => `<button data-act="view" data-key="${key}" data-val="${val}" class="${v[key] === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('#viewbar').innerHTML = `
    ${sg('dim', [['3d', '3D'], ['2d', '2D']])}
    ${sg('mode', [['render', 'Render'], ['shaded', 'Shaded'], ['lines', 'Lijnen']])}
    ${sg('fronts', [['dicht', 'Dicht'], ['open', 'Open'], ['weg', 'Zonder fronten']])}
    <button class="iconbtn ${v.dims ? 'on' : ''}" data-act="view" data-key="dims">Maten</button>
    <button class="iconbtn" data-act="fit" title="Passend in beeld">⤢</button>`;
}

function renderFoot() {
  const d = state.d, g = state.geo;
  $('#stagefoot').innerHTML = `
    <span class="chip">${d.W} × ${d.H} × ${d.D + d.t} mm</span>
    ${g.warnings.length ? `<button class="chip warn" data-act="gowarn">${g.warnings.length} aandachtspunt${g.warnings.length > 1 ? 'en' : ''}</button>` : ''}
    <span class="chip hint">${state.view.dim === '2d' ? 'Slepen = pannen · scrollen = zoomen' : 'Slepen = draaien · rechts = pannen · scrollen = zoomen'}</span>`;
}

// ---------- bestanden ----------
const slug = s => (s || 'ontwerp').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ontwerp';

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportDxf() {
  const d = state.d;
  const nest = nestParts(state.geo.parts, d.sheet, d);
  const unplaced = nest.flatMap(n => n.unplaced);
  download(`${slug(d.name)}-zaagplan.dxf`, buildDxf(nest, d.sheet, d.name), 'application/dxf');
  toast(unplaced.length ? `DXF gemaakt — ${unplaced.length} deel/delen passen niet op de plaat` : 'DXF-zaagbestand gedownload');
}

async function exportPdfAction(btn) {
  btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<span>PDF maken…</span>';
  try {
    const { exportPdf } = await import('./pdf.js');
    const nest = nestParts(state.geo.parts, state.d.sheet, state.d);
    const axo = viewer.snapshot({ w: 1500, h: 1100, mode: 'render', dim: '3d' });
    const blob = await exportPdf(state.d, state.geo, nest, { axo });
    download(`${slug(state.d.name)}-overzicht.pdf`, blob);
    toast('PDF gedownload');
  } catch (err) {
    console.error(err); toast('PDF maken mislukt: ' + err.message);
  } finally { btn.disabled = false; btn.innerHTML = old; }
}

async function export3dm(btn) {
  btn.disabled = true;
  try {
    const { build3dm } = await import('./export3dm.js');
    const bytes = await build3dm(state.d, state.geo, { extraMeshes: viewer.hardwareMeshes() });
    download(`${slug(state.d.name)}.3dm`, new Blob([bytes], { type: 'application/octet-stream' }));
    toast('3DM-bestand gedownload');
  } catch (err) { console.error(err); toast('3DM maken mislukt: ' + err.message); }
  finally { btn.disabled = false; }
}

async function exportManual(btn) {
  btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<span>Handleiding maken…</span>';
  try {
    const { buildManual } = await import('./manual.js');
    const blob = await buildManual(state.d, state.geo, viewer, (msg) => { btn.innerHTML = `<span>${msg}</span>`; });
    download(`${slug(state.d.name)}-montagehandleiding.pdf`, blob);
    toast('Montagehandleiding gedownload');
  } catch (err) { console.error(err); toast('Handleiding maken mislukt: ' + err.message); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

$('#fileOpen').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!d.columns) throw new Error('geen ontwerp'); d.id = d.id || uid(); loadDesign(d, true); toast('Ontwerp geladen'); }
  catch (err) { toast('Kon bestand niet lezen: ' + err.message); }
  e.target.value = '';
});

function share() {
  const url = location.origin + location.pathname + '#d=' + store.encode(state.d);
  navigator.clipboard?.writeText(url).then(() => toast('Deellink gekopieerd'), () => prompt('Kopieer deze link:', url));
}

function loadDesign(d, fresh = false) {
  if (!d) return;
  pushUndo();
  state.d = normalize(JSON.parse(JSON.stringify(d)));
  state.sel = { cells: [], shelf: null };
  viewer.firstFit = true;
  if (fresh) state.step = 1;
  refresh();
}

$('#projName').addEventListener('change', e => commit(d => { d.name = e.target.value.trim() || 'Naamloos'; }));
$('#projName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if (e.key === 'Escape') { state.sel = { cells: [], shelf: null }; refresh(); }
});

renderViewbar();
refresh();
window.__app = { state, viewer, refresh };
