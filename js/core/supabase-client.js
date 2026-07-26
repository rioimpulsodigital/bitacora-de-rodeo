// Cliente único de Supabase para toda la app. Cualquier módulo que
// necesite hablar con Supabase (Auth hoy, base de datos más adelante)
// importa `supabase` desde acá — nunca crea un cliente propio.
//
// La anon key es pública por diseño (no es un secreto) — la protección
// real de los datos llega con Row Level Security en BIT-04, todavía
// pendiente. Hasta entonces, cualquier sesión válida puede leer/escribir
// sin restricción a nivel de fila.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://tejnjojuoiuehnpsynof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IjilyAqmcQrIw7a2f0sC5A_HFBzjb81';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
