-- BIT-70-24. Conciliación de SOLO LECTURA; no elimina archivos.
-- Ejecutar con permiso de lectura en una ventana controlada. Mantener el
-- resultado detallado en un registro restringido: nombres de objeto, IDs y
-- owner_id no deben copiarse al informe público de la tarea.
-- Línea base BIT-70-23: exactamente dos huérfanos preexistentes, una
-- referencia rota = 0. Capturar IDs exactos de los dos antes de publicar;
-- un conteo igual a dos por sí solo NO demuestra que sean los mismos.

SELECT o.id AS objeto_id,o.name AS ruta,o.owner_id,o.created_at,o.updated_at,
       o.metadata->>'size' AS bytes,
       CASE
         WHEN split_part(o.name,'/',3)<>'' AND split_part(o.name,'/',4)=''
           THEN 'copia_o_fuente_tres_segmentos'
         WHEN split_part(o.name,'/',3)=''
           THEN 'fuente_legacy_dos_segmentos'
         ELSE 'ruta_no_estandar'
       END AS forma,
       current_timestamp-o.created_at > interval '24 hours' AS mayor_24_horas,
       EXISTS (SELECT 1 FROM public.animales a
         WHERE a.id::text=split_part(o.name,'/',2)) AS id_paciente_en_ruta
FROM storage.objects o
WHERE o.bucket_id='paciente-fotos'
  AND NOT EXISTS (SELECT 1 FROM public.animales a WHERE a.foto_path=o.name)
ORDER BY o.created_at,o.id;

SELECT a.id AS paciente_id,a.establecimiento_actual_id,a.foto_path
FROM public.animales a
WHERE a.foto_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='paciente-fotos' AND o.name=a.foto_path)
ORDER BY a.id;

SELECT a.id AS paciente_id,a.establecimiento_actual_id,a.foto_path
FROM public.animales a
WHERE a.foto_path IS NOT NULL
  AND split_part(a.foto_path,'/',1) IS DISTINCT FROM
      a.establecimiento_actual_id::text
ORDER BY a.id;

SELECT foto_path,count(*) AS pacientes
FROM public.animales WHERE foto_path IS NOT NULL
GROUP BY foto_path HAVING count(*)>1
ORDER BY foto_path;
