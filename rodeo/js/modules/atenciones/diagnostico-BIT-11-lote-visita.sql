-- BIT-11 — Diagnóstico de solo lectura: por qué "El unico Lote" no aparece
-- como lote activo de Yegua Demo ni filtra Visitas en Nueva Atención Clínica.
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- SOLO LECTURA. No modifica nada. No usar como base para aplicar ningún cambio.
--
-- CONTEXTO: en Editar Paciente Animal, "Yegua Demo" (equino) figura asociada
-- a "El unico Lote". En Nueva Atención Clínica, con ese mismo Paciente
-- seleccionado, "Lote (opcional)" aparece como "— Sin lote —" y el selector
-- de "Visita de terreno relacionada" solo muestra visitas generales
-- (09/08/2026 — seguimiento, 27/07/2026 — sin tipo).
--
-- Objetivo: confirmar si es un bug real de datos/código o si simplemente no
-- existe todavía una Visita real en el mismo establecimiento que Yegua Demo
-- con lote_id = id de "El unico Lote".

-- 1) Confirmar el animal_id de "Yegua Demo" y su establecimiento actual.
SELECT id AS animal_id, nombre, especie, establecimiento_actual_id
FROM animales
WHERE nombre ILIKE '%Yegua Demo%';

-- 2) Confirmar si existe una fila ACTIVA en lotes_animales para ese animal
--    (fecha_fin IS NULL -- esto es exactamente lo que getLoteActivoAnimal()
--    y getLoteActivoDeAnimal() consultan, mismo filtro en ambas).
--    Reemplazar <animal_id> por el id obtenido en el paso 1.
SELECT la.id, la.animal_id, la.lote_id, la.fecha_fin, l.nombre AS lote_nombre, l.establecimiento_id AS lote_establecimiento_id
FROM lotes_animales la
JOIN lotes l ON l.id = la.lote_id
WHERE la.animal_id = '<animal_id>'
ORDER BY la.fecha_fin NULLS FIRST;

-- 3) Confirmar si existe alguna Visita real persistida en el MISMO
--    establecimiento que Yegua Demo, con lote_id = el lote_id obtenido en
--    el paso 2. Si esta consulta devuelve 0 filas, el selector de Visita
--    no tiene nada que mostrar y el comportamiento reportado sería CORRECTO,
--    no un bug -- faltaría crear una Visita Sanitaria real para ese lote en
--    ese establecimiento, no corregir código.
SELECT id, fecha, tipo, lote_id, establecimiento_id
FROM visitas
WHERE establecimiento_id = (SELECT establecimiento_actual_id FROM animales WHERE nombre ILIKE '%Yegua Demo%')
ORDER BY fecha DESC;

-- 4) Verificación cruzada: el lote_id de la fila activa de lotes_animales
--    (paso 2) ¿es el MISMO establecimiento que el animal (paso 1)? Si
--    "El unico Lote" perteneciera a un establecimiento distinto al de
--    Yegua Demo, sería una inconsistencia de datos preexistente, no un bug
--    de este fix.
SELECT
  a.id AS animal_id, a.establecimiento_actual_id AS establecimiento_animal,
  l.id AS lote_id, l.establecimiento_id AS establecimiento_lote,
  (a.establecimiento_actual_id = l.establecimiento_id) AS establecimientos_coinciden
FROM animales a
JOIN lotes_animales la ON la.animal_id = a.id AND la.fecha_fin IS NULL
JOIN lotes l ON l.id = la.lote_id
WHERE a.nombre ILIKE '%Yegua Demo%';
