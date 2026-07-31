import { getJornada, crearJornada, actualizarJornada } from '../../services/jornadas.js';
import { escapeHtml } from '../../dashboard.js';

export async function mountJornadaForm(contenedor, ctx, id) {
  let jornada = null;

  if (id) {
    contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';
    try {
      jornada = await getJornada(id);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!jornada) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Jornada no encontrada.</p></div>`;
      return;
    }
  }

  // jornadas_update en BIT-04 es estrictamente auth.uid() = profesional_id,
  // sin excepción para Administrador — si no es propia, se muestra de solo
  // lectura en vez de ofrecer un botón que Supabase va a rechazar.
  const soloLectura = jornada && jornada.profesional_id !== ctx.perfil.id;
  const hoy = new Date().toISOString().slice(0, 10);
  const disabled = soloLectura ? 'disabled' : '';

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${jornada ? (soloLectura ? 'Detalle de jornada' : 'Editar jornada') : 'Nueva jornada'}</h2>
      ${soloLectura ? '<p class="rodeo-hint">Esta jornada pertenece a otra persona — solo lectura.</p>' : ''}
      <form id="rodeo-jornada-form">
        <label class="form-label">Fecha</label>
        <input class="form-field" type="date" name="fecha" value="${jornada?.fecha ?? hoy}" ${disabled} required>

        <label class="form-label">Hora de llegada</label>
        <input class="form-field" type="time" name="hora_llegada" value="${jornada?.hora_llegada?.slice(0, 5) ?? ''}" ${disabled}>

        <label class="form-label">Hora de salida</label>
        <input class="form-field" type="time" name="hora_salida" value="${jornada?.hora_salida?.slice(0, 5) ?? ''}" ${disabled}>

        <label class="form-label">Notas</label>
        <textarea class="act-textarea" name="notas" rows="4" ${disabled}>${jornada?.notas ? escapeHtml(jornada.notas) : ''}</textarea>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          ${soloLectura ? '' : `<button type="submit" class="salida-btn">Guardar</button>`}
          <a href="#jornadas" class="rodeo-link-btn">Volver al listado</a>
        </div>
      </form>
    </div>
  `;

  if (soloLectura) return;

  document.getElementById('rodeo-jornada-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const campos = {
      fecha: fd.get('fecha'),
      hora_llegada: fd.get('hora_llegada'),
      hora_salida: fd.get('hora_salida'),
      notas: fd.get('notas'),
    };

    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    if (campos.hora_llegada && campos.hora_salida && campos.hora_salida <= campos.hora_llegada) {
      errorEl.textContent = 'La hora de salida debe ser posterior a la de llegada.';
      return;
    }

    try {
      if (jornada) await actualizarJornada(jornada.id, campos);
      else await crearJornada(campos, ctx.perfil.id);
      location.hash = '#jornadas';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
