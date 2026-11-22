-- BIT-70 - 05/08: reversion conjunta de R-01 y P-01.
-- PREPARADO LOCALMENTE. NO ejecutar por defecto.
-- Esta reversión restaura las cuatro expresiones previas y REABRE a
-- OPERADOR_CAMPO el acceso API a Visitas. Requiere decisión y autorización
-- explícitas de Bren/KLIAM tras evaluar el incidente y una alternativa segura.
-- Nunca usarla como prueba ni aplicarla junto con la migración principal.
--
-- Antes de ejecutarla, CLAUDY debe verificar que las cuatro policies aún
-- son las de BIT-70-05, sin policies adicionales. Si alguna cambió,
-- detenerse y diseñar una reversión específica. Ejecutar en una sesión.

BEGIN;

-- Construir la expresion integrada esperada en el mismo PostgreSQL que evalua
-- el rollback. La tabla y su policy temporales se eliminan antes de revertir.
CREATE TEMP TABLE bit70_expected_policy (establecimiento_id uuid) ON COMMIT DROP;
CREATE POLICY bit70_expected_integrated ON pg_temp.bit70_expected_policy
  USING (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

DO $preflight$
DECLARE
  v_expected boolean;
  v_integrated text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.visitas'::regclass AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'BIT-70-05 rollback: RLS no está habilitado';
  END IF;

  SELECT regexp_replace(pg_get_expr(e.polqual, e.polrelid), '[[:space:]]+', '', 'g')
  INTO STRICT v_integrated
  FROM pg_policy e
  WHERE e.polrelid = 'pg_temp.bit70_expected_policy'::regclass
    AND e.polname = 'bit70_expected_integrated';

  SELECT count(*) = 4
     AND coalesce(bool_and(
       p.permissive = 'PERMISSIVE'
       AND p.roles = ARRAY['public'::name]
       AND (
         (p.policyname = 'visitas_select' AND p.cmd = 'SELECT'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g') = v_integrated
           AND p.with_check IS NULL)
         OR (p.policyname = 'visitas_insert' AND p.cmd = 'INSERT'
           AND p.qual IS NULL
           AND regexp_replace(coalesce(p.with_check, ''), '[[:space:]]+', '', 'g') = v_integrated)
         OR (p.policyname = 'visitas_update' AND p.cmd = 'UPDATE'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g') = v_integrated
           AND regexp_replace(coalesce(p.with_check, ''), '[[:space:]]+', '', 'g') = v_integrated)
         OR (p.policyname = 'visitas_delete' AND p.cmd = 'DELETE'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g') = v_integrated
           AND p.with_check IS NULL)
       )
     ), false)
  INTO v_expected
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'visitas';

  IF NOT v_expected THEN
    RAISE EXCEPTION 'BIT-70-05 rollback: policies distintas del estado esperado; no revertir';
  END IF;
END;
$preflight$;

DROP TABLE pg_temp.bit70_expected_policy;

-- Reversion solo del estado integrado exacto. La funcion vieja de BIT-63
-- sigue intacta; se restablece su trigger antes de eliminar la nueva.
DO $trigger_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.observaciones_campo'::regclass
      AND t.tgname='observaciones_campo_validar_coherencia_visita'
      AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23
      AND t.tgnargs=0 AND t.tgqual IS NULL
      AND p.oid='public.bit70_observaciones_validar_visita_rls()'::regprocedure
      AND p.prosecdef
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.visitas'::regclass)
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner
      )
  ) OR to_regprocedure('public.observaciones_campo_validar_coherencia_visita()') IS NULL THEN
    RAISE EXCEPTION 'BIT-70-08 rollback: trigger/funciones distintos; no revertir';
  END IF;
  IF has_function_privilege('anon',
       'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE') THEN
    RAISE EXCEPTION 'BIT-70-08 rollback: ACL del trigger distinta; no revertir';
  END IF;
END;
$trigger_preflight$;

DROP TRIGGER observaciones_campo_validar_coherencia_visita ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_validar_coherencia_visita
  BEFORE INSERT OR UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_validar_coherencia_visita();

DROP FUNCTION public.bit70_observaciones_validar_visita_rls();

ALTER POLICY visitas_select ON public.visitas
  USING (public.tiene_acceso_establecimiento(establecimiento_id));

ALTER POLICY visitas_insert ON public.visitas
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));

ALTER POLICY visitas_update ON public.visitas
  USING (public.tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));

ALTER POLICY visitas_delete ON public.visitas
  USING (public.tiene_acceso_establecimiento(establecimiento_id));

DO $postflight$
DECLARE
  v_expected boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.observaciones_campo'::regclass
      AND t.tgname='observaciones_campo_validar_coherencia_visita'
      AND t.tgenabled='O' AND t.tgtype=23
      AND t.tgfoid='public.observaciones_campo_validar_coherencia_visita()'::regprocedure
  ) OR to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NOT NULL THEN
    RAISE EXCEPTION 'BIT-70-08 rollback: postflight inesperado';
  END IF;

  SELECT count(*) = 4
     AND coalesce(bool_and(
       p.permissive = 'PERMISSIVE'
       AND p.roles = ARRAY['public'::name]
       AND (
         (p.policyname = 'visitas_select' AND p.cmd = 'SELECT'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g')
             = 'tiene_acceso_establecimiento(establecimiento_id)'
           AND p.with_check IS NULL)
         OR (p.policyname = 'visitas_insert' AND p.cmd = 'INSERT'
           AND p.qual IS NULL
           AND regexp_replace(coalesce(p.with_check, ''), '[[:space:]]+', '', 'g')
             = 'tiene_acceso_establecimiento(establecimiento_id)')
         OR (p.policyname = 'visitas_update' AND p.cmd = 'UPDATE'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g')
             = 'tiene_acceso_establecimiento(establecimiento_id)'
           AND regexp_replace(coalesce(p.with_check, ''), '[[:space:]]+', '', 'g')
             = 'tiene_acceso_establecimiento(establecimiento_id)')
         OR (p.policyname = 'visitas_delete' AND p.cmd = 'DELETE'
           AND regexp_replace(coalesce(p.qual, ''), '[[:space:]]+', '', 'g')
             = 'tiene_acceso_establecimiento(establecimiento_id)'
           AND p.with_check IS NULL)
       )
     ), false)
  INTO v_expected
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'visitas';

  IF NOT v_expected THEN
    RAISE EXCEPTION 'BIT-70-08 rollback: policies no restauradas';
  END IF;
END;
$postflight$;

COMMIT;

-- Confirmación posterior (solo lectura):
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'visitas'
-- ORDER BY cmd;
-- No dejar el sistema en este estado sin una mitigación alternativa:
-- OPERADOR_CAMPO recupera acceso por API a Visitas.
