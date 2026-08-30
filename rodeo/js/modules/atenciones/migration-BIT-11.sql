-- BIT-11 — Módulo Atenciones Clínicas — Realineación 30 Ago 2026
-- EJECUTAR CON CLAUDY en Supabase SQL Editor
--
-- Schema real confirmado por Claudy (29 Ago 2026):
--   Columnas existentes en producción:
--   id, sujeto_tipo, animal_id, lote_id, visita_id,
--   profesional_responsable_id, medio, fecha, valoracion, es_preliminar,
--   estado, atencion_origen_id, notas, created_at, updated_at
--
--   FK confirmada: profesional_responsable_id → perfiles.id ✅
--   NO existe created_by  → esta migración NO la referencia.
--   NO existe establecimiento_id → se agrega acá.
--
-- PASO PREVIO OBLIGATORIO — verificar que no hay filas existentes
-- que queden con establecimiento_id = NULL (nullable por seguridad):
--   SELECT COUNT(*) FROM atenciones_clinicas;
-- Si hay filas: revisar con Brenda antes de ejecutar.
--
-- Prerequisitos: get_mi_rol() y tiene_acceso_establecimiento()
-- ya existen (creados en BIT-04). No recrear.

-- ── COLUMNAS NUEVAS ──────────────────────────────────────────────────────────
-- Agregar únicamente las columnas que faltan. Las existentes no se tocan.

ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS establecimiento_id  uuid        REFERENCES establecimientos(id);
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS hora                time;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS motivo              text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS antecedentes        text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS examen              text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS diagnostico         text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS tratamiento         text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS examenes_estudios   text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS observaciones       text;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS proxima_visita      date;
ALTER TABLE atenciones_clinicas ADD COLUMN IF NOT EXISTS updated_by          uuid        REFERENCES auth.users(id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE atenciones_clinicas ENABLE ROW LEVEL SECURITY;

-- Limpiar todas las políticas existentes (nombres usados en BIT-04 y variantes anteriores)
DROP POLICY IF EXISTS "atenciones_clinicas_select" ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_clinicas_insert" ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_clinicas_update" ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_clinicas_delete" ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_select"           ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_insert"           ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_update"           ON atenciones_clinicas;
DROP POLICY IF EXISTS "atenciones_delete"           ON atenciones_clinicas;

-- SELECT: PROFESIONAL y ADMINISTRADOR ven atenciones de su establecimiento.
-- OPERADOR_CAMPO queda excluido por el filtro de rol — aunque tenga acceso
-- al establecimiento via establecimientos_usuarios, el get_mi_rol() falla.
CREATE POLICY "atenciones_clinicas_select" ON atenciones_clinicas
  FOR SELECT USING (
    tiene_acceso_establecimiento(establecimiento_id)
    AND get_mi_rol() IN ('PROFESIONAL', 'ADMINISTRADOR')
  );

-- INSERT: exclusivo para PROFESIONAL.
-- El usuario que inserta ES el profesional responsable (autoasignación).
-- ADMINISTRADOR no crea Atenciones en V1 — deliberado.
-- Sin OR is_admin() — correcto en V1.
-- Sin referencia a created_by — columna inexistente en esta tabla.
CREATE POLICY "atenciones_clinicas_insert" ON atenciones_clinicas
  FOR INSERT WITH CHECK (
    tiene_acceso_establecimiento(establecimiento_id)
    AND get_mi_rol() = 'PROFESIONAL'
    AND profesional_responsable_id = auth.uid()
  );

-- UPDATE: ADMINISTRADOR edita todas las Atenciones del establecimiento.
-- PROFESIONAL solo edita las suyas (profesional_responsable_id = auth.uid()).
-- La propiedad de la Atención se identifica por profesional_responsable_id,
-- no por created_by (columna inexistente).
-- USING y WITH CHECK son idénticos para garantizar que no se pueda cambiar
-- el establecimiento ni transferir la Atención a otro profesional.
CREATE POLICY "atenciones_clinicas_update" ON atenciones_clinicas
  FOR UPDATE
  USING (
    tiene_acceso_establecimiento(establecimiento_id)
    AND (
      get_mi_rol() = 'ADMINISTRADOR'
      OR (get_mi_rol() = 'PROFESIONAL' AND profesional_responsable_id = auth.uid())
    )
  )
  WITH CHECK (
    tiene_acceso_establecimiento(establecimiento_id)
    AND (
      get_mi_rol() = 'ADMINISTRADOR'
      OR (get_mi_rol() = 'PROFESIONAL' AND profesional_responsable_id = auth.uid())
    )
  );

-- DELETE: denegado en V1 (BIT-35). Sin policy = denegado por defecto.

-- ── TRIGGER (trazabilidad de última modificación) ─────────────────────────────

CREATE OR REPLACE FUNCTION atenciones_clinicas_set_updated_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by = auth.uid();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atenciones_clinicas_updated_by_trigger ON atenciones_clinicas;
CREATE TRIGGER atenciones_clinicas_updated_by_trigger
  BEFORE UPDATE ON atenciones_clinicas
  FOR EACH ROW EXECUTE FUNCTION atenciones_clinicas_set_updated_by();

-- ── GRANT ─────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON atenciones_clinicas TO authenticated;

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────────
-- Claudy puede ejecutar esto para confirmar que quedó bien:
--
-- Columnas:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'atenciones_clinicas'
--   ORDER BY ordinal_position;
--
-- Políticas:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'atenciones_clinicas';
--
-- Trigger:
--   SELECT trigger_name, event_manipulation, action_timing
--   FROM information_schema.triggers
--   WHERE event_object_table = 'atenciones_clinicas';
