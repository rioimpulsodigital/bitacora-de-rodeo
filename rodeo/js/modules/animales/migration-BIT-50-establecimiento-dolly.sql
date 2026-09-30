-- BIT-50 — Catastro equino Fundación Dolly: alta de Establecimiento + Tutor
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── OBJETIVO ────────────────────────────────────────────────────────────
-- 1) Que "Fundación Dolly" exista como fila en `establecimientos` (mismo
--    patrón que BIT-42: solo `nombre`, idempotente, sin tocar el modelo de
--    permisos de Establecimientos -- eso sigue siendo BIT-41).
-- 2) Que Etel Salinas (perfil PROFESIONAL) tenga acceso a ese
--    establecimiento vía `establecimientos_usuarios` (confirmada como la
--    tabla de vínculo real por BIT-49, columnas perfil_id/establecimiento_id).
-- 3) Que exista la Persona "Área de Rescate Equino de la Municipalidad de
--    Corrientes" (Tutor Responsable único de todos los Pacientes de este
--    catastro) y esté vinculada a Fundación Dolly en
--    `personas_establecimientos`.
--
-- Esta alta es un PRERREQUISITO manual porque BIT-41 (alta/gestión de
-- Establecimientos desde la app) todavía no existe -- se documenta acá
-- como tal y NO como parte del alcance normal de BIT-50 (instrucción
-- explícita de Bren). No reemplaza a BIT-41 ni resuelve su alcance.
--
-- ─── OJO — DUPLICADO ORTOGRÁFICO POSIBLE ──────────────────────────────────
-- BIT-50 pide "Fundación Dolly" (dos L), pero un documento histórico de
-- Notion (app "Bitácora de Trabajo", Google Apps Script legacy) usa
-- "Fundación Doly" (una L). El Paso 1 busca EXPLÍCITAMENTE ambas grafías
-- antes de insertar, para no crear un establecimiento duplicado si ya
-- existe con el nombre antiguo. Si el Paso 1 encuentra "Fundación Doly":
-- DETENERSE, no insertar "Fundación Dolly" como fila nueva, y reportar a
-- Bren/KLIAM para decidir si se renombra la fila existente o se documenta
-- la razón de mantener ambas.

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
-- Documentar el resultado en BIT-50 (Notion) antes de aplicar nada.

-- 1a) Buscar el establecimiento con cualquier grafía posible:
SELECT id, nombre FROM establecimientos
WHERE nombre ILIKE '%doll%' OR nombre ILIKE '%doly%' OR nombre ILIKE '%dolly%';

-- 1b) Confirmar el perfil de Etel (no asumir un solo criterio -- cruzar
-- ambos y confirmar que hay EXACTAMENTE una fila antes de usarlo abajo):
SELECT p.id, p.nombre, p.rol, p.activo, u.email
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'lunitapeluvet@gmail.com' OR p.nombre = 'Etel Salinas';

-- 1c) Confirmar si la Persona-Tutor municipal ya existe (evitar duplicado):
SELECT id, nombre, telefono, email FROM personas
WHERE nombre ILIKE '%Rescate Equino%Corrientes%'
   OR nombre = 'Área de Rescate Equino de la Municipalidad de Corrientes';

-- Si 1a muestra una fila con "Doly" (una L): DETENERSE, no correr el Paso 2a.
-- Si 1b no da EXACTAMENTE una fila: DETENERSE, no correr el Paso 3 (usa el
-- id de perfil resuelto acá).
-- Si 1c ya muestra una fila: DETENERSE, no correr el Paso 2b -- usar ese id.

-- ── PASO 2a — ALTA DEL ESTABLECIMIENTO (idempotente, solo si 1a dio 0 filas) ─
INSERT INTO establecimientos (nombre)
SELECT 'Fundación Dolly'
WHERE NOT EXISTS (
  SELECT 1 FROM establecimientos WHERE nombre = 'Fundación Dolly'
);

-- ── PASO 2b — ALTA DE LA PERSONA-TUTOR MUNICIPAL (idempotente) ─────────────
-- Sin establecimiento_id propio (mismo modelo de `personas` documentado en
-- migration-BIT-11-fix-personas-rls.sql) -- el vínculo se crea en el Paso 3c.
INSERT INTO personas (nombre)
SELECT 'Área de Rescate Equino de la Municipalidad de Corrientes'
WHERE NOT EXISTS (
  SELECT 1 FROM personas
  WHERE nombre = 'Área de Rescate Equino de la Municipalidad de Corrientes'
);

-- ── PASO 3 — VÍNCULOS (idempotentes, por nombre -- nunca UUID hardcodeado) ──

-- 3a) Etel <-> Fundación Dolly, vía la tabla real confirmada en BIT-49
-- (establecimientos_usuarios, columnas perfil_id/establecimiento_id, PK
-- compuesta):
INSERT INTO establecimientos_usuarios (perfil_id, establecimiento_id)
SELECT p.id, e.id
FROM perfiles p
JOIN auth.users u ON u.id = p.id
CROSS JOIN establecimientos e
WHERE (u.email = 'lunitapeluvet@gmail.com' OR p.nombre = 'Etel Salinas')
  AND e.nombre = 'Fundación Dolly'
  AND NOT EXISTS (
    SELECT 1 FROM establecimientos_usuarios eu
    WHERE eu.perfil_id = p.id AND eu.establecimiento_id = e.id
  );

-- 3b) Persona-Tutor municipal <-> Fundación Dolly:
INSERT INTO personas_establecimientos (persona_id, establecimiento_id)
SELECT per.id, e.id
FROM personas per
CROSS JOIN establecimientos e
WHERE per.nombre = 'Área de Rescate Equino de la Municipalidad de Corrientes'
  AND e.nombre = 'Fundación Dolly'
  AND NOT EXISTS (
    SELECT 1 FROM personas_establecimientos pe
    WHERE pe.persona_id = per.id AND pe.establecimiento_id = e.id
  );

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT id, nombre FROM establecimientos WHERE nombre = 'Fundación Dolly';
--   SELECT id, nombre FROM personas
--   WHERE nombre = 'Área de Rescate Equino de la Municipalidad de Corrientes';
--   -- Etel debe ver Fundación Dolly logueada en la app real
--   -- (getEstablecimientosAccesibles(), rodeo/js/services/establecimientos.js).
--   SELECT eu.* FROM establecimientos_usuarios eu
--   JOIN establecimientos e ON e.id = eu.establecimiento_id
--   WHERE e.nombre = 'Fundación Dolly';
--   SELECT pe.* FROM personas_establecimientos pe
--   JOIN establecimientos e ON e.id = pe.establecimiento_id
--   JOIN personas per ON per.id = pe.persona_id
--   WHERE e.nombre = 'Fundación Dolly'
--     AND per.nombre = 'Área de Rescate Equino de la Municipalidad de Corrientes';

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo si NINGÚN Paciente real fue cargado todavía contra este
-- establecimiento/tutor (si Etel ya relevó animales, NO ejecutar):
--   SELECT count(*) FROM animales a
--   JOIN establecimientos e ON e.id = a.establecimiento_actual_id
--   WHERE e.nombre = 'Fundación Dolly';
--   -- Debe dar 0 antes de considerar deshacer el alta.
