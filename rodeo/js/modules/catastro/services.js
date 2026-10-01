// Servicios del Módulo Catastro Equino (BIT-50) — alta rápida de equinos
// como Paciente Animal (`animales`) en los establecimientos que tienen la
// capacidad habilitada (`establecimientos.catastro_equino_habilitado`).
//
// Autonomía de módulo (convención vigente en el proyecto, ver
// modules/animales, modules/visitas): este servicio NO importa
// modules/animales/services.js -- hace su propio acceso a `animales`,
// igual que el resto de los módulos que ya replican sus propios
// selectores en vez de cruzar imports entre módulos de dominio.
//
// Estos equinos son Paciente Animal común y corriente -- mismas tablas,
// mismas columnas, mismo RLS que el resto de la app. Este archivo no crea
// ningún modelo ni tabla paralela.

import { supabase } from '../../../../js/core/supabase-client.js';

const BUCKET_FOTOS = 'paciente-fotos';
const MAX_FOTO_BYTES = 8 * 1024 * 1024; // mismo límite que el bucket (8 MB)
const MIME_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// Error con mensaje ya listo para mostrar. `causa` conserva el error
// original (Supabase/Storage/red) para diagnóstico técnico: además se
// loguea completo en consola.
export class ErrorCatastro extends Error {
  constructor(mensaje, causa) {
    super(mensaje);
    this.name = 'ErrorCatastro';
    this.causa = causa ?? null;
  }
}

// Validación previa al upload: el servidor igual rechaza (bucket con
// límite y MIME), esto solo evita subir 8 MB por datos móviles para
// enterarse recién después. Si el navegador no informa `type` (pasa con
// algunos HEIC), se deja decidir al servidor.
export function validarFoto(file) {
  if (file.size > MAX_FOTO_BYTES) {
    return 'La foto pesa más de 8 MB. Sacala de nuevo o elegí una más liviana.';
  }
  if (file.type && !MIME_FOTO_PERMITIDOS.includes(file.type)) {
    return 'Formato de foto no permitido. Usá JPG, PNG, WebP o HEIC.';
  }
  return null;
}

// Traduce errores esperables de este flujo a español. No oculta el error
// real: se loguea completo en consola y viaja en `ErrorCatastro.causa`.
function traducirError(err, etapa) {
  console.error(`[Catastro Equino] error en ${etapa}:`, err);
  const msg = String(err?.message ?? '').toLowerCase();
  const code = String(err?.code ?? err?.statusCode ?? err?.status ?? '');

  if (/failed to fetch|networkerror|network request failed|load failed/.test(msg)) {
    return new ErrorCatastro('No hay conexión con el servidor. Revisá tu señal e intentá de nuevo.', err);
  }
  if (etapa === 'foto') {
    if (/maximum allowed size|payload too large|too large/.test(msg) || code === '413') {
      return new ErrorCatastro('La foto pesa más de 8 MB. Sacala de nuevo o elegí una más liviana.', err);
    }
    if (/mime type|not supported|invalid mime|unsupported/.test(msg) || code === '415') {
      return new ErrorCatastro('Formato de foto no permitido. Usá JPG, PNG, WebP o HEIC.', err);
    }
    if (/row-level security|unauthorized|not authorized|violates/.test(msg) || code === '403' || code === '42501') {
      return new ErrorCatastro('No tenés permiso para subir fotos en este establecimiento.', err);
    }
    return new ErrorCatastro('No se pudo subir la foto. El caballo no se guardó; intentá de nuevo.', err);
  }
  if (code === '42501' || /row-level security|permission denied/.test(msg)) {
    return new ErrorCatastro('No tenés permiso para registrar pacientes en este establecimiento.', err);
  }
  if (code === '22003' || code === '22001' || code === '23514' || /out of range|check constraint|too long/.test(msg)) {
    return new ErrorCatastro('Alguno de los datos está fuera de rango (revisá la edad y los textos). El caballo no se guardó.', err);
  }
  if (code === '23502') {
    return new ErrorCatastro('La base de datos pide un dato obligatorio que este formulario no envía. Avisá al equipo técnico.', err);
  }
  return new ErrorCatastro('No se pudo guardar el caballo. Intentá de nuevo; si sigue fallando, avisá al equipo técnico.', err);
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
  if (error) throw traducirError(error, 'foto');

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

// Alta rápida: especie fija en 'equino' porque el módulo ES el catastro
// equino -- no se pregunta un dato que en este flujo no varía nunca.
//
// Tutor Responsable: este flujo NO lo envía (queda NULL). Un organismo
// interviniente no es necesariamente el Tutor del animal, y no se inventa
// una relación para satisfacer el modelo; se completa después desde la
// edición normal del Paciente. Requiere que `tutor_responsable_id` admita
// NULL en la base -- ver animales/migration-BIT-50-tutor-nullable.sql
// (H-15: Producción lo tenía NOT NULL; decisión de dominio de Bren/KLIAM).
//
// `numero_identificacion` es un atributo propio, DISTINTO de `nombre`
// (revisión estratégica de BIT-50, 30-09-2026): `nombre` es el nombre
// propio del animal en el resto de la app (selectores de Atenciones,
// listado de Pacientes) -- una caravana/marca de campo no es un nombre.
// Este flujo nunca escribe `nombre`. Puede quedar `numero_identificacion
// = null` si el caballo no tiene identificación visible; el resto de la
// app ya muestra ese caso como "—", no como un error -- no se fabrica un
// identificador falso.
export async function crearEquinoCatastro(campos, establecimientoId) {
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
      establecimiento_actual_id: establecimientoId,
    })
    .select('id, numero_identificacion')
    .single();

  if (error) {
    if (fotoPath) await limpiarFotoHuerfana(fotoPath);
    throw traducirError(error, 'guardar');
  }

  return data;
}
