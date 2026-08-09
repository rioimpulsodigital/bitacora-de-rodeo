import { listVisitas } from './services.js';
import { escapeHtml } from '../../dashboard.js';

function formatFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

const BADGE_ESTADO = {
  abierta: '<span style="color:#1a5c2a;font-weight:600">Abierta</span>',
  cerrada: '<span style="color:var(--muted)">Cerrada</span>',
};

const LABEL_TIPO = {
  programada: 'Programada',
  seguimiento: 'Seguimiento',
  emergencia: 'Emergencia',
  control: 'Control',
  otro: 'Otro',
};

export async function mountVisitasList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando visitas…</p>';

  let visitas;
  try {
    visitas = await listVisitas(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar visitas: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = visitas.map((v) => `
    <tr>
      <td>${formatFecha(v.fecha)}</td>
      <td>${escapeHtml(v.establecimientos?.nombre ?? '—')}</td>
      <td>${LABEL_TIPO[v.tipo] ?? '—'}</td>
      <td>${v.hora_inicio ? v.hora_inicio.slice(0, 5) : '—'}</td>
      <td>${v.hora_fin ? v.hora_fin.slice(0, 5) : '—'}</td>
      <td>${BADGE_ESTADO[v.estado] ?? escapeHtml(v.estado)}</td>
      <td class="rodeo-table-acciones">
        <a href="#visitas/editar/${v.id}">Editar</a>
      </td>
    </tr>`).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Visitas</h2>
        <a class="rodeo-btn" href="#visitas/nueva">+ Nueva Visita</a>
      </div>
      ${visitas.length === 0
        ? '<p>No hay visitas registradas todavía.</p>'
        : `<table class="rodeo-table">
             <thead><tr><th>Fecha</th><th>Establecimiento</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table>`
      }
    </div>`;
}
