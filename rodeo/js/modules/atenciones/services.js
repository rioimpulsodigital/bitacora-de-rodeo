import { supabase } from '../../../../js/core/supabase-client.js';

export async function listAtenciones(establecimientoId) {
  let q = supabase
    .from('atenciones_clinicas')
    .select('id, fecha, motivo, diagnostico, estado, estado_validacion, created_by, proxima_visita, profesional_responsable_id, animales(nombre, numero_identificacion, especie)');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAtencion(id) {
  const { data, error } = await supabase
    .from('atenciones_clinicas')
    .select('id, establecimiento_id, animal_id, lote_id, visita_id, profesional_responsable_id, created_by, estado_validacion, enviado_at, validado_por, validado_at, fecha, hora, motivo, antecedentes, examen, diagnostico, tratamiento, examenes_estudios, observaciones, estado, proxima_visita, animales(id, nombre, numero_identificacion, especie), lotes(id, nombre), visitas(id, fecha, tipo), perfiles!profesional_responsable_id(id, nombre)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listHistorialAnimal(animalId, establecimientoId, excludeId) {
  let q = supabase
    .from('atenciones_clinicas')
    .select('id, fecha, motivo, diagnostico, estado, estado_validacion')
    .eq('animal_id', animalId);
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listAnimalesParaSelector(establecimientoId) {
  let q = supabase.from('animales').select('id, nombre, numero_identificacion, especie');
  if (establecimientoId) q = q.eq('establecimiento_actual_id', establecimientoId);
  const { data, error } = await q.order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listLotesParaSelector(establecimientoId) {
  let q = supabase.from('lotes').select('id, nombre');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listVisitasParaSelector(establecimientoId) {
  let q = supabase.from('visitas').select('id, fecha, tipo, lote_id');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

// Lote activo del Paciente (misma regla que animales/services.js:
// como máximo una membresía activa, fecha_fin IS NULL). Es la única
// relación real que existe entre una Visita y un Paciente: `visitas` no
// tiene animal_id -- solo un lote_id opcional (BIT-42, Visita Sanitaria).
export async function getLoteActivoAnimal(animalId) {
  const { data, error } = await supabase
    .from('lotes_animales')
    .select('lote_id')
    .eq('animal_id', animalId)
    .is('fecha_fin', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearAtencion(campos) {
  const { data, error } = await supabase
    .from('atenciones_clinicas')
    .insert({
      establecimiento_id: campos.establecimiento_id,
      animal_id: campos.animal_id,
      lote_id: campos.lote_id || null,
      visita_id: campos.visita_id || null,
      profesional_responsable_id: campos.profesional_responsable_id,
      fecha: campos.fecha,
      hora: campos.hora || null,
      motivo: campos.motivo.trim(),
      antecedentes: campos.antecedentes.trim(),
      examen: campos.examen?.trim() || null,
      diagnostico: campos.diagnostico.trim(),
      tratamiento: campos.tratamiento?.trim() || null,
      examenes_estudios: campos.examenes_estudios?.trim() || null,
      observaciones: campos.observaciones?.trim() || null,
      estado: 'abierta',
      proxima_visita: campos.proxima_visita || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarAtencion(id, campos) {
  const { data, error } = await supabase
    .from('atenciones_clinicas')
    .update({
      animal_id: campos.animal_id,
      lote_id: campos.lote_id || null,
      visita_id: campos.visita_id || null,
      fecha: campos.fecha,
      hora: campos.hora || null,
      motivo: campos.motivo.trim(),
      antecedentes: campos.antecedentes.trim(),
      examen: campos.examen?.trim() || null,
      diagnostico: campos.diagnostico.trim(),
      tratamiento: campos.tratamiento?.trim() || null,
      examenes_estudios: campos.examenes_estudios?.trim() || null,
      observaciones: campos.observaciones?.trim() || null,
      estado: campos.estado,
      proxima_visita: campos.proxima_visita || null,
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Sin acceso para editar esta atención.');
}

function camposBorrador(campos) {
  return {
    sujeto_tipo: 'animal',
    animal_id: campos.animal_id || null,
    lote_id: campos.lote_id || null,
    fecha: campos.fecha || null,
    hora: campos.hora || null,
    motivo: campos.motivo?.trim() || null,
    antecedentes: campos.antecedentes?.trim() || null,
    examen: campos.examen?.trim() || null,
    diagnostico: campos.diagnostico?.trim() || null,
    tratamiento: campos.tratamiento?.trim() || null,
    examenes_estudios: campos.examenes_estudios?.trim() || null,
    observaciones: campos.observaciones?.trim() || null,
    estado: campos.estado || 'abierta',
    proxima_visita: campos.proxima_visita || null,
  };
}

export async function crearBorradorAtencion(campos) {
  const { data, error } = await supabase.from('atenciones_clinicas')
    .insert({ establecimiento_id: campos.establecimiento_id, ...camposBorrador(campos) })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function actualizarBorradorAtencion(id, campos) {
  const { data, error } = await supabase.from('atenciones_clinicas')
    .update(camposBorrador(campos)).eq('id', id).eq('estado_validacion', 'BORRADOR')
    .select('id');
  if (error) throw error;
  if (data?.length !== 1) throw new Error('Borrador no disponible.');
}

export async function enviarAtencion(id) {
  const { error } = await supabase.rpc('bit56_enviar_atencion', { p_id: id });
  if (error) throw error;
}

export async function validarAtencion(id) {
  const { error } = await supabase.rpc('bit56_validar_atencion', { p_id: id });
  if (error) throw error;
}

export async function getValidador(establecimientoId) {
  const { data, error } = await supabase.rpc('bit56_validador', { p_establecimiento: establecimientoId });
  if (error) throw error;
  return data;
}

// Configuración mínima BIT-56-12: solo el ADMINISTRADOR recibe estas filas
// por RLS. La lista se limita al establecimiento activo y a perfiles
// PROFESIONAL activos; el trigger vuelve a validar ambos al persistir.
export async function listProfesionalesValidadores(establecimientoId) {
  const { data: vinculos, error: vinculosError } = await supabase
    .from('establecimientos_usuarios').select('perfil_id')
    .eq('establecimiento_id', establecimientoId);
  if (vinculosError) throw vinculosError;
  const ids = [...new Set((vinculos ?? []).map((v) => v.perfil_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('perfiles')
    .select('id, nombre').in('id', ids)
    .eq('rol', 'PROFESIONAL').eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDesignacionValidador(establecimientoId) {
  const { data, error } = await supabase.from('bit56_validadores')
    .select('perfil_id, habilitada')
    .eq('establecimiento_id', establecimientoId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function guardarDesignacionValidador(establecimientoId, perfilId) {
  const { data, error } = await supabase.from('bit56_validadores')
    .upsert({ establecimiento_id: establecimientoId, perfil_id: perfilId, habilitada: true },
      { onConflict: 'establecimiento_id' })
    .select('perfil_id, habilitada').single();
  if (error) throw error;
  return data;
}

export async function listPendientesAtenciones(establecimientoId) {
  const { data, error } = await supabase.rpc('bit56_list_pendientes', {
    p_establecimiento: establecimientoId,
  });
  if (error) throw error;
  return data;
}
