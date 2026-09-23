-- BIT-46 — Diagnóstico de Producción: eliminación, RLS y relaciones
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- 100% SOLO LECTURA. No incluye ningún INSERT/UPDATE/DELETE/ALTER/CREATE/DROP.
-- No modificar schema, RLS ni funciones. No ejecutar nada fuera de estas queries.
--
-- Objetivo: Fase 1 del plan aprobado en BIT-35 — obtener evidencia real de
-- Producción antes de diseñar cualquier migración/policy/función del patrón
-- de soft-delete + Papelera. Anthy no tiene acceso a Supabase en esta sesión;
-- este script queda preparado para que Claudy lo ejecute y devuelva los
-- resultados, que se incorporarán al Informe Tipo B de BIT-46 en Notion.
--
-- Pegar el resultado de cada sección tal como venga (no resumir ni editar).

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1 — Identidad real de la tabla perfil↔establecimiento
-- ══════════════════════════════════════════════════════════════════════════

-- 1a) Cualquier tabla candidata por nombre:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name ILIKE '%establecimiento%' OR table_name ILIKE '%perfil%' OR table_name ILIKE '%usuario%')
ORDER BY table_name;

-- 1b) Cualquier FK real que conecte una tabla con `establecimientos` y con
-- `perfiles`/`auth.users` a la vez (la tabla de vínculo debería tener ambas):
SELECT
  con.conname,
  tbl.relname AS tabla_origen,
  ref.relname AS tabla_destino
FROM pg_constraint con
JOIN pg_class tbl ON tbl.oid = con.conrelid
JOIN pg_class ref ON ref.oid = con.confrelid
WHERE con.contype = 'f'
  AND ref.relname IN ('establecimientos', 'perfiles', 'users')
ORDER BY tabla_origen;

-- 1c) Si el paso 1a/1b confirma el nombre (sospecha: establecimientos_usuarios),
-- reemplazar <TABLA_VINCULO> abajo por el nombre real y correr:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '<TABLA_VINCULO>' ORDER BY ordinal_position;
-- SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = '<TABLA_VINCULO>'::regclass;
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<TABLA_VINCULO>';

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2 — Columnas reales de todas las tablas candidatas (una sola query)
-- ══════════════════════════════════════════════════════════════════════════

SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento', 'novedades_adjuntos',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
ORDER BY table_name, ordinal_position;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3 — PK / FK y su ON DELETE real (una sola query)
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name  AS tabla_referenciada,
  ccu.column_name AS columna_referenciada,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
LEFT JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento', 'novedades_adjuntos',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4 — Índices relevantes
-- ══════════════════════════════════════════════════════════════════════════

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
ORDER BY tablename;

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5 — RLS: habilitado/forzado + policies completas
-- ══════════════════════════════════════════════════════════════════════════

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
  AND relkind = 'r';

SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'jornadas', 'animales', 'lotes', 'lotes_animales', 'visitas',
    'observaciones_campo', 'novedades_establecimiento',
    'atenciones_clinicas', 'personas', 'personas_establecimientos',
    'perfiles', 'establecimientos', 'establecimientos_usuarios'
  )
ORDER BY tablename, cmd, policyname;

-- Atención especial pedida por Bren: confirmar la policy DELETE real de
-- `jornadas` específicamente (ya identificada en BIT-45 como
-- is_admin() OR auth.uid() = profesional_id, pero solo documentada, nunca
-- confirmada contra Producción real):
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jornadas' AND cmd = 'DELETE';

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 6 — Funciones auxiliares de autorización
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_mi_rol', 'is_admin', 'tiene_acceso_establecimiento',
    'soft_delete_novedad', 'crear_persona_con_establecimiento'
  );

-- Si pg_get_functiondef falla por alguna función agregada/ambigua, usar el
-- fallback ya validado en BIT-11 (§30.4 de la página de Notion):
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('get_mi_rol','is_admin','tiene_acceso_establecimiento');

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 7 — Jornadas: dependencias reales (sin ejecutar DELETE)
-- ══════════════════════════════════════════════════════════════════════════

-- ¿Hay filas reales de `visitas` que ya usan jornada_id? (el código actual
-- nunca lo escribe, pero puede haber datos legacy o cargados manualmente)
SELECT count(*) AS visitas_con_jornada_id FROM visitas WHERE jornada_id IS NOT NULL;

-- ¿jornada_id tiene una FK real declarada hacia jornadas, con qué ON DELETE?
-- (ya cubierto por la Sección 3, filtrando tc.table_name = 'visitas' y
-- kcu.column_name = 'jornada_id' — se repite acá para visibilidad directa)
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS referencia, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
LEFT JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'visitas' AND kcu.column_name = 'jornada_id';

-- ══════════════════════════════════════════════════════════════════════════
-- SECCIÓN 8 — Dimensionar el riesgo real (conteos, no modifica nada)
-- ══════════════════════════════════════════════════════════════════════════

SELECT 'jornadas' AS tabla, count(*) FROM jornadas
UNION ALL SELECT 'animales', count(*) FROM animales
UNION ALL SELECT 'lotes', count(*) FROM lotes
UNION ALL SELECT 'lotes_animales', count(*) FROM lotes_animales
UNION ALL SELECT 'visitas', count(*) FROM visitas
UNION ALL SELECT 'observaciones_campo', count(*) FROM observaciones_campo
UNION ALL SELECT 'novedades_establecimiento', count(*) FROM novedades_establecimiento
UNION ALL SELECT 'atenciones_clinicas', count(*) FROM atenciones_clinicas
UNION ALL SELECT 'personas', count(*) FROM personas
UNION ALL SELECT 'establecimientos', count(*) FROM establecimientos;

-- ══════════════════════════════════════════════════════════════════════════
-- FIN — no hay ninguna sección adicional que escriba datos.
-- ══════════════════════════════════════════════════════════════════════════
