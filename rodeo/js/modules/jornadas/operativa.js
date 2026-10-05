// Pantalla operativa de Jornada (BIT-61) — reemplaza el listado/CRUD
// genérico como experiencia PRINCIPAL de #jornadas. Flujo: LLEGADA →
// Jornada activa → SALIDA. El listado histórico (con Ver/Editar de BIT-57
// y "Enviar a la Papelera") sigue existiendo tal cual en
// #jornadas/historial, no se tocó ni se eliminó.
//
// Establecimiento (corrección de regla de dominio, segunda ronda de
// BIT-61): una Jornada pertenece a UN único establecimiento -- el que
// estaba activo al presionar LLEGADA. Se persiste en
// `jornadas.establecimiento_id` (migration-BIT-61-establecimiento-jornada.sql,
// preparada, NO aplicada todavía) y es INMUTABLE después de creada: si la
// usuaria cambia el selector global de establecimiento mientras tiene una
// Jornada activa, esta pantalla sigue mostrando y operando sobre el
// establecimiento con el que la Jornada se abrió, nunca el nuevo. Lo que
// NO resuelve esta pantalla (deliberadamente, para no ampliar alcance):
// impedir que OTROS módulos (Visitas, Atenciones, etc.) registren algo
// bajo el establecimiento recién cambiado mientras la Jornada de otro
// establecimiento sigue abierta -- ver limitación documentada en el
// informe de BIT-61.

import { getJornadaActivaPropia, crearJornada, actualizarJornada } from '../../services/jornadas.js';
import { escapeHtml } from '../../dashboard.js';

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toISOString().slice(0, 10),
    hora: d.toTimeString().slice(0, 8),
  };
}

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Duración desde hora_llegada (HH:MM:SS) hasta ahora, mismo día. Simple a
// propósito -- no corrige cruce de medianoche (una Jornada de terreno no
// dura más de 24h; si ocurriera, el peor caso es un número negativo que
// se recorta a 0, nunca un error).
function calcularDuracion(horaLlegada) {
  const [h, m, s] = horaLlegada.split(':').map(Number);
  const inicio = new Date();
  inicio.setHours(h, m, s || 0, 0);
  const diffMs = Math.max(0, Date.now() - inicio.getTime());
  const totalMin = Math.floor(diffMs / 60000);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h ${String(mm).padStart(2, '0')} min`;
}

export async function mountJornadaOperativa(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let jornadaActiva;
  try {
    jornadaActiva = await getJornadaActivaPropia(ctx.perfil.id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar la jornada: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const establecimientoActivoGlobal = ctx.establecimientos.find((est) => est.id === ctx.establecimientoActivoId);
  const nombreEstablecimientoActivo = establecimientoActivoGlobal?.nombre ?? '—';

  let intervaloReloj = null;
  let intervaloDuracion = null;

  function limpiarIntervalos() {
    if (intervaloReloj) clearInterval(intervaloReloj);
    if (intervaloDuracion) clearInterval(intervaloDuracion);
    intervaloReloj = null;
    intervaloDuracion = null;
  }

  // El router no tiene hook de "desmontar": estos timers se autolimpian
  // cuando su propio nodo deja de estar en el documento (el usuario
  // navegó a otra vista), en vez de depender de un evento que no existe.
  function actualizarReloj() {
    const el = document.getElementById('jornada-reloj');
    if (!el || !el.isConnected) { limpiarIntervalos(); return; }
    el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function actualizarDuracion() {
    const el = document.getElementById('jornada-duracion');
    if (!el || !el.isConnected) { limpiarIntervalos(); return; }
    el.textContent = `Tiempo activo: ${calcularDuracion(jornadaActiva.hora_llegada)}`;
  }

  function renderSinActiva() {
    limpiarIntervalos();

    // Sin establecimiento activo no hay dónde registrar LLEGADA -- mismo
    // criterio que ya usa modules/catastro/form.js para este mismo caso.
    if (!ctx.establecimientoActivoId || !establecimientoActivoGlobal) {
      contenedor.innerHTML = `
        <div class="rodeo-card">
          <p class="rodeo-error">No hay un establecimiento activo. Elegí un establecimiento arriba antes de iniciar la jornada.</p>
        </div>`;
      return;
    }

    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>Registro de Jornada</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(nowParts().fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 ${escapeHtml(nombreEstablecimientoActivo)}</p>
        <p class="rodeo-jornada-reloj" id="jornada-reloj"></p>
        <div id="jornada-error" class="rodeo-error"></div>
        <button type="button" class="salida-btn rodeo-jornada-btn rodeo-jornada-btn-llegada" id="btn-llegada">LLEGADA</button>
        <p class="rodeo-hint" style="text-align:center;margin:10px 0 16px">Presioná para iniciar la jornada en ${escapeHtml(nombreEstablecimientoActivo)}</p>
        <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
      </div>`;

    actualizarReloj();
    intervaloReloj = setInterval(actualizarReloj, 1000);

    document.getElementById('btn-llegada').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Registrando…';
      const errorEl = document.getElementById('jornada-error');
      errorEl.textContent = '';
      const { fecha, hora } = nowParts();
      try {
        await crearJornada(
          { fecha, hora_llegada: hora, hora_salida: null, notas: null, establecimiento_id: ctx.establecimientoActivoId },
          ctx.perfil.id
        );
        jornadaActiva = await getJornadaActivaPropia(ctx.perfil.id);
        if (!jornadaActiva) throw new Error('La jornada se creó pero no se pudo recuperar. Recargá la página.');
        renderActiva();
      } catch (err) {
        errorEl.textContent = 'Error al registrar la llegada: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'LLEGADA';
      }
    });
  }

  function renderActiva() {
    limpiarIntervalos();

    const nombreEstablecimientoJornada = jornadaActiva.establecimientos?.nombre ?? '—';
    // La Jornada ya quedó asociada a un establecimiento al crearse -- esta
    // pantalla SIEMPRE opera sobre ESE, nunca sobre el que esté
    // seleccionado ahora en el header, aunque hayan cambiado mientras
    // tanto. Si difieren, se avisa -- no se mezcla ni se corrige solo.
    const cambioDeEstablecimiento =
      jornadaActiva.establecimiento_id && ctx.establecimientoActivoId &&
      jornadaActiva.establecimiento_id !== ctx.establecimientoActivoId;

    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>Jornada en curso</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(jornadaActiva.fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 Jornada activa en <strong>${escapeHtml(nombreEstablecimientoJornada)}</strong></p>
        ${cambioDeEstablecimiento ? `
        <div class="rodeo-jornada-aviso">
          ⚠️ El establecimiento seleccionado arriba ahora es <strong>${escapeHtml(nombreEstablecimientoActivo)}</strong>.
          Esta Jornada sigue perteneciendo a ${escapeHtml(nombreEstablecimientoJornada)} -- no se mezcla.
          Si vas a trabajar en ${escapeHtml(nombreEstablecimientoActivo)}, cerrá esta Jornada primero e iniciá una nueva ahí.
        </div>` : ''}
        <p class="rodeo-jornada-dato">Llegada: <strong>${fmtHora(jornadaActiva.hora_llegada)}</strong></p>
        <p class="rodeo-jornada-duracion" id="jornada-duracion"></p>
        <div id="jornada-error" class="rodeo-error"></div>
        <button type="button" class="salida-btn rodeo-jornada-btn rodeo-jornada-btn-salida" id="btn-salida">SALIDA</button>
        <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
      </div>`;

    actualizarDuracion();
    intervaloDuracion = setInterval(actualizarDuracion, 30000);

    document.getElementById('btn-salida').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Registrando…';
      const errorEl = document.getElementById('jornada-error');
      errorEl.textContent = '';
      const { hora } = nowParts();
      try {
        await actualizarJornada(jornadaActiva.id, {
          fecha: jornadaActiva.fecha,
          hora_llegada: jornadaActiva.hora_llegada,
          hora_salida: hora,
          notas: jornadaActiva.notas,
        });
        renderResumen(hora, nombreEstablecimientoJornada);
      } catch (err) {
        errorEl.textContent = 'Error al registrar la salida: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'SALIDA';
      }
    });
  }

  function renderResumen(horaSalida, nombreEstablecimientoJornada) {
    limpiarIntervalos();
    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>✓ Jornada cerrada</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(jornadaActiva.fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 ${escapeHtml(nombreEstablecimientoJornada)}</p>
        <p class="rodeo-jornada-dato">Llegada: <strong>${fmtHora(jornadaActiva.hora_llegada)}</strong></p>
        <p class="rodeo-jornada-dato">Salida: <strong>${fmtHora(horaSalida)}</strong></p>
        <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
      </div>`;
  }

  if (jornadaActiva) renderActiva();
  else renderSinActiva();
}
