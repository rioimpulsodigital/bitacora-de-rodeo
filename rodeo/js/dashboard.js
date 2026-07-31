// Dashboard inicial de validación (BIT-05). No es un módulo funcional —
// su único trabajo es demostrar, en pantalla, que la cadena completa
// sesión → perfil → rol → establecimientos (vía RLS) funciona de punta
// a punta antes de construir cualquier módulo de negocio sobre esto.

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderHeaderUsuario(perfil, onSignOut) {
  const el = document.getElementById('rodeo-user');
  el.innerHTML = `
    <span>${escapeHtml(perfil.nombre)}</span>
    <span class="rol-badge">${escapeHtml(perfil.rol)}</span>
    <button type="button" id="rodeo-logout">Cerrar sesión</button>
  `;
  document.getElementById('rodeo-logout').addEventListener('click', onSignOut);
}

export function renderHeaderEstablecimiento(establecimientos, activoId, onCambiar) {
  const el = document.getElementById('rodeo-establecimiento');

  if (establecimientos.length === 0) {
    el.innerHTML = `<span>Sin establecimientos asignados</span>`;
    return;
  }

  if (establecimientos.length === 1) {
    el.innerHTML = `<span>${escapeHtml(establecimientos[0].nombre)}</span>`;
    return;
  }

  const options = establecimientos
    .map((e) => `<option value="${e.id}" ${e.id === activoId ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`)
    .join('');
  el.innerHTML = `<select id="rodeo-establecimiento-select">${options}</select>`;
  document.getElementById('rodeo-establecimiento-select').addEventListener('change', (e) => onCambiar(e.target.value));
}

export function renderSinPerfil() {
  document.getElementById('rodeo-content').innerHTML = `
    <div class="rodeo-card">
      <h2>No hay perfil asignado</h2>
      <p class="rodeo-error">Tu cuenta existe pero todavía no tiene un perfil asociado en el sistema. Pedile a un Administrador que te dé de alta en la tabla <code>perfiles</code>.</p>
    </div>
  `;
}

export function mountDashboard(contenedor, ctx) {
  const { perfil, establecimientos, establecimientoActivoId: activoId } = ctx;
  const activo = establecimientos.find((e) => e.id === activoId);

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>Estado de la infraestructura</h2>
      <ul class="rodeo-check-list">
        <li class="rodeo-check-ok">✔ Sesión activa (Supabase Auth)</li>
        <li class="rodeo-check-ok">✔ Perfil cargado — ${escapeHtml(perfil.nombre)} (${escapeHtml(perfil.rol)})</li>
        <li class="${establecimientos.length ? 'rodeo-check-ok' : 'rodeo-check-fail'}">
          ${establecimientos.length ? '✔' : '✘'} Establecimientos accesibles vía RLS: ${establecimientos.length}
        </li>
        <li class="${activo ? 'rodeo-check-ok' : 'rodeo-check-fail'}">
          ${activo ? '✔' : '✘'} Establecimiento activo: ${activo ? escapeHtml(activo.nombre) : 'ninguno seleccionado'}
        </li>
      </ul>
    </div>
    <div class="rodeo-card">
      <h2>Este es un panel de validación, no un módulo funcional</h2>
      <p>Esta pantalla confirma que la infraestructura (BIT-05) funciona de punta a punta sobre la base de datos v1.0 (BIT-04). Los módulos reales (Animales, Atenciones Clínicas, Visitas, etc.) se construyen en los próximos BITs sobre esta misma base.</p>
    </div>
  `;
}
