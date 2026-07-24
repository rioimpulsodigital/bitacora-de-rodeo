// Punto de entrada / raíz de composición. Único archivo que
// conoce la lista completa de módulos existentes — agregar un
// módulo nuevo (Gestión Ganadera, Tratamientos, Inspecciones...)
// significa escribir su carpeta en js/modules/ y sumar dos líneas
// acá. Nada más del proyecto necesita cambiar.

import { registerModule, selectModulo, backToPortada, boot } from './core/app.js';
import rescateModule from './modules/rescate/index.js';
import rodeoModule from './modules/rodeo/index.js';

registerModule(rescateModule);
registerModule(rodeoModule);

// Namespace del shell para los onclick inline de index.html.
window.App = { selectModulo, backToPortada };

boot();
