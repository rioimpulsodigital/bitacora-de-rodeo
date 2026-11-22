// Matriz de acceso por rol en el FRONTEND (BIT-70). Es solo navegación y
// coherencia de la UI: la frontera real de seguridad es RLS/ACL en la base
// de datos. Cada regla acá replica una decisión YA documentada en las
// Notas de Trabajo / Handoff; no se agregan capacidades nuevas. Lo que no
// tiene decisión documentada NO se resuelve acá (ver informe de BIT-70).

// Decisiones vigentes:
//  - Visitas: OPERADOR_CAMPO no ve el módulo, ni crea ni edita (15 Sep 2026).
//  - Atenciones Clínicas: OPERADOR_CAMPO sin acceso clínico (13 Ago 2026).
const MODULOS_SIN_ACCESO = {
  OPERADOR_CAMPO: new Set(['visitas', 'atenciones']),
};

export function puedeAccederModulo(perfil, modulo) {
  return !MODULOS_SIN_ACCESO[perfil?.rol]?.has(modulo);
}

export function renderSinAccesoModulo(contenedor, nombreModulo) {
  contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No tenés acceso a ${nombreModulo}.</p></div>`;
}

// Atenciones: ADMINISTRADOR edita cualquiera; PROFESIONAL solo las que tiene
// como responsable (profesional_responsable_id). Mismo criterio que
// atenciones/list.js y atenciones/detail.js.
export function puedeEditarAtencion(perfil, atencion) {
  if (perfil?.rol === 'ADMINISTRADOR') return true;
  return perfil?.rol === 'PROFESIONAL' && atencion?.profesional_responsable_id === perfil.id;
}

// Novedades: ADMINISTRADOR y PROFESIONAL editan; el resto, solo las propias
// (created_by). Mismo criterio que novedades/list.js y novedades/detail.js.
export function puedeEditarNovedad(perfil, novedad) {
  if (perfil?.rol === 'ADMINISTRADOR' || perfil?.rol === 'PROFESIONAL') return true;
  return Boolean(perfil?.id) && novedad?.created_by === perfil.id;
}
