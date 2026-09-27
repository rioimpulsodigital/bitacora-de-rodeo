import {
  listNovedadesPapelera,
  restaurarNovedad,
  eliminarNovedadDefinitivamente,
  listJornadasPapelera,
  restaurarJornada,
  eliminarJornadaDefinitivamente,
} from './services.js';
import { escapeHtml } from '../../dashboard.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
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

// Cada sección recibe el resultado de Promise.allSettled: si una entidad falla
// (ej. una función todavía no aplicada), las demás secciones siguen operativas.
function seccionNovedades(res) {
  const titulo = '<h3 style="margin:16px 0 8px">📰 Novedades</h3>';
  if (res.status === 'rejected') {
    return `${titulo}<p class="rodeo-error">Error al cargar las novedades eliminadas: ${escapeHtml(res.reason?.message ?? String(res.reason))}</p>`;
  }
  const novedades = res.value;
  if (novedades.length === 0) return `${titulo}<p class="rodeo-empty">No hay novedades en la Papelera.</p>`;

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
        <button type="button" class="rodeo-link-btn papelera-restaurar" data-entidad="novedad" data-id="${n.id}">Restaurar</button>
        <button type="button" class="rodeo-btn-danger papelera-eliminar" data-entidad="novedad" data-id="${n.id}" data-adjuntos="${n.adjuntos_count}">Eliminar definitivamente</button>
      </td>
    </tr>`;
  }).join('');

  return `${titulo}<div class="rodeo-table-wrapper"><table class="rodeo-table">
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Paciente / Lote</th><th>Eliminada</th><th>Eliminada por</th><th>Adjuntos</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

function seccionJornadas(res) {
  const titulo = '<h3 style="margin:24px 0 8px">🕒 Jornadas</h3>';
  const hint = '<p class="rodeo-hint">Las jornadas son personales (no pertenecen a un establecimiento): acá se ven las eliminadas de todos los profesionales.</p>';
  if (res.status === 'rejected') {
    return `${titulo}<p class="rodeo-error">Error al cargar las jornadas eliminadas: ${escapeHtml(res.reason?.message ?? String(res.reason))}</p>`;
  }
  const jornadas = res.value;
  if (jornadas.length === 0) return `${titulo}${hint}<p class="rodeo-empty">No hay jornadas en la Papelera.</p>`;

  const filas = jornadas.map((j) => {
    const conVisitas = j.visitas_count > 0;
    const botonDefinitivo = conVisitas
      ? `<button type="button" class="rodeo-btn-danger" disabled title="No se puede eliminar definitivamente: tiene ${j.visitas_count} visita(s) relacionada(s).">Eliminar definitivamente</button>`
      : `<button type="button" class="rodeo-btn-danger papelera-eliminar" data-entidad="jornada" data-id="${j.id}">Eliminar definitivamente</button>`;
    return `<tr>
      <td>${fmtFecha(j.fecha)}</td>
      <td>${fmtHora(j.hora_llegada)}</td>
      <td>${fmtHora(j.hora_salida)}</td>
      <td>${escapeHtml(j.profesional_nombre ?? '—')}</td>
      <td>${escapeHtml(truncar(j.notas))}</td>
      <td>${fmtFechaHora(j.deleted_at)}</td>
      <td>${escapeHtml(j.deleted_by_nombre ?? '—')}</td>
      <td>${conVisitas ? `${j.visitas_count} <small>(bloquea la eliminación definitiva)</small>` : '—'}</td>
      <td class="rodeo-table-acciones">
        <button type="button" class="rodeo-link-btn papelera-restaurar" data-entidad="jornada" data-id="${j.id}">Restaurar</button>
        ${botonDefinitivo}
      </td>
    </tr>`;
  }).join('');

  return `${titulo}${hint}<div class="rodeo-table-wrapper"><table class="rodeo-table">
    <thead><tr><th>Fecha</th><th>Llegada</th><th>Salida</th><th>Profesional</th><th>Notas</th><th>Eliminada</th><th>Eliminada por</th><th>Visitas</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

const ENTIDADES = {
  novedad: {
    nombre: 'novedad',
    restaurar: (btn) => restaurarNovedad(btn.dataset.id),
    eliminar: (btn) => eliminarNovedadDefinitivamente(btn.dataset.id, Number(btn.dataset.adjuntos) > 0),
    mensajeEliminar: (btn) => {
      const adjuntos = Number(btn.dataset.adjuntos) || 0;
      const aviso = adjuntos > 0 ? `\n\nAdemás se eliminarán ${adjuntos} adjunto(s) asociado(s) a esta novedad.` : '';
      return '⚠️ ELIMINAR DEFINITIVAMENTE\n\nEsta acción es IRREVERSIBLE: la novedad se borrará para siempre y no podrá recuperarse.' +
        aviso + '\n\n¿Confirmás que querés eliminarla definitivamente?';
    },
    confirmarRestaurar: '¿Restaurar esta novedad?\n\nVolverá a verse en el listado de Novedades.',
    okRestaurada: 'Novedad restaurada.',
    okEliminada: 'Novedad eliminada definitivamente.',
  },
  jornada: {
    nombre: 'jornada',
    restaurar: (btn) => restaurarJornada(btn.dataset.id),
    eliminar: (btn) => eliminarJornadaDefinitivamente(btn.dataset.id),
    mensajeEliminar: () =>
      '⚠️ ELIMINAR DEFINITIVAMENTE\n\nEsta acción es IRREVERSIBLE: la jornada se borrará para siempre y no podrá recuperarse.' +
      '\n\n¿Confirmás que querés eliminarla definitivamente?',
    confirmarRestaurar: '¿Restaurar esta jornada?\n\nVolverá a verse en el listado de Jornadas de su profesional.',
    okRestaurada: 'Jornada restaurada.',
    okEliminada: 'Jornada eliminada definitivamente.',
  },
};

export async function mountPapelera(contenedor, ctx, mensajeInicial = '') {
  // La restricción real es server-side (cada función valida is_admin());
  // esto solo evita mostrar una pantalla que igual fallaría.
  if (ctx.perfil.rol !== 'ADMINISTRADOR') {
    contenedor.innerHTML = '<div class="rodeo-card"><p class="rodeo-error">Solo un ADMINISTRADOR puede ver la Papelera.</p></div>';
    return;
  }

  contenedor.innerHTML = '<p class="rodeo-loading">Cargando papelera…</p>';

  const [resNovedades, resJornadas] = await Promise.allSettled([
    listNovedadesPapelera(ctx.establecimientoActivoId),
    listJornadasPapelera(),
  ]);

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-view-header"><h2>🗑️ Papelera</h2></div>
      <p class="rodeo-hint">Lo que se envía a la Papelera se puede restaurar. "Eliminar definitivamente" no se puede deshacer.</p>
      <div id="papelera-msg">${mensajeInicial ? `<div class="rodeo-msg-ok">${escapeHtml(mensajeInicial)}</div>` : ''}</div>
      <div id="papelera-error" class="rodeo-error" style="display:none"></div>
      ${seccionNovedades(resNovedades)}
      ${seccionJornadas(resJornadas)}
    </div>`;

  const errEl = document.getElementById('papelera-error');
  const mostrarError = (msg) => { errEl.textContent = msg; errEl.style.display = ''; };

  contenedor.querySelectorAll('.papelera-restaurar').forEach((btn) => {
    const ent = ENTIDADES[btn.dataset.entidad];
    btn.addEventListener('click', async () => {
      if (!confirm(ent.confirmarRestaurar)) return;
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        await ent.restaurar(btn);
        mountPapelera(contenedor, ctx, ent.okRestaurada);
      } catch (e) {
        mostrarError('Error al restaurar: ' + e.message);
        btn.disabled = false;
      }
    });
  });

  contenedor.querySelectorAll('.papelera-eliminar').forEach((btn) => {
    const ent = ENTIDADES[btn.dataset.entidad];
    btn.addEventListener('click', async () => {
      if (!confirm(ent.mensajeEliminar(btn))) return;
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        await ent.eliminar(btn);
        mountPapelera(contenedor, ctx, ent.okEliminada);
      } catch (e) {
        mostrarError('Error al eliminar definitivamente: ' + e.message);
        btn.disabled = false;
      }
    });
  });
}
