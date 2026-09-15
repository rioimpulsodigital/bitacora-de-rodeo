-- Descubierto vía regresión de BIT-11, pero la tabla pertenece al módulo
-- Animales (BIT-07) — restringir UPDATE de `animales` para OPERADOR_CAMPO
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
--
-- CONTEXTO
-- Durante la validación final + regresión de BIT-11 con un usuario real
-- OPERADOR_CAMPO, se confirmó que puede editar Pacientes existentes desde
-- la UI. Decisión funcional ya aprobada (Brenda/IAn):
--
--   Acción                      | ADMINISTRADOR | PROFESIONAL | OPERADOR_CAMPO
--   Ver Pacientes               | Sí            | Sí          | Sí
--   Crear Paciente              | Sí            | Sí          | Sí
--   Crear Tutor                 | Sí            | Sí          | Sí
--   Editar Paciente existente   | Sí            | Sí          | No
--
-- CLASIFICACIÓN DEL HALLAZGO: AMBOS (frontend + backend).
--
-- Frontend (ya corregido en este commit, ver rodeo/js/modules/animales/
-- list.js y form.js): el listado mostraba el link "Editar" sin ningún
-- chequeo de rol, y mountAnimalForm() no tenía ningún gate de rol para
-- edición (a diferencia de atenciones/form.js, que sí bloquea a
-- OPERADOR_CAMPO desde el frontend). Ocultar el botón por sí solo NO es
-- suficiente -- por eso este script ataca también el backend.
--
-- Backend/RLS: no existe ningún CREATE TABLE/policy de `animales`
-- versionado en este repo (se creó directamente en Supabase en BIT-07,
-- igual que personas/visitas/atenciones_clinicas antes de sus respectivas
-- correcciones). Todo indica que la policy UPDATE actual está scopeada
-- solo por establecimiento (vía tiene_acceso_establecimiento sobre
-- establecimiento_actual_id), sin discriminar por rol -- el mismo patrón
-- que ya vimos en atenciones_clinicas_select/update antes de la
-- migración de BIT-11 (§22.8 de la spec: tiene_acceso_establecimiento()
-- no filtra por rol). Hay que confirmarlo con el Paso 1 antes de tocar
-- nada -- lo de abajo es una propuesta sobre el patrón ya usado en el
-- proyecto, no una copia de la policy real.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ──────────────────────────────────────
-- Documentar el resultado en BIT-11 (Notion) antes de aplicar nada.
--
--   -- Políticas actuales de animales:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'animales';
--
--   -- Columnas de animales (confirmar establecimiento_actual_id y que no
--   -- hay otra columna de scoping distinta):
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'animales'
--   ORDER BY ordinal_position;
--
--   -- RLS habilitado/forzado:
--   SELECT relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relname = 'animales';
--
--   -- Grants directos a authenticated (para confirmar que UPDATE no llega
--   -- por un GRANT amplio en vez de por policy):
--   SELECT privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'animales' AND grantee = 'authenticated';
--
-- Si el SELECT de pg_policies muestra que la policy UPDATE ya distingue
-- por rol y excluye a OPERADOR_CAMPO, DETENERSE: el problema sería
-- exclusivamente frontend (ya corregido en este commit) y este Paso 2 no
-- correspondería aplicarse.

-- ── PASO 2 — CORRECCIÓN (idempotente) ───────────────────────────────────────
-- Reemplaza únicamente la policy de UPDATE. No se toca SELECT, INSERT,
-- la RPC crear_persona_con_establecimiento(), ni ninguna policy de
-- personas/personas_establecimientos.
--
-- Ajustar el nombre real de la policy (abajo se asume "animales_update"
-- por convención con atenciones_clinicas_update; confirmar con el
-- resultado del Paso 1 antes de correr el DROP) y el USING/WITH CHECK
-- exacto si el Paso 1 revela una condición de acceso distinta a
-- tiene_acceso_establecimiento(establecimiento_actual_id).

DROP POLICY IF EXISTS "animales_update" ON animales;

CREATE POLICY "animales_update" ON animales
  FOR UPDATE
  USING (
    tiene_acceso_establecimiento(establecimiento_actual_id)
    AND get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  )
  WITH CHECK (
    tiene_acceso_establecimiento(establecimiento_actual_id)
    AND get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

-- No se modifica la policy de SELECT ni de INSERT de animales: ambas deben
-- seguir permitiendo a OPERADOR_CAMPO ver y crear Pacientes.
-- No se modifica personas, personas_establecimientos ni la función
-- crear_persona_con_establecimiento().

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar con sesiones reales de cada rol (no service role).
--
-- BEGIN;
--
--   -- (Paso 2 ya aplicado más arriba en esta misma sesión/transacción)
--
--   -- Caso 1 -- ADMINISTRADOR, UPDATE sobre Paciente de su establecimiento
--   -- → DEBE PASAR.
--
--   -- Caso 2 -- PROFESIONAL, UPDATE sobre Paciente de su establecimiento
--   -- → DEBE PASAR.
--
--   -- Caso 3 -- OPERADOR_CAMPO, UPDATE sobre Paciente de su establecimiento
--   -- → DEBE FALLAR (0 filas afectadas o error de policy, según cómo
--   -- Supabase lo devuelva sin WITH CHECK que levante excepción explícita).
--
--   -- Caso 4 -- OPERADOR_CAMPO, INSERT de un Paciente nuevo en su
--   -- establecimiento → DEBE SEGUIR PASANDO (política de INSERT sin tocar).
--
--   -- Caso 5 -- OPERADOR_CAMPO, crear_persona_con_establecimiento() con su
--   -- establecimiento autorizado → DEBE SEGUIR PASANDO (función sin tocar).
--
-- ROLLBACK; -- no dejar cambios de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ─────────────────────────────
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'animales' AND cmd = 'UPDATE';
