// Pantalla operativa de Jornada (BIT-61) — reemplaza el listado/CRUD
// genérico como experiencia PRINCIPAL de #jornadas. Flujo: LLEGADA →
// Jornada activa → SALIDA. El listado histórico (con Ver/Editar de BIT-57
// y "Enviar a la Papelera") sigue existiendo tal cual en
// #jornadas/historial, no se tocó ni se eliminó.
//
// Establecimiento (corrección de regla de dominio, segunda ronda de
// BIT-61): una Jornada pertenece a UN único establecimiento -- el que
// estaba activo al presionar LLEGADA. Se persiste en
// `jornadas.establecimiento_id` (migration-BIT-61-final.sql,
// preparada, NO aplicada todavía) y es INMUTABLE después de creada: si la
// usuaria cambia el selector global de establecimiento mientras tiene una
// Jornada activa, esta pantalla sigue mostrando y operando sobre el
// establecimiento con el que la Jornada se abrió, nunca el nuevo. Lo que
// NO resuelve esta pantalla (deliberadamente, para no ampliar alcance):
// impedir que OTROS módulos (Visitas, Atenciones, etc.) registren algo
// bajo el establecimiento recién cambiado mientras la Jornada de otro
// establecimiento sigue abierta -- ver limitación documentada en el
// informe de BIT-61.
//
// Capacidad (tercera ronda de BIT-61): Jornada no es global -- se habilita
// por Usuario × Establecimiento en `establecimientos_usuarios.jornada_
// habilitada` (migration-BIT-61-final.sql, preparada, NO
// aplicada). Gatea únicamente ABRIR una Jornada nueva; una ya activa
// siempre se puede seguir viendo/cerrando aunque la capacidad se revoque
// después de abierta (ver renderSinActiva/renderActiva).

import { getJornadaActivaPropia, crearJornada, actualizarJornada } from '../../services/jornadas.js';
import { tieneJornadaHabilitada } from '../../services/establecimientos.js';
import { escapeHtml } from '../../dashboard.js';

// Zona operativa única (corrección de bug real, BIT-61): antes, la fecha
// salía de `toISOString()` (UTC) y la hora de `toTimeString()` (zona del
// dispositivo) -- dos fuentes distintas. Pasadas las 21:00 ART, UTC ya
// cruzó medianoche y la pantalla mostraba el día siguiente mientras la
// hora seguía siendo la de hoy. Esa misma `fecha` se persistía al pulsar
// LLEGADA -- no era solo un error visual. Todo (fecha/hora visibles,
// fecha/hora persistidas, cálculo de duración) usa ahora esta única
// fuente, expresada explícitamente en America/Argentina/Buenos_Aires en
// vez de depender de que el dispositivo esté configurado en esa zona.
const ZONA_OPERATIVA = 'America/Argentina/Buenos_Aires';
// Argentina no tiene horario de verano desde 2009 -- UTC-03:00 fijo todo
// el año. Reconstruir un instante real a partir de fecha+hora guardadas
// (hora de pared de Buenos Aires) con ese offset explícito es exacto, sin
// depender tampoco de la zona del dispositivo para ESTA cuenta.
const OFFSET_ARGENTINA = '-03:00';

function nowParts() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_OPERATIVA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', // explícito -- evita el "24:00" de medianoche que da hour12:false en algunos motores
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    hora: `${valor('hour')}:${valor('minute')}:${valor('second')}`,
  };
}

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Duración desde hora_llegada (HH:MM:SS, día `fecha`) hasta ahora. Se
// reconstruye el instante real de LLEGADA con el offset fijo de Argentina
// (no con setHours() en la zona del dispositivo, que es lo que mezclaba
// zonas antes) para que la resta contra Date.now() sea correcta sin
// importar la zona del dispositivo. Simple a propósito -- no corrige
// Jornadas de más de 24h (no ocurren en terreno); si pasara, el peor caso
// es un número negativo que se recorta a 0, nunca un error.
function calcularDuracion(fecha, horaLlegada) {
  const inicio = new Date(`${fecha}T${horaLlegada}${OFFSET_ARGENTINA}`);
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
  //
  // Corrección (bug real reportado por Claudy, BIT-61): esta función solo
  // refrescaba la hora -- la fecha visible de "Registro de Jornada" se
  // escribía UNA SOLA VEZ al renderizar (nowParts().fecha, fuera de
  // cualquier intervalo) y quedaba congelada si la pantalla seguía
  // abierta al cruzar medianoche: el reloj seguía avanzando bien, pero la
  // fecha mostraba el día anterior. Se unifica en el mismo tick de 1s que
  // ya existía (sin agregar un segundo timer) y con la misma fuente única
  // ya aprobada (nowParts() / ZONA_OPERATIVA) -- nunca una segunda lógica
  // de fecha/hora. No toca `renderActiva()`/`renderResumen()`: ahí la
  // fecha mostrada es la de la Jornada ya creada (dato histórico), no la
  // de "hoy", y no debe cambiar sola.
  function actualizarRelojYFecha() {
    const elReloj = document.getElementById('jornada-reloj');
    if (!elReloj || !elReloj.isConnected) { limpiarIntervalos(); return; }
    elReloj.textContent = new Date().toLocaleTimeString('es-AR', { timeZone: ZONA_OPERATIVA, hour: '2-digit', minute: '2-digit' });

    const elFecha = document.getElementById('jornada-fecha');
    if (elFecha) elFecha.textContent = fmtFecha(nowParts().fecha);
  }

  function actualizarDuracion() {
    const el = document.getElementById('jornada-duracion');
    if (!el || !el.isConnected) { limpiarIntervalos(); return; }
    el.textContent = `Tiempo activo: ${calcularDuracion(jornadaActiva.fecha, jornadaActiva.hora_llegada)}`;
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

    // Protección real de la ruta (BIT-61): ocultar el menú no alcanza,
    // #jornadas puede escribirse a mano o quedar abierto al cambiar de
    // establecimiento -- mismo criterio ya usado por Catastro Equino
    // (modules/catastro/form.js). Solo gatea abrir una Jornada NUEVA: una
    // ya activa (ver renderActiva) siempre se puede seguir viendo/cerrando
    // aunque la capacidad se revoque después de abierta.
    if (!tieneJornadaHabilitada(ctx.establecimientoActivoId, ctx.capacidadesJornada, ctx.perfil)) {
      contenedor.innerHTML = `
        <div class="rodeo-card">
          <h2>🕒 Jornada</h2>
          <p class="rodeo-error">Jornada no está disponible para vos en <strong>${escapeHtml(nombreEstablecimientoActivo)}</strong>. Elegí otro establecimiento arriba, o consultá con un ADMINISTRADOR si corresponde habilitarla acá.</p>
          <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
        </div>`;
      return;
    }

    contenedor.innerHTML = `
      <div class="rodeo-card rodeo-jornada-operativa">
        <h2>Registro de Jornada</h2>
        <p class="rodeo-jornada-fecha" id="jornada-fecha">${fmtFecha(nowParts().fecha)}</p>
        <p class="rodeo-jornada-establecimiento">📍 ${escapeHtml(nombreEstablecimientoActivo)}</p>
        <p class="rodeo-jornada-reloj" id="jornada-reloj"></p>
        <div id="jornada-error" class="rodeo-error"></div>
        <button type="button" class="salida-btn rodeo-jornada-btn rodeo-jornada-btn-llegada" id="btn-llegada">LLEGADA</button>
        <p class="rodeo-hint" style="text-align:center;margin:10px 0 16px">Presioná para iniciar la jornada en ${escapeHtml(nombreEstablecimientoActivo)}</p>
        <a href="#jornadas/historial" class="rodeo-link-btn" style="margin-left:0">Ver historial de jornadas</a>
      </div>`;

    actualizarRelojYFecha();
    intervaloReloj = setInterval(actualizarRelojYFecha, 1000);

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
