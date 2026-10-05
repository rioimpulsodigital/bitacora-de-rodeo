-- BIT-61 — Diagnóstico de solo lectura previo a agregar establecimiento_id
-- a `jornadas` (corrección de regla de dominio: una Jornada pertenece a UN
-- único establecimiento).
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción.
-- 100% SOLO LECTURA: únicamente SELECT sobre information_schema / pg_catalog /
-- tablas de dominio. No incluye INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE.
-- Anthy no tiene acceso a Supabase: este script queda preparado para Claudy.
-- Pegar cada resultado tal cual, sin resumir -- la migración de BIT-61
-- depende de todo lo de abajo, en particular de si hay Jornadas reales ya
-- cargadas y de si migration-BIT-49c-proteger-columnas-soft-delete-jornadas.sql
-- está aplicada (define si el GRANT de esta migración debe ser por columna
-- o no hace falta tocarlo).

-- 1) Columnas reales ACTUALES de jornadas (confirmar que establecimiento_id
--    NO existe todavía, y los tipos exactos de las columnas existentes).
SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jornadas'
ORDER BY ordinal_position;

-- 2) Tipo real de establecimientos.id (se asume uuid por el patrón ya usado
-- en atenciones_clinicas.establecimiento_id, novedades_establecimiento,
-- visitas.establecimiento_id -- CONFIRMAR, no asumir ciegamente).
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'establecimientos' AND column_name = 'id';

-- 3) ¿CUÁNTAS Jornadas reales existen hoy, y cuántos profesionales distintos
--    las cargaron? (BIT-46, 24 Sep 2026, reportó 0 -- CONFIRMAR si sigue
--    siendo 0 o si ya hay filas reales cargadas por el CRUD viejo de
--    #jornadas, vigente en Producción desde antes de esta tarea).
SELECT
  count(*) AS jornadas_total,
  count(*) FILTER (WHERE deleted_at IS NOT NULL) AS jornadas_en_papelera,
  count(DISTINCT profesional_id) AS profesionales_con_jornadas
FROM jornadas;

-- 4) Si el punto 3 dio más de 0: detalle completo de esas filas, para
--    decidir la estrategia de datos existentes (NO inferir establecimiento
--    por fecha/hora -- esto es solo para que Bren/KLIAM decidan con datos
--    reales a la vista, no para que Anthy asuma nada).
SELECT j.id, j.profesional_id, p.nombre AS profesional, j.fecha, j.hora_llegada, j.hora_salida, j.deleted_at
FROM jornadas j
LEFT JOIN perfiles p ON p.id = j.profesional_id
ORDER BY j.fecha DESC;

-- 5) RLS habilitado/forzado y owner de la tabla (no debería haber cambiado
--    desde BIT-49, pero se reconfirma).
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c WHERE c.oid = 'public.jornadas'::regclass;

-- 6) Policies REALES y completas de jornadas (USING / WITH CHECK textual).
--    Crítico: el texto real de jornadas_insert y jornadas_update -- la
--    migración de este archivo depende de adaptar el WITH CHECK de INSERT
--    a lo que diga acá, no a lo que se documentó de memoria en BIT-46/49.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jornadas'
ORDER BY cmd, policyname;

-- 7) ¿Está aplicada migration-BIT-49c (grants por columna)? Si esta
--    consulta devuelve filas, SÍ -- y el GRANT de esta migración debe
--    agregar establecimiento_id a la lista de columnas de INSERT (nunca a
--    la de UPDATE). Si no devuelve filas, NO está aplicada -- authenticated
--    sigue con INSERT/UPDATE a nivel de tabla completa y no hace falta
--    tocar ningún GRANT para la columna nueva.
SELECT a.attname, a.attacl
FROM pg_attribute a
WHERE a.attrelid = 'public.jornadas'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;

-- 8) Grants de tabla completa vigentes (confirmar que siguen ahí si el
--    punto 7 dio 0 filas).
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'jornadas' AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY grantee, privilege_type;

-- 9) Confirmar que tiene_acceso_establecimiento() sigue siendo la función
--    real a reutilizar para el WITH CHECK nuevo (no debería haber cambiado,
--    pero se reconfirma su firma/definición antes de referenciarla).
SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'tiene_acceso_establecimiento';

-- 10) Índices existentes de jornadas (para no duplicar si ya hubiera algo
--     parecido, aunque no se espera nada sobre una columna que no existe).
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'jornadas';

-- Si algo de esto contradice lo asumido en migration-BIT-61-establecimiento-
-- jornada.sql: DETENERSE y reportar antes de aplicar esa migración.
