-- BIT-49 — Jornadas: soft-delete + Papelera (estructura + funciones)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM
-- y el diagnóstico previo (diagnostico-BIT-49-jornadas.sql).
--
-- ─── OBJETIVO ────────────────────────────────────────────────────────────
-- Reemplazar la mitigación temporal de BIT-45 (se retiró el DELETE físico de
-- la app) por el patrón definitivo aprobado en BIT-35 y validado en BIT-48:
-- soft-delete → Papelera → restauración → hard-delete controlado.
--
-- ─── ALCANCE (qué toca y qué NO) ─────────────────────────────────────────
-- Toca SOLO `jornadas`:
--   1. agrega columnas deleted_at y deleted_by (nullable);
--   2. reemplaza la policy SELECT para que la vista normal excluya eliminadas;
--   3. crea 4 funciones específicas (SECURITY DEFINER) y sus grants.
-- NO toca: policies INSERT/UPDATE/DELETE de jornadas (DELETE se cierra en
-- migration-BIT-49b; grants por columna en migration-BIT-49c), visitas,
-- observaciones, ninguna otra tabla, ninguna función existente, ningún dato.
--
-- ─── DIFERENCIAS CLAVE CON BIT-48 (Novedades) — no es un copiar/pegar ────
-- * Jornadas NO tiene establecimiento_id: es una entidad personal
--   (profesional_id). Por eso NO se usa tiene_acceso_establecimiento() en
--   ninguna función. La autorización es: rol real (is_admin()) y propiedad
--   (profesional_id = auth.uid()). Coincide con las policies reales de
--   jornadas (BIT-46: USING (auth.uid() = profesional_id) OR is_admin()).
-- * Se usa is_admin() (rol ADMINISTRADOR + perfil activo), igual que las
--   policies reales de jornadas. (Novedades usaba get_mi_rol(); ver BIT-48 §3:
--   la diferencia importa, por eso se toma de la policy real de cada tabla.)
-- * Enviar a Papelera lo puede el DUEÑO (cualquier rol) o un ADMINISTRADOR:
--   equivale a lo que la policy jornadas_delete real ya permitía (owner OR
--   is_admin) y a BIT-35 §7.1. Restaurar y eliminar definitivamente: solo
--   ADMINISTRADOR. Ver la Papelera: solo ADMINISTRADOR.
-- * La Papelera de Jornadas no se filtra por establecimiento (no existe ese
--   concepto en la tabla): listar_jornadas_papelera() no recibe parámetros.
-- * Hard-delete: visitas.jornada_id → jornadas(id) es ON DELETE NO ACTION
--   (BIT-46). La función VERIFICA EXPLÍCITAMENTE si hay visitas relacionadas y,
--   si las hay, BLOQUEA con error claro. No borra visitas, no pone jornada_id
--   en NULL, no cambia la FK, no usa CASCADE. La FK queda como red de
--   seguridad, no como único control.
-- * No se asumen columnas que no se confirmaron: las funciones NO usan
--   updated_at / updated_by (no está confirmado que existan en jornadas).
--
-- ─── DECISIÓN DE SELECT / RLS (registros eliminados) ─────────────────────
-- Opción elegida: combinación segura = policy SELECT que EXCLUYE eliminadas
-- para TODOS (incluido ADMINISTRADOR) + función admin-only para leer la
-- Papelera. Justificación: (a) garantiza por backend que ninguna consulta
-- normal devuelva eliminadas, aunque el cliente olvide filtrar; (b) el
-- ADMINISTRADOR accede a la Papelera solo por una vía explícita y auditable,
-- no por una policy más amplia que pueda filtrar filas por accidente;
-- (c) no hay riesgo de "efecto !inner" (BIT-46 H1): ningún código embebe
-- jornadas en otra consulta (visitas solo selecciona la columna jornada_id).
-- Efecto lateral esperado y deseado: como las filas eliminadas dejan de ser
-- visibles, el UPDATE vía API sobre ellas tampoco las alcanza (validar en
-- Paso 3, caso 8; el blindaje definitivo de deleted_* es migration-BIT-49c).
--
-- ─── PRERREQUISITOS (correr diagnostico-BIT-49-jornadas.sql y confirmar) ─
--   (a) columnas: profesional_id, fecha, hora_llegada, hora_salida, notas;
--       deleted_at / deleted_by NO existen todavía;
--   (b) jornadas_select real = PERMISSIVE, roles {public}, USING
--       ((auth.uid() = profesional_id) OR is_admin()) — si el texto o los
--       roles difieren, ADAPTAR el PASO 2b antes de aplicar (y su rollback);
--   (c) triggers: ninguno debe impedir UPDATE de deleted_at/deleted_by ni
--       exigir columnas que no existan;
--   (d) FK entrantes: solo visitas.jornada_id (si hay otra, DETENERSE);
--   (e) las 4 funciones nuevas NO existen todavía.
-- Si algo contradice lo asumido: DETENERSE y reportar.
--
-- ─── APLICACIÓN ──────────────────────────────────────────────────────────
-- Aplicar TODO junto dentro de BEGIN; ... COMMIT; (todo o nada). Owner de las
-- funciones: el rol que ejecuta el SQL Editor (postgres) — confirmar en la
-- verificación post-aplicación.

-- ── PASO 2a — COLUMNAS (idempotente, nullable: no rompe filas existentes) ───
ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- ── PASO 2b — POLICY SELECT: la vista normal excluye eliminadas ────────────
DROP POLICY IF EXISTS jornadas_select ON public.jornadas;
CREATE POLICY jornadas_select ON public.jornadas
  AS PERMISSIVE FOR SELECT TO public
  USING (deleted_at IS NULL AND ((auth.uid() = profesional_id) OR is_admin()));

-- ── PASO 2c — FUNCIONES ─────────────────────────────────────────────────────
-- 1. soft_delete_jornada: enviar a la Papelera (dueño o ADMINISTRADOR)
CREATE OR REPLACE FUNCTION public.soft_delete_jornada(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_deleted_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = '42501';
  END IF;

  SELECT j.profesional_id, j.deleted_at
    INTO v_owner, v_deleted_at
    FROM jornadas j
   WHERE j.id = p_jornada_id
   FOR UPDATE;

  IF NOT FOUND OR NOT (is_admin() OR v_owner = auth.uid()) THEN
    RAISE EXCEPTION 'Jornada no encontrada o sin permiso para enviarla a la Papelera.' USING ERRCODE = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La jornada ya está en la Papelera.' USING ERRCODE = '22023';
  END IF;

  UPDATE jornadas
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_jornada_id
     AND deleted_at IS NULL;
END;
$function$;

-- 2. restore_jornada: restaurar (solo ADMINISTRADOR)
CREATE OR REPLACE FUNCTION public.restore_jornada(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede restaurar jornadas.' USING ERRCODE = '42501';
  END IF;

  UPDATE jornadas
     SET deleted_at = NULL,
         deleted_by = NULL
   WHERE id = p_jornada_id
     AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Jornada no encontrada o no está en la Papelera.' USING ERRCODE = '22023';
  END IF;
END;
$function$;

-- 3. hard_delete_jornada: eliminar definitivamente (solo ADMINISTRADOR, solo
--    desde la Papelera, BLOQUEADO si existen visitas relacionadas)
CREATE OR REPLACE FUNCTION public.hard_delete_jornada(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_visitas integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede eliminar definitivamente jornadas.' USING ERRCODE = '42501';
  END IF;

  SELECT j.deleted_at
    INTO v_deleted_at
    FROM jornadas j
   WHERE j.id = p_jornada_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jornada no encontrada.' USING ERRCODE = '22023';
  END IF;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede eliminar definitivamente una jornada que ya está en la Papelera.' USING ERRCODE = '22023';
  END IF;

  -- Verificación explícita ANTES del DELETE (no se confía solo en la FK).
  SELECT count(*) INTO v_visitas
    FROM visitas v
   WHERE v.jornada_id = p_jornada_id;

  IF v_visitas > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar definitivamente: la jornada tiene % visita(s) relacionada(s). Las visitas no se modifican ni se eliminan.', v_visitas
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM jornadas
   WHERE id = p_jornada_id
     AND deleted_at IS NOT NULL;
END;
$function$;

-- 4. listar_jornadas_papelera: lectura de la Papelera (solo ADMINISTRADOR)
CREATE OR REPLACE FUNCTION public.listar_jornadas_papelera()
RETURNS TABLE (
  id uuid,
  fecha date,
  hora_llegada time,
  hora_salida time,
  notas text,
  profesional_nombre text,
  deleted_at timestamptz,
  deleted_by_nombre text,
  visitas_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede ver la Papelera.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT j.id,
         j.fecha::date,
         j.hora_llegada::time,
         j.hora_salida::time,
         j.notas::text,
         p.nombre::text,
         j.deleted_at::timestamptz,
         d.nombre::text,
         (SELECT count(*)::integer FROM visitas v WHERE v.jornada_id = j.id)
    FROM jornadas j
    LEFT JOIN perfiles p ON p.id = j.profesional_id
    LEFT JOIN perfiles d ON d.id = j.deleted_by
   WHERE j.deleted_at IS NOT NULL
   ORDER BY j.deleted_at DESC;
END;
$function$;

-- ── PASO 2d — GRANTS (deny by default) ─────────────────────────────────────
-- La autorización real ocurre dentro de cada función; EXECUTE solo para
-- usuarios autenticados. Sin acceso para PUBLIC ni anon.
REVOKE ALL ON FUNCTION public.soft_delete_jornada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_jornada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hard_delete_jornada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_jornadas_papelera() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_jornada(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_jornada(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_jornada(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_jornadas_papelera() FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_jornada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_jornada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_jornada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_jornadas_papelera() TO authenticated;

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ───────
-- Sesiones reales por rol (set_config('request.jwt.claim.sub', <uuid perfil>, true)
-- + SET LOCAL ROLE authenticated), todo dentro de BEGIN … ROLLBACK. Jornadas
-- tiene 0 filas reales (BIT-46): TODO dato de prueba se crea DENTRO de la
-- transacción (una jornada por perfil de prueba + una visita de prueba con
-- jornada_id) y se descarta con el ROLLBACK — nada persiste, nada que limpiar.
-- Casos (cada uno DEBE dar el resultado indicado):
--   1. PROFESIONAL dueño: soft_delete_jornada(propia) → OK; ya no aparece en
--      SELECT normal; el mismo PROFESIONAL NO puede restaurarla ni verla en
--      Papelera (restore_jornada / listar_jornadas_papelera → FALLAN).
--   2. OPERADOR_CAMPO dueño: idem caso 1 (envía la propia a Papelera).
--   3. PROFESIONAL / OPERADOR_CAMPO sobre jornada AJENA: soft_delete_jornada →
--      FALLA ("no encontrada o sin permiso").
--   4. ADMINISTRADOR: soft_delete_jornada sobre jornada AJENA → OK;
--      listar_jornadas_papelera() la devuelve con deleted_by_nombre = el admin.
--   5. ADMINISTRADOR: restore_jornada → OK; vuelve a verse en SELECT normal
--      con deleted_at/deleted_by = NULL.
--   6. ADMINISTRADOR: hard_delete_jornada sobre jornada ACTIVA → FALLA
--      ("ya está en la Papelera").
--   7. ADMINISTRADOR: soft_delete + hard_delete_jornada SIN visitas → OK; la
--      fila ya no existe.
--   8. ADMINISTRADOR (o dueño): UPDATE directo de una jornada en Papelera vía
--      tabla → 0 filas afectadas (no es visible por la policy SELECT).
--   9. ADMINISTRADOR: soft_delete + hard_delete_jornada CON una visita de
--      prueba apuntando a la jornada → FALLA con el mensaje de "N visita(s)
--      relacionada(s)"; la visita y la jornada siguen intactas.
--  10. Doble soft_delete de la misma jornada → FALLA ("ya está en la Papelera").
--  11. anon: EXECUTE de las 4 funciones → FALLA (permission denied).
--  12. Regresión CRUD: INSERT y UPDATE (fecha/horas/notas) de jornada propia
--      siguen funcionando; SELECT de un PROFESIONAL solo devuelve las suyas.
-- ROLLBACK;

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jornadas' AND column_name IN ('deleted_at','deleted_by');
--   SELECT policyname, cmd, permissive, roles, qual FROM pg_policies
--   WHERE schemaname='public' AND tablename='jornadas' ORDER BY cmd;
--   -- jornadas_select debe incluir "deleted_at IS NULL"; INSERT/UPDATE/DELETE sin cambios.
--   SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname IN
--     ('soft_delete_jornada','restore_jornada','hard_delete_jornada','listar_jornadas_papelera');
--   -- prosecdef true en las 4, owner documentado, proconfig con search_path=public.
--   SELECT routine_name, grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_schema='public' AND routine_name IN
--     ('soft_delete_jornada','restore_jornada','hard_delete_jornada','listar_jornadas_papelera')
--   ORDER BY routine_name, grantee;
--   -- authenticated (y el owner) con EXECUTE; NO PUBLIC ni anon.
--   -- NO ejecutar ningún DELETE ni soft-delete real de verificación.

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Revierte funciones y la policy SELECT; NO elimina las columnas (dropearlas
-- borraría la traza de cualquier jornada ya enviada a Papelera; son nullable e
-- inofensivas, y un DROP COLUMN solo se haría con autorización expresa y con
-- la Papelera vacía).
--   DROP FUNCTION IF EXISTS public.listar_jornadas_papelera();
--   DROP FUNCTION IF EXISTS public.hard_delete_jornada(uuid);
--   DROP FUNCTION IF EXISTS public.restore_jornada(uuid);
--   DROP FUNCTION IF EXISTS public.soft_delete_jornada(uuid);
--   DROP POLICY IF EXISTS jornadas_select ON public.jornadas;
--   CREATE POLICY jornadas_select ON public.jornadas
--     AS PERMISSIVE FOR SELECT TO public
--     USING (((auth.uid() = profesional_id) OR is_admin()));
--   -- ↑ expresión original capturada en BIT-46 (resumen: "misma condición que
--   --   jornadas_delete"); RECONFIRMAR textual con diagnóstico §5 antes de aplicar
--   --   esta migración y usar ESE texto aquí. Si ya hay jornadas en la Papelera
--   --   al revertir, quedarían visibles de nuevo en el listado normal.
