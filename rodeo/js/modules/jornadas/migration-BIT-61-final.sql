-- BIT-61 — Migración FINAL: Jornada por establecimiento + capacidad
-- habilitable por Usuario × Establecimiento
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita final de
-- Bren/KLIAM sobre este SQL.
--
-- Reemplaza a las dos parejas de archivos preparadas en rondas anteriores
-- (retiradas del repo) -- este es el único SQL final a revisar y,
-- eventualmente, aplicar.
--
-- ─── ATOMICIDAD (corrección de esta ronda) ───────────────────────────────
-- Todo el cambio + toda la validación viven en UNA sola transacción: un
-- único BEGIN al principio, un único COMMIT/ROLLBACK al final, después de
-- correr TODOS los casos obligatorios. No debe quedar ningún estado donde
-- parte de BIT-61 esté aplicada sin haber validado el conjunto completo.
-- Las fallas ESPERADAS de los casos de prueba usan SAVEPOINT/ROLLBACK TO
-- SAVEPOINT para poder seguir dentro de la misma transacción -- nunca
-- abortan el BEGIN exterior.
--
-- IMPORTANTE -- CÓMO EJECUTAR: todo este archivo (desde el BEGIN de más
-- abajo hasta la decisión final de COMMIT/ROLLBACK) debe correr en la
-- MISMA pestaña/sesión del SQL Editor, sin cerrarla ni abrir otra, porque
-- la transacción y los `SET LOCAL` solo persisten mientras la conexión
-- siga abierta. Varios pasos necesitan que Claudy sustituya un valor real
-- devuelto por un `RETURNING` anterior (marcado `-- SUSTITUIR`) antes de
-- seguir -- es un proceso guiado paso a paso, no un script para pegar y
-- correr de una sola vez sin mirar los resultados intermedios.
--
-- ─── DIAGNÓSTICO YA CONFIRMADO POR CLAUDY (05 Oct 2026) ──────────────────
-- Ya no hace falta lenguaje condicional sobre estos tres puntos:
--   1. 0 Jornadas existentes en Producción -- establecimiento_id puede
--      agregarse sin ningún caso de fila histórica a resolver.
--   2. migration-BIT-49c-proteger-columnas-soft-delete-jornadas.sql SÍ está
--      aplicada -- authenticated tiene GRANT por columna, no por tabla
--      completa, sobre jornadas.
--   3. Etel ya tiene fila en establecimientos_usuarios para Fundación
--      Dolly (perfil_id ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82,
--      establecimiento_id 342b589b-91bf-4eed-b34e-b7fdbd4acd4d).
--
-- ─── REGLAS CONFIRMADAS QUE IMPLEMENTA ESTE ARCHIVO ──────────────────────
-- 1. Una Jornada pertenece a un único establecimiento (NOT NULL, FK).
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
-- ─── DOS DEFENSAS INDEPENDIENTES SOBRE LA INMUTABILIDAD (corrección de
-- esta ronda) ──────────────────────────────────────────────────────────
-- (A) GRANT de columna (BIT-49c): authenticated no tiene UPDATE sobre
--     establecimiento_id -- cualquier intento falla por privilegio
--     (42501) antes de que se evalúe nada más.
-- (B) Trigger `jornadas_bloquear_cambio_establecimiento`: universal, no
--     depende de ningún GRANT -- bloquea el cambio para cualquier rol
--     (incluido uno elevado que sí tuviera privilegio de columna).
-- Se prueban POR SEPARADO (Casos 5 y 6 más abajo) para que la evidencia de
-- cada una sea inequívoca: si se probara todo junto como `authenticated`,
-- una falla por GRANT nunca llegaría a ejercitar el trigger, y no se
-- podría afirmar que el trigger funciona de verdad.
--
-- ─── DEUDA DETECTADA, NO CORREGIDA ACÁ ────────────────────────────────────
-- Claudy detectó privilegios TRUNCATE en tablas del dominio durante el
-- diagnóstico. No se corrige en BIT-61 -- queda documentado como deuda de
-- BIT-59 (estándar de grants explícitos). Tampoco se amplía esta tarea a
-- auditar grants/roles de otras tablas que Claudy no relevó para BIT-61.

-- ── PASO 1 — DIAGNÓSTICO (ya ejecutado por Claudy) ─────────────────────────
-- diagnostico-BIT-61-final.sql, resultados publicados en la sección
-- "Diagnóstico Producción — Claudy" del informe de BIT-61 en Notion.
-- Antes de arrancar el BEGIN de abajo, tener a mano (de ese diagnóstico,
-- consulta B8): el id real de al menos un establecimiento, EXISTENTE,
-- distinto de Fundación Dolly, al que Etel NO tiene ningún vínculo en
-- establecimientos_usuarios. Se reutiliza para el Caso 4 (sin acceso) y
-- para el Caso 6 (blanco real del trigger) -- un único id real alcanza
-- para ambos, no hace falta uno distinto para cada uno. Si Etel estuviera
-- vinculada a TODOS los establecimientos existentes (B8 sin resultados):
-- DETENERSE, esos dos casos no son cubribles con datos reales hoy -- no
-- fabricar un id.

-- ════════════════════════════════════════════════════════════════════════
-- TRANSACCIÓN ÚNICA — CAMBIO + VALIDACIÓN, ATÓMICA
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 2a) jornadas.establecimiento_id (idempotente, NOT NULL) ────────────────
-- uuid, FK a establecimientos(id), sin ON DELETE especial (NO ACTION --
-- mismo patrón que atenciones_clinicas.establecimiento_id, BIT-11).
-- NOT NULL: Claudy confirmó 0 Jornadas existentes (sin filas históricas que
-- necesiten compatibilidad con NULL) y la regla de dominio es absoluta --
-- "una Jornada SIEMPRE pertenece a un establecimiento". La policy del Paso
-- 2e sigue siendo necesaria (valida propietario, acceso real y Jornada
-- habilitada -- cosas que un NOT NULL no puede expresar), pero la
-- integridad estructural básica (que la columna nunca quede vacía) no debe
-- depender solo de RLS -- la hace cumplir la propia base.
-- Sin DEFAULT: con 0 filas no hace falta, y un DEFAULT inventaría un valor
-- para cualquier fila futura que lo omitiera por error.
-- Estrategia idempotente en 2 pasos para garantizar el estado final
-- (is_nullable = NO) sin importar si la columna ya existía de una corrida
-- parcial anterior: ADD COLUMN IF NOT EXISTS no aplicaría el NOT NULL si
-- la columna ya existe sin él (la cláusula completa se saltea), así que el
-- ALTER COLUMN SET NOT NULL de abajo lo confirma siempre -- es un no-op
-- seguro si ya es NOT NULL.
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS establecimiento_id uuid REFERENCES public.establecimientos(id) NOT NULL;

ALTER TABLE public.jornadas
  ALTER COLUMN establecimiento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jornadas_establecimiento_id ON public.jornadas(establecimiento_id);

COMMENT ON COLUMN public.jornadas.establecimiento_id IS
  'BIT-61: establecimiento al que pertenece la Jornada (el activo al presionar LLEGADA). Inmutable después de creada -- ver trigger jornadas_bloquear_cambio_establecimiento.';

-- ── 2b) establecimientos_usuarios.jornada_habilitada (idempotente) ─────────
-- DEFAULT false (deny by default): ninguna fila existente queda habilitada
-- automáticamente.
ALTER TABLE public.establecimientos_usuarios
  ADD COLUMN IF NOT EXISTS jornada_habilitada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establecimientos_usuarios.jornada_habilitada IS
  'BIT-61 (transitorio -- ver BIT-56): true = este usuario puede operar Jornada (LLEGADA/SALIDA) en este establecimiento. Default false (deny by default). Reemplazar por el modelo genérico de capacidades de BIT-56 cuando exista.';

-- ── 2c) Trigger: establecimiento_id inmutable después de creada ───────────
-- Mecanismo universal -- no depende del GRANT de columna de BIT-49c.
-- Bloquea el cambio al nivel más bajo posible, para cualquier UPDATE que
-- llegue por cualquier vía (API normal, RPC futura, SQL directo de un rol
-- no admin) -- solo un superusuario modificando el propio trigger podría
-- saltarlo. Sin `USING ERRCODE` explícito a propósito -- queda en el
-- default P0001 (raise_exception), deliberadamente DISTINTO del 42501 de
-- un error de privilegio, para que el Caso 5 (GRANT) y el Caso 6 (trigger)
-- de la validación de abajo sean distinguibles por código de error, no
-- solo por el texto del mensaje.
CREATE OR REPLACE FUNCTION public.jornadas_bloquear_cambio_establecimiento()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
    RAISE EXCEPTION 'El establecimiento de una Jornada no se puede modificar después de creada.';
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
-- authenticated. Bypass is_admin(). Para los demás roles, exige usuario
-- autenticado real (auth.uid()) y una fila en establecimientos_usuarios
-- con jornada_habilitada = true para ese perfil+establecimiento exactos.
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
-- profesional_id) -- si el texto real que publicó Claudy en pg_policies
-- difiere de esto, ADAPTAR esta sentencia antes de aplicar.
DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
CREATE POLICY jornadas_insert ON public.jornadas
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.uid() = profesional_id
    AND establecimiento_id IS NOT NULL
    AND tiene_acceso_establecimiento(establecimiento_id)
    AND tiene_jornada_habilitada(establecimiento_id)
  );
-- `establecimiento_id IS NOT NULL` queda acá aunque la columna ya sea
-- NOT NULL (2a) -- redundante a propósito: la policy documenta por sí
-- sola sus 3 condiciones reales (propietario, acceso, capacidad) sin
-- depender de que quien la lea sepa además el estado del constraint de
-- columna. La integridad estructural no depende de esta línea.
-- jornadas_update NO se toca: el cierre (SALIDA) no queda condicionado a
-- que jornada_habilitada siga activa (regla 4) -- las protecciones sobre
-- UPDATE son el GRANT de columna (BIT-49c) + el trigger de 2c, ninguna de
-- las dos es esta policy. jornadas_select tampoco se toca.

-- ── 2f) GRANT -- único camino (BIT-49c confirmada aplicada) ────────────────
-- authenticated tiene GRANT por columna sobre jornadas (no por tabla
-- completa) desde BIT-49c -- establecimiento_id se agrega a la lista de
-- columnas de INSERT. UPDATE se deja EXACTAMENTE como quedó en BIT-49c
-- (fecha, hora_llegada, hora_salida, notas) -- NO se agrega
-- establecimiento_id ahí: esa ausencia de GRANT es la primera de las dos
-- defensas de inmutabilidad (ver Caso 5/6 más abajo).
GRANT INSERT (
  profesional_id,
  establecimiento_id,
  fecha,
  hora_llegada,
  hora_salida,
  notas
)
ON public.jornadas
TO authenticated;

-- No se otorga `anon` en ningún caso. No se amplía ningún permiso existente
-- por conveniencia -- estándar preventivo BIT-59 aplicado desde ya. Los
-- privilegios TRUNCATE que detectó Claudy en el diagnóstico NO se tocan
-- acá -- quedan documentados como deuda de BIT-59 (ver cabecera).

-- ── 2g) Habilitar a Etel en Fundación Dolly (IDs reales, PK compuesta) ────
-- Por PK compuesta real, NO por nombre -- IDs confirmados por Claudy. El
-- UPDATE va DENTRO del mismo bloque DO que el GET DIAGNOSTICS -- GET
-- DIAGNOSTICS solo captura el resultado del último comando SQL ejecutado
-- DENTRO del mismo bloque PL/pgSQL, no de una sentencia anterior fuera de
-- él. Debe afectar EXACTAMENTE 1 fila: 0 significa que la fila no existe
-- (contradice B6 del diagnóstico) -- DETENERSE y reportar, no reintentar
-- con otro criterio; más de 1 es imposible dada la PK compuesta, pero se
-- verifica igual por disciplina. Al estar dentro de la transacción
-- general, si algo posterior falla de forma inesperada y se decide
-- ROLLBACK, esta semilla se revierte junto con todo lo demás.
DO $$
DECLARE
  v_filas integer;
BEGIN
  UPDATE public.establecimientos_usuarios
  SET jornada_habilitada = true
  WHERE perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82'
    AND establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RAISE NOTICE 'Filas afectadas por la habilitación semilla de Etel/Fundación Dolly: %', v_filas;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente 1 fila afectada, se afectaron %. Revisar antes de continuar.', v_filas;
  END IF;
END $$;

-- Confirmación de solo lectura del estado final de esta fila puntual:
SELECT perfil_id, establecimiento_id, jornada_habilitada
FROM public.establecimientos_usuarios
WHERE perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82'
  AND establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';
-- Esperado: jornada_habilitada = true.

-- ════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN (misma transacción, obligatoria antes de decidir COMMIT)
-- ════════════════════════════════════════════════════════════════════════
-- El SQL Editor corre como el rol de la sesión (típicamente `postgres`),
-- que NO es `authenticated` -- describir los casos no alcanza para
-- probarlos de verdad. `SET LOCAL ROLE` cambia el rol efectivo (necesario
-- para que los GRANT por columna de BIT-49c se evalúen de verdad -- como
-- postgres NO se probaría eso) y `SET LOCAL request.jwt.claims` puebla lo
-- que auth.uid()/auth.role() leen -- el mecanismo real que usa PostgREST
-- por request, reproducido acá a mano.

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub":"ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82","role":"authenticated"}';
SET LOCAL request.jwt.claim.sub = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82';

-- Sanity check OBLIGATORIO -- confirmar que auth.uid() realmente devuelve
-- el UUID de Etel antes de seguir. Si no coincide, DETENERSE: ningún caso
-- de abajo estaría probando lo que dice probar.
SELECT current_user, auth.uid(), auth.role();

-- Caso 1 -- acceso permitido + Jornada habilitada (Dolly) → DEBE PASAR:
SAVEPOINT caso_1;
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES (auth.uid(), '342b589b-91bf-4eed-b34e-b7fdbd4acd4d', current_date, '08:00:00')
RETURNING id; -- SUSTITUIR <jornada_1_id> más abajo por este valor

-- Caso 2 -- establecimiento_id NULL → DEBE FALLAR por el constraint de
-- columna (23502 not_null_violation) ANTES de que la policy llegue a
-- evaluarse -- exactamente el objetivo del Paso 2a: la integridad no
-- depende solo de RLS:
SAVEPOINT caso_2;
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES (auth.uid(), NULL, current_date, '08:00:00');
-- (esperar error 23502) --
ROLLBACK TO SAVEPOINT caso_2;

-- Caso 3 -- acceso general SÍ, jornada_habilitada NO → DEBE FALLAR.
-- Candidato: Establecimiento Fernández o Antinori (BIT-42, vinculados a
-- Etel por acceso general). SUSTITUIR <ESTABLECIMIENTO_CON_ACCESO_SIN_JORNADA_ID>
-- con el id real antes de correr -- no inventarlo:
SAVEPOINT caso_3;
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES (auth.uid(), '<ESTABLECIMIENTO_CON_ACCESO_SIN_JORNADA_ID>', current_date, '08:00:00');
-- (esperar error por tiene_jornada_habilitada() = false) --
ROLLBACK TO SAVEPOINT caso_3;

-- Caso 4 -- sin acceso real al establecimiento. Usa el id real del Paso 1
-- (consulta B8 del diagnóstico) -- un establecimiento que EXISTE (pasa la
-- FK) pero al que Etel no tiene ningún vínculo en establecimientos_usuarios
-- -- así la falla demuestra autorización (tiene_acceso_establecimiento =
-- false), no un error de FK por un id inventado. SUSTITUIR
-- <ESTABLECIMIENTO_SIN_ACCESO_REAL_ID> -- no inventarlo:
SAVEPOINT caso_4;
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES (auth.uid(), '<ESTABLECIMIENTO_SIN_ACCESO_REAL_ID>', current_date, '08:00:00');
-- (esperar error por tiene_acceso_establecimiento() = false) --
ROLLBACK TO SAVEPOINT caso_4;

-- Caso 5 -- DEFENSA 1 (GRANT): como authenticated (Etel), intentar cambiar
-- establecimiento_id de la Jornada propia del Caso 1. authenticated NO
-- tiene UPDATE sobre esa columna (BIT-49c, sin ampliar en 2f) → DEBE
-- FALLAR por privilegio (42501, "permission denied for table jornadas"),
-- SIN llegar siquiera a evaluar el trigger. Esta es la defensa de GRANT,
-- aislada de la defensa de trigger que se prueba en el Caso 6. SUSTITUIR
-- <jornada_1_id> por el id devuelto en el Caso 1:
SAVEPOINT caso_5;
UPDATE public.jornadas SET establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d'
WHERE id = '<jornada_1_id>';
-- (esperar error 42501) --
ROLLBACK TO SAVEPOINT caso_5;

-- Caso 6 -- DEFENSA 2 (trigger): vuelve al rol de la sesión a propósito --
-- acá NO se prueba la policy de INSERT (ya se probó en los Casos 1-4) ni
-- el GRANT (ya se probó en el Caso 5), sino aislar el trigger en sí,
-- independiente de cualquier privilegio de columna -- por eso se corre con
-- un rol que SÍ tendría privilegio de sobra, para demostrar que igual
-- falla. Crea una Jornada temporal y, dentro de la MISMA transacción,
-- intenta cambiar su establecimiento_id a OTRO establecimiento real (NO
-- gen_random_uuid() -- un id inexistente fallaría por FK, no demostraría
-- el trigger; reutilizar el mismo id real del Caso 4). Debe fallar
-- específicamente con el mensaje del trigger (P0001, distinto del 42501
-- del Caso 5):
RESET ROLE;
SAVEPOINT caso_6;
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES ('ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82', '342b589b-91bf-4eed-b34e-b7fdbd4acd4d', current_date, '10:00:00')
RETURNING id; -- SUSTITUIR <jornada_6_id> más abajo por este valor
UPDATE public.jornadas SET establecimiento_id = '<ESTABLECIMIENTO_SIN_ACCESO_REAL_ID>'
WHERE id = '<jornada_6_id>';
-- (esperar error P0001, "El establecimiento de una Jornada no se puede
-- modificar después de creada.") --
ROLLBACK TO SAVEPOINT caso_6;

-- Volver a actuar como Etel para el resto de los casos (los claims siguen
-- vigentes en esta misma transacción, solo hace falta retomar el rol):
SET LOCAL role = 'authenticated';

-- Caso 7 -- UPDATE normal de hora_salida (SALIDA) sobre la Jornada del
-- Caso 1, sin tocar establecimiento_id → DEBE PASAR. SUSTITUIR
-- <jornada_1_id>:
UPDATE public.jornadas SET hora_salida = '12:00:00' WHERE id = '<jornada_1_id>';

-- Caso 8 -- revocar jornada_habilitada DESPUÉS de abrir y confirmar que
-- SALIDA sigue funcionando igual (regla 4):
-- 8a) abrir una segunda Jornada en Dolly, todavía como Etel:
INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
VALUES (auth.uid(), '342b589b-91bf-4eed-b34e-b7fdbd4acd4d', current_date, '09:00:00')
RETURNING id; -- SUSTITUIR <jornada_8_id> más abajo por este valor
-- 8b) volver al rol de la sesión para la operación administrativa de
-- revocar (un authenticated normal no debería poder tocar esta columna
-- directamente -- no hay policy UPDATE para clientes sobre
-- establecimientos_usuarios):
RESET ROLE;
UPDATE public.establecimientos_usuarios SET jornada_habilitada = false
WHERE perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82'
  AND establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';
-- 8c) volver a actuar como Etel:
SET LOCAL role = 'authenticated';
-- 8d) cerrar la Jornada del 8a a pesar de la capacidad revocada → DEBE
-- PASAR igual. SUSTITUIR <jornada_8_id>:
UPDATE public.jornadas SET hora_salida = '18:00:00' WHERE id = '<jornada_8_id>';

-- Caso 9 -- ADMINISTRADOR, cualquier establecimiento con acceso, SIN fila
-- de jornada_habilitada → DEBE PASAR (bypass is_admin() en
-- tiene_jornada_habilitada()). No incluido como bloque ejecutable arriba
-- porque requiere el UUID real de un perfil ADMINISTRADOR, que todavía no
-- está confirmado en este archivo -- repetir el patrón de RESET ROLE +
-- SET LOCAL role/claims con ese UUID si se quiere cubrir explícitamente
-- antes de autorizar Producción.

-- Volver al rol de la sesión antes de decidir -- COMMIT/ROLLBACK no
-- deberían emitirse mientras se sigue impersonando a Etel:
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════
-- DECISIÓN FINAL (manual, de Claudy/Bren -- no automática)
-- ════════════════════════════════════════════════════════════════════════
-- Revisar que CADA caso se haya comportado EXACTAMENTE como se describe
-- arriba (los "DEBE PASAR" pasaron, los "DEBE FALLAR" fallaron con el
-- error/código esperado) antes de decidir:
--
--   Si TODO se comportó como se esperaba:
--     COMMIT;
--
--   Si CUALQUIER cosa fue inesperada (un caso que debía fallar no falló,
--   uno que debía pasar no pasó, un error distinto al esperado, etc.):
--     ROLLBACK;
--
-- No hay un estado intermedio -- es uno de los dos, de forma explícita y
-- deliberada, nunca por default/timeout.

-- ════════════════════════════════════════════════════════════════════════
-- PASO 4 — VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA, después del COMMIT)
-- ════════════════════════════════════════════════════════════════════════
--   -- Estructura:
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jornadas' AND column_name='establecimiento_id';
--   -- is_nullable debe dar 'NO'.
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
--   -- GRANT de columna de jornadas:
--   SELECT a.attname, a.attacl FROM pg_attribute a
--   WHERE a.attrelid='public.jornadas'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
--   -- establecimiento_id debe aparecer en la ACL de INSERT junto con las
--   -- otras 5 columnas; NINGUNA columna debe tener establecimiento_id en UPDATE.
--   -- Policy:
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='jornadas' AND policyname='jornadas_insert';
--   -- Datos intactos (0 jornadas reales antes de aplicar -> 0 después,
--   -- confirmado por Claudy -- todo lo de la validación se revirtió con
--   -- los SAVEPOINT/ROLLBACK TO SAVEPOINT, nada de eso queda comiteado):
--   SELECT count(*) FROM jornadas;
--   -- Habilitación semilla:
--   SELECT eu.*, p.nombre, e.nombre FROM establecimientos_usuarios eu
--   JOIN perfiles p ON p.id=eu.perfil_id JOIN establecimientos e ON e.id=eu.establecimiento_id
--   WHERE eu.jornada_habilitada = true;
--   -- Esperado: EXACTAMENTE Etel + Fundación Dolly en true, el resto en false.

-- ════════════════════════════════════════════════════════════════════════
-- PASO 5 — ROLLBACK DE RECUPERACIÓN (solo si ya se hizo COMMIT y hace
-- falta deshacer después; requiere autorización explícita; NO se ejecuta
-- automáticamente)
-- ════════════════════════════════════════════════════════════════════════
--   -- Solo si ninguna Jornada real llegó a usar establecimiento_id:
--   SELECT count(*) FROM jornadas; -- debe dar 0 (o solo filas que se
--   -- puedan perder sin problema -- confirmar con Bren/KLIAM si no es 0)
--
--   REVOKE INSERT (establecimiento_id) ON public.jornadas FROM authenticated;
--   DROP POLICY IF EXISTS jornadas_insert ON public.jornadas;
--   -- Recrear jornadas_insert con el texto EXACTO que publicó Claudy en el
--   -- diagnóstico (sección "Diagnóstico Producción — Claudy" del informe
--   -- de BIT-61) -- no inventar un texto de memoria para el rollback.
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
-- -- el nombre no aparece en ningún lado de esta versión, solo IDs reales.
