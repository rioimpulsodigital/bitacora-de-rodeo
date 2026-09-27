-- BIT-49 — Diagnóstico de solo lectura de `jornadas` (previo a cualquier migración)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción.
-- 100% SOLO LECTURA: únicamente SELECT sobre information_schema / pg_catalog /
-- tablas de dominio. No incluye INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE.
-- Anthy no tiene acceso a Supabase: este script queda preparado para Claudy.
--
-- Por qué existe: BIT-46 confirmó `jornadas_delete` textual y las FK, pero no
-- transcribió las otras policies, los triggers, los grants ni las columnas
-- exactas, y BIT-48 mostró que asumir una expresión (is_admin() vs
-- get_mi_rol()) puede ser incorrecto. Las migraciones de BIT-49 dependen de
-- TODO lo de abajo. Pegar cada resultado tal cual, sin resumir.
-- Antes de correr: confirmar proyecto tejnjojuoiuehnpsynof (PRODUCTION).

-- 0) Entorno.
SELECT current_database() AS base, current_user AS usuario_sesion, now() AS ahora, version();

-- 1) Columnas reales de jornadas. Confirmar: id, profesional_id, fecha,
--    hora_llegada, hora_salida, notas (tipos y nullabilidad); que NO existan
--    deleted_at / deleted_by todavía; y si existen created_at / updated_at /
--    updated_by (las migraciones NO los usan, no se asumen).
SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jornadas'
ORDER BY ordinal_position;

-- 2) Todas las constraints de jornadas (PK, FK salientes, CHECK, UNIQUE) con
--    su regla de borrado real (pg_get_constraintdef omite ON DELETE cuando es NO ACTION).
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definicion,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
            ELSE '-' END AS on_delete
FROM pg_constraint con
WHERE con.conrelid = 'public.jornadas'::regclass
ORDER BY con.contype, con.conname;

-- 3) FK ENTRANTES: toda tabla que referencia a jornadas y su ON DELETE real.
--    Esperado (BIT-46): solo visitas.jornada_id → jornadas(id) NO ACTION.
--    Si aparece otra: DETENERSE y reportar (la función hard_delete_jornada
--    solo verifica visitas hoy).
SELECT con.conrelid::regclass AS tabla_origen, con.conname, pg_get_constraintdef(con.oid) AS definicion,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
            ELSE '-' END AS on_delete
FROM pg_constraint con
WHERE con.contype = 'f' AND con.confrelid = 'public.jornadas'::regclass;

-- 3b) Cualquier columna llamada como jornada en cualquier tabla (referencias
--     lógicas sin FK declarada).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name ILIKE '%jornada%'
ORDER BY table_name, column_name;

-- 4) RLS habilitado/forzado y owner de la tabla.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c WHERE c.oid = 'public.jornadas'::regclass;

-- 5) Policies REALES, textuales (USING / WITH CHECK completos), roles y
--    permissive/restrictive. Confirmar especialmente:
--    jornadas_select  (insumo del rollback de migration-BIT-49),
--    jornadas_update  (¿restringe deleted_at? hoy no puede: la columna no existe),
--    jornadas_delete  (insumo del rollback de migration-BIT-49b; BIT-46 la
--                      capturó como PERMISSIVE, roles {public},
--                      USING ((auth.uid() = profesional_id) OR is_admin()),
--                      WITH CHECK NULL — RECONFIRMAR acá, no dar por vigente).
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jornadas'
ORDER BY cmd, policyname;

-- 6) Triggers sobre jornadas y el cuerpo de sus funciones. Confirmar si
--    alguno toca updated_at/updated_by/deleted_* o valida transiciones
--    (en BIT-48 un trigger BEFORE UPDATE existente condicionaba el diseño).
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
WHERE t.tgrelid = 'public.jornadas'::regclass AND NOT t.tgisinternal;

SELECT t.tgname, p.proname, pg_get_functiondef(p.oid) AS cuerpo
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.jornadas'::regclass AND NOT t.tgisinternal;

-- 7) Grants de tabla (relacl crudo) y grants por columna (attacl). La
--    migración 49c depende de esto: hoy se espera authenticated con DML
--    completo a nivel tabla y ninguna ACL por columna.
SELECT c.relname, c.relacl FROM pg_class c WHERE c.oid = 'public.jornadas'::regclass;

SELECT a.attname, a.attacl
FROM pg_attribute a
WHERE a.attrelid = 'public.jornadas'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'jornadas' AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY grantee, privilege_type;

-- 8) Funciones relacionadas con jornadas (por nombre o por referencias en su
--    código): firma, SECURITY DEFINER/INVOKER, owner, search_path. Las 4 nuevas
--    (soft_delete_jornada, restore_jornada, hard_delete_jornada,
--    listar_jornadas_papelera) NO deben existir todavía.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner, p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%jornada%' OR p.prosrc ILIKE '%jornadas%')
ORDER BY p.proname;

-- 8b) Definición de las funciones de autorización que usarán las nuevas
--     funciones (continuidad con BIT-46; confirmar que no cambiaron).
SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('is_admin', 'get_mi_rol');

-- 9) Objetos que dependen de jornadas (vistas, vistas materializadas, reglas).
--    Esperado: ninguno.
SELECT DISTINCT dep.relname AS objeto_dependiente, dep.relkind
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dep ON dep.oid = r.ev_class
WHERE d.refobjid = 'public.jornadas'::regclass AND dep.oid <> 'public.jornadas'::regclass;

-- 10) Índices de jornadas.
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'jornadas';

-- 11) Dimensión real: jornadas, y visitas que referencian jornadas.
--     (BIT-46, 24 Sep 2026: 0 jornadas, 7 visitas, 0 con jornada_id.)
SELECT
  (SELECT count(*) FROM jornadas) AS jornadas_total,
  (SELECT count(DISTINCT profesional_id) FROM jornadas) AS profesionales_con_jornadas,
  (SELECT count(*) FROM visitas) AS visitas_total,
  (SELECT count(*) FROM visitas WHERE jornada_id IS NOT NULL) AS visitas_con_jornada_id;

-- 11b) Detalle de referencias reales visitas → jornadas (solo ids/fechas).
SELECT v.id AS visita_id, v.fecha AS visita_fecha, v.establecimiento_id, v.jornada_id, j.profesional_id
FROM visitas v JOIN jornadas j ON j.id = v.jornada_id
ORDER BY v.fecha DESC
LIMIT 50;

-- 12) Perfiles reales por rol/estado: define qué usuarios de prueba existen
--     para la validación por roles (sin datos personales).
SELECT rol, activo, count(*) AS cantidad FROM perfiles GROUP BY rol, activo ORDER BY rol, activo;
