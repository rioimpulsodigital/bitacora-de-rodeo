-- BIT-70-20: solo datos ficticios y esquema minimo adicional a BIT-70-14.
-- Ejecutar despues del fixture 14 y de las migraciones R-01/P-01/F-07.
CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text,
  PRIMARY KEY(bucket_id,name)
);
CREATE TABLE public.personas (
  id uuid PRIMARY KEY,
  nombre text NOT NULL
);
CREATE TABLE public.personas_establecimientos (
  persona_id uuid NOT NULL REFERENCES public.personas(id),
  establecimiento_id uuid NOT NULL REFERENCES public.establecimientos(id),
  rol text,
  PRIMARY KEY(persona_id,establecimiento_id)
);
CREATE TABLE public.animales (
  id uuid PRIMARY KEY,
  establecimiento_actual_id uuid REFERENCES public.establecimientos(id),
  tutor_responsable_id uuid REFERENCES public.personas(id),
  nombre text,
  foto_path text
);
ALTER TABLE public.observaciones_campo
  ADD COLUMN animal_id uuid REFERENCES public.animales(id);
CREATE TABLE public.lotes (
  id uuid PRIMARY KEY,
  establecimiento_id uuid NOT NULL REFERENCES public.establecimientos(id),
  nombre text NOT NULL
);
CREATE TABLE public.lotes_animales (
  id uuid PRIMARY KEY,
  animal_id uuid NOT NULL REFERENCES public.animales(id),
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  fecha_fin timestamptz
);
CREATE TABLE public.atenciones_clinicas (
  id uuid PRIMARY KEY,
  establecimiento_id uuid REFERENCES public.establecimientos(id),
  animal_id uuid REFERENCES public.animales(id),
  notas text
);
CREATE TABLE public.novedades_establecimiento (
  id uuid PRIMARY KEY,
  establecimiento_id uuid REFERENCES public.establecimientos(id),
  notas text
);

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas_establecimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atenciones_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades_establecimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY animales_select ON public.animales FOR SELECT
  USING (public.tiene_acceso_establecimiento(establecimiento_actual_id));
CREATE POLICY animales_insert ON public.animales FOR INSERT
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_actual_id));
CREATE POLICY animales_update ON public.animales FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_actual_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_actual_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
CREATE POLICY lotes_select ON public.lotes FOR SELECT
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY lotes_insert ON public.lotes FOR INSERT
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY lotes_update ON public.lotes FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY lotes_delete ON public.lotes FOR DELETE
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY lotes_animales_select ON public.lotes_animales FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.lotes l WHERE l.id=lote_id
    AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
CREATE POLICY lotes_animales_insert ON public.lotes_animales FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.lotes l WHERE l.id=lote_id
    AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
CREATE POLICY lotes_animales_update ON public.lotes_animales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.lotes l WHERE l.id=lote_id
    AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
CREATE POLICY lotes_animales_delete ON public.lotes_animales FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.lotes l WHERE l.id=lote_id
    AND public.tiene_acceso_establecimiento(l.establecimiento_id)));
CREATE POLICY personas_establecimientos_select
  ON public.personas_establecimientos FOR SELECT
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY personas_establecimientos_insert
  ON public.personas_establecimientos FOR INSERT
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY personas_establecimientos_update
  ON public.personas_establecimientos FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY personas_establecimientos_delete
  ON public.personas_establecimientos FOR DELETE
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY atenciones_clinicas_select ON public.atenciones_clinicas FOR SELECT
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
CREATE POLICY atenciones_clinicas_update ON public.atenciones_clinicas FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
CREATE POLICY atenciones_clinicas_insert ON public.atenciones_clinicas FOR INSERT
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id)
    AND public.get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL'));
CREATE POLICY novedades_select ON public.novedades_establecimiento FOR SELECT
  USING (public.tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY novedades_update ON public.novedades_establecimiento FOR UPDATE
  USING (public.tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (public.tiene_acceso_establecimiento(establecimiento_id));

GRANT SELECT, INSERT, UPDATE ON public.animales, public.lotes,
  public.lotes_animales, public.personas_establecimientos TO authenticated;
GRANT DELETE ON public.lotes, public.lotes_animales,
  public.personas_establecimientos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.atenciones_clinicas TO authenticated;
GRANT SELECT, UPDATE ON public.novedades_establecimiento TO authenticated;
GRANT SELECT ON public.personas TO authenticated;

-- Misma via de alta atomica de Tutores que usa la aplicacion; cuerpo
-- reducido a las columnas ficticias del fixture.
CREATE FUNCTION public.crear_persona_con_establecimiento(
  p_nombre text,p_telefono text,p_email text,p_establecimiento_id uuid
) RETURNS TABLE(id uuid,nombre text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE v_id uuid;
BEGIN
  IF public.tiene_acceso_establecimiento(p_establecimiento_id) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
  v_id:=gen_random_uuid();
  INSERT INTO public.personas(id,nombre) VALUES(v_id,p_nombre);
  INSERT INTO public.personas_establecimientos(persona_id,establecimiento_id)
    VALUES(v_id,p_establecimiento_id);
  RETURN QUERY SELECT v_id,p_nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_persona_con_establecimiento(text,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_persona_con_establecimiento(text,text,text,uuid)
  TO authenticated;

INSERT INTO public.personas(id,nombre) VALUES
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tutor A ficticio'),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tutor B ficticio');
INSERT INTO public.personas_establecimientos VALUES
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',NULL),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '22222222-2222-4222-8222-222222222222',NULL);
INSERT INTO public.animales(id,establecimiento_actual_id,tutor_responsable_id,nombre) VALUES
  ('11111111-cccc-4ccc-8ccc-cccccccccccc',
   '11111111-1111-4111-8111-111111111111',
   '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Paciente A ficticio'),
  ('22222222-dddd-4ddd-8ddd-dddddddddddd',
   '22222222-2222-4222-8222-222222222222',
   '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Paciente B ficticio');
INSERT INTO public.lotes(id,establecimiento_id,nombre) VALUES
  ('11111111-eeee-4eee-8eee-eeeeeeeeeeee',
   '11111111-1111-4111-8111-111111111111','Lote A ficticio'),
  ('22222222-ffff-4fff-8fff-ffffffffffff',
   '22222222-2222-4222-8222-222222222222','Lote B ficticio');
INSERT INTO public.lotes_animales(id,animal_id,lote_id,fecha_fin) VALUES
  ('11111111-9999-4999-8999-999999999999',
   '11111111-cccc-4ccc-8ccc-cccccccccccc',
   '11111111-eeee-4eee-8eee-eeeeeeeeeeee',NULL);
INSERT INTO public.atenciones_clinicas(id,establecimiento_id,animal_id,notas) VALUES
  ('11111111-7777-4777-8777-777777777777',
   '11111111-1111-4111-8111-111111111111',
   '11111111-cccc-4ccc-8ccc-cccccccccccc','Atencion ficticia');
INSERT INTO public.novedades_establecimiento(id,establecimiento_id,notas) VALUES
  ('11111111-8888-4888-8888-888888888888',
   '11111111-1111-4111-8111-111111111111','Novedad ficticia');
