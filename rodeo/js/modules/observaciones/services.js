import { supabase } from '../../../../js/core/supabase-client.js';

// BIT-63: Observación de Campo pertenece a un establecimiento -- ya NO
// depende de una Visita (antes `visitas!inner` hacía que el embed fuera un
// inner-join: si RLS bloqueaba la Visita, la Observación entera
// desaparecía, aunque su propia policy la siguiera permitiendo -- ver
// hallazgo H1 de BIT-46. `establecimiento_id` es ahora columna propia y
// directa (migration-BIT-63-observaciones-visitas.sql, preparada, NO
// aplicada todavía); `visita_id` sigue existiendo pero es opcional.

export async function listObservaciones(establecimientoId) {
  let q = supabase
    .from('observaciones_campo')
    .select('id, descripcion, created_at, sujeto_tipo, animal_id, visita_id, establecimiento_id, establecimientos(nombre), visitas(fecha, tipo), animales(nombre, numero_identificacion, especie)');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getObservacion(id) {
  const { data, error } = await supabase
    .from('observaciones_campo')
    .select('id, descripcion, created_at, sujeto_tipo, animal_id, lote_id, visita_id, establecimiento_id, establecimientos(id, nombre), visitas(id, fecha, tipo, estado), animales(id, nombre, numero_identificacion, especie)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVisitasParaSelector(establecimientoId) {
  let q = supabase
    .from('visitas')
    .select('id, fecha, tipo, estado');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAnimalesParaSelector(establecimientoId) {
  let q = supabase
    .from('animales')
    .select('id, nombre, numero_identificacion, especie');
  if (establecimientoId) q = q.eq('establecimiento_actual_id', establecimientoId);
  const { data, error } = await q.order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

// `establecimiento_id` es obligatorio desde BIT-63 -- las pantallas que
// llaman a esta función (form.js) lo toman del establecimiento activo,
// nunca de un selector. `visita_id` es opcional. `created_by` NO se envía
// nunca desde el cliente -- lo asigna el trigger server-side
// `set_created_by()` (defensa real contra spoofing, no solo ocultar el
// campo en el formulario).
export async function crearObservacion(campos) {
  if (!campos.establecimiento_id) {
    throw new Error('Falta el establecimiento -- no se puede crear una Observación sin establecimiento.');
  }
  const { data, error } = await supabase
    .from('observaciones_campo')
    .insert({
      establecimiento_id: campos.establecimiento_id,
      visita_id: campos.visita_id || null,
      descripcion: campos.descripcion.trim(),
      sujeto_tipo: campos.animal_id ? 'animal' : null,
      animal_id: campos.animal_id || null,
      lote_id: null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

// NO recibe ni escribe establecimiento_id -- inmutable después de creada,
// mismo criterio que jornadas.establecimiento_id (BIT-61): el
// establecimiento real es dónde ocurrió el hecho, no algo que deba poder
// cambiarse editando el registro después.
export async function actualizarObservacion(id, campos) {
  const { error } = await supabase
    .from('observaciones_campo')
    .update({
      visita_id: campos.visita_id || null,
      descripcion: campos.descripcion.trim(),
      sujeto_tipo: campos.animal_id ? 'animal' : null,
      animal_id: campos.animal_id || null,
      lote_id: null,
    })
    .eq('id', id);
  if (error) throw error;
}
