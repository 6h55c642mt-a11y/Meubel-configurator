// three.js-weergave: 3D (perspectief) en 2D (orthografisch vooraanzicht),
// modi shaded / lijnen / render, maatlabels, selecteren en slepen.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MATERIALS, FINISHES, matInfo } from './model.js';
import { woodTexture, plyTexture } from './textures.js';

const MM = 0.001;
const AXI = { x: 0, y: 1, z: 2 };
const ACCENT = 0xd9822b;

export class Viewer {
  constructor(el, cb) {
    this.el = el; this.cb = cb;
    this.view = { dim: '3d', mode: 'render', fronts: 'dicht', dims: true };
    this.openAmt = 0; this.openTarget = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);

    this.labelR = new CSS2DRenderer();
    Object.assign(this.labelR.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.labelR.domElement.className = 'label-layer';
    el.appendChild(this.labelR.domElement);

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 1.4);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 6; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.01;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), new THREE.ShadowMaterial({ opacity: 0.08 }));
    this.wall.position.y = 4; this.wall.receiveShadow = true;
    this.scene.add(this.floor, this.wall);

    this.root = new THREE.Group(); this.root.scale.setScalar(MM);
    this.scene.add(this.root);

    this.persp = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.persp, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controlsO = new OrbitControls(this.ortho, r.domElement);
    this.controlsO.enableRotate = false; this.controlsO.enabled = false; this.controlsO.screenSpacePanning = true;

    this.ray = new THREE.Raycaster();
    this.matCache = new Map();
    this.picks = [];
    this.anims = new Map();
    this.firstFit = true;

    this._bindPointer();
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  // ---------- algemeen ----------
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h); this.labelR.setSize(w, h);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    this._fitOrtho();
  }

  setView(v) {
    const prev = { ...this.view };
    Object.assign(this.view, v);
    if (v.fronts !== undefined) this.openTarget = this.view.fronts === 'open' ? 1 : 0;
    if (prev.dim !== this.view.dim) {
      this.camera = this.view.dim === '2d' ? this.ortho : this.persp;
      this.controls.enabled = this.view.dim === '3d';
      this.controlsO.enabled = this.view.dim === '2d';
      if (this.view.dim === '2d') this._fitOrtho(true);
    }
    if (this.design) this.update(this.design, this.geo, this.sel);
  }

  fit() {
    if (!this.design) return;
    const d = this.design;
    const W = d.W * MM, H = d.H * MM, D = d.D * MM;
    const target = new THREE.Vector3(0, H / 2, D / 2);
    const size = Math.max(W, H * 1.4);
    const dist = size / (2 * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) * 1.25 / Math.min(1, this.persp.aspect) + D;
    const dir = new THREE.Vector3(0.55, 0.32, 1).normalize();
    this.persp.position.copy(target).addScaledVector(dir, Math.max(dist, 1.6));
    this.controls.target.copy(target); this.controls.update();
    this._fitOrtho(true);
  }

  _fitOrtho(reset) {
    if (!this.design) return;
    const d = this.design;
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1, asp = w / h;
    const pad = 380;
    const bw = (d.W + pad * 2) * MM, bh = (d.H + pad * 2.4) * MM;
    let halfH = Math.max(bh / 2, bw / 2 / asp);
    this.ortho.left = -halfH * asp; this.ortho.right = halfH * asp; this.ortho.top = halfH; this.ortho.bottom = -halfH;
    this.ortho.updateProjectionMatrix();
    if (reset) {
      this.ortho.zoom = 1;
      const cy = d.H * MM / 2 - 0.04;
      this.ortho.position.set(0, cy, 20); this.controlsO.target.set(0, cy, 0); this.ortho.updateProjectionMatrix(); this.controlsO.update();
    }
  }

  tick() {
    const k = 0.14;
    if (Math.abs(this.openAmt - this.openTarget) > 0.001) {
      this.openAmt += (this.openTarget - this.openAmt) * k;
      this._applyAnim();
    }
    (this.view.dim === '2d' ? this.controlsO : this.controls).update();
    this.renderer.render(this.scene, this.camera);
    this.labelR.render(this.scene, this.camera);
  }

  // ---------- materialen ----------
  _mat(key, make) {
    if (!this.matCache.has(key)) this.matCache.set(key, make());
    return this.matCache.get(key);
  }

  _partMats(p) {
    const mode = this.view.mode;
    const info = matInfo(p.mat);
    const col = info.color || '#cccccc';
    if (mode === 'lines') {
      const m = this._mat('lines', () => new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      return [m, m];
    }
    if (mode === 'shaded') {
      const face = this._mat(`sh:${col}`, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      const edge = info.ply ? this._mat(`sh:ply`, () => new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })) : face;
      return [face, edge];
    }
    const face = this._mat(`r:${info.key}:${col}`, () => {
      if (info.paint) return new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0 });
      return new THREE.MeshStandardMaterial({ map: woodTexture(info.wood), roughness: 0.58, metalness: 0 });
    });
    const edge = info.ply ? this._mat(`r:ply:${p.t}`, () => new THREE.MeshStandardMaterial({ map: plyTexture(p.t), roughness: 0.7 })) : face;
    return [face, edge];
  }

  _finishMat(key) {
    const f = FINISHES[key] || FINISHES.zwart;
    if (this.view.mode === 'lines') return this._mat('lines', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
    return this._mat(`fin:${key}:${this.view.mode}`, () => new THREE.MeshStandardMaterial({
      color: f.color, metalness: this.view.mode === 'render' ? f.metal : f.metal * 0.3, roughness: f.rough,
    }));
  }

  // ---------- opbouw ----------
  update(design, geo, sel) {
    this.design = design; this.geo = geo; this.sel = sel || { cells: [] };
    const mode = this.view.mode;
    this.renderer.toneMapping = mode === 'render' ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    this.scene.environmentIntensity = 0.55;
    this.scene.environment = mode === 'render' ? this.envTex : null;
    this.hemi.intensity = mode === 'render' ? 0.35 : 2.0;
    this.sun.intensity = mode === 'render' ? 1.6 : 1.1;
    this.sun.castShadow = mode === 'render';
    this.floor.visible = this.wall.visible = mode !== 'lines';

    // oude inhoud opruimen
    for (const o of [...this.root.children]) {
      o.traverse(c => { if (c.isCSS2DObject) c.element.remove(); if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); });
      this.root.remove(o);
    }
    this.picks = []; this.anims = new Map();

    const d = design, dm = geo.dims;
    this.root.position.set(-d.W / 2 * MM, 0, -0 * MM);
    this.wall.position.z = -0.002;
    this.sun.position.set(-1.8, 3.6, 3.2); this.sun.target.position.set(0, 0.4, 0);
    const sc = this.sun.shadow.camera; const ext = Math.max(d.W, d.H) * MM * 0.9 + 0.6;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = 12; sc.updateProjectionMatrix();

    const showFronts = this.view.fronts !== 'weg';
    const lines = mode === 'lines', edgesOn = mode !== 'render';
    const lineMat = this._mat(`lm:${mode}`, () => new THREE.LineBasicMaterial({
      color: lines ? 0x1f1f1f : 0x2a2a2a, transparent: !lines, opacity: lines ? 1 : 0.28,
    }));

    const ov = this.override;
    for (const p of geo.parts) {
      if (ov && ov.visible && !ov.visible.has(p.num)) continue;
      const isAnim = p.meta && p.meta.anim;
      if (!showFronts && (p.group === 'front' || p.group === 'lade')) {
        if (p.group === 'front') continue;
        if (p.group === 'lade' && !p.name.startsWith('Binnenlade')) continue;
      }
      const b = p.box;
      let geom, mats, center;
      if (p.prism) {
        geom = prismGeometry(p.prism);
        center = [0, 0, 0];
        const [face, edge] = this._partMats(p);
        const pm = this._prismMats(p, face, edge);
        mats = p.thin === 'z' ? [pm.face, pm.edge] : [pm.edge, pm.face];
      } else {
        const size = [b[1] - b[0], b[3] - b[2], b[5] - b[4]];
        center = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
        geom = panelGeometry(size, AXI[p.thin], AXI[p.grain], p.num);
        const [face, edge] = this._partMats(p);
        mats = [0, 0, 1, 1, 2, 2].map(a => (a === AXI[p.thin] ? face : edge));
      }
      if (this.override) mats = this._overrideMat(p, mats);
      const mesh = new THREE.Mesh(geom, mats);
      mesh.castShadow = mode === 'render'; mesh.receiveShadow = mode === 'render';
      mesh.userData.part = p;
      if (edgesOn) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 20), lineMat);
        mesh.add(e);
      }
      const parent = isAnim ? this._animGroup(p.meta.anim, p, dm) : this.root;
      const off = parent.userData.pivot || [0, 0, 0];
      mesh.position.set(center[0] - off[0], center[1] - off[1], center[2] - off[2]);
      if (ov && ov.offset && ov.offset[p.num]) mesh.position.add(new THREE.Vector3(...ov.offset[p.num]));
      parent.add(mesh);

      if (p.meta?.drag === 'shelf' || p.meta?.drag === 'divider') this.picks.push(mesh);
      if (p.group === 'front') this.picks.push(mesh);
    }

    // grepen
    if (showFronts && (!ov || ov.handles)) for (const h of geo.handles) {
      const g = handleMesh(h, this._finishMat(design.handle.finish), mode === 'render');
      const parent = this.anims.get(h.animId)?.obj || this.root;
      const off = parent.userData.pivot || [0, 0, 0];
      g.position.set(h.x - off[0], h.y - off[1], h.z - off[2]);
      if (this.override) g.traverse(c => { if (c.isMesh) c.material = this.override.hlHandles ? this._mat('ov:hl', () => new THREE.MeshBasicMaterial({ color: 0xf2c9a8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })) : this._mat('ov:white', () => new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); });
      if (edgesOn) g.traverse(c => { if (c.isMesh) c.add(new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry, 30), lineMat)); });
      parent.add(g);
    }
    // garderobestangen
    if (!ov || ov.rails) for (const r of geo.rails) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, r.x1 - r.x0 - 4, 24), this._finishMat('rvs'));
      m.rotation.z = Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, r.y, r.z); m.castShadow = mode === 'render';
      this.root.add(m);
    }

    // klikvlakken voor vakken
    const pickMat = this._mat('pick', () => new THREE.MeshBasicMaterial({ visible: false }));
    if (!this.override) for (const c of geo.picks) {
      const m = new THREE.Mesh(cellGeometry(c), pickMat);
      m.position.set(0, 0, dm.zF - 0.5);
      m.userData.cell = c; this.root.add(m); this.picks.push(m);
    }

    if (!this.override) this._selection(geo, dm, showFronts);
    if (!this.override && this.view.shapeEdit && design.shape && design.shape.on) this._shapeHandles(design, dm, showFronts);
    if (this.view.dims && !this.override) this._labels(design, geo, dm, showFronts);
    this._applyAnim();
    if (this.firstFit) { this.firstFit = false; this.fit(); }
  }

  _prismMats(p, face, edge) {
    if (this.view.mode !== 'render' || !face.map) return { face, edge: this.view.mode === 'render' ? face : edge };
    const key = `pr:${face.uuid}`;
    const f2 = this._mat(key, () => { const m = face.clone(); m.map = face.map.clone(); m.map.repeat.set(1 / 900, 1 / 900); m.map.needsUpdate = true; return m; });
    return { face: f2, edge: f2 };
  }

  _overrideMat(p, mats) {
    const ov = this.override;
    const hl = ov.highlight && ov.highlight.has(p.num);
    const m = hl ? this._mat('ov:hl', () => new THREE.MeshBasicMaterial({ color: 0xf2c9a8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
      : this._mat('ov:white', () => new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    return Array.isArray(mats) ? mats.map(() => m) : m;
  }

  _shapeHandles(d, dm, showFronts) {
    const z = (showFronts && this.view.fronts === 'dicht' ? dm.zF + dm.tf : dm.zF) + 8;
    const pts = d.shape.pts;
    const lm = this._mat('shapeLine', () => new THREE.LineBasicMaterial({ color: ACCENT }));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, z))), lm);
    this.root.add(line);
    const hm = this._mat('shapeH', () => new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }));
    const geo = new THREE.CircleGeometry(16, 24);
    pts.forEach(([x, y], i) => {
      const m = new THREE.Mesh(geo, hm); m.position.set(x, y, z); m.renderOrder = 10;
      m.userData.shapePt = i; this.root.add(m); this.picks.unshift(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(16, 22, 24), this._mat('shapeR', () => new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })));
      ring.position.copy(m.position); ring.renderOrder = 9; this.root.add(ring);
    });
  }

  _animGroup(anim, p, dm) {
    if (this.anims.has(anim.id)) return this.anims.get(anim.id).obj;
    const g = new THREE.Group();
    let pivot = [0, 0, 0];
    if (anim.kind === 'hinge') {
      const b = p.box;
      if (anim.hinge === 'l') pivot = [b[0], 0, b[5]];
      else if (anim.hinge === 'r') pivot = [b[1], 0, b[5]];
      else if (anim.hinge === 't') pivot = [0, b[3], b[5]];
      else pivot = [0, b[2], b[5]];
    }
    g.position.set(...pivot); g.userData.pivot = pivot;
    this.root.add(g);
    this.anims.set(anim.id, { obj: g, anim, depth: dm.Ds });
    return g;
  }

  _applyAnim() {
    const a = this.openAmt;
    for (const { obj, anim, depth } of this.anims.values()) {
      const piv = obj.userData.pivot;
      obj.rotation.set(0, 0, 0);
      obj.position.set(...piv);
      if (anim.kind === 'drawer') obj.position.z = piv[2] + a * depth * 0.55;
      else if (anim.hinge === 'l') obj.rotation.y = -a * THREE.MathUtils.degToRad(80);
      else if (anim.hinge === 'r') obj.rotation.y = a * THREE.MathUtils.degToRad(80);
      else if (anim.hinge === 't') obj.rotation.x = -a * THREE.MathUtils.degToRad(80);
      else if (anim.hinge === 'b') obj.rotation.x = a * THREE.MathUtils.degToRad(85);
    }
  }

  _selection(geo, dm, showFronts) {
    const mat = this._mat('sel', () => new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.32, depthWrite: false }));
    const z = (showFronts && this.view.fronts === 'dicht' ? dm.zF + dm.tf : dm.zF) + 1.5;
    const frontsClosed = showFronts && this.view.fronts === 'dicht';
    const done = new Set();
    for (const s of this.sel.cells || []) {
      const c = geo.picks.find(q => q.col === s.col && q.k === s.k);
      if (!c) continue;
      // bij gesloten fronten: markeer de vorm van het front dat dit vak afdekt
      let shapes = [c];
      if (frontsClosed) {
        const fr = geo.parts.filter(p => p.group === 'front' && p.meta.col === s.col && s.k >= p.meta.k0 && s.k <= p.meta.k1);
        if (fr.length) {
          shapes = fr.filter(p => !done.has(p.num)).map(p => { done.add(p.num); return p.prism ? { poly: p.prism.poly } : { x0: p.box[0], x1: p.box[1], y0: p.box[2], y1: p.box[3] }; });
        }
      }
      for (const sh of shapes) {
        const m = new THREE.Mesh(cellGeometry(sh), mat);
        m.position.set(0, 0, z); m.renderOrder = 5;
        this.root.add(m);
        const fr = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), this._mat('selL', () => new THREE.LineBasicMaterial({ color: ACCENT })));
        fr.position.copy(m.position); this.root.add(fr);
      }
    }
    if (this.sel.shelf) {
      const p = geo.parts.find(q => q.meta?.drag === 'shelf' && q.meta.col === this.sel.shelf.col && q.meta.k === this.sel.shelf.k);
      if (p) {
        const b = p.box;
        const m = new THREE.Mesh(new THREE.BoxGeometry(b[1] - b[0] + 2, b[3] - b[2] + 2, b[5] - b[4] + 2), this._mat('selS', () => new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55, depthWrite: false })));
        m.position.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2); this.root.add(m);
      }
    }
  }

  _labels(d, geo, dm, showFronts) {
    const zL = (showFronts && this.view.fronts === 'dicht' ? dm.zF + dm.tf : dm.zF) + 4;
    const mk = (text, x, y, z, onEdit, cls = '') => {
      const el = document.createElement('div');
      el.className = 'dimlabel ' + cls;
      if (onEdit) {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = Math.round(text); inp.size = String(Math.round(text)).length;
        inp.addEventListener('pointerdown', e => e.stopPropagation());
        inp.addEventListener('focus', () => inp.select());
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = Math.round(text); inp.blur(); } });
        inp.addEventListener('change', () => { const v = parseFloat(inp.value.replace(',', '.')); if (isFinite(v)) onEdit(v); });
        el.appendChild(inp);
      } else el.textContent = Math.round(text);
      const o = new CSS2DObject(el); o.position.set(x, y, z);
      this.root.add(o);
      return o;
    };
    // vakhoogtes
    for (const c of geo.picks) {
      const h = c.y1 - c.y0;
      if (h < 50) continue;
      mk(h, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, zL, v => this.cb.onEditCellHeight(c.col, c.k, v));
    }
    // kolombreedtes, totaalmaten
    const yB = -110;
    d.columns.forEach((col, i) => {
      const c = geo.picks.find(q => q.col === i);
      mk(col.w, (c.x0 + c.x1) / 2, yB, dm.zF, d.columns.length > 1 ? v => this.cb.onEditColWidth(i, v) : null, 'col');
    });
    mk(d.W, d.W / 2, d.H + 150, dm.zF, v => this.cb.onEditOverall('W', v), 'total');
    mk(d.H, -170, d.H / 2, dm.zF, v => this.cb.onEditOverall('H', v), 'total');
    if (this.view.dim === '3d') mk(d.D, d.W + 120, 0, d.D / 2, v => this.cb.onEditOverall('D', v), 'total');

    // maatlijnen
    const lm = this._mat('dimline', () => new THREE.LineBasicMaterial({ color: 0x77736c }));
    const pts = [];
    const L = (a, b) => pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
    const z = dm.zF;
    const tick = (x, y, horiz) => horiz ? L([x - 12, y - 12, z], [x + 12, y + 12, z]) : L([x - 12, y - 12, z], [x + 12, y + 12, z]);
    // breedte boven
    const yT = d.H + 90; L([0, yT, z], [d.W, yT, z]); L([0, d.H + 30, z], [0, yT + 30, z]); L([d.W, d.H + 30, z], [d.W, yT + 30, z]); tick(0, yT, 1); tick(d.W, yT, 1);
    // hoogte links
    const xL = -100; L([xL, 0, z], [xL, d.H, z]); L([-30, 0, z], [xL - 30, 0, z]); L([-30, d.H, z], [xL - 30, d.H, z]); tick(xL, 0); tick(xL, d.H);
    // kolommen onder
    const yC = -60; L([0, yC, z], [d.W, yC, z]);
    const xs = [0, d.W, ...geo.picks.filter(q => q.k === 0).flatMap(q => [q.x0, q.x1])];
    for (const x of [...new Set(xs.map(Math.round))]) { L([x, -20, z], [x, yC - 25, z]); tick(x, yC); }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    this.root.add(new THREE.LineSegments(g, lm));
  }

  // ---------- interactie ----------
  _bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    const ndc = e => {
      const r = dom.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const hit = e => {
      this.ray.setFromCamera(ndc(e), this.camera);
      const hits = this.ray.intersectObjects(this.picks, false);
      return hits[0] || null;
    };
    const planeHit = (e) => {
      this.ray.setFromCamera(ndc(e), this.camera);
      const zW = (this.geo.dims.zF) * MM;
      const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zW);
      const v = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(pl, v)) return null;
      return { x: v.x / MM + this.design.W / 2, y: v.y / MM };
    };

    dom.addEventListener('pointerdown', e => {
      if (!this.design || e.button !== 0) return;
      const h = hit(e);
      down = { x: e.clientX, y: e.clientY, h, dragging: false };
      const p = h?.object.userData.part;
      if (h && h.object.userData.shapePt !== undefined) {
        down.drag = { drag: 'shape', i: h.object.userData.shapePt };
        this.controls.enabled = false; this.controlsO.enabled = false;
        dom.setPointerCapture(e.pointerId);
      } else if (p && (p.meta?.drag === 'shelf' || p.meta?.drag === 'divider')) {
        down.drag = p.meta;
        this.controls.enabled = false; this.controlsO.enabled = false;
        dom.setPointerCapture(e.pointerId);
      }
    });
    dom.addEventListener('pointermove', e => {
      if (!this.design) return;
      if (down && down.drag) {
        if (!down.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
        down.dragging = true;
        const ph = planeHit(e); if (!ph) return;
        const t = this.design.t;
        if (down.drag.drag === 'shape') this.cb.onMoveShapePoint(down.drag.i, ph.x, ph.y);
        else if (down.drag.drag === 'shelf') this.cb.onMoveShelf(down.drag.col, down.drag.k, ph.y + t / 2, false);
        else this.cb.onMoveDivider(down.drag.i, ph.x - t / 2, false);
        return;
      }
      if (down) return;
      const h = hit(e);
      const p = h?.object.userData.part;
      dom.style.cursor = h?.object.userData.shapePt !== undefined ? 'move' : p?.meta?.drag === 'shelf' ? 'ns-resize' : p?.meta?.drag === 'divider' ? 'ew-resize' : (h ? 'pointer' : 'grab');
    });
    dom.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      if (down.drag) {
        this.controls.enabled = this.view.dim === '3d'; this.controlsO.enabled = this.view.dim === '2d';
        if (down.dragging) this.cb.onDragEnd();
        else if (down.drag.drag === 'shelf') this.cb.onSelectShelf(down.drag.col, down.drag.k);
        else if (down.drag.drag === 'shape') this.cb.onSelectShapePoint?.(down.drag.i);
      } else if (!moved) {
        const o = down.h?.object;
        if (o?.userData.cell) this.cb.onSelectCell(o.userData.cell.col, o.userData.cell.k, add);
        else if (o?.userData.part?.group === 'front') { const m = o.userData.part.meta; this.cb.onSelectCell(m.col, m.k0, add); }
        else this.cb.onBackground();
      }
      down = null;
    });
  }

  // grepen en stangen als driehoeksnetten in mm (voor CAD-export)
  hardwareMeshes() {
    const out = [];
    const push = (obj, name) => {
      obj.updateMatrixWorld(true);
      obj.traverse(c => {
        if (!c.isMesh) return;
        const g = c.geometry.clone().applyMatrix4(c.matrixWorld);
        const ng = g.index ? g : g.toNonIndexed();
        const pos = Array.from(ng.attributes.position.array);
        const index = ng.index ? Array.from(ng.index.array) : Array.from({ length: pos.length / 3 }, (_, i) => i);
        out.push({ name, positions: pos, index });
      });
    };
    for (const h of this.geo.handles) {
      const g = handleMesh(h, new THREE.MeshBasicMaterial(), false);
      g.position.set(h.x, h.y, h.z); push(g, `Greep ${h.type}`);
    }
    for (const r of this.geo.rails) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, r.x1 - r.x0 - 4, 24));
      m.rotation.z = Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, r.y, r.z); push(m, 'Garderobestang');
    }
    return out;
  }

  // ---------- offscreen beelden voor PDF ----------
  snapshot({ w = 1600, h = 1100, mode = 'render', dim = '3d', fronts = 'dicht' } = {}) {
    return this.renderImage({ w, h, mode, dim, fronts }).url;
  }

  // override: { visible:Set, highlight:Set, offset:{num:[x,y,z]}, handles, rails, hlHandles }
  // cam: { dir:[x,y,z], box:[x0,x1,y0,y1,z0,z1] (mm), pad }
  renderImage({ w = 1600, h = 1100, mode = 'render', dim = '3d', fronts = 'dicht', override = null, cam = {}, project = [], openAmt = null } = {}) {
    const keep = { ...this.view }, keepOpen = this.openAmt, keepSel = this.sel;
    const keepSize = new THREE.Vector2(); this.renderer.getSize(keepSize);
    const keepPR = this.renderer.getPixelRatio();
    const keepFloor = [this.floor.visible, this.wall.visible];
    this.view = { ...this.view, mode: override ? 'lines' : mode, dim, fronts, dims: false };
    this.override = override;
    this.openAmt = openAmt ?? (fronts === 'open' ? 1 : 0);
    this.update(this.design, this.geo, { cells: [] });
    if (override) { this.floor.visible = this.wall.visible = false; }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.labelR.domElement.style.display = 'none';
    const d = this.design;
    const off = new THREE.Vector3(-d.W / 2 * MM, 0, 0);
    // te tonen kader (mm)
    let box = cam.box;
    if (!box) {
      const bb = new THREE.Box3().setFromObject(this.root);
      box = [bb.min.x / MM + d.W / 2, bb.max.x / MM + d.W / 2, bb.min.y / MM, bb.max.y / MM, bb.min.z / MM, bb.max.z / MM];
    }
    const c = new THREE.Vector3((box[0] + box[1]) / 2 * MM, (box[2] + box[3]) / 2 * MM, (box[4] + box[5]) / 2 * MM).add(off);
    const radius = Math.hypot(box[1] - box[0], box[3] - box[2], box[5] - box[4]) / 2 * MM * (cam.pad ?? 0.86);
    let camera;
    if (dim === '3d') {
      const fov = cam.fov ?? 26;
      camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 100);
      const fit = radius / Math.sin(THREE.MathUtils.degToRad(fov / 2)) / Math.min(1, w / h);
      const dir = new THREE.Vector3(...(cam.dir || [0.62, 0.36, 1])).normalize();
      camera.position.copy(c).addScaledVector(dir, fit);
      camera.lookAt(c);
    } else {
      const asp = w / h;
      const halfW = (box[1] - box[0]) / 2 * MM * (cam.pad ?? 1.1), halfH = (box[3] - box[2]) / 2 * MM * (cam.pad ?? 1.1);
      const hh = Math.max(halfH, halfW / asp);
      camera = new THREE.OrthographicCamera(-hh * asp, hh * asp, hh, -hh, 0.01, 100);
      camera.position.set(c.x, c.y, 20); camera.lookAt(c.x, c.y, 0);
    }
    camera.updateMatrixWorld();
    this.renderer.render(this.scene, camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    const pts = project.map(([x, y, z]) => {
      const v = new THREE.Vector3(x * MM, y * MM, z * MM).add(off).project(camera);
      return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h];
    });
    this.view = keep; this.openAmt = keepOpen; this.override = null;
    this.floor.visible = keepFloor[0]; this.wall.visible = keepFloor[1];
    this.labelR.domElement.style.display = '';
    this.renderer.setPixelRatio(keepPR);
    this.renderer.setSize(keepSize.x, keepSize.y);
    this.update(this.design, this.geo, keepSel);
    return { url, pts, w, h };
  }
}

// Box met UV's in mm zodat nerf en multiplexlagen kloppen.
function panelGeometry(size, thinI, grainI, seed) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const ou = (seed * 0.37) % 1, ov = (seed * 0.61) % 1;
  const otherI = [0, 1, 2].find(i => i !== thinI && i !== grainI);
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const fa = n[0] > 0.5 ? 0 : n[1] > 0.5 ? 1 : 2;
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    if (fa === thinI) {
      uv.setXY(i, p[otherI] / 900 + ou, p[grainI] / 900 + ov);
    } else {
      const e = [0, 1, 2].find(a => a !== fa && a !== thinI);
      uv.setXY(i, p[e] / 600 + ou, (p[thinI] + size[thinI] / 2) / size[thinI]);
    }
  }
  return g;
}

function handleMesh(h, mat, shadows) {
  const g = new THREE.Group();
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadows; g.add(m); return m; };
  const along = h.orient === 'v';
  if (h.type === 'staaf') {
    const L = 176, cc = 160;
    add(along ? new THREE.BoxGeometry(10, L, 10) : new THREE.BoxGeometry(L, 10, 10), 0, 0, 30);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(10, 10, 26), along ? 0 : s * cc / 2, along ? s * cc / 2 : 0, 14);
  } else if (h.type === 'plat') {
    const L = 140, cc = 128;
    add(along ? new THREE.BoxGeometry(20, L, 3) : new THREE.BoxGeometry(L, 20, 3), 0, 0, 26);
    for (const s of [-1, 1]) {
      const c = add(new THREE.CylinderGeometry(4.5, 4.5, 25, 16), along ? 0 : s * cc / 2, along ? s * cc / 2 : 0, 12.5);
      c.rotation.x = Math.PI / 2;
    }
  } else if (h.type === 'knop') {
    const c1 = add(new THREE.CylinderGeometry(7, 9, 6, 32), 0, 0, 3); c1.rotation.x = Math.PI / 2;
    const c2 = add(new THREE.CylinderGeometry(12, 12, 20, 40), 0, 0, 16); c2.rotation.x = Math.PI / 2;
  } else if (h.type === 'kant' || h.type === 'lijst') {
    const L = h.len || 100, drop = h.type === 'lijst' ? 22 : 18;
    const s = h.edge === 'bottom' ? -1 : 1;
    // plaatje op de kant van het front, steekt naar voren uit en buigt omlaag
    add(new THREE.BoxGeometry(L, 3, 46), 0, s * 1.5, 5);
    add(new THREE.BoxGeometry(L, drop, 3), 0, s * (3 - drop / 2), 27.5);
  }
  return g;
}

function prismGeometry(pr) {
  const shape = new THREE.Shape(pr.poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: pr.z1 - pr.z0, bevelEnabled: false });
  g.translate(0, 0, pr.z0);
  return g;
}

function cellGeometry(c) {
  if (c.poly) return new THREE.ShapeGeometry(new THREE.Shape(c.poly.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.PlaneGeometry(c.x1 - c.x0, c.y1 - c.y0);
  g.translate((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, 0);
  return g;
}

export { handleMesh, panelGeometry, prismGeometry };
