import {
  getAnimal, crearAnimal, actualizarAnimal,
  listPersonas, crearPersona,
  listLotes, getLoteActivoDeAnimal, actualizarLoteDeAnimal,
  validarFoto, reemplazarFotoPaciente, getFotoUrlFirmada,
} from './services.js';
import { SEXO_OPTS } from './labels.js';
import { escapeHtml } from '../../dashboard.js';

const ESPECIES = [
  { value: 'equino',  label: 'Equino'  },
  { value: 'bovino',  label: 'Bovino'  },
  { value: 'ovino',   label: 'Ovino'   },
  { value: 'caprino', label: 'Caprino' },
  { value: 'canino',  label: 'Canino'  },
  { value: 'felino',  label: 'Felino'  },
  { value: 'otro',    label: 'Otro'    },
];

export async function mountAnimalForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  if (id && ctx.perfil?.rol === 'OPERADOR_CAMPO') {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No tenés permiso para editar Pacientes existentes.</p></div>`;
    return;
  }

  let animal = null;
  let loteActivo = null;

  if (id) {
    try {
      [animal, loteActivo] = await Promise.all([getAnimal(id), getLoteActivoDeAnimal(id)]);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!animal) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Paciente no encontrado.</p></div>`;
      return;
    }
  }

  let personas = [];
  let lotes = [];
  try {
    [personas, lotes] = await Promise.all([
      listPersonas(),
      listLotes(ctx.establecimientoActivoId),
    ]);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar datos: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const especiesOpts = ESPECIES.map(
    (e) => `<option value="${e.value}" ${animal?.especie === e.value ? 'selected' : ''}>${e.label}</option>`
  ).join('');

  const personasOpts = personas.map(
    (p) => `<option value="${p.id}" ${animal?.tutor_responsable_id === p.id ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`
  ).join('');

  const sexoOpts = [
    '<option value="">No informado</option>',
    ...SEXO_OPTS.map((o) => `<option value="${o.value}" ${animal?.sexo === o.value ? 'selected' : ''}>${o.label}</option>`),
  ].join('');

  const lotesOpts = [
    `<option value="">(Sin lote)</option>`,
    ...lotes.map(
      (l) => `<option value="${l.id}" ${loteActivo?.lote_id === l.id ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`
    ),
  ].join('');

  const hayPersonas = personas.length > 0;

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${animal ? 'Editar Paciente Animal' : 'Nuevo Paciente Animal'}</h2>
      <form id="rodeo-animal-form">

        <label class="form-label">Fotografía (opcional)</label>
        <div class="rodeo-ficha-foto" id="rodeo-foto-wrap">
          ${animal?.foto_path ? '<p class="rodeo-loading">Cargando fotografía…</p>' : (animal ? '<p class="rodeo-ficha-vacio">Sin fotografía</p>' : '')}
        </div>
        <div class="rodeo-paciente-foto-acciones">
          <button type="button" class="rodeo-paciente-foto-btn" id="rodeo-foto-camara-btn">📷 Sacar foto</button>
          <button type="button" class="rodeo-paciente-foto-btn" id="rodeo-foto-galeria-btn">🖼️ Elegir de la galería</button>
        </div>
        <!-- Dos inputs a propósito: 'capture' fuerza la cámara en Android/iOS
             y con un solo input no hay forma portable de ofrecer también
             galería (mismo patrón ya validado en modules/catastro/form.js). -->
        <input type="file" accept="image/*" capture="environment" id="rodeo-foto-camara" hidden>
        <input type="file" accept="image/*" id="rodeo-foto-galeria" hidden>
        <button type="button" class="rodeo-link-btn" id="rodeo-foto-cancelar" style="display:none;margin-left:0">Cancelar cambio de foto</button>
        <div id="rodeo-foto-error" class="rodeo-error" style="margin-bottom:12px"></div>

        <label class="form-label">Especie <span class="rodeo-required">*</span></label>
        <select class="form-field" name="especie" required>
          <option value="">Seleccionar especie…</option>
          ${especiesOpts}
        </select>

        <label class="form-label">Nombre (opcional)</label>
        <input class="form-field" type="text" name="nombre" value="${escapeHtml(animal?.nombre ?? '')}">

        <label class="form-label">Número de identificación (opcional)</label>
        <input class="form-field" type="text" name="numero_identificacion" value="${escapeHtml(animal?.numero_identificacion ?? '')}" placeholder="Caravana, tatuaje, microchip…" autocomplete="off">

        <label class="form-label">Sexo (opcional)</label>
        <select class="form-field" name="sexo">${sexoOpts}</select>

        <label class="form-label">Pelaje (opcional)</label>
        <input class="form-field" type="text" name="pelaje" value="${escapeHtml(animal?.pelaje ?? '')}" autocomplete="off">

        <label class="form-label">Edad aproximada en años (opcional)</label>
        <input class="form-field" type="number" name="edad_aproximada_anios" min="0" max="60" inputmode="numeric" value="${animal?.edad_aproximada_anios ?? ''}">

        <label class="form-label">Fecha de nacimiento (opcional)</label>
        <input class="form-field" type="date" name="fecha_nacimiento" value="${animal?.fecha_nacimiento ?? ''}">

        <label class="form-label">Notas</label>
        <textarea class="act-textarea" name="notas" rows="3" style="width:100%;margin-bottom:16px">${animal?.notas ? escapeHtml(animal.notas) : ''}</textarea>

        <label class="form-label">Tutor Responsable (opcional)</label>
        <select class="form-field" name="tutor_responsable_id" id="rodeo-tutor-select"
          ${!hayPersonas ? 'style="display:none"' : ''}>
          <option value="">No informado</option>
          ${personasOpts}
        </select>
        <button type="button" class="rodeo-link-btn" id="rodeo-tutor-toggle"
          style="margin-top:6px">+ Crear nuevo tutor</button>
        <p class="rodeo-hint" style="margin-top:6px">Si todavía no se conoce el tutor, dejalo en "No informado".</p>

        <div id="rodeo-tutor-inline" class="rodeo-inline-form" style="display:none">
          <p class="rodeo-hint" style="margin:0 0 10px">Nuevo Tutor Responsable</p>
          <label class="form-label">Nombre <span class="rodeo-required">*</span></label>
          <input class="form-field" type="text" id="rodeo-tutor-nombre">
          <label class="form-label">Teléfono</label>
          <input class="form-field" type="tel" id="rodeo-tutor-tel">
          <label class="form-label">Email</label>
          <input class="form-field" type="email" id="rodeo-tutor-email">
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <button type="button" class="salida-btn" id="rodeo-tutor-guardar">Guardar tutor</button>
            <button type="button" class="rodeo-link-btn" id="rodeo-tutor-cancelar">Cancelar</button>
          </div>
          <div id="rodeo-tutor-error" class="rodeo-error" style="margin-top:6px"></div>
        </div>

        <label class="form-label" style="margin-top:16px">Lote (opcional)</label>
        <select class="form-field" name="lote_id">
          ${lotesOpts}
        </select>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn">Guardar</button>
          <a href="#animales" class="rodeo-link-btn">Volver al listado</a>
        </div>
      </form>
    </div>`;

  // ── Lógica de foto (BIT-13) ───────────────────────────────────
  // Mismo patrón de cámara/galería ya validado en modules/catastro/form.js
  // (dos inputs ocultos, la última elección gana, preview local vía
  // createObjectURL). Diferencia respecto a Catastro: acá puede existir una
  // foto YA guardada (edición) -- "Cancelar cambio de foto" no significa
  // "sin foto", significa "volver a mostrar la foto original", nunca borra
  // nada hasta que se guarde el formulario.
  const fotoWrap        = document.getElementById('rodeo-foto-wrap');
  const fotoCamaraInput = document.getElementById('rodeo-foto-camara');
  const fotoGaleriaInput = document.getElementById('rodeo-foto-galeria');
  const fotoCancelarBtn = document.getElementById('rodeo-foto-cancelar');
  const fotoErrorEl     = document.getElementById('rodeo-foto-error');

  let fotoFile = null;
  let fotoPreviewUrl = null;

  function renderFotoVacia() {
    fotoWrap.innerHTML = '<p class="rodeo-ficha-vacio">Sin fotografía</p>';
  }

  function renderFotoImg(src, alt) {
    fotoWrap.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'rodeo-ficha-img';
    img.alt = alt;
    img.addEventListener('error', () => {
      fotoWrap.innerHTML = '<p class="rodeo-error">No se pudo cargar la fotografía.</p>';
    });
    img.src = src;
    fotoWrap.replaceChildren(img);
  }

  // La foto YA guardada se resuelve una sola vez, de forma asíncrona (igual
  // que detail.js) -- se guarda la URL para poder "cancelar" una selección
  // nueva sin tener que volver a pedirla.
  let urlFotoOriginal = null;
  if (animal?.foto_path) {
    getFotoUrlFirmada(animal.foto_path).then((url) => {
      if (!fotoWrap.isConnected) return; // el usuario ya navegó a otra vista
      urlFotoOriginal = url;
      if (fotoFile) return; // ya eligió una foto nueva mientras esto cargaba
      if (url) renderFotoImg(url, 'Fotografía actual del Paciente');
      else fotoWrap.innerHTML = '<p class="rodeo-error">No se pudo cargar la fotografía actual.</p>';
    });
  }

  function cancelarCambioFoto() {
    fotoFile = null;
    fotoCamaraInput.value = '';
    fotoGaleriaInput.value = '';
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = null;
    fotoCancelarBtn.style.display = 'none';
    fotoErrorEl.textContent = '';
    if (urlFotoOriginal) renderFotoImg(urlFotoOriginal, 'Fotografía actual del Paciente');
    else renderFotoVacia();
  }

  function alElegirFoto(input, otroInput) {
    const file = input.files?.[0] ?? null;
    if (!file) return; // el usuario canceló el selector: se conserva la foto previa
    const problema = validarFoto(file);
    if (problema) {
      input.value = '';
      fotoErrorEl.textContent = problema;
      return;
    }
    fotoErrorEl.textContent = '';
    otroInput.value = '';
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoFile = file;
    fotoPreviewUrl = URL.createObjectURL(file);
    renderFotoImg(fotoPreviewUrl, 'Vista previa de la foto nueva');
    fotoCancelarBtn.style.display = '';
  }

  document.getElementById('rodeo-foto-camara-btn').addEventListener('click', () => fotoCamaraInput.click());
  document.getElementById('rodeo-foto-galeria-btn').addEventListener('click', () => fotoGaleriaInput.click());
  fotoCamaraInput.addEventListener('change', () => alElegirFoto(fotoCamaraInput, fotoGaleriaInput));
  fotoGaleriaInput.addEventListener('change', () => alElegirFoto(fotoGaleriaInput, fotoCamaraInput));
  fotoCancelarBtn.addEventListener('click', cancelarCambioFoto);

  // ── Lógica de tutor inline ────────────────────────────────────
  const selectTutor  = document.getElementById('rodeo-tutor-select');
  const inlineDiv    = document.getElementById('rodeo-tutor-inline');
  const toggleBtn    = document.getElementById('rodeo-tutor-toggle');
  const cancelarBtn  = document.getElementById('rodeo-tutor-cancelar');
  const guardarBtn   = document.getElementById('rodeo-tutor-guardar');
  const tutorErrorEl = document.getElementById('rodeo-tutor-error');

  toggleBtn.addEventListener('click', () => {
    inlineDiv.style.display = '';
    toggleBtn.style.display = 'none';
  });

  cancelarBtn.addEventListener('click', () => {
    inlineDiv.style.display = 'none';
    toggleBtn.style.display = '';
    tutorErrorEl.textContent = '';
    document.getElementById('rodeo-tutor-nombre').value = '';
    document.getElementById('rodeo-tutor-tel').value = '';
    document.getElementById('rodeo-tutor-email').value = '';
  });

  guardarBtn.addEventListener('click', async () => {
    const nombre = document.getElementById('rodeo-tutor-nombre').value.trim();
    if (!nombre) { tutorErrorEl.textContent = 'El nombre es obligatorio.'; return; }
    tutorErrorEl.textContent = '';
    guardarBtn.disabled = true;
    try {
      const persona = await crearPersona(
        {
          nombre,
          telefono: document.getElementById('rodeo-tutor-tel').value,
          email: document.getElementById('rodeo-tutor-email').value,
        },
        ctx.establecimientoActivoId
      );
      const opt = document.createElement('option');
      opt.value = persona.id;
      opt.textContent = persona.nombre;
      opt.selected = true;
      selectTutor.appendChild(opt);
      selectTutor.style.display = '';
      inlineDiv.style.display = 'none';
      toggleBtn.style.display = '';
    } catch (err) {
      tutorErrorEl.textContent = 'Error al guardar tutor: ' + err.message;
    } finally {
      guardarBtn.disabled = false;
    }
  });

  // ── Submit del formulario principal ──────────────────────────
  document.getElementById('rodeo-animal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    const campos = {
      especie: fd.get('especie'),
      nombre: fd.get('nombre'),
      fecha_nacimiento: fd.get('fecha_nacimiento') || null,
      notas: fd.get('notas'),
      // Opcional (BIT-50/H-15): "No informado" = NULL.
      tutor_responsable_id: fd.get('tutor_responsable_id') || null,
      numero_identificacion: fd.get('numero_identificacion'),
      sexo: fd.get('sexo') || null,
      pelaje: fd.get('pelaje'),
      edad_aproximada_anios: fd.get('edad_aproximada_anios') ? parseInt(fd.get('edad_aproximada_anios'), 10) : null,
      establecimiento_actual_id: ctx.establecimientoActivoId,
    };

    if (!campos.especie) { errorEl.textContent = 'La especie es obligatoria.'; return; }
    if (campos.edad_aproximada_anios !== null && (Number.isNaN(campos.edad_aproximada_anios) || campos.edad_aproximada_anios < 0 || campos.edad_aproximada_anios > 60)) {
      errorEl.textContent = 'La edad aproximada debe estar entre 0 y 60 años.'; return;
    }

    const loteId = fd.get('lote_id') || null;

    // BIT-13: al crear, la foto necesita el establecimiento activo para
    // elegir la carpeta del bucket -- si todavía no hay ninguno elegido, se
    // avisa ANTES de intentar subir nada (mismo criterio que el resto del
    // formulario: nunca intentar una operación que la RLS va a rechazar de
    // todos modos, pero con un mensaje claro en vez de un error técnico).
    if (!animal && fotoFile && !ctx.establecimientoActivoId) {
      errorEl.textContent = 'Elegí un establecimiento activo antes de agregar una foto.';
      return;
    }

    try {
      if (animal) {
        await actualizarAnimal(animal.id, campos);
        await actualizarLoteDeAnimal(animal.id, loteId);
        // La foto se reemplaza DESPUÉS de guardar el resto de los datos, en
        // un paso aparte: si falla, el Paciente ya quedó guardado
        // correctamente -- nunca se corrompe por un problema de la foto.
        if (fotoFile) {
          try {
            await reemplazarFotoPaciente(animal.id, animal.establecimiento_actual_id, fotoFile);
          } catch (fotoErr) {
            errorEl.textContent = 'Los datos se guardaron, pero la foto no se pudo actualizar: ' + fotoErr.message;
            return;
          }
        }
        location.hash = '#animales';
      } else {
        const nuevo = await crearAnimal(campos, fotoFile);
        if (loteId) await actualizarLoteDeAnimal(nuevo.id, loteId);
        const returnTo = sessionStorage.getItem('_atenciones_return');
        if (returnTo) {
          sessionStorage.setItem('_atenciones_animal_id', nuevo.id);
          sessionStorage.removeItem('_atenciones_return');
          location.hash = '#' + returnTo;
        } else {
          location.hash = '#animales';
        }
      }
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
