-- BIT-63 — Observaciones de Campo independientes de Visita + autoría de
-- Observaciones y Visitas (requisito de BIT-12)
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de
-- Bren/KLIAM sobre este SQL (versión revisada tras los 3 hallazgos de
-- integridad/seguridad de la ronda de revisión de KLIAM sobre el PR #11
-- original -- ver "CORRECCIONES DE ESTA RONDA" más abajo).
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
-- ─── CORRECCIONES DE ESTA RONDA (revisión KLIAM sobre PR #11 original) ──
-- 1. `created_by` estaba protegido en INSERT (trigger) pero NO en UPDATE
--    -- un cliente podía cambiarlo después de creado. Se agrega un trigger
--    BEFORE UPDATE que bloquea cualquier cambio (Paso 2e).
-- 2. `observaciones_campo.establecimiento_id` no tenía ninguna defensa de
--    inmutabilidad -- la policy UPDATE (USING + WITH CHECK idénticos,
--    `tiene_acceso_establecimiento(establecimiento_id)`) permitía mover
--    una Observación de un establecimiento A a otro B si el usuario tenía
--    acceso a ambos. Se agrega un trigger BEFORE UPDATE, mismo principio
--    que `jornadas_bloquear_cambio_establecimiento` de BIT-61 (Paso 2f).
-- 3. `visita_id` opcional no garantizaba que, cuando se asocia, la Visita
--    perteneciera al MISMO establecimiento que la Observación -- un
--    cliente con acceso a dos establecimientos podía asociar una
--    Observación de A con una Visita de B. Se agrega un trigger BEFORE
--    INSERT OR UPDATE que valida esa coherencia contra la propia tabla
--    `visitas` (Paso 2g).
-- 4. Nombres de función renombrados de un genérico `set_created_by()`
--    (riesgo real señalado por KLIAM: no se puede confirmar contra
--    Producción si ya existe una función homónima con otra semántica)
--    a nombres prefijados por tabla, mismo patrón ya usado en el repo
--    (`atenciones_clinicas_set_updated_by`) -- `CREATE OR REPLACE` sobre
--    un nombre así de específico es seguro incluso sin Claudy
--    confirmando antes, pero se mantiene la advertencia explícita más
--    abajo igual, por si existiera algo aún más específico.
--
-- ─── PASO 1 (OBLIGATORIO, SOLO LECTURA) — reconfirmar lo operativo ───────
-- Lo estructural de arriba no cambia solo por el paso del tiempo (nadie
-- migró estas tablas desde el 24 Sep); lo que SÍ puede haber cambiado es
-- el volumen real de filas, Y -- nuevo pedido de KLIAM -- los NOMBRES
-- REALES de las policies vigentes de observaciones_campo (no alcanza con
-- que el `DROP POLICY IF EXISTS <nombre_asumido>` del Paso 2h no falle:
-- si la policy productiva real tiene OTRO nombre, quedaría coexistiendo
-- con la nueva y Postgres combina policies PERMISSIVE con OR, ampliando
-- el alcance efectivo sin que nadie lo pida). Ejecutar y pegar TODO el
-- resultado antes de seguir:
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
--   -- OBLIGATORIO (KLIAM, punto 7): policies REALES vigentes hoy, con su
--   -- condición completa -- comparar explícitamente contra lo que el
--   -- informe original de BIT-46 documentó (arriba) antes de confiar en
--   -- los DROP POLICY IF EXISTS del Paso 2h. Si aparece un nombre o una
--   -- condición que NO coincide con lo documentado: DETENERSE, adaptar
--   -- el Paso 2h a los nombres reales antes de continuar -- nunca asumir
--   -- que "no falló" significa "quedó reemplazada".
--   SELECT policyname, cmd, permissive, qual, with_check
--   FROM pg_policies WHERE tablename = 'observaciones_campo'
--   ORDER BY cmd, policyname;
--
--   -- OBLIGATORIO (KLIAM, punto 5): confirmar que NO existe ya una
--   -- función con alguno de los 4 nombres nuevos de esta migración, con
--   -- una semántica distinta a la que este script va a crear. El grep
--   -- del repo no encontró ninguna (no hay CREATE FUNCTION versionado
--   -- con estos nombres en ningún .sql), pero Producción es la fuente
--   -- final.
--   SELECT proname, pg_get_functiondef(oid) AS definicion
--   FROM pg_proc WHERE proname IN (
--     'observaciones_campo_set_created_by', 'visitas_set_created_by',
--     'observaciones_campo_bloquear_cambio_created_by', 'visitas_bloquear_cambio_created_by',
--     'observaciones_campo_bloquear_cambio_establecimiento',
--     'observaciones_campo_validar_coherencia_visita'
--   );
--   -- Esperado: 0 filas (ninguna existe todavía). Si aparece alguna con
--   -- una definición distinta a la de este script: DETENERSE, no usar
--   -- CREATE OR REPLACE sobre ella -- renombrar la de esta migración a
--   -- algo específico de BIT-63 (ej. prefijo `bit63_`) y reportar antes
--   -- de continuar.
--
-- Si cualquiera de estos resultados no es el esperado: DETENERSE y
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
  'BIT-63: establecimiento al que pertenece la Observación -- obligatorio, independiente de si tiene o no una Visita asociada. Inmutable después de creada -- ver trigger observaciones_campo_bloquear_cambio_establecimiento. Para filas históricas (todas tenían visita_id NOT NULL) se completó por backfill desde visitas.establecimiento_id.';

-- ── 2b) observaciones_campo.visita_id deja de ser obligatorio ────────────
-- Una Observación de Campo ya no depende de una Visita (decisión funcional
-- de BIT-63) -- la relación sigue existiendo (FK intacta, por si se quiere
-- asociar opcionalmente), simplemente deja de ser NOT NULL.
ALTER TABLE public.observaciones_campo
  ALTER COLUMN visita_id DROP NOT NULL;

COMMENT ON COLUMN public.observaciones_campo.visita_id IS
  'BIT-63: vínculo OPCIONAL a la Visita durante la cual se hizo la Observación -- ya no es obligatorio. establecimiento_id es la pertenencia real, no esta columna. Cuando se asocia, DEBE pertenecer al mismo establecimiento -- ver trigger observaciones_campo_validar_coherencia_visita.';

-- ── 2c) Autoría: observaciones_campo.created_by + visitas.created_by ──────
-- Mismo nombre de columna que ya usa novedades_establecimiento.created_by
-- (convención real ya existente en el proyecto, no se inventa una nueva).
-- Nullable: las filas históricas (3 Observaciones, 7 Visitas al 24 Sep)
-- no tienen ninguna fuente confiable de autoría -- ni siquiera Jornada,
-- que hoy tiene 0 filas -- así que quedan NULL a propósito ("autor no
-- disponible" para lo histórico, nunca inferido, y NUNCA completado
-- automáticamente en una edición normal -- ver trigger de 2e, que
-- protege el valor que sea, incluido NULL). Las filas NUEVAS, desde que
-- el trigger de 2d exista, sí lo tendrán siempre.
ALTER TABLE public.observaciones_campo
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.visitas
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.observaciones_campo.created_by IS
  'BIT-63: autor real de la Observación, asignado server-side al crearla (trigger observaciones_campo_set_created_by) e INMUTABLE después (trigger observaciones_campo_bloquear_cambio_created_by) -- nunca lo decide el cliente. NULL en filas históricas anteriores a esta migración (autor no disponible, nunca inferido ni completado en una edición posterior).';
COMMENT ON COLUMN public.visitas.created_by IS
  'BIT-63: autor real de la Visita, asignado server-side al crearla (trigger visitas_set_created_by) e INMUTABLE después (trigger visitas_bloquear_cambio_created_by) -- nunca lo decide el cliente. NULL en filas históricas anteriores a esta migración (autor no disponible, nunca inferido ni completado en una edición posterior).';

-- ── 2d) Triggers BEFORE INSERT — asignación server-side de created_by ────
-- Un cliente podría intentar mandar un created_by propio en el payload del
-- INSERT -- este trigger lo SOBRESCRIBE siempre con auth.uid() real, sin
-- importar qué haya llegado. Nombres prefijados por tabla (no un nombre
-- genérico compartido) -- ver "CORRECCIONES DE ESTA RONDA" punto 4 y el
-- diagnóstico obligatorio del Paso 1 antes de aplicar con CREATE OR
-- REPLACE sobre un nombre que pudiera ya existir con otra semántica.
CREATE OR REPLACE FUNCTION public.observaciones_campo_set_created_by()
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
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_set_created_by();

CREATE OR REPLACE FUNCTION public.visitas_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS visitas_set_created_by ON public.visitas;
CREATE TRIGGER visitas_set_created_by
  BEFORE INSERT ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.visitas_set_created_by();

-- ── 2e) Triggers BEFORE UPDATE — created_by INMUTABLE (hallazgo KLIAM #1) ─
-- El trigger de 2d solo protege la creación -- nada impedía que, después,
-- un UPDATE cambiara created_by a cualquier otro valor (incluido
-- falsificar la autoría de un registro ya existente). Este trigger
-- bloquea CUALQUIER cambio al valor de created_by, sea cual sea (incluso
-- de NULL a un valor real -- el histórico sin autor NUNCA se completa en
-- una edición normal, por pedido explícito de KLIAM; eso solo podría
-- hacerse con un backfill aparte, explícito y basado en evidencia, nunca
-- como efecto colateral de esta migración ni de una edición cualquiera).
CREATE OR REPLACE FUNCTION public.observaciones_campo_bloquear_cambio_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'El autor (created_by) de una Observación no se puede modificar después de creada.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS observaciones_campo_bloquear_cambio_created_by ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_bloquear_cambio_created_by
  BEFORE UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_bloquear_cambio_created_by();

CREATE OR REPLACE FUNCTION public.visitas_bloquear_cambio_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'El autor (created_by) de una Visita no se puede modificar después de creada.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS visitas_bloquear_cambio_created_by ON public.visitas;
CREATE TRIGGER visitas_bloquear_cambio_created_by
  BEFORE UPDATE ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.visitas_bloquear_cambio_created_by();

-- ── 2f) Trigger BEFORE UPDATE — establecimiento_id INMUTABLE (hallazgo
-- KLIAM #2) ────────────────────────────────────────────────────────────
-- La policy UPDATE de observaciones_campo (ver 2h) usa USING y WITH CHECK
-- idénticos sobre tiene_acceso_establecimiento(establecimiento_id) -- eso
-- alcanza para que solo se pueda editar donde hay acceso, pero NO impide
-- mover la fila de un establecimiento A (con acceso) a otro B (también
-- con acceso) en un solo UPDATE. Mismo principio exacto ya aplicado en
-- BIT-61 para jornadas.establecimiento_id
-- (jornadas_bloquear_cambio_establecimiento) -- un trigger universal,
-- independiente de cualquier policy o rol, nunca dependiendo solo del
-- frontend.
CREATE OR REPLACE FUNCTION public.observaciones_campo_bloquear_cambio_establecimiento()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
    RAISE EXCEPTION 'El establecimiento de una Observación de Campo no se puede modificar después de creada.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS observaciones_campo_bloquear_cambio_establecimiento ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_bloquear_cambio_establecimiento
  BEFORE UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_bloquear_cambio_establecimiento();

-- ── 2g) Trigger BEFORE INSERT OR UPDATE — coherencia Visita↔Establecimiento
-- (hallazgo KLIAM #3) ──────────────────────────────────────────────────
-- Cuando visita_id NO es NULL, la Visita asociada DEBE pertenecer al
-- mismo establecimiento que la Observación -- una FK simple sobre
-- visita_id solo garantiza que la Visita exista, no que sea coherente.
-- Se valida contra la propia tabla visitas en cada INSERT/UPDATE (no solo
-- cuando visita_id cambia -- es más simple y más seguro revalidar
-- siempre que reconstruir la lógica de "cambió o no"). La pertenencia
-- principal sigue siendo establecimiento_id de la propia Observación
-- (ya inmutable por 2f) -- este trigger NUNCA corrige ni infiere el
-- establecimiento desde la Visita, solo rechaza la incoherencia.
CREATE OR REPLACE FUNCTION public.observaciones_campo_validar_coherencia_visita()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_establecimiento_visita uuid;
BEGIN
  IF NEW.visita_id IS NOT NULL THEN
    SELECT establecimiento_id INTO v_establecimiento_visita
    FROM public.visitas WHERE id = NEW.visita_id;

    IF v_establecimiento_visita IS DISTINCT FROM NEW.establecimiento_id THEN
      RAISE EXCEPTION 'La Visita asociada (establecimiento %) no pertenece al mismo establecimiento que la Observación (%).', v_establecimiento_visita, NEW.establecimiento_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS observaciones_campo_validar_coherencia_visita ON public.observaciones_campo;
CREATE TRIGGER observaciones_campo_validar_coherencia_visita
  BEFORE INSERT OR UPDATE ON public.observaciones_campo
  FOR EACH ROW EXECUTE FUNCTION public.observaciones_campo_validar_coherencia_visita();

-- ── 2h) Reescribir RLS de observaciones_campo (select/insert/update) ──────
-- Antes dependían de un EXISTS hacia visitas vía visita_id -- con
-- visita_id ahora opcional, esa condición fallaría siempre para una
-- Observación sin Visita. Se reemplaza por el mismo patrón que ya usa
-- visitas (tiene_acceso_establecimiento(establecimiento_id) directo),
-- ahora que la columna existe. Alcance de autorización SIN CAMBIOS
-- respecto a hoy (acceso por establecimiento, sin restricción de
-- ownership) -- no se amplía ni se restringe el criterio, solo se adapta
-- a la columna nueva. DELETE se deja exactamente como está (is_admin()
-- únicamente) -- no forma parte de esta migración.
--
-- ⚠️ OBLIGATORIO antes de ejecutar este bloque (pedido explícito de
-- KLIAM, punto 7): el Paso 1 ya debió haber listado las policies REALES
-- de observaciones_campo con `SELECT policyname, cmd, qual, with_check
-- FROM pg_policies WHERE tablename='observaciones_campo'`. Comparar cada
-- nombre/condición real contra lo documentado arriba (sección "HECHOS YA
-- CONFIRMADOS") y contra los nombres asumidos en los DROP POLICY de
-- abajo. Que un `DROP POLICY IF EXISTS <nombre>` no falle NO prueba que
-- reemplazó la policy real -- si el nombre real es distinto, la policy
-- vieja seguiría existiendo y Postgres combina policies PERMISSIVE con
-- OR, ampliando el alcance efectivo sin que nadie lo pida. Si algún
-- nombre o condición real no coincide: DETENERSE, ajustar los DROP
-- POLICY de abajo a los nombres reales antes de continuar.
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
-- La inmutabilidad real de establecimiento_id la garantiza el trigger de
-- 2f, no esta policy -- WITH CHECK acá solo exige que el establecimiento
-- (sea cual sea, inmutable) siga siendo uno al que el usuario tiene
-- acceso, igual que antes.

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
--                                  created_by en INSERT) -- no necesita
--                                  acceso a nada, solo ser un uuid real
--                                  distinto de <PROFESIONAL_ID>
--   <ESTABLECIMIENTO_ID>        -- un establecimiento real (A) al que
--                                  <PROFESIONAL_ID> tenga acceso
--                                  (tiene_acceso_establecimiento = true)
--   <OTRO_ESTABLECIMIENTO_ID>   -- un SEGUNDO establecimiento real (B),
--                                  DISTINTO del anterior, al que
--                                  <PROFESIONAL_ID> TAMBIÉN tenga acceso
--                                  (necesario para el Caso 8 -- si el
--                                  profesional no tiene acceso a ningún
--                                  segundo establecimiento, ese caso no
--                                  es cubrible con datos reales hoy; no
--                                  fabricar uno)
--   <ANIMAL_ID>                 -- un animal real del establecimiento A

DO $$
DECLARE
  v_profesional_id uuid := '<PROFESIONAL_ID>';
  v_otro_uuid       uuid := '<OTRO_UUID_CUALQUIERA>';
  v_establecimiento_id uuid := '<ESTABLECIMIENTO_ID>';
  v_otro_establecimiento_id uuid := '<OTRO_ESTABLECIMIENTO_ID>';
  v_animal_id       uuid := '<ANIMAL_ID>';
  v_obs1_id         uuid;
  v_obs2_id         uuid;
  v_visita1_id      uuid;
  v_visita_otro_est_id uuid;
  v_created_by_real uuid;
  v_establecimiento_real uuid;
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

    -- Caso 3 -- intento de falsificar created_by EN EL INSERT → DEBE
    -- quedar con el autor REAL (v_profesional_id), nunca con v_otro_uuid.
    INSERT INTO public.observaciones_campo (establecimiento_id, visita_id, descripcion, created_by)
    VALUES (v_establecimiento_id, NULL, 'Observación de prueba BIT-63 -- intento de spoofing en INSERT (validación)', v_otro_uuid)
    RETURNING created_by INTO v_created_by_real;

    IF v_created_by_real IS DISTINCT FROM v_profesional_id THEN
      RAISE EXCEPTION 'Caso 3: created_by quedó en % (se esperaba %, el autor real) -- el trigger de INSERT no está protegiendo contra spoofing.', v_created_by_real, v_profesional_id;
    END IF;
    RAISE NOTICE 'Caso 3 OK: created_by quedó en el autor real (%) a pesar del intento de spoofing en el INSERT.', v_created_by_real;

    -- Caso 4 -- Visita nueva, SIN hora_inicio/hora_fin (ya opcionales
    -- desde BIT-42, sin cambios acá) → DEBE PASAR y debe traer created_by
    -- asignado igual que las Observaciones. Misma v_establecimiento_id
    -- que las Observaciones de arriba -- necesaria para el Caso 5.
    INSERT INTO public.visitas (establecimiento_id, fecha, tipo, estado)
    VALUES (v_establecimiento_id, current_date, 'control', 'abierta')
    RETURNING id, created_by INTO v_visita1_id, v_created_by_real;

    IF v_created_by_real IS DISTINCT FROM v_profesional_id THEN
      RAISE EXCEPTION 'Caso 4: la Visita quedó con created_by=% (se esperaba %).', v_created_by_real, v_profesional_id;
    END IF;
    RAISE NOTICE 'Caso 4 OK: Visita creada sin horas, created_by asignado correctamente (%).', v_created_by_real;

    -- Caso 5 -- asociar opcionalmente la Observación del Caso 1 a la
    -- Visita del Caso 4, AMBAS del mismo establecimiento → DEBE PASAR
    -- (coherencia Observación↔Visita↔Establecimiento, caso positivo).
    UPDATE public.observaciones_campo SET visita_id = v_visita1_id WHERE id = v_obs1_id;
    RAISE NOTICE 'Caso 5 OK: Observación asociada a una Visita del mismo establecimiento.';

    -- Caso 6 -- intento de UPDATE de created_by sobre un registro YA
    -- creado → DEBE FALLAR (trigger de inmutabilidad de 2e).
    BEGIN
      UPDATE public.observaciones_campo SET created_by = v_otro_uuid WHERE id = v_obs1_id;
      RAISE EXCEPTION 'Caso 6: se esperaba que el UPDATE de created_by fallara y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        RAISE NOTICE 'Caso 6 OK (P0001): UPDATE de created_by bloqueado por el trigger de inmutabilidad.';
    END;

    -- Caso 7 -- intento de UPDATE de establecimiento_id sobre un registro
    -- YA creado → DEBE FALLAR (trigger de inmutabilidad de 2f).
    BEGIN
      UPDATE public.observaciones_campo SET establecimiento_id = v_otro_establecimiento_id WHERE id = v_obs2_id;
      RAISE EXCEPTION 'Caso 7: se esperaba que el UPDATE de establecimiento_id fallara y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        RAISE NOTICE 'Caso 7 OK (P0001): UPDATE de establecimiento_id bloqueado por el trigger de inmutabilidad.';
    END;

    -- Caso 8 -- Visita de OTRO establecimiento asociada a una Observación
    -- del establecimiento A → DEBE FALLAR (trigger de coherencia de 2g).
    -- La Visita en sí se crea válidamente en v_otro_establecimiento_id
    -- (no es lo que se prueba); lo que debe fallar es el INTENTO de
    -- asociarla a una Observación de un establecimiento distinto.
    INSERT INTO public.visitas (establecimiento_id, fecha, tipo, estado)
    VALUES (v_otro_establecimiento_id, current_date, 'control', 'abierta')
    RETURNING id INTO v_visita_otro_est_id;

    BEGIN
      UPDATE public.observaciones_campo SET visita_id = v_visita_otro_est_id WHERE id = v_obs2_id;
      RAISE EXCEPTION 'Caso 8: se esperaba que la asociación con una Visita de otro establecimiento fallara y no falló' USING ERRCODE = 'ZZ099';
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        RAISE NOTICE 'Caso 8 OK (P0001): asociación con Visita de otro establecimiento bloqueada por el trigger de coherencia.';
    END;

    -- Todos los casos obligatorios pasaron exactamente como se esperaba:
    -- revertir TODO lo escrito por este bloque (Observaciones, Visitas,
    -- y el intento fallido que ya se revirtió solo al capturar su propia
    -- excepción) sin afectar nada del Paso 2 (que se queda, es el cambio
    -- real).
    RAISE EXCEPTION 'BIT63_VALIDACION_OK' USING ERRCODE = 'ZZ900';

  EXCEPTION
    WHEN SQLSTATE 'ZZ900' THEN
      RAISE NOTICE 'BIT-63: los 8 casos de validación pasaron -- datos de prueba revertidos automáticamente.';
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

  -- 5) Los 6 triggers de esta migración están presentes y habilitados.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.observaciones_campo'::regclass AND tgname='observaciones_campo_set_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger observaciones_campo_set_created_by no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.visitas'::regclass AND tgname='visitas_set_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger visitas_set_created_by no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.observaciones_campo'::regclass AND tgname='observaciones_campo_bloquear_cambio_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger observaciones_campo_bloquear_cambio_created_by no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.visitas'::regclass AND tgname='visitas_bloquear_cambio_created_by' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger visitas_bloquear_cambio_created_by no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.observaciones_campo'::regclass AND tgname='observaciones_campo_bloquear_cambio_establecimiento' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger observaciones_campo_bloquear_cambio_establecimiento no existe o está deshabilitado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.observaciones_campo'::regclass AND tgname='observaciones_campo_validar_coherencia_visita' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'BIT-63 aserción 5: trigger observaciones_campo_validar_coherencia_visita no existe o está deshabilitado.';
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
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid IN ('public.observaciones_campo'::regclass, 'public.visitas'::regclass) AND NOT tgisinternal
--   ORDER BY tgrelid, tgname; -- deben aparecer los 6 triggers nuevos, todos habilitados

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
