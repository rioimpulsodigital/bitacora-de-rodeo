-- BIT-75-01: administracion de usuarios desde la aplicacion. SOLO RiO Local Lab hasta autorizacion expresa.
-- Aditiva: 1 tabla (auditoria), 1 trigger de proteccion del ultimo ADMINISTRADOR, 2 funciones
-- exclusivas del servicio privilegiado. No altera datos, roles ni reglas clinicas existentes.
-- Convencion BIT-59: GRANTs explicitos en la tabla nueva.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $pre$ BEGIN
  IF to_regclass('public.perfiles') IS NULL OR to_regclass('public.establecimientos_usuarios') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL
  THEN RAISE EXCEPTION 'BIT-75-01: esquema base ausente'; END IF;
  IF to_regclass('public.usuarios_auditoria') IS NOT NULL
     OR to_regprocedure('public.bit75_listar_usuarios()') IS NOT NULL
  THEN RAISE EXCEPTION 'BIT-75-01: objetos ya existentes (migracion ya aplicada)'; END IF;
END $pre$;

-- 1) Auditoria: actor, destino, accion, resultado. Sin secretos (el servicio nunca escribe tokens ni contrasenas).
CREATE TABLE public.usuarios_auditoria (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  destino_id  uuid,
  accion      text NOT NULL CHECK (accion IN ('listar','crear','reenviar','actualizar','establecimientos','desactivar','activar','denegado')),
  resultado   text NOT NULL CHECK (resultado IN ('ok','parcial','error','denegado')),
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX usuarios_auditoria_destino_idx ON public.usuarios_auditoria (destino_id, creado_en DESC);
ALTER TABLE public.usuarios_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY usuarios_auditoria_select_admin ON public.usuarios_auditoria
  FOR SELECT TO authenticated USING (public.is_admin());
-- Escritura solo por el servicio privilegiado: ningun rol de la Data API puede insertar/editar/borrar.
REVOKE ALL ON public.usuarios_auditoria FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.usuarios_auditoria TO authenticated;
GRANT SELECT, INSERT ON public.usuarios_auditoria TO service_role;

-- Inmutabilidad: ni siquiera el servicio puede modificar ni borrar registros.
CREATE FUNCTION public.bit75_auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $f$
BEGIN RAISE EXCEPTION 'BIT-75: la auditoria es de solo agregado' USING ERRCODE='42501'; END $f$;
REVOKE ALL ON FUNCTION public.bit75_auditoria_inmutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bit75_auditoria_inmutable BEFORE UPDATE OR DELETE ON public.usuarios_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.bit75_auditoria_inmutable();

-- 2) Ultimo ADMINISTRADOR activo: ningun camino (app, API, consola) puede dejarlo sin reemplazo.
CREATE FUNCTION public.bit75_proteger_ultimo_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
BEGIN
  IF OLD.rol = 'ADMINISTRADOR' AND OLD.activo IS TRUE
     AND (TG_OP = 'DELETE' OR NEW.rol IS DISTINCT FROM 'ADMINISTRADOR' OR NEW.activo IS DISTINCT FROM TRUE)
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('bit75_ultimo_admin'));
    IF NOT EXISTS (SELECT 1 FROM public.perfiles p
                   WHERE p.id <> OLD.id AND p.rol = 'ADMINISTRADOR' AND p.activo IS TRUE)
    THEN RAISE EXCEPTION 'BIT-75: no se puede desactivar ni degradar al ultimo ADMINISTRADOR activo'
         USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.bit75_proteger_ultimo_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bit75_proteger_ultimo_admin BEFORE UPDATE OR DELETE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.bit75_proteger_ultimo_admin();
ALTER TABLE public.perfiles ENABLE ALWAYS TRIGGER bit75_proteger_ultimo_admin;

-- 3) Lectura para el servicio privilegiado (cruza auth.users, inaccesible desde la Data API).
CREATE FUNCTION public.bit75_listar_usuarios() RETURNS TABLE (
  id uuid, email text, nombre text, rol text, activo boolean, estado text,
  ultimo_ingreso timestamptz, creado_en timestamptz, establecimientos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, u.email::text, p.nombre, p.rol, p.activo,
    CASE WHEN p.id IS NULL THEN 'SIN_PERFIL'
         WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'BLOQUEADO'
         WHEN p.activo IS NOT TRUE THEN 'INACTIVO'
         WHEN u.last_sign_in_at IS NULL THEN 'PENDIENTE_PRIMER_INGRESO'
         ELSE 'ACTIVO' END,
    u.last_sign_in_at, u.created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) ORDER BY e.nombre)
              FROM public.establecimientos_usuarios eu JOIN public.establecimientos e ON e.id = eu.establecimiento_id
              WHERE eu.perfil_id = u.id), '[]'::jsonb)
  FROM auth.users u LEFT JOIN public.perfiles p ON p.id = u.id
  WHERE u.deleted_at IS NULL AND u.is_anonymous IS NOT TRUE
  ORDER BY p.nombre NULLS LAST, u.email
$f$;

-- Busqueda por email para reanudar altas. v2 (reserva de seguridad de BIT-75 — 03): una cuenta Auth preexistente SIN perfil
-- solo es reanudable (origen_acreditado) si TODO lo siguiente es verificable:
--   (a) la marca de origen esta en app_metadata (solo escribible con la clave de servicio; user_metadata la controla la propia persona),
--   (b) la cuenta NUNCA ingreso (last_sign_in_at nulo), no tiene sesiones ni refresh tokens y no tiene identidades distintas de email.
--       (GoTrue asigna un hash aleatorio a las cuentas creadas por la API admin sin contrasena, por lo que la mera presencia de hash no
--       distingue una credencial fijada por una persona; toda via para fijar o usar una credencial —enlace de recuperacion, ingreso,
--       registro— deja ingreso, sesion o falta de la marca de origen, y la marca solo la escribe la clave de servicio),
--   (c) existe traza de auditoria de esa alta (accion 'crear', resultado parcial/error) con un actor ADMINISTRADOR.
-- Cualquier otra cuenta preexistente se rechaza: el modulo no se apropia ni resetea credenciales ajenas por coincidencia de email.
CREATE FUNCTION public.bit75_buscar_usuario(p_email text)
RETURNS TABLE (id uuid, tiene_perfil boolean, origen_acreditado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id,
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = u.id),
    ( (u.raw_app_meta_data ->> 'bit75_alta') = 'admin-usuarios'
      AND u.last_sign_in_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM auth.refresh_tokens r WHERE r.user_id = u.id::text)
      AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider <> 'email')
      AND EXISTS (SELECT 1 FROM public.usuarios_auditoria a
                  JOIN public.perfiles ap ON ap.id = a.actor_id AND ap.rol = 'ADMINISTRADOR'
                  WHERE a.destino_id = u.id AND a.accion = 'crear' AND a.resultado IN ('parcial', 'error')) )
  FROM auth.users u WHERE lower(u.email) = lower(p_email) AND u.deleted_at IS NULL LIMIT 1
$f$;

REVOKE ALL ON FUNCTION public.bit75_listar_usuarios(), public.bit75_buscar_usuario(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bit75_listar_usuarios(), public.bit75_buscar_usuario(text) TO service_role;

COMMIT;
