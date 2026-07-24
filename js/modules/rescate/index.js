// Módulo Rescate Equino Municipalidad — punto de composición.
// Decide cuál de las dos sub-vistas hermanas (session | reports)
// va montada en #main, y expone el namespace `Rescate` en window
// para los `onclick` inline de las plantillas.
//
// (No se migró a addEventListener/data-action: hubiera implicado
// tocar cada plantilla del proyecto solo por estilo, sin cambiar
// comportamiento observable — ver informe BIT-25 para el detalle
// de esta decisión.)

import * as session from './session.js';
import * as reports from './reports.js';
import * as calendar from './calendar.js';

let tab = 'session'; // session | report

function tplNav() {
  return `
      <button class="tab-btn ${tab === 'session' ? 'active' : ''}" onclick="Rescate.switchTab('session')">Jornada</button>
      <button class="tab-btn ${tab === 'report' ? 'active' : ''}" onclick="Rescate.switchTab('report')">Informes</button>`;
}

function switchTab(t) {
  tab = t;
  rescateModule.mount(document.getElementById('main'));
  rescateModule.mountNav(document.getElementById('header-nav'));
}

const rescateModule = {
  id: 'rescate',
  icon: '🐴',
  color: '#f87523',
  portalTitle: 'Rescate Equino Municipalidad',
  portalSubtitle: 'Registro de jornada y actividades',
  shortLabel: 'Rescate Equino Municipalidad',
  headerLabel: 'Registro de jornada',

  mount(mainEl) {
    mainEl.innerHTML = tab === 'session'
      ? (session.hasActiveSession() ? session.tplActive() : session.tplIdle())
      : reports.tplInformes();
  },

  mountNav(navEl) {
    navEl.innerHTML = tplNav();
  },

  onTick(n) {
    session.tickClock(n);
    session.tickSession(n);
  },
};

// Exponer para los onclick inline de las plantillas.
window.Rescate = {
  switchTab,
  doLlegada: session.doLlegada,
  doAdd: session.doAdd,
  doSalida: session.doSalida,
  doSalidaConHora: session.doSalidaConHora,
  mostrarSelectorPeriodo: reports.mostrarSelectorPeriodo,
  elegirPeriodo: reports.elegirPeriodo,
  cancelarSeleccion: reports.cancelarSeleccion,
  nuevoInforme: reports.nuevoInforme,
  confirmReportDate: reports.confirmReportDate,
  doReport: reports.doReport,
  toggleEntry: reports.toggleEntry,
  doExport: reports.doExport,
  calPrev: reports.calPrev,
  calNext: reports.calNext,
  calSelectMonday: reports.calSelectMonday,
};

export default rescateModule;
