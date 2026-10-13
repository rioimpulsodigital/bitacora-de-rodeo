-- BIT-13 — Foto principal de Paciente: reemplazo atómico server-side
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── CONTEXTO ────────────────────────────────────────────────────────────
-- BIT-50 ya dejó toda la infraestructura de la foto principal del Paciente:
-- columna `animales.foto_path` (migration-BIT-50-catastro-equinos.sql) y
-- bucket privado `paciente-fotos` con policies de INSERT/SELECT/DELETE
-- sobre `storage.objects` (migration-BIT-50-storage-fotos.sql). BIT-13 NO
-- crea ninguna tabla ni bucket nuevo -- reutiliza eso íntegro.
--
-- Lo único que faltaba, y que esa misma migración de BIT-50 ya anticipaba
-- textualmente ("Sin policy de UPDATE: reemplazar una foto no es parte de
-- BIT-50... debería resolverlo con una RPC dedicada"): un mecanismo para
-- REEMPLAZAR la foto de un Paciente que ya existe (alta por primera vez
-- desde Editar, o reemplazo de una foto previa).
--
-- ─── POR QUÉ UNA RPC Y NO UNA POLICY DE UPDATE/DELETE MÁS ABIERTA ─────────
-- El reemplazo necesita dos pasos atómicos: (1) actualizar
-- `animales.foto_path` al path nuevo y (2) borrar el objeto VIEJO de
-- Storage, que puede haber sido subido por OTRO usuario (ej. la foto
-- original se cargó desde Catastro por un OPERADOR_CAMPO, la reemplaza
-- después un ADMINISTRADOR). La policy de DELETE que ya existe
-- (`paciente_fotos_delete_propio_no_referenciado`) exige `owner =
-- auth.uid()` a propósito (ver migration-BIT-50-storage-fotos.sql) -- no
-- alcanza para este caso, y ampliarla sería debilitar una protección ya
-- revisada para un problema distinto (huérfanos de alta fallida). Una RPC
-- SECURITY DEFINER hace el UPDATE + el DELETE del objeto viejo como una
-- sola operación server-side, validando el mismo acceso que ya exige
-- `animales_update` (ADMINISTRADOR/PROFESIONAL, BIT-11) -- sin ampliar
-- ningún GRANT/policy general sobre `storage.objects` ni sobre `animales`.
--
-- ─── FLUJO DEL CLIENTE (rodeo/js/modules/animales/services.js,
--     reemplazarFotoPaciente) ────────────────────────────────────────────
-- 1) Sube la foto NUEVA a un path nuevo (nunca sobreescribe el objeto
--    viejo) -- usa la policy de INSERT ya existente, sin cambios.
-- 2) Recién si eso funciona, llama a esta RPC con el id del Paciente y el
--    path nuevo.
-- 3) Si la RPC falla, el cliente borra la foto nueva (huérfana, todavía sin
--    referenciar) -- misma policy de DELETE ya existente, sin cambios. La
--    foto vieja queda intacta en cualquier escenario de fallo: nunca se
--    borra antes de confirmar la nueva.
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Requiere que migration-BIT-50-catastro-equinos.sql y
-- migration-BIT-50-storage-fotos.sql ya estén aplicadas (confirmado:
-- BIT-52/BIT-53 las validaron en Producción).

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'actualizar_foto_paciente';
-- Debe dar 0 filas. Si ya existe, DETENERSE y reportar antes de continuar.

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'animales' AND column_name = 'foto_path';
-- Debe existir (text) -- confirma que BIT-50 ya corrió.

SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'animales' AND cmd = 'UPDATE';
-- Confirmar que la condición real de `animales_update` sigue siendo
-- tiene_acceso_establecimiento(establecimiento_actual_id) AND
-- get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL') (BIT-11). Si cambió,
-- ajustar el chequeo de rol del PASO 2 antes de aplicarlo -- la RPC debe
-- exigir exactamente el mismo acceso que ya exige editar el Paciente,
-- nunca uno distinto.

SELECT proname FROM pg_proc WHERE proname IN ('tiene_acceso_establecimiento', 'get_mi_rol');
-- Deben existir las 2 (creadas en BIT-04, reusadas sin cambios).

-- Si algo de esto no coincide con lo asumido acá: DETENERSE y reportar
-- antes de continuar -- no aplicar el Paso 2 a ciegas.

-- ── PASO 2 — RPC (idempotente vía CREATE OR REPLACE) ───────────────────────
-- SECURITY DEFINER: corre con privilegios del dueño de la función (mismo
-- mecanismo ya usado por crear_persona_con_establecimiento,
-- migration-BIT-11-fix-personas-rls.sql) -- por eso el DELETE interno sobre
-- `storage.objects` no necesita que `authenticated` tenga ningún privilegio
-- de DELETE propio sobre ese objeto. search_path fijo + todas las
-- referencias calificadas (public./storage.) -- no depende de search_path
-- para resolver nada, es defensa en profundidad adicional.

CREATE OR REPLACE FUNCTION actualizar_foto_paciente(
  p_animal_id uuid,
  p_nuevo_foto_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_establecimiento_id uuid;
  v_foto_path_anterior text;
BEGIN
  SELECT establecimiento_actual_id, foto_path
    INTO v_establecimiento_id, v_foto_path_anterior
    FROM public.animales
    WHERE id = p_animal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Mismo criterio exacto que animales_update (BIT-11): establecimiento +
  -- rol. Nunca más permisivo que lo que ya exige editar el Paciente.
  IF v_establecimiento_id IS NULL OR NOT tiene_acceso_establecimiento(v_establecimiento_id) THEN
    RAISE EXCEPTION 'Sin acceso al establecimiento del Paciente' USING ERRCODE = '42501';
  END IF;

  IF get_mi_rol() NOT IN ('ADMINISTRADOR', 'PROFESIONAL') THEN
    RAISE EXCEPTION 'Sin permiso para editar la foto de este Paciente' USING ERRCODE = '42501';
  END IF;

  IF p_nuevo_foto_path IS NULL OR btrim(p_nuevo_foto_path) = '' THEN
    RAISE EXCEPTION 'Falta la referencia a la foto nueva' USING ERRCODE = '22023';
  END IF;

  -- Defensa en profundidad -- "no mezclar imágenes entre establecimientos"
  -- (criterio explícito de BIT-13): el primer segmento del path debe ser el
  -- mismo establecimiento_actual_id de ESTE Paciente, no solo "alguno al
  -- que el usuario tenga acceso" (eso ya lo exige la policy de INSERT al
  -- subir, pero no garantiza que coincida con el Paciente puntual).
  IF split_part(p_nuevo_foto_path, '/', 1) <> v_establecimiento_id::text THEN
    RAISE EXCEPTION 'La foto nueva no pertenece al establecimiento de este Paciente' USING ERRCODE = '42501';
  END IF;

  UPDATE public.animales
     SET foto_path = p_nuevo_foto_path
   WHERE id = p_animal_id;

  -- Borrado del objeto VIEJO -- solo si había uno y es distinto del nuevo.
  -- Best-effort: envuelto en su propio bloque para que un fallo acá (objeto
  -- ya no existe, problema transitorio de Storage) nunca revierta el UPDATE
  -- de arriba, que ya es el cambio que realmente importa confirmar. Mismo
  -- criterio que limpiarFotoHuerfana() del lado del cliente -- un huérfano
  -- ocasional es aceptable, perder el reemplazo ya confirmado no.
  IF v_foto_path_anterior IS NOT NULL AND v_foto_path_anterior <> p_nuevo_foto_path THEN
    BEGIN
      DELETE FROM storage.objects
       WHERE bucket_id = 'paciente-fotos' AND name = v_foto_path_anterior;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_foto_paciente(uuid, text) TO authenticated;

-- No se crea ninguna policy nueva de UPDATE/DELETE sobre storage.objects.
-- No se toca animales_select/insert/update ni ninguna policy de Storage ya
-- existente (paciente_fotos_insert/select/delete_propio_no_referenciado).

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar con sesiones reales de cada rol (no service_role). Storage no se
-- escribe con INSERT SQL directo -- subir la foto de prueba real desde el
-- cliente autenticado antes de cada caso que la necesite.
--
-- BEGIN;
--
--   -- (Paso 2 ya aplicado más arriba en esta misma sesión/transacción)
--
--   -- Caso 1 -- ADMINISTRADOR, Paciente de prueba con foto_path A (subida
--   -- de antemano), sube una foto B y llama
--   -- actualizar_foto_paciente(<id>, '<establecimiento>/<B>.jpg') →
--   -- DEBE PASAR. Confirmar: animales.foto_path = B; storage.objects ya NO
--   -- tiene el objeto A.
--
--   -- Caso 2 -- PROFESIONAL, mismo caso → DEBE PASAR.
--
--   -- Caso 3 -- OPERADOR_CAMPO intenta reemplazar la foto de un Paciente de
--   -- su propio establecimiento → DEBE FALLAR con "Sin permiso para editar
--   -- la foto de este Paciente".
--
--   -- Caso 4 -- cualquier rol pasa un path cuyo primer segmento es un
--   -- establecimiento DISTINTO al del Paciente (aunque tenga acceso a
--   -- ambos) → DEBE FALLAR con "La foto nueva no pertenece al
--   -- establecimiento de este Paciente".
--
--   -- Caso 5 -- Paciente de prueba SIN foto previa (foto_path IS NULL),
--   -- agregar una foto por primera vez vía esta RPC → DEBE PASAR sin error
--   -- aunque no haya nada que borrar.
--
--   -- Caso 6 -- p_animal_id inexistente → DEBE FALLAR con "Paciente no
--   -- encontrado".
--
-- ROLLBACK; -- no dejar registros/objetos de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'actualizar_foto_paciente';
--   -- prosecdef debe ser true (SECURITY DEFINER activo)
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'actualizar_foto_paciente';
--   -- authenticated debe tener EXECUTE

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Seguro en cualquier momento -- la función no se usa todavía desde ningún
-- otro lado del sistema si se revierte antes de desplegar el frontend de
-- BIT-13:
--   DROP FUNCTION IF EXISTS actualizar_foto_paciente(uuid, text);
