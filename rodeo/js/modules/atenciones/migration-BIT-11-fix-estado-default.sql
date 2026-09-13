-- BIT-11 — Corrección de DEFAULT inconsistente en atenciones_clinicas.estado
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
--
-- CONTEXTO
-- El CHECK vigente en Producción ya es correcto: estado IN ('abierta', 'cerrada').
-- Pero la columna quedó con DEFAULT 'registrada' -- un valor que el propio
-- CHECK ya no acepta. Esto es un remanente del modelo legacy previo a BIT-11
-- y deja el schema internamente inconsistente: cualquier INSERT que omita
-- `estado` fallaría contra su propio DEFAULT.
--
-- Regla vigente de BIT-11 (Notion, sección 6): toda Atención nueva nace
-- 'abierta'. El DEFAULT de base de datos debe reflejar exactamente eso.
--
-- Este script NO toca: el CHECK existente, RLS, el trigger de updated_by,
-- datos existentes, ni ninguna otra columna.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ──────────────────────────────────────
-- Confirmar el estado real antes de aplicar nada:
--
--   SELECT column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'atenciones_clinicas' AND column_name = 'estado';
--
--   SELECT conname, pg_get_constraintdef(oid) AS definicion
--   FROM pg_constraint
--   WHERE conrelid = 'atenciones_clinicas'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%estado%';

-- ── PASO 2 — CORRECCIÓN (idempotente) ───────────────────────────────────────

ALTER TABLE atenciones_clinicas ALTER COLUMN estado SET DEFAULT 'abierta';

-- No se modifica el CHECK, RLS, el trigger ni datos existentes.

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- BEGIN;
--
--   -- (Paso 2 ya aplicado más arriba en esta misma sesión/transacción)
--
--   -- INSERT válido omitiendo explícitamente `estado`:
--   INSERT INTO atenciones_clinicas
--     (establecimiento_id, animal_id, profesional_responsable_id, fecha, hora, motivo, antecedentes, diagnostico)
--   VALUES
--     ('<establecimiento_id>', '<animal_id>', '<profesional_id>', current_date, current_time, 'test default estado', 'test', 'test')
--   RETURNING id, estado;
--
--   -- El `estado` devuelto por el RETURNING de arriba debe ser 'abierta'.
--   -- Verificación adicional explícita:
--   -- SELECT estado FROM atenciones_clinicas WHERE motivo = 'test default estado';
--   --   → debe devolver 'abierta'.
--
-- ROLLBACK; -- no dejar el registro de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ─────────────────────────────
--   -- Default real:
--   SELECT column_default
--   FROM information_schema.columns
--   WHERE table_name = 'atenciones_clinicas' AND column_name = 'estado';
--   -- Debe devolver: 'abierta'::text (o equivalente)
--
--   -- CHECK sigue aceptando solo abierta | cerrada (sin cambios):
--   SELECT conname, pg_get_constraintdef(oid) AS definicion
--   FROM pg_constraint
--   WHERE conrelid = 'atenciones_clinicas'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%estado%';
