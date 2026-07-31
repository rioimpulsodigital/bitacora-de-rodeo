// Servicio de Establecimientos — capa fina sobre la tabla `establecimientos`
// y la persistencia local del establecimiento activo (BIT-04/BIT-05).
//
// La lista que devuelve `getEstablecimientosAccesibles` ya viene filtrada
// por RLS del lado del servidor (política `tiene_acceso_establecimiento`,
// BIT-04) — un ADMINISTRADOR ve todos, un PROFESIONAL/OPERADOR_CAMPO solo
// los suyos. Acá no se repite ese filtro.

import { supabase } from '../../../js/core/supabase-client.js';

const STORAGE_KEY = 'rodeo_establecimiento_activo';

export async function getEstablecimientosAccesibles() {
  const { data, error } = await supabase
    .from('establecimientos')
    .select('id, nombre')
    .order('nombre');

  if (error) throw error;
  return data;
}

export function getEstablecimientoActivoId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setEstablecimientoActivoId(id) {
  localStorage.setItem(STORAGE_KEY, id);
}
