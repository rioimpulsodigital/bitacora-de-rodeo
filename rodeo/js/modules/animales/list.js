import { listAnimales } from './services.js';
import { LABEL_ESPECIE, tituloPaciente } from './labels.js';
import { escapeHtml } from '../../dashboard.js';

export async function mountAnimalesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando pacientes…</p>';

  let animales;
  try {
    animales = await listAnimales(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar pacientes: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const puedeEditar = ctx.perfil?.rol !== 'OPERADOR_CAMPO';

  // Un Paciente puede no tener Nombre (Catastro Equino): se muestra el
  // nombre si existe, o la identificación, y la identificación como dato
  // secundario cuando hay ambos -- así dos caballos sin nombre se distinguen.
  const filas = animales.map((a) => {
    const tieneNombre = !!a.nombre?.trim();
    const tieneId = !!a.numero_identificacion?.trim();
    const secundario = tieneNombre && tieneId
      ? `<div class="rodeo-celda-secundaria">ID: ${escapeHtml(a.numero_identificacion)}</div>`
      : (!tieneNombre && !tieneId ? '<div class="rodeo-celda-secundaria">Sin identificación visible</div>' : '');
    const titulo = tieneNombre || tieneId ? escapeHtml(tituloPaciente(a)) : 'Sin nombre';
    return `
    <tr>
      <td><a class="rodeo-celda-principal" href="#animales/ver/${a.id}">${titulo}</a>${secundario}</td>
      <td>${escapeHtml(LABEL_ESPECIE[a.especie] ?? a.especie)}</td>
      <td>${escapeHtml(a.personas?.nombre ?? '—')}</td>
      <td class="rodeo-table-acciones">
        <a href="#animales/ver/${a.id}">Ver</a>
        ${puedeEditar ? `<a href="#animales/editar/${a.id}">Editar</a>` : ''}
      </td>
    </tr>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Pacientes Animales</h2>
        <div style="display:flex;align-items:center;gap:10px">
          <a class="rodeo-btn" href="#animales/nuevo">+ Nuevo Paciente</a>
          <a href="#animales/lotes" class="rodeo-link-btn">📦 Lotes</a>
        </div>
      </div>
      ${animales.length === 0
        ? '<p>No hay pacientes registrados todavía.</p>'
        : `<div class="rodeo-table-wrap"><table class="rodeo-table">
             <thead><tr><th>Paciente</th><th>Especie</th><th>Tutor</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table></div>`
      }
    </div>`;
}
