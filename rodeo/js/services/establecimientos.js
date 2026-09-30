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
  // `catastro_equino_habilitado` (BIT-50): capacidad por establecimiento.
  // Si la migración todavía no corrió en el entorno, Postgres responde
  // 42703 (columna inexistente): se reintenta sin ella y ningún
  // establecimiento queda habilitado -- el resto de la app sigue igual.
  let { data, error } = await supabase
    .from('establecimientos')
    .select('id, nombre, catastro_equino_habilitado')
    .order('nombre');

  if (error && error.code === '42703') {
    ({ data, error } = await supabase
      .from('establecimientos')
      .select('id, nombre')
      .order('nombre'));
  }

  if (error) throw error;
  return data;
}

// Capacidad "Catastro Equino" del establecimiento (BIT-50). Nunca se
// decide por nombre: solo por la propiedad real.
export function tieneCatastroEquino(establecimiento) {
  return establecimiento?.catastro_equino_habilitado === true;
}

export function getEstablecimientoActivoId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setEstablecimientoActivoId(id) {
  localStorage.setItem(STORAGE_KEY, id);
}
