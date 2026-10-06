-- BIT-61 — Migración FINAL: Jornada por establecimiento + capacidad
-- habilitable por Usuario × Establecimiento
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere: (1) correr primero
-- diagnostico-BIT-61-final.sql completo y confirmar que nada contradice lo
-- asumido acá; (2) autorización explícita de Bren/KLIAM sobre este SQL y
-- los resultados reales del diagnóstico.
--
-- Reemplaza a las dos parejas de archivos preparadas en rondas anteriores
-- (diagnostico/migration-BIT-61-establecimiento-jornada.sql y
-- diagnostico/migration-BIT-61-capacidad-jornada.sql, retiradas del repo)
-- -- este es el único SQL final a revisar y, eventualmente, aplicar.
--
-- ─── REGLAS CONFIRMADAS QUE IMPLEMENTA ESTE ARCHIVO ──────────────────────
-- 1. Una Jornada pertenece a un único establecimiento.
-- 2. Jornada se habilita por Usuario × Establecimiento.
-- 3. Para iniciar Jornada se exige permiso activo.
-- 4. Si el permiso se revoca después de iniciada, la persona conserva la
--    capacidad de cerrar esa Jornada mediante SALIDA.
-- 5. Transitorio -- ver relación con BIT-56 al final del archivo.
--
-- ─── POR QUÉ NO SE REPLICA EL PATRÓN DE CATASTRO (BIT-50) ────────────────
-- Catastro Equino vive como una columna booleana en `establecimientos` --
-- un valor por establecimiento, igual para todos los usuarios, y su propia
-- migración documenta que "no es una barrera de base de datos... es una
-- capacidad de producto" porque la operación que protege (crear un
-- Paciente) ya estaba permitida igual por la pantalla normal de Pacientes.
-- Jornada es distinta en dos sentidos: (a) necesita variar POR USUARIO
-- dentro del mismo establecimiento, cosa que una columna de
-- `establecimientos` no puede expresar; (b) no existe ninguna otra vía ya
-- abierta para crear/cerrar una Jornada, así que acá el backend SÍ tiene
-- que exigirlo, no alcanza con ocultar el menú.
--
-- ─── DATOS EXISTENTES — NO SE INFIERE NI SE BORRA NADA ───────────────────
-- Si el diagnóstico (A2/A3) confirma Jornadas reales ya cargadas: quedan
-- con establecimiento_id = NULL tal cual, documentadas. NO se infiere por
-- fecha, por el selector activo de ese momento, ni por ningún registro
-- relacionado. Backfill manual validado por Bren/KLIAM/Etel es la única
-- estrategia seria, y es una decisión de ESE momento, no de esta migración.

-- ── PASO 1 — DIAGNÓSTICO (obligatorio, archivo aparte) ─────────────────────
-- Correr diagnostico-BIT-61-final.sql completo ANTES de seguir. En
-- particular: A2/A3 (filas existentes de jornadas), A5 (texto real de
-- jornadas_insert/update), A6 (triggers existentes), A7 (si BIT-49c está
-- aplicada), B1 (tipo de establecimientos.id), B2-B5 (estructura/RLS/grants
-- reales de establecimientos_usuarios), B6 (si Etel ya tiene fila para
-- Fundación Dolly).

-- ════════════════════════════════════════════════════════════════════════
-- PASO 2 — CAMBIO
-- ════════════════════════════════════════════════════════════════════════

-- ── 2a) jornadas.establecimiento_id (idempotente) ──────────────────────────
-- uuid, FK a establecimientos(id), sin ON DELETE especial (NO ACTION --
-- mismo patrón que atenciones_clinicas.establecimiento_id, BIT-11, el único
-- precedente real en el repo). NULLABLE a nivel de columna por las
-- Jornadas históricas del diagnóstico A2/A3 -- la obligatoriedad real para
-- Jornadas NUEVAS la impone la policy del Paso 2d (WITH CHECK), no un
-- NOT NULL que rompería la migración si hay filas existentes.
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS establecimiento_id uuid REFERENCES public.establecimientos(id);

CREATE INDEX IF NOT EXISTS idx_jornadas_establecimiento_id ON public.jornadas(establecimiento_id);

COMMENT ON COLUMN public.jornadas.establecimiento_id IS
  'BIT-61: establecimiento al que pertenece la Jornada (el activo al presionar LLEGADA). NULL en Jornadas históricas anteriores a esta migración, nunca inferido. Inmutable después de creada -- ver trigger jornadas_bloquear_cambio_establecimiento.';

-- ── 2b) establecimientos_usuarios.jornada_habilitada (idempotente) ─────────
-- DEFAULT false (deny by default): ninguna fila existente queda habilitada
-- automáticamente -- se elige así a propósito, para no habilitar Jornada a
-- todo el mundo de golpe. Si se quisiera otro default, debería justificarse
-- explícitamente; no se encontró ninguna razón para apartarse de deny by
-- default acá.
ALTER TABLE public.establecimientos_usuarios
  ADD COLUMN IF NOT EXISTS jornada_habilitada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establecimientos_usuarios.jornada_habilitada IS
  'BIT-61 (transitorio -- ver BIT-56): true = este usuario puede operar Jornada (LLEGADA/SALIDA) en este establecimiento. Default false (deny by default). Reemplazar por el modelo genérico de capacidades de BIT-56 cuando exista.';

-- ── 2c) Trigger: establecimiento_id inmutable después de creada ───────────
-- Mecanismo ÚNICO y universal -- no depende de si migration-BIT-49c está
-- aplicada o no (a diferencia de una restricción solo por GRANT de
-- columna, que sí dependería de eso). Bloquea el cambio al nivel más bajo
-- posible, para cualquier UPDATE que llegue por cualquier vía (API normal,
-- RPC futura, SQL directo de un rol no admin) -- solo un superusuario
-- modificando el propio trigger podría saltarlo.
CREATE OR REPLACE FUNCTION public.jornadas_bloquear_cambio_establecimiento()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
    RAISE EXCEPTION 'El establecimiento de una Jornada no se puede modificar después de creada.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_jornadas_establecimiento_inmutable ON public.jornadas;
CREATE TRIGGER trg_jornadas_establecimiento_inmutable
  BEFORE UPDATE ON public.jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.jornadas_bloquear_cambio_establecimiento();

-- ── 2d) Función tiene_jornada_habilitada() ──────────────────────────────────
-- Mismo patrón real de autorización ya usado en el proyecto
-- (tiene_acceso_establecimiento, BIT-04): SECURITY DEFINER, search_path
-- fijo, REVOKE ALL FROM PUBLIC + REVOKE de anon + GRANT mínimo a
-- authenticated. Bypass is_admin() -- un ADMINISTRADOR siempre puede
-- operar Jornada donde tenga acceso, igual que el resto del sistema. Para
-- los demás roles, exige usuario autenticado real (auth.uid()) y una fila
-- en establecimientos_usuarios con jornada_habilitada = true para ese
-- perfil+establecimiento exactos -- valida usuario, establecimiento y la
-- relación activa Usuario × Establecimiento en una sola condición EXISTS.
CREATE OR REPLACE FUNCTION public.tiene_jornada_habilitada(p_establecimiento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_establecimiento_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM establecimientos_usuarios eu
    WHERE eu.perfil_id = auth.uid()
      AND eu.establecimiento_id = p_establecimiento_id
      AND eu.jornada_habilitada = true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.tiene_jornada_habilitada(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tiene_jornada_habilitada(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tiene_jornada_habilitada(uuid) TO authenticated;

-- ── 2e) Policy jornadas_insert -- exige las 3 condiciones simultáneas ──────
-- Reconstrucción a partir de lo documentado en BIT-46/49 (auth.uid() =
-- profesional_id) -- NO es el texto confirmado por pg_policies del Paso 1
-- (A5). ADAPTAR esta sentencia al resultado real si difiere, mismo
-- criterio que usó BIT-49 en su momento para jornadas_select.
DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
CREATE POLICY jornadas_insert ON public.jornadas
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.uid() = profesional_id
    AND establecimiento_id IS NOT NULL
    AND tiene_acceso_establecimiento(establecimiento_id)
    AND tiene_jornada_habilitada(establecimiento_id)
  );
-- jornadas_update NO se toca: el cierre (SALIDA) no queda condicionado a
-- que jornada_habilitada siga activa (regla 4 confirmada) -- la única
-- protección nueva sobre UPDATE es el trigger del Paso 2c, que no depende
-- de esta policy. jornadas_select tampoco se toca.

-- ── 2f) GRANT -- elegir SOLO UNA de las dos opciones según el Paso 1 (A7) ──

-- OPCIÓN A -- si el diagnóstico (A7) confirmó que migration-BIT-49c SÍ está
-- aplicada (authenticated con GRANT por columna, no por tabla completa):
--   GRANT INSERT (profesional_id, establecimiento_id, fecha, hora_llegada, hora_salida, notas)
--     ON public.jornadas TO authenticated;
--   -- UPDATE se deja EXACTAMENTE como quedó en BIT-49c (fecha, hora_llegada,
--   -- hora_salida, notas) -- NO agregar establecimiento_id ahí. El trigger
--   -- del Paso 2c ya lo protege de todos modos; esto es una segunda capa.

-- OPCIÓN B -- si el diagnóstico (A7/A8) confirmó que BIT-49c NO está
-- aplicada (authenticated sigue con INSERT/UPDATE a nivel de tabla
-- completa): no hace falta ningún GRANT nuevo -- el GRANT de tabla
-- completa ya cubre establecimiento_id en el INSERT, y el trigger del Paso
-- 2c protege la inmutabilidad en el UPDATE sin depender de ningún GRANT.

-- No se otorga `anon` en ningún caso. No se amplía ningún permiso existente
-- por conveniencia -- estándar preventivo BIT-59 aplicado desde ya.

-- ── 2g) Habilitar a Etel en Fundación Dolly (única vez, por nombre) ───────
-- El nombre se usa SOLO acá, como dato semilla puntual -- la aplicación
-- nunca decide por nombre. Requiere que el Paso 1 (B6) haya confirmado que
-- la fila de establecimientos_usuarios ya existe; si no, vincularla es un
-- prerequisito aparte, no algo que esta migración deba asumir.
UPDATE public.establecimientos_usuarios eu
SET jornada_habilitada = true
FROM perfiles p, establecimientos e
WHERE eu.perfil_id = p.id
  AND eu.establecimiento_id = e.id
  AND p.nombre = 'Etel Salinas'
  AND e.nombre = 'Fundación Dolly';

-- ════════════════════════════════════════════════════════════════════════
-- PASO 3 — VALIDACIÓN EN TRANSACCIÓN (OBLIGATORIO, antes de comprometer)
-- ════════════════════════════════════════════════════════════════════════
-- Ejecutar como los roles reales correspondientes (no service role).
--
-- BEGIN;
--
--   -- Caso 1 -- acceso permitido: usuario con jornada_habilitada=true en un
--   -- establecimiento al que tiene acceso → INSERT de jornada DEBE PASAR:
--   -- INSERT INTO jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
--   -- VALUES (auth.uid(), '<establecimiento_habilitado_id>', current_date, '08:00:00');
--
--   -- Caso 2 -- establecimiento sin acceso real (tiene_acceso_establecimiento
--   -- = false) → DEBE FALLAR:
--   -- INSERT ... VALUES (auth.uid(), '<establecimiento_sin_acceso_id>', current_date, '08:00:00');
--
--   -- Caso 3 -- Jornada NO habilitada: acceso al establecimiento sí, pero
--   -- jornada_habilitada=false o sin fila → DEBE FALLAR:
--   -- INSERT ... VALUES (auth.uid(), '<establecimiento_sin_jornada_habilitada_id>', current_date, '08:00:00');
--
--   -- Caso 4 -- Jornada SÍ habilitada → DEBE PASAR (repetir Caso 1 con otro
--   -- establecimiento si hay más de uno habilitado, para variar el dato).
--
--   -- Caso 5 -- ADMINISTRADOR, cualquier establecimiento con acceso, SIN
--   -- fila de jornada_habilitada → DEBE PASAR (bypass is_admin() en
--   -- tiene_jornada_habilitada()).
--
--   -- Caso 6 -- cerrar Jornada después de revocar el permiso: abrir una
--   -- Jornada (Caso 1), después UPDATE establecimientos_usuarios SET
--   -- jornada_habilitada=false para ese usuario+establecimiento, y recién
--   -- ahí intentar UPDATE jornadas SET hora_salida=... sobre esa misma
--   -- Jornada → DEBE PASAR igual (jornadas_update no se tocó).
--
--   -- Caso 7 -- intento de cambiar establecimiento_id de una Jornada ya
--   -- creada (propia) → DEBE FALLAR por el trigger:
--   -- UPDATE jornadas SET establecimiento_id = '<otro_id>' WHERE id = '<jornada_propia_id>';
--
--   -- Caso 8 -- UPDATE normal de fecha/hora_salida/notas (sin tocar
--   -- establecimiento_id) → DEBE SEGUIR FUNCIONANDO igual que antes.
--
-- ROLLBACK; -- no dejar registros de prueba en Producción

-- ════════════════════════════════════════════════════════════════════════
-- PASO 4 — VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA)
-- ════════════════════════════════════════════════════════════════════════
--   -- Estructura:
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jornadas' AND column_name='establecimiento_id';
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='establecimientos_usuarios' AND column_name='jornada_habilitada';
--   SELECT indexname FROM pg_indexes WHERE tablename='jornadas' AND indexname='idx_jornadas_establecimiento_id';
--   -- FK:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.jornadas'::regclass AND contype='f';
--   -- Trigger:
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid='public.jornadas'::regclass AND tgname='trg_jornadas_establecimiento_inmutable';
--   -- Función y grants:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname='tiene_jornada_habilitada';
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name='tiene_jornada_habilitada';
--   -- authenticated debe tener EXECUTE; anon NO debe aparecer.
--   -- Policy:
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='jornadas' AND policyname='jornadas_insert';
--   -- Datos intactos (nada se borró ni se sobrescribió fuera de lo esperado):
--   SELECT count(*) FROM jornadas; -- debe coincidir con el conteo del diagnóstico A2
--   SELECT count(*) FROM jornadas WHERE establecimiento_id IS NOT NULL; -- debe seguir en 0 si A2 dio 0 jornadas
--   -- Habilitación semilla:
--   SELECT eu.*, p.nombre, e.nombre FROM establecimientos_usuarios eu
--   JOIN perfiles p ON p.id=eu.perfil_id JOIN establecimientos e ON e.id=eu.establecimiento_id
--   WHERE eu.jornada_habilitada = true;
--   -- Esperado: solo Etel + Fundación Dolly en true, el resto en false.

-- ════════════════════════════════════════════════════════════════════════
-- PASO 5 — ROLLBACK (solo recuperación; requiere autorización explícita;
-- NO se ejecuta automáticamente)
-- ════════════════════════════════════════════════════════════════════════
--   -- Solo si ninguna Jornada real llegó a usar establecimiento_id:
--   SELECT count(*) FROM jornadas WHERE establecimiento_id IS NOT NULL; -- debe dar 0
--
--   DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
--   -- Recrear jornadas_insert con el texto EXACTO que tenía antes de esta
--   -- migración (tomado del Paso 1/A5 de ESTA migración, guardado antes de
--   -- aplicar -- no inventar un texto de memoria para el rollback).
--   DROP TRIGGER IF EXISTS trg_jornadas_establecimiento_inmutable ON public.jornadas;
--   DROP FUNCTION IF EXISTS public.jornadas_bloquear_cambio_establecimiento();
--   DROP FUNCTION IF EXISTS public.tiene_jornada_habilitada(uuid);
--   DROP INDEX IF EXISTS idx_jornadas_establecimiento_id;
--   ALTER TABLE public.jornadas DROP COLUMN IF EXISTS establecimiento_id;
--   ALTER TABLE public.establecimientos_usuarios DROP COLUMN IF EXISTS jornada_habilitada;

-- ─── RELACIÓN CON BIT-56 ──────────────────────────────────────────────────
-- Todo lo de esta migración (jornada_habilitada, tiene_jornada_habilitada())
-- es explícitamente transitorio. BIT-56 va a diseñar el modelo genérico de
-- módulos/capacidades por Usuario × Establecimiento (y eventualmente
-- Organización). Migrar esta única columna booleana a ese modelo futuro es
-- una operación acotada: por cada fila con jornada_habilitada = true,
-- insertar la fila equivalente en el modelo genérico nuevo, y recién ahí
-- retirar esta columna y esta función, reemplazando su único call site (el
-- WITH CHECK de jornadas_insert) por la función genérica que defina BIT-56.
-- No se hardcodea ningún nombre de usuario ni de establecimiento en código
-- -- todo por id real; el nombre aparece solo en el Paso 2g, como dato
-- semilla puntual de esta aplicación concreta.
