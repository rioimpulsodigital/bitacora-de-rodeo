-- BIT-70 — 20 / R-02. Establecimiento inmutable en Atenciones, Novedades
-- y Lotes. Pacientes tienen traslado explicito separado.
-- Preparado localmente. No aplicar en Produccion sin preflight y autorizacion.
-- No modifica R-01/P-01/F-07 ni las policies de estas tablas.

BEGIN;

DO $preflight$
DECLARE
  v_table text;
BEGIN
  IF current_user<>'postgres' THEN
    RAISE EXCEPTION 'BIT-70-20 R02: ejecutar como postgres';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['atenciones_clinicas',
                                  'novedades_establecimiento','lotes'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relname=v_table AND c.relkind='r'
        AND c.relowner=current_user::regrole
        AND a.attname='establecimiento_id' AND NOT a.attisdropped
        AND a.atttypid='pg_catalog.uuid'::regtype
    ) THEN
      RAISE EXCEPTION 'BIT-70-20 R02: tabla/columna/owner inesperado: %',v_table;
    END IF;
  END LOOP;
  IF to_regprocedure('public.bit70_bloquear_traslado_registro()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger t WHERE
         (t.tgrelid='public.atenciones_clinicas'::regclass
          AND t.tgname='bit70_atenciones_bloquear_traslado')
         OR (t.tgrelid='public.novedades_establecimiento'::regclass
          AND t.tgname='bit70_novedades_bloquear_traslado')
         OR (t.tgrelid='public.lotes'::regclass
          AND t.tgname='bit70_lotes_bloquear_traslado')
     ) THEN
    RAISE EXCEPTION 'BIT-70-20 R02: objetos ya existentes; revisar deriva';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.bit70_bloquear_traslado_registro()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_OP<>'UPDATE' OR NOT (
    (TG_RELID='public.atenciones_clinicas'::regclass
     AND TG_NAME='bit70_atenciones_bloquear_traslado')
    OR (TG_RELID='public.novedades_establecimiento'::regclass
     AND TG_NAME='bit70_novedades_bloquear_traslado')
    OR (TG_RELID='public.lotes'::regclass
     AND TG_NAME='bit70_lotes_bloquear_traslado')
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R02: trigger fuera de contexto'
      USING ERRCODE='42501';
  END IF;
  IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
    RAISE EXCEPTION 'No se puede cambiar el establecimiento del registro'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.bit70_bloquear_traslado_registro()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bit70_atenciones_bloquear_traslado
  AFTER UPDATE ON public.atenciones_clinicas
  FOR EACH ROW EXECUTE FUNCTION public.bit70_bloquear_traslado_registro();
CREATE TRIGGER bit70_novedades_bloquear_traslado
  AFTER UPDATE ON public.novedades_establecimiento
  FOR EACH ROW EXECUTE FUNCTION public.bit70_bloquear_traslado_registro();
CREATE TRIGGER bit70_lotes_bloquear_traslado
  AFTER UPDATE ON public.lotes
  FOR EACH ROW EXECUTE FUNCTION public.bit70_bloquear_traslado_registro();
ALTER TABLE public.atenciones_clinicas
  ENABLE ALWAYS TRIGGER bit70_atenciones_bloquear_traslado;
ALTER TABLE public.novedades_establecimiento
  ENABLE ALWAYS TRIGGER bit70_novedades_bloquear_traslado;
ALTER TABLE public.lotes
  ENABLE ALWAYS TRIGGER bit70_lotes_bloquear_traslado;

DO $postflight$
BEGIN
  IF (
    SELECT count(*) FROM pg_trigger t
    WHERE t.tgfoid='public.bit70_bloquear_traslado_registro()'::regprocedure
      AND NOT t.tgisinternal AND t.tgenabled='A'
      AND t.tgtype=17 AND t.tgnargs=0 AND t.tgqual IS NULL
      AND (
        (t.tgrelid='public.atenciones_clinicas'::regclass
         AND t.tgname='bit70_atenciones_bloquear_traslado')
        OR (t.tgrelid='public.novedades_establecimiento'::regclass
         AND t.tgname='bit70_novedades_bloquear_traslado')
        OR (t.tgrelid='public.lotes'::regclass
         AND t.tgname='bit70_lotes_bloquear_traslado')
      )
  )<>3 OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.bit70_bloquear_traslado_registro()'::regprocedure
      AND p.proowner=current_user::regrole AND NOT p.prosecdef
      AND p.prorettype='pg_catalog.trigger'::regtype
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
      )
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R02: triggers/ACL inesperados';
  END IF;
END;
$postflight$;

COMMIT;
