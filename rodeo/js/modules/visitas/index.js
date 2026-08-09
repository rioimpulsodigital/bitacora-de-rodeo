import { registerRoute } from '../../router.js';
import { mountVisitasList } from './list.js';
import { mountVisitaForm } from './form.js';

export function registrarRutasVisitas(contenedor, ctx) {
  registerRoute('visitas', (partes) => {
    if (partes[0] === 'nueva') mountVisitaForm(contenedor, ctx, null);
    else if (partes[0] === 'editar') mountVisitaForm(contenedor, ctx, partes[1]);
    else mountVisitasList(contenedor, ctx);
  });
}
