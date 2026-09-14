import {
  getAtencion,
  listAnimalesParaSelector,
  listLotesParaSelector,
  listVisitasParaSelector,
  listHistorialAnimal,
  crearAtencion,
  actualizarAtencion,
} from './services.js';
import { escapeHtml } from '../../dashboard.js';

function tieneRol(perfil, rol) {
  return perfil.rol === rol;
}

function toDateOnly(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function fmt(value) {
  const isoDate = toDateOnly(value);
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function getNow() {
  const now = new Date();
  return {
    hoy: now.toISOString().split('T')[0],
    hora: now.toTimeString().slice(0, 5),
  };
}

async function renderHistorial(historialEl, animalId, establecimientoId, excludeId) {
  if (!animalId) {
    historialEl.innerHTML = '';
    return;
  }
  historialEl.innerHTML = '<p class="rodeo-loading">Cargando historial…</p>';
  try {
    const atenciones = await listHistorialAnimal(animalId, establecimientoId, excludeId);
    if (atenciones.length === 0) {
      historialEl.innerHTML = `
        <div class="rodeo-card" style="margin-top:12px">
          <p class="rodeo-empty">Sin atenciones anteriores para este paciente.</p>
        </div>`;
      return;
    }
    const filas = atenciones
      .map(
        (a) => `<tr>
          <td>${fmt(a.fecha)}</td>
          <td>${escapeHtml(a.motivo)}</td>
          <td>${escapeHtml(a.diagnostico)}</td>
          <td>${a.estado === 'abierta' ? '<span style="color:#1a5c2a;font-weight:600">Abierta</span>' : '<span style="color:var(--faint)">Cerrada</span>'}</td>
        </tr>`
      )
      .join('');
    historialEl.innerHTML = `
      <div class="rodeo-card" style="margin-top:12px">
        <h2 style="font-size:13px;margin-bottom:12px">📋 Historial clínico del paciente</h2>
        <div class="rodeo-table-wrapper">
          <table class="rodeo-table">
            <thead><tr><th>Fecha</th><th>Motivo</th><th>Diagnóstico</th><th>Estado</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    historialEl.innerHTML = `
      <div class="rodeo-card" style="margin-top:12px">
        <p class="rodeo-error">Error al cargar historial: ${escapeHtml(err.message)}</p>
      </div>`;
  }
}

export async function mountAtencionForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  const esEdicion = Boolean(id);
  const esAdmin = tieneRol(ctx.perfil, 'ADMINISTRADOR');
  const esProfesional = tieneRol(ctx.perfil, 'PROFESIONAL');
  const esOperadorCampo = tieneRol(ctx.perfil, 'OPERADOR_CAMPO');

  if (esOperadorCampo) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No tenés acceso a Atenciones Clínicas.</p></div>`;
    return;
  }

  if (!esEdicion && !esProfesional) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Solo usuarios con rol Profesional pueden crear Atenciones Clínicas.</p></div>`;
    return;
  }

  try {
    const [atencion, animales, lotes, visitas] = await Promise.all([
      esEdicion ? getAtencion(id) : Promise.resolve(null),
      listAnimalesParaSelector(ctx.establecimientoActivoId),
      listLotesParaSelector(ctx.establecimientoActivoId),
      listVisitasParaSelector(ctx.establecimientoActivoId),
    ]);

    if (esEdicion && !atencion) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Atención no encontrada o sin acceso.</p></div>`;
      return;
    }

    // Retorno desde flujo "+ Nuevo Paciente"
    const returnedAnimalId = sessionStorage.getItem('_atenciones_animal_id');
    if (returnedAnimalId) sessionStorage.removeItem('_atenciones_animal_id');
    const selectedAnimalId = returnedAnimalId ?? atencion?.animal_id ?? '';

    const { hoy, hora: horaActual } = getNow();

    const animalesOpts = [
      '<option value="">— Seleccionar paciente —</option>',
      ...animales.map((a) => {
        const label = a.nombre ? `${a.nombre} (${a.especie ?? ''})` : (a.especie ?? 'Sin identificar');
        return `<option value="${a.id}" ${selectedAnimalId === a.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }),
    ].join('');

    const lotesOpts = [
      '<option value="">— Sin lote —</option>',
      ...lotes.map(
        (l) => `<option value="${l.id}" ${atencion?.lote_id === l.id ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`
      ),
    ].join('');

    const visitasOpts = [
      '<option value="">— Sin visita —</option>',
      ...visitas.map((v) => {
        const [y, m, d] = v.fecha.split('-');
        return `<option value="${v.id}" ${atencion?.visita_id === v.id ? 'selected' : ''}>${d}/${m}/${y} — ${escapeHtml(v.tipo ?? '')}</option>`;
      }),
    ].join('');

    // Profesional responsable:
    // - Creación (solo PROFESIONAL): auto-completado con el usuario autenticado, no editable.
    // - Edición: muestra el profesional original como lectura, no permite cambiarlo.
    let profesionalNombre, profesionalId;
    if (esEdicion) {
      profesionalNombre = atencion?.perfiles?.nombre ?? '—';
      profesionalId = atencion?.profesional_responsable_id ?? '';
    } else {
      profesionalNombre = ctx.perfil.nombre;
      profesionalId = ctx.perfil.id;
    }

    const profesionalHtml = `
      <label class="form-label">Profesional responsable <span class="rodeo-required">*</span></label>
      <p style="font-size:14px;margin:0 0 16px;color:var(--text)">
        ${escapeHtml(profesionalNombre)}
        ${!esEdicion ? '<em style="color:var(--faint);font-size:12px"> (completado automáticamente)</em>' : ''}
      </p>
      <input type="hidden" name="profesional_responsable_id" value="${profesionalId}">`;

    const estadoHtml = esEdicion
      ? `<label class="form-label" style="margin-top:12px">Estado</label>
         <select class="form-field" name="estado">
           <option value="abierta" ${(atencion?.estado ?? 'abierta') === 'abierta' ? 'selected' : ''}>Abierta</option>
           <option value="cerrada" ${atencion?.estado === 'cerrada' ? 'selected' : ''}>Cerrada</option>
         </select>`
      : '';

    contenedor.innerHTML = `
      <div class="rodeo-card">
        <div class="rodeo-view-header">
          <h2>${esEdicion ? 'Editar Atención Clínica' : 'Nueva Atención Clínica'}</h2>
          <a href="#atenciones" class="rodeo-btn">← Volver</a>
        </div>

        <div id="atencion-success" style="display:none;background:#d4edda;color:#1a5c2a;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:13px;font-weight:600">
          ✅ Atención guardada correctamente.
        </div>
        <div id="atencion-error" class="rodeo-error" style="display:none;margin-bottom:12px"></div>

        <form id="atencion-form" novalidate>

          <label class="form-label">Paciente Animal <span class="rodeo-required">*</span></label>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
            <select class="form-field" name="animal_id" id="atencion-animal" style="flex:1;margin-bottom:0">
              ${animalesOpts}
            </select>
            ${!esEdicion ? '<a id="btn-nuevo-paciente" href="#animales/nuevo" class="rodeo-btn" style="white-space:nowrap;flex-shrink:0;font-size:12px;padding:8px 14px">+ Nuevo</a>' : ''}
          </div>

          <label class="form-label">Lote (opcional)</label>
          <select class="form-field" name="lote_id">
            ${lotesOpts}
          </select>

          <label class="form-label">Visita de terreno relacionada (opcional)</label>
          <select class="form-field" name="visita_id">
            ${visitasOpts}
          </select>

          ${profesionalHtml}

          <div style="display:flex;gap:12px">
            <div style="flex:1">
              <label class="form-label">Fecha <span class="rodeo-required">*</span></label>
              <input class="form-field" type="date" name="fecha" value="${toDateOnly(atencion?.fecha) || hoy}" required>
            </div>
            <div style="flex:1">
              <label class="form-label">Hora <span class="rodeo-required">*</span></label>
              <input class="form-field" type="time" name="hora" value="${atencion?.hora?.slice(0, 5) ?? horaActual}" required>
            </div>
          </div>

          <label class="form-label" style="margin-top:4px">Motivo de consulta <span class="rodeo-required">*</span></label>
          <textarea class="act-textarea" name="motivo" rows="3" style="width:100%;margin-bottom:16px" required>${atencion?.motivo ? escapeHtml(atencion.motivo) : ''}</textarea>

          <label class="form-label">Antecedentes <span class="rodeo-required">*</span></label>
          <textarea class="act-textarea" name="antecedentes" rows="3" style="width:100%;margin-bottom:16px" required>${atencion?.antecedentes ? escapeHtml(atencion.antecedentes) : ''}</textarea>

          <label class="form-label">Examen / Hallazgos (opcional)</label>
          <textarea class="act-textarea" name="examen" rows="3" style="width:100%;margin-bottom:16px">${atencion?.examen ? escapeHtml(atencion.examen) : ''}</textarea>

          <label class="form-label">Diagnóstico <span class="rodeo-required">*</span></label>
          <textarea class="act-textarea" name="diagnostico" rows="3" style="width:100%;margin-bottom:16px" required>${atencion?.diagnostico ? escapeHtml(atencion.diagnostico) : ''}</textarea>

          <label class="form-label">Tratamiento e indicaciones (opcional)</label>
          <textarea class="act-textarea" name="tratamiento" rows="3" style="width:100%;margin-bottom:16px">${atencion?.tratamiento ? escapeHtml(atencion.tratamiento) : ''}</textarea>

          <label class="form-label">Exámenes / estudios (opcional)</label>
          <textarea class="act-textarea" name="examenes_estudios" rows="2" style="width:100%;margin-bottom:16px">${atencion?.examenes_estudios ? escapeHtml(atencion.examenes_estudios) : ''}</textarea>

          <label class="form-label">Observaciones (opcional)</label>
          <textarea class="act-textarea" name="observaciones" rows="3" style="width:100%;margin-bottom:16px">${atencion?.observaciones ? escapeHtml(atencion.observaciones) : ''}</textarea>

          ${estadoHtml}

          <label class="form-label" style="margin-top:${esEdicion ? '12px' : '0'}">Próxima visita (opcional)</label>
          <input class="form-field" type="date" name="proxima_visita" value="${toDateOnly(atencion?.proxima_visita)}">

          <p class="form-hint" style="color:var(--faint);font-size:12px;margin:-6px 0 14px">
            📎 Adjuntos fotográficos: disponibles en una próxima versión (BIT-13).
          </p>

          <div class="rodeo-form-acciones">
            <button type="submit" class="rodeo-btn rodeo-btn-primary" id="atencion-submit">
              ${esEdicion ? 'Guardar cambios' : 'Guardar atención'}
            </button>
            <a href="#atenciones" class="rodeo-link-btn">Volver al listado</a>
          </div>
        </form>
      </div>

      <div id="atencion-historial"></div>`;

    const historialEl = document.getElementById('atencion-historial');
    const animalSelect = document.getElementById('atencion-animal');

    if (selectedAnimalId) {
      renderHistorial(historialEl, selectedAnimalId, ctx.establecimientoActivoId, id ?? null);
    }

    animalSelect.addEventListener('change', () => {
      renderHistorial(
        historialEl,
        animalSelect.value || null,
        ctx.establecimientoActivoId,
        id ?? null
      );
    });

    const btnNuevo = document.getElementById('btn-nuevo-paciente');
    if (btnNuevo) {
      btnNuevo.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.setItem('_atenciones_return', 'atenciones/nueva');
        location.hash = '#animales/nuevo';
      });
    }

    document.getElementById('atencion-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errorEl = document.getElementById('atencion-error');
      const successEl = document.getElementById('atencion-success');
      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const campos = {
        establecimiento_id: ctx.establecimientoActivoId,
        animal_id: fd.get('animal_id') || null,
        lote_id: fd.get('lote_id') || null,
        visita_id: fd.get('visita_id') || null,
        profesional_responsable_id: fd.get('profesional_responsable_id') || null,
        fecha: fd.get('fecha'),
        hora: fd.get('hora'),
        motivo: fd.get('motivo') ?? '',
        antecedentes: fd.get('antecedentes') ?? '',
        examen: fd.get('examen') ?? '',
        diagnostico: fd.get('diagnostico') ?? '',
        tratamiento: fd.get('tratamiento') ?? '',
        examenes_estudios: fd.get('examenes_estudios') ?? '',
        observaciones: fd.get('observaciones') ?? '',
        estado: fd.get('estado') ?? 'abierta',
        proxima_visita: fd.get('proxima_visita'),
      };

      const showError = (msg) => { errorEl.textContent = msg; errorEl.style.display = ''; };

      if (!campos.animal_id) return showError('El Paciente Animal es obligatorio.');
      if (!campos.profesional_responsable_id) return showError('El Profesional responsable es obligatorio.');
      if (!campos.fecha) return showError('La fecha es obligatoria.');
      if (!campos.hora) return showError('La hora es obligatoria.');
      if (!campos.motivo.trim()) return showError('El motivo de consulta es obligatorio.');
      if (!campos.antecedentes.trim()) return showError('Los antecedentes son obligatorios.');
      if (!campos.diagnostico.trim()) return showError('El diagnóstico es obligatorio.');

      const submitBtn = document.getElementById('atencion-submit');
      const textoBotonNormal = esEdicion ? 'Guardar cambios' : 'Guardar atención';
      const restaurarBoton = () => {
        submitBtn.disabled = false;
        submitBtn.textContent = textoBotonNormal;
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';

      try {
        if (esEdicion) {
          await actualizarAtencion(id, campos);
          location.hash = '#atenciones';
        } else {
          await crearAtencion(campos);
          successEl.style.display = '';
          setTimeout(() => { location.hash = '#atenciones/nueva'; }, 2000);
        }
      } catch (err) {
        showError('Error al guardar: ' + err.message);
      } finally {
        restaurarBoton();
      }
    });
  } catch (err) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar el formulario: ${escapeHtml(err.message)}</p></div>`;
  }
}
