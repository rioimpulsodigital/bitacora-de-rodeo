-- BIT-50 — Catastro equino Fundación Dolly: bucket de Storage para fotos
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
--
-- ─── CONTEXTO ────────────────────────────────────────────────────────────
-- No existe NINGÚN uso de Supabase Storage en este repo hasta ahora (BIT-13
-- -- fotos/adjuntos en general -- sigue pendiente). Esta migración crea la
-- infraestructura MÍNIMA para un único caso de uso: la foto del Paciente
-- Animal cargada durante el relevamiento de Fundación Dolly. NO es la
-- implementación de BIT-13 -- no crea un mecanismo genérico de adjuntos
-- reutilizable por otros módulos. Si BIT-13 se aborda más adelante, deberá
-- decidir si reutiliza este bucket o crea el suyo propio.
--
-- ─── DISEÑO ──────────────────────────────────────────────────────────────
-- Bucket: `paciente-fotos`, PRIVADO (no público -- las fotos de un
-- Paciente no deben ser accesibles por URL directa sin autenticación).
-- Convención de path: `${establecimiento_id}/${uuid_cliente}.${ext}`
-- El primer segmento del path (establecimiento_id) es lo que
-- `storage.foldername(name)` expone como `[1]` -- se usa para scopear las
-- policies con la MISMA función `tiene_acceso_establecimiento()` que ya
-- protege el resto de las tablas de dominio (jornadas/visitas/animales),
-- en vez de inventar un mecanismo de autorización paralelo para Storage.
--
-- Por qué el nombre de archivo lo genera el cliente (no el id del
-- Paciente): la foto se sube ANTES del INSERT en `animales` (ver
-- migration-BIT-50-catastro-equinos.sql, nota de RLS) -- en ese momento el
-- id del Paciente todavía no existe. Se usa un UUID generado en el
-- navegador (crypto.randomUUID()) como nombre de archivo.
--
-- Solo INSERT y SELECT -- deny by default para UPDATE/DELETE (nadie
-- reemplaza ni borra una foto desde el cliente en este flujo; si hace
-- falta más adelante, se agrega como cambio aparte y justificado).
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Requiere que migration-BIT-50-catastro-equinos.sql ya haya corrido
-- (columna `foto_url` en `animales`) y que `tiene_acceso_establecimiento()`
-- exista (confirmado, creada en BIT-04).

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
SELECT id, name, public FROM storage.buckets WHERE id = 'paciente-fotos';
-- Debe dar 0 filas. Si ya existe, DETENERSE y reportar antes de continuar
-- (puede ser un bucket creado manualmente por error -- no pisarlo).

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname ILIKE '%paciente-fotos%';
-- Debe dar 0 filas.

-- ── PASO 2 — BUCKET (idempotente) ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
SELECT 'paciente-fotos', 'paciente-fotos', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'paciente-fotos');

-- ── PASO 3 — POLICIES sobre storage.objects ────────────────────────────────
-- Scopeadas por bucket_id + primer segmento del path (establecimiento_id),
-- reutilizando tiene_acceso_establecimiento(). Igual que en el resto del
-- proyecto: least privilege, deny by default, sin bypass de RLS.

CREATE POLICY "paciente_fotos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'paciente-fotos'
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "paciente_fotos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'paciente-fotos'
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
);

-- Sin policy de UPDATE ni DELETE: cualquier intento del cliente queda
-- bloqueado por default (RLS deny-by-default de Storage).

-- ── PASO 4 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar como los 3 roles reales (no como service role):
--
-- BEGIN;
--   -- Caso 1 -- cualquier rol con acceso a Fundación Dolly, path que
--   -- empieza con el id real de Fundación Dolly → el INSERT en
--   -- storage.objects (simulado desde la app, no desde SQL puro -- Storage
--   -- no se escribe con INSERT SQL directo) DEBE PASAR.
--   -- Caso 2 -- mismo usuario, path con un establecimiento_id al que NO
--   -- tiene acceso → DEBE FALLAR.
--   -- (Validar estos dos casos subiendo un archivo de prueba real desde el
--   -- cliente autenticado -- no hay forma de simular storage.objects con
--   -- INSERT SQL directo porque pasa por la API de Storage, no por REST/DB.)
-- ROLLBACK;

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT id, name, public FROM storage.buckets WHERE id = 'paciente-fotos';
--   -- public debe ser false.
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'paciente_fotos_%';
--   -- Deben existir exactamente 2 (insert, select), roles = {authenticated}.

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo si el bucket está vacío (si ya hay fotos reales subidas, NO
-- ejecutar -- se perderían los archivos):
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'paciente-fotos';
--   -- Debe dar 0.
--   DROP POLICY IF EXISTS "paciente_fotos_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "paciente_fotos_select" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'paciente-fotos';
