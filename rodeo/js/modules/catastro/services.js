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
const BUCKET_FOTOS = 'paciente-fotos';

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
// Paciente todavía no existe en este punto del flujo. Devuelve el PATH
// (object key) dentro del bucket -- no una URL: el bucket es privado y una
// signed URL es temporal, no una referencia persistente (ver
// migration-BIT-50-storage-fotos.sql).
async function subirFotoPaciente(establecimientoId, file) {
  const extCruda = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const ext = /^[a-z0-9]{1,5}$/.test(extCruda) ? extCruda : 'jpg';
  const path = `${establecimientoId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw error;

  return path;
}

// Compensación de huérfanos: si el INSERT de `animales` falla DESPUÉS de
// subir la foto, el objeto queda en Storage sin ningún Paciente que lo
// referencie. Se intenta borrarlo de inmediato -- la policy de DELETE
// (ver migration-BIT-50-storage-fotos.sql) solo lo permite porque el
// propio uploader lo pide, sobre un establecimiento al que tiene acceso, Y
// porque ningún `animales.foto_path` lo referencia todavía (si ya se
// hubiera guardado, la policy lo protege incluso de su propio uploader).
// Best-effort: si el borrado también falla, no se vuelve a lanzar -- el
// usuario ya tiene el error real del INSERT: no tiene sentido tapar ese
// mensaje con un error secundario de limpieza. El huérfano queda para la
// revisión periódica documentada en la migración.
async function limpiarFotoHuerfana(path) {
  try {
    await supabase.storage.from(BUCKET_FOTOS).remove([path]);
  } catch {
    // silencioso a propósito -- ver comentario arriba.
  }
}

// Alta rápida: especie fija en 'equino' (Fundación Dolly es un rescate
// exclusivamente equino -- no se le pregunta a Etel un dato que en este
// flujo no varía nunca, mismo criterio que Tutor/Establecimiento
// automáticos).
//
// `numero_identificacion` es un atributo propio, DISTINTO de `nombre`
// (revisión estratégica de BIT-50, 30-09-2026): `nombre` es el nombre
// propio del animal en el resto de la app (selectores de Atenciones,
// listado de Pacientes) -- una caravana/marca de campo no es un nombre.
// Este flujo nunca escribe `nombre`. Puede quedar `numero_identificacion
// = null` si el caballo no tiene identificación visible; el resto de la
// app ya muestra ese caso como "—", no como un error -- no se fabrica un
// identificador falso.
export async function crearEquinoCatastro(campos, establecimientoId, tutorResponsableId) {
  let fotoPath = null;
  if (campos.fotoFile) {
    fotoPath = await subirFotoPaciente(establecimientoId, campos.fotoFile);
  }

  const { data, error } = await supabase
    .from('animales')
    .insert({
      especie: 'equino',
      numero_identificacion: campos.sinIdentificacion ? null : (campos.numeroIdentificacion?.trim() || null),
      sexo: campos.sexo || null,
      pelaje: campos.pelaje?.trim() || null,
      edad_aproximada_anios: campos.edadAproximadaAnios,
      foto_path: fotoPath,
      tutor_responsable_id: tutorResponsableId,
      establecimiento_actual_id: establecimientoId,
    })
    .select('id, numero_identificacion')
    .single();

  if (error) {
    if (fotoPath) await limpiarFotoHuerfana(fotoPath);
    throw error;
  }

  return data;
}
