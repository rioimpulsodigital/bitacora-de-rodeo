import { listAtenciones } from './services.js';
import { escapeHtml } from '../../dashboard.js';

function tieneRol(perfil, rol) {
  return perfil.rol === rol;
}

function fmt(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function truncar(s, max = 60) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function nombreAnimal(a) {
  if (!a) return '—';
  return a.nombre ? `${a.nombre} (${a.especie ?? ''})` : (a.especie ?? '—');
}

export async function mountAtencionesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  const esAdmin = tieneRol(ctx.perfil, 'ADMINISTRADOR');
  const esProfesional = tieneRol(ctx.perfil, 'PROFESIONAL');
  const esOperadorCampo = tieneRol(ctx.perfil, 'OPERADOR_CAMPO');

  if (esOperadorCampo) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No tenés acceso a Atenciones Clínicas.</p></div>`;
    return;
  }

  try {
    const atenciones = await listAtenciones(ctx.establecimientoActivoId);

    // Alertas en-app: proxima_visita = hoy o mañana
    const hoy = new Date().toISOString().split('T')[0];
    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const conAlerta = atenciones.filter(
      (a) => a.proxima_visita === hoy || a.proxima_visita === manana
    );

    let alertasHtml = '';
    if (conAlerta.length > 0) {
      const items = conAlerta
        .map((a) => {
          const esHoy = a.proxima_visita === hoy;
          const paciente = nombreAnimal(a.animales);
          return `<li>
            ${esHoy ? '🔴 HOY' : '🟡 Mañana'} — <strong>${escapeHtml(paciente)}</strong>: ${escapeHtml(truncar(a.motivo, 50))}
          </li>`;
        })
        .join('');
      alertasHtml = `
        <div class="rodeo-card" style="border-left:4px solid var(--orange);margin-bottom:12px">
          <strong style="font-size:13px">⏰ Próximas visitas programadas</strong>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:2">${items}</ul>
        </div>`;
    }

    let cuerpo = '';
    if (atenciones.length === 0) {
      cuerpo = '<p class="rodeo-empty">Sin atenciones registradas.</p>';
    } else {
      const filas = atenciones
        .map((a) => {
          const puedeEditar =
            esAdmin || (esProfesional && a.profesional_responsable_id === ctx.perfil.id);
          const estadoHtml =
            a.estado === 'abierta'
              ? '<span style="color:#1a5c2a;font-weight:600">Abierta</span>'
              : '<span style="color:var(--faint)">Cerrada</span>';
          return `<tr>
            <td>${fmt(a.fecha)}</td>
            <td>${escapeHtml(nombreAnimal(a.animales))}</td>
            <td>${escapeHtml(truncar(a.motivo))}</td>
            <td>${escapeHtml(truncar(a.diagnostico))}</td>
            <td>${estadoHtml}</td>
            <td>${a.proxima_visita ? fmt(a.proxima_visita) : '—'}</td>
            <td class="rodeo-table-acciones">${puedeEditar ? `<a href="#atenciones/editar/${a.id}">Editar</a>` : ''}</td>
          </tr>`;
        })
        .join('');

      cuerpo = `<div class="rodeo-table-wrapper">
        <table class="rodeo-table">
          <thead><tr>
            <th>Fecha</th><th>Paciente</th><th>Motivo</th><th>Diagnóstico</th><th>Estado</th><th>Próx. visita</th><th></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
    }

    contenedor.innerHTML = `
      ${alertasHtml}
      <div class="rodeo-card">
        <div class="rodeo-view-header">
          <h2>🩺 Atenciones Clínicas</h2>
          ${esProfesional ? '<a href="#atenciones/nueva" class="rodeo-btn">+ Nueva Atención</a>' : ''}
        </div>
        ${cuerpo}
      </div>`;
  } catch (err) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar atenciones: ${escapeHtml(err.message)}</p></div>`;
  }
}
