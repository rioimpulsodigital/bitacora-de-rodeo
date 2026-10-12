// Exportación de un Informe (BIT-12) como texto plano apto para
// WhatsApp (BIT-16). Lee el mismo objeto `Informe` que ya consume
// render.js -- nunca vuelve a consultar Supabase ni reconstruye nada.
// La representación textual y la visual son independientes entre sí,
// pero ambas derivan del mismo modelo: ninguna inventa datos que la
// otra no tenga, ninguna presenta una Observación como Atención
// Clínica, ninguna duplica un evento por sus relaciones (los pacientes
// mencionados son un resumen aparte, no una fuente más).
//
// Texto plano, sin HTML -- el *bold* de abajo es el formato nativo de
// WhatsApp (asteriscos), no Markdown que dependa de un renderizador.
// BIT-16 solo genera el texto; el envío (BIT-17) reutiliza esta función
// sin acoplarse a ningún detalle de cómo se construye.

import { etiquetaPaciente } from '../../services/paciente-label.js';
import { diaLocalDe } from '../../services/fecha-argentina.js';

const LABEL_TIPO_VISITA = {
  programada: 'Programada', seguimiento: 'Seguimiento', emergencia: 'Emergencia',
  control: 'Control', sanitaria: 'Sanitaria', otro: 'Otro',
};
const LABEL_ORIGEN = { atencion: 'atención', observacion: 'observación', novedad: 'novedad' };

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtHora(t) {
  return t ? t.slice(0, 5) : '—';
}

function lineasJornadas(filas) {
  return filas.map((j) => `• Llegada ${fmtHora(j.hora_llegada)} — Salida ${fmtHora(j.hora_salida)}${j.notas ? ` (${j.notas})` : ''}`);
}

function lineasVisitas(filas) {
  return filas.map((v) => `• ${LABEL_TIPO_VISITA[v.tipo] ?? v.tipo} (${v.estado === 'abierta' ? 'Abierta' : 'Cerrada'})${v.notas ? ` — ${v.notas}` : ''}`);
}

function lineasAtenciones(filas) {
  return filas.map((a) => {
    const paciente = a.animales ? ` — Paciente: ${etiquetaPaciente(a.animales)}` : '';
    const diagnostico = a.diagnostico ? ` (${a.diagnostico})` : '';
    return `• ${a.motivo ?? '—'}${paciente}${diagnostico}`;
  });
}

// Observaciones no tiene columna `fecha` propia -- misma fuente real
// que usa render.js (diaLocalDe sobre created_at, zona Argentina),
// para que un Informe de varios días no quede ambiguo sobre a qué
// fecha pertenece cada una.
function lineasObservaciones(filas) {
  return filas.map((o) => {
    const paciente = o.animales ? ` — Paciente: ${etiquetaPaciente(o.animales)}` : '';
    return `• ${fmtFecha(diaLocalDe(o.created_at))}: ${o.descripcion}${paciente}`;
  });
}

function lineasNovedades(filas) {
  return filas.map((n) => `• ${n.descripcion ?? '—'}${n.animales ? ` — Paciente: ${etiquetaPaciente(n.animales)}` : ''}`);
}

// Una sección entera se omite si no tiene filas -- nunca "(0)" ni un
// título vacío. Criterio explícito de BIT-16: una salida breve y
// legible vale más que listar sistemáticamente todas las fuentes.
function seccion(titulo, filas, construirLineas) {
  if (filas.length === 0) return '';
  return `${titulo} (${filas.length})\n${construirLineas(filas).join('\n')}`;
}

function bloqueEstablecimiento(bloque) {
  const partes = [`*📍 ${bloque.establecimiento.nombre}*`];

  // Jornada no lleva "(N)" -- en la práctica es 0 o 1 por día, listarla
  // como las demás fuentes sería ruido sin aportar nada.
  if (bloque.jornadas.length > 0) {
    partes.push(`🕒 Jornada\n${lineasJornadas(bloque.jornadas).join('\n')}`);
  }
  const visitas = seccion('📍 Visitas', bloque.visitas, lineasVisitas);
  if (visitas) partes.push(visitas);
  const atenciones = seccion('🩺 Atenciones Clínicas', bloque.atenciones, lineasAtenciones);
  if (atenciones) partes.push(atenciones);
  const observaciones = seccion('📝 Observaciones de Campo', bloque.observaciones, lineasObservaciones);
  if (observaciones) partes.push(observaciones);
  const novedades = seccion('📰 Novedades', bloque.novedades, lineasNovedades);
  if (novedades) partes.push(novedades);

  // Pacientes mencionados -- mismo resumen que render.js
  // (pacientesRelacionados, dedup por animal.id preservando de dónde
  // viene cada mención), nunca una fuente nueva ni una relectura de los
  // eventos ya listados arriba.
  if (bloque.pacientesRelacionados.length > 0) {
    const lista = bloque.pacientesRelacionados
      .map((p) => `${etiquetaPaciente(p.animal)} (${p.origenes.map((o) => LABEL_ORIGEN[o] ?? o).join(', ')})`)
      .join(', ');
    partes.push(`🐾 Pacientes mencionados: ${lista}`);
  }

  return partes.join('\n\n');
}

// Construye el texto completo -- mismo objeto Informe que usa
// render.js, cero consultas nuevas. `desde === hasta` identifica un
// Informe de un solo día (Diario); si difieren, se encabeza como rango.
// Generalización mínima para que BIT-17 (y un eventual Mensual-a-texto)
// puedan reutilizar esta misma función sin reescribirla -- BIT-16 no
// expone esa UX hoy, solo deja la función lista.
export function construirTextoInforme(informe) {
  const encabezadoFecha = informe.desde === informe.hasta
    ? `*INFORME DIARIO — ${fmtFecha(informe.desde)}*`
    : `*INFORME — ${fmtFecha(informe.desde)} al ${fmtFecha(informe.hasta)}*`;
  const encabezado = `${encabezadoFecha}\nProfesional: ${informe.profesional.nombre}`;

  if (informe.establecimientos.length === 0) {
    return `${encabezado}\n\nSin actividad registrada en los establecimientos seleccionados.`;
  }

  const bloques = informe.establecimientos.map(bloqueEstablecimiento).join('\n\n────────────\n\n');
  const totalLinea = `*Total: ${informe.resumenGeneral.totalEventos} evento(s) en ${informe.resumenGeneral.totalEstablecimientos} establecimiento(s).*`;

  return [encabezado, bloques, totalLinea].join('\n\n');
}
