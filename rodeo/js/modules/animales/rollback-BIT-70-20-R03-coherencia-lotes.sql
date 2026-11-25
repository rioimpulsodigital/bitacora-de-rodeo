-- BIT-70 — 20 / R-03. Reversion independiente. NO ejecutar por defecto.
-- Retira solo las tres guardas y su funcion; reabre la posibilidad de
-- membresias activas cruzadas. Requiere autorizacion especifica.

BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR (
    SELECT count(*) FROM pg_trigger t
    WHERE t.tgfoid='public.bit70_validar_lote_animal_activo()'::regprocedure
      AND NOT t.tgisinternal AND t.tgenabled='A'
      AND t.tgnargs=0 AND t.tgqual IS NULL
      AND (
        (t.tgrelid='public.lotes_animales'::regclass
         AND t.tgname='bit70_lotes_animales_validar_establecimiento'
         AND t.tgtype=21)
        OR (t.tgrelid='public.animales'::regclass
         AND t.tgname='bit70_animales_validar_lote_activo'
         AND t.tgtype=17)
        OR (t.tgrelid='public.lotes'::regclass
         AND t.tgname='bit70_lotes_validar_animales_activos'
         AND t.tgtype=17)
      )
  )<>3 OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.bit70_validar_lote_animal_activo()'::regprocedure
      AND p.proowner=current_user::regrole AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND position('Paciente y Lote no pertenecen al mismo establecimiento'
                   in p.prosrc)>0
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
      )
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R03 rollback: objetos distintos; detener';
  END IF;
  IF (
    SELECT count(*) FROM pg_trigger t
    WHERE t.tgfoid='public.bit70_validar_lote_animal_activo()'::regprocedure
  )<>3 THEN
    RAISE EXCEPTION 'BIT-70-20 R03 rollback: dependencias adicionales';
  END IF;
END;
$preflight$;

DROP TRIGGER bit70_lotes_animales_validar_establecimiento ON public.lotes_animales;
DROP TRIGGER bit70_animales_validar_lote_activo ON public.animales;
DROP TRIGGER bit70_lotes_validar_animales_activos ON public.lotes;
DROP FUNCTION public.bit70_validar_lote_animal_activo();

DO $postflight$
BEGIN
  IF to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NOT NULL THEN
    RAISE EXCEPTION 'BIT-70-20 R03 rollback: funcion residual';
  END IF;
END;
$postflight$;

COMMIT;
