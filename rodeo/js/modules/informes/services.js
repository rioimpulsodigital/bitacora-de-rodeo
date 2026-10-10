// Servicio agregador de Informes (BIT-12). Modelo aprobado:
//
//   Fecha + Profesional + Establecimiento(s) → Informe
//   INFORME → ESTABLECIMIENTO → EVENTOS (nunca mezclado)
//
// Jornada es una FUENTE MÁS, no el contenedor del informe -- no se exige
// que exista, y nada se asocia a una Jornada por inferencia (no se usa
// `visitas.jornada_id` en ningún lado de este archivo, a propósito). No
// existe un módulo real "Actividades" -- no se incluye como fuente.
//
// Seguridad: la selección de establecimientos en la UI es una ayuda de UX,
// nunca la barrera de seguridad -- RLS sigue siendo la autoridad real
// sobre qué filas puede leer cada usuario. Además, CADA consulta de abajo
// filtra explícitamente por el autor real (profesional_id/created_by/
// profesional_responsable_id según la fuente) == profesionalId recibido,
// sin depender de que RLS "ya lo resuelve" -- mismo criterio ya usado en
// getJornadaActivaPropia() (BIT-61): un ADMINISTRADOR vería más filas por
// RLS, pero el informe de "mi actividad" nunca debe mezclar la de otra
// persona por un descuido de confiar solo en RLS.

import { supabase } from '../../../../js/core/supabase-client.js';
import { diaLocalDe } from '../../services/fecha-argentina.js';

// ── Una consulta por fuente, cada una con su propia columna real de
// autoría/fecha/establecimiento (confirmadas en código -- Jornadas BIT-61,
// Atenciones BIT-11, Novedades BIT-48, Visitas/Observaciones BIT-63). ────

async function filasJornadas(profesionalId, desde, hasta) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('id, fecha, hora_llegada, hora_salida, establecimiento_id, notas')
    .eq('profesional_id', profesionalId)
    .is('deleted_at', null)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return data;
}

async function filasVisitas(profesionalId, desde, hasta) {
  const { data, error } = await supabase
    .from('visitas')
    .select('id, fecha, tipo, estado, notas, establecimiento_id, lote_id, alcance, categoria, acciones_realizadas')
    .eq('created_by', profesionalId)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return data;
}

async function filasAtenciones(profesionalId, desde, hasta) {
  const { data, error } = await supabase
    .from('atenciones_clinicas')
    .select('id, fecha, motivo, diagnostico, estado, establecimiento_id, animal_id, animales(id, nombre, numero_identificacion, especie)')
    .eq('profesional_responsable_id', profesionalId)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return data;
}

async function filasNovedades(profesionalId, desde, hasta) {
  const { data, error } = await supabase
    .from('novedades_establecimiento')
    .select('id, fecha, tipo, descripcion, establecimiento_id, animal_id, animales(id, nombre, numero_identificacion, especie)')
    .eq('created_by', profesionalId)
    .is('deleted_at', null)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return data;
}

// observaciones_campo no tiene columna `fecha` propia -- solo `created_at`
// (timestamptz, BIT-63). A propósito NO se filtra por rango en la consulta
// SQL (evitaría reintroducir cualquier lógica de offset/UTC a nivel de
// query -- ver services/fecha-argentina.js): se trae todo lo del autor y
// se bucketiza por día calendario real de Argentina en JS, con la única
// función que debe usarse para eso (diaLocalDe). Volumen actual del
// dominio es bajo (uso rural diario); si creciera mucho, el camino de
// optimización es un filtro server-side usando el mismo criterio de zona
// ya centralizado -- nunca un offset a mano.
async function filasObservaciones(profesionalId, desde, hasta) {
  const { data, error } = await supabase
    .from('observaciones_campo')
    .select('id, descripcion, created_at, establecimiento_id, visita_id, animal_id, animales(id, nombre, numero_identificacion, especie)')
    .eq('created_by', profesionalId);
  if (error) throw error;
  return data.filter((o) => {
    const dia = diaLocalDe(o.created_at);
    return dia >= desde && dia <= hasta;
  });
}

// Única consulta real (5 queries en paralelo) para todo el rango de
// fechas pedido -- sirve tanto para el Informe Diario (desde === hasta)
// como para el Mensual (rango del mes), misma arquitectura de datos, sin
// duplicar lógica. Devuelve TODO lo que el profesional registró en ese
// rango, agrupado por establecimiento -- la "detección" de
// establecimientos con actividad y la "selección" posterior son pasos en
// memoria sobre este mismo resultado, nunca una segunda consulta.
export async function obtenerActividad(profesionalId, desde, hasta) {
  const [jornadas, visitas, atenciones, novedades, observaciones] = await Promise.all([
    filasJornadas(profesionalId, desde, hasta),
    filasVisitas(profesionalId, desde, hasta),
    filasAtenciones(profesionalId, desde, hasta),
    filasNovedades(profesionalId, desde, hasta),
    filasObservaciones(profesionalId, desde, hasta),
  ]);

  const porEstablecimiento = new Map();
  function bucket(establecimientoId) {
    if (!porEstablecimiento.has(establecimientoId)) {
      porEstablecimiento.set(establecimientoId, { jornadas: [], visitas: [], atenciones: [], novedades: [], observaciones: [] });
    }
    return porEstablecimiento.get(establecimientoId);
  }
  jornadas.forEach((f) => bucket(f.establecimiento_id).jornadas.push(f));
  visitas.forEach((f) => bucket(f.establecimiento_id).visitas.push(f));
  atenciones.forEach((f) => bucket(f.establecimiento_id).atenciones.push(f));
  novedades.forEach((f) => bucket(f.establecimiento_id).novedades.push(f));
  observaciones.forEach((f) => bucket(f.establecimiento_id).observaciones.push(f));

  return porEstablecimiento;
}

// Ids de establecimiento con al menos un hecho reportable -- lo que la UI
// usa para mostrar ÚNICAMENTE esos como opciones (nunca el catálogo
// completo de establecimientos).
export function establecimientosConActividad(actividad) {
  return [...actividad.keys()];
}

// Pacientes relacionados -- se derivan de los registros que los
// referencian, pero se conserva de dónde viene cada mención (`origenes`).
// Una Observación con un paciente NO lo convierte en "atendido
// clínicamente": no existe ninguna etiqueta unificada acá, solo la lista
// de fuentes reales que lo mencionaron. Las Visitas no participan --
// `visitas` no tiene relación directa con `animales` (solo `lote_id`).
function pacientesRelacionados(datosEstablecimiento) {
  const mapa = new Map(); // animal.id -> { animal, origenes: Set }
  function agregar(filas, origen) {
    for (const fila of filas) {
      const animal = fila.animales;
      if (!animal) continue;
      if (!mapa.has(animal.id)) mapa.set(animal.id, { animal, origenes: new Set() });
      mapa.get(animal.id).origenes.add(origen);
    }
  }
  agregar(datosEstablecimiento.atenciones, 'atencion');
  agregar(datosEstablecimiento.observaciones, 'observacion');
  agregar(datosEstablecimiento.novedades, 'novedad');
  return [...mapa.values()].map((v) => ({ animal: v.animal, origenes: [...v.origenes] }));
}

const CAMPO_TOTAL_POR_FUENTE = {
  jornadas: 'totalJornadas',
  visitas: 'totalVisitas',
  atenciones: 'totalAtenciones',
  observaciones: 'totalObservaciones',
  novedades: 'totalNovedades',
};

// Consolidación por fecha DENTRO de un establecimiento (nunca mezclada con
// otro establecimiento -- se calcula una vez por bloque, sobre los mismos
// arreglos ya traídos, sin re-consultar nada). Es lo que permite al
// Informe Mensual mostrar "qué pasó cada día" sin que la pantalla
// principal sea una concatenación cronológica indiscriminada de todo el
// mes -- el Diario no la necesita (un solo día) y no la usa. Cada fuente
// aporta su propia fecha real: `fecha` (columna `date`) para
// Jornadas/Visitas/Atenciones/Novedades, `diaLocalDe(created_at)` para
// Observaciones -- mismo criterio ya usado en el resto del servicio,
// nunca un offset a mano.
function construirPorFecha(datosEstablecimiento) {
  const mapa = new Map(); // fecha -> { totalJornadas, ..., totalNovedades }
  function filaVacia() {
    return { totalJornadas: 0, totalVisitas: 0, totalAtenciones: 0, totalObservaciones: 0, totalNovedades: 0 };
  }
  function agregar(filas, fuente, obtenerFecha) {
    for (const fila of filas) {
      const fecha = obtenerFecha(fila);
      if (!mapa.has(fecha)) mapa.set(fecha, filaVacia());
      mapa.get(fecha)[CAMPO_TOTAL_POR_FUENTE[fuente]] += 1;
    }
  }
  agregar(datosEstablecimiento.jornadas, 'jornadas', (f) => f.fecha);
  agregar(datosEstablecimiento.visitas, 'visitas', (f) => f.fecha);
  agregar(datosEstablecimiento.atenciones, 'atenciones', (f) => f.fecha);
  agregar(datosEstablecimiento.observaciones, 'observaciones', (f) => diaLocalDe(f.created_at));
  agregar(datosEstablecimiento.novedades, 'novedades', (f) => f.fecha);

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, totales]) => ({
      fecha,
      ...totales,
      total: totales.totalJornadas + totales.totalVisitas + totales.totalAtenciones + totales.totalObservaciones + totales.totalNovedades,
    }));
}

// Construye el Informe final -- SIN consultar nada nuevo. Filtra
// `actividad` (ya en memoria) a solo los establecimientos que el
// profesional eligió, preserva la separación estricta por establecimiento
// (INFORME → ESTABLECIMIENTO → EVENTOS) y calcula los resúmenes (nunca
// persistidos, se recalculan cada vez que se genera el informe).
export function construirInforme(actividad, establecimientosSeleccionados, establecimientosCtx, profesional, desde, hasta) {
  const bloques = establecimientosSeleccionados
    .filter((id) => actividad.has(id))
    .map((id) => {
      const datos = actividad.get(id);
      const establecimiento = establecimientosCtx.find((e) => e.id === id) ?? { id, nombre: '—' };
      // Orden cronológico dentro de cada sección -- relevante sobre todo
      // para el Informe Mensual, que puede abarcar varias fechas distintas
      // en la misma lista. Observaciones no tiene `fecha` propia -- se
      // ordena por `created_at`, que es la fuente real de su fecha/hora.
      const compararPorFecha = (a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '');
      const compararPorCreatedAt = (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '');
      return {
        establecimiento,
        jornadas: [...datos.jornadas].sort(compararPorFecha),
        visitas: [...datos.visitas].sort(compararPorFecha),
        atenciones: [...datos.atenciones].sort(compararPorFecha),
        observaciones: [...datos.observaciones].sort(compararPorCreatedAt),
        novedades: [...datos.novedades].sort(compararPorFecha),
        pacientesRelacionados: pacientesRelacionados(datos),
        porFecha: construirPorFecha(datos),
        resumen: {
          totalJornadas: datos.jornadas.length,
          totalVisitas: datos.visitas.length,
          totalAtenciones: datos.atenciones.length,
          totalObservaciones: datos.observaciones.length,
          totalNovedades: datos.novedades.length,
        },
      };
    });

  return {
    desde,
    hasta,
    profesional,
    establecimientos: bloques,
    resumenGeneral: {
      totalEstablecimientos: bloques.length,
      totalEventos: bloques.reduce(
        (acc, b) => acc + b.resumen.totalJornadas + b.resumen.totalVisitas + b.resumen.totalAtenciones + b.resumen.totalObservaciones + b.resumen.totalNovedades,
        0
      ),
    },
  };
}
