import { listNovedades, tipoLabel } from './services.js';

function fmt(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function truncar(s, max = 80) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export async function mountNovedadesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
  try {
    const novedades = await listNovedades(ctx.establecimientoActivoId);
    const esAdminOProfesional =
      ctx.perfil.rol === 'ADMINISTRADOR' || ctx.perfil.rol === 'PROFESIONAL';

    let cuerpo = '';
    if (novedades.length === 0) {
      cuerpo = '<p class="rodeo-empty">Sin novedades registradas.</p>';
    } else {
      const filas = novedades
        .map((n) => {
          const puedeEditar = esAdminOProfesional || n.created_by === ctx.perfil.id;
          const paciente = n.animales?.nombre
            ? n.animales.nombre
            : n.lotes?.nombre
            ? `Lote: ${n.lotes.nombre}`
            : '—';
          const lluviaHtml =
            n.tipo === 'clima' && n.precipitacion_mm !== null
              ? ` <small>(${n.precipitacion_mm} mm)</small>`
              : '';
          return `<tr>
            <td>${fmt(n.fecha)}</td>
            <td>${tipoLabel(n.tipo)}${lluviaHtml}</td>
            <td>${truncar(n.descripcion)}</td>
            <td>${paciente}</td>
            <td class="rodeo-table-acciones">${puedeEditar ? `<a href="#novedades/editar/${n.id}">Editar</a>` : ''}</td>
          </tr>`;
        })
        .join('');

      cuerpo = `<div class="rodeo-table-wrapper">
        <table class="rodeo-table">
          <thead><tr>
            <th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Paciente / Lote</th><th></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
    }

    const mensaje = sessionStorage.getItem('_novedades_msg');
    if (mensaje) sessionStorage.removeItem('_novedades_msg');
    const mensajeHtml = mensaje ? `<div class="rodeo-msg-ok">${mensaje}</div>` : '';

    contenedor.innerHTML = `
      <div class="rodeo-card">
        <div class="rodeo-view-header">
          <h2>📰 Novedades del Establecimiento</h2>
          <a href="#novedades/nueva" class="rodeo-btn rodeo-btn-primary">+ Nueva Novedad</a>
        </div>
        ${mensajeHtml}
        ${cuerpo}
      </div>`;
  } catch (err) {
    contenedor.innerHTML = `<p class="rodeo-error">Error al cargar novedades: ${err.message}</p>`;
  }
}
