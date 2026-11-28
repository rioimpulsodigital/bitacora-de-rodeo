// BIT-75 — Listado y acciones del módulo Usuarios (solo ADMINISTRADOR). Es navegación y comodidad:
// la autoridad real se valida en el servidor en cada petición.
import { listarUsuarios, reenviarAcceso, desactivarUsuario, activarUsuario } from './services.js';
import { escapeHtml } from '../../dashboard.js';

export const ESTADOS = {
  ACTIVO: ['Activo', 'rodeo-check-ok'],
  PENDIENTE_PRIMER_INGRESO: ['Pendiente de primer ingreso', ''],
  INACTIVO: ['Inactivo', 'rodeo-check-fail'],
  BLOQUEADO: ['Bloqueado', 'rodeo-check-fail'],
  SIN_PERFIL: ['Sin perfil (alta incompleta)', 'rodeo-check-fail'],
};

export const ROLES_LABEL = {
  ADMINISTRADOR: 'Administrador',
  PROFESIONAL: 'Profesional',
  OPERADOR_CAMPO: 'Operador de campo',
  ASISTENTE_VETERINARIO: 'Asistente veterinario',
};

function fmtFechaHora(iso) {
  return iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export async function mountUsuarios(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
  let mensaje = '';
  try { mensaje = sessionStorage.getItem('usuarios_msg') ?? ''; sessionStorage.removeItem('usuarios_msg'); } catch { /* storage bloqueado */ }
  async function render() {
    let usuarios;
    try {
      usuarios = await listarUsuarios();
    } catch (err) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(err.message)}</p></div>`;
      return;
    }
    const filas = usuarios.map((u) => {
      const [etq, cls] = ESTADOS[u.estado] ?? [u.estado, ''];
      const propio = u.id === ctx.perfil.id;
      const ests = (u.establecimientos ?? []).map((e) => escapeHtml(e.nombre)).join(', ') || '—';
      const gestionable = u.estado !== 'SIN_PERFIL';
      return `<tr>
        <td><strong>${escapeHtml(u.nombre ?? '—')}</strong>${propio ? ' <small>(vos)</small>' : ''}
          <div class="rodeo-celda-secundaria">${escapeHtml(u.email ?? '')}</div></td>
        <td>${escapeHtml(ROLES_LABEL[u.rol] ?? u.rol ?? '—')}</td>
        <td class="${cls}">${escapeHtml(etq)}</td>
        <td>${ests}</td>
        <td>${fmtFechaHora(u.ultimo_ingreso)}</td>
        <td class="rodeo-table-acciones">${gestionable ? `
          <a href="#usuarios/editar/${escapeHtml(u.id)}">Editar</a>
          ${u.activo && u.estado !== 'BLOQUEADO' ? `<button type="button" class="rodeo-link-btn usr-reenviar" data-id="${escapeHtml(u.id)}">Reenviar acceso</button>` : ''}
          ${propio ? '' : u.activo
    ? `<button type="button" class="rodeo-link-btn usr-desactivar" data-id="${escapeHtml(u.id)}" data-nombre="${escapeHtml(u.nombre ?? '')}">Desactivar</button>`
    : `<button type="button" class="rodeo-link-btn usr-activar" data-id="${escapeHtml(u.id)}">Reactivar</button>`}` : ''}
        </td>
      </tr>`;
    }).join('');

    contenedor.innerHTML = `<div class="rodeo-card">
      <div class="rodeo-view-header"><h2>Usuarios</h2><a href="#usuarios/nuevo" class="rodeo-btn">+ Nuevo usuario</a></div>
      <div id="usr-msg" ${mensaje ? '' : 'style="display:none"'} class="rodeo-msg-ok" role="status">${escapeHtml(mensaje)}</div>
      <div id="usr-error" class="rodeo-error" style="display:none" role="alert"></div>
      ${usuarios.length === 0 ? '<p class="rodeo-empty">Sin usuarios.</p>' : `<div class="rodeo-table-wrap"><table class="rodeo-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Establecimientos</th><th>Último ingreso</th><th></th></tr></thead>
        <tbody>${filas}</tbody></table></div>`}
      <p class="rodeo-hint">La contraseña la elige cada persona desde el correo que recibe; nadie más la ve ni la define. Desactivar corta el acceso de inmediato y no elimina el historial.</p>
    </div>`;
    mensaje = '';

    const mostrarError = (m) => {
      const el = contenedor.querySelector('#usr-error');
      el.textContent = m; el.style.display = '';
    };
    const accion = (selector, fn, confirmar, ok) => contenedor.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (confirmar && !window.confirm(confirmar(btn))) return;
        btn.disabled = true;
        try {
          const r = await fn(btn.dataset.id);
          mensaje = ok(r);
          await render();
        } catch (err) {
          btn.disabled = false;
          mostrarError(err.message);
        }
      });
    });
    accion('.usr-desactivar', desactivarUsuario,
      (b) => `¿Desactivar a ${b.dataset.nombre || 'este usuario'}? Perderá el acceso de inmediato. No se elimina su historial.`,
      (r) => (r.bloqueo_auth ? 'Usuario desactivado.' : 'Usuario desactivado. Atención: el bloqueo de reingreso no se completó; reintentá la acción.'));
    accion('.usr-activar', activarUsuario, null, () => 'Usuario reactivado.');
    accion('.usr-reenviar', reenviarAcceso, null,
      () => 'Se pidió el envío del correo. Si no llega en unos minutos, revisá el correo y reintentá.');
  }
  await render();
}
