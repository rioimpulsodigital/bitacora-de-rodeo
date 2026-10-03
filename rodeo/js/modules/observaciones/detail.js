// Ficha de solo lectura de Observación de Campo (BIT-57). Reutiliza
// getObservacion() ya existente -- sin tocar services.js ni RLS.

import { getObservacion } from './services.js';
import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';

function formatFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function campo(etiqueta, valor, { vacio = 'No informado' } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

export async function mountObservacionDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let observacion;
  try {
    observacion = await getObservacion(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar la Observación: ${escapeHtml(e.message)}</p><a href="#observaciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!observacion) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Observación no encontrada.</p><a href="#observaciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>Observación de Campo</h2>
        <a class="rodeo-btn" href="#observaciones/editar/${observacion.id}">Editar</a>
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Fecha de la visita', formatFecha(observacion.visitas?.fecha))}
        ${campo('Paciente Animal', observacion.animales ? etiquetaPaciente(observacion.animales) : null, { vacio: 'Sin sujeto asociado' })}
      </div>
      <div class="rodeo-ficha-campo"><span class="form-label">Descripción</span><div style="white-space:pre-wrap">${escapeHtml(observacion.descripcion)}</div></div>

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#observaciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;
}
