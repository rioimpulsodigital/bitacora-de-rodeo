-- BIT-61 — Diagnóstico de solo lectura previo a la capacidad "Jornada
-- habilitada" por Usuario × Establecimiento.
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción.
-- 100% SOLO LECTURA. Anthy no tiene acceso a Supabase: preparado para Claudy.

-- 1) Columnas reales ACTUALES de establecimientos_usuarios -- nunca se
--    versionó su CREATE TABLE en este repo; solo se confirmó por uso
--    (perfil_id, establecimiento_id, PK compuesta) en migration-BIT-50-
--    establecimiento-dolly.sql. Confirmar que no exista ya ninguna columna
--    de capacidad, y el tipo exacto de cada columna.
SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'establecimientos_usuarios'
ORDER BY ordinal_position;

-- 2) PK/constraints reales de establecimientos_usuarios.
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
WHERE con.conrelid = 'public.establecimientos_usuarios'::regclass
ORDER BY con.contype, con.conname;

-- 3) RLS/policies reales de establecimientos_usuarios.
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid = 'public.establecimientos_usuarios'::regclass;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'establecimientos_usuarios'
ORDER BY cmd, policyname;

-- 4) Grants reales de tabla/columna de establecimientos_usuarios (mismo
--    criterio que con jornadas: define si el GRANT nuevo va a nivel de
--    tabla o si ya hay ACL por columna que haya que respetar).
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'establecimientos_usuarios'
  AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY grantee, privilege_type;

-- 5) Filas reales existentes hoy (cuántos usuarios, cuántos
--    establecimientos, para dimensionar el alcance del backfill de la
--    nueva columna -- default false no rompe nada, pero conviene saber
--    cuántas filas van a quedar en false hasta que alguien las habilite).
SELECT count(*) AS vinculos_totales, count(DISTINCT perfil_id) AS perfiles_distintos,
       count(DISTINCT establecimiento_id) AS establecimientos_distintos
FROM establecimientos_usuarios;

SELECT eu.perfil_id, p.nombre, p.rol, eu.establecimiento_id, e.nombre AS establecimiento
FROM establecimientos_usuarios eu
JOIN perfiles p ON p.id = eu.perfil_id
JOIN establecimientos e ON e.id = eu.establecimiento_id
ORDER BY p.nombre, e.nombre;

-- 6) Definición real de tiene_acceso_establecimiento() -- se va a reutilizar
--    su mismo estilo (SECURITY DEFINER, search_path fijo, bypass is_admin())
--    para la función nueva tiene_jornada_habilitada().
SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('tiene_acceso_establecimiento', 'is_admin');

-- 7) Confirmar que Etel (PROFESIONAL) y los demás perfiles reales tienen
--    fila en establecimientos_usuarios para Fundación Dolly -- si no la
--    tienen, habilitar Jornada ahí quedaría en 0 filas hasta vincularla.
SELECT eu.* FROM establecimientos_usuarios eu
JOIN establecimientos e ON e.id = eu.establecimiento_id
WHERE e.nombre = 'Fundación Dolly';

-- Si algo de esto contradice lo asumido en
-- migration-BIT-61-capacidad-jornada.sql: DETENERSE y reportar antes de
-- aplicar esa migración.
