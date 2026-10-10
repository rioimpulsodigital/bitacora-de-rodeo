// Helper central de fecha de negocio (BIT-12) — la zona de negocio de todo
// el proyecto es America/Argentina/Buenos_Aires (BIT-61). Esto NO modela la
// regla como un offset fijo "-03:00" (eso fue útil en BIT-61/BIT-63 para
// reconstruir un INSTANTE real a partir de fecha+hora de pared ya
// guardadas, un problema distinto) -- lo que BIT-12 necesita es más simple
// y más general: dado un instante real (timestamptz), ¿a qué día
// calendario de Argentina corresponde? Eso se resuelve enteramente con
// `Intl.DateTimeFormat` + `timeZone`, sin ningún offset literal en ningún
// lado -- correcto incluso si Argentina alguna vez cambiara de offset.
//
// Nunca usar `toISOString()`/getters UTC para esto (ver el bug real de
// BIT-61: la fecha se adelantaba un día pasadas las 21:00 ART).

export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';

// Día calendario de Argentina ('YYYY-MM-DD') de un instante real
// (timestamptz, Date, o cualquier valor que `new Date()` acepte). Única
// función que debe usarse para convertir una columna `timestamptz` (hoy:
// observaciones_campo.created_at) al día que corresponde a efectos de
// negocio -- columnas `date` (fecha de jornadas/visitas/atenciones/
// novedades) NO necesitan esto, ya son un día calendario sin zona horaria.
export function diaLocalDe(instante) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instante));
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

// Día calendario de Argentina de "ahora". Para el date picker del
// Informe Diario (default: hoy) -- mismo criterio que
// jornadas/operativa.js, reescrito acá en términos de diaLocalDe() para
// no duplicar la llamada a Intl.DateTimeFormat por separado.
export function hoyLocal() {
  return diaLocalDe(new Date());
}

// Último día de un mes dado como 'YYYY-MM' (para el selector de Informe
// Mensual). Aritmética de calendario pura -- no cruza ningún instante
// real ni columna timestamptz, así que no hay nada que resolver en
// términos de zona horaria: `new Date(año, mes, 0)` y `.getDate()` son
// getters LOCALES del propio Date (nunca UTC), se usan consistentemente
// de un lado al otro sin pasar por ningún string ISO intermedio.
export function ultimoDiaDelMes(anioMes) {
  const [anio, mes] = anioMes.split('-').map(Number);
  const dia = new Date(anio, mes, 0).getDate();
  return `${anioMes}-${String(dia).padStart(2, '0')}`;
}

export function primerDiaDelMes(anioMes) {
  return `${anioMes}-01`;
}
