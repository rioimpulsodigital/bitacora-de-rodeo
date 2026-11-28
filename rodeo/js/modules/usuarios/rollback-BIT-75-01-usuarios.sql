-- BIT-75-01 contingencia: retira los objetos agregados. La auditoria (solo agregado) se CONSERVA salvo
-- decision expresa: por defecto solo se desactivan funciones y triggers; descomentar el DROP TABLE si se autoriza.
BEGIN;
DROP TRIGGER IF EXISTS bit75_proteger_ultimo_admin ON public.perfiles;
DROP FUNCTION IF EXISTS public.bit75_proteger_ultimo_admin();
DROP FUNCTION IF EXISTS public.bit75_listar_usuarios();
DROP FUNCTION IF EXISTS public.bit75_buscar_usuario(text);
-- DROP TABLE public.usuarios_auditoria;  -- requiere desactivar antes bit75_auditoria_inmutable; no por defecto.
COMMIT;
