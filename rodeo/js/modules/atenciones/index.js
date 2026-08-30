import { registerRoute } from '../../router.js';
import { mountAtencionesList } from './list.js';
import { mountAtencionForm } from './form.js';

export function registrarRutasAtenciones(contenedor, ctx) {
  registerRoute('atenciones', (partes) => {
    if (partes[0] === 'nueva') {
      mountAtencionForm(contenedor, ctx, null);
    } else if (partes[0] === 'editar' && partes[1]) {
      mountAtencionForm(contenedor, ctx, partes[1]);
    } else {
      mountAtencionesList(contenedor, ctx);
    }
  });
}
