// Renderizado compartido del resultado de un Informe (BIT-12) -- usado
// tanto por diario.js como por mensual.js, misma estructura de salida
// (INFORME → ESTABLECIMIENTO → EVENTOS, nunca mezclado).
//
// `renderInforme()` (Diario, un solo día) y `renderInformeMensual()`
// (consolidación por fecha + detalle colapsable) comparten el mismo
// renderizador de bloque por establecimiento (`renderBloqueEstablecimiento`)
// -- la diferencia es solo de presentación (qué tan abierto va el
// detalle, si se muestra o no la tabla "por fecha"), nunca de los datos:
// ambos leen el mismo objeto `Informe` ya construido, sin re-consultar
// nada.

import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';
import { diaLocalDe } from '../../services/fecha-argentina.js';

const LABEL_TIPO_VISITA = {
  programada: 'Programada', seguimiento: 'Seguimiento', emergencia: 'Emergencia',
  control: 'Control', sanitaria: 'Sanitaria', otro: 'Otro',
};
const LABEL_ORIGEN = { atencion: 'Atención', observacion: 'Observación', novedad: 'Novedad' };
const LABEL_FUENTE_CORTA = { totalJornadas: 'Jor', totalVisitas: 'Vis', totalAtenciones: 'Ate', totalObservaciones: 'Obs', totalNovedades: 'Nov' };

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

function seccion(titulo, filas, renderFila) {
  return `
    <div class="rodeo-informe-seccion">
      <h4>${escapeHtml(titulo)} (${filas.length})</h4>
      ${filas.length === 0 ? `<p class="rodeo-hint">Sin ${titulo.toLowerCase()} en este establecimiento.</p>` : `<ul class="rodeo-informe-lista">${filas.map(renderFila).join('')}</ul>`}
    </div>`;
}

function renderDetalleFuentes(bloque) {
  const jornadasHtml = seccion('Jornadas', bloque.jornadas, (j) => `
    <li>${fmtFecha(j.fecha)} — Llegada ${fmtHora(j.hora_llegada)}, Salida ${fmtHora(j.hora_salida)}${j.notas ? ` — <em>${escapeHtml(j.notas)}</em>` : ''}</li>`);

  const visitasHtml = seccion('Visitas', bloque.visitas, (v) => `
    <li>${fmtFecha(v.fecha)} — ${escapeHtml(LABEL_TIPO_VISITA[v.tipo] ?? v.tipo)} (${v.estado === 'abierta' ? 'Abierta' : 'Cerrada'})${v.notas ? ` — <em>${escapeHtml(v.notas)}</em>` : ''}</li>`);

  const atencionesHtml = seccion('Atenciones Clínicas', bloque.atenciones, (a) => `
    <li>${fmtFecha(a.fecha)} — ${escapeHtml(a.motivo ?? '—')}${a.animales ? ` — Paciente: ${escapeHtml(etiquetaPaciente(a.animales))}` : ''}${a.diagnostico ? ` — <em>${escapeHtml(a.diagnostico)}</em>` : ''}</li>`);

  // Observaciones no tiene columna `fecha` propia -- se muestra la fecha
  // real derivada de `created_at` (diaLocalDe, zona Argentina) para que
  // un informe de varios días (Mensual) permita saber a qué fecha
  // pertenece cada una -- antes de esta corrección no se mostraba
  // ninguna fecha acá, aunque la lista ya estuviera ordenada por ella.
  const observacionesHtml = seccion('Observaciones de Campo', bloque.observaciones, (o) => `
    <li>${fmtFecha(diaLocalDe(o.created_at))} — ${escapeHtml(o.descripcion)}${o.animales ? ` — Paciente: ${escapeHtml(etiquetaPaciente(o.animales))}` : ''}${o.visita_id ? ' — <span class="rodeo-hint">con Visita asociada</span>' : ''}</li>`);

  const novedadesHtml = seccion('Novedades de Establecimiento', bloque.novedades, (n) => `
    <li>${fmtFecha(n.fecha)} — ${escapeHtml(n.descripcion ?? '—')}${n.animales ? ` — Paciente: ${escapeHtml(etiquetaPaciente(n.animales))}` : ''}</li>`);

  const pacientesHtml = bloque.pacientesRelacionados.length === 0
    ? ''
    : `
      <div class="rodeo-informe-seccion">
        <h4>Pacientes mencionados (${bloque.pacientesRelacionados.length})</h4>
        <ul class="rodeo-informe-lista">
          ${bloque.pacientesRelacionados.map((p) => `<li>${escapeHtml(etiquetaPaciente(p.animal))} — <span class="rodeo-hint">mencionado en: ${p.origenes.map((o) => LABEL_ORIGEN[o] ?? o).join(', ')}</span></li>`).join('')}
        </ul>
      </div>`;

  return `${jornadasHtml}${visitasHtml}${atencionesHtml}${observacionesHtml}${novedadesHtml}${pacientesHtml}`;
}

// Tabla "actividad por fecha" DENTRO de un establecimiento -- nunca
// mezclada con otro. Solo tiene sentido cuando el informe abarca más de
// un día (Mensual); el Diario no la muestra (un solo día sería una fila
// idéntica al resumen de cabecera, redundante).
function renderPorFecha(bloque) {
  if (bloque.porFecha.length === 0) return '';
  const filas = bloque.porFecha.map((dia) => `
    <tr>
      <td>${fmtFecha(dia.fecha)}</td>
      <td>${dia.totalJornadas || '—'}</td>
      <td>${dia.totalVisitas || '—'}</td>
      <td>${dia.totalAtenciones || '—'}</td>
      <td>${dia.totalObservaciones || '—'}</td>
      <td>${dia.totalNovedades || '—'}</td>
      <td><strong>${dia.total}</strong></td>
    </tr>`).join('');
  return `
    <div class="rodeo-informe-seccion">
      <h4>Actividad por fecha</h4>
      <table class="rodeo-table rodeo-informe-tabla-fecha">
        <thead><tr><th>Fecha</th><th>${LABEL_FUENTE_CORTA.totalJornadas}</th><th>${LABEL_FUENTE_CORTA.totalVisitas}</th><th>${LABEL_FUENTE_CORTA.totalAtenciones}</th><th>${LABEL_FUENTE_CORTA.totalObservaciones}</th><th>${LABEL_FUENTE_CORTA.totalNovedades}</th><th>Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function renderBloqueEstablecimiento(bloque, { mostrarPorFecha = false, detalleColapsable = false } = {}) {
  const totalEventos = bloque.resumen.totalJornadas + bloque.resumen.totalVisitas + bloque.resumen.totalAtenciones + bloque.resumen.totalObservaciones + bloque.resumen.totalNovedades;
  const detalle = renderDetalleFuentes(bloque);
  const porFechaHtml = mostrarPorFecha ? renderPorFecha(bloque) : '';

  return `
    <div class="rodeo-card rodeo-informe-bloque">
      <div class="rodeo-card-header">
        <h3>📍 ${escapeHtml(bloque.establecimiento.nombre)}</h3>
        <span class="rodeo-hint">${totalEventos} evento(s) · ${bloque.resumen.totalJornadas} Jornadas · ${bloque.resumen.totalVisitas} Visitas · ${bloque.resumen.totalAtenciones} Atenciones · ${bloque.resumen.totalObservaciones} Observaciones · ${bloque.resumen.totalNovedades} Novedades</span>
      </div>
      ${porFechaHtml}
      ${detalleColapsable
        ? `<details class="rodeo-informe-detalle"><summary>Ver detalle completo (${totalEventos})</summary>${detalle}</details>`
        : detalle}
    </div>`;
}

// Informe Diario -- comportamiento sin cambios respecto a la versión
// anterior (detalle siempre visible, sin tabla "por fecha" -- un solo
// día no la necesita).
export function renderInforme(informe) {
  if (informe.establecimientos.length === 0) {
    return '<p class="rodeo-hint">No hay actividad para mostrar en los establecimientos seleccionados.</p>';
  }
  return `
    <p class="rodeo-informe-resumen"><strong>${informe.resumenGeneral.totalEventos}</strong> evento(s) en <strong>${informe.resumenGeneral.totalEstablecimientos}</strong> establecimiento(s) seleccionado(s).</p>
    ${informe.establecimientos.map((b) => renderBloqueEstablecimiento(b)).join('')}`;
}

// Informe Mensual -- consolidación real del período: resumen general +
// totales por establecimiento y fuente (ya en la cabecera de cada
// bloque) + tabla "actividad por fecha" por establecimiento + detalle
// completo disponible pero colapsado por defecto (nunca la vista
// principal es una concatenación cronológica indiscriminada de todo el
// mes). Mismos bloques/datos que el Diario -- solo cambia la
// presentación.
export function renderInformeMensual(informe) {
  if (informe.establecimientos.length === 0) {
    return '<p class="rodeo-hint">No hay actividad para mostrar en los establecimientos seleccionados.</p>';
  }
  return `
    <p class="rodeo-informe-resumen"><strong>${informe.resumenGeneral.totalEventos}</strong> evento(s) en <strong>${informe.resumenGeneral.totalEstablecimientos}</strong> establecimiento(s) seleccionado(s), del ${fmtFecha(informe.desde)} al ${fmtFecha(informe.hasta)}.</p>
    ${informe.establecimientos.map((b) => renderBloqueEstablecimiento(b, { mostrarPorFecha: true, detalleColapsable: true })).join('')}`;
}
