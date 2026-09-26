-- BIT-48 — Papelera piloto de Novedades: restaurar, eliminar definitivamente, listar Papelera
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── ALCANCE ─────────────────────────────────────────────────────────────
-- Crea EXACTAMENTE 3 funciones nuevas sobre novedades_establecimiento:
--   1. restore_novedad(p_novedad_id)                         -- restaurar
--   2. hard_delete_novedad(p_novedad_id, p_confirmar_adjuntos) -- eliminación definitiva
--   3. listar_novedades_papelera(p_establecimiento_id)        -- ver la Papelera
-- y sus grants. NO toca tablas, columnas, policies, triggers, datos ni otras
-- funciones. soft_delete_novedad() (Producción, BIT-10) se REUTILIZA sin cambios:
-- ya valida rol (solo ADMINISTRADOR), acceso al establecimiento, setea
-- deleted_at/deleted_by/updated_at/updated_by del lado del servidor y filtra
-- deleted_at IS NULL (definición confirmada por Claudy en BIT-46, 24 Sep 2026).
-- El cierre del DELETE directo vía policy va en migration-BIT-48b (separada,
-- se autoriza por separado, igual que se hizo en BIT-47).
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Correr primero diagnostico-BIT-48-novedades.sql y confirmar:
--   (a) columnas: deleted_at, deleted_by, updated_at, updated_by en
--       novedades_establecimiento; novedad_id en novedades_adjuntos;
--   (b) que ningún trigger impide poner deleted_at = NULL (restaurar);
--   (c) que las funciones nuevas NO existen todavía (CREATE OR REPLACE es
--       idempotente, pero no debe pisar algo distinto no documentado).
-- Si algo contradice lo asumido acá: DETENERSE y reportar.
--
-- ─── DECISIONES DE DISEÑO (BIT-35 + BIT-46) ──────────────────────────────
-- * Opción A de BIT-35 §7.2: una función específica por operación y por
--   entidad. Sin SQL dinámico, sin nombre de tabla recibido del cliente.
-- * Todas SECURITY DEFINER + search_path fijo (mismo patrón de las 5 funciones
--   de autorización confirmadas en Producción) y validan ANTES de escribir.
-- * Autorización con is_admin() (rol ADMINISTRADOR + perfil activo) y
--   tiene_acceso_establecimiento(). El actor (updated_by) sale de auth.uid(),
--   nunca de un parámetro.
-- * Restaurar: solo filas hoy en Papelera. Limpia deleted_at y deleted_by.
-- * Eliminar definitivamente: solo filas YA en Papelera (deleted_at IS NOT NULL)
--   -- nunca desde la vista normal. No confía en la FK de la base: cuenta
--   adjuntos explícitamente.
-- * novedades_adjuntos.novedad_id es ON DELETE CASCADE (única CASCADE del
--   dominio, confirmado en BIT-46): borrar la Novedad borra sus adjuntos.
--   Decisión documentada: el adjunto no tiene sentido sin su Novedad, así que
--   el CASCADE es el comportamiento deseado -- pero NO debe ocurrir por
--   sorpresa: si existen adjuntos, hard_delete_novedad() se niega salvo que
--   el llamador confirme explícitamente (p_confirmar_adjuntos = true), y la UI
--   muestra la cantidad antes de pedir esa confirmación. Hoy hay 0 adjuntos
--   (BIT-46) y todavía no existe la carga de archivos (BIT-13); cuando BIT-13
--   agregue archivos en Storage, el hard-delete deberá además eliminar los
--   objetos del bucket (esta función NO puede hacerlo -- ver "Deuda" en el
--   informe de BIT-48).
-- * listar_novedades_papelera() existe porque no se verificó textualmente que la
--   policy SELECT de novedades_establecimiento deje a ADMINISTRADOR leer filas
--   eliminadas: en vez de depender de eso, la lectura de la Papelera pasa por
--   una función admin-only que devuelve solo lo necesario. No debilita la
--   policy SELECT (la vista normal sigue excluyendo eliminadas, garantizado
--   por RLS existente).

-- ── 1. restore_novedad ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_novedad(p_novedad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede restaurar novedades.' USING ERRCODE = '42501';
  END IF;

  UPDATE novedades_establecimiento
     SET deleted_at = NULL,
         deleted_by = NULL,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_novedad_id
     AND deleted_at IS NOT NULL
     AND tiene_acceso_establecimiento(establecimiento_id);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Novedad no encontrada, no está en la Papelera, o sin acceso.' USING ERRCODE = '22023';
  END IF;
END;
$function$;

-- ── 2. hard_delete_novedad ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hard_delete_novedad(
  p_novedad_id uuid,
  p_confirmar_adjuntos boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_establecimiento uuid;
  v_deleted_at timestamptz;
  v_adjuntos integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede eliminar definitivamente novedades.' USING ERRCODE = '42501';
  END IF;

  SELECT n.establecimiento_id, n.deleted_at
    INTO v_establecimiento, v_deleted_at
    FROM novedades_establecimiento n
   WHERE n.id = p_novedad_id
   FOR UPDATE;

  IF NOT FOUND OR NOT tiene_acceso_establecimiento(v_establecimiento) THEN
    RAISE EXCEPTION 'Novedad no encontrada o sin acceso.' USING ERRCODE = '42501';
  END IF;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede eliminar definitivamente una novedad que ya está en la Papelera.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_adjuntos
    FROM novedades_adjuntos a
   WHERE a.novedad_id = p_novedad_id;

  IF v_adjuntos > 0 AND NOT COALESCE(p_confirmar_adjuntos, false) THEN
    RAISE EXCEPTION 'La novedad tiene % adjunto(s) que se eliminarían en cascada. Confirmá explícitamente para continuar.', v_adjuntos
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM novedades_establecimiento
   WHERE id = p_novedad_id
     AND deleted_at IS NOT NULL;
END;
$function$;

-- ── 3. listar_novedades_papelera ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.listar_novedades_papelera(p_establecimiento_id uuid)
RETURNS TABLE (
  id uuid,
  fecha date,
  tipo text,
  descripcion text,
  animal_nombre text,
  lote_nombre text,
  deleted_at timestamptz,
  deleted_by_nombre text,
  adjuntos_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo ADMINISTRADOR puede ver la Papelera.' USING ERRCODE = '42501';
  END IF;

  IF p_establecimiento_id IS NULL OR NOT tiene_acceso_establecimiento(p_establecimiento_id) THEN
    RAISE EXCEPTION 'Sin acceso al establecimiento indicado.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT n.id,
         n.fecha::date,
         n.tipo::text,
         n.descripcion::text,
         a.nombre::text,
         l.nombre::text,
         n.deleted_at::timestamptz,
         p.nombre::text,
         (SELECT count(*)::integer FROM novedades_adjuntos na WHERE na.novedad_id = n.id)
    FROM novedades_establecimiento n
    LEFT JOIN animales a ON a.id = n.animal_id
    LEFT JOIN lotes l ON l.id = n.lote_id
    LEFT JOIN perfiles p ON p.id = n.deleted_by
   WHERE n.establecimiento_id = p_establecimiento_id
     AND n.deleted_at IS NOT NULL
   ORDER BY n.deleted_at DESC;
END;
$function$;

-- ── 4. GRANTS (deny by default) ────────────────────────────────────────────
-- Solo usuarios autenticados pueden invocar; la autorización real (ADMINISTRADOR)
-- ocurre dentro de cada función. Sin acceso para PUBLIC ni anon.
REVOKE ALL ON FUNCTION public.restore_novedad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hard_delete_novedad(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_novedades_papelera(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_novedad(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_novedad(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_novedades_papelera(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_novedad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_novedad(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_novedades_papelera(uuid) TO authenticated;

-- ── PASO 3 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ───────
-- Ejecutar con sesiones reales por rol (set_config('request.jwt.claim.sub', ...)
-- + SET LOCAL ROLE authenticated), como se hizo en BIT-11/BIT-47. Todo dentro
-- de BEGIN ... ROLLBACK -- no dejar datos de prueba. Usar una novedad de prueba
-- creada DENTRO de la transacción (no tocar la novedad real existente).
--
--   1. ADMINISTRADOR: soft_delete_novedad(x) → OK; listar_novedades_papelera(est)
--      devuelve x con deleted_by_nombre; restore_novedad(x) → OK y vuelve a verse
--      en la vista normal.
--   2. ADMINISTRADOR: hard_delete_novedad(y) sobre novedad ACTIVA → DEBE FALLAR
--      ("ya está en la Papelera").
--   3. ADMINISTRADOR: soft_delete → hard_delete_novedad(x) → OK; la fila ya no existe.
--   4. ADMINISTRADOR: novedad en Papelera con 1 adjunto insertado en la misma
--      transacción → hard_delete_novedad(x) sin confirmar DEBE FALLAR;
--      con p_confirmar_adjuntos = true → OK y el adjunto también desaparece.
--   5. PROFESIONAL y OPERADOR_CAMPO: restore_novedad, hard_delete_novedad y
--      listar_novedades_papelera → los TRES DEBEN FALLAR ("Solo ADMINISTRADOR").
--   6. ADMINISTRADOR con establecimiento no autorizado / NULL en
--      listar_novedades_papelera → DEBE FALLAR.
--   7. anon: EXECUTE de las tres → DEBE FALLAR (permission denied).
-- ROLLBACK;

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('restore_novedad','hard_delete_novedad','listar_novedades_papelera');
--   -- prosecdef debe ser true en las tres.
--
--   SELECT routine_name, grantee, privilege_type
--   FROM information_schema.role_routine_grants
--   WHERE routine_schema = 'public'
--     AND routine_name IN ('restore_novedad','hard_delete_novedad','listar_novedades_papelera')
--   ORDER BY routine_name, grantee;
--   -- authenticated debe tener EXECUTE; no debe aparecer PUBLIC ni anon.

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Esta migración solo agrega funciones; revertirla no afecta datos ni tablas:
--   DROP FUNCTION IF EXISTS public.listar_novedades_papelera(uuid);
--   DROP FUNCTION IF EXISTS public.hard_delete_novedad(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.restore_novedad(uuid);
-- Nota: si ya se eliminó definitivamente alguna novedad usando
-- hard_delete_novedad(), ese borrado NO es reversible por rollback.
