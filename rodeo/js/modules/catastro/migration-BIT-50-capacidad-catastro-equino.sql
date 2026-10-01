-- BIT-50 (ronda 2) — Capacidad "Catastro Equino" habilitable por Establecimiento
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── OBJETIVO ────────────────────────────────────────────────────────────
-- Catastro Equino deja de ser "de Dolly": es una capacidad que cada
-- Establecimiento tiene habilitada o no. Hoy solo Fundación Dolly. Mañana
-- otro establecimiento se habilita con un UPDATE (ver ALTA FUTURA abajo),
-- sin tocar código. El nombre del establecimiento NO decide nada.
--
-- Diseño: UNA columna booleana en `establecimientos`. Se descartó una tabla
-- de capacidades (infraestructura sin segunda capacidad que la justifique)
-- y se descartó derivarla del nombre. Si aparece una segunda capacidad por
-- establecimiento, recién ahí conviene evaluar una tabla genérica.
--
-- Lectura: la columna viaja en el SELECT normal de `establecimientos` ya
-- scopeado por RLS (tiene_acceso_establecimiento): cada usuario ve la
-- capacidad solo de los establecimientos a los que ya tiene acceso. No se
-- agrega ni se modifica ninguna policy.
--
-- Escritura: NO se crea ninguna policy UPDATE para el frontend sobre esta
-- columna -- habilitar un establecimiento es una operación de
-- administración que se hace por SQL (hasta que exista BIT-41).
--
-- Alcance de la protección: la capacidad gobierna el MÓDULO (menú + ruta
-- #catastro). No es una barrera de base de datos: el alta de Pacientes por
-- la pantalla normal de Pacientes sigue disponible con las mismas reglas de
-- siempre. Es una capacidad de producto, no de seguridad.
--
-- Compatibilidad: el frontend tolera que la columna todavía no exista
-- (reintenta el SELECT sin ella y trata a todos como "no habilitado").
-- Orden seguro: aplicar esta migración ANTES de mergear/usar el frontend
-- nuevo en Producción; sin ella el módulo queda oculto para todos.

-- ── PASO 1 (SOLO LECTURA) ──────────────────────────────────────────────────
-- 1a) Confirmar que la columna no existe ya y ver las columnas actuales:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'establecimientos'
ORDER BY ordinal_position;

-- 1b) Confirmar la identidad de Fundación Dolly (debe ser EXACTAMENTE 1 fila,
-- creada por migration-BIT-50-establecimiento-dolly.sql):
SELECT id, nombre FROM establecimientos WHERE nombre = 'Fundación Dolly';

-- ── PASO 2 — COLUMNA (idempotente) ─────────────────────────────────────────
ALTER TABLE public.establecimientos
  ADD COLUMN IF NOT EXISTS catastro_equino_habilitado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establecimientos.catastro_equino_habilitado IS
  'BIT-50: true = el establecimiento tiene habilitado el módulo Catastro Equino (alta rápida de equinos). Default false.';

-- ── PASO 3 — HABILITAR FUNDACIÓN DOLLY (única vez, por nombre exacto) ─────
-- El nombre se usa SOLO acá, como dato semilla puntual. La aplicación nunca
-- decide por nombre.
UPDATE public.establecimientos
SET catastro_equino_habilitado = true
WHERE nombre = 'Fundación Dolly';

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT nombre, catastro_equino_habilitado FROM establecimientos ORDER BY nombre;
--   -- Esperado: solo 'Fundación Dolly' = true; el resto = false.

-- ── ALTA FUTURA DE OTRO ESTABLECIMIENTO (ejemplo, no ejecutar ahora) ───────
--   UPDATE public.establecimientos SET catastro_equino_habilitado = true
--   WHERE id = '<uuid del establecimiento>';

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   ALTER TABLE public.establecimientos DROP COLUMN IF EXISTS catastro_equino_habilitado;
--   (el frontend vuelve a tratar a todos como "no habilitado": el módulo
--   queda oculto, sin errores.)
