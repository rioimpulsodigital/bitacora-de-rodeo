import { getJornada, crearJornada, actualizarJornada } from '../../services/jornadas.js';
import { escapeHtml } from '../../dashboard.js';

// Mismo bug corregido en operativa.js (BIT-61): `toISOString()` da la
// fecha en UTC, no en Argentina -- pasadas las 21:00 ART el default de
// este campo quedaba adelantado un día. Fecha explícita en
// America/Argentina/Buenos_Aires, no la zona del dispositivo.
function fechaHoyArgentina() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export async function mountJornadaForm(contenedor, ctx, id, { soloLecturaForzada = false } = {}) {
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

    // BIT-61 (corrección, Bren/KLIAM): una Jornada histórica pertenece a
    // UN establecimiento -- abrirla (Ver/Editar) desde un contexto activo
    // DISTINTO mezclaría datos de dos establecimientos en una misma
    // pantalla. Respuesta controlada en vez de auto-cambiar el
    // establecimiento activo (eso sería una decisión silenciosa del
    // sistema, no del usuario) o de redirigir sin explicación.
    if (jornada.establecimiento_id && jornada.establecimiento_id !== ctx.establecimientoActivoId) {
      const nombreEstablecimientoJornada = jornada.establecimientos?.nombre ?? 'otro establecimiento';
      contenedor.innerHTML = `
        <div class="rodeo-card">
          <p class="rodeo-error">Esta Jornada pertenece a <strong>${escapeHtml(nombreEstablecimientoJornada)}</strong>, no al establecimiento activo. Cambiá de establecimiento arriba para verla, o volvé al <a href="#jornadas/historial">historial</a>.</p>
        </div>`;
      return;
    }
  }

  // jornadas_update en BIT-04 es estrictamente auth.uid() = profesional_id,
  // sin excepción para Administrador — si no es propia, SIEMPRE de solo
  // lectura (si no, Supabase rechazaría el guardado). `soloLecturaForzada`
  // es la vía explícita "Ver" (BIT-57): deja consultar la propia Jornada
  // sin entrar a edición, sin tocar el permiso real de escritura.
  const esPropia = jornada && jornada.profesional_id === ctx.perfil.id;
  const soloLectura = soloLecturaForzada || (jornada && !esPropia);
  const hoy = fechaHoyArgentina();
  const disabled = soloLectura ? 'disabled' : '';

  // Establecimiento (BIT-61): inmutable una vez creada la Jornada -- acá
  // solo se muestra como texto, nunca como campo editable, ni siquiera al
  // editar fecha/horas/notas de una Jornada propia. Al crear una nueva
  // (vía el historial, no el flujo operativo) sí es obligatorio elegirlo.
  const campoEstablecimiento = jornada
    ? `<label class="form-label">Establecimiento</label>
       <p class="form-field" style="background:var(--surface2)">${escapeHtml(jornada.establecimientos?.nombre ?? '—')}</p>`
    : `<label class="form-label">Establecimiento <span class="rodeo-required">*</span></label>
       <select class="form-field" name="establecimiento_id" required>
         <option value="">Seleccionar establecimiento…</option>
         ${ctx.establecimientos.map((est) => `<option value="${est.id}" ${est.id === ctx.establecimientoActivoId ? 'selected' : ''}>${escapeHtml(est.nombre)}</option>`).join('')}
       </select>`;

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>${jornada ? (soloLectura ? 'Detalle de jornada' : 'Editar jornada') : 'Nueva jornada'}</h2>
        ${soloLectura && esPropia ? `<a class="rodeo-btn" href="#jornadas/editar/${jornada.id}">Editar</a>` : ''}
      </div>
      ${soloLectura && jornada && !esPropia ? '<p class="rodeo-hint">Esta jornada pertenece a otra persona — solo lectura.</p>' : ''}
      <form id="rodeo-jornada-form">
        ${campoEstablecimiento}

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
          <a href="#jornadas/historial" class="rodeo-link-btn">Volver al listado</a>
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
      establecimiento_id: fd.get('establecimiento_id'),
    };

    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    if (!jornada && !campos.establecimiento_id) {
      errorEl.textContent = 'El establecimiento es obligatorio.';
      return;
    }

    if (campos.hora_llegada && campos.hora_salida && campos.hora_salida <= campos.hora_llegada) {
      errorEl.textContent = 'La hora de salida debe ser posterior a la de llegada.';
      return;
    }

    try {
      if (jornada) await actualizarJornada(jornada.id, campos);
      else await crearJornada(campos, ctx.perfil.id);
      location.hash = '#jornadas/historial';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
