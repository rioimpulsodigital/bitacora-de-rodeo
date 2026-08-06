import { listLotes } from './services.js';
import { escapeHtml } from '../../dashboard.js';

export async function mountLotesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando lotes…</p>';

  let lotes;
  try {
    lotes = await listLotes(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar lotes: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = lotes.map((l) => `
    <tr>
      <td>${escapeHtml(l.nombre)}</td>
      <td>${escapeHtml(l.notas ?? '—')}</td>
      <td class="rodeo-table-acciones">
        <a href="#lotes/editar/${l.id}">Editar</a>
      </td>
    </tr>`).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Lotes</h2>
        <a class="rodeo-btn" href="#lotes/nuevo">+ Nuevo Lote</a>
      </div>
      ${lotes.length === 0
        ? '<p>No hay lotes registrados todavía.</p>'
        : `<table class="rodeo-table">
             <thead><tr><th>Nombre</th><th>Notas</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table>`
      }
    </div>`;
}
