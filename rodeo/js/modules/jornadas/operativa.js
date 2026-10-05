// Pantalla operativa de Jornada (BIT-61) — reemplaza el listado/CRUD
// genérico como experiencia PRINCIPAL de #jornadas. Flujo: LLEGADA →
// Jornada activa → SALIDA, usando exclusivamente las columnas que ya
// existen en `jornadas` (profesional_id, fecha, hora_llegada, hora_salida,
// notas) -- sin tocar schema. El listado histórico (con Ver/Editar de
// BIT-57 y "Enviar a la Papelera") sigue existiendo tal cual en
// #jornadas/historial, no se tocó ni se eliminó.
//
// Establecimiento: la tabla `jornadas` NO tiene columna establecimiento_id
// (es una entidad puramente personal, confirmado en services/jornadas.js
// desde BIT-04). Esta pantalla MUESTRA el establecimiento activo global
// como contexto informativo, pero no lo persiste en la fila -- ver
// hallazgo reportado en el informe de BIT-61. No inventar una relación
// que el modelo real no tiene.

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

  const establecimiento = ctx.establecimientos.find((est) => est.id === ctx.establecimientoActivoId);
  const nombreEstablecimiento = establecimiento?.nombre ?? '—';

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
    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>Registro de Jornada</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(nowParts().fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 ${escapeHtml(nombreEstablecimiento)}</p>
        <p class="rodeo-jornada-reloj" id="jornada-reloj"></p>
        <div id="jornada-error" class="rodeo-error"></div>
        <button type="button" class="salida-btn rodeo-jornada-btn rodeo-jornada-btn-llegada" id="btn-llegada">LLEGADA</button>
        <p class="rodeo-hint" style="text-align:center;margin:10px 0 16px">Presioná para iniciar la jornada</p>
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
        await crearJornada({ fecha, hora_llegada: hora, hora_salida: null, notas: null }, ctx.perfil.id);
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
    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>Jornada en curso</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(jornadaActiva.fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 ${escapeHtml(nombreEstablecimiento)}</p>
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
        renderResumen(hora);
      } catch (err) {
        errorEl.textContent = 'Error al registrar la salida: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'SALIDA';
      }
    });
  }

  function renderResumen(horaSalida) {
    limpiarIntervalos();
    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>✓ Jornada cerrada</h2>
        <p class="rodeo-jornada-fecha">${fmtFecha(jornadaActiva.fecha)}</p>
        <p class="rodeo-jornada-dato">Llegada: <strong>${fmtHora(jornadaActiva.hora_llegada)}</strong></p>
        <p class="rodeo-jornada-dato">Salida: <strong>${fmtHora(horaSalida)}</strong></p>
        <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
      </div>`;
  }

  if (jornadaActiva) renderActiva();
  else renderSinActiva();
}
