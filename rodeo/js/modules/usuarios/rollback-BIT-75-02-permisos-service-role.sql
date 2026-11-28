-- BIT-75-02 contingencia: retira exactamente los GRANTs agregados por la migracion a service_role.
-- Conserva todo lo demas (los privilegios REFERENCES/TRIGGER/TRUNCATE previos, RLS, triggers, auditoria, datos).
-- Efecto: el handler vuelve al estado previo (sesiones ADMINISTRADOR -> HTTP 500; sin sesion -> 401). No expone nada.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE SELECT (id, nombre, rol, activo), INSERT (id, nombre, rol, activo), UPDATE (id, nombre, rol, activo)
  ON public.perfiles FROM service_role;
REVOKE SELECT (id) ON public.establecimientos FROM service_role;
REVOKE SELECT (perfil_id, establecimiento_id), INSERT (perfil_id, establecimiento_id)
  ON public.establecimientos_usuarios FROM service_role;
REVOKE DELETE ON public.establecimientos_usuarios FROM service_role;
REVOKE SELECT (perfil_id, establecimiento_id) ON public.bit56_validadores FROM service_role;
COMMIT;
