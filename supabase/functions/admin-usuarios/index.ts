// BIT-75 — Envoltorio Supabase Edge Function (Deno). NO desplegado: requiere autorizacion expresa.
// Secretos (los define Supabase en el entorno del proyecto; jamas en el repo ni en el frontend):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provistos por la plataforma),
//   ALLOWED_ORIGINS (coma-separado), APP_REDIRECT_URL (URL de restablecer.html (raiz del sitio)).
// Desplegar con verify_jwt=true: la plataforma exige un JWT y el handler lo vuelve a validar.
import { crearHandler } from './handler.mjs';

Deno.serve(crearHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  origenesPermitidos: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  redirectTo: Deno.env.get('APP_REDIRECT_URL')!,
}));
