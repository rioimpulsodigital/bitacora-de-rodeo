// Informe Diario (BIT-12) -- flujo: Fecha → detección automática de
// establecimientos con actividad → selección (uno/varios/todos) →
// Generar informe. Sin selector de Jornada -- Jornada es una fuente más,
// nunca una condición.

import { obtenerActividad, establecimientosConActividad, construirInforme } from './services.js';
import { renderInforme } from './render.js';
import { construirTextoInforme } from './texto.js';
import { escapeHtml } from '../../dashboard.js';
import { hoyLocal } from '../../services/fecha-argentina.js';

// BIT-16: copia el texto del Informe ya generado (construirTextoInforme,
// mismo objeto Informe que renderInforme) al portapapeles. Clipboard API
// primero; si no está disponible o el permiso se rechaza (http no
// seguro, navegador viejo), cae a un textarea oculto + execCommand
// ('copy') -- si tampoco funciona, devuelve false y la UI lo informa en
// vez de fallar en silencio.
async function copiarAlPortapapeles(texto) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // sigue al fallback de abajo
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copiado = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copiado;
  } catch {
    return false;
  }
}

// BIT-17 (ajuste 04, hallazgo de Claudy -- comportamiento real por
// encima de preferencia de documentación): `wa.me/?text=...` es el
// formato que documenta la WhatsApp FAQ para compartir sin
// destinatario, pero Claudy reprodujo una pérdida real de 3 emojis
// concretos (📍🩺🐾) en escritorio durante el redireccionamiento
// posterior de `wa.me` -- nuestro propio `encodeURIComponent()` ya los
// codifica correctamente (son UTF-8 válido de 4 bytes, verificado), así
// que la corrupción ocurre del lado de `wa.me`, no en este código.
// `api.whatsapp.com/send/?text=...` -- el endpoint anterior a BIT-17-02
// -- fue el que Claudy verificó que conserva esos mismos emojis también
// en escritorio. Mismo dominio oficial de WhatsApp (no es la API de
// WhatsApp Business ni un servicio de terceros), igual sin número de
// destinatario fijo -- solo cambia cuál de los dos endpoints oficiales
// de WhatsApp se usa.
function urlCompartirWhatsapp(texto) {
  return `https://api.whatsapp.com/send/?text=${encodeURIComponent(texto)}`;
}

// Solo se montan cuando el Informe tiene algo para mostrar -- copiar o
// compartir "Sin actividad registrada..." no aporta nada y ninguna de
// las dos acciones debe aparecer sin un informe real generado. El texto
// se construye UNA sola vez (construirTextoInforme, BIT-16) y lo
// reutilizan ambas acciones -- Copiar y WhatsApp comparten exactamente
// el mismo contenido, nunca un segundo formateador.
function montarAcciones(contenedor, informe) {
  if (informe.establecimientos.length === 0) return;
  const texto = construirTextoInforme(informe);

  const acciones = document.createElement('div');
  acciones.className = 'rodeo-informe-acciones-texto';
  acciones.innerHTML = `
    <button type="button" class="rodeo-link-btn rodeo-informe-btn-secundario" id="informe-copiar">📋 Copiar informe</button>
    <a class="rodeo-link-btn rodeo-informe-btn-secundario" id="informe-whatsapp" href="${urlCompartirWhatsapp(texto)}" target="_blank" rel="noopener">📲 Enviar por WhatsApp</a>
    <span class="rodeo-hint" id="informe-copiar-feedback" role="status" aria-live="polite"></span>`;
  contenedor.prepend(acciones);

  document.getElementById('informe-copiar').addEventListener('click', async () => {
    const feedback = document.getElementById('informe-copiar-feedback');
    const copiado = await copiarAlPortapapeles(texto);
    feedback.textContent = copiado
      ? 'Copiado ✓'
      : 'No se pudo copiar automáticamente -- seleccioná el texto manualmente.';
    if (copiado) setTimeout(() => { feedback.textContent = ''; }, 3000);
  });
}

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
        <button type="button" class="rodeo-link-btn rodeo-informe-btn-secundario" id="informe-todos" style="margin-left:0">Todos</button>
        <button type="button" class="rodeo-link-btn rodeo-informe-btn-secundario" id="informe-ninguno">Ninguno</button>
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
      const renderEl = document.getElementById('informe-render');
      renderEl.innerHTML = renderInforme(informe);
      montarAcciones(renderEl, informe);
    });
  }

  render();
}
