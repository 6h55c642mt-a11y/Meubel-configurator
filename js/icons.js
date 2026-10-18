// Kleine SVG-pictogrammen voor fronten, interieur en grepen (architecten-notatie voor draairichting).
const S = (inner) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${inner}</svg>`;
const R = '<rect x="8" y="6" width="32" height="36" rx="1"/>';

export const FRONT_ICONS = {
  none: S('<rect x="8" y="6" width="32" height="36" rx="1" stroke-dasharray="3 3"/>'),
  'door-l': S(R + '<path d="M40 6 L8 24 L40 42" stroke-dasharray="2.5 2.5" stroke-width="1.1"/><circle cx="35" cy="24" r="1.6" fill="currentColor"/>'),
  'door-r': S(R + '<path d="M8 6 L40 24 L8 42" stroke-dasharray="2.5 2.5" stroke-width="1.1"/><circle cx="13" cy="24" r="1.6" fill="currentColor"/>'),
  'door-dbl': S(R + '<path d="M24 6v36"/><path d="M24 6 L8 24 L24 42 M24 6 L40 24 L24 42" stroke-dasharray="2.5 2.5" stroke-width="1.1"/>'),
  'flap-up': S(R + '<path d="M8 42 L24 6 L40 42" stroke-dasharray="2.5 2.5" stroke-width="1.1"/>'),
  'flap-down': S(R + '<path d="M8 6 L24 42 L40 6" stroke-dasharray="2.5 2.5" stroke-width="1.1"/>'),
  drawer: S('<rect x="8" y="14" width="32" height="20" rx="1"/><path d="M18 19h12" stroke-width="2.4" stroke-linecap="round"/>'),
};

export const INTERIOR_ICONS = {
  open: S(R + '<path d="M8 24h32"/>'),
  rail: S(R + '<path d="M11 13h26" stroke-width="2.6" stroke-linecap="round"/><path d="M20 13v4l-6 8h20l-6-8" stroke-width="1.1"/>'),
  inner: S(R + '<rect x="12" y="12" width="24" height="10" rx="1"/><rect x="12" y="26" width="24" height="10" rx="1"/>'),
};

export const HANDLE_ICONS = {
  push: S('<rect x="10" y="8" width="28" height="32" rx="1"/><path d="M24 30v-9m0 0l-4 4m4-4l4 4" stroke-linecap="round"/><circle cx="24" cy="15" r="2" fill="currentColor"/>'),
  staaf: S('<path d="M20 8v32" stroke-width="4" stroke-linecap="round"/><path d="M20 10h8M20 38h8" stroke-width="3"/>'),
  lijst: S('<path d="M6 18h36v4H6z" fill="currentColor" stroke="none"/><path d="M6 22h36v10" stroke-width="1.2"/>'),
  kant: S('<path d="M16 18h16v4H16z" fill="currentColor" stroke="none"/><path d="M10 22h28v14H10z" stroke-width="1.2"/>'),
  plat: S('<rect x="18" y="8" width="8" height="32" rx="1" fill="currentColor" stroke="none"/><path d="M26 12h6M26 36h6" stroke-width="2.5"/>'),
  knop: S('<circle cx="24" cy="24" r="10" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="14" stroke-width="1.2"/>'),
};
