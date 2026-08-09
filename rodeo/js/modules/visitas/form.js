import { getVisita, crearVisita, actualizarVisita } from './services.js';
import { escapeHtml } from '../../dashboard.js';

export async function mountVisitaForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let visita = null;
  if (id) {
    try {
      visita = await getVisita(id);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!visita) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Visita no encontrada.</p></div>`;
      return;
    }
  }

  const activoId = ctx.establecimientoActivoId;
  const establecimientos = ctx.establecimientos;
  const seleccionadoId = visita?.establecimiento_id ?? activoId;

  const establecimientosOpts = establecimientos.map(
    (e) => `<option value="${e.id}" ${seleccionadoId === e.id ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`
  ).join('');

  const hoy = new Date().toISOString().split('T')[0];

  const TIPOS = ['programada', 'seguimiento', 'emergencia', 'control', 'otro'];
  const tipoOpts = TIPOS.map(
    (t) => `<option value="${t}" ${(visita?.tipo ?? 'programada') === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${visita ? 'Editar Visita' : 'Nueva Visita'}</h2>
      <form id="rodeo-visita-form">

        <label class="form-label">Fecha <span class="rodeo-required">*</span></label>
        <input class="form-field" type="date" name="fecha" value="${visita?.fecha ?? hoy}" required>

        <label class="form-label">Tipo de visita <span class="rodeo-required">*</span></label>
        <select class="form-field" name="tipo" required>
          ${tipoOpts}
        </select>

        <label class="form-label">Establecimiento <span class="rodeo-required">*</span></label>
        <select class="form-field" name="establecimiento_id" required>
          ${establecimientosOpts}
        </select>

        <label class="form-label">Hora de inicio (opcional)</label>
        <input class="form-field" type="time" name="hora_inicio" value="${visita?.hora_inicio?.slice(0, 5) ?? ''}">

        <label class="form-label">Hora de fin (opcional)</label>
        <input class="form-field" type="time" name="hora_fin" value="${visita?.hora_fin?.slice(0, 5) ?? ''}">

        ${visita ? `
        <label class="form-label">Estado</label>
        <select class="form-field" name="estado">
          <option value="abierta" ${visita.estado === 'abierta' ? 'selected' : ''}>Abierta</option>
          <option value="cerrada" ${visita.estado === 'cerrada' ? 'selected' : ''}>Cerrada</option>
        </select>` : ''}

        <label class="form-label">Notas (opcional)</label>
        <textarea class="act-textarea" name="notas" rows="3">${visita?.notas ? escapeHtml(visita.notas) : ''}</textarea>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn">Guardar</button>
          <a href="#visitas" class="rodeo-link-btn">Volver al listado</a>
        </div>
      </form>
    </div>`;

  document.getElementById('rodeo-visita-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    const campos = {
      fecha: fd.get('fecha'),
      tipo: fd.get('tipo'),
      establecimiento_id: fd.get('establecimiento_id'),
      hora_inicio: fd.get('hora_inicio'),
      hora_fin: fd.get('hora_fin'),
      estado: fd.get('estado') ?? 'abierta',
      notas: fd.get('notas'),
    };

    if (!campos.fecha) { errorEl.textContent = 'La fecha es obligatoria.'; return; }
    if (!campos.tipo) { errorEl.textContent = 'El tipo de visita es obligatorio.'; return; }
    if (!campos.establecimiento_id) { errorEl.textContent = 'El establecimiento es obligatorio.'; return; }

    try {
      if (visita) {
        await actualizarVisita(visita.id, campos);
      } else {
        await crearVisita(campos);
      }
      location.hash = '#visitas';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
