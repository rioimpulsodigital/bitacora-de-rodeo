// Punto de entrada del nuevo frontend de Bitácora de Rodeo (BIT-05/06).
// Aislado del portal legacy en la raíz — solo reutiliza el cliente de
// Supabase y el wrapper de Auth de js/core/ (BIT-03), no los duplica.

import { requireSession, signOut } from '../../js/core/auth.js';
import { getPerfilActual } from './services/perfiles.js';
import {
  getEstablecimientosAccesibles,
  getEstablecimientoActivoId,
  setEstablecimientoActivoId,
} from './services/establecimientos.js';
import { renderHeaderUsuario, renderHeaderEstablecimiento, renderSinPerfil, mountDashboard } from './dashboard.js';
import { registerRoute, iniciarRouter, resolverRuta } from './router.js';
import { registrarRutasJornadas } from './modules/jornadas/index.js';
import { registrarRutasAnimales } from './modules/animales/index.js';
import { registrarRutasVisitas } from './modules/visitas/index.js';
import { registrarRutasObservaciones } from './modules/observaciones/index.js';
import { registrarRutasNovedades } from './modules/novedades/index.js';

async function handleSignOut() {
  await signOut();
  location.replace('../login.html');
}

async function iniciar() {
  const session = await requireSession('../login.html');
  if (!session) return;

  const perfil = await getPerfilActual();
  if (!perfil) {
    renderSinPerfil();
    return;
  }

  renderHeaderUsuario(perfil, handleSignOut);

  const establecimientos = await getEstablecimientosAccesibles();
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
    get establecimientoActivoId() {
      return activoId;
    },
  };

  renderHeaderEstablecimiento(establecimientos, activoId, (id) => {
    activoId = id;
    setEstablecimientoActivoId(id);
    resolverRuta();
  });

  const contenedor = document.getElementById('rodeo-content');
  registerRoute('dashboard', () => mountDashboard(contenedor, ctx));
  registrarRutasJornadas(contenedor, ctx);
  registrarRutasAnimales(contenedor, ctx);
  registrarRutasVisitas(contenedor, ctx);
  registrarRutasObservaciones(contenedor, ctx);
  registrarRutasNovedades(contenedor, ctx);

  iniciarRouter('dashboard');
}

iniciar();
