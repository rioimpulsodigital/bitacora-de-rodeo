import {
  getAnimal, crearAnimal, actualizarAnimal,
  listPersonas, crearPersona,
  listLotes, getLoteActivoDeAnimal, actualizarLoteDeAnimal,
} from './services.js';
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

        <label class="form-label">Especie <span class="rodeo-required">*</span></label>
        <select class="form-field" name="especie" required>
          <option value="">Seleccionar especie…</option>
          ${especiesOpts}
        </select>

        <label class="form-label">Nombre (opcional)</label>
        <input class="form-field" type="text" name="nombre" value="${escapeHtml(animal?.nombre ?? '')}">

        <label class="form-label">Fecha de nacimiento (opcional)</label>
        <input class="form-field" type="date" name="fecha_nacimiento" value="${animal?.fecha_nacimiento ?? ''}">

        <label class="form-label">Notas / Identificación (caravana, pelaje, etc.)</label>
        <textarea class="act-textarea" name="notas" rows="3" style="width:100%;margin-bottom:16px">${animal?.notas ? escapeHtml(animal.notas) : ''}</textarea>

        <label class="form-label">Tutor Responsable <span class="rodeo-required">*</span></label>
        <select class="form-field" name="tutor_responsable_id" id="rodeo-tutor-select"
          ${!hayPersonas ? 'style="display:none"' : ''}>
          <option value="">Seleccionar tutor…</option>
          ${personasOpts}
        </select>
        <button type="button" class="rodeo-link-btn" id="rodeo-tutor-toggle"
          style="margin-top:6px">+ Crear nuevo tutor</button>

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
      tutor_responsable_id: fd.get('tutor_responsable_id'),
      establecimiento_actual_id: ctx.establecimientoActivoId,
    };

    if (!campos.especie) { errorEl.textContent = 'La especie es obligatoria.'; return; }
    if (!campos.tutor_responsable_id) { errorEl.textContent = 'El tutor responsable es obligatorio.'; return; }

    const loteId = fd.get('lote_id') || null;

    try {
      if (animal) {
        await actualizarAnimal(animal.id, campos);
        await actualizarLoteDeAnimal(animal.id, loteId);
        location.hash = '#animales';
      } else {
        const nuevo = await crearAnimal(campos);
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
