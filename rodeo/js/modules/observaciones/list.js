import { listObservaciones } from './services.js';
import { escapeHtml } from '../../dashboard.js';

function formatFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function truncar(texto, max = 80) {
  if (!texto) return '—';
  return texto.length > max ? texto.slice(0, max) + '…' : texto;
}

export async function mountObservacionesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando observaciones…</p>';

  let observaciones;
  try {
    observaciones = await listObservaciones(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar observaciones: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = observaciones.map((o) => `
    <tr>
      <td>${formatFecha(o.visitas?.fecha)}</td>
      <td>${escapeHtml(o.visitas?.establecimientos?.nombre ?? '—')}</td>
      <td>${escapeHtml(truncar(o.descripcion))}</td>
      <td>${escapeHtml(o.animales?.nombre ?? '—')}</td>
      <td class="rodeo-table-acciones">
        <a href="#observaciones/editar/${o.id}">Editar</a>
      </td>
    </tr>`).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Observaciones de Campo</h2>
        <a class="rodeo-btn" href="#observaciones/nueva">+ Nueva Observación</a>
      </div>
      ${observaciones.length === 0
        ? '<p>No hay observaciones registradas todavía. <a href="#observaciones/nueva">+ Nueva Observación</a></p>'
        : `<table class="rodeo-table">
             <thead><tr><th>Fecha visita</th><th>Establecimiento</th><th>Descripción</th><th>Paciente Animal</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table>`
      }
    </div>`;
}
