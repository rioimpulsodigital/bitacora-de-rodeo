-- BIT-70 — 20 / R-04. Reversion independiente de Lotes y membresias.
-- NO ejecutar por defecto: reabre gestion y asignacion a OPERADOR_CAMPO.
-- Requiere autorizacion especifica; no toca los triggers R-02/R-03.

BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename='lotes')<>4 OR
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename='lotes'
       AND p.policyname IN ('lotes_insert','lotes_update','lotes_delete')
       AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
         OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>3 OR
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename='lotes_animales')<>4 OR
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename='lotes_animales'
       AND p.policyname IN ('lotes_animales_insert','lotes_animales_update',
                            'lotes_animales_delete')
       AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
         OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>3 THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes rollback: deriva; detener';
  END IF;
END;
$preflight$;

ALTER POLICY lotes_insert ON public.lotes
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
ALTER POLICY lotes_update ON public.lotes
  USING (public.tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
ALTER POLICY lotes_delete ON public.lotes
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
ALTER POLICY lotes_animales_insert ON public.lotes_animales
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
DROP POLICY lotes_animales_update ON public.lotes_animales;
CREATE POLICY lotes_animales_update ON public.lotes_animales FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
ALTER POLICY lotes_animales_delete ON public.lotes_animales
  USING (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)));

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename='lotes'
        AND p.policyname IN ('lotes_insert','lotes_update','lotes_delete')
        AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
          OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>0
     OR (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='lotes_animales'
           AND p.policyname IN ('lotes_animales_insert','lotes_animales_update',
                                'lotes_animales_delete')
           AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
             OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>0 THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes rollback: postflight inesperado';
  END IF;
END;
$postflight$;

COMMIT;
