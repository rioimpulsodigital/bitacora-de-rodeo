// Informe Diario (BIT-12) -- flujo: Fecha → detección automática de
// establecimientos con actividad → selección (uno/varios/todos) →
// Generar informe. Sin selector de Jornada -- Jornada es una fuente más,
// nunca una condición.

import { obtenerActividad, establecimientosConActividad, construirInforme } from './services.js';
import { renderInforme } from './render.js';
import { escapeHtml } from '../../dashboard.js';
import { hoyLocal } from '../../services/fecha-argentina.js';

function fmtFechaCorta(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function mountInformeDiario(contenedor, ctx) {
  let actividad = null;

  function render() {
    contenedor.innerHTML = `
      <div class="rodeo-card">
        <h2>Informe Diario</h2>
        <label class="form-label">Fecha</label>
        <input class="form-field" type="date" id="informe-fecha" value="${hoyLocal()}" style="max-width:220px">
        <button type="button" class="salida-btn" id="informe-buscar">Buscar actividad</button>
        <div id="informe-resultado" style="margin-top:16px"></div>
      </div>`;

    document.getElementById('informe-buscar').addEventListener('click', buscar);
  }

  async function buscar() {
    const fecha = document.getElementById('informe-fecha').value;
    const resultadoEl = document.getElementById('informe-resultado');
    if (!fecha) { resultadoEl.innerHTML = '<p class="rodeo-error">Elegí una fecha.</p>'; return; }

    resultadoEl.innerHTML = '<p class="rodeo-loading">Buscando actividad…</p>';
    try {
      actividad = await obtenerActividad(ctx.perfil.id, fecha, fecha);
    } catch (e) {
      resultadoEl.innerHTML = `<p class="rodeo-error">Error al buscar actividad: ${escapeHtml(e.message)}</p>`;
      return;
    }
    renderSelector(resultadoEl, fecha);
  }

  function renderSelector(resultadoEl, fecha) {
    const ids = establecimientosConActividad(actividad);
    if (ids.length === 0) {
      resultadoEl.innerHTML = `<p class="rodeo-hint">No hay actividad registrada por vos el ${fmtFechaCorta(fecha)}.</p>`;
      return;
    }

    const opciones = ids.map((id) => {
      const est = ctx.establecimientos.find((e) => e.id === id);
      return `<label class="rodeo-checkbox-linea"><input type="checkbox" class="informe-est-check" value="${id}" checked> ${escapeHtml(est?.nombre ?? '—')}</label>`;
    }).join('');

    resultadoEl.innerHTML = `
      <p class="rodeo-hint">Establecimientos con actividad registrada por vos el ${fmtFechaCorta(fecha)}:</p>
      <div class="rodeo-informe-selector">
        ${opciones}
      </div>
      <div class="rodeo-form-acciones">
        <button type="button" class="rodeo-link-btn" id="informe-todos" style="margin-left:0">Todos</button>
        <button type="button" class="rodeo-link-btn" id="informe-ninguno">Ninguno</button>
        <button type="button" class="salida-btn" id="informe-generar">Generar informe</button>
      </div>
      <div id="informe-render" style="margin-top:16px"></div>`;

    document.getElementById('informe-todos').addEventListener('click', () => {
      resultadoEl.querySelectorAll('.informe-est-check').forEach((c) => { c.checked = true; });
    });
    document.getElementById('informe-ninguno').addEventListener('click', () => {
      resultadoEl.querySelectorAll('.informe-est-check').forEach((c) => { c.checked = false; });
    });
    document.getElementById('informe-generar').addEventListener('click', () => {
      const seleccionados = [...resultadoEl.querySelectorAll('.informe-est-check:checked')].map((c) => c.value);
      const informe = construirInforme(actividad, seleccionados, ctx.establecimientos, ctx.perfil, fecha, fecha);
      document.getElementById('informe-render').innerHTML = renderInforme(informe);
    });
  }

  render();
}
