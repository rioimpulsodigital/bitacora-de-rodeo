// Servicios de la Papelera (BIT-48, piloto: solo Novedades).
// Todo pasa por funciones server-side específicas (SECURITY DEFINER) que
// validan rol ADMINISTRADOR y acceso al establecimiento -- el frontend nunca
// escribe deleted_at directamente ni hace DELETE. No existe (ni debe existir)
// una función genérica que reciba el nombre de una tabla: cada entidad que se
// sume a la Papelera trae sus propias funciones.

import { supabase } from '../../../../js/core/supabase-client.js';

export async function listNovedadesPapelera(establecimientoId) {
  const { data, error } = await supabase.rpc('listar_novedades_papelera', {
    p_establecimiento_id: establecimientoId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function restaurarNovedad(id) {
  const { error } = await supabase.rpc('restore_novedad', { p_novedad_id: id });
  if (error) throw error;
}

// confirmarAdjuntos = true solo cuando la UI ya le mostró al usuario cuántos
// adjuntos se eliminarán en cascada (novedades_adjuntos.novedad_id ON DELETE CASCADE).
export async function eliminarNovedadDefinitivamente(id, confirmarAdjuntos = false) {
  const { error } = await supabase.rpc('hard_delete_novedad', {
    p_novedad_id: id,
    p_confirmar_adjuntos: confirmarAdjuntos,
  });
  if (error) throw error;
}
