-- BIT-61 — Diagnóstico FINAL de solo lectura, previo a la migración
-- consolidada (establecimiento_id en jornadas + capacidad jornada_habilitada
-- por Usuario × Establecimiento).
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción, ANTES de
-- migration-BIT-61-final.sql.
-- 100% SOLO LECTURA: únicamente SELECT sobre information_schema / pg_catalog /
-- tablas de dominio. No incluye INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE.
-- Anthy no tiene acceso a Supabase: preparado para Claudy. Pegar cada
-- resultado tal cual, sin resumir -- la migración depende de todo esto.

-- ════════════════════════════════════════════════════════════════════════
-- PARTE A — jornadas
-- ════════════════════════════════════════════════════════════════════════

-- A1) Columnas reales ACTUALES de jornadas (confirmar que establecimiento_id
--     NO existe todavía).
SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jornadas'
ORDER BY ordinal_position;

-- A2) Cantidad real de Jornadas y cuántas tienen hora_salida IS NULL
--     (pedido explícito de esta ronda). BIT-46 (24 Sep 2026) reportó 0 --
--     CONFIRMAR si sigue así o si ya hay filas reales cargadas por el CRUD
--     viejo de #jornadas, vigente en Producción antes de este cierre.
SELECT
  count(*) AS jornadas_total,
  count(*) FILTER (WHERE hora_salida IS NULL) AS jornadas_abiertas,
  count(*) FILTER (WHERE deleted_at IS NOT NULL) AS jornadas_en_papelera,
  count(DISTINCT profesional_id) AS profesionales_con_jornadas
FROM jornadas;

-- A3) Si A2 dio más de 0 jornadas_total: detalle completo, para decidir la
--     estrategia de datos existentes (NO se va a inferir establecimiento por
--     fecha/hora -- esto es solo para que Bren/KLIAM decidan con datos
--     reales a la vista).
SELECT j.id, j.profesional_id, p.nombre AS profesional, j.fecha, j.hora_llegada, j.hora_salida, j.deleted_at
FROM jornadas j
LEFT JOIN perfiles p ON p.id = j.profesional_id
ORDER BY j.fecha DESC;

-- A4) RLS habilitado/forzado y owner de jornadas.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c WHERE c.oid = 'public.jornadas'::regclass;

-- A5) Policies REALES y completas de jornadas (USING / WITH CHECK textual).
--     Crítico: el texto real de jornadas_insert y jornadas_update -- la
--     migración depende de adaptar el WITH CHECK de INSERT a esto, no a lo
--     documentado de memoria en BIT-46/49.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jornadas'
ORDER BY cmd, policyname;

-- A6) Triggers existentes sobre jornadas (confirmar que no hay ninguno que
--     ya valide/bloquee cambios de columnas, antes de agregar el nuevo de
--     esta migración).
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
WHERE t.tgrelid = 'public.jornadas'::regclass AND NOT t.tgisinternal;

-- A7) ¿Está aplicada migration-BIT-49c (grants por columna)? Si esta
--     consulta devuelve filas para profesional_id/fecha/hora_llegada/
--     hora_salida/notas, SÍ -- y el GRANT de INSERT de esta migración debe
--     agregar establecimiento_id a esa lista de columnas. Si no devuelve
--     filas, NO está aplicada -- authenticated sigue con INSERT/UPDATE a
--     nivel de tabla completa.
SELECT a.attname, a.attacl
FROM pg_attribute a
WHERE a.attrelid = 'public.jornadas'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;

-- A8) Grants de tabla completa vigentes de jornadas.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'jornadas' AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY grantee, privilege_type;

-- ════════════════════════════════════════════════════════════════════════
-- PARTE B — establecimientos / establecimientos_usuarios
-- ════════════════════════════════════════════════════════════════════════

-- B1) Tipo real de establecimientos.id (se asume uuid por el patrón ya
--     usado en atenciones_clinicas.establecimiento_id -- CONFIRMAR).
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'establecimientos' AND column_name = 'id';

-- B2) Columnas reales ACTUALES de establecimientos_usuarios -- nunca se
--     versionó su CREATE TABLE en este repo; solo se confirmó por uso
--     (perfil_id, establecimiento_id, PK compuesta) en migration-BIT-50-
--     establecimiento-dolly.sql.
SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'establecimientos_usuarios'
ORDER BY ordinal_position;

-- B3) PK/constraints reales de establecimientos_usuarios.
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
WHERE con.conrelid = 'public.establecimientos_usuarios'::regclass
ORDER BY con.contype, con.conname;

-- B4) RLS/policies reales de establecimientos_usuarios.
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid = 'public.establecimientos_usuarios'::regclass;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'establecimientos_usuarios'
ORDER BY cmd, policyname;

-- B5) Grants reales de tabla/columna de establecimientos_usuarios.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'establecimientos_usuarios'
  AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY grantee, privilege_type;

-- B6) Filas reales existentes hoy en establecimientos_usuarios, y en
--     particular si Etel ya tiene fila para Fundación Dolly (si no la
--     tiene, habilitarla ahí quedaría en 0 filas hasta vincularla -- sería
--     un prerequisito aparte).
SELECT count(*) AS vinculos_totales, count(DISTINCT perfil_id) AS perfiles_distintos,
       count(DISTINCT establecimiento_id) AS establecimientos_distintos
FROM establecimientos_usuarios;

SELECT eu.perfil_id, p.nombre, p.rol, eu.establecimiento_id, e.nombre AS establecimiento
FROM establecimientos_usuarios eu
JOIN perfiles p ON p.id = eu.perfil_id
JOIN establecimientos e ON e.id = eu.establecimiento_id
ORDER BY p.nombre, e.nombre;

-- B7) Definición real de tiene_acceso_establecimiento() e is_admin() --
--     se reutiliza su mismo estilo (SECURITY DEFINER, search_path fijo,
--     bypass is_admin()) para tiene_jornada_habilitada().
SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('tiene_acceso_establecimiento', 'is_admin');

-- B8) Candidato real para el Caso 4 de la validación transaccional (Paso 3
--     de migration-BIT-61-final.sql, "sin acceso real al establecimiento"):
--     un establecimiento que EXISTE de verdad (para que la FK pase) pero
--     al que Etel no tiene NINGÚN vínculo en establecimientos_usuarios --
--     así el INSERT de prueba falla por autorización
--     (tiene_acceso_establecimiento = false), que es lo que se quiere
--     demostrar, no por un id inventado que ni siquiera existe. Usar el
--     primer resultado como <ESTABLECIMIENTO_SIN_ACCESO_REAL_ID>. Si no
--     devuelve ninguna fila (Etel está vinculada a TODOS los
--     establecimientos existentes), reportarlo -- el Caso 4 no sería
--     cubrible con datos reales hoy, y no se debe fabricar uno.
SELECT e.id, e.nombre
FROM establecimientos e
WHERE NOT EXISTS (
  SELECT 1 FROM establecimientos_usuarios eu
  WHERE eu.establecimiento_id = e.id
    AND eu.perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82'
)
ORDER BY e.nombre;

-- Si algo de esto contradice lo asumido en migration-BIT-61-final.sql:
-- DETENERSE y reportar antes de aplicar esa migración.
