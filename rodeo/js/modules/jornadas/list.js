import { listJornadas, eliminarJornada } from '../../services/jornadas.js';
import { escapeHtml } from '../../dashboard.js';

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

export async function mountJornadasList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando jornadas…</p>';

  let jornadas;
  try {
    jornadas = await listJornadas();
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar jornadas: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = jornadas
    .map((j) => {
      const esPropia = j.profesional_id === ctx.perfil.id;
      const puedeEliminar = esPropia || ctx.perfil.rol === 'ADMINISTRADOR';
      return `
        <tr>
          <td>${escapeHtml(j.fecha)}</td>
          <td>${fmtHora(j.hora_llegada)}</td>
          <td>${fmtHora(j.hora_salida)}</td>
          <td>${escapeHtml(j.perfiles?.nombre ?? '—')}</td>
          <td class="rodeo-table-acciones">
            <a href="#jornadas/editar/${j.id}">${esPropia ? 'Editar' : 'Ver'}</a>
            ${puedeEliminar ? `<button type="button" class="rodeo-link-btn rodeo-jornada-eliminar" data-id="${j.id}">Eliminar</button>` : ''}
          </td>
        </tr>`;
    })
    .join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Jornadas</h2>
        <a class="rodeo-btn" href="#jornadas/nueva">+ Nueva jornada</a>
      </div>
      ${
        jornadas.length === 0
          ? '<p>No hay jornadas registradas todavía.</p>'
          : `<table class="rodeo-table">
               <thead><tr><th>Fecha</th><th>Llegada</th><th>Salida</th><th>Profesional</th><th></th></tr></thead>
               <tbody>${filas}</tbody>
             </table>`
      }
    </div>
  `;

  contenedor.querySelectorAll('.rodeo-jornada-eliminar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta jornada?')) return;
      try {
        await eliminarJornada(btn.dataset.id);
        mountJornadasList(contenedor, ctx);
      } catch (e) {
        alert('Error al eliminar: ' + e.message);
      }
    });
  });
}
