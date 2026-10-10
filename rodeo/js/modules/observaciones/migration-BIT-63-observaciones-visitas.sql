-- BIT-63 — Observaciones de Campo independientes de Visita + autoría de
-- Observaciones y Visitas (requisito de BIT-12)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de
-- Bren/KLIAM sobre este SQL.
--
-- ─── HECHOS YA CONFIRMADOS CONTRA PRODUCCIÓN REAL (reutilizados, no se pide
-- un diagnóstico nuevo de cero) ──────────────────────────────────────────
-- Fuente: Notion "Diagnóstico de Producción — eliminación, RLS y
-- relaciones" (BIT-46), complementación real de Claudy, 24 Sep 2026 --
-- 100% solo lectura contra el proyecto `tejnjojuoiuehnpsynof` (PRODUCTION).
--
--   observaciones_campo:
--     - FK animal_id → animales(id) NO ACTION; FK lote_id → lotes(id) NO
--       ACTION; FK visita_id → visitas(id) NO ACTION, columna **NOT NULL**.
--     - NO existe columna de autoría (ninguna FK hacia perfiles/auth.users
--       además de animal_id/lote_id/visita_id).
--     - NO existe columna establecimiento_id.
--     - NO existe deleted_at (ninguna tabla de dominio la tiene salvo
--       novedades_establecimiento).
--     - RLS: select/insert/update dependen de
--       `EXISTS (SELECT 1 FROM visitas v WHERE v.id = observaciones_campo.visita_id
--                AND tiene_acceso_establecimiento(v.establecimiento_id))`;
--       delete restringida a `is_admin()`.
--     - Índice existente sobre `visita_id`. 3 filas (24 Sep 2026 -- dato
--       operativo, reconfirmar antes de aplicar, ver Paso 1 abajo).
--
--   visitas:
--     - FK establecimiento_id → establecimientos(id) NO ACTION; FK
--       jornada_id → jornadas(id) NO ACTION (0 de 7 filas con valor,
--       confirmado -- no se activa en esta migración, ver nota al final);
--       FK lote_id → lotes(id) NO ACTION (BIT-42).
--     - NO existe columna de autoría.
--     - NO existe deleted_at.
--     - RLS: select/insert/update/delete, las 4, dependen únicamente de
--       `tiene_acceso_establecimiento(establecimiento_id)`, sin distinción
--       de rol ni referencia a ninguna otra columna.
--     - 7 filas (24 Sep 2026 -- mismo criterio de reconfirmación).
--
--   Funciones de autorización (definición completa y confirmada,
--   reutilizadas sin cambios): `is_admin()`, `get_mi_rol()`,
--   `tiene_acceso_establecimiento(est_id)` -- las 3 `STABLE SECURITY
--   DEFINER`, `search_path` fijo a `'public'`.
--
-- ─── PASO 1 (OBLIGATORIO, SOLO LECTURA) — reconfirmar lo operativo ───────
-- Lo estructural de arriba no cambia solo por el paso del tiempo (nadie
-- migró estas tablas desde el 24 Sep); lo que SÍ puede haber cambiado es
-- el volumen real de filas. Ejecutar y pegar el resultado antes de seguir:
--
--   SELECT count(*) AS visitas_total FROM visitas;
--   SELECT count(*) AS observaciones_total FROM observaciones_campo;
--   SELECT count(*) AS observaciones_sin_visita FROM observaciones_campo WHERE visita_id IS NULL;
--   -- Esperado: 0 -- la columna sigue NOT NULL hasta que este script la
--   -- cambie; si diera >0, DETENERSE, algo contradice lo confirmado arriba.
--   SELECT count(*) AS observaciones_con_visita_sin_establecimiento
--   FROM observaciones_campo oc JOIN visitas v ON v.id = oc.visita_id
--   WHERE v.establecimiento_id IS NULL;
--   -- Esperado: 0 -- necesario para que el backfill del Paso 2a no deje
--   -- ninguna fila sin establecimiento_id antes de exigir NOT NULL.
--
-- Si cualquiera de estos 4 resultados no es el esperado: DETENERSE y
-- reportar antes de continuar con el Paso 2.

-- ════════════════════════════════════════════════════════════════════════
-- TRANSACCIÓN ÚNICA — CAMBIO + VALIDACIÓN, ATÓMICA
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 2a) observaciones_campo.establecimiento_id (NOT NULL, FK, índice) ────
-- Se agrega nullable, se completa (backfill) desde la única fuente
-- confiable que existe HOY para las filas históricas (su Visita, porque
-- visita_id todavía es NOT NULL en este punto de la migración), y recién
-- después se exige NOT NULL -- en ese orden, para que ninguna fila
-- histórica quede fuera.
ALTER TABLE public.observaciones_campo
  ADD COLUMN IF NOT EXISTS establecimiento_id uuid REFERENCES public.establecimientos(id);

UPDATE public.observaciones_campo oc
SET establecimiento_id = v.establecimiento_id
FROM public.visitas v
WHERE v.id = oc.visita_id
  AND oc.establecimiento_id IS NULL;

-- Verificación obligatoria antes de exigir NOT NULL -- si el backfill no
-- alcanzó a cubrir alguna fila (no debería pasar dado el Paso 1), esto
-- aborta la migración entera en vez de dejar una columna NOT NULL
-- inalcanzable.
DO $$
DECLARE
  v_sin_establecimiento integer;
BEGIN
  SELECT count(*) INTO v_sin_establecimiento
  FROM public.observaciones_campo WHERE establecimiento_id IS NULL;

  IF v_sin_establecimiento <> 0 THEN
    RAISE EXCEPTION 'BIT-63: % Observaciones quedaron sin establecimiento_id después del backfill -- abortando.', v_sin_establecimiento;
  END IF;
END $$;

ALTER TABLE public.observaciones_campo
  ALTER COLUMN establecimiento_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_observaciones_campo_establecimiento_id
  ON public.observaciones_campo(establecimiento_id);

COMMENT ON COLUMN public.observaciones_campo.establecimiento_id IS
  'BIT-63: establecimiento al que pertenece la Observación -- obligatorio, independiente de si tiene o no una Visita asociada. Para filas históricas (todas tenían visita_id NOT NULL) se completó por backfill desde visitas.establecimiento_id.';

-- ── 2b) observaciones_campo.visita_id deja de ser obligatorio ────────────
-- Una Observación de Campo ya no depende de una Visita (decisión funcional
-- de BIT-63) -- la relación sigue existiendo (FK intacta, por si se quiere
-- asociar opcionalmente), simplemente deja de ser NOT NULL.
ALTER TABLE public.observaciones_campo
  ALTER COLUMN visita_id DROP NOT NULL;

COMMENT ON COLUMN public.observaciones_campo.visita_id IS
  'BIT-63: vínculo OPCIONAL a la Visita durante la cual se hizo la Observación -- ya no es obligatorio. establecimiento_id es la pertenencia real, no esta columna.';

-- ── 2c) Autoría: observaciones_campo.created_by + visitas.created_by ──────
-- Mismo nombre de columna que ya usa novedades_establecimiento.created_by
-- (convención real ya existente en el proyecto, no se inventa una nueva).
-- Nullable: las filas históricas (3 Observaciones, 7 Visitas al 24 Sep)
-- no tienen ninguna fuente confiable de autoría -- ni siquiera Jornada,
-- que hoy tiene 0 filas -- así que quedan NULL a propósito ("autor no
-- disponible" para lo histórico, nunca inferido). Las filas NUEVAS, desde
-- que el trigger de 2d exista, sí lo tendrán siempre.
ALTER TABLE public.observaciones_campo
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.visitas
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.observaciones_campo.created_by IS
  'BIT-63: autor real de la Observación, asignado server-side por trigger (nunca por el cliente) -- ver set_created_by(). NULL en filas históricas anteriores a esta migración (autor no disponible, nunca inferido).';
COMMENT ON COLUMN public.visitas.created_by IS
  'BIT-63: autor real de la Visita, asignado server-side por trigger (nunca por el cliente) -- ver set_created_by(). NULL en filas históricas anteriores a esta migración (autor no disponible, nunca inferido).';

-- ── 2d) Trigger de asignación server-side (defensa real contra spoofing) ─
-- Un cliente podría intentar mandar un created_by propio en el payload del
-- INSERT -- este trigger lo SOBRESCRIBE siempre con auth.uid() real, sin
-- importar qué haya llegado. No depende de conocer ni restringir el GRANT
-- de columna vigente de estas dos tablas (que esta migración no toca) --
-- la defensa es el trigger en sí, universal, mismo principio ya usado en
-- BIT-61 para la inmutabilidad de establecimiento_id en jornadas.
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS observaciones_campo_set_created_by ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_set_created_by
  BEFORE INSERT ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

DROP TRIGGER IF EXISTS visitas_set_created_by ON public.visitas;
CREATE TRIGGER visitas_set_created_by
  BEFORE INSERT ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ── 2e) Reescribir RLS de observaciones_campo (select/insert/update) ──────
-- Antes dependían de un EXISTS hacia visitas vía visita_id -- con
-- visita_id ahora opcional, esa condición fallaría siempre para una
-- Observación sin Visita. Se reemplaza por el mismo patrón que ya usa
-- visitas (tiene_acceso_establecimiento(establecimiento_id) directo),
-- ahora que la columna existe. Alcance de autorización SIN CAMBIOS
-- respecto a hoy (acceso por establecimiento, sin restricción de
-- ownership) -- no se amplía ni se restringe el criterio, solo se adapta
-- a la columna nueva. DELETE se deja exactamente como está (is_admin()
-- únicamente) -- no forma parte de esta migración.
DROP POLICY IF EXISTS observaciones_campo_select ON public.observaciones_campo;
CREATE POLICY observaciones_campo_select ON public.observaciones_campo
  FOR SELECT USING (tiene_acceso_establecimiento(establecimiento_id));

DROP POLICY IF EXISTS observaciones_campo_insert ON public.observaciones_campo;
CREATE POLICY observaciones_campo_insert ON public.observaciones_campo
  FOR INSERT WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));

DROP POLICY IF EXISTS observaciones_campo_update ON public.observaciones_campo;
CREATE POLICY observaciones_campo_update ON public.observaciones_campo
  FOR UPDATE
  USING (tiene_acceso_establecimiento(establecimiento_id))
  WITH CHECK (tiene_acceso_establecimiento(establecimiento_id));
-- Nombres de policy (observaciones_campo_select/_insert/_update) asumidos
-- por convención con el resto del dominio (ej. atenciones_clinicas_select)
-- -- si el nombre real difiere, Claudy debe ajustar el DROP POLICY IF
-- EXISTS antes de aplicar (un nombre que no existe no rompe nada, el IF
-- EXISTS lo tolera; el riesgo real sería que la policy real tuviera OTRO
-- nombre Y otra condición que esta migración no reemplace -- por eso
-- sigue siendo prudente que Claudy confirme con
-- `SELECT policyname FROM pg_policies WHERE tablename='observaciones_campo'`
-- antes de correr este bloque, aunque el Paso 1 ya mostró la condición
-- real).

-- No se toca RLS de `visitas` -- sus 4 policies ya dependen únicamente de
-- tiene_acceso_establecimiento(establecimiento_id) desde antes de esta
-- migración, agregar created_by no les cambia nada.

-- ════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN (misma transacción, obligatoria antes de decidir COMMIT)
-- ════════════════════════════════════════════════════════════════════════
-- Mismo mecanismo ya validado en BIT-61: impersonar a un PROFESIONAL real
-- con SET LOCAL role + request.jwt.claims, bloques PL/pgSQL BEGIN...
-- EXCEPTION...END en vez de SAVEPOINT de sesión (inválido dentro de un
-- bloque PL/pgSQL), limpieza automática de los datos de prueba vía un
-- sentinel al final, nunca por inferencia ni por confiar en que "ya se
-- va a hacer ROLLBACK total si algo sale mal" sin verificarlo.
--
-- SUSTITUIR antes de ejecutar (valores reales, no inventados):
--   <PROFESIONAL_ID>            -- un perfil real con rol PROFESIONAL
--   <OTRO_UUID_CUALQUIERA>      -- cualquier uuid real DISTINTO al de
--                                  arriba (ej. el id de otro perfil), para
--                                  el Caso 3 (intento de spoofing de
--                                  created_by) -- no necesita acceso a
--                                  nada, solo debe ser un uuid que NO sea
--                                  el de <PROFESIONAL_ID>
--   <ESTABLECIMIENTO_ID>        -- un establecimiento real al que
--                                  <PROFESIONAL_ID> tenga acceso
--                                  (tiene_acceso_establecimiento = true)
--   <ANIMAL_ID>                 -- un animal real de ese establecimiento

DO $$
DECLARE
  v_profesional_id uuid := '<PROFESIONAL_ID>';
  v_otro_uuid       uuid := '<OTRO_UUID_CUALQUIERA>';
  v_establecimiento_id uuid := '<ESTABLECIMIENTO_ID>';
  v_animal_id       uuid := '<ANIMAL_ID>';
  v_obs1_id         uuid;
  v_obs2_id         uuid;
  v_visita1_id      uuid;
  v_created_by_real uuid;
BEGIN
  EXECUTE 'RESET role';
  EXECUTE 'SET LOCAL role = ''authenticated''';
  EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', v_profesional_id::text, 'role', 'authenticated')::text);
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_profesional_id::text);

  BEGIN -- bloque de validación completo -- se revierte al final con el sentinel ZZ900

    -- Caso 1 -- Observación SIN Visita, SIN paciente → DEBE PASAR (el
    -- objetivo central de BIT-63: ya no depende de una Visita).
    INSERT INTO public.observaciones_campo (establecimiento_id, visita_id, descripcion, sujeto_tipo, animal_id)
    VALUES (v_establecimiento_id, NULL, 'Observación de prueba BIT-63 -- sin Visita (validación)', NULL, NULL)
    RETURNING id INTO v_obs1_id;

    -- Caso 2 -- Observación SIN Visita, CON paciente → DEBE PASAR.
    INSERT INTO public.observaciones_campo (establecimiento_id, visita_id, descripcion, sujeto_tipo, animal_id)
    VALUES (v_establecimiento_id, NULL, 'Observación de prueba BIT-63 -- con paciente (validación)', 'animal', v_animal_id)
    RETURNING id INTO v_obs2_id;

    -- Caso 3 -- intento de falsificar created_by desde el "cliente" →
    -- DEBE quedar con el autor REAL (v_profesional_id), nunca con
    -- v_otro_uuid, sin importar que el INSERT lo haya incluido.
    INSERT INTO public.observaciones_campo (establecimiento_id, visita_id, descripcion, created_by)
    VALUES (v_establecimiento_id, NULL, 'Observación de prueba BIT-63 -- intento de spoofing (validación)', v_otro_uuid)
    RETURNING created_by INTO v_created_by_real;

    IF v_created_by_real IS DISTINCT FROM v_profesional_id THEN
      RAISE EXCEPTION 'Caso 3: created_by quedó en % (se esperaba %, el autor real) -- el trigger no está protegiendo contra spoofing.', v_created_by_real, v_profesional_id;
    END IF;
    RAISE NOTICE 'Caso 3 OK: created_by quedó en el autor real (%) a pesar del intento de spoofing.', v_created_by_real;

    -- Caso 4 -- Visita nueva, SIN hora_inicio/hora_fin (ya opcionales
    -- desde BIT-42, sin cambios acá) → DEBE PASAR y debe traer created_by
    -- asignado igual que las Observaciones.
    INSERT INTO public.visitas (establecimiento_id, fecha, tipo, estado)
    VALUES (v_establecimiento_id, current_date, 'control', 'abierta')
    RETURNING id, created_by INTO v_visita1_id, v_created_by_real;

    IF v_created_by_real IS DISTINCT FROM v_profesional_id THEN
      RAISE EXCEPTION 'Caso 4: la Visita quedó con created_by=% (se esperaba %).', v_created_by_real, v_profesional_id;
    END IF;
    RAISE NOTICE 'Caso 4 OK: Visita creada sin horas, created_by asignado correctamente (%).', v_created_by_real;

    -- Caso 5 -- asociar opcionalmente la Observación del Caso 1 a la
    -- Visita del Caso 4 (UPDATE, visita_id ahora es opcional en ambas
    -- direcciones: se puede dejar sin asociar O asociar después) → DEBE
    -- PASAR.
    UPDATE public.observaciones_campo SET visita_id = v_visita1_id WHERE id = v_obs1_id;

    -- Todo lo de arriba pasó exactamente como se esperaba: revertir los
    -- datos de prueba (Observaciones y Visita de este bloque) sin afectar
    -- nada de lo aplicado en el Paso 2 (que se queda, es el cambio real).
    RAISE EXCEPTION 'BIT63_VALIDACION_OK' USING ERRCODE = 'ZZ900';

  EXCEPTION
    WHEN SQLSTATE 'ZZ900' THEN
      RAISE NOTICE 'BIT-63: los 5 casos de validación pasaron -- datos de prueba revertidos automáticamente.';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'BIT-63: la validación falló de forma inesperada (SQLSTATE=%, mensaje=%) -- abortando toda la migración.', SQLSTATE, SQLERRM;
  END;

  EXECUTE 'RESET role';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- ASERCIONES OBLIGATORIAS PRE-COMMIT (programáticas)
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count bigint;
  v_text  text;
BEGIN
  -- 1) Ninguna Observación/Visita de prueba sobrevivió a la limpieza.
  SELECT count(*) INTO v_count FROM public.observaciones_campo WHERE descripcion ILIKE '%prueba BIT-63%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BIT-63 aserción 1: quedaron % Observaciones de prueba, se esperaba 0.', v_count;
  END IF;

  -- 2) observaciones_campo.establecimiento_id existe y es NOT NULL.
  SELECT is_nullable INTO v_text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='observaciones_campo' AND column_name='establecimiento_id';
  IF v_text IS NULL OR v_text <> 'NO' THEN
    RAISE EXCEPTION 'BIT-63 aserción 2: establecimiento_id no existe o es nullable (is_nullable=%).', v_text;
  END IF;

  -- 3) observaciones_campo.visita_id sigue existiendo pero ya es nullable.
  SELECT is_nullable INTO v_text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='observaciones_campo' AND column_name='visita_id';
  IF v_text IS NULL OR v_text <> 'YES' THEN
    RAISE EXCEPTION 'BIT-63 aserción 3: visita_id no existe o sigue siendo NOT NULL (is_nullable=%).', v_text;
  END IF;

  -- 4) created_by existe en ambas tablas.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='observaciones_campo' AND column_name='created_by') THEN
    RAISE EXCEPTION 'BIT-63 aserción 4: observaciones_campo.created_by no existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visitas' AND column_name='created_by') THEN
    RAISE EXCEPTION 'BIT-63 aserción 4: visitas.created_by no existe.';
  END IF;

  -- 5) Triggers de autoría presentes y habilitados en ambas tablas.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.observaciones_campo'::regclass AND tgname='observaciones_campo_set_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger de autoría de observaciones_campo no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.visitas'::regclass AND tgname='visitas_set_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger de autoría de visitas no existe o está deshabilitado.';
  END IF;

  -- 6) Ninguna Observación histórica quedó sin establecimiento_id (ya
  --    verificado antes del NOT NULL, se repite acá como cierre).
  SELECT count(*) INTO v_count FROM public.observaciones_campo WHERE establecimiento_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BIT-63 aserción 6: % Observaciones sin establecimiento_id.', v_count;
  END IF;

  RAISE NOTICE 'BIT-63: las 6 aserciones pre-COMMIT pasaron correctamente.';
END $$;

-- Se alcanza únicamente si NINGÚN paso anterior abortó con RAISE EXCEPTION.
COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-COMMIT (solo lectura, informativa)
-- ════════════════════════════════════════════════════════════════════════
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name IN ('observaciones_campo','visitas') AND column_name IN ('establecimiento_id','visita_id','created_by')
--   ORDER BY table_name, column_name;
--   SELECT count(*) FROM observaciones_campo; -- debe ser igual al conteo del Paso 1 (nada de prueba quedó)
--   SELECT count(*) FROM visitas;             -- idem
--   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='observaciones_campo';

-- ────────────────────────────────────────────────────────────────────────
-- NOTA -- visitas.jornada_id y visitas.hora_inicio/hora_fin: deuda técnica
-- documentada, NO tocada en esta migración
-- ────────────────────────────────────────────────────────────────────────
-- `jornada_id`: FK real confirmada (24 Sep 2026), 0 de 7 filas con valor.
-- BIT-12 ya NO depende de Jornada (modelo Fecha+Profesional+Establecimiento,
-- Jornada es fuente opcional) -- no hace falta activarla, y tampoco se usa
-- como atajo de autoría (eso ahora lo resuelve created_by). Queda como
-- columna reservada para un caso real futuro, o candidata a retirar en una
-- migración aparte si alguna vez se confirma que no sirve para nada -- no
-- se decide acá, no se amplía el alcance de BIT-63 a esto.
-- `hora_inicio`/`hora_fin`: dejan de usarse en el frontend (ver PR) pero
-- las columnas NO se eliminan de la base -- se confirmó que no las usa
-- ningún otro módulo (grep sin resultados fuera de rodeo/js/modules/visitas)
-- ni ninguna policy/trigger relevado en BIT-46. Quedan como deuda técnica
-- documentada -- su eliminación (si se decide) es una migración aparte,
-- separada de este cambio funcional.
