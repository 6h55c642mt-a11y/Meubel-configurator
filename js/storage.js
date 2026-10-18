// Opslag in de browser (localStorage) en deellinks (ontwerp in de URL-hash).
import { uid } from './model.js';

const KEY = 'meubelconfig.designs.v1';
const CUR = 'meubelconfig.current.v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* opslag vol of geblokkeerd */ }
}

export function autosave(d) {
  if (!d.id) d.id = uid();
  const all = readAll();
  all[d.id] = { id: d.id, name: d.name, updated: Date.now(), design: d };
  writeAll(all);
  try { localStorage.setItem(CUR, d.id); } catch { /* */ }
}

export function list() {
  return Object.values(readAll()).sort((a, b) => b.updated - a.updated).map(({ id, name, updated }) => ({ id, name, updated }));
}

export function get(id) { return readAll()[id]?.design || null; }

export function remove(id) { const all = readAll(); delete all[id]; writeAll(all); }

export function encode(d) {
  const json = JSON.stringify(d);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function loadInitial() {
  const m = location.hash.match(/#d=([\w-]+)/);
  if (m) {
    try {
      const d = decode(m[1]);
      d.id = uid(); // gedeelde kopie wordt een eigen ontwerp
      history.replaceState(null, '', location.pathname);
      return d;
    } catch { /* ongeldige link */ }
  }
  try {
    const id = localStorage.getItem(CUR);
    if (id) return get(id);
  } catch { /* */ }
  return null;
}
