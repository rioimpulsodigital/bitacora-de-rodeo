-- BIT-13 — Foto principal de Paciente: reemplazo seguro (v2 -- corrige
-- 2 hallazgos de KLIAM sobre la v1)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── QUÉ CAMBIÓ RESPECTO A LA V1 (BIT-13-02) ──────────────────────────────
--
-- Hallazgo 1 -- la v1 hacía `DELETE FROM storage.objects ...` directo desde
-- la función. La documentación oficial vigente de Supabase trata las
-- tablas del schema `storage` como METADATA -- borrar la fila de
-- `storage.objects` a mano no garantiza que se borre el objeto físico del
-- lado del proveedor de almacenamiento (deja basura real, no solo una fila
-- huérfana). Las mutaciones de objetos (subir/mover/borrar) deben pasar
-- por la Storage API (`supabase.storage.from(...).remove(...)`), nunca por
-- SQL directo sobre sus tablas de metadata.
--
-- Corrección: la RPC deja de tocar `storage.objects` -- SOLO valida acceso
-- y hace el UPDATE de `animales.foto_path` (lo único que de verdad necesita
-- ser atómico/validado server-side). Devuelve el path VIEJO (o NULL) para
-- que el CLIENTE lo borre después, con la Storage API real, desde
-- `reemplazarFotoPaciente()` (rodeo/js/modules/animales/services.js). Para
-- que ese borrado funcione incluso cuando la foto vieja la subió OTRO
-- usuario, se agrega una policy de Storage nueva y acotada (ver PASO 2b) --
-- en vez de ensanchar la función para que haga algo que no le corresponde.
--
-- Hallazgo 2 -- la v1 otorgaba EXECUTE a `authenticated` pero nunca
-- revocaba el EXECUTE que Postgres concede a PUBLIC por defecto en toda
-- función nueva (mecanismo real y documentado, al revés que las tablas --
-- ver hallazgo ya registrado en BIT-68 para las funciones SECURITY DEFINER
-- existentes). Sin el REVOKE explícito, `anon` también podía ejecutarla.
--
-- Corrección: `REVOKE ALL ... FROM PUBLIC` antes del `GRANT ... TO
-- authenticated`. Además, `SET search_path = ''` (vacío, no solo fijo a
-- `public`) con toda referencia calificada por schema -- recomendación
-- vigente de Supabase para funciones SECURITY DEFINER. No resuelve BIT-68
-- (esa deuda sigue siendo de las 3 funciones históricas, fuera de alcance
-- de BIT-13) -- esta función simplemente nace sin repetir el mismo problema.
--
-- ─── CONTEXTO (sin cambios respecto a la v1) ──────────────────────────────
-- BIT-50 ya dejó la columna `animales.foto_path` y el bucket privado
-- `paciente-fotos` con policies de INSERT/SELECT/DELETE sobre
-- `storage.objects`. BIT-13 no crea tabla ni bucket nuevo.
--
-- ─── POR QUÉ SIGUE HACIENDO FALTA UNA RPC (y no alcanza con la Storage API
--     sola) ────────────────────────────────────────────────────────────
-- El UPDATE de `animales.foto_path` sigue necesitando el mismo control de
-- acceso que ya exige `animales_update` (ADMINISTRADOR/PROFESIONAL, BIT-11)
-- más la validación de que el path nuevo pertenece al establecimiento real
-- de ESE Paciente -- ninguna de las dos cosas puede expresarse en una
-- policy de Storage (que no conoce la tabla `animales`). La RPC hace
-- EXACTAMENTE eso y nada más: ni sube ni borra ningún objeto de Storage.
--
-- ─── FLUJO COMPLETO DEL CLIENTE (reemplazarFotoPaciente) ──────────────────
-- 1) Sube la foto NUEVA a un path nuevo vía Storage API (nunca sobreescribe
--    la vieja) -- policy de INSERT ya existente, sin cambios.
-- 2) Llama a esta RPC con el id del Paciente y el path nuevo -- valida
--    acceso y hace el UPDATE; devuelve el path viejo (o NULL).
--    - Si la RPC falla: el swap NO se confirmó -- la foto vieja sigue
--      activa, la nueva queda huérfana y se limpia con la policy de DELETE
--      YA existente (`paciente_fotos_delete_propio_no_referenciado`, el
--      uploader actual borra su propio objeto no referenciado).
-- 3) Si la RPC devolvió un path viejo no nulo, el cliente intenta borrarlo
--    vía Storage API (`remove`) -- best-effort, con la policy nueva del
--    PASO 2b. Si falla, queda un huérfano documentado: la foto activa del
--    Paciente YA es la nueva (correcta), nunca se revierte nada por este
--    fallo de limpieza.
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Requiere migration-BIT-50-catastro-equinos.sql y
-- migration-BIT-50-storage-fotos.sql ya aplicadas (confirmado: BIT-52/
-- BIT-53 las validaron en Producción). Si esta es la primera aplicación de
-- BIT-13 en este entorno, ignorar cualquier referencia a una v1 ya
-- aplicada -- este archivo reemplaza por completo al que se compartió
-- antes, nunca se llegó a aplicar ninguna versión anterior.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'actualizar_foto_paciente';
-- Debe dar 0 filas (o 1, si quedó de un intento previo de la v1 -- en ese
-- caso el PASO 2 la reemplaza igual vía CREATE OR REPLACE, pero reportar
-- antes de continuar si aparece).

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'animales' AND column_name = 'foto_path';
-- Debe existir (text) -- confirma que BIT-50 ya corrió.

SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'animales' AND cmd = 'UPDATE';
-- Confirmar que animales_update sigue siendo
-- tiene_acceso_establecimiento(establecimiento_actual_id) AND
-- get_mi_rol() IN ('ADMINISTRADOR','PROFESIONAL') (BIT-11). Si cambió,
-- ajustar el chequeo de rol del PASO 2 antes de aplicarlo.

SELECT proname, pronamespace::regnamespace AS schema
FROM pg_proc WHERE proname IN ('tiene_acceso_establecimiento', 'get_mi_rol');
-- Deben existir las 2, ambas en schema `public` (confirmado en BIT-46) --
-- el PASO 2 las referencia como public.tiene_acceso_establecimiento() y
-- public.get_mi_rol() porque search_path queda vacío.

SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname ILIKE '%paciente_fotos%';
-- Deben aparecer exactamente las 3 de BIT-50 (insert/select/
-- delete_propio_no_referenciado). Si ya existe algo llamado
-- "paciente_fotos_delete_reemplazo..." DETENERSE y reportar -- no pisarlo.

-- Si algo de esto no coincide con lo asumido acá: DETENERSE y reportar
-- antes de continuar -- no aplicar el Paso 2/2b a ciegas.

-- ── PASO 2 — RPC (idempotente vía CREATE OR REPLACE) ───────────────────────
-- SECURITY DEFINER: corre con privilegios del dueño de la función (mismo
-- mecanismo ya usado por crear_persona_con_establecimiento,
-- migration-BIT-11-fix-personas-rls.sql). `search_path = ''` (vacío, no
-- solo fijo) + toda referencia calificada por schema -- patrón endurecido
-- recomendado por Supabase para SECURITY DEFINER; `pg_catalog` queda
-- implícitamente disponible siempre (split_part/btrim no necesitan
-- calificación, pero se califican de todos modos acá por defensa en
-- profundidad explícita).
--
-- ÚNICA responsabilidad de esta función: validar acceso + actualizar
-- animales.foto_path. NO toca storage.objects -- ver cabecera del archivo.

CREATE OR REPLACE FUNCTION public.actualizar_foto_paciente(
  p_animal_id uuid,
  p_nuevo_foto_path text
)
RETURNS text  -- el path de la foto ANTERIOR (o NULL) -- el cliente la
              -- borra después, vía Storage API, con la policy del PASO 2b.
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  IF v_establecimiento_id IS NULL OR NOT public.tiene_acceso_establecimiento(v_establecimiento_id) THEN
    RAISE EXCEPTION 'Sin acceso al establecimiento del Paciente' USING ERRCODE = '42501';
  END IF;

  IF public.get_mi_rol() NOT IN ('ADMINISTRADOR', 'PROFESIONAL') THEN
    RAISE EXCEPTION 'Sin permiso para editar la foto de este Paciente' USING ERRCODE = '42501';
  END IF;

  IF p_nuevo_foto_path IS NULL OR pg_catalog.btrim(p_nuevo_foto_path) = '' THEN
    RAISE EXCEPTION 'Falta la referencia a la foto nueva' USING ERRCODE = '22023';
  END IF;

  -- Defensa en profundidad -- "no mezclar imágenes entre establecimientos"
  -- (criterio explícito de BIT-13): el primer segmento del path debe ser
  -- el mismo establecimiento_actual_id de ESTE Paciente, no solo "alguno
  -- al que el usuario tenga acceso" (eso ya lo exige la policy de INSERT
  -- al subir, pero no garantiza que coincida con el Paciente puntual).
  IF pg_catalog.split_part(p_nuevo_foto_path, '/', 1) <> v_establecimiento_id::text THEN
    RAISE EXCEPTION 'La foto nueva no pertenece al establecimiento de este Paciente' USING ERRCODE = '42501';
  END IF;

  UPDATE public.animales
     SET foto_path = p_nuevo_foto_path
   WHERE id = p_animal_id;

  RETURN v_foto_path_anterior;
END;
$$;

-- Hallazgo 2 (KLIAM): sin este REVOKE explícito, PUBLIC (y por lo tanto
-- `anon`) conserva el EXECUTE que Postgres otorga por defecto a toda
-- función nueva. El orden entre REVOKE y GRANT no importa (son ACL
-- distintas), pero el REVOKE es tan obligatorio como el GRANT.
REVOKE ALL ON FUNCTION public.actualizar_foto_paciente(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_foto_paciente(uuid, text) TO authenticated;
-- Sin GRANT a service_role: este proyecto no lo usa desde el frontend
-- (BIT-03, BIT-59) y esta función no tiene ninguna automatización de
-- backend que lo necesite.

-- ── PASO 2b — POLICY NUEVA Y ACOTADA sobre storage.objects ─────────────────
-- Por qué hace falta: la policy de DELETE ya existente
-- (`paciente_fotos_delete_propio_no_referenciado`, migration-BIT-50-
-- storage-fotos.sql) exige `owner = auth.uid()` A PROPÓSITO -- protege
-- huérfanos de alta fallida, siempre borrados por su propio uploader. El
-- reemplazo de foto NO es ese caso: la foto vieja puede haberla subido
-- OTRO usuario (ej. un OPERADOR_CAMPO la subió desde Catastro; la
-- reemplaza después un ADMINISTRADOR distinto) -- esa policy no alcanza, y
-- ensancharla rompería la protección que ya tiene para su propio caso.
--
-- Esta policy nueva es un permiso ADICIONAL (PERMISSIVE, se combina con OR
-- junto a la ya existente -- mismo comportamiento de Postgres ya
-- documentado en BIT-63), acotada por separado:
--   ¿Quién puede borrar? Solo ADMINISTRADOR/PROFESIONAL -- los mismos
--   roles que ya pueden editar el Paciente (animales_update, BIT-11) --
--   nunca OPERADOR_CAMPO, nunca `anon`, nunca `PUBLIC`.
--   ¿Dónde? Solo dentro de 'paciente-fotos', solo en un establecimiento al
--   que ese usuario tiene acceso -- mismo tiene_acceso_establecimiento()
--   que protege el resto del dominio.
--   ¿Qué objeto puede borrar? Solo uno que NINGÚN Paciente referencia ya
--   (NOT EXISTS contra animales.foto_path) -- una foto todavía activa
--   sigue protegida sin excepción, igual que con la policy original.
--   ¿Por qué es seguro que no haya condición de carrera? El cliente llama
--   a esta policy DESPUÉS de que la RPC ya confirmó el UPDATE de
--   animales.foto_path al path nuevo -- en ese momento el path viejo ya
--   dejó de estar referenciado, así que el NOT EXISTS ya es verdadero
--   cuando corresponde.
--   ¿Se amplía lectura/escritura de otros objetos? No -- solo agrega
--   DELETE, solo sobre 'paciente-fotos', solo sobre objetos no
--   referenciados. No se toca el bucket (sigue privado) ni ninguna otra
--   policy.

CREATE POLICY "paciente_fotos_delete_reemplazo_rol_establecimiento"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'paciente-fotos'
  AND get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.animales a WHERE a.foto_path = storage.objects.name
  )
);

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar con sesiones reales de cada rol (no service_role). La subida/
-- borrado reales de Storage se prueban desde el cliente autenticado, no en
-- SQL puro -- acá se valida la RPC y, para los casos de borrado, se
-- confirma el resultado leyendo storage.objects (solo lectura).
--
-- BEGIN;
--
--   -- (Paso 2/2b ya aplicados más arriba en esta misma sesión/transacción)
--
--   -- Caso 1 -- ADMINISTRADOR, Paciente con foto_path A, sube una foto B
--   -- y llama actualizar_foto_paciente(<id>, '<establecimiento>/<B>.jpg')
--   -- → DEBE PASAR y devolver '<establecimiento>/<A>.jpg'. Confirmar:
--   -- animales.foto_path = B.
--
--   -- Caso 2 -- PROFESIONAL, mismo caso → DEBE PASAR.
--
--   -- Caso 3 -- OPERADOR_CAMPO intenta reemplazar la foto de un Paciente
--   -- de su propio establecimiento → DEBE FALLAR con "Sin permiso para
--   -- editar la foto de este Paciente".
--
--   -- Caso 4 -- cualquier rol pasa un path cuyo primer segmento es un
--   -- establecimiento DISTINTO al del Paciente (aunque tenga acceso a
--   -- ambos) → DEBE FALLAR con "La foto nueva no pertenece al
--   -- establecimiento de este Paciente".
--
--   -- Caso 5 -- Paciente SIN foto previa (foto_path IS NULL), agregar una
--   -- foto por primera vez vía esta RPC → DEBE PASAR y devolver NULL.
--
--   -- Caso 6 -- p_animal_id inexistente → DEBE FALLAR con "Paciente no
--   -- encontrado".
--
--   -- Caso 7 -- reemplazo de una foto que ORIGINALMENTE subió OTRO
--   -- usuario autorizado (ej. foto A subida por OPERADOR_CAMPO vía
--   -- Catastro; la reemplaza un ADMINISTRADOR distinto): después del Caso
--   -- 1/2, el ADMINISTRADOR intenta `remove()` sobre el path A vía Storage
--   -- API (fuera de SQL, desde el cliente) → DEBE PASAR por la policy
--   -- nueva del PASO 2b (owner de A ≠ auth.uid() del Administrador, así
--   -- que la policy vieja no alcanzaría; la nueva sí).
--
--   -- Caso 8 (privilegios efectivos de la función, no solo las sentencias)
--   -- -- confirmar con las queries del PASO de verificación de abajo,
--   -- dentro de esta misma transacción o después.
--
-- ROLLBACK; -- no dejar registros/objetos de prueba en Producción

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname = 'actualizar_foto_paciente';
--   -- prosecdef debe ser true; proconfig debe incluir 'search_path='
--   -- (vacío).
--
--   -- Privilegios EFECTIVOS (no solo lo escrito) -- debe aparecer
--   -- ÚNICAMENTE 'authenticated' con EXECUTE; CUALQUIER fila con grantee
--   -- 'PUBLIC' significa que el REVOKE no tomó efecto -- DETENERSE y
--   -- reportar si aparece:
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'actualizar_foto_paciente';
--
--   -- Confirmación directa con funciones de privilegio (más explícito
--   -- todavía que leer el catálogo):
--   SELECT
--     has_function_privilege('anon', 'public.actualizar_foto_paciente(uuid, text)', 'EXECUTE') AS anon_puede,
--     has_function_privilege('authenticated', 'public.actualizar_foto_paciente(uuid, text)', 'EXECUTE') AS authenticated_puede;
--   -- anon_puede debe ser false; authenticated_puede debe ser true.
--
--   SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'paciente_fotos_%';
--   -- Deben existir exactamente 4 ahora (insert/select/
--   -- delete_propio_no_referenciado/delete_reemplazo_rol_establecimiento).

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
--   DROP POLICY IF EXISTS "paciente_fotos_delete_reemplazo_rol_establecimiento" ON storage.objects;
--   DROP FUNCTION IF EXISTS public.actualizar_foto_paciente(uuid, text);
