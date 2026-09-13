-- BIT-11 — Corrección de constraint legacy chk_sujeto_unico
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
--
-- CONTEXTO
-- Al editar/crear una Atención con animal_id + lote_id ambos NOT NULL,
-- Producción devuelve:
--   new row for relation "atenciones_clinicas" violates check constraint "chk_sujeto_unico"
--
-- Este constraint NO fue creado por ninguna migración versionada de BIT-11:
-- no aparece en migration-BIT-11.sql ni en ningún otro script del repo, por
-- lo tanto fue creado directamente en Supabase antes de esta tarea. Todo
-- indica que es un remanente del modelo legacy donde el "sujeto" de una
-- atención debía ser exclusivamente Animal O Lote (nunca ambos a la vez) —
-- un patrón similar al de sujeto_tipo/animal_id usado en Observaciones.
--
-- La spec vigente de BIT-11 (Notion, secciones 2 y 15) es explícita:
--   - Paciente Animal: obligatorio.
--   - Lote: opcional, como contexto adicional — puede coexistir con Animal.
--   - Visita: opcional.
-- Es decir: animal_id SIEMPRE debe existir; lote_id es independiente y NO
-- exclusivo respecto de animal_id. La exclusividad legacy quedó obsoleta
-- para este módulo y debe eliminarse.
--
-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ──────────────────────────────────────
-- Ejecutar ANTES de tocar nada y guardar el resultado como evidencia en la
-- página de BIT-11 (Notion):
--
--   SELECT conname, pg_get_constraintdef(oid) AS definicion
--   FROM pg_constraint
--   WHERE conrelid = 'atenciones_clinicas'::regclass
--     AND contype = 'c';
--
-- Confirmar con ese resultado que "chk_sujeto_unico" efectivamente exige
-- exclusividad entre animal_id y lote_id (o depende de sujeto_tipo) antes
-- de aplicar el Paso 2. Si la definición real no coincide con lo esperado
-- acá, DETENERSE y no continuar sin revisar de nuevo con Anthy/Brenda.

-- ── PASO 2 — CORRECCIÓN (idempotente, segura para reejecutar) ──────────────

ALTER TABLE atenciones_clinicas DROP CONSTRAINT IF EXISTS chk_sujeto_unico;

ALTER TABLE atenciones_clinicas DROP CONSTRAINT IF EXISTS chk_atenciones_animal_obligatorio;
ALTER TABLE atenciones_clinicas
  ADD CONSTRAINT chk_atenciones_animal_obligatorio CHECK (animal_id IS NOT NULL);

-- No se toca lote_id: queda sin restricción de exclusividad, tal como
-- exige la spec vigente (Lote es contexto opcional e independiente).
-- No se toca visita_id, sujeto_tipo, RLS ni ninguna policy existente.
-- No se cambia la nullability física de la columna animal_id (se usa un
-- CHECK explícito en vez de ALTER COLUMN ... SET NOT NULL, para mantener
-- el cambio acotado y fácilmente reversible).

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar el Paso 2 dentro de esta transacción y probar los 4 casos antes
-- de decidir COMMIT. Si algún caso no se comporta como se indica, hacer
-- ROLLBACK y reportar antes de aplicar nada en firme.
--
-- BEGIN;
--
--   -- (Paso 2 ya aplicado más arriba en esta misma sesión/transacción)
--
--   -- Caso 1 — animal_id NULL (con o sin lote_id) → DEBE FALLAR
--   --   por chk_atenciones_animal_obligatorio, no por chk_sujeto_unico.
--   -- INSERT INTO atenciones_clinicas (establecimiento_id, animal_id, lote_id, profesional_responsable_id, fecha, hora, motivo, antecedentes, diagnostico)
--   -- VALUES ('<establecimiento_id>', NULL, '<lote_id>', '<profesional_id>', current_date, current_time, 'test', 'test', 'test');
--
--   -- Caso 2 — animal_id NOT NULL, lote_id NOT NULL → DEBE PERMITIRSE
--
--   -- Caso 3 — animal_id NOT NULL, lote_id NULL → DEBE PERMITIRSE
--
--   -- Caso 4 — animal_id NOT NULL, visita_id NOT NULL (con o sin lote_id)
--   --   → DEBE PERMITIRSE si el animal existe.
--
-- ROLLBACK; -- cambiar a COMMIT solo cuando los 4 casos dieron el resultado esperado

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ─────────────────────────────
--   SELECT conname, pg_get_constraintdef(oid) AS definicion
--   FROM pg_constraint
--   WHERE conrelid = 'atenciones_clinicas'::regclass AND contype = 'c';
