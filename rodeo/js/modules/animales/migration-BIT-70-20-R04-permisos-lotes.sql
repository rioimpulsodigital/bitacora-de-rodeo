-- BIT-70 — 20 / R-04. Solo ADMINISTRADOR y PROFESIONAL gestionan Lotes
-- y asignan Pacientes a Lotes. OPERADOR_CAMPO conserva SELECT de Lotes y
-- el alta de Pacientes/Tutores sin membresia. Incremental; NO aplicar sin catalogo
-- actualizado, revision y autorizacion. No cambia R-01/P-01/F-07.

BEGIN;

DO $preflight$
DECLARE
  v_ok boolean;
BEGIN
  IF current_user<>'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.lotes'::regclass
      AND c.relowner=current_user::regrole AND c.relrowsecurity
  ) OR to_regprocedure('public.get_mi_rol()') IS NULL
     OR to_regprocedure('public.tiene_acceso_establecimiento(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes: owner/RLS/helpers inesperados';
  END IF;
  SELECT count(*)=4 AND coalesce(bool_and(
    p.permissive='PERMISSIVE' AND p.roles=ARRAY['public'::name]
    AND (
      (p.policyname='lotes_select' AND p.cmd='SELECT'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND p.with_check IS NULL)
      OR (p.policyname='lotes_insert' AND p.cmd='INSERT'
       AND p.qual IS NULL
       AND replace(regexp_replace(coalesce(p.with_check,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)')
      OR (p.policyname='lotes_update' AND p.cmd='UPDATE'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND replace(regexp_replace(coalesce(p.with_check,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)')
      OR (p.policyname='lotes_delete' AND p.cmd='DELETE'
       AND replace(regexp_replace(coalesce(p.qual,''),'[[:space:]]+','','g'),
                   'public.','')='tiene_acceso_establecimiento(establecimiento_id)'
       AND p.with_check IS NULL)
    )
  ),false) INTO v_ok
  FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='lotes';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes: policies distintas del baseline';
  END IF;
  SELECT count(*)=4 AND coalesce(bool_and(
    p.permissive='PERMISSIVE' AND p.roles=ARRAY['public'::name]
    AND ((p.policyname='lotes_animales_select' AND p.cmd='SELECT'
          AND p.qual LIKE '%tiene_acceso_establecimiento%'
          AND p.qual LIKE '%lote_id%' AND p.with_check IS NULL)
      OR (p.policyname='lotes_animales_insert' AND p.cmd='INSERT'
          AND p.qual IS NULL
          AND p.with_check LIKE '%tiene_acceso_establecimiento%'
          AND p.with_check LIKE '%lote_id%')
      OR (p.policyname='lotes_animales_update' AND p.cmd='UPDATE'
          AND p.qual LIKE '%tiene_acceso_establecimiento%'
          AND p.qual LIKE '%lote_id%' AND p.with_check IS NULL)
      OR (p.policyname='lotes_animales_delete' AND p.cmd='DELETE'
          AND p.qual LIKE '%tiene_acceso_establecimiento%'
          AND p.qual LIKE '%lote_id%' AND p.with_check IS NULL))
  ),false) INTO v_ok FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename='lotes_animales';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes: policies de membresia inesperadas';
  END IF;
END;
$preflight$;

ALTER POLICY lotes_insert ON public.lotes
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
ALTER POLICY lotes_update ON public.lotes
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
ALTER POLICY lotes_delete ON public.lotes
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));

ALTER POLICY lotes_animales_insert ON public.lotes_animales
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)
  ) AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
ALTER POLICY lotes_animales_update ON public.lotes_animales
  USING (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)
  ) AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)
  ) AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
ALTER POLICY lotes_animales_delete ON public.lotes_animales
  USING (EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id=lote_id
      AND public.tiene_acceso_establecimiento(l.establecimiento_id)
  ) AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename='lotes')<>4
     OR (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='lotes'
           AND p.policyname IN ('lotes_insert','lotes_update','lotes_delete')
           AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
             OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>3
     OR (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='lotes_animales')<>4
     OR (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='lotes_animales'
           AND p.policyname IN ('lotes_animales_insert','lotes_animales_update',
                                'lotes_animales_delete')
           AND (coalesce(p.qual,'') LIKE '%get_mi_rol%'
             OR coalesce(p.with_check,'') LIKE '%get_mi_rol%'))<>3
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
         AND p.tablename='lotes' AND p.policyname='lotes_select'
         AND p.qual='tiene_acceso_establecimiento(establecimiento_id)'
     ) THEN
    RAISE EXCEPTION 'BIT-70-20 R04 Lotes: postflight inesperado';
  END IF;
END;
$postflight$;

COMMIT;
