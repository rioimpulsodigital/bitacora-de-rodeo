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
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) throw error;
  return data;
}

// BIT-61: Jornada activa = la más reciente del propio profesional, sin
// hora_salida y sin enviar a la Papelera. Se filtra SIEMPRE por
// profesional_id explícito (no alcanza con dejarlo a la policy): un
// ADMINISTRADOR puede ver jornadas ajenas por RLS, pero acá necesitamos
// específicamente "la jornada activa de QUIEN está mirando la pantalla",
// nunca la de otra persona. No existe columna de estado -- "activa" se
// deriva de hora_salida IS NULL, igual que en el resto del módulo.
export async function getJornadaActivaPropia(profesionalId) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('id, fecha, hora_llegada, hora_salida, notas, profesional_id')
    .eq('profesional_id', profesionalId)
    .is('hora_salida', null)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .order('hora_llegada', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getJornada(id) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('id, fecha, hora_llegada, hora_salida, notas, profesional_id')
    .eq('id', id)
    .is('deleted_at', null)
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

// Enviar a la Papelera (BIT-49, reemplaza la mitigación de BIT-45): soft-delete
// server-side vía soft_delete_jornada(). El dueño o un ADMINISTRADOR pueden
// hacerlo; la función valida rol/propiedad y toma el actor de auth.uid(). El
// cliente NUNCA hace DELETE físico sobre `jornadas` (no existe esa función acá).
// Restaurar / eliminar definitivamente / ver la Papelera viven en
// modules/papelera y son solo ADMINISTRADOR.
export async function enviarJornadaAPapelera(id) {
  const { error } = await supabase.rpc('soft_delete_jornada', { p_jornada_id: id });
  if (error) throw error;
}
