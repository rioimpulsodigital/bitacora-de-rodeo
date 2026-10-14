// Servicios del Módulo Animales y Lotes — todo acceso a datos pasa por acá.
// Tablas: animales, personas, personas_establecimientos, lotes, lotes_animales.
// La UI usa "Paciente Animal" en todos los textos visibles;
// el código técnico y las tablas mantienen el nombre "animales".

import { supabase } from '../../../../js/core/supabase-client.js';

// ── Personas (Tutores Responsables) ────────────────────────────

export async function listPersonas() {
  const { data, error } = await supabase
    .from('personas')
    .select('id, nombre')
    .order('nombre');
  if (error) throw error;
  return data;
}

// Crea la persona y su vínculo al establecimiento en una sola operación
// atómica vía RPC (crear_persona_con_establecimiento, SECURITY DEFINER).
// La función valida tiene_acceso_establecimiento() del lado del servidor
// antes de escribir nada -- personas no tiene establecimiento_id propio,
// así que ese control no puede hacerse con una policy de INSERT directa.
export async function crearPersona(campos, establecimientoId) {
  const { data, error } = await supabase
    .rpc('crear_persona_con_establecimiento', {
      p_nombre: campos.nombre.trim(),
      p_telefono: campos.telefono?.trim() || null,
      p_email: campos.email?.trim() || null,
      p_establecimiento_id: establecimientoId,
    })
    .single();
  if (error) throw error;
  return data;
}

// ── Lotes ───────────────────────────────────────────────────────

export async function listLotes(establecimientoId) {
  let q = supabase.from('lotes').select('id, nombre, notas');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('nombre');
  if (error) throw error;
  return data;
}

export async function getLote(id) {
  const { data, error } = await supabase
    .from('lotes')
    .select('id, nombre, notas, establecimiento_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearLote(campos) {
  const { error } = await supabase.from('lotes').insert({
    nombre: campos.nombre.trim(),
    establecimiento_id: campos.establecimiento_id,
    notas: campos.notas?.trim() || null,
  });
  if (error) throw error;
}

export async function actualizarLote(id, campos) {
  const { error } = await supabase
    .from('lotes')
    .update({ nombre: campos.nombre.trim(), notas: campos.notas?.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

// ── Animales (Pacientes) ─────────────────────────────────────────

export async function listAnimales(establecimientoId) {
  let q = supabase
    .from('animales')
    .select('id, nombre, numero_identificacion, especie, sexo, personas(nombre)');
  if (establecimientoId) q = q.eq('establecimiento_actual_id', establecimientoId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAnimal(id) {
  const { data, error } = await supabase
    .from('animales')
    .select('id, nombre, numero_identificacion, especie, sexo, pelaje, edad_aproximada_anios, foto_path, tutor_responsable_id, establecimiento_actual_id, fecha_nacimiento, notas, personas(id, nombre, telefono, email)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// BIT-13: la foto es opcional y se sube ANTES del INSERT (mismo motivo que
// crearEquinoCatastro en modules/catastro/services.js -- el id del Paciente
// no existe todavía en este punto, y animales_insert no restringe por rol
// mientras que animales_update sí, así que nunca conviene depender de un
// UPDATE posterior para completar la foto). Si el INSERT falla después de
// subir la foto, se compensa borrando el objeto huérfano -- la policy de
// DELETE de Storage ya lo permite porque ningún `animales.foto_path` llegó
// a referenciarlo.
export async function crearAnimal(campos, fotoFile) {
  let fotoPath = null;
  if (fotoFile) fotoPath = await subirFotoPaciente(campos.establecimiento_actual_id, fotoFile);

  const { data, error } = await supabase
    .from('animales')
    .insert({
      nombre: campos.nombre?.trim() || null,
      especie: campos.especie,
      // Tutor opcional (BIT-50/H-15): NULL = no conocido.
      tutor_responsable_id: campos.tutor_responsable_id || null,
      numero_identificacion: campos.numero_identificacion?.trim() || null,
      sexo: campos.sexo || null,
      pelaje: campos.pelaje?.trim() || null,
      edad_aproximada_anios: campos.edad_aproximada_anios ?? null,
      establecimiento_actual_id: campos.establecimiento_actual_id || null,
      fecha_nacimiento: campos.fecha_nacimiento || null,
      notas: campos.notas?.trim() || null,
      foto_path: fotoPath,
    })
    .select('id')
    .single();

  if (error) {
    if (fotoPath) await limpiarFotoHuerfana(fotoPath);
    throw error;
  }
  return data;
}

export async function actualizarAnimal(id, campos) {
  const { error } = await supabase
    .from('animales')
    .update({
      nombre: campos.nombre?.trim() || null,
      especie: campos.especie,
      // Tutor opcional (BIT-50/H-15): NULL = no conocido.
      tutor_responsable_id: campos.tutor_responsable_id || null,
      numero_identificacion: campos.numero_identificacion?.trim() || null,
      sexo: campos.sexo || null,
      pelaje: campos.pelaje?.trim() || null,
      edad_aproximada_anios: campos.edad_aproximada_anios ?? null,
      establecimiento_actual_id: campos.establecimiento_actual_id || null,
      fecha_nacimiento: campos.fecha_nacimiento || null,
      notas: campos.notas?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}

// Foto del Paciente (BIT-50): el bucket 'paciente-fotos' es PRIVADO y la DB
// guarda solo el path (animales.foto_path). Para mostrarla se pide una
// signed URL temporal en el momento de abrir la ficha -- nunca se guarda ni
// se cachea. Devuelve null si no hay foto o si Storage falla: la ficha no
// debe romperse por la foto.
const FOTO_URL_TTL_SEGUNDOS = 600;
export async function getFotoUrlFirmada(fotoPath) {
  if (!fotoPath) return null;
  try {
    const { data, error } = await supabase.storage
      .from('paciente-fotos')
      .createSignedUrl(fotoPath, FOTO_URL_TTL_SEGUNDOS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error('[Paciente] no se pudo firmar la foto:', e);
    return null;
  }
}

// ── Foto principal del Paciente (BIT-13) ─────────────────────────
// Mismo bucket/convención de path/límites que modules/catastro/services.js
// (crearEquinoCatastro). Se replica acá en vez de importarse de ese módulo
// -- convención de autonomía ya vigente en el proyecto (cada módulo hace su
// propio acceso a Storage/tablas, ver encabezado de catastro/services.js).

const BUCKET_FOTOS = 'paciente-fotos';
const MAX_FOTO_BYTES = 8 * 1024 * 1024; // mismo límite que el bucket (8 MB)
const MIME_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// Validación previa al upload -- el servidor igual rechaza (límite y MIME
// del bucket), esto solo evita subir 8 MB por datos móviles para enterarse
// recién después. Si el navegador no informa `type` (pasa con algunos
// HEIC), se deja decidir al servidor.
export function validarFoto(file) {
  if (file.size > MAX_FOTO_BYTES) {
    return 'La foto pesa más de 8 MB. Sacala de nuevo o elegí una más liviana.';
  }
  if (file.type && !MIME_FOTO_PERMITIDOS.includes(file.type)) {
    return 'Formato de foto no permitido. Usá JPG, PNG, WebP o HEIC.';
  }
  return null;
}

// Nombre de archivo generado en el cliente -- nunca el id del Paciente (al
// crear, todavía no existe; al reemplazar, un nombre nuevo es justamente lo
// que permite subir la foto ANTES de confirmar nada, ver
// reemplazarFotoPaciente más abajo). Devuelve el PATH (object key), nunca
// una URL -- el bucket es privado.
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

// Compensación de huérfanos (mismo criterio que catastro/services.js): si
// algo falla DESPUÉS de subir la foto, el objeto queda en Storage sin
// ningún Paciente que lo referencie -- se intenta borrar de inmediato,
// best-effort. Si el borrado también falla, no se vuelve a lanzar: el
// usuario ya tiene el error real: no tiene sentido taparlo con uno de
// limpieza. El huérfano queda para revisión periódica (mismo criterio ya
// documentado en BIT-48/BIT-50).
async function limpiarFotoHuerfana(path) {
  try {
    await supabase.storage.from(BUCKET_FOTOS).remove([path]);
  } catch {
    // silencioso a propósito -- ver comentario arriba.
  }
}

// Reemplaza la foto de un Paciente YA EXISTENTE (alta por primera vez desde
// Editar, o reemplazo de una foto previa) -- a diferencia de crearAnimal(),
// acá SÍ hace falta validación atómica server-side para el UPDATE:
// animales_update ya exige ADMINISTRADOR/PROFESIONAL (BIT-11), más la
// garantía de que el path nuevo pertenece al establecimiento real de ESE
// Paciente -- ninguna policy de Storage puede expresar eso (no conoce la
// tabla `animales`). La RPC `actualizar_foto_paciente` (SECURITY DEFINER,
// migration-BIT-13-reemplazar-foto-paciente.sql) hace ÚNICAMENTE esa
// validación + el UPDATE, y devuelve el path VIEJO -- nunca toca
// `storage.objects` directamente (corrección BIT-13-02, hallazgo de KLIAM:
// las tablas de `storage` son metadata, borrar su fila a mano no garantiza
// que se borre el objeto físico -- toda mutación de Storage tiene que
// pasar por la Storage API real, acá mismo, del lado del cliente).
//
// Orden: 1) subir la foto NUEVA a un path nuevo vía Storage API (nunca se
// sobreescribe el objeto viejo) 2) la RPC confirma el swap y devuelve el
// path viejo 3) recién ahí se borra el objeto viejo, también vía Storage
// API, con la policy nueva y acotada del PASO 2b de la migración (permite
// a ADMINISTRADOR/PROFESIONAL borrar una foto no referenciada de su
// establecimiento, incluso si la subió otro usuario). Si el paso 2 falla,
// la foto nueva queda huérfana (compensada acá mismo) y la vieja sigue
// intacta. Si el paso 3 falla, queda un huérfano documentado -- la foto
// activa del Paciente YA es la nueva: ese fallo nunca revierte nada.
export async function reemplazarFotoPaciente(animalId, establecimientoId, file) {
  const nuevoPath = await subirFotoPaciente(establecimientoId, file);

  let fotoPathAnterior;
  try {
    const { data, error } = await supabase.rpc('actualizar_foto_paciente', {
      p_animal_id: animalId,
      p_nuevo_foto_path: nuevoPath,
    });
    if (error) throw error;
    fotoPathAnterior = data; // null si el Paciente no tenía foto previa
  } catch (err) {
    await limpiarFotoHuerfana(nuevoPath);
    throw err;
  }

  // El swap ya está confirmado -- borrar la vieja es best-effort. Un fallo
  // acá queda como huérfano documentado (revisión periódica, mismo
  // criterio ya aceptado en BIT-48/BIT-50), nunca se vuelve a lanzar: el
  // reemplazo en sí ya fue exitoso.
  if (fotoPathAnterior) {
    try {
      const { error: errorBorrado } = await supabase.storage.from(BUCKET_FOTOS).remove([fotoPathAnterior]);
      if (errorBorrado) throw errorBorrado;
    } catch (e) {
      console.error('[Paciente] no se pudo borrar la foto anterior (queda huérfana):', e);
    }
  }
}

// ── Membresía en Lote ────────────────────────────────────────────
// Un animal tiene como máximo una membresía activa (fecha_fin IS NULL).

export async function getLoteActivoDeAnimal(animalId) {
  const { data, error } = await supabase
    .from('lotes_animales')
    .select('id, lote_id, lotes(id, nombre)')
    .eq('animal_id', animalId)
    .is('fecha_fin', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Cambia el lote activo de un animal.
// newLoteId = null → sale del lote actual sin entrar a ninguno.
// newLoteId = <id> → cierra membresía anterior y abre la nueva.
export async function actualizarLoteDeAnimal(animalId, newLoteId) {
  const actual = await getLoteActivoDeAnimal(animalId);
  const currentLoteId = actual?.lote_id ?? null;
  if (currentLoteId === newLoteId) return;

  if (actual) {
    const { error } = await supabase
      .from('lotes_animales')
      .update({ fecha_fin: new Date().toISOString() })
      .eq('id', actual.id);
    if (error) throw error;
  }

  if (newLoteId) {
    const { error } = await supabase
      .from('lotes_animales')
      .insert({ animal_id: animalId, lote_id: newLoteId });
    if (error) throw error;
  }
}
