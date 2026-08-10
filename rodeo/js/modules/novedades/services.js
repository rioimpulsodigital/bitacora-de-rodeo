import { supabase } from '../../../../js/core/supabase-client.js';

const TIPOS_LABELS = {
  clima:           'Clima',
  infraestructura: 'Infraestructura',
  movimiento:      'Movimiento',
  productivo:      'Productivo',
  trabajo:         'Trabajo',
  otro:            'Otro',
};

export const TIPOS = Object.keys(TIPOS_LABELS);
export const tipoLabel = (t) => TIPOS_LABELS[t] ?? t ?? '—';

export async function listNovedades(establecimientoId) {
  let q = supabase
    .from('novedades_establecimiento')
    .select('id, fecha, tipo, descripcion, precipitacion_mm, animal_id, lote_id, created_by, animales(nombre), lotes(nombre)')
    .is('deleted_at', null);
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getNovedad(id) {
  const { data, error } = await supabase
    .from('novedades_establecimiento')
    .select('id, fecha, hora, tipo, descripcion, precipitacion_mm, visita_id, animal_id, lote_id, establecimiento_id, created_by, animales(id, nombre), lotes(id, nombre), visitas(id, fecha, tipo)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVisitasParaSelector(establecimientoId) {
  let q = supabase.from('visitas').select('id, fecha, tipo, estado');
  if (establecimientoId) q = q.eq('establecimiento_id', establecimientoId);
  const { data, error } = await q.order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAnimalesParaSelector(establecimientoId) {
  let q = supabase.from('animales').select('id, nombre');
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

export async function crearNovedad(campos) {
  const { data, error } = await supabase
    .from('novedades_establecimiento')
    .insert({
      establecimiento_id: campos.establecimiento_id,
      fecha: campos.fecha,
      hora: campos.hora || null,
      tipo: campos.tipo || null,
      descripcion: campos.descripcion.trim(),
      precipitacion_mm:
        campos.tipo === 'clima' && campos.precipitacion_mm !== ''
          ? Number(campos.precipitacion_mm)
          : null,
      visita_id: campos.visita_id || null,
      animal_id: campos.animal_id || null,
      lote_id: campos.lote_id || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarNovedad(id, campos) {
  const { data, error } = await supabase
    .from('novedades_establecimiento')
    .update({
      fecha: campos.fecha,
      hora: campos.hora || null,
      tipo: campos.tipo || null,
      descripcion: campos.descripcion.trim(),
      precipitacion_mm:
        campos.tipo === 'clima' && campos.precipitacion_mm !== ''
          ? Number(campos.precipitacion_mm)
          : null,
      visita_id: campos.visita_id || null,
      animal_id: campos.animal_id || null,
      lote_id: campos.lote_id || null,
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Sin acceso para editar esta novedad.');
}

export async function eliminarNovedad(id) {
  // El trigger novedades_set_updated_by valida que el usuario sea ADMINISTRADOR
  // y setea deleted_by automáticamente.
  const { error } = await supabase
    .from('novedades_establecimiento')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
