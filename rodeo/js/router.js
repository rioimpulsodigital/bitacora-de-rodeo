// Router mínimo por hash — sin dependencias, funciona con recarga y con
// el botón "atrás" del navegador. Cada vista se registra una vez con
// registerRoute(base, handler) y el handler recibe el resto del hash ya
// partido (ej. "#jornadas/editar/123" -> handler(['editar', '123'])).
// Esta es la referencia de navegación para todos los módulos futuros.

const rutas = new Map();

export function registerRoute(base, handler) {
  rutas.set(base, handler);
}

function partesHash() {
  return (location.hash.slice(1) || '').split('/').filter(Boolean);
}

export function resolverRuta() {
  const [base, ...resto] = partesHash();

  document.querySelectorAll('.rodeo-sidebar-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === base);
  });

  const handler = rutas.get(base) || rutas.get('dashboard');
  if (handler) handler(resto);
}

export function iniciarRouter(vistaPorDefecto) {
  if (!location.hash) location.hash = '#' + vistaPorDefecto;
  window.addEventListener('hashchange', resolverRuta);
  resolverRuta();
}
