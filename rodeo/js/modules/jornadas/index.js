// Punto de composición del módulo Jornadas — registra sus rutas contra
// el router compartido. Referencia para módulos futuros: cada módulo
// nuevo (Animales, Visitas...) expone una función `registrarRutas*`
// igual a esta, y main.js solo la llama una vez.

import { registerRoute } from '../../router.js';
import { mountJornadasList } from './list.js';
import { mountJornadaForm } from './form.js';
import { mountJornadaOperativa } from './operativa.js';
import { tieneJornadaHabilitada } from '../../services/establecimientos.js';

// BIT-61: #jornadas pasa a ser la pantalla operativa (LLEGADA/SALIDA) --
// es la experiencia principal del turno de trabajo. El listado histórico
// (con Ver/Editar de BIT-57 y Papelera) se conserva intacto, solo se mueve
// a #jornadas/historial. La creación manual ("+ Nueva jornada") se retiró
// (decisión de producto, Bren/KLIAM): una Jornada nace EXCLUSIVAMENTE al
// pulsar LLEGADA -- #jornadas/nueva redirige al flujo operativo en vez de
// montar un formulario.
export function registrarRutasJornadas(contenedor, ctx) {
  registerRoute('jornadas', (partes) => {
    // Gate centralizado (corrección, Bren/KLIAM): antes solo
    // operativa.js verificaba la capacidad -- escribir a mano
    // #jornadas/historial o #jornadas/nueva en un establecimiento sin
    // Jornada habilitada igual montaba esas pantallas. Si Jornada NO
    // está habilitada para el establecimiento activo, NINGUNA subruta
    // del módulo monta (ni operativa, ni historial, ni ver/editar) --
    // se redirige a #dashboard antes de despachar. El bypass de
    // ADMINISTRADOR (dentro de tieneJornadaHabilitada) no se toca.
    // operativa.js conserva su propio gate como defensa en profundidad
    // para el caso en que esta función se llame igual.
    if (!tieneJornadaHabilitada(ctx.establecimientoActivoId, ctx.capacidadesJornada, ctx.perfil)) {
      location.hash = '#dashboard';
      return;
    }

    // Llegar acá ya implica que SÍ hay capacidad -- un link viejo o una
    // URL escrita a mano a #jornadas/nueva va directo al flujo operativo
    // correcto (LLEGADA), nunca a un formulario de creación manual.
    if (partes[0] === 'nueva') location.hash = '#jornadas';
    else if (partes[0] === 'ver') mountJornadaForm(contenedor, ctx, partes[1], { soloLecturaForzada: true });
    else if (partes[0] === 'editar') mountJornadaForm(contenedor, ctx, partes[1]);
    else if (partes[0] === 'historial') mountJornadasList(contenedor, ctx);
    else mountJornadaOperativa(contenedor, ctx);
  });
}
