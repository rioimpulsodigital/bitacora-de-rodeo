BIT-75-02 — Permisos minimos de service_role para admin-usuarios (v2). NO EJECUTADO EN PRODUCCION.
Estado: propuesta para autorizacion KLIAM. Complementa BIT-75-01 (ya aplicada). No repite P0, P1 ni E3.

Causa: la migracion v2 concede privilegios a service_role solo sobre usuarios_auditoria. El handler necesita leer/escribir
perfiles, establecimientos_usuarios y leer establecimientos y bit56_validadores. Hoy service_role solo tiene TRUNCATE/REFERENCES/TRIGGER
sobre esas tablas, por eso toda llamada con sesion ADMINISTRADOR devuelve HTTP 500 (fallo_interno).

Orden de ejecucion (una sola ventana SQL, como postgres, sin JWT):
  1. preflight-BIT-75-02-permisos-service-role.sql   -> todas 'OK'
  2. migration-BIT-75-02-permisos-service-role.sql   -> una transaccion
  3. postflight-BIT-75-02-permisos-service-role.sql  -> todas 'OK'
  4. repetir las comprobaciones P2 pendientes (sin redesplegar la funcion)
Contingencia: rollback-BIT-75-02-permisos-service-role.sql (revoca exactamente lo concedido). Solo si falla el postflight o aparece un consumidor afectado.
STOP ante cualquier fila distinta de OK en preflight/postflight, o un 42501 inesperado en las comprobaciones: no improvisar reintentos.

La huella 7b69a42e062cb95d3fd63964c089d343 (39 privilegios de anon/authenticated sobre las 5 tablas) fue medida en Produccion el 28-nov-2026
y el postflight prueba que no cambia.
Evidencia no productiva: evidencia/bit-75-02-validacion-replica.txt (replica de esquema en Postgres embebido; usa la huella de la replica en lugar de la de Produccion).
