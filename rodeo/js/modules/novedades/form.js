import {
  getNovedad,
  listVisitasParaSelector,
  listAnimalesParaSelector,
  listLotesParaSelector,
  crearNovedad,
  actualizarNovedad,
  eliminarNovedad,
  TIPOS,
  tipoLabel,
} from './services.js';

function fmtVisita(v) {
  if (!v) return '';
  const [y, m, d] = v.fecha.split('-');
  return `${d}/${m}/${y} — ${v.tipo ?? ''}`;
}

export async function mountNovedadForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
  const esEdicion = Boolean(id);
  const esAdmin = ctx.perfil.rol === 'ADMINISTRADOR';

  try {
    const [novedad, visitas, animales, lotes] = await Promise.all([
      esEdicion ? getNovedad(id) : Promise.resolve(null),
      listVisitasParaSelector(ctx.establecimientoActivoId),
      listAnimalesParaSelector(ctx.establecimientoActivoId),
      listLotesParaSelector(ctx.establecimientoActivoId),
    ]);

    if (esEdicion && !novedad) {
      contenedor.innerHTML =
        '<p class="rodeo-error">Novedad no encontrada o sin acceso.</p>' +
        '<p><a href="#novedades">← Volver al listado</a></p>';
      return;
    }

    const tipoActual = novedad?.tipo ?? '';
    const mostrarPrecip = tipoActual === 'clima';

    const opcionesTipo = TIPOS.map(
      (t) => `<option value="${t}" ${tipoActual === t ? 'selected' : ''}>${tipoLabel(t)}</option>`
    ).join('');

    const opcionesVisita = visitas
      .map(
        (v) =>
          `<option value="${v.id}" ${novedad?.visita_id === v.id ? 'selected' : ''}>${fmtVisita(v)}</option>`
      )
      .join('');

    const opcionesAnimal = animales
      .map(
        (a) =>
          `<option value="${a.id}" ${novedad?.animal_id === a.id ? 'selected' : ''}>${a.nombre}</option>`
      )
      .join('');

    const opcionesLote = lotes
      .map(
        (l) =>
          `<option value="${l.id}" ${novedad?.lote_id === l.id ? 'selected' : ''}>${l.nombre}</option>`
      )
      .join('');

    const today = new Date().toISOString().split('T')[0];

    contenedor.innerHTML = `
      <div class="rodeo-card">
      <div class="rodeo-view-header">
        <h2>${esEdicion ? 'Editar Novedad' : 'Nueva Novedad'}</h2>
        <a href="#novedades" class="rodeo-btn">← Volver</a>
      </div>
      <form id="form-novedad" class="rodeo-form" novalidate>

        <label class="form-label">Fecha <span class="form-required">*</span></label>
        <input class="form-field" type="date" name="fecha" value="${novedad?.fecha ?? today}" required>

        <label class="form-label">Hora (opcional)</label>
        <input class="form-field" type="time" name="hora" value="${novedad?.hora ?? ''}">

        <label class="form-label">Tipo (opcional)</label>
        <select class="form-field" name="tipo" id="novedad-tipo">
          <option value="">— Sin tipo —</option>
          ${opcionesTipo}
        </select>

        <div id="campo-precipitacion" style="display:${mostrarPrecip ? '' : 'none'}">
          <label class="form-label">Lluvia (mm)</label>
          <input class="form-field" type="number" name="precipitacion_mm"
            value="${novedad?.precipitacion_mm ?? ''}" min="0" step="0.1" placeholder="Ej: 12.5">
        </div>

        <label class="form-label">Descripción <span class="form-required">*</span></label>
        <textarea class="form-field" name="descripcion" rows="4" required>${novedad?.descripcion ?? ''}</textarea>

        <label class="form-label">Visita relacionada (opcional)</label>
        <select class="form-field" name="visita_id">
          <option value="">— Sin visita —</option>
          ${opcionesVisita}
        </select>

        <label class="form-label">Paciente Animal (opcional)</label>
        <select class="form-field" name="animal_id">
          <option value="">— Sin animal —</option>
          ${opcionesAnimal}
        </select>

        <label class="form-label">Lote (opcional)</label>
        <select class="form-field" name="lote_id">
          <option value="">— Sin lote —</option>
          ${opcionesLote}
        </select>

        <p class="form-hint" style="color:var(--color-text-muted,#888);font-size:.85rem">
          📎 Adjuntos fotográficos: disponibles en una próxima versión.
        </p>

        <div id="form-error" class="rodeo-error" style="display:none"></div>

        <div class="form-actions">
          ${esEdicion && esAdmin
            ? '<button type="button" id="btn-eliminar" class="rodeo-btn rodeo-btn-danger">Eliminar</button>'
            : ''}
          <button type="submit" class="rodeo-btn rodeo-btn-primary">
            ${esEdicion ? 'Guardar cambios' : 'Crear novedad'}
          </button>
        </div>
      </form>
      </div>`;

    // Mostrar/ocultar precipitacion_mm según tipo
    document.getElementById('novedad-tipo').addEventListener('change', (e) => {
      document.getElementById('campo-precipitacion').style.display =
        e.target.value === 'clima' ? '' : 'none';
    });

    // Soft delete (solo ADMINISTRADOR)
    const btnEliminar = document.getElementById('btn-eliminar');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', async () => {
        if (
          !confirm(
            '¿Eliminar esta novedad? Quedará marcada como eliminada y no se podrá ver desde la app.'
          )
        )
          return;
        btnEliminar.disabled = true;
        const errEl = document.getElementById('form-error');
        errEl.style.display = 'none';
        try {
          await eliminarNovedad(id);
          location.hash = '#novedades';
        } catch (err) {
          errEl.textContent = 'Error al eliminar: ' + err.message;
          errEl.style.display = '';
          btnEliminar.disabled = false;
        }
      });
    }

    // Submit
    document.getElementById('form-novedad').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const campos = Object.fromEntries(fd.entries());
      campos.establecimiento_id = ctx.establecimientoActivoId;

      const errEl = document.getElementById('form-error');
      errEl.style.display = 'none';

      if (!campos.fecha) {
        errEl.textContent = 'La fecha es obligatoria.';
        errEl.style.display = '';
        return;
      }
      if (!campos.descripcion?.trim()) {
        errEl.textContent = 'La descripción es obligatoria.';
        errEl.style.display = '';
        return;
      }

      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      try {
        if (esEdicion) {
          await actualizarNovedad(id, campos);
        } else {
          await crearNovedad(campos);
        }
        location.hash = '#novedades';
      } catch (err) {
        errEl.textContent = 'Error al guardar: ' + err.message;
        errEl.style.display = '';
        btn.disabled = false;
        btn.textContent = esEdicion ? 'Guardar cambios' : 'Crear novedad';
      }
    });
  } catch (err) {
    contenedor.innerHTML = `<p class="rodeo-error">Error al cargar el formulario: ${err.message}</p>`;
  }
}
