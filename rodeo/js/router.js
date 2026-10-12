// Router mínimo por hash — sin dependencias, funciona con recarga y con
// el botón "atrás" del navegador. Cada vista se registra una vez con
// registerRoute(base, handler) y el handler recibe el resto del hash ya
// partido (ej. "#jornadas/editar/123" -> handler(['editar', '123'])).
// Esta es la referencia de navegación para todos los módulos futuros.

const rutas = new Map();

// BIT-12 (corrección de arquitectura global): una ruta "global" pertenece
// a la profesional/sistema, no a un establecimiento -- mientras esté
// activa, el shell oculta el selector de establecimiento del header en
// vez de dar a entender que lo que se ve ahí "pertenece" a uno. Hoy solo
// Informes la usa; cualquier módulo futuro de ese mismo tipo pasa
// `{ global: true }` sin que el router necesite conocerlo por nombre.
const rutasGlobales = new Set();

export function registerRoute(base, handler, opciones = {}) {
  rutas.set(base, handler);
  if (opciones.global) rutasGlobales.add(base);
}

function partesHash() {
  return (location.hash.slice(1) || '').split('/').filter(Boolean);
}

export function resolverRuta() {
  const [base, ...resto] = partesHash();

  // [data-view] en vez de .rodeo-sidebar-item -- BIT-12 movió el enlace de
  // Informes al header (contexto global), pero el resaltado de "activo"
  // debe seguir funcionando igual ahí que en el sidebar.
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === base);
  });

  const estEl = document.getElementById('rodeo-establecimiento');
  if (estEl) estEl.style.display = rutasGlobales.has(base) ? 'none' : '';

  const handler = rutas.get(base) || rutas.get('dashboard');
  if (handler) handler(resto);
}

export function iniciarRouter(vistaPorDefecto) {
  if (!location.hash) location.hash = '#' + vistaPorDefecto;
  window.addEventListener('hashchange', resolverRuta);
  resolverRuta();
}
