// Renderizado compartido del resultado de un Informe (BIT-12) -- usado
// tanto por diario.js como por mensual.js, misma estructura de salida
// (INFORME → ESTABLECIMIENTO → EVENTOS, nunca mezclado).

import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';

const LABEL_TIPO_VISITA = {
  programada: 'Programada', seguimiento: 'Seguimiento', emergencia: 'Emergencia',
  control: 'Control', sanitaria: 'Sanitaria', otro: 'Otro',
};
const LABEL_ORIGEN = { atencion: 'Atención', observacion: 'Observación', novedad: 'Novedad' };

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

function renderBloqueEstablecimiento(bloque) {
  const jornadasHtml = seccion('Jornadas', bloque.jornadas, (j) => `
    <li>${fmtFecha(j.fecha)} — Llegada ${fmtHora(j.hora_llegada)}, Salida ${fmtHora(j.hora_salida)}${j.notas ? ` — <em>${escapeHtml(j.notas)}</em>` : ''}</li>`);

  const visitasHtml = seccion('Visitas', bloque.visitas, (v) => `
    <li>${fmtFecha(v.fecha)} — ${escapeHtml(LABEL_TIPO_VISITA[v.tipo] ?? v.tipo)} (${v.estado === 'abierta' ? 'Abierta' : 'Cerrada'})${v.notas ? ` — <em>${escapeHtml(v.notas)}</em>` : ''}</li>`);

  const atencionesHtml = seccion('Atenciones Clínicas', bloque.atenciones, (a) => `
    <li>${fmtFecha(a.fecha)} — ${escapeHtml(a.motivo ?? '—')}${a.animales ? ` — Paciente: ${escapeHtml(etiquetaPaciente(a.animales))}` : ''}${a.diagnostico ? ` — <em>${escapeHtml(a.diagnostico)}</em>` : ''}</li>`);

  const observacionesHtml = seccion('Observaciones de Campo', bloque.observaciones, (o) => `
    <li>${escapeHtml(o.descripcion)}${o.animales ? ` — Paciente: ${escapeHtml(etiquetaPaciente(o.animales))}` : ''}${o.visita_id ? ' — <span class="rodeo-hint">con Visita asociada</span>' : ''}</li>`);

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

  return `
    <div class="rodeo-card rodeo-informe-bloque">
      <div class="rodeo-card-header">
        <h3>📍 ${escapeHtml(bloque.establecimiento.nombre)}</h3>
        <span class="rodeo-hint">${bloque.resumen.totalJornadas + bloque.resumen.totalVisitas + bloque.resumen.totalAtenciones + bloque.resumen.totalObservaciones + bloque.resumen.totalNovedades} evento(s)</span>
      </div>
      ${jornadasHtml}
      ${visitasHtml}
      ${atencionesHtml}
      ${observacionesHtml}
      ${novedadesHtml}
      ${pacientesHtml}
    </div>`;
}

export function renderInforme(informe) {
  if (informe.establecimientos.length === 0) {
    return '<p class="rodeo-hint">No hay actividad para mostrar en los establecimientos seleccionados.</p>';
  }
  return `
    <p class="rodeo-informe-resumen"><strong>${informe.resumenGeneral.totalEventos}</strong> evento(s) en <strong>${informe.resumenGeneral.totalEstablecimientos}</strong> establecimiento(s) seleccionado(s).</p>
    ${informe.establecimientos.map(renderBloqueEstablecimiento).join('')}`;
}
