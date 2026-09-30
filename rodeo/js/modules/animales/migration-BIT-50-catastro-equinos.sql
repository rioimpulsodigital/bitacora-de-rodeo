-- BIT-50 — Catastro equino Fundación Dolly: columnas nuevas en `animales`
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── OBJETIVO ────────────────────────────────────────────────────────────
-- Agregar a `animales` las columnas mínimas necesarias para el catastro
-- rápido de equinos de Fundación Dolly, reutilizando el modelo de Paciente
-- Animal vigente (BIT-07/BIT-11) en vez de crear una entidad paralela.
--
-- ─── DECISIÓN — QUÉ NO SE AGREGA ─────────────────────────────────────────
-- "Número de Identificación" NO es una columna nueva: se decidió reutilizar
-- `animales.nombre` (ya existente, ya nullable, ya es el campo que consumen
-- los selectores de Atenciones/Novedades para mostrar el Paciente). Crear
-- una columna paralela habría dejado estos equinos mostrándose como "Sin
-- identificar" en el resto de la app. Ver informe de BIT-50 (Notion),
-- sección "Decisión técnica de integración", punto 2.
--
-- ─── COLUMNAS QUE SÍ SE AGREGAN (todas nullable, sin CHECK, sin default) ──
-- `sexo` text            -- catálogo sugerido en frontend (Macho/Hembra/No
--                            determinado), SIN CHECK rígido en la base --
--                            mismo criterio ya aprobado por Bren en BIT-42
--                            para `categoria` de Visitas: no bloquear casos
--                            futuros no previstos. No resuelve BIT-14 (que
--                            además vincula Categoría↔Especie); esto es solo
--                            un valor plano en Pacientes.
-- `pelaje` text           -- hoy vive informalmente dentro del textarea
--                            `notas` ("Notas / Identificación (caravana,
--                            pelaje, etc.)", animales/form.js). Mezclarlo
--                            todo en `notas` habría hecho el catastro
--                            inconsultable como dato estructurado -- se
--                            decidió una columna dedicada mínima, sin
--                            catálogo (no se diseña un catálogo veterinario
--                            general en BIT-50).
-- `edad_aproximada_anios` smallint -- años aproximados, NUNCA una fecha de
--                            nacimiento inventada. `fecha_nacimiento` ya
--                            existe pero representa una fecha precisa real;
--                            reutilizarla para una estimación habría sido
--                            fabricar un dato falso (prohibido explícitamente
--                            en el alcance de BIT-50). Sin CHECK de rango --
--                            terreno no debe bloquearse por un valor límite
--                            no previsto.
-- `foto_url` text         -- ruta dentro del bucket de Storage (no una URL
--                            pública ni base64). Ver
--                            migration-BIT-50-storage-fotos.sql para el
--                            bucket y las policies. Se completa en el MISMO
--                            INSERT que crea el Paciente (nunca vía UPDATE
--                            posterior) -- ver nota de RLS abajo.
--
-- ─── POR QUÉ NO HAY UPDATE POSTERIOR PARA LA FOTO (hallazgo de RLS) ──────
-- `animales_update` está restringida a ADMINISTRADOR/PROFESIONAL desde
-- BIT-11 (animales/migration-BIT-11-fix-animales-update-rls.sql) --
-- OPERADOR_CAMPO no puede hacer UPDATE sobre `animales`, aunque SÍ puede
-- hacer INSERT (`animales_insert` no restringe por rol). Si el flujo de
-- Catastro subiera la foto después de crear el Paciente (INSERT sin foto +
-- UPDATE con la URL), un OPERADOR_CAMPO podría crear el equino pero jamás
-- guardarle la foto -- RLS se lo bloquearía en silencio o con error. Por
-- eso el frontend sube la foto a Storage PRIMERO (con un id generado en el
-- cliente, no el id del Paciente, que todavía no existe) y recién después
-- hace un único INSERT que ya incluye `foto_url` -- funciona igual para
-- los tres roles, sin tocar ninguna policy de `animales`.
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Correr primero el PASO 1 de acá y confirmar que las 4 columnas no existen
-- todavía con otro tipo/nombre.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'animales'
ORDER BY ordinal_position;
-- Confirmar en particular que NO existen ya: sexo, pelaje,
-- edad_aproximada_anios, foto_url (con cualquier nombre similar). Si existe
-- algo equivalente con otro nombre: DETENERSE y reportar antes de aplicar.

-- ── PASO 2 — COLUMNAS (idempotente) ────────────────────────────────────────
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS sexo text;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS pelaje text;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS edad_aproximada_anios smallint;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS foto_url text;

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'animales'
--     AND column_name IN ('sexo','pelaje','edad_aproximada_anios','foto_url');
--   -- Las 4 deben existir, todas is_nullable = YES, sin CHECK asociado.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.animales'::regclass AND contype = 'c';
--   -- No debe aparecer ningún CHECK nuevo sobre estas columnas.
--   -- Confirmar que animales_select/insert/update NO cambiaron:
--   SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'animales' ORDER BY cmd;

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo si NINGÚN Paciente real llegó a usar estas columnas todavía (si ya
-- hay datos de Fundación Dolly cargados, NO ejecutar -- se perderían):
--   SELECT count(*) FROM animales
--   WHERE sexo IS NOT NULL OR pelaje IS NOT NULL
--      OR edad_aproximada_anios IS NOT NULL OR foto_url IS NOT NULL;
--   -- Debe dar 0 antes de considerar el DROP.
--   ALTER TABLE public.animales DROP COLUMN IF EXISTS sexo;
--   ALTER TABLE public.animales DROP COLUMN IF EXISTS pelaje;
--   ALTER TABLE public.animales DROP COLUMN IF EXISTS edad_aproximada_anios;
--   ALTER TABLE public.animales DROP COLUMN IF EXISTS foto_url;
