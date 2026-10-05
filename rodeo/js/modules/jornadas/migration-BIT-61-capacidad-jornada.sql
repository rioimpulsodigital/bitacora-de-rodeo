-- BIT-61 — Capacidad "Jornada habilitada" por Usuario × Establecimiento
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere: (1) correr primero
-- diagnostico-BIT-61-capacidad-jornada.sql; (2) autorización explícita de
-- Bren/KLIAM; (3) aplicarse DESPUÉS de migration-BIT-61-establecimiento-
-- jornada.sql (esta migración referencia establecimiento_id en el WITH
-- CHECK de jornadas_insert, que esa otra migración crea).
--
-- ─── REGLA DE DOMINIO ─────────────────────────────────────────────────────
-- Jornada NO es un módulo global por usuario ni una capacidad global por
-- establecimiento (a diferencia de Catastro Equino, BIT-50 -- ver
-- comparación abajo). Se habilita de forma granular por
-- USUARIO × ESTABLECIMIENTO: Etel puede tener Jornada en Fundación Dolly y
-- no tenerla en Establecimiento Fernández; otro usuario puede no tenerla en
-- ningún lado.
--
-- ─── POR QUÉ NO SE REPLICA EL PATRÓN EXACTO DE CATASTRO ──────────────────
-- Catastro Equino (migration-BIT-50-capacidad-catastro-equino.sql) vive
-- como una columna booleana en `establecimientos` -- UN valor por
-- establecimiento, igual para todos los usuarios con acceso a él. Esa
-- columna no puede expresar "distinto por usuario dentro del mismo
-- establecimiento": estructuralmente no alcanza para lo que pide BIT-61.
-- Catastro también documenta explícitamente que su capacidad "no es una
-- barrera de base de datos... es una capacidad de producto, no de
-- seguridad" -- porque la operación real que protege (crear un Paciente)
-- ya estaba permitida igual por la pantalla normal de Pacientes. Jornada es
-- distinta: no existe ninguna otra vía ya abierta para crear/cerrar una
-- Jornada, así que acá SÍ hace falta que el backend la haga cumplir, no
-- solo el frontend.
--
-- ─── DISEÑO ELEGIDO (TRANSITORIO -- ver relación con BIT-56 al final) ────
-- Una columna booleana en `establecimientos_usuarios`, la tabla que YA es,
-- exactamente, la relación Usuario × Establecimiento (PK compuesta
-- perfil_id + establecimiento_id, confirmada en BIT-50). No se crea
-- ninguna tabla de capacidades genérica nueva -- se reutiliza la relación
-- existente, con un único valor nuevo. Se descartó deliberadamente agregar
-- la columna a `establecimientos` (no resuelve Usuario × Establecimiento) y
-- se descartó construir ya una tabla de capacidades genérica (eso es
-- exactamente el trabajo de BIT-56 -- adelantarlo ahora sería la
-- "arquitectura paralela" que la tarea pidió evitar).
--
-- ─── FUNCIÓN DE AUTORIZACIÓN ──────────────────────────────────────────────
-- `tiene_jornada_habilitada(p_establecimiento_id uuid)`: mismo estilo que
-- `tiene_acceso_establecimiento()` -- SECURITY DEFINER, search_path fijo,
-- bypass para is_admin() (un ADMINISTRADOR puede operar Jornada en
-- cualquier establecimiento al que tenga acceso, igual que todo el resto
-- del sistema). Para los demás roles, exige una fila en
-- establecimientos_usuarios con jornada_habilitada = true para ese
-- perfil+establecimiento exactos.
--
-- ─── ALCANCE DE LA PROTECCIÓN ─────────────────────────────────────────────
-- Frontend: oculta el ítem "Jornadas" del sidebar/menú ☰ si no está
-- habilitado para el establecimiento activo; la ruta #jornadas re-valida
-- igual (no alcanza con ocultar el menú, mismo criterio ya usado por
-- Catastro). Backend: el WITH CHECK de jornadas_insert exige
-- tiene_jornada_habilitada(establecimiento_id) -- si alguien bordea la UI
-- con una llamada directa a la API, el INSERT es rechazado igual.
-- Deliberadamente NO se agrega el mismo chequeo a jornadas_update: una vez
-- que una Jornada fue abierta válidamente, su dueño siempre puede cerrarla
-- (poner hora_salida), aunque la capacidad se revoque después de abierta
-- -- lo contrario dejaría una Jornada abierta imposible de cerrar nunca
-- más. Se documenta como decisión explícita, no como descuido -- a
-- confirmar con Bren/KLIAM si se prefiere otro comportamiento.
--
-- ─── DATOS EXISTENTES ─────────────────────────────────────────────────────
-- DEFAULT false (deny by default): ninguna fila existente de
-- establecimientos_usuarios queda habilitada automáticamente. Hace falta
-- un UPDATE explícito por persona+establecimiento (ejemplo al final,
-- siguiendo el mismo patrón ya usado para Fundación Dolly/Catastro: nunca
-- se decide por nombre en el código, el nombre se usa UNA vez acá como
-- dato semilla puntual).
--
-- ─── RELACIÓN CON BIT-56 ──────────────────────────────────────────────────
-- Esto es EXPLÍCITAMENTE transitorio. BIT-56 va a diseñar el modelo
-- genérico de módulos/capacidades habilitados por Usuario × Establecimiento
-- (y eventualmente por Organización). Cuando eso exista, migrar esta única
-- columna booleana es trivial y acotado: por cada fila con
-- jornada_habilitada = true, insertar la fila equivalente en el modelo
-- genérico nuevo (p.ej. perfil_id/establecimiento_id/capacidad='jornada'),
-- y recién ahí retirar esta columna y `tiene_jornada_habilitada()`,
-- reemplazando su único call site (el WITH CHECK de jornadas_insert) por
-- la función genérica que defina BIT-56. No se hardcodea ningún nombre de
-- usuario ni de establecimiento en código -- todo por id real.

-- ── PASO 1 (OBLIGATORIO) ───────────────────────────────────────────────────
-- Correr diagnostico-BIT-61-capacidad-jornada.sql completo. Confirmar en
-- particular: columnas/PK reales de establecimientos_usuarios (punto 1/2),
-- su RLS/grants actuales (punto 3/4), y que Etel ya tiene fila para
-- Fundación Dolly (punto 7) antes de intentar habilitarla en el Paso 3.

-- ── PASO 2 — COLUMNA (idempotente, deny by default) ────────────────────────
ALTER TABLE public.establecimientos_usuarios
  ADD COLUMN IF NOT EXISTS jornada_habilitada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establecimientos_usuarios.jornada_habilitada IS
  'BIT-61 (transitorio -- ver BIT-56): true = este usuario puede operar Jornada (LLEGADA/SALIDA) en este establecimiento. Default false (deny by default). Reemplazar por el modelo genérico de capacidades de BIT-56 cuando exista.';

-- ── PASO 3 — FUNCIÓN DE AUTORIZACIÓN (idempotente vía CREATE OR REPLACE) ──
CREATE OR REPLACE FUNCTION public.tiene_jornada_habilitada(p_establecimiento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_establecimiento_id IS NULL THEN
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

-- ── PASO 4 — RLS: exigir la capacidad en el INSERT de jornadas ─────────────
-- Depende de que migration-BIT-61-establecimiento-jornada.sql ya se haya
-- aplicado (crea la columna establecimiento_id y la versión de
-- jornadas_insert que este PASO reemplaza de nuevo, agregando una
-- condición más). Si esa migración todavía no está aplicada: DETENERSE,
-- aplicar esa primero.
DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
CREATE POLICY jornadas_insert ON public.jornadas
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.uid() = profesional_id
    AND establecimiento_id IS NOT NULL
    AND tiene_acceso_establecimiento(establecimiento_id)
    AND tiene_jornada_habilitada(establecimiento_id)
  );

-- ── PASO 5 — HABILITAR A ETEL EN FUNDACIÓN DOLLY (única vez, por nombre) ──
-- El nombre se usa SOLO acá, como dato semilla puntual -- la aplicación
-- nunca decide por nombre. Requiere que el Paso 1/punto 7 haya confirmado
-- que la fila ya existe (si no, backfill de establecimientos_usuarios es
-- un prerequisito aparte, no algo que esta migración deba asumir).
UPDATE public.establecimientos_usuarios eu
SET jornada_habilitada = true
FROM perfiles p, establecimientos e
WHERE eu.perfil_id = p.id
  AND eu.establecimiento_id = e.id
  AND p.nombre = 'Etel Salinas'
  AND e.nombre = 'Fundación Dolly';

-- ── PASO 6 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ───────
-- BEGIN;
--   -- Caso 1 -- usuario CON jornada_habilitada=true en ese establecimiento
--   -- → el INSERT de jornadas (Caso 1 de migration-BIT-61-establecimiento-
--   -- jornada.sql) DEBE SEGUIR PASANDO.
--   -- Caso 2 -- mismo usuario, establecimiento donde jornada_habilitada=false
--   -- o no tiene fila → el INSERT DEBE FALLAR (policy).
--   -- Caso 3 -- ADMINISTRADOR, cualquier establecimiento con acceso, SIN
--   -- fila de jornada_habilitada → el INSERT DEBE PASAR (bypass is_admin()).
--   -- Caso 4 -- UPDATE de hora_salida de una Jornada ya abierta, aunque
--   -- jornada_habilitada se haya puesto en false después de abrirla → DEBE
--   -- SEGUIR PASANDO (jornadas_update no se tocó).
-- ROLLBACK;

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='establecimientos_usuarios' AND column_name='jornada_habilitada';
--   SELECT proname, prosecdef FROM pg_proc WHERE proname='tiene_jornada_habilitada';
--   SELECT policyname, with_check FROM pg_policies WHERE tablename='jornadas' AND policyname='jornadas_insert';
--   SELECT eu.*, p.nombre, e.nombre FROM establecimientos_usuarios eu
--   JOIN perfiles p ON p.id=eu.perfil_id JOIN establecimientos e ON e.id=eu.establecimiento_id
--   WHERE eu.jornada_habilitada = true;
--   -- Esperado: solo Etel + Fundación Dolly en true, el resto en false.

-- ── ALTA FUTURA DE OTRO USUARIO/ESTABLECIMIENTO (ejemplo, no ejecutar ahora)
--   UPDATE public.establecimientos_usuarios
--   SET jornada_habilitada = true
--   WHERE perfil_id = '<uuid del perfil>' AND establecimiento_id = '<uuid del establecimiento>';

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
--   DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
--   -- Recrear jornadas_insert SIN la condición tiene_jornada_habilitada
--   -- (texto exacto = el que dejó migration-BIT-61-establecimiento-jornada.sql).
--   DROP FUNCTION IF EXISTS public.tiene_jornada_habilitada(uuid);
--   ALTER TABLE public.establecimientos_usuarios DROP COLUMN IF EXISTS jornada_habilitada;
