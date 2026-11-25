-- BIT-70-24. Propuesta de preflight de solo lectura para la ventana futura.
-- No aplicar migraciones, rollback, DML, DDL ni limpieza con este archivo.
-- Ejecutar como postgres solo tras autorización productiva, inmediatamente
-- antes de las cinco migraciones; comparar con BIT-70-23 y sus preflights.
-- No publica nombres de personas ni rutas de fotografías.

SELECT current_user AS ejecutor, current_setting('server_version') AS postgresql_version,
       current_setting('server_version_num') AS postgresql_version_num,
       current_timestamp AS instante;

SELECT c.relname AS tabla, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('animales','lotes','lotes_animales','atenciones_clinicas',
   'novedades_establecimiento','personas_establecimientos',
   'observaciones_campo','visitas')
ORDER BY c.relname;

SELECT c.relname AS tabla, a.attname AS columna,
       format_type(a.atttypid,a.atttypmod) AS tipo
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT a.attisdropped AND a.attnum>0 AND
  ((n.nspname='public' AND
    ((c.relname='animales' AND a.attname IN
      ('establecimiento_actual_id','tutor_responsable_id','foto_path')) OR
     (c.relname='lotes' AND a.attname='establecimiento_id') OR
     (c.relname='lotes_animales' AND a.attname IN ('animal_id','lote_id','fecha_fin')) OR
     (c.relname IN ('atenciones_clinicas','observaciones_campo')
       AND a.attname IN ('animal_id','establecimiento_id')))) OR
   (n.nspname='storage' AND c.relname='objects' AND a.attname='owner_id'))
ORDER BY n.nspname,c.relname,a.attname;

SELECT n.nspname AS esquema,p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
       p.proconfig AS configuracion
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('get_mi_rol','is_admin','tiene_acceso_establecimiento',
   'crear_persona_con_establecimiento','actualizar_foto_paciente',
   'bit70_observaciones_validar_visita_rls',
   'bit70_visitas_bloquear_cambio_establecimiento',
   'bit70_validar_lote_animal_activo','bit70_bloquear_traslado_registro',
   'bit70_puede_vincular_tutor','bit70_validar_tutor_paciente',
   'bit70_bloquear_traslado_paciente','bit70_validar_historial_paciente',
   'bit70_trasladar_paciente')
ORDER BY p.proname,argumentos;

SELECT c.relname AS tabla,t.tgname AS trigger,t.tgenabled AS habilitado,
       t.tgtype AS tipo,p.proname AS funcion
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='public' AND NOT t.tgisinternal AND
  c.relname IN ('animales','lotes','lotes_animales','atenciones_clinicas',
    'novedades_establecimiento','personas_establecimientos',
    'observaciones_campo','visitas')
ORDER BY c.relname,t.tgname;

SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('lotes','lotes_animales','personas_establecimientos','animales',
   'visitas','observaciones_campo')
ORDER BY tablename,policyname;

SELECT to_regclass('public.bit70_animales_foto_path_unica') IS NULL
         AS indice_foto_ausente,
       to_regprocedure('public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)')
         IS NULL AS rpc_traslado_ausente,
       to_regprocedure('public.bit70_validar_lote_animal_activo()')
         IS NULL AS funcion_r03_ausente,
       has_function_privilege('authenticated',
         'public.crear_persona_con_establecimiento(text,text,text,uuid)',
         'EXECUTE') AS alta_tutor_autenticado,
       has_table_privilege('postgres','storage.objects','SELECT')
         AS postgres_lee_storage,
       has_table_privilege('postgres','storage.objects','UPDATE')
         AS postgres_bloquea_storage;

-- Las cinco migraciones crean 11 triggers, no 9. Antes de aplicar: cero.
SELECT count(*) AS triggers_pendientes_ya_presentes
FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN
  ('bit70_lotes_animales_validar_establecimiento',
   'bit70_animales_validar_lote_activo',
   'bit70_lotes_validar_animales_activos',
   'bit70_atenciones_bloquear_traslado',
   'bit70_novedades_bloquear_traslado',
   'bit70_lotes_bloquear_traslado',
   'bit70_animales_validar_tutor',
   'bit70_vinculos_tutor_proteger',
   'bit70_animales_traslado_solo_rpc',
   'bit70_atenciones_validar_paciente',
   'bit70_observaciones_validar_paciente');

-- Los conteos de historial frente al establecimiento ACTUAL son baseline
-- informativo antes de los traslados. Después de un traslado legítimo pueden
-- ser positivos: el historial permanece aislado en su origen por diseño.
-- D1 (Tutor sin vínculo) puede ser 3 y no bloquea los preflights.
SELECT 'membresias_activas_incoherentes' AS control,count(*) AS cantidad
FROM public.lotes_animales la JOIN public.animales a ON a.id=la.animal_id
JOIN public.lotes l ON l.id=la.lote_id
WHERE la.fecha_fin IS NULL
  AND a.establecimiento_actual_id IS DISTINCT FROM l.establecimiento_id
UNION ALL
SELECT 'rutas_foto_duplicadas',count(*) FROM (
  SELECT foto_path FROM public.animales WHERE foto_path IS NOT NULL
  GROUP BY foto_path HAVING count(*)>1
) d
UNION ALL
SELECT 'fotos_prefijo_incoherente',count(*) FROM public.animales
WHERE foto_path IS NOT NULL
  AND split_part(foto_path,'/',1) IS DISTINCT FROM establecimiento_actual_id::text
UNION ALL
SELECT 'atenciones_historicas_fuera_de_actual',count(*)
FROM public.atenciones_clinicas ac JOIN public.animales a ON a.id=ac.animal_id
WHERE ac.establecimiento_id IS DISTINCT FROM a.establecimiento_actual_id
UNION ALL
SELECT 'observaciones_historicas_fuera_de_actual',count(*)
FROM public.observaciones_campo oc JOIN public.animales a ON a.id=oc.animal_id
WHERE oc.establecimiento_id IS DISTINCT FROM a.establecimiento_actual_id
UNION ALL
SELECT 'tutores_sin_vinculo_actual_d1',count(*)
FROM public.animales a WHERE a.tutor_responsable_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.personas_establecimientos pe
    WHERE pe.persona_id=a.tutor_responsable_id
      AND pe.establecimiento_id=a.establecimiento_actual_id);

SELECT 'objetos_huerfanos' AS control,count(*) AS cantidad
FROM storage.objects o WHERE o.bucket_id='paciente-fotos'
  AND NOT EXISTS (SELECT 1 FROM public.animales a WHERE a.foto_path=o.name)
UNION ALL
SELECT 'referencias_sin_objeto',count(*) FROM public.animales a
WHERE a.foto_path IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='paciente-fotos'
    AND o.name=a.foto_path)
UNION ALL
SELECT 'objetos_tres_segmentos_huerfanos',count(*) FROM storage.objects o
WHERE o.bucket_id='paciente-fotos'
  AND split_part(o.name,'/',3)<>'' AND split_part(o.name,'/',4)=''
  AND NOT EXISTS (SELECT 1 FROM public.animales a WHERE a.foto_path=o.name);

SELECT id,public, file_size_limit,allowed_mime_types
FROM storage.buckets WHERE id='paciente-fotos';

SELECT pid,usename,state,wait_event_type,wait_event,backend_start
FROM pg_stat_activity WHERE datname=current_database()
  AND pid<>pg_backend_pid() ORDER BY pid;

SELECT c.relname AS tabla,l.mode,count(*) AS bloqueos
FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('animales','lotes','lotes_animales','personas_establecimientos')
GROUP BY c.relname,l.mode ORDER BY c.relname,l.mode;
