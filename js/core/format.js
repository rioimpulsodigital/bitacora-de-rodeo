// Utilidades de formato — funciones puras, sin DOM ni estado.
// Cualquier módulo puede importar de acá sin acoplarse a nada más.

export const pad = n => String(n).padStart(2, '0');
export const now = () => new Date();
export const fTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fDate = d => d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fISO = d => d.toISOString().split('T')[0];
export const fH = h => { const hrs = Math.floor(h), m = Math.round((h - hrs) * 60); return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`; };
export const fElap = ms => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`; };
export const calcH = (a, b) => Math.round(((b - a) / 3600000) * 100) / 100;
export const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
