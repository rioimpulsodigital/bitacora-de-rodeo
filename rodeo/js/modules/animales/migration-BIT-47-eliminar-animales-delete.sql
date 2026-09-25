-- BIT-47 -- Mitigacion urgente: cerrar DELETE fisico de Pacientes (Animales)
-- ============================================================================
-- Contexto: BIT-46 confirmo contra Produccion real que la policy
-- animales_delete permite DELETE fisico de animales a cualquier usuario
-- con acceso al establecimiento (tiene_acceso_establecimiento(
-- establecimiento_actual_id)), sin restriccion adicional por rol. Esto
-- contradice el modelo aprobado en BIT-35 (soft-delete + Papelera,
-- eliminacion definitiva exclusiva de ADMINISTRADOR y excepcional, nunca via
-- DELETE fisico directo).

--
-- Esta migracion NO implementa soft-delete todavia. Solo neutraliza la
-- capacidad de DELETE fisico existente, dejando animales sin ninguna
-- policy DELETE -- el mismo patron ya vigente hoy en atenciones_clinicas
-- (RLS deny-by-default: sin policy DELETE = DELETE bloqueado para todos los
-- roles de aplicacion, incluido ADMINISTRADOR, mientras RLS siga habilitado).
--
-- Alcance: UNICAMENTE la policy DELETE de animales. No modifica SELECT,
-- INSERT, UPDATE, ninguna otra tabla, policy o funcion.

--
-- Idempotente: usa IF EXISTS, se puede re-ejecutar sin error.
--
-- Precondicion verificada en Produccion antes de preparar esta migracion
-- (BIT-47, Fase A -- solo lectura):
--   - animales_delete es la UNICA policy DELETE sobre animales (pg_policies).
--   - RLS esta habilitado en animales (relrowsecurity = true).
--   - No existe ninguna funcion/RPC en el schema public que ejecute DELETE
--     fisico sobre animales (busqueda exhaustiva sobre pg_proc.prosrc).
--   - No existe ninguna ruta frontend (UI, servicio, ruta del router) que
--     invoque .from('animales').delete() en todo el modulo animales
--     (services.js, list.js, form.js, index.js) ni en el resto del repo.
--
-- NO EJECUTADA contra Produccion. Queda preparada y versionada para su
-- aplicacion posterior, sujeta a autorizacion explicita de Bren/KLIAM.
-- ============================================================================

DROP POLICY IF EXISTS animales_delete ON public.animales;

-- ============================================================================
-- ROLLBACK (si fuera necesario revertir esta mitigacion):
--
-- CREATE POLICY animales_delete ON public.animales
--   FOR DELETE
--   TO public
--   USING (tiene_acceso_establecimiento(establecimiento_actual_id));
--
-- Esto restaura exactamente la policy confirmada en Produccion por BIT-46
-- antes de esta mitigacion (mismo nombre, mismo rol, mismo USING).
-- ============================================================================
