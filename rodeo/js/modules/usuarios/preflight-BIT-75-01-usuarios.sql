-- BIT-75-01 PREFLIGHT (solo lectura). Conforme = todas las filas 'OK'.
SELECT 'tabla perfiles existe' AS chequeo, CASE WHEN to_regclass('public.perfiles') IS NOT NULL THEN 'OK' ELSE 'FALLA' END AS resultado
UNION ALL SELECT 'is_admin() existe', CASE WHEN to_regprocedure('public.is_admin()') IS NOT NULL THEN 'OK' ELSE 'FALLA' END
UNION ALL SELECT 'establecimientos_usuarios existe', CASE WHEN to_regclass('public.establecimientos_usuarios') IS NOT NULL THEN 'OK' ELSE 'FALLA' END
UNION ALL SELECT 'trigger bit56_proteger_perfiles presente (BIT-56-03)', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.perfiles'::regclass AND tgname='bit56_proteger_perfiles') THEN 'OK' ELSE 'FALLA' END
UNION ALL SELECT 'objetos BIT-75 aun NO existen', CASE WHEN to_regclass('public.usuarios_auditoria') IS NULL AND to_regprocedure('public.bit75_listar_usuarios()') IS NULL THEN 'OK' ELSE 'FALLA' END
UNION ALL SELECT 'al menos 1 ADMINISTRADOR activo (el trigger no debe bloquear el estado actual)', CASE WHEN (SELECT count(*) FROM public.perfiles WHERE rol='ADMINISTRADOR' AND activo) >= 1 THEN 'OK' ELSE 'FALLA' END
UNION ALL SELECT 'perfiles sin rol valido (debe ser 0)', CASE WHEN (SELECT count(*) FROM public.perfiles WHERE rol NOT IN ('ADMINISTRADOR','PROFESIONAL','OPERADOR_CAMPO','ASISTENTE_VETERINARIO')) = 0 THEN 'OK' ELSE 'FALLA' END;
-- Inventario informativo (no bloquea): cuentas Auth sin perfil.
SELECT count(*) AS cuentas_auth_sin_perfil FROM auth.users u LEFT JOIN public.perfiles p ON p.id=u.id WHERE p.id IS NULL AND u.deleted_at IS NULL;
