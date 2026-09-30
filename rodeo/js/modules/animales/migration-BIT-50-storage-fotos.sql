-- BIT-50 — Catastro equino Fundación Dolly: bucket de Storage para fotos
-- EJECUTAR CON CLAUDY en Supabase SQL Editor — Producción
-- ESTADO: PREPARADA, NO APLICADA. Requiere autorización explícita de Bren/KLIAM.
-- VERSIÓN 2 (30-09-2026) -- reemplaza la versión anterior tras la revisión
-- estratégica de Bren/KLIAM. Cambios respecto a la v1: se agregan límites
-- reales de tamaño/tipo en el bucket (`file_size_limit`, `allowed_mime_types`)
-- y una policy de DELETE acotada para resolver archivos huérfanos sin dejar
-- basura permanente en Storage (ver sección "Huérfanos" más abajo).
--
-- ─── CONTEXTO ────────────────────────────────────────────────────────────
-- No existía NINGÚN uso de Supabase Storage en este repo hasta BIT-50 --
-- primera integración del proyecto. Esta migración crea la infraestructura
-- para la FOTO PRINCIPAL del Paciente Animal (decisión de Bren: la foto es
-- objetivo real de BIT-50, no se pospone a BIT-13). No es la implementación
-- completa de BIT-13 (adjuntos múltiples en general) -- eso sigue pendiente
-- y puede decidir después si reutiliza este bucket o crea uno propio.
--
-- ─── POR QUÉ SUPABASE STORAGE Y NO CLOUDFLARE R2 ──────────────────────────
-- Se evaluó explícitamente la referencia de RiO (D1 + R2 privado, usada
-- para comprobantes de pago). Se descarta copiarla: Bitácora ya corre
-- 100% sobre Supabase (Postgres + Auth + Storage) -- sumar R2 para un solo
-- archivo por Paciente significaría un segundo proveedor, un segundo set
-- de credenciales y un segundo modelo de acceso, desproporcionado. El
-- principio conceptual de RiO (DB con metadata/referencia + objeto físico
-- separado + privado + acceso autorizado + sin URL pública permanente) se
-- adopta íntegro, dentro de Supabase Storage -- sin la complejidad
-- financiera de ese sistema (sin versionado, sin auditoría de descarga,
-- sin hash obligatorio: no aporta valor a una foto clínica/principal).
--
-- ─── DISEÑO ──────────────────────────────────────────────────────────────
-- Bucket: `paciente-fotos`, PRIVADO (`public = false`) -- las fotos de un
-- Paciente no deben ser accesibles por URL directa sin autenticación.
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
-- La DB guarda el PATH (object key), nunca una URL: el bucket es privado,
-- así que cualquier URL de acceso firmada (`createSignedUrl`) es temporal
-- por diseño -- no es apta como dato permanente en `animales.foto_path`.
-- La resolución de la URL de lectura queda para el momento en que la app
-- necesite mostrar la foto (fuera del alcance funcional de BIT-50 mostrar
-- la foto hoy; la arquitectura queda lista para cuando se implemente).
--
-- ─── PRERREQUISITO ───────────────────────────────────────────────────────
-- Requiere que migration-BIT-50-catastro-equinos.sql ya haya corrido
-- (columna `foto_path` en `animales`) y que `tiene_acceso_establecimiento()`
-- exista (confirmado, creada en BIT-04).

-- ── PASO 1 (OBLIGATORIO, SOLO LECTURA) ─────────────────────────────────────
SELECT id, name, public FROM storage.buckets WHERE id = 'paciente-fotos';
-- Debe dar 0 filas. Si ya existe, DETENERSE y reportar antes de continuar
-- (puede ser un bucket creado manualmente por error -- no pisarlo).

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname ILIKE '%paciente_fotos%';
-- Debe dar 0 filas.

-- 1a) Confirmar las columnas reales de storage.buckets en esta instancia
-- (file_size_limit / allowed_mime_types son estándar en Supabase, pero se
-- confirman acá en vez de asumirlas -- mismo criterio de "no simular" que
-- el resto de las migraciones de este proyecto):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'storage' AND table_name = 'buckets'
ORDER BY ordinal_position;

-- 1b) Confirmar las columnas reales de storage.objects, EN PARTICULAR si
-- existe `owner` (uuid) y si queda poblada con el uploader real -- de eso
-- depende la policy de DELETE del Paso 3c. Si esta instancia usa `owner_id`
-- (text) en vez de/además de `owner`, o si `owner` no se popula de forma
-- confiable, usar el PLAN B documentado en el Paso 3c en vez de la policy
-- que depende de `owner`:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'storage' AND table_name = 'objects'
ORDER BY ordinal_position;

-- Si el Paso 1 muestra algo distinto de lo asumido acá: DETENERSE y
-- reportar antes de continuar -- no aplicar el Paso 2/3 a ciegas.

-- ── PASO 2 — BUCKET (idempotente), con límites reales ──────────────────────
-- file_size_limit en bytes (8 MB). allowed_mime_types restringe a formatos
-- de imagen comunes en fotos de campo desde un teléfono, incluido HEIC
-- (formato nativo de iPhone en algunos flujos). Esto es la validación real
-- del lado del servidor -- el `contentType` que declara el cliente en el
-- upload (rodeo/js/modules/catastro/services.js) NUNCA es, por sí solo, un
-- control de seguridad.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'paciente-fotos', 'paciente-fotos', false, 8388608,
       ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'paciente-fotos');

-- ── PASO 3 — POLICIES sobre storage.objects ────────────────────────────────
-- Scopeadas por bucket_id + primer segmento del path (establecimiento_id),
-- reutilizando tiene_acceso_establecimiento(). Igual que en el resto del
-- proyecto: least privilege, deny by default, sin bypass de RLS.

-- 3a) INSERT -- cualquier rol con acceso al establecimiento puede subir
-- (animales_insert tampoco restringe por rol -- misma simetría).
CREATE POLICY "paciente_fotos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'paciente-fotos'
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
);

-- 3b) SELECT -- mismo criterio de acceso que el resto de los datos del
-- establecimiento.
CREATE POLICY "paciente_fotos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'paciente-fotos'
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
);

-- 3c) DELETE -- ACOTADA, solo para compensar huérfanos (requisito de Bren:
-- una alta fallida de Paciente no debe dejar basura permanente en Storage).
-- Revisión de seguridad explícita, punto por punto:
--
--   ¿Quién puede eliminar? Solo el propio uploader (owner = auth.uid()),
--   nunca cualquier usuario del establecimiento.
--   ¿Qué objeto puede eliminar? Solo dentro de 'paciente-fotos', y solo en
--   un establecimiento al que ese usuario tiene acceso (defensa en
--   profundidad, redundante con el control de owner).
--   ¿Cómo se verifica que no está asociado a un Paciente? NOT EXISTS contra
--   `animales.foto_path` -- una vez que un INSERT exitoso guarda esa
--   referencia, esta misma policy deja de permitir el DELETE, incluso para
--   el propio uploader: una foto ya guardada no se puede borrar por esta
--   vía bajo ninguna condición.
--   ¿Condiciones de carrera? El flujo del cliente es secuencial por
--   diseño (sube la foto, espera el INSERT, recién en el catch intenta el
--   DELETE) -- no hay dos operaciones concurrentes del mismo uploader sobre
--   el mismo objeto. La verificación NOT EXISTS se evalúa en el momento del
--   DELETE contra el estado ya comprometido de `animales`, así que si el
--   INSERT llegó a confirmar antes del intento de DELETE, el DELETE queda
--   bloqueado igual.
--   ¿Puede manipular el path? Puede pedir borrar cualquier path que
--   imagine, pero `owner = auth.uid()` lo limita a objetos que ese mismo
--   usuario subió -- no puede borrar un objeto ajeno aunque adivine su
--   nombre exacto.
--   ¿Interacción con establecimiento/RLS? Redundante con `tiene_acceso_
--   establecimiento()`, que ya protege el resto de las policies -- no se
--   introduce ningún mecanismo de autorización nuevo.
--
-- PLAN B (usar en vez de esta policy si el Paso 1b muestra que `owner` no
-- existe o no se popula de forma confiable en esta instancia): quitar la
-- condición `owner = auth.uid()` y dejar solo el acceso por establecimiento
-- + NOT EXISTS. Efecto: cualquier usuario con acceso a ese establecimiento
-- podría borrar un huérfano subido por otro usuario del mismo
-- establecimiento (no uno ya guardado -- eso sigue protegido) -- una foto
-- ya asociada a un Paciente sigue protegida en ambos planes. Es una
-- degradación aceptable y acotada, no una policy abierta.
CREATE POLICY "paciente_fotos_delete_propio_no_referenciado"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'paciente-fotos'
  AND owner = auth.uid()
  AND tiene_acceso_establecimiento(((storage.foldername(name))[1])::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.animales a WHERE a.foto_path = storage.objects.name
  )
);

-- Sin policy de UPDATE: reemplazar una foto no es parte de BIT-50 (el
-- catastro es alta, no edición) -- queda documentado como hallazgo para
-- una futura pantalla de "editar foto" (probablemente BIT-13), que debería
-- resolverlo con una RPC dedicada en vez de abrir UPDATE/DELETE general.

-- ── PASO 4 (OBLIGATORIO) — VALIDAR EN TRANSACCIÓN ANTES DE COMMITEAR ────────
-- Ejecutar como los 3 roles reales (no como service role). Storage no se
-- escribe con INSERT SQL directo (pasa por la API de Storage, no por
-- REST/DB) -- estos casos se validan subiendo/borrando un archivo de
-- prueba real desde el cliente autenticado, no simulados en SQL puro:
--
--   Caso 1 -- cualquier rol con acceso a Fundación Dolly sube un archivo de
--   prueba con un path que empieza con el id real de Fundación Dolly →
--   DEBE PASAR.
--   Caso 2 -- mismo usuario, path con un establecimiento_id al que NO tiene
--   acceso → DEBE FALLAR (insert).
--   Caso 3 -- el mismo usuario que subió el archivo de prueba del Caso 1
--   intenta borrarlo ANTES de que exista un `animales.foto_path` que lo
--   referencie → DEBE PASAR (delete).
--   Caso 4 -- crear un Paciente de prueba con `foto_path` apuntando a un
--   archivo de prueba nuevo, y el mismo uploader intenta borrarlo →
--   DEBE FALLAR (delete) -- confirma que una foto ya guardada queda
--   protegida incluso para su propio uploader. Limpiar el Paciente de
--   prueba y el archivo (vía un ADMINISTRADOR o directamente en Storage)
--   antes de continuar.
--   Caso 5 -- un usuario intenta borrar un archivo subido por OTRO usuario
--   (mismo establecimiento, sin referenciar) → DEBE FALLAR (delete) --
--   confirma que `owner` realmente aísla por uploader.

-- ── VERIFICACIÓN POST-APLICACIÓN (SOLO LECTURA) ────────────────────────────
--   SELECT id, name, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'paciente-fotos';
--   -- public debe ser false; file_size_limit = 8388608; allowed_mime_types
--   -- debe listar los 4 tipos de imagen.
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'paciente_fotos_%';
--   -- Deben existir exactamente 3 (insert, select, delete), roles = {authenticated}.

-- ── ROLLBACK (solo recuperación; requiere autorización) ────────────────────
-- Solo si el bucket está vacío (si ya hay fotos reales subidas, NO
-- ejecutar -- se perderían los archivos):
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'paciente-fotos';
--   -- Debe dar 0.
--   DROP POLICY IF EXISTS "paciente_fotos_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "paciente_fotos_select" ON storage.objects;
--   DROP POLICY IF EXISTS "paciente_fotos_delete_propio_no_referenciado" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'paciente-fotos';
