// Punto de entrada del nuevo frontend de Bitácora de Rodeo (BIT-05/06).
// Aislado del portal legacy en la raíz — solo reutiliza el cliente de
// Supabase y el wrapper de Auth de js/core/ (BIT-03), no los duplica.

import { requireSession, signOut } from '../../js/core/auth.js';
import { getPerfilActual } from './services/perfiles.js';
import {
  getEstablecimientosAccesibles,
  getEstablecimientoActivoId,
  setEstablecimientoActivoId,
  tieneCatastroEquino,
  getCapacidadesJornada,
  tieneJornadaHabilitada,
} from './services/establecimientos.js';
import { renderHeaderUsuario, renderHeaderEstablecimiento, renderSinPerfil, mountDashboard } from './dashboard.js';
import { registerRoute, iniciarRouter, resolverRuta } from './router.js';
import { registrarRutasJornadas } from './modules/jornadas/index.js';
import { registrarRutasAnimales } from './modules/animales/index.js';
import { registrarRutasCatastro } from './modules/catastro/index.js';
import { registrarRutasVisitas } from './modules/visitas/index.js';
import { registrarRutasObservaciones } from './modules/observaciones/index.js';
import { registrarRutasNovedades } from './modules/novedades/index.js';
import { registrarRutasAtenciones } from './modules/atenciones/index.js';
import { registrarRutasPapelera } from './modules/papelera/index.js';

async function handleSignOut() {
  await signOut();
  location.replace('../login.html');
}

async function iniciar() {
  const session = await requireSession('../login.html');
  if (!session) return;

  const [perfil, establecimientos] = await Promise.all([
    getPerfilActual(),
    getEstablecimientosAccesibles(),
  ]);

  if (!perfil) {
    renderSinPerfil();
    return;
  }

  // BIT-61: capacidad Jornada por Usuario × Establecimiento. Depende de
  // perfil.id, así que se pide después del Promise.all de arriba. Es
  // transitorio (ver migration-BIT-61-capacidad-jornada.sql) -- BIT-56
  // reemplazará esto por el modelo genérico de capacidades.
  const capacidadesJornada = await getCapacidadesJornada(perfil.id);

  renderHeaderUsuario(perfil, handleSignOut);
  let activoId = getEstablecimientoActivoId();
  if (!activoId || !establecimientos.some((e) => e.id === activoId)) {
    activoId = establecimientos[0]?.id ?? null;
    if (activoId) setEstablecimientoActivoId(activoId);
  }

  // ctx.establecimientoActivoId siempre lee el valor vigente — las vistas
  // que lo necesiten (hoy solo Dashboard) lo ven actualizado sin recargar.
  const ctx = {
    perfil,
    establecimientos,
    capacidadesJornada,
    get establecimientoActivoId() {
      return activoId;
    },
  };

  // Catastro Equino (BIT-50): la entrada del menú sigue al establecimiento
  // ACTIVO, no al usuario. La protección real de la ruta está en el módulo.
  function actualizarNavCatastro() {
    const activo = establecimientos.find((e) => e.id === activoId);
    document.getElementById('rodeo-nav-catastro').style.display = tieneCatastroEquino(activo) ? '' : 'none';
  }
  actualizarNavCatastro();

  // Jornada (BIT-61): a diferencia de Catastro, depende también de QUIÉN
  // mira -- mismo establecimiento activo, pero el mapa ya viene scopeado al
  // usuario actual (getCapacidadesJornada). La protección real de la ruta
  // está en el módulo (operativa.js), igual que Catastro.
  function actualizarNavJornadas() {
    document.getElementById('rodeo-nav-jornadas').style.display =
      tieneJornadaHabilitada(activoId, capacidadesJornada, perfil) ? '' : 'none';
  }
  actualizarNavJornadas();

  renderHeaderEstablecimiento(establecimientos, activoId, (id) => {
    activoId = id;
    setEstablecimientoActivoId(id);
    actualizarNavCatastro();
    actualizarNavJornadas();
    resolverRuta();
  });

  const contenedor = document.getElementById('rodeo-content');
  registerRoute('dashboard', () => mountDashboard(contenedor, ctx));
  registrarRutasJornadas(contenedor, ctx);
  registrarRutasAnimales(contenedor, ctx);
  registrarRutasCatastro(contenedor, ctx);
  registrarRutasVisitas(contenedor, ctx);
  registrarRutasObservaciones(contenedor, ctx);
  registrarRutasNovedades(contenedor, ctx);
  registrarRutasAtenciones(contenedor, ctx);
  registrarRutasPapelera(contenedor, ctx);

  // Papelera: solo ADMINISTRADOR ve la entrada (la restricción real es server-side).
  if (perfil.rol === 'ADMINISTRADOR') {
    document.getElementById('rodeo-nav-papelera').style.display = '';
  }

  iniciarRouter('dashboard');
}

// BIT-54: "← Volver a módulos" -- vuelve al selector general (portada del
// portal en la raíz, ../index.html). La sesión no se toca: es la misma
// sesión de Supabase en el mismo origen, así que no pide login de nuevo.
// El portal, al arrancar, reabre el ÚLTIMO módulo guardado en localStorage
// (js/core/app.js, boot()); para que aterrice en la portada y no en ese
// módulo se borra esa clave antes de navegar -- mismo efecto que
// App.backToPortada(). Misma clave que STORAGE_KEY de js/core/app.js
// (no se importa de ahí para no acoplar rodeo/ al núcleo del legacy).
const CLAVE_MODULO_ACTIVO_PORTAL = 'bitacora_modulo';
document.getElementById('rodeo-volver-modulos').addEventListener('click', () => {
  try { localStorage.removeItem(CLAVE_MODULO_ACTIVO_PORTAL); } catch { /* storage bloqueado: igual navega */ }
});

// BIT-58: menú móvil ☰. Reutiliza el mismo <nav id="rodeo-sidebar"> del
// sidebar de escritorio (misma fuente de verdad de navegación, mismo
// toggle de visibilidad por rol/capacidad que ya aplica más arriba
// -- Catastro/Papelera -- sin ninguna lista paralela). A ≤768px ese
// <nav> pasa a ser un panel desplegable oculto por defecto (ver
// app.css); acá solo se togglea la clase que lo muestra/oculta.
const menuToggle = document.getElementById('rodeo-menu-toggle');
const sidebarNav = document.getElementById('rodeo-sidebar');
const volverLink = document.getElementById('rodeo-volver-modulos');
const brandEl = document.querySelector('.rodeo-header-brand');

function cerrarMenuMovil() {
  sidebarNav.classList.remove('rodeo-sidebar-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir navegación');
}

function abrirMenuMovil() {
  sidebarNav.classList.add('rodeo-sidebar-open');
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Cerrar navegación');
}

menuToggle.addEventListener('click', () => {
  if (sidebarNav.classList.contains('rodeo-sidebar-open')) cerrarMenuMovil();
  else abrirMenuMovil();
});

// Cerrar al elegir un módulo (o "Volver a módulos", ver más abajo) --
// delegado sobre el contenedor, sin enganchar cada link uno por uno ni
// duplicar nada si mañana se agrega/saca un módulo del <nav>.
sidebarNav.addEventListener('click', (e) => {
  if (e.target.closest('.rodeo-sidebar-item, .rodeo-sidebar-item-volver')) cerrarMenuMovil();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarMenuMovil();
});

// Cerrar al tocar fuera del panel y del botón que lo abre.
document.addEventListener('click', (e) => {
  if (!sidebarNav.classList.contains('rodeo-sidebar-open')) return;
  if (sidebarNav.contains(e.target) || menuToggle.contains(e.target)) return;
  cerrarMenuMovil();
});

// "Volver a módulos" (BIT-54) vive en el header en escritorio; en móvil
// el header queda saturado si además suma el ☰, así que ese MISMO <a>
// (nunca un duplicado) se reubica dentro del panel de navegación. Se
// mueve el nodo real -- conserva el listener ya enganchado arriba.
const mqMobile = window.matchMedia('(max-width: 768px)');
function ubicarVolver(esMobile) {
  cerrarMenuMovil();
  if (esMobile) {
    volverLink.classList.add('rodeo-sidebar-item-volver');
    sidebarNav.appendChild(volverLink);
  } else {
    volverLink.classList.remove('rodeo-sidebar-item-volver');
    brandEl.appendChild(volverLink);
  }
}
ubicarVolver(mqMobile.matches);
mqMobile.addEventListener('change', (e) => ubicarVolver(e.matches));

iniciar();
