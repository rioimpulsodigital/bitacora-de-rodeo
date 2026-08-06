// Composición del módulo Animales y Lotes — registra sus rutas contra
// el router compartido. Mismo patrón que BIT-06 (Jornadas).

import { registerRoute } from '../../router.js';
import { mountAnimalesList } from './list.js';
import { mountAnimalForm } from './form.js';
import { mountLotesList } from './lotes-list.js';
import { mountLoteForm } from './lotes-form.js';

export function registrarRutasAnimales(contenedor, ctx) {
  registerRoute('animales', (partes) => {
    if (partes[0] === 'nuevo') mountAnimalForm(contenedor, ctx, null);
    else if (partes[0] === 'editar') mountAnimalForm(contenedor, ctx, partes[1]);
    else mountAnimalesList(contenedor, ctx);
  });

  registerRoute('lotes', (partes) => {
    if (partes[0] === 'nuevo') mountLoteForm(contenedor, ctx, null);
    else if (partes[0] === 'editar') mountLoteForm(contenedor, ctx, partes[1]);
    else mountLotesList(contenedor, ctx);
  });
}
