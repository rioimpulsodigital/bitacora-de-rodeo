// Módulo Proyecto Recuperación de Rodeo — punto de composición.
// Sin sub-navegación propia (no implementa mountNav): el shell
// oculta el slot de nav automáticamente cuando este módulo está
// activo (ver core/app.js).

import { tplRodeoForm, doGuardarRodeo } from './form.js';

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
};

// Exponer para los onclick inline de la plantilla.
window.Rodeo = { doGuardarRodeo };

export default rodeoModule;
