import { supabase } from '../../../../js/core/supabase-client.js';

export async function listObservaciones(establecimientoId) {
  let q = supabase
    .from('observaciones_campo')
    .select('id, descripcion, sujeto_tipo, animal_id, visita_id, visitas!inner(fecha, establecimiento_id, establecimientos(nombre)), animales(nombre)');
  if (establecimientoId) q = q.eq('visitas.establecimiento_id', establecimientoId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getObservacion(id) {
  const { data, error } = await supabase
    .from('observaciones_campo')
    .select('id, descripcion, sujeto_tipo, animal_id, lote_id, visita_id, visitas(id, fecha, tipo, estado, establecimiento_id), animales(id, nombre)')
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
    .select('id, nombre');
  if (establecimientoId) q = q.eq('establecimiento_actual_id', establecimientoId);
  const { data, error } = await q.order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearObservacion(campos) {
  const { data, error } = await supabase
    .from('observaciones_campo')
    .insert({
      visita_id: campos.visita_id,
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

export async function actualizarObservacion(id, campos) {
  const { error } = await supabase
    .from('observaciones_campo')
    .update({
      visita_id: campos.visita_id,
      descripcion: campos.descripcion.trim(),
      sujeto_tipo: campos.animal_id ? 'animal' : null,
      animal_id: campos.animal_id || null,
      lote_id: null,
    })
    .eq('id', id);
  if (error) throw error;
}
