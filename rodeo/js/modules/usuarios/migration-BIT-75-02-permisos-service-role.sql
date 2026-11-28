-- BIT-75-02: permisos minimos de service_role para el handler de admin-usuarios (v2). Complementa BIT-75-01.
-- Solo GRANTs a service_role. NO toca anon ni authenticated, RLS, triggers, auditoria ni datos.
-- Contraste con el handler (handler.mjs, hash del manifiesto 53d4480c...):
--   perfiles                   SELECT id,nombre,rol,activo | upsert (INSERT + UPDATE de id,nombre,rol,activo) | PATCH nombre,rol,activo
--   establecimientos           SELECT id
--   establecimientos_usuarios  SELECT perfil_id,establecimiento_id | INSERT ... ON CONFLICT DO NOTHING | DELETE
--   bit56_validadores          SELECT perfil_id,establecimiento_id (solo lectura)
-- Sin acceso a: perfiles.persona_id/created_at/updated_at, DELETE de perfiles, escritura en establecimientos
-- ni bit56_validadores. Las columnas con DEFAULT (activo, created_at, jornada_habilitada) no requieren privilegio.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $pre$ BEGIN
  IF to_regclass('public.perfiles') IS NULL OR to_regclass('public.establecimientos') IS NULL
     OR to_regclass('public.establecimientos_usuarios') IS NULL OR to_regclass('public.bit56_validadores') IS NULL
     OR to_regclass('public.usuarios_auditoria') IS NULL OR to_regprocedure('public.bit75_listar_usuarios()') IS NULL
  THEN RAISE EXCEPTION 'BIT-75-02: precondiciones ausentes (BIT-75-01 no aplicada o esquema base alterado)'; END IF;
  IF has_any_column_privilege('service_role','public.perfiles','SELECT,INSERT,UPDATE')
     OR has_table_privilege('service_role','public.perfiles','DELETE')
     OR has_any_column_privilege('service_role','public.establecimientos','SELECT,INSERT,UPDATE')
     OR has_table_privilege('service_role','public.establecimientos','DELETE')
     OR has_any_column_privilege('service_role','public.establecimientos_usuarios','SELECT,INSERT,UPDATE')
     OR has_table_privilege('service_role','public.establecimientos_usuarios','DELETE')
     OR has_any_column_privilege('service_role','public.bit56_validadores','SELECT,INSERT,UPDATE')
     OR has_table_privilege('service_role','public.bit56_validadores','DELETE')
  THEN RAISE EXCEPTION 'BIT-75-02: service_role ya tiene privilegios sobre estas tablas (deriva o migracion ya aplicada)'; END IF;
END $pre$;

GRANT SELECT (id, nombre, rol, activo), INSERT (id, nombre, rol, activo), UPDATE (id, nombre, rol, activo)
  ON public.perfiles TO service_role;
GRANT SELECT (id) ON public.establecimientos TO service_role;
GRANT SELECT (perfil_id, establecimiento_id), INSERT (perfil_id, establecimiento_id)
  ON public.establecimientos_usuarios TO service_role;
GRANT DELETE ON public.establecimientos_usuarios TO service_role;
GRANT SELECT (perfil_id, establecimiento_id) ON public.bit56_validadores TO service_role;

COMMIT;
