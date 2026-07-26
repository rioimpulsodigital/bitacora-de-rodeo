// Wrapper mínimo sobre Supabase Auth. Ningún módulo ni pantalla debe
// llamar a supabase.auth.* directamente — todo pasa por acá, para que
// un cambio de proveedor de auth a futuro toque un solo archivo.

import { supabase } from './supabase-client.js';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supabase.auth.signOut();
}
