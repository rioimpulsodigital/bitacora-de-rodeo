import {
  getValidador, listPendientesAtenciones, listProfesionalesValidadores,
  getDesignacionValidador, guardarDesignacionValidador,
} from './modules/atenciones/services.js';
import { capturarContexto, contextoSigueVigente } from './services/contexto.js';

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

async function montarDesignacionAdmin(contenedor, ctx, establecimientoId, contextoInicial) {
  const panel = document.createElement('div');
  panel.className = 'rodeo-card';
  panel.id = 'bit56-designacion-admin';
  panel.innerHTML = '<h2>PROFESIONAL validador</h2><p class="rodeo-loading">Cargando designación…</p>';
  contenedor.append(panel);
  try {
    const [profesionales, designacion] = await Promise.all([
      listProfesionalesValidadores(establecimientoId),
      getDesignacionValidador(establecimientoId),
    ]);
    if (!contextoSigueVigente(ctx, contextoInicial) || !panel.isConnected) return;
    const actual = profesionales.find((p) => p.id === designacion?.perfil_id);
    const estado = !designacion ? 'Sin designación' : !designacion.habilitada
      ? 'Designación deshabilitada' : actual
        ? `Designado: ${actual.nombre}` : 'Designación no vigente: el perfil ya no es elegible';
    const opciones = profesionales.map((p) =>
      `<option value="${escapeHtml(p.id)}" ${p.id === designacion?.perfil_id ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`
    ).join('');
    panel.innerHTML = `
      <h2>PROFESIONAL validador</h2>
      <p id="bit56-designacion-estado">${escapeHtml(estado)}</p>
      <p>Establecimiento activo: ${escapeHtml(ctx.establecimientos.find((e) => e.id === establecimientoId)?.nombre ?? '')}.</p>
      ${profesionales.length ? `<form id="bit56-designacion-form">
        <label class="form-label" for="bit56-designacion-perfil">PROFESIONAL activo vinculado</label>
        <select class="form-field" id="bit56-designacion-perfil" required>
          <option value="">Seleccionar profesional…</option>${opciones}
        </select>
        <button type="submit" class="rodeo-btn rodeo-btn-primary" id="bit56-designacion-guardar">Guardar designación</button>
      </form>` : '<p>No hay PROFESIONALES activos vinculados a este establecimiento.</p>'}
      <p>Los cambios de designación se bloquean mientras haya Atenciones pendientes de validación.</p>
      <p class="rodeo-error" id="bit56-designacion-error" role="alert" style="display:none"></p>`;
    const form = panel.querySelector('#bit56-designacion-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const perfilId = panel.querySelector('#bit56-designacion-perfil').value;
      const errorEl = panel.querySelector('#bit56-designacion-error');
      const boton = panel.querySelector('#bit56-designacion-guardar');
      errorEl.style.display = 'none';
      if (!contextoSigueVigente(ctx, contextoInicial) || !panel.isConnected) return;
      if (!profesionales.some((p) => p.id === perfilId)) {
        errorEl.textContent = 'Seleccioná un PROFESIONAL activo vinculado a este establecimiento.';
        errorEl.style.display = '';
        return;
      }
      if (designacion?.perfil_id === perfilId && designacion.habilitada) return;
      boton.disabled = true;
      try {
        await guardarDesignacionValidador(establecimientoId, perfilId);
        if (contextoSigueVigente(ctx, contextoInicial) && panel.isConnected) {
          panel.remove();
          await montarDesignacionAdmin(contenedor, ctx, establecimientoId, contextoInicial);
        }
      } catch (err) {
        if (contextoSigueVigente(ctx, contextoInicial) && panel.isConnected) {
          errorEl.textContent = String(err.message).includes('Hay validaciones pendientes')
            ? 'No se puede cambiar: hay Atenciones pendientes de validación.'
            : `No se pudo guardar la designación: ${err.message}`;
          errorEl.style.display = '';
          boton.disabled = false;
        }
      }
    });
  } catch (err) {
    if (contextoSigueVigente(ctx, contextoInicial) && panel.isConnected) {
      panel.innerHTML = `<h2>PROFESIONAL validador</h2><p class="rodeo-error">No se pudo cargar la configuración: ${escapeHtml(err.message)}</p>`;
    }
  }
}

export async function mountDashboard(contenedor, ctx) {
  const { perfil, establecimientos, establecimientoActivoId: activoId } = ctx;
  const activo = establecimientos.find((e) => e.id === activoId);
  const contextoInicial = capturarContexto(ctx);

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
  if (!activoId) return;
  if (perfil.rol === 'ADMINISTRADOR') {
    await montarDesignacionAdmin(contenedor, ctx, activoId, contextoInicial);
    return;
  }
  if (perfil.rol !== 'PROFESIONAL') return;
  try {
    if (await getValidador(activoId) !== perfil.id) return;
    const pendientes = await listPendientesAtenciones(activoId);
    if (!contextoSigueVigente(ctx, contextoInicial) || !contenedor.isConnected) return;
    if (contenedor.querySelector('#bit56-validaciones')) return;
    const filas = pendientes.map((a) => `<tr>
      <td>Atención Clínica</td>
      <td>${escapeHtml(a.animal_nombre || a.animal_identificacion || 'Paciente sin identificar')}</td>
      <td>${escapeHtml(a.autor_nombre || a.created_by)}</td>
      <td>${escapeHtml(a.enviado_at ? new Date(a.enviado_at).toLocaleString('es-AR') : '—')}</td>
      <td><a href="#atenciones/ver/${a.id}">Abrir registro</a></td>
    </tr>`).join('');
    contenedor.insertAdjacentHTML('beforeend', `<div class="rodeo-card" id="bit56-validaciones">
      <h2>Validaciones pendientes</h2>
      ${pendientes.length ? `<div class="rodeo-table-wrapper"><table class="rodeo-table">
        <thead><tr><th>Tipo</th><th>Paciente</th><th>Autor</th><th>Enviada</th><th></th></tr></thead>
        <tbody>${filas}</tbody></table></div>` : '<p>Sin Atenciones Clínicas pendientes.</p>'}
    </div>`);
  } catch (err) {
    if (contextoSigueVigente(ctx, contextoInicial) && contenedor.isConnected) {
      contenedor.insertAdjacentHTML('beforeend', `<p class="rodeo-error">No se pudo cargar la bandeja: ${escapeHtml(err.message)}</p>`);
    }
  }
}
