import { registerRoute } from '../../router.js';
import { mountObservacionesList } from './list.js';
import { mountObservacionForm } from './form.js';

export function registrarRutasObservaciones(contenedor, ctx) {
  registerRoute('observaciones', (partes) => {
    if (partes[0] === 'nueva') mountObservacionForm(contenedor, ctx, null);
    else if (partes[0] === 'editar') mountObservacionForm(contenedor, ctx, partes[1]);
    else mountObservacionesList(contenedor, ctx);
  });
}
