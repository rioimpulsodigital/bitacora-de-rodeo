-- BIT-42 — Alta de Establecimiento Fernández y Establecimiento Antinori
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
--
-- CONTEXTO
-- Hasta ahora en Producción solo existe "Establecimiento Demo A" (seed
-- data de BIT-05, ver ANTHY.md). Fernández y Antinori son establecimientos
-- reales, no demo. Esta tarea (BIT-42) NO redefine el modelo de permisos
-- de Establecimientos -- eso es BIT-41 (alta y gestión desde la app). Acá
-- solo se necesita que las dos filas nuevas queden disponibles en
-- Producción y que el perfil PROFESIONAL correspondiente pueda verlas y
-- usarlas.
--
-- No existe ningún CREATE TABLE de `establecimientos` versionado en este
-- repo (se creó directamente en Supabase, igual que visitas/animales/
-- personas -- ver rodeo/js/modules/visitas/migration-BIT-42.sql). Lo único
-- confirmado por el código cliente (rodeo/js/services/establecimientos.js)
-- es que el frontend solo lee `id` y `nombre`. Cualquier otra columna
-- obligatoria (NOT NULL sin default) tiene que salir del Paso 1.
--
-- Tampoco se conoce con certeza, desde el código, CUÁL es la tabla que
-- vincula un perfil (usuario) con los Establecimientos a los que tiene
-- acceso -- la función `tiene_acceso_establecimiento()` (creada en BIT-04)
-- la usa internamente, pero su definición no está versionada acá. OJO:
-- esa tabla de vínculo perfil↔establecimiento NO es `personas_establecimientos`
-- -- esa otra tabla vincula Personas (Tutores Responsables, entidad de
-- dominio) con Establecimientos, no usuarios/perfiles del sistema (ver
-- rodeo/js/modules/animales/migration-BIT-11-fix-personas-rls.sql). El
-- Paso 1 de acá tiene que identificar la tabla correcta antes de armar
-- cualquier INSERT de vínculo.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ──────────────────────────────────────
-- Documentar el resultado en BIT-42 (Notion) antes de aplicar nada.
--
--   -- Columnas actuales de establecimientos (para saber qué es NOT NULL
--   -- sin default, además de nombre):
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'establecimientos'
--   ORDER BY ordinal_position;
--
--   -- Fila existente de "Establecimiento Demo A", como plantilla de qué
--   -- columnas se completan en la práctica:
--   SELECT * FROM establecimientos WHERE nombre ILIKE '%Demo%';
--
--   -- Definición real de la función que decide acceso (para identificar
--   -- la tabla de vínculo perfil↔establecimiento que usa por dentro):
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc WHERE proname = 'tiene_acceso_establecimiento';
--
--   -- Policies actuales de establecimientos:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'establecimientos';
--
-- Si el Paso 1 muestra columnas NOT NULL adicionales (más allá de nombre)
-- que este script no completa, DETENERSE y reportar antes de continuar --
-- no inventar valores para esas columnas.

-- ── PASO 2 — ALTA IDEMPOTENTE (solo columna `nombre`, confirmada por Brenda) ─
-- Brenda confirmó que por ahora solo hace falta el nombre -- sin
-- dirección/contacto/ubicación todavía. Si el Paso 1 revela columnas NOT
-- NULL adicionales, completar este INSERT antes de ejecutarlo.

INSERT INTO establecimientos (nombre)
SELECT 'Establecimiento Fernández'
WHERE NOT EXISTS (
  SELECT 1 FROM establecimientos WHERE nombre = 'Establecimiento Fernández'
);

INSERT INTO establecimientos (nombre)
SELECT 'Establecimiento Antinori'
WHERE NOT EXISTS (
  SELECT 1 FROM establecimientos WHERE nombre = 'Establecimiento Antinori'
);

-- ── PASO 3 — VÍNCULO PARA QUE PROFESIONAL PUEDA VER/USAR LOS ESTABLECIMIENTOS
-- PENDIENTE: no se escribe el INSERT de vínculo acá todavía porque el
-- Paso 1 (definición de tiene_acceso_establecimiento) es el que confirma
-- cuál es la tabla real y sus columnas. Una vez identificada, agregar acá
-- el INSERT idempotente correspondiente (persona/perfil de
-- lunitapeluvet@gmail.com -- PROFESIONAL, Etel Salinas -- vinculado a
-- ambos establecimientos nuevos), sin hardcodear el uuid del perfil: usar
-- un SELECT id FROM perfiles WHERE ... (correo o el criterio que
-- corresponda) dentro del propio INSERT, igual que se evita hardcodear
-- IDs en el resto de las migraciones de este repo.

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ─────────────────────────────
--   SELECT id, nombre FROM establecimientos
--   WHERE nombre IN ('Establecimiento Fernández', 'Establecimiento Antinori');
--
-- Confirmar además, logueado como el perfil PROFESIONAL real, que
-- getEstablecimientosAccesibles() (rodeo/js/services/establecimientos.js)
-- devuelve ambos establecimientos nuevos en la app.
