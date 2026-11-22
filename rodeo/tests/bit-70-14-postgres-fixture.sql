-- BIT-70-14: catalogo minimo ficticio para PostgreSQL local desechable.
-- Nunca contiene datos ni credenciales de Produccion.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO authenticated;

-- Replica los grants por defecto de funciones observados por CLAUDY.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.establecimientos (id uuid PRIMARY KEY, nombre text NOT NULL);
CREATE TABLE public.perfiles (id uuid PRIMARY KEY, rol text NOT NULL);
CREATE TABLE public.perfiles_establecimientos (
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id),
  establecimiento_id uuid NOT NULL REFERENCES public.establecimientos(id),
  PRIMARY KEY (perfil_id, establecimiento_id)
);

CREATE FUNCTION public.get_mi_rol() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.rol FROM public.perfiles p WHERE p.id = auth.uid()
$$;

CREATE FUNCTION public.tiene_acceso_establecimiento(est_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles_establecimientos pe
    WHERE pe.perfil_id = auth.uid() AND pe.establecimiento_id = est_id
  )
$$;

CREATE TABLE public.visitas (
  id uuid PRIMARY KEY,
  establecimiento_id uuid NOT NULL REFERENCES public.establecimientos(id),
  descripcion text NOT NULL DEFAULT 'Visita ficticia'
);
CREATE TABLE public.observaciones_campo (
  id uuid PRIMARY KEY,
  establecimiento_id uuid NOT NULL REFERENCES public.establecimientos(id),
  visita_id uuid REFERENCES public.visitas(id),
  descripcion text NOT NULL DEFAULT 'Observacion ficticia'
);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY visitas_select ON public.visitas FOR SELECT
  USING (tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY visitas_insert ON public.visitas FOR INSERT
  WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY visitas_update ON public.visitas FOR UPDATE
  USING (tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY visitas_delete ON public.visitas FOR DELETE
  USING (tiene_acceso_establecimiento(establecimiento_id));

ALTER TABLE public.observaciones_campo ENABLE ROW LEVEL SECURITY;
CREATE POLICY observaciones_campo_select ON public.observaciones_campo FOR SELECT
  USING (tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY observaciones_campo_insert ON public.observaciones_campo FOR INSERT
  WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));
CREATE POLICY observaciones_campo_update ON public.observaciones_campo FOR UPDATE
  USING (tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));

-- Cuerpo original de BIT-63; la migracion exige dos fragmentos literales.
CREATE FUNCTION public.observaciones_campo_validar_coherencia_visita()
RETURNS trigger LANGUAGE plpgsql
AS $function$
DECLARE
  v_establecimiento_visita uuid;
BEGIN
  IF NEW.visita_id IS NOT NULL THEN
    SELECT establecimiento_id INTO v_establecimiento_visita
    FROM public.visitas WHERE id = NEW.visita_id;

    IF v_establecimiento_visita IS DISTINCT FROM NEW.establecimiento_id THEN
      RAISE EXCEPTION 'La Visita asociada no pertenece al establecimiento';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER observaciones_campo_validar_coherencia_visita
  BEFORE INSERT OR UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_validar_coherencia_visita();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.observaciones_campo TO authenticated;

INSERT INTO public.establecimientos (id, nombre) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Estancia Alfa Ficticia'),
  ('22222222-2222-4222-8222-222222222222', 'Estancia Beta Ficticia'),
  ('33333333-3333-4333-8333-333333333333', 'Estancia Gamma Ficticia');
INSERT INTO public.perfiles (id, rol) VALUES
  ('00000000-0000-4000-8000-000000000001', 'ADMINISTRADOR'),
  ('00000000-0000-4000-8000-000000000002', 'PROFESIONAL'),
  ('00000000-0000-4000-8000-000000000003', 'OPERADOR_CAMPO');
INSERT INTO public.perfiles_establecimientos VALUES
  ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.visitas (id, establecimiento_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff0', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.observaciones_campo (id, establecimiento_id, visita_id) VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff6', '11111111-1111-4111-8111-111111111111', NULL);
