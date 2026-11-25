-- BIT-70 — 20 / R-04 y D1. Vinculos Tutor-establecimiento controlados.
-- Solo ADMINISTRADOR/PROFESIONAL administran directamente los vinculos.
-- OPERADOR_CAMPO conserva crear_persona_con_establecimiento(), que corre
-- como owner y crea Tutor + primer vinculo en una sola operacion.
-- Un Tutor existente puede compartirse con otro establecimiento accesible
-- si el usuario ya tiene acceso a por lo menos un vinculo suyo.
-- Nuevas asignaciones Paciente-Tutor exigen vinculo al establecimiento
-- actual; tres inconsistencias historicas D1 no se reescriben ni bloquean
-- ediciones no relacionadas. Incremental, solo local, NO aplicar aun.

BEGIN;

DO $preflight$
DECLARE
  v_ok boolean;
BEGIN
  IF current_user<>'postgres' OR
     to_regprocedure('public.crear_persona_con_establecimiento(text,text,text,uuid)')
       IS NULL THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: owner o RPC de alta inesperados';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.crear_persona_con_establecimiento(text,text,text,uuid)'::regprocedure
      AND p.prosecdef AND p.proowner=current_user::regrole
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: RPC de alta no es definer owner';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.personas_establecimientos'::regclass
      AND c.relowner=current_user::regrole AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.animales'::regclass
      AND c.relowner=current_user::regrole AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: tablas/RLS/owner inesperados';
  END IF;
  IF to_regprocedure('public.bit70_puede_vincular_tutor(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.bit70_validar_tutor_paciente()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger WHERE
         (tgrelid='public.animales'::regclass
          AND tgname='bit70_animales_validar_tutor')
         OR (tgrelid='public.personas_establecimientos'::regclass
          AND tgname='bit70_vinculos_tutor_proteger')
     ) THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: objetos ya existentes';
  END IF;
  SELECT count(*)=4 AND coalesce(bool_and(
    p.permissive='PERMISSIVE' AND p.roles=ARRAY['public'::name]
    AND (
      (p.policyname='personas_establecimientos_select' AND p.cmd='SELECT'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND p.with_check IS NULL)
      OR (p.policyname='personas_establecimientos_insert' AND p.cmd='INSERT'
       AND p.qual IS NULL
       AND replace(regexp_replace(coalesce(p.with_check,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)')
      OR (p.policyname='personas_establecimientos_update' AND p.cmd='UPDATE'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND p.with_check IS NULL)
      OR (p.policyname='personas_establecimientos_delete' AND p.cmd='DELETE'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND p.with_check IS NULL)
    )
  ),false) INTO v_ok FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename='personas_establecimientos';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: policies distintas del baseline';
  END IF;
END;
$preflight$;

-- La policy INSERT de la tabla de vinculos no puede consultar su propia
-- tabla bajo RLS sin recursion. Esta funcion acotada lee como owner y
-- devuelve solo un booleano, sin exponer filas ni aceptar roles ajenos.
CREATE FUNCTION public.bit70_puede_vincular_tutor(
  p_persona_id uuid, p_establecimiento_id uuid
) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL')
    AND public.tiene_acceso_establecimiento(p_establecimiento_id)
    AND EXISTS (
      SELECT 1 FROM public.personas_establecimientos pe
      WHERE pe.persona_id=p_persona_id
        AND public.tiene_acceso_establecimiento(pe.establecimiento_id)
    )
$function$;
REVOKE ALL ON FUNCTION public.bit70_puede_vincular_tutor(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bit70_puede_vincular_tutor(uuid,uuid)
  TO authenticated;

-- Dos lados de la misma integridad: una asignacion nueva de Tutor al
-- Paciente exige vinculo; quitar un vinculo usado por un Paciente del
-- mismo establecimiento se rechaza. Un D1 historico sin cambios pasa.
CREATE FUNCTION public.bit70_validar_tutor_paciente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: trigger fuera de contexto'
      USING ERRCODE='42501';
  END IF;
  IF TG_RELID='public.animales'::regclass
     AND TG_NAME='bit70_animales_validar_tutor'
     AND TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.tutor_responsable_id IS NOT NULL
       AND (TG_OP='INSERT' OR
            NEW.tutor_responsable_id IS DISTINCT FROM OLD.tutor_responsable_id OR
            NEW.establecimiento_actual_id IS DISTINCT FROM OLD.establecimiento_actual_id)
    THEN
      PERFORM 1 FROM public.personas_establecimientos pe
      WHERE pe.persona_id=NEW.tutor_responsable_id
        AND pe.establecimiento_id=NEW.establecimiento_actual_id
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tutor no vinculado al establecimiento del Paciente'
          USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_RELID='public.personas_establecimientos'::regclass
        AND TG_NAME='bit70_vinculos_tutor_proteger'
        AND TG_OP IN ('UPDATE','DELETE') THEN
    IF TG_OP='UPDATE' AND (
      NEW.persona_id IS DISTINCT FROM OLD.persona_id OR
      NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id
    ) THEN
      RAISE EXCEPTION 'No se puede trasladar un vinculo Tutor-establecimiento'
        USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' AND EXISTS (
      SELECT 1 FROM public.animales a
      WHERE a.tutor_responsable_id=OLD.persona_id
        AND a.establecimiento_actual_id=OLD.establecimiento_id
    ) THEN
      RAISE EXCEPTION 'Vinculo Tutor-establecimiento usado por Pacientes'
        USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: trigger fuera de contexto'
      USING ERRCODE='42501';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.bit70_validar_tutor_paciente()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bit70_animales_validar_tutor
  AFTER INSERT OR UPDATE ON public.animales
  FOR EACH ROW EXECUTE FUNCTION public.bit70_validar_tutor_paciente();
CREATE TRIGGER bit70_vinculos_tutor_proteger
  AFTER UPDATE OR DELETE ON public.personas_establecimientos
  FOR EACH ROW EXECUTE FUNCTION public.bit70_validar_tutor_paciente();
ALTER TABLE public.animales
  ENABLE ALWAYS TRIGGER bit70_animales_validar_tutor;
ALTER TABLE public.personas_establecimientos
  ENABLE ALWAYS TRIGGER bit70_vinculos_tutor_proteger;

ALTER POLICY personas_establecimientos_insert
  ON public.personas_establecimientos
  WITH CHECK (public.bit70_puede_vincular_tutor(persona_id,establecimiento_id));
ALTER POLICY personas_establecimientos_update
  ON public.personas_establecimientos
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
ALTER POLICY personas_establecimientos_delete
  ON public.personas_establecimientos
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname='public'
        AND p.tablename='personas_establecimientos')<>4
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
         AND p.tablename='personas_establecimientos'
         AND p.policyname='personas_establecimientos_insert'
         AND p.with_check LIKE '%bit70_puede_vincular_tutor%'
     ) OR (
       SELECT count(*) FROM pg_trigger t
       WHERE t.tgfoid='public.bit70_validar_tutor_paciente()'::regprocedure
         AND t.tgenabled='A' AND NOT t.tgisinternal AND t.tgnargs=0
         AND t.tgqual IS NULL
         AND ((t.tgrelid='public.animales'::regclass
               AND t.tgname='bit70_animales_validar_tutor' AND t.tgtype=21)
           OR (t.tgrelid='public.personas_establecimientos'::regclass
               AND t.tgname='bit70_vinculos_tutor_proteger' AND t.tgtype=25))
     )<>2 THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor: postflight inesperado';
  END IF;
END;
$postflight$;

COMMIT;
