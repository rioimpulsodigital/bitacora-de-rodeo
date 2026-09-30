-- BIT-50 (ronda 2) — Verificación SOLO LECTURA: ¿`animales.tutor_responsable_id` admite NULL?
-- EJECUTAR CON CLAUDY en Producción ANTES de validar el Preview. No modifica nada.
--
-- El repo no versiona el CREATE TABLE de `animales` (se creó directo en
-- Supabase), así que la nulabilidad solo se puede confirmar contra la base.
-- El frontend de Catastro Equino ya no envía Tutor (queda NULL).

-- 1) Nulabilidad y default de la columna:
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'animales'
  AND column_name = 'tutor_responsable_id';

-- 2) Constraints (FK / CHECK) que mencionen la columna:
SELECT conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.animales'::regclass
  AND (pg_get_constraintdef(oid) ILIKE '%tutor_responsable_id%' OR contype = 'c');

-- 3) Policies de animales (buscar si alguna menciona tutor_responsable_id):
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'animales';

-- 4) Triggers sobre animales (por si alguno exige/completa Tutor):
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.animales'::regclass AND NOT tgisinternal;

-- INTERPRETACIÓN:
--   is_nullable = 'YES' y ninguna policy/trigger/CHECK menciona el Tutor
--     -> Tutor NULL es seguro: no hace falta cambio de base.
--   is_nullable = 'NO'
--     -> DETENERSE y escalar a Bren/KLIAM: permitir NULL sería un
--        ALTER COLUMN ... DROP NOT NULL sobre una tabla transversal.
