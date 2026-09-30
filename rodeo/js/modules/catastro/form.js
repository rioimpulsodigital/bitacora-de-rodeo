import { crearEquinoCatastro, validarFoto } from './services.js';
import { tieneCatastroEquino } from '../../services/establecimientos.js';
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

  // Protección real de la ruta (BIT-50): ocultar el menú no alcanza, #catastro
  // puede escribirse a mano o quedar abierto al cambiar de establecimiento.
  if (!tieneCatastroEquino(establecimientoActivo)) {
    contenedor.innerHTML = `
      <div class="rodeo-card">
        <h2>🐴 Catastro Equino</h2>
        <p class="rodeo-error">Catastro Equino no está habilitado para <strong>${escapeHtml(establecimientoActivo.nombre)}</strong>. Elegí otro establecimiento arriba o volvé al listado de Pacientes.</p>
        <a href="#animales" class="rodeo-link-btn" style="margin-left:0">Ir a Pacientes</a>
      </div>`;
    return;
  }

  const nombreEstablecimiento = establecimientoActivo.nombre;

  const sexoRadios = SEXO_OPTS.map(
    (o) => `
      <label class="rodeo-catastro-pill">
        <input type="radio" name="sexo" value="${o.value}">
        <span>${o.label}</span>
      </label>`
  ).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-catastro-form">
      <h2>🐴 Catastro Equino — Nuevo Paciente</h2>

      <div class="rodeo-catastro-establecimiento">
        Establecimiento activo: <strong>${escapeHtml(nombreEstablecimiento)}</strong>
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
        <div class="rodeo-catastro-foto-acciones">
          <button type="button" class="rodeo-catastro-foto-btn" id="cat-foto-camara-btn">📷 Sacar foto</button>
          <button type="button" class="rodeo-catastro-foto-btn" id="cat-foto-galeria-btn">🖼️ Elegir de la galería</button>
        </div>
        <!-- Dos inputs a propósito: 'capture' fuerza la cámara en Android/iOS y
             con un solo input no hay forma portable de ofrecer también galería. -->
        <input type="file" accept="image/*" capture="environment" id="cat-foto-camara" hidden>
        <input type="file" accept="image/*" id="cat-foto-galeria" hidden>
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
  const fotoCamaraInput = document.getElementById('cat-foto-camara');
  const fotoGaleriaInput = document.getElementById('cat-foto-galeria');
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
    fotoCamaraInput.value = '';
    fotoGaleriaInput.value = '';
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = null;
    fotoPreview.src = '';
    fotoPreview.style.display = 'none';
    fotoQuitarBtn.style.display = 'none';
  }

  // Cámara y galería comparten el mismo manejo: la última elección gana.
  function alElegirFoto(input, otroInput) {
    const file = input.files?.[0] ?? null;
    if (!file) return; // el usuario canceló el selector: se conserva la foto previa
    const problema = validarFoto(file);
    if (problema) {
      input.value = '';
      errorEl.textContent = problema;
      return;
    }
    errorEl.textContent = '';
    otroInput.value = '';
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoFile = file;
    fotoPreviewUrl = URL.createObjectURL(file);
    fotoPreview.src = fotoPreviewUrl;
    fotoPreview.style.display = '';
    fotoQuitarBtn.style.display = '';
  }

  document.getElementById('cat-foto-camara-btn').addEventListener('click', () => fotoCamaraInput.click());
  document.getElementById('cat-foto-galeria-btn').addEventListener('click', () => fotoGaleriaInput.click());
  fotoCamaraInput.addEventListener('change', () => alElegirFoto(fotoCamaraInput, fotoGaleriaInput));
  fotoGaleriaInput.addEventListener('change', () => alElegirFoto(fotoGaleriaInput, fotoCamaraInput));

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
      const creado = await crearEquinoCatastro(campos, establecimientoId);
      estadoBoton = 'saved';
      aplicarEstadoBoton();
      successEl.textContent = `✓ Guardado — ${creado.numero_identificacion ?? 'sin identificación'}. Podés cargar el próximo caballo.`;
      successEl.style.display = '';
      setTimeout(() => {
        successEl.style.display = 'none';
        resetearParaProximoCaballo();
      }, 1500);
    } catch (err) {
      // ErrorCatastro ya trae mensaje en español (y el error técnico en
      // consola); cualquier otra cosa inesperada no se muestra cruda.
      errorEl.textContent = err?.name === 'ErrorCatastro'
        ? err.message
        : 'Ocurrió un error inesperado al guardar. Intentá de nuevo.';
      if (err?.name !== 'ErrorCatastro') console.error('[Catastro Equino] error inesperado:', err);
      estadoBoton = 'dirty';
      aplicarEstadoBoton();
    }
  });
}
