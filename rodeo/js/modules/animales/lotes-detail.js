// Ficha de solo lectura de Lote (BIT-57). Caso mínimo a propósito: la
// tabla de Lotes ya muestra nombre y notas completos sin truncar, así que
// esta ficha no agrega datos nuevos -- se incluye por consistencia
// transversal del patrón Ver/Editar en todos los listados, no porque el
// listado actual oculte información.

import { getLote } from './services.js';
import { escapeHtml } from '../../dashboard.js';

function campo(etiqueta, valor, { vacio = 'Sin notas' } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

export async function mountLoteDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let lote;
  try {
    lote = await getLote(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar el Lote: ${escapeHtml(e.message)}</p><a href="#animales/lotes" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!lote) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Lote no encontrado.</p><a href="#animales/lotes" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>${escapeHtml(lote.nombre)}</h2>
        <a class="rodeo-btn" href="#animales/lotes/editar/${lote.id}">Editar</a>
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Nombre', lote.nombre, { vacio: 'Sin nombre' })}
        ${campo('Notas', lote.notas)}
      </div>

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#animales/lotes" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;
}
