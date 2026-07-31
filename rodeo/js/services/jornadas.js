// Servicio de Jornadas — capa fina sobre la tabla `jornadas` (BIT-02/04).
// Ningún módulo debe consultar `jornadas` directamente.
//
// Jornada es puramente personal (RLS: profesional_id = auth.uid(), o
// is_admin() para select/delete) — no tiene dimensión de Establecimiento,
// así que este servicio no recibe ni filtra por establecimiento activo.

import { supabase } from '../../../js/core/supabase-client.js';

export async function listJornadas() {
  const { data, error } = await supabase
    .from('jornadas')
    .select('id, fecha, hora_llegada, hora_salida, notas, profesional_id, perfiles(nombre)')
    .order('fecha', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getJornada(id) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('id, fecha, hora_llegada, hora_salida, notas, profesional_id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function crearJornada(campos, profesionalId) {
  const { error } = await supabase.from('jornadas').insert({
    profesional_id: profesionalId,
    fecha: campos.fecha,
    hora_llegada: campos.hora_llegada || null,
    hora_salida: campos.hora_salida || null,
    notas: campos.notas || null,
  });

  if (error) throw error;
}

export async function actualizarJornada(id, campos) {
  const { error } = await supabase
    .from('jornadas')
    .update({
      fecha: campos.fecha,
      hora_llegada: campos.hora_llegada || null,
      hora_salida: campos.hora_salida || null,
      notas: campos.notas || null,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function eliminarJornada(id) {
  const { error } = await supabase.from('jornadas').delete().eq('id', id);
  if (error) throw error;
}
