// Servicio de Perfiles — capa fina sobre la tabla `perfiles` (BIT-04).
// Ninguna pantalla de rodeo/ debe consultar `perfiles` directamente.

import { supabase } from '../../../js/core/supabase-client.js';

// Devuelve el perfil del usuario autenticado, o null si la cuenta
// existe en auth.users pero todavía no tiene fila en `perfiles`
// (provisionamiento manual incompleto — ver BIT-04, sección 13.1).
export async function getPerfilActual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
