// Matriz de acceso por rol en el FRONTEND (BIT-70). Es solo navegación y
// coherencia de la UI: la frontera real de seguridad es RLS/ACL en la base
// de datos. Cada regla acá replica una decisión YA documentada en las
// Notas de Trabajo / Handoff; no se agregan capacidades nuevas. Lo que no
// tiene decisión documentada NO se resuelve acá (ver informe de BIT-70).

// Decisiones vigentes:
//  - Visitas: OPERADOR_CAMPO no ve el módulo, ni crea ni edita (15 Sep 2026).
//  - Atenciones Clínicas: OPERADOR_CAMPO sin acceso clínico (13 Ago 2026).
const MODULOS = new Set(['dashboard', 'jornadas', 'visitas', 'novedades',
  'observaciones', 'animales', 'catastro', 'atenciones', 'informes', 'papelera', 'usuarios']);
const ROLES_EXISTENTES = new Set(['ADMINISTRADOR', 'PROFESIONAL', 'OPERADOR_CAMPO']);
const MODULOS_ASISTENTE = new Set(['dashboard', 'novedades', 'animales', 'atenciones']);

// BIT-75/BIT-56-46: un perfil inactivo (o sin el campo) no accede a ningún módulo: falla cerrado.
// Es solo UI; RLS/RPC ya contienen al usuario inactivo en el servidor.
export function perfilActivo(perfil) {
  return perfil?.activo === true;
}

export function puedeAccederModulo(perfil, modulo) {
  if (!perfilActivo(perfil)) return false;
  if (!MODULOS.has(modulo)) return false;
  if (perfil?.rol === 'ASISTENTE_VETERINARIO') return MODULOS_ASISTENTE.has(modulo);
  if (!ROLES_EXISTENTES.has(perfil?.rol)) return false;
  if (modulo === 'papelera' || modulo === 'usuarios') return perfil.rol === 'ADMINISTRADOR';
  return perfil.rol !== 'OPERADOR_CAMPO' || !['visitas', 'atenciones'].includes(modulo);
}

export function renderSinAccesoModulo(contenedor, nombreModulo) {
  contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No tenés acceso a ${nombreModulo}.</p></div>`;
}

// Atenciones: ADMINISTRADOR edita cualquiera; PROFESIONAL solo las que tiene
// como responsable (profesional_responsable_id). Mismo criterio que
// atenciones/list.js y atenciones/detail.js.
export function puedeEditarAtencion(perfil, atencion) {
  if (atencion?.estado_validacion === 'BORRADOR') {
    return perfil?.rol === 'ASISTENTE_VETERINARIO' && atencion.created_by === perfil.id;
  }
  if (atencion?.estado_validacion === 'PENDIENTE_VALIDACION') {
    return perfil?.rol === 'PROFESIONAL' && atencion.profesional_responsable_id === perfil.id;
  }
  if (atencion?.estado_validacion === 'VALIDADA') return false;
  if (perfil?.rol === 'ADMINISTRADOR') return true;
  return perfil?.rol === 'PROFESIONAL' && atencion?.profesional_responsable_id === perfil.id;
}

// Novedades: ADMINISTRADOR y PROFESIONAL editan; el resto, solo las propias
// (created_by). Mismo criterio que novedades/list.js y novedades/detail.js.
export function puedeEditarNovedad(perfil, novedad) {
  if (perfil?.rol === 'ASISTENTE_VETERINARIO') return false;
  if (perfil?.rol === 'ADMINISTRADOR' || perfil?.rol === 'PROFESIONAL') return true;
  return perfil?.rol === 'OPERADOR_CAMPO' && Boolean(perfil.id) && novedad?.created_by === perfil.id;
}

export function puedeEditarPaciente(perfil) {
  return perfil?.rol === 'ADMINISTRADOR' || perfil?.rol === 'PROFESIONAL';
}

// BIT-70-20/R-04: la misma matriz que las policies de lotes y membresias.
export function puedeGestionarLotes(perfil) {
  return perfil?.rol === 'ADMINISTRADOR' || perfil?.rol === 'PROFESIONAL';
}
