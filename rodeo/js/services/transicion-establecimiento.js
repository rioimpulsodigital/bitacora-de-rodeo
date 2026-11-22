// Transición atómica de establecimiento activo (BIT-70/F-01, F-04).
//
// Cambiar de establecimiento NO es cambiar un dato: es cruzar un límite de
// navegación. Todo lo que está montado (vista, formulario, listeners,
// consultas en vuelo) pertenece al contexto anterior y debe descartarse. La
// forma más segura y simple de lograrlo es abandonar la ruta actual y
// recargar la aplicación: la recarga destruye la memoria, los listeners y
// TODA promesa pendiente del contexto anterior, sin depender de que cada
// módulo cancele lo suyo. Antes de recargar se sella el estado en memoria
// para que ningún handler tardío pueda escribir en pantalla ni guardar.
//
// Las dependencias (recarga, confirmación, almacenamiento) son inyectables
// únicamente para poder probar la transición sin navegar de verdad.

import { validarEstablecimientoAccesible } from './contexto.js';

// Claves transitorias del flujo "Atención → + Nuevo Paciente → Atención":
// hacen sentido solo dentro del establecimiento donde empezó ese flujo.
const CLAVES_SESION_TRANSITORIAS = ['_atenciones_return', '_atenciones_animal_id'];

export const MENSAJE_CONFIRMAR_CAMBIO =
  'Vas a cambiar de establecimiento. Lo que estés editando en esta pantalla y no hayas guardado se va a perder. ¿Continuar?';

export function crearTransicionEstablecimiento({
  establecimientos,
  contenedor,
  obtenerActivoId,
  aplicarActivoId,
  persistir,
  recargar = () => location.reload(),
  confirmar = (mensaje) => confirm(mensaje),
  sesion = sessionStorage,
  historial = history,
  ubicacion = location,
  documento = document,
}) {
  // Devuelve un string con el resultado (útil para pruebas): 'ignorado' si el
  // valor no es un establecimiento accesible, 'sin-cambios' si ya era el
  // activo, 'cancelado' si el usuario no confirmó, 'cambiado' si se ejecutó.
  return function cambiar(nuevoId, selectEl = null) {
    const restaurarSelector = () => {
      if (selectEl) selectEl.value = obtenerActivoId() ?? '';
    };

    // 1. Validar contra los accesos legítimos. Un valor ajeno (DOM alterado,
    //    id inexistente, vacío) nunca se convierte en contexto.
    const valido = validarEstablecimientoAccesible(nuevoId, establecimientos);
    if (!valido) {
      restaurarSelector();
      return 'ignorado';
    }
    if (valido === obtenerActivoId()) return 'sin-cambios';

    // 2. Si hay un formulario en pantalla, no descartar trabajo sin avisar.
    if (contenedor.querySelector('form') && !confirmar(MENSAJE_CONFIRMAR_CAMBIO)) {
      restaurarSelector();
      return 'cancelado';
    }

    // 3. Sellar el estado: desde este punto el contexto en memoria ya es el
    //    nuevo, así que cualquier guardado pendiente del anterior falla su
    //    comprobación de vigencia (contextoSigueVigente).
    aplicarActivoId(valido);
    persistir(valido);
    for (const clave of CLAVES_SESION_TRANSITORIAS) {
      try { sesion.removeItem(clave); } catch { /* almacenamiento bloqueado: no impide el cambio */ }
    }

    // 4. Invalidar la vista anterior: se quita del documento el contenedor
    //    donde escriben los handlers del contexto previo. Una respuesta
    //    asíncrona que llegue tarde escribe en un nodo desconectado, no en
    //    pantalla. En su lugar queda un contenedor nuevo y vacío.
    if (selectEl) selectEl.disabled = true;
    const nuevo = documento.createElement('main');
    nuevo.id = contenedor.id;
    nuevo.className = contenedor.className;
    nuevo.innerHTML = '<p class="rodeo-loading">Cambiando de establecimiento…</p>';
    contenedor.replaceWith(nuevo);

    // 5. Destino coherente: siempre Dashboard (la ruta anterior, con su id de
    //    registro, pertenecía al contexto que se abandona). replaceState no
    //    dispara hashchange ni deja la ruta vieja como "atrás" inmediato.
    try {
      historial.replaceState(null, '', ubicacion.pathname + ubicacion.search + '#dashboard');
    } catch { /* si falla, la recarga conserva el hash y las guardas por entidad cubren el resto */ }

    // 6. Recargar: descarta memoria, listeners y promesas en vuelo.
    recargar();
    return 'cambiado';
  };
}
