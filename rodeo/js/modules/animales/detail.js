// Ficha MÍNIMA de Paciente (BIT-50): solo lectura, para poder consultar lo
// que registra Catastro Equino (y cualquier Paciente) desde la app.
// NO es la Ficha Clínica de BIT-38 (código PAC-XXXXX, historial, Atenciones,
// Observaciones, evolución) -- eso queda fuera a propósito.

import { getAnimal, getFotoUrlFirmada } from './services.js';
import { LABEL_ESPECIE, LABEL_SEXO, tituloPaciente } from './labels.js';
import { escapeHtml } from '../../dashboard.js';

const NO_INFORMADO = 'No informado';

function campo(etiqueta, valor, { vacio = NO_INFORMADO } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

export async function mountAnimalDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let animal;
  try {
    animal = await getAnimal(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar el Paciente: ${escapeHtml(e.message)}</p><a href="#animales" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!animal) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Paciente no encontrado.</p><a href="#animales" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  const puedeEditar = ctx.perfil?.rol !== 'OPERADOR_CAMPO';
  // Mismo origen que el selector del header (ya filtrado por RLS): no se
  // agrega una consulta ni un join extra sobre `establecimientos`.
  const establecimiento = ctx.establecimientos.find((e) => e.id === animal.establecimiento_actual_id);

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>${escapeHtml(tituloPaciente(animal))}</h2>
        ${puedeEditar ? `<a class="rodeo-btn" href="#animales/editar/${animal.id}">Editar</a>` : ''}
      </div>

      <div class="rodeo-ficha-foto" id="ficha-foto">
        ${animal.foto_path ? '<p class="rodeo-loading">Cargando fotografía…</p>' : '<p class="rodeo-ficha-vacio">Sin fotografía</p>'}
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Número de identificación', animal.numero_identificacion, { vacio: 'Sin identificación visible' })}
        ${campo('Nombre', animal.nombre)}
        ${campo('Especie', LABEL_ESPECIE[animal.especie] ?? animal.especie)}
        ${campo('Sexo', LABEL_SEXO[animal.sexo] ?? animal.sexo)}
        ${campo('Pelaje', animal.pelaje)}
        ${campo('Edad aproximada', animal.edad_aproximada_anios !== null && animal.edad_aproximada_anios !== undefined
          ? `${animal.edad_aproximada_anios} ${animal.edad_aproximada_anios === 1 ? 'año' : 'años'}`
          : null, { vacio: 'No informada' })}
        ${campo('Fecha de nacimiento', animal.fecha_nacimiento)}
        ${campo('Establecimiento actual', establecimiento?.nombre)}
        ${campo('Tutor Responsable', animal.personas?.nombre)}
      </div>
      ${animal.notas ? `<div class="rodeo-ficha-campo"><span class="form-label">Notas</span><div style="white-space:pre-wrap">${escapeHtml(animal.notas)}</div></div>` : ''}

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#animales" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;

  // La foto se resuelve DESPUÉS de dibujar la ficha: si Storage tarda o
  // falla, el resto de los datos ya está visible.
  if (animal.foto_path) {
    const fotoEl = document.getElementById('ficha-foto');
    const url = await getFotoUrlFirmada(animal.foto_path);
    if (!fotoEl.isConnected) return; // el usuario ya navegó a otra vista
    if (!url) {
      fotoEl.innerHTML = '<p class="rodeo-error">No se pudo cargar la fotografía.</p>';
      return;
    }
    const img = document.createElement('img');
    img.className = 'rodeo-ficha-img';
    img.alt = `Fotografía de ${tituloPaciente(animal)}`;
    img.addEventListener('error', () => {
      fotoEl.innerHTML = '<p class="rodeo-error">No se pudo cargar la fotografía.</p>';
    });
    img.src = url;
    fotoEl.replaceChildren(img);
  }
}
