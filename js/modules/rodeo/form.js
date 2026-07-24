// Formulario de intervención sanitaria: plantilla, validación,
// guardado y limpieza. Dueño exclusivo de los campos rodeo-*.

import { flash } from '../../core/flash.js';
import { DUENOS, CLASIFICACIONES } from './data.js';
import { saveRegistro } from './api.js';

export function tplRodeoForm() {
  const duenoOpts = DUENOS.map(d => `<option value="${d}">${d}</option>`).join('');
  const clasifOpts = CLASIFICACIONES.map(c => `<option value="${c}">${c}</option>`).join('');

  return `
      <div class="form-wrap">
        <div style="max-width:420px;margin:0 auto;">
          <div class="form-title">🐮 Nuevo registro</div>

          <label class="form-label" for="rodeo-caravana">Caravana</label>
          <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1"
            id="rodeo-caravana" class="form-field" placeholder="N.º de caravana">

          <label class="form-label" for="rodeo-dueno">Dueño</label>
          <select id="rodeo-dueno" class="form-field">
            <option value="" disabled selected>Seleccione un dueño...</option>
            ${duenoOpts}
          </select>

          <label class="form-label" for="rodeo-clasificacion">Clasificación</label>
          <select id="rodeo-clasificacion" class="form-field">
            <option value="" disabled selected>Seleccione una clasificación...</option>
            ${clasifOpts}
          </select>

          <span class="form-label">Intervenciones</span>
          <label class="form-check-row"><input type="checkbox" id="rodeo-vitamina"> Vitamina</label>
          <label class="form-check-row"><input type="checkbox" id="rodeo-antip-interno"> Antiparasitario Interno</label>
          <label class="form-check-row"><input type="checkbox" id="rodeo-antip-externo"> Antiparasitario Externo</label>

          <label class="form-label" style="margin-top:6px;" for="rodeo-observaciones">Observaciones</label>
          <textarea id="rodeo-observaciones" class="form-field act-textarea" rows="3" placeholder="Observaciones (opcional)"></textarea>

          <button class="salida-btn btn-compact" onclick="Rodeo.doGuardarRodeo()">Guardar Registro</button>
        </div>
      </div>`;
}

export async function doGuardarRodeo() {
  const caravana = document.getElementById('rodeo-caravana').value.trim();
  const dueno = document.getElementById('rodeo-dueno').value;
  const clasificacion = document.getElementById('rodeo-clasificacion').value;

  if (!caravana) { flash('error', 'Ingresá el número de caravana'); return; }
  if (!dueno) { flash('error', 'Seleccioná un dueño'); return; }
  if (!clasificacion) { flash('error', 'Seleccioná una clasificación'); return; }

  const vitamina = document.getElementById('rodeo-vitamina').checked;
  const antipInterno = document.getElementById('rodeo-antip-interno').checked;
  const antipExterno = document.getElementById('rodeo-antip-externo').checked;
  const observaciones = document.getElementById('rodeo-observaciones').value.trim();

  try {
    const data = await saveRegistro({
      caravana,
      dueno,
      clasificacion,
      vitamina: vitamina ? 'Sí' : 'No',
      antiparasitario_interno: antipInterno ? 'Sí' : 'No',
      antiparasitario_externo: antipExterno ? 'Sí' : 'No',
      observaciones,
    });
    if (data.success) {
      flash('ok', '✓ Registro guardado correctamente');
      limpiarFormulario();
    } else {
      flash('error', `Error al guardar: ${data.error || 'respuesta inesperada'}`);
    }
  } catch {
    flash('error', 'Sin conexión — verifica tu internet');
  }
}

function limpiarFormulario() {
  document.getElementById('rodeo-caravana').value = '';
  document.getElementById('rodeo-dueno').value = '';
  document.getElementById('rodeo-clasificacion').value = '';
  document.getElementById('rodeo-vitamina').checked = false;
  document.getElementById('rodeo-antip-interno').checked = false;
  document.getElementById('rodeo-antip-externo').checked = false;
  document.getElementById('rodeo-observaciones').value = '';
  document.getElementById('rodeo-caravana').focus();
}
