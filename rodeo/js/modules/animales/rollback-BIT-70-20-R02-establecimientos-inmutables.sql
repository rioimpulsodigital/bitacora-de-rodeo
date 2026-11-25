-- BIT-70 — 20 / R-02. Reversion independiente de Atenciones, Novedades,
-- Lotes. NO ejecutar por defecto. Reabre traslados entre establecimientos
-- accesibles; requiere evaluacion y autorizacion especifica.

BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR (
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
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND position('NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id'
                   in p.prosrc)>0
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
      )
  ) OR (
    SELECT count(*) FROM pg_trigger t
    WHERE t.tgfoid='public.bit70_bloquear_traslado_registro()'::regprocedure
  )<>3 THEN
    RAISE EXCEPTION 'BIT-70-20 R02 rollback: objetos distintos; detener';
  END IF;
END;
$preflight$;

DROP TRIGGER bit70_atenciones_bloquear_traslado ON public.atenciones_clinicas;
DROP TRIGGER bit70_novedades_bloquear_traslado ON public.novedades_establecimiento;
DROP TRIGGER bit70_lotes_bloquear_traslado ON public.lotes;
DROP FUNCTION public.bit70_bloquear_traslado_registro();

DO $postflight$
BEGIN
  IF to_regprocedure('public.bit70_bloquear_traslado_registro()') IS NOT NULL THEN
    RAISE EXCEPTION 'BIT-70-20 R02 rollback: funcion residual';
  END IF;
END;
$postflight$;

COMMIT;
