// Ficha de solo lectura de Visita (BIT-57). Mismo patrón que
// modules/animales/detail.js: reutiliza getVisita() ya existente, sin
// tocar services.js ni RLS -- la visibilidad del registro ya la resuelve
// el SELECT scopeado por establecimiento activo.

import { getVisita } from './services.js';
import { escapeHtml } from '../../dashboard.js';

const LABEL_TIPO = {
  programada: 'Programada',
  seguimiento: 'Seguimiento',
  emergencia: 'Emergencia',
  control: 'Control',
  sanitaria: 'Sanitaria',
  otro: 'Otro',
};

const LABEL_ALCANCE = {
  todo_lote: 'Todo el lote',
  categoria: 'Categoría del lote',
};

const LABEL_ESTADO = {
  abierta: 'Abierta',
  cerrada: 'Cerrada',
};

function campo(etiqueta, valor, { vacio = 'No informado' } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

export async function mountVisitaDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let visita;
  try {
    visita = await getVisita(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar la Visita: ${escapeHtml(e.message)}</p><a href="#visitas" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!visita) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Visita no encontrada.</p><a href="#visitas" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  const esSanitaria = visita.tipo === 'sanitaria';

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>Visita — ${escapeHtml(visita.fecha)}</h2>
        <a class="rodeo-btn" href="#visitas/editar/${visita.id}">Editar</a>
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Fecha', visita.fecha)}
        ${campo('Tipo', LABEL_TIPO[visita.tipo] ?? visita.tipo)}
        ${campo('Estado', LABEL_ESTADO[visita.estado] ?? visita.estado)}
        ${campo('Establecimiento', visita.establecimientos?.nombre)}
        ${esSanitaria ? campo('Lote', visita.lotes?.nombre, { vacio: 'Sin lote' }) : ''}
        ${esSanitaria ? campo('Alcance', LABEL_ALCANCE[visita.alcance] ?? visita.alcance) : ''}
        ${esSanitaria && visita.alcance === 'categoria' ? campo('Categoría', visita.categoria) : ''}
      </div>
      ${esSanitaria && visita.acciones_realizadas ? `<div class="rodeo-ficha-campo"><span class="form-label">Acciones realizadas</span><div style="white-space:pre-wrap">${escapeHtml(visita.acciones_realizadas)}</div></div>` : ''}
      ${visita.notas ? `<div class="rodeo-ficha-campo"><span class="form-label">Notas</span><div style="white-space:pre-wrap">${escapeHtml(visita.notas)}</div></div>` : ''}

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#visitas" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;
}
