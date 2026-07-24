// Módulo Proyecto Recuperación de Rodeo — punto de composición.

import { tplRodeoForm, doGuardarRodeo } from './form.js';

// Google Sheet donde este módulo guarda sus registros (ver
// apps-script-rodeo.gs). Es un link de salida, no una vista interna
// del módulo — por eso vive acá y no como un "tab" con estado propio.
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-QTTWNFemY7AxVZYBT1wejhJ20tUJqvL8YNH1DQk-Bs/edit?usp=sharing';

function tplNav() {
  return `<a class="tab-btn active" href="${SHEET_URL}" target="_blank" rel="noopener">📄 Planilla</a>`;
}

const rodeoModule = {
  id: 'rodeo',
  icon: '🤠',
  color: '#126d68',
  portalTitle: 'Proyecto Recuperación de Rodeo',
  portalSubtitle: 'Próximamente',
  shortLabel: 'Recuperación de Rodeo',
  headerLabel: 'Recuperación de Rodeo',

  mount(mainEl) {
    mainEl.innerHTML = tplRodeoForm();
  },

  mountNav(navEl) {
    navEl.innerHTML = tplNav();
  },
};

// Exponer para los onclick inline de la plantilla.
window.Rodeo = { doGuardarRodeo };

export default rodeoModule;
