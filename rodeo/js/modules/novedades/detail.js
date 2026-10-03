// Ficha de solo lectura de Novedad (BIT-57). Antes de esta tarea, quien no
// calificaba para "Editar" (no admin/profesional/autor) no tenía forma de
// abrir la descripción completa -- solo la fila truncada del listado. `Ver`
// reutiliza getNovedad() ya existente y queda disponible para cualquiera
// que ya ve la fila (mismo alcance que listNovedades, sin ampliar nada).

import { getNovedad, tipoLabel } from './services.js';
import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';

function campo(etiqueta, valor, { vacio = 'No informado' } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

export async function mountNovedadDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let novedad;
  try {
    novedad = await getNovedad(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar la Novedad: ${escapeHtml(e.message)}</p><a href="#novedades" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!novedad) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Novedad no encontrada.</p><a href="#novedades" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  // Mismo criterio de permiso de edición que novedades/list.js -- Ver no
  // amplía quién puede editar, solo quién puede consultar.
  const esAdminOProfesional = ctx.perfil.rol === 'ADMINISTRADOR' || ctx.perfil.rol === 'PROFESIONAL';
  const puedeEditar = esAdminOProfesional || novedad.created_by === ctx.perfil.id;

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>Novedad — ${escapeHtml(novedad.fecha)}</h2>
        ${puedeEditar ? `<a class="rodeo-btn" href="#novedades/editar/${novedad.id}">Editar</a>` : ''}
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Fecha', novedad.fecha)}
        ${campo('Hora', novedad.hora)}
        ${campo('Tipo', novedad.tipo ? tipoLabel(novedad.tipo) : null, { vacio: 'Sin tipo' })}
        ${novedad.tipo === 'clima' ? campo('Lluvia (mm)', novedad.precipitacion_mm) : ''}
        ${campo('Paciente Animal', novedad.animales ? etiquetaPaciente(novedad.animales) : null, { vacio: 'Sin animal asociado' })}
        ${campo('Lote', novedad.lotes?.nombre, { vacio: 'Sin lote asociado' })}
        ${campo('Visita relacionada', novedad.visitas ? `${novedad.visitas.fecha} — ${novedad.visitas.tipo}` : null, { vacio: 'Sin visita asociada' })}
      </div>
      <div class="rodeo-ficha-campo"><span class="form-label">Descripción</span><div style="white-space:pre-wrap">${escapeHtml(novedad.descripcion)}</div></div>

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#novedades" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;
}
