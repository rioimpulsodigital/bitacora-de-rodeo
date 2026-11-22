// Contexto de establecimiento activo (BIT-70). Un usuario puede estar
// autorizado en varios establecimientos (RLS resuelve QUIÉN puede ver qué),
// pero cada pantalla trabaja en UNO solo: el activo. Este módulo concentra
// las reglas que impiden que una pantalla muestre, conserve o modifique un
// registro de un establecimiento distinto del activo. Son controles de
// coherencia del frontend; NO reemplazan a RLS, que sigue siendo la
// frontera de seguridad de los datos.

import { escapeHtml } from '../dashboard.js';

export const MENSAJE_CONTEXTO_CAMBIO =
  'El establecimiento activo cambió mientras trabajabas en esta pantalla. No se guardó nada; volvé al listado y repetí la operación en el establecimiento correcto.';

// Valida un id contra la lista de establecimientos ACCESIBLES (la que ya
// devuelve RLS). Devuelve el id si pertenece a esa lista, o null. Nunca
// "repara" ni adivina: un valor ajeno (localStorage manipulado, <option>
// alterado en el DOM, valor vacío) simplemente no es un contexto válido.
export function validarEstablecimientoAccesible(id, establecimientos) {
  if (typeof id !== 'string' || id === '') return null;
  return (establecimientos ?? []).some((e) => e.id === id) ? id : null;
}

// ¿El registro pertenece al establecimiento activo? Un registro que no
// declara establecimiento (null/undefined) no se considera ajeno: es el mismo
// criterio de Jornadas desde BIT-61. Sin establecimiento activo, nada es "del
// contexto".
export function perteneceAlContexto(registroEstablecimientoId, ctx) {
  const activo = ctx?.establecimientoActivoId;
  if (!activo) return false;
  if (registroEstablecimientoId === null || registroEstablecimientoId === undefined) return true;
  return registroEstablecimientoId === activo;
}

function nombreDe(ctx, establecimientoId) {
  return ctx?.establecimientos?.find((e) => e.id === establecimientoId)?.nombre ?? null;
}

// Respuesta controlada ante un registro de otro establecimiento: no
// se renderiza ningún dato del registro, no se auto-cambia el
// establecimiento activo (sería una decisión silenciosa del sistema) y se
// explica qué hacer. Mismo criterio que jornadas/form.js (BIT-61).
export function renderFueraDeContexto(contenedor, ctx, { entidad, registroEstablecimientoId, hrefVolver, textoVolver = 'Volver al listado' }) {
  const nombre = nombreDe(ctx, registroEstablecimientoId) ?? 'otro establecimiento';
  contenedor.innerHTML = `
    <div class="rodeo-card">
      <p class="rodeo-error">Este registro (${escapeHtml(entidad)}) pertenece a <strong>${escapeHtml(nombre)}</strong>, no al establecimiento activo. Cambiá de establecimiento arriba para consultarlo, o volvé al listado.</p>
      <a href="${escapeHtml(hrefVolver)}" class="rodeo-link-btn" style="margin-left:0">${escapeHtml(textoVolver)}</a>
    </div>`;
}

// Atajo para las pantallas de detalle/formulario: devuelve true (y deja la
// respuesta controlada en pantalla) si el registro es ajeno al contexto.
export function bloquearSiEsAjeno(contenedor, ctx, registroEstablecimientoId, opciones) {
  if (perteneceAlContexto(registroEstablecimientoId, ctx)) return false;
  renderFueraDeContexto(contenedor, ctx, { ...opciones, registroEstablecimientoId });
  return true;
}

// Fotografía del contexto al montar una pantalla, para volver a comprobarla
// justo antes de persistir (defensa en profundidad: el cambio de
// establecimiento recarga la app, pero un guardado nunca debe depender de
// que eso haya ocurrido a tiempo).
export function capturarContexto(ctx) {
  return ctx?.establecimientoActivoId ?? null;
}

export function contextoSigueVigente(ctx, capturado) {
  return (ctx?.establecimientoActivoId ?? null) === capturado;
}
