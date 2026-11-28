// BIT-75 — Alta y edición de usuarios (solo ADMINISTRADOR). Sin campo de contraseña: la persona
// la elige por su cuenta desde el correo de acceso.
import {
  listarUsuarios, crearUsuario, actualizarUsuario, asignarEstablecimientos,
  listarEstablecimientosSeleccionables,
} from './services.js';
import { ROLES_LABEL } from './list.js';
import { escapeHtml } from '../../dashboard.js';

const ROLES = Object.keys(ROLES_LABEL);

function opcionesRol(sel) {
  return ROLES.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${ROLES_LABEL[r]}</option>`).join('');
}
function checkboxEstablecimientos(ests, marcados) {
  return `<div class="rodeo-informe-selector">${ests.map((e) =>
    `<label class="rodeo-checkbox-linea"><input type="checkbox" name="est" value="${escapeHtml(e.id)}" ${marcados.includes(e.id) ? 'checked' : ''}> ${escapeHtml(e.nombre)}</label>`).join('')}</div>`;
}
const seleccionados = (form) => [...form.querySelectorAll('input[name="est"]:checked')].map((i) => i.value);

export async function mountUsuarioForm(contenedor, ctx, partes) {
  const editandoId = partes[0] === 'editar' ? partes[1] : null;
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
  let ests; let usuario = null;
  try {
    ests = await listarEstablecimientosSeleccionables();
    if (editandoId) {
      usuario = (await listarUsuarios()).find((u) => u.id === editandoId);
      if (!usuario || !usuario.nombre) {
        contenedor.innerHTML = '<div class="rodeo-card"><p class="rodeo-error">Usuario no encontrado.</p><a href="#usuarios" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>';
        return;
      }
    }
  } catch (err) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(err.message)}</p></div>`;
    return;
  }
  const propio = usuario?.id === ctx.perfil.id;
  const marcados = (usuario?.establecimientos ?? []).map((e) => e.id);

  contenedor.innerHTML = `<div class="rodeo-card">
    <div class="rodeo-view-header"><h2>${usuario ? 'Editar usuario' : 'Nuevo usuario'}</h2><a href="#usuarios" class="rodeo-btn">← Volver</a></div>
    <form id="form-usuario" class="rodeo-form" novalidate>
      <label class="form-label" for="usr-email">Email <span class="rodeo-required">*</span></label>
      <input class="form-field" type="email" id="usr-email" autocomplete="off" required maxlength="254"
        value="${escapeHtml(usuario?.email ?? '')}" ${usuario ? 'disabled' : ''}>
      <label class="form-label" for="usr-nombre">Nombre <span class="rodeo-required">*</span></label>
      <input class="form-field" type="text" id="usr-nombre" required minlength="2" maxlength="120" value="${escapeHtml(usuario?.nombre ?? '')}">
      <label class="form-label" for="usr-rol">Rol <span class="rodeo-required">*</span></label>
      <select class="form-field" id="usr-rol" ${propio ? 'disabled' : ''}>${opcionesRol(usuario?.rol ?? 'OPERADOR_CAMPO')}</select>
      ${propio ? '<p class="rodeo-hint">No podés cambiar tu propio rol.</p>' : ''}
      <label class="form-label">Establecimientos <span class="rodeo-required">*</span></label>
      ${checkboxEstablecimientos(ests, marcados)}
      ${usuario ? '' : '<p class="rodeo-hint">Se le enviará un correo para que elija su contraseña. El correo puede tardar unos minutos.</p>'}
      <div id="form-error" class="rodeo-error" style="display:none" role="alert"></div>
      <div class="rodeo-form-acciones"><button type="submit" class="rodeo-btn rodeo-btn-primary">${usuario ? 'Guardar cambios' : 'Crear usuario'}</button></div>
    </form></div>`;

  const form = contenedor.querySelector('#form-usuario');
  const errEl = contenedor.querySelector('#form-error');
  const btn = form.querySelector('button[type="submit"]');
  const error = (m) => { errEl.textContent = m; errEl.style.display = ''; };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errEl.style.display = 'none';
    const nombre = form.querySelector('#usr-nombre').value.trim();
    const rol = form.querySelector('#usr-rol').value;
    const sel = seleccionados(form);
    if (nombre.length < 2) return error('Ingresá el nombre.');
    if (sel.length < 1) return error('Elegí al menos un establecimiento.');
    btn.disabled = true;
    try {
      if (!usuario) {
        const email = form.querySelector('#usr-email').value.trim();
        if (!email.includes('@')) { btn.disabled = false; return error('Ingresá un email válido.'); }
        const r = await crearUsuario({ email, nombre, rol, establecimientos: sel });
        sessionStorage.setItem('usuarios_msg', r.correo_aceptado
          ? 'Usuario creado. Se pidió el envío del correo de acceso.'
          : 'Usuario creado, pero el correo de acceso no se pudo enviar. Usá «Reenviar acceso» desde el listado.');
      } else {
        const cambios = {};
        if (nombre !== usuario.nombre) cambios.nombre = nombre;
        if (!propio && rol !== usuario.rol) cambios.rol = rol;
        if (Object.keys(cambios).length) await actualizarUsuario(usuario.id, cambios);
        const igual = sel.length === marcados.length && sel.every((x) => marcados.includes(x));
        if (!igual) await asignarEstablecimientos(usuario.id, sel);
        sessionStorage.setItem('usuarios_msg', 'Cambios guardados.');
      }
      location.hash = '#usuarios';
    } catch (err) {
      btn.disabled = false;
      error(err.message);
    }
  });
}
