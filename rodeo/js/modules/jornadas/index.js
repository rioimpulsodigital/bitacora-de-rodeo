// Punto de composición del módulo Jornadas — registra sus rutas contra
// el router compartido. Referencia para módulos futuros: cada módulo
// nuevo (Animales, Visitas...) expone una función `registrarRutas*`
// igual a esta, y main.js solo la llama una vez.

import { registerRoute } from '../../router.js';
import { mountJornadasList } from './list.js';
import { mountJornadaForm } from './form.js';

export function registrarRutasJornadas(contenedor, ctx) {
  registerRoute('jornadas', (partes) => {
    if (partes[0] === 'nueva') mountJornadaForm(contenedor, ctx, null);
    else if (partes[0] === 'editar') mountJornadaForm(contenedor, ctx, partes[1]);
    else mountJornadasList(contenedor, ctx);
  });
}
