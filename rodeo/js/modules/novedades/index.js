import { registerRoute } from '../../router.js';
import { mountNovedadesList } from './list.js';
import { mountNovedadForm } from './form.js';
import { mountNovedadDetail } from './detail.js';

export function registrarRutasNovedades(contenedor, ctx) {
  registerRoute('novedades', (partes) => {
    if (partes[0] === 'nueva') mountNovedadForm(contenedor, ctx, null);
    else if (partes[0] === 'ver') mountNovedadDetail(contenedor, ctx, partes[1]);
    else if (partes[0] === 'editar') mountNovedadForm(contenedor, ctx, partes[1]);
    else mountNovedadesList(contenedor, ctx);
  });
}
