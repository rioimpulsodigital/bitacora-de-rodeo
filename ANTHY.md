# ANTHY.md — Bitácora de Rodeo

Resumen de arranque. Notion es la fuente de verdad — esto es lo mínimo para no redescubrir todo cada sesión. No duplica contenido de la Biblioteca de Manuales; solo apunta a él.

## ¿Quién soy acá?

Soy **Anthy** (Claude Code), asistente técnico de RiO Impulso Digital para este proyecto. Mi contraparte es **Claude Chat** (claude.ai), gestor de proyecto y documentación estratégica. También puede aparecer **Claudy**, otro asistente de Brenda con acceso directo a pantalla (Cloudflare, cuentas Google) para pasos que yo no puedo ejecutar sin API.

**División de roles — no cruzar:**
| Documento | Responsable |
|---|---|
| Informes técnicos (en la tarea de Agenda) | ✅ Anthy (yo) |
| Agenda de Tareas | ✅ Anthy (yo) |
| Handoff — Estado del Proyecto | ❌ Claude Chat |
| Notas de Trabajo | ❌ Claude Chat |

## Identidad del proyecto

| Campo | Valor |
|---|---|
| Prefijo de tareas | **BIT-** (confirmado con Brenda 24 Jul 2026 — no BTR-, ese era solo un ejemplo genérico en el Estándar central, ya corregido ahí) |
| Repo oficial | github.com/rioimpulsodigital/bitacora-de-rodeo |
| Live | bitacoraderodeo.rio-landing.com (Cloudflare Pages, build automático en cada push a `main`) |
| Notion — página principal | https://app.notion.com/p/36e6c976f0cd810e9bc8ee40c3462f04 |
| Notion — Agenda de Tareas | https://app.notion.com/p/a03f3bedc44148c9bdcd71682b653cf1 |
| Notion — Handoff (lee Claude Chat) | https://app.notion.com/p/36e6c976f0cd81e49f68e2062d554ad3 |
| Notion — Notas de Trabajo (lee Claude Chat) | https://app.notion.com/p/36e6c976f0cd81b7b507c625bbb13e0c |

## Al iniciar sesión

1. Revisar Agenda de Tareas — qué está 🔄 En curso o ⏸️ Bloqueada.
2. Si algo no cierra con lo que dice Brenda, preguntar antes de asumir — no inferir desde el nombre de un botón o funcionalidad.

## Reglas de trabajo con Brenda

Este archivo es mi única memoria de proyecto — no crear archivos de memoria propios (fuera del repo) con reglas o contexto de Bitácora de Rodeo, para evitar que la información quede fragmentada en dos lugares. Todo lo que aprenda sobre cómo trabajar en este proyecto va acá.

- **Commits por hito, no por BIT individual.** Cuando varios BITs quedan implementados pero todavía faltan validaciones de otros roles/escenarios que Brenda pidió, esperar a que se validen todos antes de commitear — un único commit que represente el hito completo, no uno por cada BIT. No ofrecer subir cambios apenas un BIT pasa su propia prueba si hay otras validaciones pendientes en danza.

## Manuales de la Biblioteca que me aplican

Biblioteca completa: https://app.notion.com/p/3a66c976f0cd818ead5ae23db9a10d4a ("✨ Forma de Trabajar")

- **Estándar de Informes Técnicos** (nombre simplificado el 25 Jul 2026, antes "— Implementación y Auditoría") — Tipo A (11 secciones, tareas grandes) / Tipo B (auditoría de algo que ya existe/pasó, 10 fases) / Tipo C (5 bloques, fixes chicos) / **Tipo D (análisis de dominio y diseño funcional, sin código — propuesto por mí a partir de BIT-30, sumado al Estándar el 25 Jul 2026)**. Adoptado desde el 24 Jul 2026 — antes usaba un formato libre propio.
- **Metodología de Auditoría Operativa** — aplicar cuando se investiga un bug real, no una implementación planificada.
- **Sistema de Trabajo — RiO Impulso Digital** — división de roles y estructura general.
- **Entorno de Trabajo — VS Code + IA** — mayormente no aplica (está armado para PHP/Laravel/cPanel); solo la sección de conexión MCP a Notion es relevante acá.

**Pie obligatorio en los informes:** `*Informe generado por Anthy — Bitácora de Rodeo | [Fecha]*`

## Qué es este proyecto (lo que no está en un manual genérico)

Plataforma modular para gestión de trabajo en terreno. Dos módulos operativos:
- **Rescate Equino Municipalidad** — registro de jornada laboral, informes diario/semanal/mensual.
- **Proyecto Recuperación de Rodeo** — formulario de intervención sanitaria sobre animales.

**Stack:** HTML/CSS/JS vanilla, ES Modules nativos (sin build, sin npm) — decisión firme, no proponer frameworks. Los dos módulos operativos (Rescate Equino, Rodeo) siguen sobre Google Apps Script + Google Sheets, bajo `lunitapeluvet@gmail.com` — **en migración hacia Supabase** (PostgreSQL + Auth), decidido en BIT-01. Desde el 26 Jul 2026 la app tiene **login obligatorio con Supabase Auth** (`login.html`, `js/core/auth.js`, `js/core/supabase-client.js` — BIT-03); la Anon Key vive commiteada en el repo a propósito (no es secreta, aprobado por Brenda).

**Modelo de usuarios/roles (BIT-04, cerrado el 27 Jul 2026):** Bitácora es colaborativa — los datos pertenecen al **Establecimiento**, no a quien los registra. Tres roles V1: `ADMINISTRADOR` / `PROFESIONAL` / `OPERADOR_CAMPO` (un cuarto, `PROPIETARIO`, queda preparado pero no implementado). `perfiles` (1:1 con `auth.users`) reemplaza a la vieja idea de "profesionales" de BIT-02 — **el script de BIT-02 quedó reemplazado por el consolidado de BIT-04, no usar el viejo**.

**Ya ejecutado contra el proyecto real** (`tejnjojuoiuehnpsynof.supabase.co`): estructura + RLS corridas, perfiles creados (ADMINISTRADOR = Brenda, PROFESIONAL = Etel Salinas / `lunitapeluvet@gmail.com`, OPERADOR_CAMPO = cuenta de prueba), batería de pruebas de permisos por rol y aislamiento entre establecimientos con resultado PASS. Dos correcciones reales aparecieron recién al ejecutar (ya incorporadas en el documento de BIT-04): falta un `GRANT` explícito a `authenticated` (habilitar RLS no alcanza por sí solo) y las dos funciones auxiliares (`is_admin()`, `tiene_acceso_establecimiento()`) necesitan `SECURITY DEFINER` + `search_path` fijo para no recursar contra tablas que también tienen RLS. Quedan datos de prueba en la base, renombrados como seed data ("Demo") para BIT-05, no se borraron. Base de datos congelada como v1.0.

**Arquitectura del frontend legacy (raíz, `index.html`):** registro de módulos — cada módulo en `js/modules/<id>/` exporta un objeto con contrato fijo (`mount`, `mountNav` opcional, `onTick` opcional). `js/core/*` nunca importa de un módulo específico. Agregar un módulo nuevo = una carpeta + 2 líneas en `main.js` + un `<link>` CSS, sin tocar el núcleo. **Vivo, en uso real por Etel — no tocar salvo pedido explícito.**

**Arquitectura del frontend nuevo (`/rodeo/`, BIT-05/06 en adelante):** completamente aislado del legacy, mismo tokens.css para identidad visual. Router mínimo por hash (`rodeo/js/router.js`) — cada vista se registra una vez y exporta `mount(contenedor, ctx)`. `ctx` trae `perfil`, `establecimientos` y `establecimientoActivoId` (getter, siempre vigente). Módulos funcionales viven en `rodeo/js/modules/<id>/` con `index.js` (registra rutas), `list.js`, `form.js` — **convención agregada por Brenda el 29 Jul 2026: cuando un módulo crezca (Animales, Atenciones Clínicas), que sea completamente autónomo** (sumar `detail.js`, `services.js`, `validators.js`, `templates.js` propios en vez de compartir con otros módulos) — no aplica todavía a Jornadas por ser chico, pero es la regla para los que siguen. `rodeo/js/services/` tiene los servicios compartidos (perfiles, establecimientos, y uno nuevo por cada tabla de dominio) — el frontend nunca repite lógica de permisos, RLS decide todo. Reutiliza `js/core/supabase-client.js` y `js/core/auth.js` de la raíz sin duplicar.

**Identidad de marca:** alineada con la landing de Lunita Pelu Vet (lunitapeluvet.rio-landing.com) — misma tipografía (Fredoka/Nunito/Caveat), misma paleta, bordes redondeados. Bitácora de Rodeo eventualmente vivirá embebida dentro de ese sitio.

**Personas reales del ecosistema:** Etel Salinas (dueña de Lunita Pelu Vet, vinculada también a "Fundación Doly") es la usuaria real de Rescate Equino Municipalidad, y aparece como opción de "Dueño" en el formulario de Rodeo — no son entidades separadas.

## Pendiente activo (actualizar o borrar esta sección al cerrarse)

- ~~Confirmar bug de fechas en informes de Rescate Equino~~ — **despriorizado por Brenda el 25 Jul 2026, NO retomar de forma proactiva.** El código del fix está bien en el repo y verificado con `testFormatFix()` directo en el editor de Apps Script; publicar la versión activa correcta en producción quedó como pendiente de baja prioridad. El plan de Brenda es corregir estos detalles de formato al generar el informe "de verdad" más adelante, tomando los datos crudos — no depender de que el Apps Script los devuelva ya limpios. Detalle completo en BIT-29 (Notion). Si Brenda lo menciona, retomar desde ahí; si no, dejarlo.
- ~~Cloudflare Pages~~ — confirmado OK por Brenda el 25 Jul 2026, sin acción.
- Registros de Rodeo cayendo en la pestaña "Bitácora" en vez de "Registros" — diferido a propósito, revisar después (sin fecha).
- ~~BIT-30/BIT-31 (dominio y modelo funcional)~~ — **cerrados el 30 Jul 2026** tras validación con Etel Salinas. Decisiones adoptadas: (1) UI = **"Paciente Animal"** en todos los textos visibles (tabla `animales` no cambia en Supabase); (2) ciclo de vida de Atención Clínica: Registrada → En seguimiento → Cerrada confirmado; (3) Lote es persistente y complementa al Paciente Animal individual; (4) Atención Clínica puede existir sin Visita (consultas por WhatsApp/teléfono son Atenciones Clínicas válidas); (5) Tutor Responsable es entidad de apoyo — creación inline desde formulario de Paciente Animal, **BIT-11 no es bloqueante del roadmap**.
- ~~BIT-04 (roles + RLS)~~ — **cerrado y ejecutado el 27 Jul 2026.** Base de datos v1.0 congelada, con roles/RLS funcionando y verificados contra el proyecto real. Ver BIT-04 en Notion (sección 15) para el detalle de la ejecución y las dos correcciones técnicas que aparecieron recién al correr contra la base real.
- Recomendaciones abiertas de BIT-04, no bloqueantes: actualizar BIT-30 con ADMINISTRADOR/OPERADOR_CAMPO como actores del dominio + entidad futura `tratamientos_aplicaciones`; revisar en una futura pasada de RLS que `adjuntos` herede acceso de su entidad padre en vez de depender solo del autor.
- ~~BIT-05 (infraestructura `/rodeo/`) y BIT-06 (módulo Jornadas)~~ — **cerrados el 30 Jul 2026.** Validados con los tres perfiles (PROFESIONAL: 29 Jul, ADMINISTRADOR y OPERADOR_CAMPO: 30 Jul) mediante Playwright contra el proyecto real de Supabase. Commit de consolidación incluido en este cierre.
- ~~BIT-07 (Paciente Animal + Lotes)~~ — **cerrado el 6 Ago 2026.** Módulo completamente autónomo implementado: 6 archivos nuevos en `rodeo/js/modules/animales/`, sidebar actualizado, rutas registradas. Funcionalidades: CRUD de pacientes con especie/nombre/tutor/lote, creación inline de Tutor Responsable (con inserción en `personas_establecimientos` para RLS), gestión de Lotes, historización de membresía (`lotes_animales` con `fecha_fin`). Fix de import path durante la implementación (4 niveles de `../` en vez de 3 por la profundidad del módulo). Validado manualmente.
- **Entidad de dominio pendiente — "Novedades del Establecimiento"** (identificada el 6 Ago 2026 por Brenda): objeto de dominio nuevo, no un rol. Captura eventos/novedades relevantes del establecimiento. Brenda está convencida de que terminará siendo un módulo importante. **No implementar aún — solo tener presente al diseñar el modelo de datos de módulos futuros.**
- ~~BIT-08 (Visitas)~~ — **cerrado el 9 Ago 2026.** Módulo completamente autónomo: 4 archivos nuevos en `rodeo/js/modules/visitas/`, entrada "📍 Visitas" en sidebar, rutas registradas. Funcionalidades: listado con Fecha/Tipo/Establecimiento/Horas/Estado; alta; edición con campo Estado editable. Campo `tipo` (Programada/Seguimiento/Emergencia/Control/Otro). Migración ejecutada en producción. Validación automatizada con Playwright — 27/27 checks PASS, sin errores de consola, sin regresiones en módulos anteriores.
- ~~BIT-09 (Observaciones de Campo)~~ — **cerrado el 9 Ago 2026.** BIT redefinida: la BIT original ("listado de animales") fue reclasificada en BIT-32 y reconvertida en Módulo Observaciones de Campo. Módulo completamente autónomo: 4 archivos nuevos en `rodeo/js/modules/observaciones/`, entrada "📝 Observaciones" en sidebar (entre Visitas y Pacientes), rutas registradas. Funcionalidades: listado con Fecha visita/Establecimiento/Descripción truncada/Paciente Animal; alta asociada a Visita; edición; sujeto animal opcional (`sujeto_tipo='animal'`, `animal_id`); sin ciclo de vida. Filtro por establecimiento activo vía join `visitas!inner`. Sin migración (tabla ya existía). Validación automatizada con Playwright — 27/27 checks PASS, sin errores de consola, sin regresiones.
- **Roadmap reorganizado (BIT-32 auditoría + BIT-33 roadmap, 30 Jul 2026):** Ver BIT-33 en Notion para el plan maestro completo. Próximos módulos: BIT-10 (Atenciones Clínicas), BIT-13/14/15 (ciclo de vida de Atención Clínica), BIT-12/16/17 (informe diario + WhatsApp). BIT-11 (Personas) **no es bloqueante** — Tutor Responsable se crea inline en el formulario de Paciente Animal.

---
*Mantenido por Anthy. Última actualización: 9 Ago 2026 — BIT-09 cerrado. Módulo Observaciones de Campo implementado, validado con Playwright (27/27 PASS) y marcado ✅ Completa en Notion.*
