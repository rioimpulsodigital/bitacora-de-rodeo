import {
  listNovedadesPapelera,
  restaurarNovedad,
  eliminarNovedadDefinitivamente,
} from './services.js';
import { escapeHtml } from '../../dashboard.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function truncar(s, max = 60) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const LABEL_TIPO = {
  clima: 'Clima', infraestructura: 'Infraestructura', movimiento: 'Movimiento',
  productivo: 'Productivo', trabajo: 'Trabajo', otro: 'Otro',
};

export async function mountPapelera(contenedor, ctx, mensajeInicial = '') {
  // La restricción real es server-side (cada función valida is_admin());
  // esto solo evita mostrar una pantalla que igual fallaría.
  if (ctx.perfil.rol !== 'ADMINISTRADOR') {
    contenedor.innerHTML = '<div class="rodeo-card"><p class="rodeo-error">Solo un ADMINISTRADOR puede ver la Papelera.</p></div>';
    return;
  }

  contenedor.innerHTML = '<p class="rodeo-loading">Cargando papelera…</p>';

  let novedades;
  try {
    novedades = await listNovedadesPapelera(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar la Papelera: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = novedades.map((n) => {
    const contexto = n.animal_nombre ? n.animal_nombre : n.lote_nombre ? `Lote: ${n.lote_nombre}` : '—';
    const adjuntos = n.adjuntos_count > 0 ? `${n.adjuntos_count}` : '—';
    return `<tr>
      <td>${fmtFecha(n.fecha)}</td>
      <td>${escapeHtml(LABEL_TIPO[n.tipo] ?? n.tipo ?? '—')}</td>
      <td>${escapeHtml(truncar(n.descripcion))}</td>
      <td>${escapeHtml(contexto)}</td>
      <td>${fmtFechaHora(n.deleted_at)}</td>
      <td>${escapeHtml(n.deleted_by_nombre ?? '—')}</td>
      <td>${adjuntos}</td>
      <td class="rodeo-table-acciones">
        <button type="button" class="rodeo-link-btn papelera-restaurar" data-id="${n.id}">Restaurar</button>
        <button type="button" class="rodeo-btn-danger papelera-eliminar" data-id="${n.id}" data-adjuntos="${n.adjuntos_count}">Eliminar definitivamente</button>
      </td>
    </tr>`;
  }).join('');

  const cuerpo = novedades.length === 0
    ? '<p class="rodeo-empty">No hay novedades en la Papelera.</p>'
    : `<div class="rodeo-table-wrapper">
         <table class="rodeo-table">
           <thead><tr>
             <th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Paciente / Lote</th>
             <th>Eliminada</th><th>Eliminada por</th><th>Adjuntos</th><th></th>
           </tr></thead>
           <tbody>${filas}</tbody>
         </table>
       </div>`;

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-view-header"><h2>🗑️ Papelera</h2></div>
      <p class="rodeo-hint">Lo que se envía a la Papelera se puede restaurar. "Eliminar definitivamente" no se puede deshacer.</p>
      <div id="papelera-msg">${mensajeInicial ? `<div class="rodeo-msg-ok">${escapeHtml(mensajeInicial)}</div>` : ''}</div>
      <div id="papelera-error" class="rodeo-error" style="display:none"></div>
      <h3 style="margin:16px 0 8px">📰 Novedades</h3>
      ${cuerpo}
    </div>`;

  const errEl = document.getElementById('papelera-error');
  const mostrarError = (msg) => { errEl.textContent = msg; errEl.style.display = ''; };

  contenedor.querySelectorAll('.papelera-restaurar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Restaurar esta novedad?\n\nVolverá a verse en el listado de Novedades.')) return;
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        await restaurarNovedad(btn.dataset.id);
        mountPapelera(contenedor, ctx, 'Novedad restaurada.');
      } catch (e) {
        mostrarError('Error al restaurar: ' + e.message);
        btn.disabled = false;
      }
    });
  });

  contenedor.querySelectorAll('.papelera-eliminar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const adjuntos = Number(btn.dataset.adjuntos) || 0;
      const aviso = adjuntos > 0
        ? `\n\nAdemás se eliminarán ${adjuntos} adjunto(s) asociado(s) a esta novedad.`
        : '';
      const ok = confirm(
        '⚠️ ELIMINAR DEFINITIVAMENTE\n\n' +
        'Esta acción es IRREVERSIBLE: la novedad se borrará para siempre y no podrá recuperarse.' +
        aviso +
        '\n\n¿Confirmás que querés eliminarla definitivamente?'
      );
      if (!ok) return;
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        await eliminarNovedadDefinitivamente(btn.dataset.id, adjuntos > 0);
        mountPapelera(contenedor, ctx, 'Novedad eliminada definitivamente.');
      } catch (e) {
        mostrarError('Error al eliminar definitivamente: ' + e.message);
        btn.disabled = false;
      }
    });
  });
}
