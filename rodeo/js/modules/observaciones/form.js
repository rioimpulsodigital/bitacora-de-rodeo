import { getObservacion, crearObservacion, actualizarObservacion, listVisitasParaSelector, listAnimalesParaSelector } from './services.js';
import { escapeHtml } from '../../dashboard.js';

function formatFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

const LABEL_TIPO = {
  programada: 'Programada',
  seguimiento: 'Seguimiento',
  emergencia: 'Emergencia',
  control: 'Control',
  otro: 'Otro',
};

export async function mountObservacionForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let observacion = null;
  if (id) {
    try {
      observacion = await getObservacion(id);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!observacion) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Observación no encontrada.</p></div>`;
      return;
    }
  }

  const activoId = ctx.establecimientoActivoId;

  let visitas, animales;
  try {
    [visitas, animales] = await Promise.all([
      listVisitasParaSelector(activoId),
      listAnimalesParaSelector(activoId),
    ]);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar datos: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const visitaSeleccionada = observacion?.visita_id ?? visitas[0]?.id ?? '';
  const animalSeleccionado = observacion?.animal_id ?? '';

  const visitaOpts = visitas.map((v) => {
    const label = `${formatFecha(v.fecha)} — ${LABEL_TIPO[v.tipo] ?? v.tipo} (${v.estado === 'abierta' ? 'Abierta' : 'Cerrada'})`;
    return `<option value="${v.id}" ${visitaSeleccionada === v.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  const animalOpts = [
    `<option value="" ${!animalSeleccionado ? 'selected' : ''}>— Sin sujeto —</option>`,
    ...animales.map((a) => `<option value="${a.id}" ${animalSeleccionado === a.id ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`),
  ].join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${observacion ? 'Editar Observación de Campo' : 'Nueva Observación de Campo'}</h2>
      <form id="rodeo-observacion-form">

        <label class="form-label">Visita <span class="rodeo-required">*</span></label>
        ${visitas.length === 0
          ? '<p class="rodeo-error">No hay visitas disponibles para este establecimiento.</p>'
          : `<select class="form-field" name="visita_id" required>${visitaOpts}</select>`
        }

        <label class="form-label">Descripción <span class="rodeo-required">*</span></label>
        <textarea class="act-textarea" name="descripcion" rows="4" required>${observacion ? escapeHtml(observacion.descripcion) : ''}</textarea>

        <label class="form-label">Paciente Animal (opcional)</label>
        <select class="form-field" name="animal_id">${animalOpts}</select>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn"${visitas.length === 0 ? ' disabled' : ''}>Guardar</button>
          <a href="#observaciones" class="rodeo-link-btn">Volver al listado</a>
        </div>
      </form>
    </div>`;

  document.getElementById('rodeo-observacion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    const campos = {
      visita_id: fd.get('visita_id'),
      descripcion: fd.get('descripcion') ?? '',
      animal_id: fd.get('animal_id') || null,
    };

    if (!campos.visita_id) { errorEl.textContent = 'Debe seleccionar una visita.'; return; }
    if (!campos.descripcion.trim()) { errorEl.textContent = 'La descripción es obligatoria.'; return; }

    try {
      if (observacion) {
        await actualizarObservacion(observacion.id, campos);
      } else {
        await crearObservacion(campos);
      }
      location.hash = '#observaciones';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
