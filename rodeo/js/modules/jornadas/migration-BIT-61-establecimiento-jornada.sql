-- BIT-61 — Jornada pertenece a UN establecimiento: agrega establecimiento_id
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere: (1) correr primero
-- diagnostico-BIT-61-establecimiento-jornadas.sql y confirmar que nada
-- contradice lo asumido acá; (2) autorización explícita de Bren/KLIAM,
-- después de revisar diagnóstico + este SQL + la estrategia para filas
-- existentes (sección "DATOS EXISTENTES" más abajo).
--
-- ─── REGLA DE DOMINIO QUE MOTIVA ESTA MIGRACIÓN ──────────────────────────
-- Corrección de Bren/KLIAM sobre BIT-61: una Jornada pertenece a UN único
-- establecimiento (el que estaba activo al presionar LLEGADA). Mientras esa
-- Jornada esté activa, el turno corresponde a ese establecimiento -- no se
-- mezclan datos de establecimientos distintos dentro de una misma Jornada.
-- Si el profesional cambia de establecimiento, debe cerrar la Jornada e
-- iniciar una nueva. El frontend (operativa.js) ya implementa esta regla
-- usando una columna que hoy NO EXISTE -- esta migración la agrega.
--
-- ─── DATOS EXISTENTES — NO SE INFIERE NADA ───────────────────────────────
-- BIT-46 (24 Sep 2026) reportó 0 filas en `jornadas`. Si el diagnóstico de
-- este BIT confirma que sigue en 0: el PASO 2 (ALTER ADD COLUMN nullable)
-- no deja ninguna fila "sin establecimiento" real -- no hace falta
-- backfill de ningún tipo.
-- Si el diagnóstico encuentra filas reales (cargadas entre el 24 Sep y
-- ahora, vía el CRUD viejo de #jornadas, vigente en Producción antes de
-- este cierre): NO se infiere el establecimiento por fecha, por el
-- selector activo de ese momento, ni por ningún registro relacionado. La
-- columna queda NULL en esas filas y así se documenta -- backfill manual
-- validado por Bren/KLIAM/Etel (quién sabe realmente dónde ocurrió cada
-- Jornada) es la única estrategia seria, y es una decisión de ESE momento,
-- no algo que esta migración resuelva de antemano.
--
-- ─── DISEÑO ──────────────────────────────────────────────────────────────
-- `establecimiento_id uuid REFERENCES establecimientos(id)` -- mismo tipo y
-- mismo patrón de FK ya usado en atenciones_clinicas.establecimiento_id
-- (BIT-11), sin ON DELETE especial (NO ACTION, igual que esa referencia).
-- NULLABLE a nivel de columna -- por las filas existentes de arriba, NO
-- porque una Jornada nueva pueda quedar sin establecimiento (el frontend ya
-- lo exige antes de llamar a crearJornada(); ver también el WITH CHECK del
-- Paso 3, queExige acceso real al establecimiento en el INSERT).
-- Sin columna `estado` nueva -- sigue alcanzando con hora_salida IS NULL,
-- tal como pidió explícitamente esta ronda.
-- INMUTABLE después de creada: el Paso 4 (GRANT) excluye la columna del
-- UPDATE cuando corresponda, para que ni siquiera el propio dueño pueda
-- cambiarla por API una vez guardada -- el frontend (services/jornadas.js)
-- ya no la envía en ningún UPDATE, esto es la segunda capa de protección.

-- ── PASO 1 (OBLIGATORIO) ───────────────────────────────────────────────────
-- Correr diagnostico-BIT-61-establecimiento-jornadas.sql completo y
-- confirmar en particular: tipo real de establecimientos.id (punto 2),
-- cantidad de filas existentes (punto 3/4), texto real de jornadas_insert
-- (punto 6), y si migration-BIT-49c está aplicada (punto 7) -- de esto
-- último depende cuál de las dos opciones del PASO 4 corresponde.

-- ── PASO 2 — COLUMNA (idempotente) ─────────────────────────────────────────
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS establecimiento_id uuid REFERENCES public.establecimientos(id);

CREATE INDEX IF NOT EXISTS idx_jornadas_establecimiento_id ON public.jornadas(establecimiento_id);

-- ── PASO 3 — RLS: exigir acceso real al establecimiento en el INSERT ──────
-- Reconstrucción de la policy real de INSERT a partir de lo documentado en
-- BIT-46/49 (autorización = propiedad, auth.uid() = profesional_id) --
-- NO es el texto confirmado por pg_policies. ADAPTAR esta sentencia al
-- resultado real del Paso 1/punto 6 ANTES de aplicar si difiere (mismo
-- criterio que migration-BIT-49-papelera-jornadas.sql §2b).
DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
CREATE POLICY jornadas_insert ON public.jornadas
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.uid() = profesional_id
    AND establecimiento_id IS NOT NULL
    AND tiene_acceso_establecimiento(establecimiento_id)
  );
-- No se toca jornadas_update ni jornadas_select -- el establecimiento no se
-- escribe nunca en un UPDATE (ver services/jornadas.js y el GRANT del Paso
-- 4), así que no hace falta validarlo ahí; y el SELECT ya filtra por
-- propiedad/admin desde BIT-49, sin relación con establecimiento.

-- ── PASO 4 — GRANT: elegir SOLO UNA de las dos opciones según el PASO 1 ───

-- OPCIÓN A — si el diagnóstico (punto 7) confirmó que
-- migration-BIT-49c-proteger-columnas-soft-delete-jornadas.sql SÍ está
-- aplicada (authenticated ya tiene GRANT por columna, no por tabla):
--   GRANT INSERT (profesional_id, establecimiento_id, fecha, hora_llegada, hora_salida, notas)
--     ON public.jornadas TO authenticated;
--   -- UPDATE se deja EXACTAMENTE como quedó en BIT-49c (fecha, hora_llegada,
--   -- hora_salida, notas) -- NO agregar establecimiento_id ahí, a propósito:
--   -- así queda inmutable también a nivel de base, no solo por convención
--   -- del frontend.

-- OPCIÓN B — si el diagnóstico (punto 7/8) confirmó que BIT-49c NO está
-- aplicada (authenticated sigue con INSERT/UPDATE a nivel de tabla
-- completa): no hace falta ningún GRANT nuevo -- el GRANT de tabla
-- completa ya cubre la columna nueva. En este caso, la ÚNICA protección
-- real de inmutabilidad es la policy de INSERT (Paso 3, que no permite
-- establecimiento_id NULL) más la disciplina del frontend (services/
-- jornadas.js nunca envía establecimiento_id en un UPDATE) -- documentar
-- esto como riesgo residual menor (un cliente que no sea la app podría en
-- teoría hacer UPDATE de establecimiento_id vía API cruda) hasta que BIT-49c
-- se aplique.

-- ── PASO 5 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ───────
-- Ejecutar como un profesional real (no service role):
--
-- BEGIN;
--   -- Caso 1 -- INSERT con establecimiento al que el usuario SÍ tiene
--   -- acceso → DEBE PASAR:
--   -- INSERT INTO jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
--   -- VALUES (auth.uid(), '<establecimiento_autorizado_id>', current_date, '08:00:00');
--
--   -- Caso 2 -- INSERT con establecimiento_id NULL → DEBE FALLAR (policy):
--   -- INSERT INTO jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
--   -- VALUES (auth.uid(), NULL, current_date, '08:00:00');
--
--   -- Caso 3 -- INSERT con establecimiento al que el usuario NO tiene
--   -- acceso → DEBE FALLAR (policy):
--   -- INSERT INTO jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
--   -- VALUES (auth.uid(), '<establecimiento_no_autorizado_id>', current_date, '08:00:00');
--
--   -- Caso 4 -- UPDATE normal de fecha/hora_salida/notas de una jornada
--   -- propia (sin tocar establecimiento_id) → DEBE SEGUIR FUNCIONANDO igual
--   -- que antes de esta migración.
--
--   -- Caso 5 -- intento de UPDATE de establecimiento_id por API cruda (no
--   -- vía el frontend, que nunca lo envía) → DEBE FALLAR si se aplicó la
--   -- Opción A del Paso 4; si se aplicó la Opción B, puede pasar a nivel de
--   -- base (riesgo residual documentado arriba) pero el frontend nunca lo
--   -- hace.
-- ROLLBACK; -- no dejar registros de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jornadas' AND column_name='establecimiento_id';
--   SELECT indexname FROM pg_indexes WHERE tablename='jornadas' AND indexname='idx_jornadas_establecimiento_id';
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='jornadas' AND policyname='jornadas_insert';
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.jornadas'::regclass AND contype='f';
--   -- Debe aparecer la nueva FK a establecimientos(id), NO ACTION.

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo si NINGUNA Jornada real llegó a usar establecimiento_id todavía:
--   SELECT count(*) FROM jornadas WHERE establecimiento_id IS NOT NULL;
--   -- Debe dar 0 antes de considerar deshacer.
--   DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
--   -- Recrear jornadas_insert con el texto EXACTO que tenía antes de este
--   -- archivo (tomado del Paso 1/punto 6 de ESTA migración, guardado antes
--   -- de aplicar -- no inventar un texto de memoria para el rollback).
--   DROP INDEX IF EXISTS idx_jornadas_establecimiento_id;
--   ALTER TABLE public.jornadas DROP COLUMN IF EXISTS establecimiento_id;
