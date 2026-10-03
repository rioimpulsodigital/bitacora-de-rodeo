import { registerRoute } from '../../router.js';
import { mountAtencionesList } from './list.js';
import { mountAtencionForm } from './form.js';
import { mountAtencionDetail } from './detail.js';

export function registrarRutasAtenciones(contenedor, ctx) {
  registerRoute('atenciones', (partes) => {
    if (partes[0] === 'nueva') {
      mountAtencionForm(contenedor, ctx, null);
    } else if (partes[0] === 'ver' && partes[1]) {
      mountAtencionDetail(contenedor, ctx, partes[1]);
    } else if (partes[0] === 'editar' && partes[1]) {
      mountAtencionForm(contenedor, ctx, partes[1]);
    } else {
      mountAtencionesList(contenedor, ctx);
    }
  });
}
