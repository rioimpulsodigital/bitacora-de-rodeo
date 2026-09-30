// Servicios del Módulo Catastro (BIT-50) — alta rápida de equinos de
// Fundación Dolly como Paciente Animal (`animales`).
//
// Autonomía de módulo (convención vigente en el proyecto, ver
// modules/animales, modules/visitas): este servicio NO importa
// modules/animales/services.js -- hace su propio acceso a `animales` y
// `personas`, igual que el resto de los módulos que ya replican sus propios
// selectores en vez de cruzar imports entre módulos de dominio.
//
// Estos equinos son Paciente Animal común y corriente -- mismas tablas,
// mismas columnas, mismo RLS que el resto de la app. Este archivo no crea
// ningún modelo ni tabla paralela.

import { supabase } from '../../../../js/core/supabase-client.js';

const NOMBRE_TUTOR_MUNICIPAL = 'Área de Rescate Equino de la Municipalidad de Corrientes';

// Cacheado en memoria del módulo durante la sesión de catastro -- evita
// resolver el Tutor en cada alta cuando Etel carga muchos animales
// seguidos. Se pierde al recargar la página (comportamiento esperado: se
// vuelve a resolver, es una sola consulta liviana).
let tutorIdCache = null;

// Resuelve el id de la Persona-Tutor municipal por nombre exacto (RLS de
// `personas` no está scopeada por establecimiento -- ver
// migration-BIT-11-fix-personas-rls.sql -- así que esta búsqueda no
// necesita el establecimiento para el SELECT). Si por algún motivo la
// migración de alta (migration-BIT-50-establecimiento-dolly.sql) todavía
// no corrió en el entorno actual, cae a crearla vía la RPC existente --
// nunca un INSERT directo sobre `personas` (vía cerrada en BIT-11).
export async function resolverTutorMunicipal(establecimientoId) {
  if (tutorIdCache) return tutorIdCache;

  const { data, error } = await supabase
    .from('personas')
    .select('id')
    .eq('nombre', NOMBRE_TUTOR_MUNICIPAL)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    tutorIdCache = data.id;
    return tutorIdCache;
  }

  const { data: nueva, error: errorRpc } = await supabase
    .rpc('crear_persona_con_establecimiento', {
      p_nombre: NOMBRE_TUTOR_MUNICIPAL,
      p_telefono: null,
      p_email: null,
      p_establecimiento_id: establecimientoId,
    })
    .single();
  if (errorRpc) throw errorRpc;

  tutorIdCache = nueva.id;
  return tutorIdCache;
}

// Sube la foto ANTES de crear el Paciente (ver nota de RLS en
// migration-BIT-50-catastro-equinos.sql: animales_update excluye
// OPERADOR_CAMPO, animales_insert no -- por eso nunca hay un UPDATE
// posterior). El nombre de archivo lo genera el cliente porque el id del
// Paciente todavía no existe en este punto del flujo.
async function subirFotoPaciente(establecimientoId, file) {
  const extCruda = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const ext = /^[a-z0-9]{1,5}$/.test(extCruda) ? extCruda : 'jpg';
  const path = `${establecimientoId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('paciente-fotos')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw error;

  return path;
}

// Alta rápida: especie fija en 'equino' (Fundación Dolly es un rescate
// exclusivamente equino -- no se le pregunta a Etel un dato que en este
// flujo no varía nunca, mismo criterio que Tutor/Establecimiento
// automáticos). `nombre` es la representación reutilizada de "Número de
// Identificación" (ver decisión técnica en el informe de BIT-50) -- puede
// quedar null si el caballo no tiene identificación visible; el resto de
// la app ya muestra ese caso como "—", no como un error.
export async function crearEquinoCatastro(campos, establecimientoId, tutorResponsableId) {
  let fotoUrl = null;
  if (campos.fotoFile) {
    fotoUrl = await subirFotoPaciente(establecimientoId, campos.fotoFile);
  }

  const { data, error } = await supabase
    .from('animales')
    .insert({
      especie: 'equino',
      nombre: campos.sinIdentificacion ? null : (campos.nombre?.trim() || null),
      sexo: campos.sexo || null,
      pelaje: campos.pelaje?.trim() || null,
      edad_aproximada_anios: campos.edadAproximadaAnios,
      foto_url: fotoUrl,
      tutor_responsable_id: tutorResponsableId,
      establecimiento_actual_id: establecimientoId,
    })
    .select('id, nombre')
    .single();
  if (error) throw error;

  return data;
}
