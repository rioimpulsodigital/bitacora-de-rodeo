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

## Manuales de la Biblioteca que me aplican

Biblioteca completa: https://app.notion.com/p/3a66c976f0cd818ead5ae23db9a10d4a ("✨ Forma de Trabajar")

- **Estándar de Informes Técnicos** — Tipo A (11 secciones, tareas grandes) / Tipo B (auditoría, 10 fases) / Tipo C (5 bloques, fixes chicos). Adoptado desde el 24 Jul 2026 — antes usaba un formato libre propio.
- **Metodología de Auditoría Operativa** — aplicar cuando se investiga un bug real, no una implementación planificada.
- **Sistema de Trabajo — RiO Impulso Digital** — división de roles y estructura general.
- **Entorno de Trabajo — VS Code + IA** — mayormente no aplica (está armado para PHP/Laravel/cPanel); solo la sección de conexión MCP a Notion es relevante acá.

**Pie obligatorio en los informes:** `*Informe generado por Anthy — Bitácora de Rodeo | [Fecha]*`

## Qué es este proyecto (lo que no está en un manual genérico)

Plataforma modular para gestión de trabajo en terreno. Dos módulos operativos:
- **Rescate Equino Municipalidad** — registro de jornada laboral, informes diario/semanal/mensual.
- **Proyecto Recuperación de Rodeo** — formulario de intervención sanitaria sobre animales.

**Stack:** HTML/CSS/JS vanilla, ES Modules nativos (sin build, sin npm) — decisión firme, no proponer frameworks. Backend: Google Apps Script + Google Sheets, uno independiente por módulo (`apps-script-rescate-equino.gs`, `apps-script-rodeo.gs`), ambos bajo la cuenta `lunitapeluvet@gmail.com`.

**Arquitectura del frontend:** registro de módulos — cada módulo en `js/modules/<id>/` exporta un objeto con contrato fijo (`mount`, `mountNav` opcional, `onTick` opcional). `js/core/*` nunca importa de un módulo específico. Agregar un módulo nuevo = una carpeta + 2 líneas en `main.js` + un `<link>` CSS, sin tocar el núcleo.

**Identidad de marca:** alineada con la landing de Lunita Pelu Vet (lunitapeluvet.rio-landing.com) — misma tipografía (Fredoka/Nunito/Caveat), misma paleta, bordes redondeados. Bitácora de Rodeo eventualmente vivirá embebida dentro de ese sitio.

**Personas reales del ecosistema:** Etel Salinas (dueña de Lunita Pelu Vet, vinculada también a "Fundación Doly") es la usuaria real de Rescate Equino Municipalidad, y aparece como opción de "Dueño" en el formulario de Rodeo — no son entidades separadas.

## Pendiente activo (actualizar o borrar esta sección al cerrarse)

- ~~Confirmar bug de fechas en informes de Rescate Equino~~ — **despriorizado por Brenda el 25 Jul 2026, NO retomar de forma proactiva.** El código del fix está bien en el repo y verificado con `testFormatFix()` directo en el editor de Apps Script; publicar la versión activa correcta en producción quedó como pendiente de baja prioridad. El plan de Brenda es corregir estos detalles de formato al generar el informe "de verdad" más adelante, tomando los datos crudos — no depender de que el Apps Script los devuelva ya limpios. Detalle completo en BIT-29 (Notion). Si Brenda lo menciona, retomar desde ahí; si no, dejarlo.
- ~~Cloudflare Pages~~ — confirmado OK por Brenda el 25 Jul 2026, sin acción.
- Registros de Rodeo cayendo en la pestaña "Bitácora" en vez de "Registros" — diferido a propósito, revisar después (sin fecha).

---
*Mantenido por Anthy. Última actualización: 25 Jul 2026.*
