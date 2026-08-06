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

// Crea la persona e inmediatamente la vincula al establecimiento activo en
// personas_establecimientos, para que sea visible por RLS a PROFESIONAL/OPERADOR_CAMPO.
export async function crearPersona(campos, establecimientoId) {
  const { data: persona, error: e1 } = await supabase
    .from('personas')
    .insert({
      nombre: campos.nombre.trim(),
      telefono: campos.telefono?.trim() || null,
      email: campos.email?.trim() || null,
    })
    .select('id, nombre')
    .single();
  if (e1) throw e1;

  if (establecimientoId) {
    const { error: e2 } = await supabase
      .from('personas_establecimientos')
      .insert({ persona_id: persona.id, establecimiento_id: establecimientoId });
    if (e2) throw e2;
  }
  return persona;
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
    .select('id, nombre, especie, personas(nombre)');
  if (establecimientoId) q = q.eq('establecimiento_actual_id', establecimientoId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAnimal(id) {
  const { data, error } = await supabase
    .from('animales')
    .select('id, nombre, especie, tutor_responsable_id, establecimiento_actual_id, fecha_nacimiento, notas, personas(id, nombre, telefono, email)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearAnimal(campos) {
  const { data, error } = await supabase
    .from('animales')
    .insert({
      nombre: campos.nombre?.trim() || null,
      especie: campos.especie,
      tutor_responsable_id: campos.tutor_responsable_id,
      establecimiento_actual_id: campos.establecimiento_actual_id || null,
      fecha_nacimiento: campos.fecha_nacimiento || null,
      notas: campos.notas?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarAnimal(id, campos) {
  const { error } = await supabase
    .from('animales')
    .update({
      nombre: campos.nombre?.trim() || null,
      especie: campos.especie,
      tutor_responsable_id: campos.tutor_responsable_id,
      establecimiento_actual_id: campos.establecimiento_actual_id || null,
      fecha_nacimiento: campos.fecha_nacimiento || null,
      notas: campos.notas?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
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
