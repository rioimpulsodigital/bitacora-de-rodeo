-- BIT-61 — Migración FINAL: Jornada por establecimiento + capacidad
-- habilitable por Usuario × Establecimiento
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita final de
-- Bren/KLIAM sobre este SQL (el de esta versión -- ver abajo por qué se
-- reescribió el commit 076c45f, que YA fue revisado/autorizado pero nunca
-- aplicado).
--
-- ─── EJECUCIÓN ONE-SHOT — una sola pulsación de Run en Supabase SQL Editor
-- ───────────────────────────────────────────────────────────────────────
-- Pegar el archivo COMPLETO y correrlo UNA sola vez. No requiere abrir
-- varias veces "Run", no requiere anotar ningún valor de un RETURNING a
-- mano, no requiere sustituir ningún placeholder, no requiere decidir
-- manualmente COMMIT/ROLLBACK a mitad de camino.
--
-- ─── POR QUÉ SE REESCRIBIÓ (causa real, confirmada por Claudy) ───────────
-- El commit 076c45f (versión anterior) asumía que una misma transacción
-- de Postgres (`BEGIN` ... `SAVEPOINT` ... `SET LOCAL` ... decisión final
-- `COMMIT`/`ROLLBACK`) podía mantenerse viva a través de VARIAS pulsaciones
-- de "Run" en el SQL Editor de Supabase, siempre que se usara la misma
-- pestaña. Claudy confirmó que esto NO está garantizado: el SQL Editor no
-- asegura mantener la misma conexión/backend entre pulsaciones de Run, así
-- que una transacción, sus SAVEPOINT, sus `SET LOCAL` y los valores
-- obtenidos por `RETURNING` en un paso podían perderse antes del paso
-- siguiente. Producción NO fue modificada por ese intento -- BIT-61 sigue
-- 🔄 En curso, PR #8 sigue OPEN sin mergear.
--
-- Esta versión resuelve eso ejecutando TODO -- cambio de esquema, semilla,
-- validación de los 8 casos, limpieza de los datos de prueba y las 13
-- aserciones finales -- dentro de UN ÚNICO envío al SQL Editor (un único
-- `BEGIN;` ... un único `COMMIT;`), sin ningún punto donde dependa de que
-- Claudy copie un valor y lo pegue en otra sentencia.
--
-- ─── CAMBIO DE MECANISMO: SAVEPOINT SQL → bloques PL/pgSQL con EXCEPTION ──
-- `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` son comandos de sesión -- no se
-- pueden ejecutar DENTRO de un bloque PL/pgSQL (`DO $$ ... $$`). El
-- equivalente real dentro de PL/pgSQL es un bloque `BEGIN ... EXCEPTION
-- WHEN ... END` anidado: si ocurre una excepción dentro de él, Postgres
-- revierte automáticamente TODO lo escrito desde que se entró a ese bloque
-- (es, en los hechos, un SAVEPOINT + ROLLBACK TO SAVEPOINT implícito). Esta
-- versión usa ese mecanismo en dos formas:
--   (a) Para los casos que DEBEN fallar (2, 3, 4, 5, 6): el error real
--       esperado (23502, 42501, P0001) es capturado por el propio bloque
--       `EXCEPTION WHEN SQLSTATE '...'`. Si el error NO ocurre, se fuerza
--       un error con un código de control interno (`ZZ099`, nunca un
--       código real de Postgres, prefijo `ZZ` elegido justamente porque no
--       pertenece a ninguna clase SQLSTATE estándar) que ese mismo bloque
--       NO captura -- se propaga hacia arriba y aborta todo el script.
--   (b) Para los casos que DEBEN pasar (1, 7, 8): al terminar todos
--       exitosamente, se levanta deliberadamente un error de control
--       (`ZZ900`) que un bloque exterior captura -- el efecto es revertir
--       automáticamente TODO lo escrito por esos tres casos (Jornadas de
--       prueba + revocación temporal de `jornada_habilitada`), sin dejar
--       nada de eso comiteado, preservando intacto todo lo de antes (el
--       cambio de esquema y la semilla real).
-- Cualquier error REALMENTE inesperado (ni el esperado por cada caso, ni
-- ZZ099, ni ZZ900) se re-levanta con `RAISE EXCEPTION` y aborta la
-- transacción completa -- nunca queda una aplicación parcial.
--
-- ─── DIAGNÓSTICO Y DATOS REALES YA CONFIRMADOS ───────────────────────────
--   1. 0 Jornadas existentes en Producción (Claudy, 05 Oct 2026) --
--      establecimiento_id puede agregarse sin caso de fila histórica.
--   2. migration-BIT-49c-proteger-columnas-soft-delete-jornadas.sql SÍ está
--      aplicada -- authenticated tiene GRANT por columna, no por tabla
--      completa, sobre jornadas.
--   3. Usuario Etel: ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82.
--   4. Fundación Dolly: 342b589b-91bf-4eed-b34e-b7fdbd4acd4d (Etel ya
--      vinculada, acceso general confirmado).
--   5. Establecimiento Fernández: 6e83d6c1-82c9-43ba-a239-dc0237a0f20f --
--      Etel tiene acceso general (BIT-42) pero NO Jornada habilitada ahí.
--      Usado para el Caso 3. La propia validación verifica esta precondición
--      en tiempo de ejecución (no se asume a ciegas).
--   6. Establecimiento Demo B: 8e8c86d5-62c8-4b5d-a57d-17cabe2e59da --
--      existe de verdad (pasa la FK) pero Etel NO tiene ningún vínculo en
--      establecimientos_usuarios. Usado para los Casos 4 y 6. La propia
--      validación también verifica esta precondición en tiempo de ejecución.
-- Estos 6 puntos ya no dependen de que Claudy ejecute una consulta B8 por
-- separado antes de este script -- los IDs están confirmados y quedan
-- fijos (hardcoded) acá, con su propia verificación programática incluida.
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
-- capacidad de producto". Jornada es distinta: (a) necesita variar POR
-- USUARIO dentro del mismo establecimiento; (b) no existe ninguna otra vía
-- ya abierta para crear/cerrar una Jornada, así que el backend SÍ tiene que
-- exigirlo, no alcanza con ocultar el menú.
--
-- ─── DOS DEFENSAS INDEPENDIENTES SOBRE LA INMUTABILIDAD ──────────────────
-- (A) GRANT de columna (BIT-49c): authenticated no tiene UPDATE sobre
--     establecimiento_id -- cualquier intento falla por privilegio (42501)
--     antes de que se evalúe nada más. Probado en el Caso 5.
-- (B) Trigger `jornadas_bloquear_cambio_establecimiento`: universal, no
--     depende de ningún GRANT -- bloquea el cambio para cualquier rol
--     (incluido uno elevado que sí tuviera privilegio de columna). Probado
--     en el Caso 6, con rol elevado a propósito, para que la falla sea
--     inequívocamente del trigger y no del GRANT.
--
-- ─── DEUDA DETECTADA, NO CORREGIDA ACÁ ────────────────────────────────────
-- Privilegios TRUNCATE sueltos detectados por Claudy en tablas del dominio.
-- Queda como deuda de BIT-59 (estándar de grants explícitos) -- no se
-- corrige ni se amplía el alcance de BIT-61 para auditar otras tablas.

-- ════════════════════════════════════════════════════════════════════════
-- ÚNICA TRANSACCIÓN — CAMBIO + SEMILLA + VALIDACIÓN + ASERCIONES, ATÓMICA
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 2a) jornadas.establecimiento_id (NOT NULL, FK, índice) ─────────────────
-- uuid, FK a establecimientos(id), NO ACTION (mismo patrón que
-- atenciones_clinicas.establecimiento_id, BIT-11). NOT NULL directo: 0
-- Jornadas existentes confirmado por Claudy, no hace falta DEFAULT ni
-- backfill. La policy del bloque 2e sigue siendo necesaria (valida
-- propietario, acceso real y Jornada habilitada -- cosas que un NOT NULL no
-- expresa), pero la integridad estructural básica no debe depender solo de
-- RLS.
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS establecimiento_id uuid REFERENCES public.establecimientos(id);

ALTER TABLE public.jornadas
  ALTER COLUMN establecimiento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jornadas_establecimiento_id ON public.jornadas(establecimiento_id);

COMMENT ON COLUMN public.jornadas.establecimiento_id IS
  'BIT-61: establecimiento al que pertenece la Jornada (el activo al presionar LLEGADA). Inmutable después de creada -- ver trigger jornadas_bloquear_cambio_establecimiento.';

-- ── 2b) establecimientos_usuarios.jornada_habilitada ────────────────────────
-- DEFAULT false (deny by default): ninguna fila existente queda habilitada
-- automáticamente.
ALTER TABLE public.establecimientos_usuarios
  ADD COLUMN IF NOT EXISTS jornada_habilitada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establecimientos_usuarios.jornada_habilitada IS
  'BIT-61 (transitorio -- ver BIT-56): true = este usuario puede operar Jornada (LLEGADA/SALIDA) en este establecimiento. Default false (deny by default). Reemplazar por el modelo genérico de capacidades de BIT-56 cuando exista.';

-- ── 2c) Trigger: establecimiento_id inmutable después de creada ───────────
-- Mecanismo universal -- no depende del GRANT de columna de BIT-49c. Sin
-- `USING ERRCODE` explícito a propósito -- queda en el default P0001
-- (raise_exception), deliberadamente DISTINTO del 42501 de un error de
-- privilegio, para que el Caso 5 (GRANT) y el Caso 6 (trigger) de la
-- validación de abajo sean distinguibles por código de error, no solo por
-- el texto del mensaje.
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
-- authenticated. Bypass is_admin().
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
-- profesional_id). Si el texto real que publicó Claudy en pg_policies
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
-- jornadas_update NO se toca: el cierre (SALIDA) no queda condicionado a
-- que jornada_habilitada siga activa (regla 4) -- las protecciones sobre
-- UPDATE son el GRANT de columna (BIT-49c) + el trigger de 2c, ninguna de
-- las dos es esta policy. jornadas_select tampoco se toca.

-- ── 2f) GRANT -- único camino (BIT-49c confirmada aplicada) ────────────────
-- establecimiento_id se agrega a la lista de columnas de INSERT. UPDATE se
-- deja EXACTAMENTE como quedó en BIT-49c (fecha, hora_llegada, hora_salida,
-- notas) -- NO se agrega establecimiento_id ahí: esa ausencia de GRANT es
-- la primera de las dos defensas de inmutabilidad (Caso 5/6 más abajo).
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
-- privilegios TRUNCATE detectados por Claudy NO se tocan acá (ver cabecera).

-- ── 2g) Habilitar a Etel en Fundación Dolly (IDs reales, PK compuesta) ────
-- Por PK compuesta real, NO por nombre. Debe afectar EXACTAMENTE 1 fila: 0
-- significa que la fila no existe (contradice el diagnóstico) -- aborta
-- todo el script, no reintenta con otro criterio.
DO $$
DECLARE
  v_filas integer;
BEGIN
  UPDATE public.establecimientos_usuarios
  SET jornada_habilitada = true
  WHERE perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82'
    AND establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'BIT-61: la semilla de Etel x Fundación Dolly afectó % filas, se esperaba exactamente 1. Abortando.', v_filas;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN (8 casos obligatorios) + LIMPIEZA AUTOMÁTICA
-- ════════════════════════════════════════════════════════════════════════
-- Todo lo escrito por los casos 1, 7 y 8 (los que deben pasar) se revierte
-- automáticamente al final de este bloque -- ver explicación del mecanismo
-- (bloques PL/pgSQL con EXCEPTION) en la cabecera del archivo. El Caso 9
-- (ADMINISTRADOR) no es bloqueante para esta aplicación y queda fuera de
-- esta ventana, igual que en la autorización vigente.

DO $$
DECLARE
  v_etel_id      uuid := 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82';
  v_dolly_id     uuid := '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';
  v_fernandez_id uuid := '6e83d6c1-82c9-43ba-a239-dc0237a0f20f';
  v_demob_id     uuid := '8e8c86d5-62c8-4b5d-a57d-17cabe2e59da';
  v_uid_check    uuid;
  v_jornada1_id  uuid;
  v_jornada6_id  uuid;
  v_jornada8_id  uuid;
  v_filas        integer;
  v_tiene_acceso boolean;
  v_tiene_jornada boolean;
BEGIN
  -- Impersonar a Etel como lo hace PostgREST por request: SET LOCAL ROLE
  -- cambia el rol efectivo (necesario para que el GRANT por columna de
  -- BIT-49c se evalúe de verdad) y request.jwt.claims/claim.sub pueblan lo
  -- que auth.uid() lee. Usamos EXECUTE para los SET -- no por necesidad de
  -- interpolar nada complejo, sino para no depender de si PL/pgSQL acepta
  -- SET/RESET como sentencia directa en esta versión de Postgres.
  EXECUTE 'RESET role';
  EXECUTE 'SET LOCAL role = ''authenticated''';
  EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', v_etel_id::text, 'role', 'authenticated')::text);
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_etel_id::text);

  SELECT auth.uid() INTO v_uid_check;
  IF v_uid_check IS DISTINCT FROM v_etel_id THEN
    RAISE EXCEPTION 'BIT-61 validación: auth.uid() devolvió % en vez de Etel (%) -- la impersonación no tomó efecto, abortando.', v_uid_check, v_etel_id;
  END IF;

  BEGIN -- bloque de validación completo -- lo que escriba se revierte al final con el sentinel ZZ900

    -- Caso 1 — acceso permitido + Jornada habilitada (Dolly) → DEBE PASAR.
    INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
    VALUES (v_etel_id, v_dolly_id, current_date, '08:00:00')
    RETURNING id INTO v_jornada1_id;

    -- Caso 2 — establecimiento_id NULL → DEBE FALLAR específicamente por
    -- el constraint NOT NULL (23502), AISLADO de la policy de RLS. La
    -- policy jornadas_insert también exige `establecimiento_id IS NOT
    -- NULL` en su WITH CHECK -- si este caso corriera como authenticated,
    -- una fila con establecimiento_id=NULL violaría AMBAS defensas a la
    -- vez (RLS y el constraint de columna), y no se podría afirmar cuál
    -- de las dos detuvo realmente el INSERT (corrección de esta ronda,
    -- Bren/KLIAM). Mismo criterio ya aplicado en los Casos 5/6 (GRANT vs.
    -- trigger): se aísla la defensa probándola con rol elevado, que no
    -- está sujeto a RLS -- la única defensa que puede intervenir queda
    -- siendo el constraint NOT NULL de la propia columna.
    EXECUTE 'RESET role';
    BEGIN
      INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
      VALUES (v_etel_id, NULL, current_date, '08:00:00');
      RAISE EXCEPTION 'Caso 2: se esperaba fallo por NOT NULL y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE '23502' THEN
        RAISE NOTICE 'Caso 2 OK (23502 not_null_violation, aislado de RLS -- el rol elevado no está sujeto a policy).';
    END;
    EXECUTE 'SET LOCAL role = ''authenticated''';

    -- Caso 3 — acceso general SÍ, jornada_habilitada NO (Fernández) →
    -- DEBE FALLAR. Se verifica la precondición real antes de intentarlo.
    SELECT tiene_acceso_establecimiento(v_fernandez_id), tiene_jornada_habilitada(v_fernandez_id)
      INTO v_tiene_acceso, v_tiene_jornada;
    IF NOT v_tiene_acceso OR v_tiene_jornada THEN
      RAISE EXCEPTION 'Caso 3: precondición inválida -- tiene_acceso_establecimiento=% (se esperaba true), tiene_jornada_habilitada=% (se esperaba false) para Fernández. Abortando.', v_tiene_acceso, v_tiene_jornada;
    END IF;
    BEGIN
      INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
      VALUES (v_etel_id, v_fernandez_id, current_date, '08:00:00');
      RAISE EXCEPTION 'Caso 3: se esperaba fallo por falta de Jornada habilitada y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        RAISE NOTICE 'Caso 3 OK (42501, acceso general sí, Jornada habilitada no -- rechazado por policy).';
    END;

    -- Caso 4 — sin acceso real (Demo B) → DEBE FALLAR. Se verifica la
    -- precondición real antes de intentarlo.
    SELECT tiene_acceso_establecimiento(v_demob_id) INTO v_tiene_acceso;
    IF v_tiene_acceso THEN
      RAISE EXCEPTION 'Caso 4: precondición inválida -- Etel SÍ tiene acceso a Establecimiento Demo B (se esperaba false). Abortando.';
    END IF;
    BEGIN
      INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
      VALUES (v_etel_id, v_demob_id, current_date, '08:00:00');
      RAISE EXCEPTION 'Caso 4: se esperaba fallo por falta de acceso y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        RAISE NOTICE 'Caso 4 OK (42501, rechazado por falta de acceso al establecimiento).';
    END;

    -- Caso 5 — DEFENSA 1 (GRANT): como authenticated, intentar cambiar
    -- establecimiento_id de la Jornada propia del Caso 1 → DEBE FALLAR por
    -- privilegio de columna (42501), sin llegar siquiera a evaluar el
    -- trigger.
    BEGIN
      UPDATE public.jornadas SET establecimiento_id = v_fernandez_id WHERE id = v_jornada1_id;
      RAISE EXCEPTION 'Caso 5: se esperaba fallo por privilegio de columna y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        RAISE NOTICE 'Caso 5 OK (42501, UPDATE de establecimiento_id bloqueado por GRANT de columna).';
    END;

    -- Caso 6 — DEFENSA 2 (trigger): rol elevado a propósito (bypasea el
    -- GRANT, que ya se probó aislado en el Caso 5) -- crea una Jornada
    -- temporal y, en la misma transacción, intenta cambiar su
    -- establecimiento_id a Demo B (otro establecimiento real, nunca un id
    -- inventado) → DEBE FALLAR específicamente por el trigger (P0001). La
    -- Jornada temporal queda revertida junto con el intento al capturar la
    -- excepción (mismo mecanismo de bloque PL/pgSQL con EXCEPTION).
    EXECUTE 'RESET role';
    BEGIN
      INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
      VALUES (v_etel_id, v_dolly_id, current_date, '10:00:00')
      RETURNING id INTO v_jornada6_id;

      UPDATE public.jornadas SET establecimiento_id = v_demob_id WHERE id = v_jornada6_id;

      RAISE EXCEPTION 'Caso 6: se esperaba fallo por el trigger de inmutabilidad y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        RAISE NOTICE 'Caso 6 OK (P0001, trigger de inmutabilidad -- Jornada temporal revertida junto con el intento).';
    END;
    EXECUTE 'SET LOCAL role = ''authenticated''';

    -- Caso 7 — UPDATE normal de hora_salida (SALIDA), sin tocar
    -- establecimiento_id → DEBE PASAR.
    UPDATE public.jornadas SET hora_salida = '12:00:00' WHERE id = v_jornada1_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'Caso 7: UPDATE de hora_salida afectó % filas, se esperaba 1.', v_filas;
    END IF;

    -- Caso 8 — revocar jornada_habilitada DESPUÉS de abrir y confirmar que
    -- SALIDA sigue funcionando igual (regla 4).
    -- 8a) abrir una segunda Jornada en Dolly, todavía como Etel:
    INSERT INTO public.jornadas (profesional_id, establecimiento_id, fecha, hora_llegada)
    VALUES (v_etel_id, v_dolly_id, current_date, '09:00:00')
    RETURNING id INTO v_jornada8_id;

    -- 8b) rol elevado para la operación administrativa de revocar (no hay
    -- policy UPDATE para clientes sobre establecimientos_usuarios):
    EXECUTE 'RESET role';
    UPDATE public.establecimientos_usuarios SET jornada_habilitada = false
    WHERE perfil_id = v_etel_id AND establecimiento_id = v_dolly_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'Caso 8b: revocación de jornada_habilitada afectó % filas, se esperaba 1.', v_filas;
    END IF;

    -- 8c) volver a actuar como Etel:
    EXECUTE 'SET LOCAL role = ''authenticated''';

    -- 8d) cerrar la Jornada del 8a a pesar de la capacidad revocada → DEBE
    -- PASAR igual:
    UPDATE public.jornadas SET hora_salida = '18:00:00' WHERE id = v_jornada8_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'Caso 8d: SALIDA tras revocación afectó % filas, se esperaba 1 -- la regla 4 se habría violado.', v_filas;
    END IF;

    -- Todos los casos obligatorios pasaron exactamente como se esperaba:
    -- forzar la limpieza de TODO lo escrito por este bloque (Jornadas de
    -- los Casos 1/7/8 y la revocación temporal del 8b) con un error de
    -- control que el bloque exterior captura y trata como éxito.
    RAISE EXCEPTION 'BIT61_VALIDACION_OK' USING ERRCODE = 'ZZ900';

  EXCEPTION
    WHEN SQLSTATE 'ZZ900' THEN
      RAISE NOTICE 'BIT-61: los 8 casos de validación pasaron -- datos de prueba revertidos automáticamente.';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'BIT-61: la validación falló de forma inesperada (SQLSTATE=%, mensaje=%) -- abortando toda la migración.', SQLSTATE, SQLERRM;
  END;

  -- Volver al rol de la sesión antes de las aserciones finales -- no debe
  -- quedar impersonando a Etel:
  EXECUTE 'RESET role';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- ASERCIONES OBLIGATORIAS PRE-COMMIT (programáticas, no solo SELECT)
-- ════════════════════════════════════════════════════════════════════════
-- Cualquiera de las 13 que no se cumpla aborta todo el script antes del
-- COMMIT con RAISE EXCEPTION -- Producción no queda modificada.

DO $$
DECLARE
  v_count bigint;
  v_bool  boolean;
  v_text  text;
BEGIN
  -- 1) Ninguna Jornada de prueba sobrevivió a la limpieza.
  SELECT count(*) INTO v_count FROM public.jornadas;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BIT-61 aserción 1: quedaron % Jornadas, se esperaba 0 -- la limpieza de validación no funcionó.', v_count;
  END IF;

  -- 2) Únicamente Etel × Fundación Dolly con jornada_habilitada = true.
  SELECT count(*) INTO v_count FROM public.establecimientos_usuarios WHERE jornada_habilitada = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BIT-61 aserción 2: hay % filas con jornada_habilitada=true, se esperaba exactamente 1.', v_count;
  END IF;
  SELECT jornada_habilitada INTO v_bool FROM public.establecimientos_usuarios
    WHERE perfil_id = 'ebb6f7b7-9f9d-45a3-be64-0785a8ad6a82' AND establecimiento_id = '342b589b-91bf-4eed-b34e-b7fdbd4acd4d';
  IF v_bool IS NOT TRUE THEN
    RAISE EXCEPTION 'BIT-61 aserción 2: Etel x Fundación Dolly no quedó en jornada_habilitada=true.';
  END IF;

  -- 3/4) establecimiento_id existe y es NOT NULL.
  SELECT is_nullable INTO v_text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jornadas' AND column_name = 'establecimiento_id';
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'BIT-61 aserción 3: la columna establecimiento_id no existe.';
  ELSIF v_text <> 'NO' THEN
    RAISE EXCEPTION 'BIT-61 aserción 4: establecimiento_id es nullable (is_nullable=%), se esperaba NO.', v_text;
  END IF;

  -- 5) FK real hacia establecimientos.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.jornadas'::regclass AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%establecimiento_id%REFERENCES%establecimientos%'
  ) THEN
    RAISE EXCEPTION 'BIT-61 aserción 5: no se encontró la FK de establecimiento_id hacia establecimientos.';
  END IF;

  -- 6) Índice por establecimiento.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'jornadas' AND indexname = 'idx_jornadas_establecimiento_id'
  ) THEN
    RAISE EXCEPTION 'BIT-61 aserción 6: no existe el índice idx_jornadas_establecimiento_id.';
  END IF;

  -- 7) Trigger de inmutabilidad presente y habilitado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.jornadas'::regclass AND tgname = 'trg_jornadas_establecimiento_inmutable' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'BIT-61 aserción 7: el trigger trg_jornadas_establecimiento_inmutable no existe o está deshabilitado.';
  END IF;

  -- 8) Función tiene_jornada_habilitada existe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tiene_jornada_habilitada'
  ) THEN
    RAISE EXCEPTION 'BIT-61 aserción 8: la función tiene_jornada_habilitada no existe.';
  END IF;

  -- 9/10) EXECUTE de la función: authenticated sí, anon no.
  IF NOT has_function_privilege('authenticated', 'public.tiene_jornada_habilitada(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BIT-61 aserción 9: authenticated no tiene EXECUTE sobre tiene_jornada_habilitada.';
  END IF;
  IF has_function_privilege('anon', 'public.tiene_jornada_habilitada(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BIT-61 aserción 10: anon SÍ tiene EXECUTE sobre tiene_jornada_habilitada -- no debería.';
  END IF;

  -- 11) Policy jornadas_insert existe y exige las condiciones nuevas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jornadas' AND policyname = 'jornadas_insert' AND cmd = 'INSERT'
      AND with_check ILIKE '%tiene_jornada_habilitada%'
      AND with_check ILIKE '%tiene_acceso_establecimiento%'
  ) THEN
    RAISE EXCEPTION 'BIT-61 aserción 11: la policy jornadas_insert no existe o no exige las condiciones nuevas.';
  END IF;

  -- 12/13) GRANT de columna: INSERT sí, UPDATE no.
  IF NOT has_column_privilege('authenticated', 'public.jornadas', 'establecimiento_id', 'INSERT') THEN
    RAISE EXCEPTION 'BIT-61 aserción 12: authenticated no tiene INSERT sobre la columna establecimiento_id.';
  END IF;
  IF has_column_privilege('authenticated', 'public.jornadas', 'establecimiento_id', 'UPDATE') THEN
    RAISE EXCEPTION 'BIT-61 aserción 13: authenticated SÍ tiene UPDATE sobre establecimiento_id -- la inmutabilidad por GRANT se rompió.';
  END IF;

  RAISE NOTICE 'BIT-61: las 13 aserciones pre-COMMIT pasaron correctamente.';
END $$;

-- Se alcanza únicamente si NINGÚN paso anterior abortó con RAISE EXCEPTION
-- -- no hay decisión manual que tomar acá, a diferencia de la versión
-- anterior (076c45f): cualquier desviación ya habría abortado toda la
-- transacción antes de llegar a esta línea.
COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-COMMIT (solo lectura, informativa -- correr después,
-- en cualquier sesión, ya no forma parte de la transacción atómica)
-- ════════════════════════════════════════════════════════════════════════
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jornadas' AND column_name='establecimiento_id';
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid='public.jornadas'::regclass AND tgname='trg_jornadas_establecimiento_inmutable';
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='jornadas' AND policyname='jornadas_insert';
--   SELECT count(*) FROM jornadas; -- esperado 0
--   SELECT eu.*, p.nombre, e.nombre FROM establecimientos_usuarios eu
--   JOIN perfiles p ON p.id=eu.perfil_id JOIN establecimientos e ON e.id=eu.establecimiento_id
--   WHERE eu.jornada_habilitada = true; -- esperado: EXACTAMENTE Etel + Fundación Dolly

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK DE RECUPERACIÓN (solo si ya se hizo COMMIT y hace falta deshacer
-- después; requiere autorización explícita; NO se ejecuta automáticamente)
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
