import { listJornadas, enviarJornadaAPapelera } from '../../services/jornadas.js';
import { escapeHtml } from '../../dashboard.js';

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

export async function mountJornadasList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando jornadas…</p>';

  // BIT-61: Historial siempre acotado al establecimiento activo -- nunca
  // mezcla Jornadas de otro establecimiento aunque sean propias.
  const nombreEstablecimientoActivo = ctx.establecimientos.find((e) => e.id === ctx.establecimientoActivoId)?.nombre ?? '—';

  let jornadas;
  try {
    jornadas = await listJornadas(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar jornadas: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = jornadas
    .map((j) => {
      const esPropia = j.profesional_id === ctx.perfil.id;
      // Solo UX: el dueño (cualquier rol) o un ADMINISTRADOR. La regla real
      // la valida soft_delete_jornada() del lado del servidor.
      const puedeEnviarAPapelera = esPropia || ctx.perfil.rol === 'ADMINISTRADOR';
      return `
        <tr>
          <td>${escapeHtml(j.fecha)}</td>
          <td>${escapeHtml(j.establecimientos?.nombre ?? '—')}</td>
          <td>${fmtHora(j.hora_llegada)}</td>
          <td>${fmtHora(j.hora_salida)}</td>
          <td>${escapeHtml(j.perfiles?.nombre ?? '—')}</td>
          <td class="rodeo-table-acciones">
            <a href="#jornadas/ver/${j.id}">Ver</a>
            ${esPropia ? `<a href="#jornadas/editar/${j.id}">Editar</a>` : ''}
            ${puedeEnviarAPapelera ? `<button type="button" class="rodeo-link-btn rodeo-jornada-papelera" data-id="${j.id}">Enviar a la Papelera</button>` : ''}
          </td>
        </tr>`;
    })
    .join('');

  const mensaje = sessionStorage.getItem('_jornadas_msg');
  if (mensaje) sessionStorage.removeItem('_jornadas_msg');
  const mensajeHtml = mensaje ? `<div class="rodeo-msg-ok">${escapeHtml(mensaje)}</div>` : '';

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Jornadas en ${escapeHtml(nombreEstablecimientoActivo)}</h2>
        <a class="rodeo-btn" href="#jornadas/nueva">+ Nueva jornada</a>
      </div>
      ${mensajeHtml}
      <div id="jornadas-error" class="rodeo-error" style="display:none"></div>
      ${
        jornadas.length === 0
          ? `<p>No hay jornadas registradas todavía en ${escapeHtml(nombreEstablecimientoActivo)}.</p>`
          : `<table class="rodeo-table">
               <thead><tr><th>Fecha</th><th>Establecimiento</th><th>Llegada</th><th>Salida</th><th>Profesional</th><th></th></tr></thead>
               <tbody>${filas}</tbody>
             </table>`
      }
    </div>
  `;

  contenedor.querySelectorAll('.rodeo-jornada-papelera').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Enviar esta jornada a la Papelera?\n\nDejará de verse en el listado. Un ADMINISTRADOR podrá restaurarla desde la Papelera.')) return;
      btn.disabled = true;
      const errEl = document.getElementById('jornadas-error');
      errEl.style.display = 'none';
      try {
        await enviarJornadaAPapelera(btn.dataset.id);
        sessionStorage.setItem('_jornadas_msg', 'Jornada enviada a la Papelera.');
        mountJornadasList(contenedor, ctx);
      } catch (e) {
        errEl.textContent = 'Error al enviar a la Papelera: ' + e.message;
        errEl.style.display = '';
        btn.disabled = false;
      }
    });
  });
}
