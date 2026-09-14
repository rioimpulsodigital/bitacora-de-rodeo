-- Descubierto vía BIT-11, pero la tabla pertenece al módulo Animales (BIT-07)
-- Corrección de RLS en `personas` (Tutor Responsable) que bloquea el INSERT
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
--
-- ACTUALIZADO — decisión funcional de Brenda/IAn: reemplaza la propuesta
-- anterior de este archivo (policy de INSERT directa sobre `personas`).
-- Esa propuesta quedó descartada: se decidió NO abrir una policy global de
-- INSERT sobre `personas` sin control contextual, y en su lugar usar una
-- RPC atómica que valida el establecimiento antes de escribir nada.
--
-- CONTEXTO
-- Flujo: Nueva Atención → + Nuevo Paciente → Nuevo Paciente Animal →
-- + Crear nuevo tutor → Guardar tutor. Producción devuelve:
--   new row violates row-level security policy for table "personas"
--
-- Esto bloquea el flujo obligatorio de BIT-11 (crear paciente → volver a
-- la Atención → paciente preseleccionado).
--
-- DECISIÓN FUNCIONAL VIGENTE (Brenda/IAn): crear Pacientes/Tutores NO es
-- una acción clínica exclusiva de PROFESIONAL. En V1 pueden crear
-- Pacientes/Tutores los 3 roles -- ADMINISTRADOR, PROFESIONAL,
-- OPERADOR_CAMPO -- siempre dentro de un establecimiento al que el
-- usuario tenga acceso. Coincide con que el frontend de Animales no filtra
-- por rol hoy (a diferencia de Atenciones Clínicas).
--
-- POR QUÉ UNA RPC Y NO UNA POLICY DIRECTA
-- `personas` no tiene establecimiento_id propio (confirmado por el código:
-- ni crearPersona ni getAnimal/listPersonas la referencian). El vínculo a
-- un establecimiento se crea recién en un segundo INSERT, sobre
-- `personas_establecimientos`. Eso significa que una policy de INSERT
-- directa sobre `personas` NUNCA puede validar
-- tiene_acceso_establecimiento() en el momento de crear la fila -- solo
-- puede autorizar "cualquier usuario válido", sin contexto de a qué
-- establecimiento va a terminar asociada esa persona. Eso es exactamente
-- la "policy global sin control contextual" que se pidió evitar.
--
-- La alternativa segura: una función RPC SECURITY DEFINER que recibe el
-- establecimiento_id como parámetro explícito, valida
-- tiene_acceso_establecimiento(p_establecimiento_id) ANTES de escribir
-- nada, y hace los dos INSERT (personas + personas_establecimientos) en
-- una sola operación atómica. `personas` y `personas_establecimientos`
-- NO necesitan una policy de INSERT abierta a clientes: la única vía de
-- escritura pasa por esta función.
--
-- No existe ningún CREATE TABLE/policy de `personas` ni
-- `personas_establecimientos` versionado en este repo (se crearon
-- directamente en Supabase), así que el Paso 1 (diagnóstico) sigue siendo
-- obligatorio antes de tocar nada.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ──────────────────────────────────────
-- Documentar el resultado en BIT-11 (Notion) antes de aplicar nada.
--
--   -- Políticas actuales de personas:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'personas';
--
--   -- Políticas actuales de personas_establecimientos:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'personas_establecimientos';
--
--   -- Confirmar que personas NO tiene establecimiento_id (ni ninguna otra
--   -- columna de scoping):
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'personas'
--   ORDER BY ordinal_position;
--
--   -- RLS habilitado/forzado en ambas tablas:
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relname IN ('personas', 'personas_establecimientos');
--
--   -- Grants directos de INSERT a `authenticated` sobre ambas tablas
--   -- (si existen, quedan huérfanos una vez que se adopta la RPC -- ver
--   -- nota al final del Paso 2):
--   SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name IN ('personas', 'personas_establecimientos')
--     AND grantee = 'authenticated';
--
-- Si algo de esto contradice lo asumido en este script (por ejemplo, si
-- `personas` sí tiene una columna de scoping que no vimos en el código),
-- DETENERSE y reportar antes de continuar.

-- ── PASO 2 — RPC ATÓMICA (idempotente vía CREATE OR REPLACE) ────────────────
-- Crea la persona y su vínculo al establecimiento en una sola operación.
-- SECURITY DEFINER: corre con privilegios del dueño de la función (igual
-- que atenciones_clinicas_set_updated_by en migration-BIT-11.sql), por lo
-- que sus INSERT internos no dependen de que exista una policy de INSERT
-- abierta en personas/personas_establecimientos.
-- search_path fijo para evitar que una tabla/función maliciosa en otro
-- schema intercepte las referencias no calificadas.

CREATE OR REPLACE FUNCTION crear_persona_con_establecimiento(
  p_nombre text,
  p_telefono text,
  p_email text,
  p_establecimiento_id uuid
)
RETURNS TABLE (id uuid, nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_persona_id uuid;
BEGIN
  IF p_establecimiento_id IS NULL OR NOT tiene_acceso_establecimiento(p_establecimiento_id) THEN
    RAISE EXCEPTION 'Sin acceso al establecimiento indicado' USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio' USING ERRCODE = '22023';
  END IF;

  INSERT INTO personas (nombre, telefono, email)
  VALUES (btrim(p_nombre), NULLIF(btrim(p_telefono), ''), NULLIF(btrim(p_email), ''))
  RETURNING personas.id INTO v_persona_id;

  -- Si esta segunda escritura falla (FK inválida, error inesperado, etc.),
  -- toda la función aborta como una sola sentencia: no queda una fila en
  -- personas sin su vínculo -- Postgres revierte ambos INSERT juntos.
  INSERT INTO personas_establecimientos (persona_id, establecimiento_id)
  VALUES (v_persona_id, p_establecimiento_id);

  RETURN QUERY SELECT p.id, p.nombre FROM personas p WHERE p.id = v_persona_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_persona_con_establecimiento(text, text, text, uuid) TO authenticated;

-- No se crea ninguna policy de INSERT sobre personas ni sobre
-- personas_establecimientos. Si el Paso 1 encuentra grants directos de
-- INSERT a `authenticated` sobre cualquiera de las dos tablas, revisar con
-- Brenda si conviene revocarlos para que la RPC sea la única vía de
-- escritura (recomendado, pero no incluido acá como acción automática
-- porque no sabemos si algo más del sistema depende de esos grants):
--
-- REVOKE INSERT ON personas TO authenticated;
-- REVOKE INSERT ON personas_establecimientos TO authenticated;

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar como cada uno de los 3 roles reales disponibles (no como
-- service role, para que la prueba sea representativa de RLS real).
--
-- BEGIN;
--
--   -- (Paso 2 ya aplicado más arriba en esta misma sesión/transacción)
--
--   -- Caso 1 -- PROFESIONAL, establecimiento autorizado → DEBE PASAR:
--   SELECT * FROM crear_persona_con_establecimiento(
--     'Tutor Demo RLS - PROFESIONAL', NULL, NULL, '<establecimiento_autorizado_id>'
--   );
--
--   -- Caso 2 -- ADMINISTRADOR, establecimiento autorizado → DEBE PASAR
--   -- (repetir con sesión de ADMINISTRADOR).
--
--   -- Caso 3 -- OPERADOR_CAMPO, establecimiento autorizado → DEBE PASAR
--   -- (repetir con sesión de OPERADOR_CAMPO).
--
--   -- Caso 4 -- cualquier rol, establecimiento NO autorizado → DEBE FALLAR
--   -- con "Sin acceso al establecimiento indicado":
--   -- SELECT * FROM crear_persona_con_establecimiento(
--   --   'No debería crearse', NULL, NULL, '<establecimiento_no_autorizado_id>'
--   -- );
--
--   -- Caso 5 -- confirmar que el Caso 4 no dejó una fila huérfana en
--   -- personas (debe dar 0):
--   -- SELECT COUNT(*) FROM personas WHERE nombre = 'No debería crearse';
--
-- ROLLBACK; -- no dejar registros de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ─────────────────────────────
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'crear_persona_con_establecimiento';
--   -- prosecdef debe ser true (SECURITY DEFINER activo)
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_routine_grants
--   WHERE routine_name = 'crear_persona_con_establecimiento';
--   -- authenticated debe tener EXECUTE
