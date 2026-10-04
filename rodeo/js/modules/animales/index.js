// Composición del módulo Animales y Lotes — registra sus rutas contra
// el router compartido. Mismo patrón que BIT-06 (Jornadas).

import { registerRoute } from '../../router.js';
import { mountAnimalesList } from './list.js';
import { mountAnimalForm } from './form.js';
import { mountAnimalDetail } from './detail.js';
import { mountLotesList } from './lotes-list.js';
import { mountLoteForm } from './lotes-form.js';

// Lotes vive bajo #animales/lotes/... para que el ítem "Pacientes" del
// sidebar permanezca activo al navegar dentro del módulo.
// Sin vista `Ver` propia a propósito (BIT-57): el listado ya muestra el
// 100% de los datos de Lote (nombre, notas) sin truncar -- una ficha de
// detalle no agregaría valor funcional. Si Lotes incorpora más datos en
// el futuro, recién ahí se evalúa agregarla.
export function registrarRutasAnimales(contenedor, ctx) {
  registerRoute('animales', (partes) => {
    if (partes[0] === 'lotes') {
      if (partes[1] === 'nuevo') mountLoteForm(contenedor, ctx, null);
      else if (partes[1] === 'editar') mountLoteForm(contenedor, ctx, partes[2]);
      else mountLotesList(contenedor, ctx);
    } else if (partes[0] === 'nuevo') {
      mountAnimalForm(contenedor, ctx, null);
    } else if (partes[0] === 'ver') {
      mountAnimalDetail(contenedor, ctx, partes[1]);
    } else if (partes[0] === 'editar') {
      mountAnimalForm(contenedor, ctx, partes[1]);
    } else {
      mountAnimalesList(contenedor, ctx);
    }
  });
}
