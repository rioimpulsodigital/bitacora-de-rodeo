import { listAnimales } from './services.js';
import { escapeHtml } from '../../dashboard.js';

const LABEL_ESPECIE = {
  equino: 'Equino', bovino: 'Bovino', ovino: 'Ovino', caprino: 'Caprino',
  canino: 'Canino', felino: 'Felino', otro: 'Otro',
};

export async function mountAnimalesList(contenedor, ctx) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando pacientes…</p>';

  let animales;
  try {
    animales = await listAnimales(ctx.establecimientoActivoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar pacientes: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const filas = animales.map((a) => `
    <tr>
      <td>${escapeHtml(LABEL_ESPECIE[a.especie] ?? a.especie)}</td>
      <td>${escapeHtml(a.nombre ?? '—')}</td>
      <td>${escapeHtml(a.personas?.nombre ?? '—')}</td>
      <td class="rodeo-table-acciones">
        <a href="#animales/editar/${a.id}">Editar</a>
      </td>
    </tr>`).join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <div class="rodeo-card-header">
        <h2>Pacientes Animales</h2>
        <a class="rodeo-btn" href="#animales/nuevo">+ Nuevo Paciente</a>
      </div>
      ${animales.length === 0
        ? '<p>No hay pacientes registrados todavía.</p>'
        : `<table class="rodeo-table">
             <thead><tr><th>Especie</th><th>Nombre</th><th>Tutor</th><th></th></tr></thead>
             <tbody>${filas}</tbody>
           </table>`
      }
    </div>`;
}
