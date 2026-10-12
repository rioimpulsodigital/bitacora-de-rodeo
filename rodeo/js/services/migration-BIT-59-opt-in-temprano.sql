-- BIT-59 — Opt-in temprano al comportamiento deny-by-default de la Data API
-- PREPARADA, NO APLICADA -- requiere autorización explícita de Bren/KLIAM y
-- ejecución de Claudy (Anthy no tiene acceso a Supabase).
--
-- Mecanismo SECUNDARIO de defensa en profundidad -- NO es el mecanismo
-- principal de BIT-59. El mecanismo principal es la disciplina humana/IA de
-- CONVENCION-BIT-59-grants-tablas-nuevas.sql (GRANT explícito en la misma
-- migración de cada tabla nueva). Esta migración es una red de seguridad
-- adicional para el caso real de este proyecto -- ninguna de las 14 tablas
-- de dominio actuales tiene un CREATE TABLE versionado en el repo (hallazgo
-- de BIT-60), lo que sugiere que históricamente se crearon por el dashboard
-- de Supabase en vez de por migración escrita. Si eso volviera a pasar --
-- alguien crea una tabla nueva por el dashboard sin pasar por la convención
-- escrita -- esta migración asegura que esa tabla IGUAL quede sin GRANTs
-- automáticos, en vez de heredar el comportamiento viejo.
--
-- Fuente: Supabase changelog #45329, sección "Opting in on an existing
-- project (now)" -- mismo código que ejecuta el dashboard al crear un
-- proyecto nuevo con el opt-out activado. Verificado contra la fuente
-- oficial el 12 Oct 2026 (no se trabajó desde memoria).
--
-- Alcance real y límites conocidos (de la discusión pública
-- github.com/orgs/supabase/discussions/45329 -- ningún Staff de Supabase
-- contradice lo de abajo, pero tampoco lo confirma línea por línea para
-- proyectos hosteados; por eso este mecanismo es secundario, no principal):
--   * Revoca el default de SELECT/INSERT/UPDATE/DELETE en tablas y
--     USAGE/SELECT en secuencias para `anon`/`authenticated`/`service_role`
--     -- SOLO sobre objetos NUEVOS creados después de correr esto, nunca
--     sobre los 14 ya existentes (confirmado: "existing tables will remain
--     unaffected", lukas-bernert, Staff de Supabase, 22 May 2026).
--   * NO cubre TRUNCATE/REFERENCES/TRIGGER (quedan otorgados por Postgres
--     de todos modos) ni el default que `supabase_admin` otorga a `anon`
--     por su cuenta (`postgres` no puede revocarlo) -- reportes de la
--     comunidad, sin confirmación ni desmentida de Staff. Por eso NO
--     reemplaza el GRANT explícito por tabla -- es un complemento.
--   * Cero riesgo para las 14 tablas de dominio actuales: no les toca nada.
--
-- Verificación previa recomendada (ya incluida en
-- diagnostico-BIT-59-grants-data-api.sql, Sección 4): confirmar que
-- `pg_default_acl` no tenga ya una entrada para `public` antes de correr
-- esto, para no pisar un opt-in anterior sin registro en el repo.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

-- Rollback (si hiciera falta revertir este opt-in temprano -- NO necesario
-- después del 30 Oct 2026, cuando Supabase aplica esto de todos modos a
-- nivel de proyecto):
--
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
