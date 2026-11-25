-- BIT-70 — 20 / R-04. Reversion independiente de vinculos Tutor.
-- NO ejecutar por defecto: reabre cambios directos sin control de rol y
-- nuevas asignaciones Paciente-Tutor no vinculadas. Requiere autorizacion.
-- No toca Lotes, R-01/P-01/F-07 ni R-02/R-03.

BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public'
       AND p.tablename='personas_establecimientos')<>4 OR
    NOT EXISTS (
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
    )<>2 OR NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid='public.bit70_validar_tutor_paciente()'::regprocedure
        AND p.proowner=current_user::regrole AND p.prosecdef
        AND position('Tutor no vinculado al establecimiento del Paciente'
                     in p.prosrc)>0
    ) THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor rollback: deriva; detener';
  END IF;
END;
$preflight$;

ALTER POLICY personas_establecimientos_insert
  ON public.personas_establecimientos
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
DROP POLICY personas_establecimientos_update ON public.personas_establecimientos;
CREATE POLICY personas_establecimientos_update
  ON public.personas_establecimientos FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
ALTER POLICY personas_establecimientos_delete
  ON public.personas_establecimientos
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
DROP TRIGGER bit70_animales_validar_tutor ON public.animales;
DROP TRIGGER bit70_vinculos_tutor_proteger ON public.personas_establecimientos;
DROP FUNCTION public.bit70_validar_tutor_paciente();
DROP FUNCTION public.bit70_puede_vincular_tutor(uuid,uuid);

DO $postflight$
BEGIN
  IF to_regprocedure('public.bit70_validar_tutor_paciente()') IS NOT NULL
     OR to_regprocedure('public.bit70_puede_vincular_tutor(uuid,uuid)') IS NOT NULL
     OR (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='personas_establecimientos'
           AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
             OR coalesce(p.with_check,'') LIKE '%bit70_puede_vincular_tutor%'))<>0
  THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Tutor rollback: objetos residuales';
  END IF;
END;
$postflight$;

COMMIT;
