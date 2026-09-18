import { supabase } from '../../../../js/core/supabase-client.js';

export async function listVisitas(establecimientoId) {
  let q = supabase
    .from('visitas')
    .select('id, fecha, tipo, hora_inicio, hora_fin, estado, notas, establecimiento_id, establecimientos(nombre)');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getVisita(id) {
  const { data, error } = await supabase
    .from('visitas')
    .select('id, fecha, tipo, hora_inicio, hora_fin, estado, notas, establecimiento_id, jornada_id, lote_id, alcance, categoria, acciones_realizadas, establecimientos(id, nombre), lotes(id, nombre)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Lotes del establecimiento, para el selector de alcance de Visita Sanitaria.
// Réplica del mismo patrón usado en atenciones/services.js — cada módulo
// consulta `lotes` de forma autónoma, sin importar del módulo Animales.
export async function listLotesParaSelector(establecimientoId) {
  let q = supabase.from('lotes').select('id, nombre');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearVisita(campos) {
  const { data, error } = await supabase
    .from('visitas')
    .insert({
      establecimiento_id: campos.establecimiento_id,
      fecha: campos.fecha,
      tipo: campos.tipo,
      hora_inicio: campos.hora_inicio || null,
      hora_fin: campos.hora_fin || null,
      estado: 'abierta',
      notas: campos.notas?.trim() || null,
      lote_id: campos.lote_id || null,
      alcance: campos.alcance || null,
      categoria: campos.categoria?.trim() || null,
      acciones_realizadas: campos.acciones_realizadas?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarVisita(id, campos) {
  const { error } = await supabase
    .from('visitas')
    .update({
      establecimiento_id: campos.establecimiento_id,
      fecha: campos.fecha,
      tipo: campos.tipo,
      hora_inicio: campos.hora_inicio || null,
      hora_fin: campos.hora_fin || null,
      estado: campos.estado,
      notas: campos.notas?.trim() || null,
      lote_id: campos.lote_id || null,
      alcance: campos.alcance || null,
      categoria: campos.categoria?.trim() || null,
      acciones_realizadas: campos.acciones_realizadas?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}
