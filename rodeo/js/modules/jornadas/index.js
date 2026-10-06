// Punto de composición del módulo Jornadas — registra sus rutas contra
// el router compartido. Referencia para módulos futuros: cada módulo
// nuevo (Animales, Visitas...) expone una función `registrarRutas*`
// igual a esta, y main.js solo la llama una vez.

import { registerRoute } from '../../router.js';
import { mountJornadasList } from './list.js';
import { mountJornadaForm } from './form.js';
import { mountJornadaOperativa } from './operativa.js';

// BIT-61: #jornadas pasa a ser la pantalla operativa (LLEGADA/SALIDA) --
// es la experiencia principal del turno de trabajo. El listado/CRUD
// histórico de siempre (con Ver/Editar de BIT-57 y Papelera) se conserva
// intacto, solo se mueve a #jornadas/historial.
export function registrarRutasJornadas(contenedor, ctx) {
  registerRoute('jornadas', (partes) => {
    if (partes[0] === 'nueva') mountJornadaForm(contenedor, ctx, null);
    else if (partes[0] === 'ver') mountJornadaForm(contenedor, ctx, partes[1], { soloLecturaForzada: true });
    else if (partes[0] === 'editar') mountJornadaForm(contenedor, ctx, partes[1]);
    else if (partes[0] === 'historial') mountJornadasList(contenedor, ctx);
    else mountJornadaOperativa(contenedor, ctx);
  });
}
