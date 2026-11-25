-- Reversion independiente del traslado controlado BIT-70-20/R-02.
-- No revierte datos trasladados, R03, R04 ni F-07.
BEGIN;
DO $preflight$
BEGIN
  IF current_user<>'postgres'
    OR to_regprocedure('public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.bit70_bloquear_traslado_paciente()') IS NULL
    OR to_regprocedure('public.bit70_validar_historial_paciente()') IS NULL
    OR to_regclass('public.bit70_animales_foto_path_unica') IS NULL
    OR (SELECT count(*) FROM pg_trigger t
      WHERE t.tgrelid='public.animales'::regclass
        AND t.tgname='bit70_animales_traslado_solo_rpc'
        AND t.tgfoid='public.bit70_bloquear_traslado_paciente()'::regprocedure
        AND t.tgenabled='A' AND t.tgtype=19)<>1
    OR (SELECT count(*) FROM pg_trigger t
      WHERE t.tgfoid='public.bit70_validar_historial_paciente()'::regprocedure
        AND t.tgenabled='A' AND t.tgtype=23
        AND ((t.tgrelid='public.atenciones_clinicas'::regclass
          AND t.tgname='bit70_atenciones_validar_paciente') OR
          (t.tgrelid='public.observaciones_campo'::regclass
          AND t.tgname='bit70_observaciones_validar_paciente')))<>2
    OR NOT EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid='public.bit70_animales_foto_path_unica'::regclass
        AND i.indrelid='public.animales'::regclass AND i.indisunique
        AND i.indnkeyatts=1
        AND i.indkey[0]=(SELECT attnum FROM pg_attribute
          WHERE attrelid='public.animales'::regclass AND attname='foto_path')
        AND pg_get_expr(i.indpred,i.indrelid)='(foto_path IS NOT NULL)')
  THEN RAISE EXCEPTION 'BIT-70-20 R02 Paciente rollback: objetos distintos';
  END IF;
END;
$preflight$;
DROP TRIGGER bit70_animales_traslado_solo_rpc ON public.animales;
DROP TRIGGER bit70_atenciones_validar_paciente ON public.atenciones_clinicas;
DROP TRIGGER bit70_observaciones_validar_paciente ON public.observaciones_campo;
DROP FUNCTION public.bit70_bloquear_traslado_paciente();
DROP FUNCTION public.bit70_validar_historial_paciente();
DROP FUNCTION public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text);
DROP INDEX public.bit70_animales_foto_path_unica;
COMMIT;
