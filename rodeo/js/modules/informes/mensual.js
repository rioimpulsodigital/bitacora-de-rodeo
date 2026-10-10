// Informe Mensual (BIT-12) -- misma arquitectura de datos que el Diario
// (obtenerActividad/construirInforme sin cambios), parametrizada por un
// rango de un mes completo en vez de un único día. No depende de Jornadas
// para construir el período -- el rango lo define el mes elegido, no
// ninguna Jornada.

import { obtenerActividad, establecimientosConActividad, construirInforme } from './services.js';
import { renderInforme } from './render.js';
import { escapeHtml } from '../../dashboard.js';
import { hoyLocal, primerDiaDelMes, ultimoDiaDelMes } from '../../services/fecha-argentina.js';

function anioMesActual() {
  return hoyLocal().slice(0, 7); // 'YYYY-MM'
}

function fmtMes(anioMes) {
  const [anio, mes] = anioMes.split('-');
  const NOMBRES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${NOMBRES[Number(mes) - 1]} de ${anio}`;
}

export async function mountInformeMensual(contenedor, ctx) {
  let actividad = null;

  function render() {
    contenedor.innerHTML = `
      <div class="rodeo-card">
        <h2>Informe Mensual</h2>
        <label class="form-label">Mes</label>
        <input class="form-field" type="month" id="informe-mes" value="${anioMesActual()}" style="max-width:220px">
        <button type="button" class="salida-btn" id="informe-buscar">Buscar actividad</button>
        <div id="informe-resultado" style="margin-top:16px"></div>
      </div>`;

    document.getElementById('informe-buscar').addEventListener('click', buscar);
  }

  async function buscar() {
    const anioMes = document.getElementById('informe-mes').value;
    const resultadoEl = document.getElementById('informe-resultado');
    if (!anioMes) { resultadoEl.innerHTML = '<p class="rodeo-error">Elegí un mes.</p>'; return; }

    const desde = primerDiaDelMes(anioMes);
    const hasta = ultimoDiaDelMes(anioMes);

    resultadoEl.innerHTML = '<p class="rodeo-loading">Buscando actividad…</p>';
    try {
      actividad = await obtenerActividad(ctx.perfil.id, desde, hasta);
    } catch (e) {
      resultadoEl.innerHTML = `<p class="rodeo-error">Error al buscar actividad: ${escapeHtml(e.message)}</p>`;
      return;
    }
    renderSelector(resultadoEl, anioMes, desde, hasta);
  }

  function renderSelector(resultadoEl, anioMes, desde, hasta) {
    const ids = establecimientosConActividad(actividad);
    if (ids.length === 0) {
      resultadoEl.innerHTML = `<p class="rodeo-hint">No hay actividad registrada por vos en ${fmtMes(anioMes)}.</p>`;
      return;
    }

    const opciones = ids.map((id) => {
      const est = ctx.establecimientos.find((e) => e.id === id);
      return `<label class="rodeo-checkbox-linea"><input type="checkbox" class="informe-est-check" value="${id}" checked> ${escapeHtml(est?.nombre ?? '—')}</label>`;
    }).join('');

    resultadoEl.innerHTML = `
      <p class="rodeo-hint">Establecimientos con actividad registrada por vos en ${fmtMes(anioMes)}:</p>
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
      const informe = construirInforme(actividad, seleccionados, ctx.establecimientos, ctx.perfil, desde, hasta);
      document.getElementById('informe-render').innerHTML = renderInforme(informe);
    });
  }

  render();
}
