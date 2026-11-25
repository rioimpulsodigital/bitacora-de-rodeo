-- BIT-70 — 20 / R-03. Coherencia de membresias activas de Paciente y Lote.
-- Incremental sobre el catalogo vigente. Preparado localmente; NO aplicar
-- en Produccion sin preflight actualizado, revision y autorizacion.
-- No cambia policies, grants de tablas, datos ni objetos de R-01/P-01/F-07.
-- Un historial cerrado (fecha_fin NOT NULL) puede pertenecer a un
-- establecimiento anterior; solo la membresia activa exige coincidencia.

BEGIN;

-- Cierra la ventana entre el conteo de incoherencias y la activacion de
-- los triggers. Estas tres tablas quedan sin escrituras concurrentes.
LOCK TABLE public.animales, public.lotes, public.lotes_animales
  IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_table text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'BIT-70-20 R03: ejecutar como postgres';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['animales','lotes','lotes_animales'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relkind='r'
        AND c.relowner=current_user::regrole
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'BIT-70-20 R03: tabla/RLS/owner inesperado: %', v_table;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.animales'::regclass
      AND attname='establecimiento_actual_id' AND NOT attisdropped
      AND atttypid='pg_catalog.uuid'::regtype
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.lotes'::regclass
      AND attname='establecimiento_id' AND NOT attisdropped
      AND atttypid='pg_catalog.uuid'::regtype
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.lotes_animales'::regclass
      AND attname='fecha_fin' AND NOT attisdropped
      AND atttypid='pg_catalog.timestamptz'::regtype
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R03: columnas esperadas ausentes';
  END IF;
  IF to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger WHERE
         (tgrelid='public.lotes_animales'::regclass
          AND tgname='bit70_lotes_animales_validar_establecimiento')
         OR (tgrelid='public.animales'::regclass
          AND tgname='bit70_animales_validar_lote_activo')
         OR (tgrelid='public.lotes'::regclass
          AND tgname='bit70_lotes_validar_animales_activos')
     ) THEN
    RAISE EXCEPTION 'BIT-70-20 R03: objetos ya existentes; revisar deriva';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lotes_animales la
    JOIN public.animales a ON a.id=la.animal_id
    JOIN public.lotes l ON l.id=la.lote_id
    WHERE la.fecha_fin IS NULL
      AND a.establecimiento_actual_id IS DISTINCT FROM l.establecimiento_id
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R03: membresias activas incoherentes; detener';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.bit70_validar_lote_animal_activo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_animal_est uuid;
  v_lote_est uuid;
BEGIN
  IF TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'BIT-70-20 R03: trigger fuera de contexto'
      USING ERRCODE='42501';
  END IF;
  IF TG_RELID='public.lotes_animales'::regclass
     AND TG_NAME='bit70_lotes_animales_validar_establecimiento'
     AND TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.fecha_fin IS NULL THEN
      -- FOR SHARE bloquea actualizaciones concurrentes de ambos padres
      -- hasta que esta escritura y su verificacion se confirmen.
      SELECT a.establecimiento_actual_id, l.establecimiento_id
      INTO v_animal_est, v_lote_est
      FROM public.animales a JOIN public.lotes l ON l.id=NEW.lote_id
      WHERE a.id=NEW.animal_id
      FOR SHARE OF a,l;
      IF NOT FOUND OR v_animal_est IS DISTINCT FROM v_lote_est THEN
        RAISE EXCEPTION 'Paciente y Lote no pertenecen al mismo establecimiento'
          USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_RELID='public.animales'::regclass
        AND TG_NAME='bit70_animales_validar_lote_activo'
        AND TG_OP='UPDATE' THEN
    IF NEW.establecimiento_actual_id IS DISTINCT FROM OLD.establecimiento_actual_id
       AND EXISTS (
         SELECT 1 FROM public.lotes_animales la
         JOIN public.lotes l ON l.id=la.lote_id
         WHERE la.animal_id=NEW.id AND la.fecha_fin IS NULL
           AND l.establecimiento_id IS DISTINCT FROM NEW.establecimiento_actual_id
       ) THEN
      RAISE EXCEPTION 'Cerrar el Lote activo antes de trasladar el Paciente'
        USING ERRCODE='23514';
    END IF;
  ELSIF TG_RELID='public.lotes'::regclass
        AND TG_NAME='bit70_lotes_validar_animales_activos'
        AND TG_OP='UPDATE' THEN
    IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id
       AND EXISTS (
         SELECT 1 FROM public.lotes_animales la
         JOIN public.animales a ON a.id=la.animal_id
         WHERE la.lote_id=NEW.id AND la.fecha_fin IS NULL
           AND a.establecimiento_actual_id IS DISTINCT FROM NEW.establecimiento_id
       ) THEN
      RAISE EXCEPTION 'Lote incompatible con Pacientes activos'
        USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'BIT-70-20 R03: trigger fuera de contexto'
      USING ERRCODE='42501';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.bit70_validar_lote_animal_activo()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bit70_lotes_animales_validar_establecimiento
  AFTER INSERT OR UPDATE ON public.lotes_animales
  FOR EACH ROW EXECUTE FUNCTION public.bit70_validar_lote_animal_activo();
CREATE TRIGGER bit70_animales_validar_lote_activo
  AFTER UPDATE ON public.animales
  FOR EACH ROW EXECUTE FUNCTION public.bit70_validar_lote_animal_activo();
CREATE TRIGGER bit70_lotes_validar_animales_activos
  AFTER UPDATE ON public.lotes
  FOR EACH ROW EXECUTE FUNCTION public.bit70_validar_lote_animal_activo();

ALTER TABLE public.lotes_animales
  ENABLE ALWAYS TRIGGER bit70_lotes_animales_validar_establecimiento;
ALTER TABLE public.animales
  ENABLE ALWAYS TRIGGER bit70_animales_validar_lote_activo;
ALTER TABLE public.lotes
  ENABLE ALWAYS TRIGGER bit70_lotes_validar_animales_activos;

DO $postflight$
BEGIN
  IF (
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
  ) <> 3 OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.bit70_validar_lote_animal_activo()'::regprocedure
      AND p.proowner=current_user::regrole AND p.prosecdef
      AND p.prorettype='pg_catalog.trigger'::regtype
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
      AND p.proacl IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
      )
  ) OR has_function_privilege('anon',
      'public.bit70_validar_lote_animal_activo()', 'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.bit70_validar_lote_animal_activo()', 'EXECUTE')
     OR has_function_privilege('service_role',
      'public.bit70_validar_lote_animal_activo()', 'EXECUTE') THEN
    RAISE EXCEPTION 'BIT-70-20 R03: trigger o ACL inesperados; no confirmar';
  END IF;
END;
$postflight$;

COMMIT;
