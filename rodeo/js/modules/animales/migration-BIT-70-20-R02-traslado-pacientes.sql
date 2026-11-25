-- BIT-70-20 / R-02: traslado controlado de Pacientes entre establecimientos.
-- Aplicar DESPUES de R03 coherencia de lotes y R04 vinculos de Tutores.
-- No mueve objetos de Storage: el cliente sube una copia al destino ANTES
-- de llamar a esta RPC y borra la foto antigua solo DESPUES del commit.
-- Incremental; no aplicar en Produccion sin preflight del catalogo vigente.
BEGIN;
LOCK TABLE public.animales IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid='public.animales'::regclass
      AND c.relowner=current_user::regrole AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  ) OR to_regclass('storage.objects') IS NULL
    OR to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NULL
    OR to_regprocedure('public.bit70_validar_tutor_paciente()') IS NULL
    OR to_regprocedure('public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)') IS NOT NULL
    OR to_regprocedure('public.bit70_bloquear_traslado_paciente()') IS NOT NULL
    OR to_regprocedure('public.bit70_validar_historial_paciente()') IS NOT NULL
    OR to_regclass('public.bit70_animales_foto_path_unica') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.animales'::regclass
      AND tgname='bit70_animales_traslado_solo_rpc')
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE
      (tgrelid='public.atenciones_clinicas'::regclass AND tgname='bit70_atenciones_validar_paciente')
      OR (tgrelid='public.observaciones_campo'::regclass AND tgname='bit70_observaciones_validar_paciente'))
  THEN RAISE EXCEPTION 'BIT-70-20 R02 Paciente: baseline u objetos inesperados';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
    WHERE attrelid='public.animales'::regclass AND attname='foto_path'
      AND atttypid='pg_catalog.text'::regtype AND NOT attisdropped)
  THEN RAISE EXCEPTION 'BIT-70-20 R02 Paciente: falta foto_path';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
    WHERE attrelid='storage.objects'::regclass AND attname='owner_id'
      AND atttypid='pg_catalog.text'::regtype AND NOT attisdropped)
  THEN RAISE EXCEPTION 'BIT-70-21: owner_id de Storage inesperado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='public.atenciones_clinicas'::regclass
        AND attname='animal_id' AND atttypid='pg_catalog.uuid'::regtype
        AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='public.observaciones_campo'::regclass
        AND attname='animal_id' AND atttypid='pg_catalog.uuid'::regtype
        AND NOT attisdropped)
  THEN RAISE EXCEPTION 'BIT-70-21: columnas historicas inesperadas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.animales WHERE foto_path IS NOT NULL
    GROUP BY foto_path HAVING count(*)>1)
  THEN RAISE EXCEPTION 'BIT-70-21: fotografias compartidas entre Pacientes';
  END IF;
END;
$preflight$;

-- Una ruta de foto solo puede pertenecer a un Paciente, incluyendo altas y
-- reemplazos fuera de esta RPC. El lock anterior cierra la carrera del
-- preflight de duplicados con la creacion del indice.
CREATE UNIQUE INDEX bit70_animales_foto_path_unica
  ON public.animales(foto_path) WHERE foto_path IS NOT NULL;

-- El usuario autenticado no puede cambiar directamente el establecimiento,
-- incluso si tiene acceso a ambos. Solo la RPC SECURITY DEFINER llega como
-- owner; cambios administrativos directos como postgres quedan explícitos.
CREATE FUNCTION public.bit70_bloquear_traslado_paciente()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $function$
BEGIN
  IF TG_WHEN<>'BEFORE' OR TG_OP<>'UPDATE' OR TG_LEVEL<>'ROW'
     OR TG_RELID<>'public.animales'::regclass
     OR TG_NAME<>'bit70_animales_traslado_solo_rpc'
  THEN RAISE EXCEPTION 'BIT-70-20 R02 Paciente: trigger fuera de contexto'
    USING ERRCODE='42501'; END IF;
  IF NEW.establecimiento_actual_id IS DISTINCT FROM OLD.establecimiento_actual_id
     AND current_user<>'postgres'
  THEN RAISE EXCEPTION 'Usar el traslado controlado de Pacientes'
    USING ERRCODE='42501'; END IF;
  -- Incluye actualizar_foto_paciente(): una RPC concurrente no puede dejar
  -- un path del origen referenciado por un Paciente que ya esta en destino.
  IF (NEW.foto_path IS DISTINCT FROM OLD.foto_path OR
      NEW.establecimiento_actual_id IS DISTINCT FROM OLD.establecimiento_actual_id)
     AND NEW.foto_path IS NOT NULL
     AND pg_catalog.split_part(NEW.foto_path,'/',1)
         IS DISTINCT FROM NEW.establecimiento_actual_id::text
  THEN RAISE EXCEPTION 'Foto fuera del establecimiento del Paciente'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.bit70_bloquear_traslado_paciente()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bit70_animales_traslado_solo_rpc
  BEFORE UPDATE ON public.animales FOR EACH ROW
  EXECUTE FUNCTION public.bit70_bloquear_traslado_paciente();
ALTER TABLE public.animales ENABLE ALWAYS TRIGGER bit70_animales_traslado_solo_rpc;

-- Los registros historicos permanecen en su establecimiento de origen y
-- mantienen su referencia al Paciente. Solo nuevos vinculos o reasignaciones
-- deben coincidir con el establecimiento ACTUAL del Paciente. FOR SHARE
-- serializa esta comprobacion con el FOR UPDATE de la RPC de traslado.
CREATE FUNCTION public.bit70_validar_historial_paciente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE v_establecimiento_paciente uuid;
BEGIN
  IF TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_OP NOT IN ('INSERT','UPDATE')
     OR NOT ((TG_RELID='public.atenciones_clinicas'::regclass
       AND TG_NAME='bit70_atenciones_validar_paciente') OR
       (TG_RELID='public.observaciones_campo'::regclass
       AND TG_NAME='bit70_observaciones_validar_paciente'))
  THEN RAISE EXCEPTION 'BIT-70-21: trigger historial fuera de contexto'
    USING ERRCODE='42501'; END IF;
  IF NEW.animal_id IS NOT NULL AND
     (TG_OP='INSERT' OR NEW.animal_id IS DISTINCT FROM OLD.animal_id
      OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id)
  THEN
    SELECT a.establecimiento_actual_id INTO v_establecimiento_paciente
      FROM public.animales a WHERE a.id=NEW.animal_id FOR SHARE;
    IF NOT FOUND OR v_establecimiento_paciente IS DISTINCT FROM NEW.establecimiento_id
    THEN RAISE EXCEPTION 'Paciente fuera del establecimiento del nuevo registro'
      USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.bit70_validar_historial_paciente()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bit70_atenciones_validar_paciente
  BEFORE INSERT OR UPDATE ON public.atenciones_clinicas FOR EACH ROW
  EXECUTE FUNCTION public.bit70_validar_historial_paciente();
CREATE TRIGGER bit70_observaciones_validar_paciente
  BEFORE INSERT OR UPDATE ON public.observaciones_campo FOR EACH ROW
  EXECUTE FUNCTION public.bit70_validar_historial_paciente();
ALTER TABLE public.atenciones_clinicas
  ENABLE ALWAYS TRIGGER bit70_atenciones_validar_paciente;
ALTER TABLE public.observaciones_campo
  ENABLE ALWAYS TRIGGER bit70_observaciones_validar_paciente;

CREATE FUNCTION public.bit70_trasladar_paciente(
  p_animal_id uuid,p_origen_id uuid,p_destino_id uuid,
  p_foto_origen_path text,p_foto_destino_path text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
  v_origen uuid;
  v_tutor uuid;
  v_foto_anterior text;
  v_tutor_destino boolean;
BEGIN
  IF public.get_mi_rol() IS DISTINCT FROM 'ADMINISTRADOR'
     AND public.get_mi_rol() IS DISTINCT FROM 'PROFESIONAL'
  THEN RAISE EXCEPTION 'Rol sin permiso de traslado' USING ERRCODE='42501';
  END IF;
  SELECT establecimiento_actual_id,tutor_responsable_id,foto_path
    INTO v_origen,v_tutor,v_foto_anterior
    FROM public.animales WHERE id=p_animal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente no encontrado'
    USING ERRCODE='P0002'; END IF;
  IF v_origen IS NULL OR p_destino_id IS NULL OR p_destino_id=v_origen
     OR v_origen IS DISTINCT FROM p_origen_id
     OR v_foto_anterior IS DISTINCT FROM p_foto_origen_path
     OR public.tiene_acceso_establecimiento(v_origen) IS DISTINCT FROM true
     OR public.tiene_acceso_establecimiento(p_destino_id) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Contexto, origen o destino sin acceso o invalidos'
    USING ERRCODE='42501'; END IF;

  -- Nunca se admite una referencia de foto del origen en el destino.
  IF v_foto_anterior IS NOT NULL THEN
    IF pg_catalog.split_part(v_foto_anterior,'/',1)<>v_origen::text
      OR p_foto_destino_path IS NULL
      OR pg_catalog.split_part(p_foto_destino_path,'/',1)<>p_destino_id::text
      OR pg_catalog.split_part(p_foto_destino_path,'/',2)<>p_animal_id::text
      OR pg_catalog.split_part(p_foto_destino_path,'/',3)=''
      OR pg_catalog.split_part(p_foto_destino_path,'/',4)<>''
      OR pg_catalog.btrim(p_foto_destino_path)=''
    THEN RAISE EXCEPTION 'Primero copiar la foto al destino por Storage API'
      USING ERRCODE='22023'; END IF;
    -- Solo lectura de metadata de Storage. El bloqueo impide que la fila se
    -- elimine mientras la transaccion referencia la copia. La copia fisica
    -- siempre la hace el cliente por Storage API, nunca SQL directo.
    PERFORM 1 FROM storage.objects o
      WHERE o.bucket_id='paciente-fotos' AND o.name=p_foto_destino_path
        AND o.owner_id=auth.uid()::text
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La copia de la foto no existe en Storage destino'
        USING ERRCODE='23503';
    END IF;
  ELSIF p_foto_destino_path IS NOT NULL THEN
    RAISE EXCEPTION 'Paciente sin foto: referencia de destino inesperada'
      USING ERRCODE='22023';
  END IF;

  -- Las filas activas se cierran en esta misma transaccion. R03 comprueba
  -- que el historial cerrado no impide el cambio de establecimiento.
  UPDATE public.lotes_animales
    SET fecha_fin=pg_catalog.now()
    WHERE animal_id=p_animal_id AND fecha_fin IS NULL;
  SELECT EXISTS(SELECT 1 FROM public.personas_establecimientos pe
    WHERE pe.persona_id=v_tutor AND pe.establecimiento_id=p_destino_id)
    INTO v_tutor_destino;
  UPDATE public.animales
    SET establecimiento_actual_id=p_destino_id,
        tutor_responsable_id=CASE WHEN v_tutor_destino THEN v_tutor ELSE NULL END,
        foto_path=p_foto_destino_path
    WHERE id=p_animal_id;
  RETURN v_foto_anterior;
END;
$function$;
REVOKE ALL ON FUNCTION public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)
  TO authenticated;

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t
      WHERE t.tgrelid='public.animales'::regclass
        AND t.tgname='bit70_animales_traslado_solo_rpc' AND t.tgenabled='A'
        AND t.tgfoid='public.bit70_bloquear_traslado_paciente()'::regprocedure
        AND t.tgtype=19)<>1
    OR (SELECT count(*) FROM pg_trigger t
        WHERE t.tgfoid='public.bit70_validar_historial_paciente()'::regprocedure
          AND t.tgenabled='A' AND t.tgtype=23
          AND ((t.tgrelid='public.atenciones_clinicas'::regclass
            AND t.tgname='bit70_atenciones_validar_paciente') OR
            (t.tgrelid='public.observaciones_campo'::regclass
            AND t.tgname='bit70_observaciones_validar_paciente')))<>2
    OR NOT EXISTS (SELECT 1 FROM pg_index i
        WHERE i.indexrelid='public.bit70_animales_foto_path_unica'::regclass
          AND i.indrelid='public.animales'::regclass AND i.indisunique
          AND i.indnkeyatts=1
          AND i.indkey[0]=(SELECT attnum FROM pg_attribute
            WHERE attrelid='public.animales'::regclass AND attname='foto_path')
          AND pg_get_expr(i.indpred,i.indrelid)='(foto_path IS NOT NULL)')
    OR has_function_privilege('anon','public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('service_role','public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'BIT-70-20 R02 Paciente: postflight inesperado';
  END IF;
END;
$postflight$;
COMMIT;
