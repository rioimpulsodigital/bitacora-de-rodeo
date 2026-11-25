import { getLote, crearLote, actualizarLote } from './services.js';
import { escapeHtml } from '../../dashboard.js';
import { puedeGestionarLotes } from '../../services/permisos.js';
import {
  bloquearSiEsAjeno, capturarContexto, contextoSigueVigente, MENSAJE_CONTEXTO_CAMBIO,
} from '../../services/contexto.js';

export async function mountLoteForm(contenedor, ctx, id) {
  if (!puedeGestionarLotes(ctx.perfil)) {
    contenedor.innerHTML = '<div class="rodeo-card"><p class="rodeo-error">No tenés permiso para gestionar Lotes.</p></div>';
    return;
  }
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
  const contextoAlMontar = capturarContexto(ctx); // BIT-70

  let lote = null;
  if (id) {
    try {
      lote = await getLote(id);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!lote) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Lote no encontrado.</p></div>`;
      return;
    }
    // BIT-70/F-02: un Lote de otro establecimiento no se edita desde el activo.
    if (bloquearSiEsAjeno(contenedor, ctx, lote.establecimiento_id, { entidad: 'Lote', hrefVolver: '#animales/lotes', textoVolver: 'Volver a Lotes' })) return;
  }

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${lote ? 'Editar Lote' : 'Nuevo Lote'}</h2>
      <form id="rodeo-lote-form">
        <label class="form-label">Nombre <span class="rodeo-required">*</span></label>
        <input class="form-field" type="text" name="nombre" value="${escapeHtml(lote?.nombre ?? '')}" required>

        <label class="form-label">Notas (opcional)</label>
        <textarea class="act-textarea" name="notas" rows="3">${lote?.notas ? escapeHtml(lote.notas) : ''}</textarea>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn">Guardar</button>
          <a href="#animales/lotes" class="rodeo-link-btn">Volver a Lotes</a>
        </div>
      </form>
    </div>`;

  document.getElementById('rodeo-lote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    if (!contextoSigueVigente(ctx, contextoAlMontar)) { errorEl.textContent = MENSAJE_CONTEXTO_CAMBIO; return; }

    const campos = {
      nombre: fd.get('nombre'),
      notas: fd.get('notas'),
      establecimiento_id: lote?.establecimiento_id ?? ctx.establecimientoActivoId,
    };

    if (!campos.nombre?.trim()) {
      errorEl.textContent = 'El nombre es obligatorio.';
      return;
    }

    try {
      if (lote) await actualizarLote(lote.id, campos);
      else await crearLote(campos);
      location.hash = '#animales/lotes';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
