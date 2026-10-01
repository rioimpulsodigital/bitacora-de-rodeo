-- BIT-50 (H-15) — `animales.tutor_responsable_id` pasa a admitir NULL
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Autorizada por Bren/KLIAM (decisión H-15,
-- 30-09-2026); aplicar con Claudy ANTES de usar el Catastro Equino real.
--
-- ─── DECISIÓN DE DOMINIO (Bren/KLIAM) ────────────────────────────────────
-- Un Paciente Animal puede existir SIN Tutor Responsable conocido.
-- NULL significa "no conocido / no corresponde todavía", no un error.
-- No se crea Tutor ficticio ni Persona "Sin Tutor", y el Catastro Equino
-- ya NO asigna automáticamente el Área de Rescate Equino de la
-- Municipalidad: un organismo interviniente no equivale semánticamente a
-- Tutor Responsable.
--
-- ─── EVIDENCIA DE PRODUCCIÓN (verificacion-BIT-50-tutor-null.sql) ────────
--   * tutor_responsable_id: uuid NOT NULL, sin default.
--   * FK a personas(id). Sin CHECK asociado.
--   * Ninguna policy depende del Tutor; sin triggers ni rules que lo exijan.
--   * Los 8 animales actuales tienen Tutor.
-- => el ÚNICO bloqueo estructural es el NOT NULL.
--
-- ─── ALCANCE (cambio mínimo) ─────────────────────────────────────────────
-- SOLO retira el NOT NULL. NO toca: la columna, la FK a personas(id) (sigue
-- vigente cuando hay valor), RLS, datos existentes (ningún UPDATE; los 8
-- animales conservan su Tutor) ni Personas/Tutores.
--
-- ─── IMPACTO CONOCIDO (documentado, no bloquea BIT-50) ───────────────────
-- El formulario general de Pacientes (animales/form.js) exige Tutor desde
-- frontend. Un Paciente creado por Catastro sin Tutor se abre y se lista
-- normalmente (el listado usa join izquierdo y muestra "—"), pero al
-- editarlo desde ese formulario habrá que elegir un Tutor para guardar.
-- Atenciones, Observaciones y Novedades no usan el Tutor. Posible tarea
-- posterior: permitir "Tutor no conocido" en el formulario general.

-- ── PASO 1 (SOLO LECTURA) — precondiciones ─────────────────────────────────
-- Esperado: is_nullable = 'NO'. Si ya dice 'YES': no hay nada que aplicar.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'animales'
  AND column_name = 'tutor_responsable_id';

-- Conteo base para comparar después (esperado: 8 / 8):
SELECT count(*) AS animales_total,
       count(tutor_responsable_id) AS animales_con_tutor
FROM public.animales;

-- ── PASO 2 — APLICAR (idempotente: DROP NOT NULL sobre columna ya nullable
-- no falla) ──────────────────────────────────────────────────────────────
ALTER TABLE public.animales
  ALTER COLUMN tutor_responsable_id DROP NOT NULL;

COMMENT ON COLUMN public.animales.tutor_responsable_id IS
  'Tutor Responsable (FK personas.id). NULL = no conocido / no corresponde todavía (BIT-50, H-15).';

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   -- a) nullable, mismo tipo, sin default:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'animales'
--     AND column_name = 'tutor_responsable_id';
--   -- Esperado: uuid | YES | NULL
--
--   -- b) FK intacta (debe seguir apuntando a personas(id)):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.animales'::regclass AND contype = 'f'
--     AND pg_get_constraintdef(oid) ILIKE '%tutor_responsable_id%';
--
--   -- c) datos sin cambios (mismo conteo que el Paso 1: 8 / 8):
--   SELECT count(*) AS animales_total,
--          count(tutor_responsable_id) AS animales_con_tutor
--   FROM public.animales;

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo posible si NO existe ningún animal con tutor_responsable_id IS NULL;
-- si ya hay Pacientes de Catastro sin Tutor, el SET NOT NULL falla (a
-- propósito, no se inventa un Tutor para forzarlo):
--   SELECT count(*) FROM public.animales WHERE tutor_responsable_id IS NULL;  -- debe dar 0
--   ALTER TABLE public.animales ALTER COLUMN tutor_responsable_id SET NOT NULL;
