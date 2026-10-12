-- BIT-59 — Diagnóstico de GRANTs reales vs. breaking change de la Data API
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- 100% SOLO LECTURA. No incluye ningún INSERT/UPDATE/DELETE/ALTER/CREATE/DROP.
-- No modificar schema, RLS, grants ni funciones. No ejecutar nada fuera de
-- estas queries.
--
-- Objetivo: documentar el estado REAL de los GRANTs de las 14 tablas de
-- dominio antes del 30 Oct 2026 (fecha en que Supabase deja de otorgar
-- GRANTs automáticos a tablas NUEVAS de `public` -- confirmado con Supabase
-- Staff en github.com/orgs/supabase/discussions/45329 que las tablas YA
-- EXISTENTES nunca pierden sus GRANTs actuales, "will never be silently
-- revoked" -- este diagnóstico es para completar la documentación de BIT-59,
-- NO porque haya un riesgo real sobre estas 14 tablas).
--
-- Pegar el resultado de cada sección tal como venga (no resumir ni editar).

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1 — GRANTs reales por tabla y rol (anon / authenticated / service_role)
-- ══════════════════════════════════════════════════════════════════════════

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento', 'novedades_adjuntos',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2 — Secuencias asociadas (PK identity/serial) y sus GRANTs
-- ══════════════════════════════════════════════════════════════════════════

-- 2a) Qué secuencias existen y a qué tabla/columna pertenecen:
SELECT
  s.relname AS secuencia,
  t.relname AS tabla,
  a.attname AS columna
FROM pg_class s
JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
JOIN pg_class t ON t.oid = d.refobjid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
WHERE s.relkind = 'S'
  AND t.relname IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento', 'novedades_adjuntos',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
ORDER BY tabla;

-- 2b) GRANTs reales sobre esas secuencias (reemplazar <secuencia> con cada
-- nombre real que devuelva 2a, o dejar esta query general si no hay ninguna
-- -- es esperable que la mayoría de estas tablas usen `uuid` por defecto y
-- NO tengan secuencia asociada):
SELECT object_name AS secuencia, grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema = 'public' AND object_type = 'SEQUENCE'
ORDER BY secuencia, grantee;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3 — Funciones RPC llamadas desde el frontend (.rpc(...)) y su EXECUTE
-- ══════════════════════════════════════════════════════════════════════════

-- Nota: el breaking change documentado (changelog #45329) es sobre TABLAS;
-- el EXECUTE de funciones es un mecanismo distinto de Postgres (PUBLIC recibe
-- EXECUTE por defecto en toda función nueva, al revés que las tablas) -- esta
-- sección es solo para completar la foto, no para aplicar ningún cambio.
SELECT
  p.proname AS funcion,
  p.prosecdef AS security_definer,
  r.routine_name,
  g.grantee,
  g.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN information_schema.routines r ON r.routine_name = p.proname AND r.routine_schema = 'public'
LEFT JOIN information_schema.role_routine_grants g ON g.routine_name = p.proname AND g.routine_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_mi_rol', 'is_admin', 'tiene_acceso_establecimiento',
    'tiene_jornada_habilitada', 'crear_persona_con_establecimiento',
    'soft_delete_novedad', 'restore_novedad', 'hard_delete_novedad',
    'listar_novedades_papelera', 'soft_delete_jornada', 'restore_jornada',
    'hard_delete_jornada', 'listar_jornadas_papelera'
  )
ORDER BY funcion, grantee;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4 — ¿Existe ya algún opt-out temprano del proyecto? (metadata, no
-- modifica nada)
-- ══════════════════════════════════════════════════════════════════════════

-- Confirma si el proyecto ya tiene el default revocado para objetos NUEVOS
-- (lo que haría redundante -- no dañino -- aplicar migration-BIT-59-opt-in-
-- temprano.sql más abajo en este mismo módulo):
SELECT
  defaclrole::regrole AS rol_que_definio_el_default,
  defaclnamespace::regnamespace AS esquema,
  defaclobjtype AS tipo_objeto,
  defaclacl AS acl
FROM pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace;

-- ══════════════════════════════════════════════════════════════════════════
-- FIN — no hay ninguna sección adicional que escriba datos.
-- ══════════════════════════════════════════════════════════════════════════
