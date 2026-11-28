// BIT-75 — Servicio del módulo Usuarios. Toda operación pasa por la función de servidor
// `admin-usuarios` (que valida identidad, perfil activo y rol ADMINISTRADOR en cada petición).
// El navegador nunca usa claves privilegiadas ni escribe auth.users directamente.
import { supabase } from '../../../../js/core/supabase-client.js';

const MENSAJES = {
  sin_sesion: 'Tu sesión venció. Volvé a ingresar.',
  sesion_invalida: 'Tu sesión venció. Volvé a ingresar.',
  no_autorizado: 'No tenés autorización para administrar usuarios.',
};

async function invocar(accion, datos = {}) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: { accion, ...datos } });
  if (!error && data?.ok) return data;
  let cuerpo = data;
  if (error?.context && typeof error.context.json === 'function') {
    try { cuerpo = await error.context.json(); } catch { /* respuesta sin JSON */ }
  }
  const e = new Error(MENSAJES[cuerpo?.error] ?? cuerpo?.mensaje ?? 'No se pudo completar la operación. Reintentá en unos minutos.');
  e.codigo = cuerpo?.error ?? 'desconocido';
  throw e;
}

export const listarUsuarios = async () => (await invocar('listar')).usuarios;
export const crearUsuario = (d) => invocar('crear', d);
export const reenviarAcceso = (usuario_id) => invocar('reenviar', { usuario_id });
export const actualizarUsuario = (usuario_id, cambios) => invocar('actualizar', { usuario_id, ...cambios });
export const asignarEstablecimientos = (usuario_id, establecimientos) => invocar('establecimientos', { usuario_id, establecimientos });
export const desactivarUsuario = (usuario_id) => invocar('desactivar', { usuario_id });
export const activarUsuario = (usuario_id) => invocar('activar', { usuario_id });

// Establecimientos existentes para asignar. El ADMINISTRADOR ve los suyos (RLS); BIT-41 (gestión de
// establecimientos) queda fuera de alcance: solo se seleccionan existentes.
export async function listarEstablecimientosSeleccionables() {
  const { data, error } = await supabase.from('establecimientos').select('id, nombre').order('nombre');
  if (error) throw error;
  return data;
}
