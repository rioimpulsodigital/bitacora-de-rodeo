import { resolverTutorMunicipal, crearEquinoCatastro } from './services.js';
import { escapeHtml } from '../../dashboard.js';

const SEXO_OPTS = [
  { value: 'macho', label: 'Macho' },
  { value: 'hembra', label: 'Hembra' },
  { value: 'no_determinado', label: 'No determinado' },
];

export async function mountCatastroForm(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  const establecimientoId = ctx.establecimientoActivoId;
  const establecimientoActivo = ctx.establecimientos.find((e) => e.id === establecimientoId);

  if (!establecimientoId || !establecimientoActivo) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No hay un establecimiento activo. Elegí un establecimiento arriba antes de continuar.</p></div>`;
    return;
  }

  let tutorId;
  try {
    tutorId = await resolverTutorMunicipal(establecimientoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al preparar el catastro: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const nombreEstablecimiento = establecimientoActivo.nombre;
  const pareceDolly = /doll?y/i.test(nombreEstablecimiento);

  const sexoRadios = SEXO_OPTS.map(
    (o) => `
      <label class="rodeo-catastro-pill">
        <input type="radio" name="sexo" value="${o.value}">
        <span>${o.label}</span>
      </label>`
  ).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-catastro-form">
      <h2>🐴 Catastro Fundación Dolly — Nuevo Paciente</h2>

      <div class="rodeo-catastro-establecimiento ${pareceDolly ? '' : 'rodeo-catastro-establecimiento-alerta'}">
        Establecimiento activo: <strong>${escapeHtml(nombreEstablecimiento)}</strong>
        ${pareceDolly ? '' : '<br>⚠️ Este nombre no parece "Fundación Dolly". Si corresponde, cambiá el establecimiento activo arriba antes de guardar.'}
      </div>

      <form id="catastro-form">
        <label class="form-label">Número de identificación</label>
        <input class="form-field" type="text" id="cat-numero-id" name="numero_identificacion" placeholder="Caravana, tatuaje, microchip…" autocomplete="off">
        <label class="form-check-row">
          <input type="checkbox" id="cat-sin-id">
          <span>Sin identificación visible</span>
        </label>

        <label class="form-label">Pelaje</label>
        <input class="form-field" type="text" name="pelaje" placeholder="Ej: zaino, tobiano, blanco…" autocomplete="off">

        <label class="form-label">Sexo</label>
        <div class="rodeo-catastro-pill-group">${sexoRadios}</div>

        <label class="form-label" style="margin-top:16px">Edad aproximada (años)</label>
        <input class="form-field" type="number" name="edad_aproximada_anios" min="0" max="60" inputmode="numeric" placeholder="Aproximada, no hace falta precisión">

        <label class="form-label">Fotografía</label>
        <input class="rodeo-catastro-foto-input" type="file" accept="image/*" capture="environment" id="cat-foto">
        <img id="cat-foto-preview" class="rodeo-catastro-foto-preview" style="display:none" alt="Vista previa">
        <button type="button" class="rodeo-link-btn" id="cat-foto-quitar" style="display:none">Quitar foto</button>

        <div id="catastro-error" class="rodeo-error"></div>
        <div id="catastro-success" class="rodeo-msg-ok" style="display:none"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn" id="catastro-submit" disabled>Sin cambios</button>
        </div>
        <a href="#animales" class="rodeo-link-btn">Volver al listado de Pacientes</a>
      </form>
    </div>`;

  const formEl = document.getElementById('catastro-form');
  const numeroIdInput = document.getElementById('cat-numero-id');
  const sinIdCheckbox = document.getElementById('cat-sin-id');
  const fotoInput = document.getElementById('cat-foto');
  const fotoPreview = document.getElementById('cat-foto-preview');
  const fotoQuitarBtn = document.getElementById('cat-foto-quitar');
  const submitBtn = document.getElementById('catastro-submit');
  const errorEl = document.getElementById('catastro-error');
  const successEl = document.getElementById('catastro-success');

  let fotoFile = null;
  let fotoPreviewUrl = null;

  // Estado del botón: mismo patrón transversal que atenciones/form.js --
  // 'pristine' (sin cambios) | 'dirty' | 'saving' | 'saved'.
  let estadoBoton = 'pristine';

  function aplicarEstadoBoton() {
    submitBtn.classList.remove('rodeo-btn-guardado');
    if (estadoBoton === 'pristine') {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sin cambios';
    } else if (estadoBoton === 'dirty') {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar';
    } else if (estadoBoton === 'saving') {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';
    } else if (estadoBoton === 'saved') {
      submitBtn.disabled = true;
      submitBtn.textContent = '✓ Guardado';
      submitBtn.classList.add('rodeo-btn-guardado');
    }
  }

  function marcarDirty() {
    if (estadoBoton === 'saving') return;
    if (estadoBoton !== 'dirty') {
      estadoBoton = 'dirty';
      aplicarEstadoBoton();
    }
  }

  formEl.addEventListener('input', marcarDirty);
  formEl.addEventListener('change', marcarDirty);

  sinIdCheckbox.addEventListener('change', () => {
    numeroIdInput.disabled = sinIdCheckbox.checked;
    if (sinIdCheckbox.checked) numeroIdInput.value = '';
  });

  function limpiarFoto() {
    fotoFile = null;
    fotoInput.value = '';
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = null;
    fotoPreview.src = '';
    fotoPreview.style.display = 'none';
    fotoQuitarBtn.style.display = 'none';
  }

  fotoInput.addEventListener('change', () => {
    const file = fotoInput.files?.[0] ?? null;
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoFile = file;
    if (file) {
      fotoPreviewUrl = URL.createObjectURL(file);
      fotoPreview.src = fotoPreviewUrl;
      fotoPreview.style.display = '';
      fotoQuitarBtn.style.display = '';
    } else {
      fotoPreviewUrl = null;
      fotoPreview.style.display = 'none';
      fotoQuitarBtn.style.display = 'none';
    }
  });

  fotoQuitarBtn.addEventListener('click', () => {
    limpiarFoto();
    marcarDirty();
  });

  function resetearParaProximoCaballo() {
    formEl.reset();
    numeroIdInput.disabled = false;
    limpiarFoto();
    estadoBoton = 'pristine';
    aplicarEstadoBoton();
    errorEl.textContent = '';
    numeroIdInput.focus();
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    successEl.style.display = 'none';

    const fd = new FormData(formEl);
    const edadRaw = fd.get('edad_aproximada_anios');

    const campos = {
      numeroIdentificacion: fd.get('numero_identificacion'),
      sinIdentificacion: sinIdCheckbox.checked,
      pelaje: fd.get('pelaje'),
      sexo: fd.get('sexo') || null,
      edadAproximadaAnios: edadRaw ? parseInt(edadRaw, 10) : null,
      fotoFile,
    };

    estadoBoton = 'saving';
    aplicarEstadoBoton();

    try {
      const creado = await crearEquinoCatastro(campos, establecimientoId, tutorId);
      estadoBoton = 'saved';
      aplicarEstadoBoton();
      successEl.textContent = `✓ Guardado — ${creado.numero_identificacion ?? 'sin identificación'}. Podés cargar el próximo caballo.`;
      successEl.style.display = '';
      setTimeout(() => {
        successEl.style.display = 'none';
        resetearParaProximoCaballo();
      }, 1500);
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
      estadoBoton = 'dirty';
      aplicarEstadoBoton();
    }
  });
}
