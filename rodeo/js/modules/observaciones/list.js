import { listObservaciones } from './services.js';
import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';

// BIT-63: Observación ya no tiene fecha propia -- se muestra la fecha de
// creación (`created_at`, timestamptz) convertida al día calendario de
// Argentina, con la misma zona explícita ya validada en BIT-61 -- nunca
// `toISOString()`/zona del dispositivo, para no reintroducir ese bug.
function formatFechaCreacion(createdAt) {
  if (!createdAt) return '—';
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(createdAt));
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('day')}/${valor('month')}/${valor('year')}`;
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
      <td>${formatFechaCreacion(o.created_at)}</td>
      <td>${escapeHtml(o.establecimientos?.nombre ?? '—')}</td>
      <td>${escapeHtml(truncar(o.descripcion))}</td>
      <td>${escapeHtml(o.animales ? etiquetaPaciente(o.animales) : '—')}</td>
      <td class="rodeo-table-acciones">
        <a href="#observaciones/ver/${o.id}">Ver</a>
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
        ? '<p>No hay observaciones registradas todavía.</p>'
        : `<table class="rodeo-table">
             <thead><tr><th>Fecha</th><th>Establecimiento</th><th>Descripción</th><th>Paciente Animal</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table>`
      }
    </div>`;
}
