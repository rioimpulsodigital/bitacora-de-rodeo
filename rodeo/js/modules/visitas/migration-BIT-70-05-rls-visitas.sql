-- BIT-70 - 05/08: R-01 RLS de Visitas + P-01 trigger de Observaciones.
-- Revision integrada de BIT-70-08: aplicar solo este archivo completo,
-- nunca la version previa de BIT-70-05 sin el trigger P-01.
-- PREPARADO LOCALMENTE. No ejecutar en Producción sin revisión y autorización.
-- Baseline: BIT-70 — 04 (CLAUDY, 11 Nov 2026) confirmó exactamente cuatro
-- policies PERMISSIVE de public.visitas, una por operación, todas basadas
-- solo en tiene_acceso_establecimiento(establecimiento_id).
--
-- No cambia grants de tablas, datos ni otras policies. BIT-70-08 agrega una
-- funcion trigger limitada y cambia solo el binding del trigger existente.
-- ADMINISTRADOR y PROFESIONAL conservan acceso a establecimientos legítimos.
-- OPERADOR_CAMPO queda excluido de SELECT, INSERT, UPDATE y DELETE.
-- La frontera entre dos establecimientos accesibles sigue fuera de R-01.
--
-- Revisión antes de aplicar: ejecutar por CLAUDY con privilegio de propietario
-- y comparar pg_policies / pg_class con el baseline. Si difiere, detenerse.
-- Ejecutar este archivo completo en una sola sesión: BEGIN..COMMIT es atómico.
-- Un error de preflight o postflight debe provocar ROLLBACK, sin reintentar
-- parcialmente. Las pruebas con sesiones reales se hacen por separado.

BEGIN;

DO $preflight$
DECLARE
  v_expected boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.oid = 'public.visitas'::regclass
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'BIT-70-05: RLS no está habilitado en public.visitas';
  END IF;

  IF to_regprocedure('public.get_mi_rol()') IS NULL
     OR to_regprocedure('public.tiene_acceso_establecimiento(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BIT-70-05: faltan funciones de autorización esperadas';
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
    RAISE EXCEPTION
      'BIT-70-05: policies de visitas distintas del baseline; no modificar. Revisar pg_policies';
  END IF;
END;
$preflight$;

-- P-01: exigir el trigger de BIT-63 y un propietario capaz de leer Visitas
-- pese a RLS. Un desvio detiene toda la transaccion antes de modificar nada.
DO $trigger_preflight$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.visitas'::regclass
      AND pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'BIT-70-08: ejecutar como owner postgres tras autorizacion';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.visitas'::regclass AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'BIT-70-08: FORCE RLS en Visitas; owner no puede validar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.observaciones_campo'::regclass AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'BIT-70-08: RLS de Observaciones no esta activo';
  END IF;
  IF to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NOT NULL THEN
    RAISE EXCEPTION 'BIT-70-08: la funcion nueva ya existe; revisar antes de aplicar';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.observaciones_campo'::regclass
      AND t.tgname = 'observaciones_campo_validar_coherencia_visita'
      AND NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgtype = 23 AND t.tgnargs = 0 AND t.tgqual IS NULL
      AND p.oid = 'public.observaciones_campo_validar_coherencia_visita()'::regprocedure
      AND NOT p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
      AND position('FROM public.visitas WHERE id = NEW.visita_id' in p.prosrc) > 0
      AND position('IS DISTINCT FROM NEW.establecimiento_id' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'BIT-70-08: trigger/funcion de BIT-63 distintos del baseline';
  END IF;
END;
$trigger_preflight$;

-- Funcion nueva para no cambiar el cuerpo ni ACL de la funcion BIT-63.
-- Solo puede dispararse sobre Observaciones en INSERT/UPDATE row-level.
-- El owner postgres (con Visitas sin FORCE RLS) ve la Visita para cotejar
-- establecimiento; el usuario sigue sujeto a RLS sobre Observaciones.
-- auth.uid() dentro de las funciones de acceso conserva la identidad JWT.
CREATE FUNCTION public.bit70_observaciones_validar_visita_rls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_establecimiento_visita uuid;
  v_rol text;
  v_cambio_relacion boolean;
BEGIN
  IF TG_RELID <> 'public.observaciones_campo'::regclass
     OR TG_NAME <> 'observaciones_campo_validar_coherencia_visita'
     OR TG_WHEN <> 'BEFORE'
     OR TG_LEVEL <> 'ROW'
     OR TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RAISE EXCEPTION 'Trigger fuera de contexto' USING ERRCODE = '42501';
  END IF;

  IF NEW.establecimiento_id IS NULL
     OR public.tiene_acceso_establecimiento(NEW.establecimiento_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Establecimiento no autorizado' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
      RAISE EXCEPTION 'No se puede cambiar el establecimiento de la Observacion'
        USING ERRCODE = '42501';
    END IF;
    v_cambio_relacion := NEW.visita_id IS DISTINCT FROM OLD.visita_id;
  ELSE
    v_cambio_relacion := NEW.visita_id IS NOT NULL;
  END IF;

  IF v_cambio_relacion THEN
    v_rol := public.get_mi_rol();
    IF v_rol IS DISTINCT FROM 'ADMINISTRADOR'
       AND v_rol IS DISTINCT FROM 'PROFESIONAL' THEN
      RAISE EXCEPTION 'No se permite cambiar la Visita relacionada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.visita_id IS NOT NULL THEN
    SELECT v.establecimiento_id INTO v_establecimiento_visita
    FROM public.visitas AS v WHERE v.id = NEW.visita_id;

    IF v_establecimiento_visita IS DISTINCT FROM NEW.establecimiento_id THEN
      -- Mensaje generico: no revela si el ID existe en otro establecimiento.
      RAISE EXCEPTION 'Visita no compatible con la Observacion'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por defecto en PostgreSQL.
-- Revocar en esta transaccion antes de enlazar el trigger. CREATE TRIGGER
-- comprueba EXECUTE para el creador (postgres, owner de la funcion); el disparo
-- posterior no requiere EXECUTE de anon, authenticated ni service_role.
REVOKE ALL ON FUNCTION public.bit70_observaciones_validar_visita_rls()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER observaciones_campo_validar_coherencia_visita ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_validar_coherencia_visita
  BEFORE INSERT OR UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.bit70_observaciones_validar_visita_rls();

ALTER POLICY visitas_select ON public.visitas
  USING (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

ALTER POLICY visitas_insert ON public.visitas
  WITH CHECK (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

ALTER POLICY visitas_update ON public.visitas
  USING (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  )
  WITH CHECK (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

ALTER POLICY visitas_delete ON public.visitas
  USING (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

-- PostgreSQL decompila IN como una expresion interna dependiente del tipo.
-- La policy temporal genera en este mismo servidor la expresion canonica
-- esperada; desaparece al terminar la transaccion.
CREATE TEMP TABLE bit70_expected_policy (establecimiento_id uuid) ON COMMIT DROP;
CREATE POLICY bit70_expected_integrated ON pg_temp.bit70_expected_policy
  USING (
    public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  );

DO $postflight$
DECLARE
  v_expected boolean;
  v_integrated text;
BEGIN
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
    RAISE EXCEPTION 'BIT-70-05: postflight inesperado; no confirmar transacción';
  END IF;
END;
$postflight$;

DROP TABLE pg_temp.bit70_expected_policy;

DO $trigger_postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.observaciones_campo'::regclass
      AND t.tgname = 'observaciones_campo_validar_coherencia_visita'
      AND t.tgenabled = 'O' AND t.tgtype = 23
      AND p.oid = 'public.bit70_observaciones_validar_visita_rls()'::regprocedure
      AND p.prosecdef
      AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.visitas'::regclass)
  ) THEN
    RAISE EXCEPTION 'BIT-70-08: trigger nuevo no enlazado como se esperaba';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.bit70_observaciones_validar_visita_rls()'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner
      )
  ) OR has_function_privilege('anon',
      'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE')
     OR has_function_privilege('service_role',
      'public.bit70_observaciones_validar_visita_rls()', 'EXECUTE') THEN
    RAISE EXCEPTION 'BIT-70-08: search_path/ACL del trigger inesperados';
  END IF;
END;
$trigger_postflight$;

COMMIT;

-- Verificación posterior de solo lectura para CLAUDY:
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'visitas'
-- ORDER BY cmd;
-- Verificar con sesiones reales de ADMINISTRADOR, PROFESIONAL y OPERADOR_CAMPO,
-- y con establecimiento autorizado/no autorizado. No usar service_role:
-- BYPASSRLS haría inválida la prueba. No dejar datos de prueba persistidos.
