-- BIT-48 — Pre-chequeo de solo lectura del módulo piloto (Novedades)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción, ANTES de aplicar
-- cualquier migración de BIT-48.
-- 100% SOLO LECTURA: únicamente SELECT sobre information_schema / pg_catalog.
-- No incluye INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE.
--
-- Por qué existe: BIT-46 (Claudy, 24 Sep 2026) confirmó en Producción la
-- definición de soft_delete_novedad() y resumió las policies de
-- novedades_establecimiento, pero NO transcribió las expresiones USING/WITH
-- CHECK textuales, los triggers ni los grants. Esta migración depende de
-- todo eso (ver "Qué debe confirmarse" en cada sección). Pegar el resultado
-- tal cual, sin resumir.

-- 1) Columnas reales de las dos tablas (nombres, tipos, nullabilidad, defaults).
--    Confirmar: deleted_at, deleted_by, updated_at, updated_by, fecha, tipo,
--    descripcion, animal_id, lote_id, establecimiento_id; y en adjuntos,
--    novedad_id + cualquier columna que apunte a un archivo (ruta/URL/storage).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('novedades_establecimiento', 'novedades_adjuntos')
ORDER BY table_name, ordinal_position;

-- 2) Policies reales, TEXTUALES (USING / WITH CHECK completos).
--    Confirmar: policy SELECT (cómo trata deleted_at y a ADMINISTRADOR),
--    UPDATE (permite reactivar solo a ADMINISTRADOR), DELETE (nombre exacto:
--    se asume novedades_delete) — su expresión literal hace falta para el
--    rollback de migration-BIT-48b.
SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('novedades_establecimiento', 'novedades_adjuntos')
ORDER BY tablename, cmd, policyname;

-- 3) Triggers sobre ambas tablas y definición de sus funciones.
--    Confirmar: si un trigger (p.ej. novedades_updated_by) pisa
--    updated_by/updated_at/deleted_by o valida transiciones de deleted_at —
--    restore_novedad() pone deleted_at = NULL y no debe chocar con ninguno.
SELECT c.relname AS tabla, t.tgname, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND c.relname IN ('novedades_establecimiento', 'novedades_adjuntos');

SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    SELECT (regexp_match(pg_get_triggerdef(t.oid), 'EXECUTE (?:FUNCTION|PROCEDURE) (?:public\.)?([a-z_0-9]+)'))[1]
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relname IN ('novedades_establecimiento', 'novedades_adjuntos')
  );

-- 4) Las tres funciones nuevas NO deben existir todavía (0 filas esperadas).
--    soft_delete_novedad sí debe existir (se reutiliza sin cambios).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('soft_delete_novedad', 'restore_novedad', 'hard_delete_novedad', 'listar_novedades_papelera');

-- 5) Quién puede ejecutar soft_delete_novedad hoy (referencia para replicar
--    el mismo criterio de exposición en las funciones nuevas).
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'soft_delete_novedad'
ORDER BY grantee;

-- 6) Grants de tabla para authenticated / anon sobre ambas tablas.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('novedades_establecimiento', 'novedades_adjuntos')
  AND grantee IN ('authenticated', 'anon', 'public')
ORDER BY table_name, grantee, privilege_type;

-- 7) TODA FK que apunte a novedades_establecimiento (BIT-46 encontró solo
--    novedades_adjuntos.novedad_id ON DELETE CASCADE; confirmar que no hay otra)
--    y su regla real de borrado.
SELECT con.conrelid::regclass AS tabla_origen, con.conname,
       pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.confrelid = 'public.novedades_establecimiento'::regclass;

-- 8) Dimensión real (no modifica nada).
SELECT
  (SELECT count(*) FROM novedades_establecimiento) AS novedades_total,
  (SELECT count(*) FROM novedades_establecimiento WHERE deleted_at IS NOT NULL) AS novedades_en_papelera,
  (SELECT count(*) FROM novedades_adjuntos) AS adjuntos_total;

-- 9) ¿Alguna vista u objeto depende de novedades_establecimiento?
SELECT DISTINCT v.table_name AS vista
FROM information_schema.view_table_usage v
WHERE v.table_schema = 'public' AND v.table_name = 'novedades_establecimiento';
