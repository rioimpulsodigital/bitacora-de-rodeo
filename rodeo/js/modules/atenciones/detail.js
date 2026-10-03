// Ficha de solo lectura de Atención Clínica (BIT-57). Antes de esta tarea,
// quien no calificaba para "Editar" (no admin, no profesional dueño) no
// tenía forma de abrir el detalle clínico completo -- solo la fila
// truncada del listado. Reutiliza getAtencion() ya existente, sin tocar
// services.js ni RLS. OPERADOR_CAMPO sigue sin acceso: el módulo entero ya
// lo bloquea antes de llegar al listado (mountAtencionesList), así que
// nunca ve un link "Ver" para empezar -- esta ficha no amplía ese permiso.

import { getAtencion } from './services.js';
import { escapeHtml } from '../../dashboard.js';
import { etiquetaPaciente } from '../../services/paciente-label.js';

function toDateOnly(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function fmt(value) {
  const isoDate = toDateOnly(value);
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function campo(etiqueta, valor, { vacio = 'No informado' } = {}) {
  const hayValor = valor !== null && valor !== undefined && String(valor).trim() !== '';
  return `
    <div class="rodeo-ficha-campo">
      <span class="form-label">${escapeHtml(etiqueta)}</span>
      <div class="${hayValor ? '' : 'rodeo-ficha-vacio'}">${escapeHtml(hayValor ? valor : vacio)}</div>
    </div>`;
}

function bloqueTexto(etiqueta, valor) {
  if (!valor) return '';
  return `<div class="rodeo-ficha-campo"><span class="form-label">${escapeHtml(etiqueta)}</span><div style="white-space:pre-wrap">${escapeHtml(valor)}</div></div>`;
}

export async function mountAtencionDetail(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let atencion;
  try {
    atencion = await getAtencion(id);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">No se pudo cargar la Atención: ${escapeHtml(e.message)}</p><a href="#atenciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }
  if (!atencion) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Atención no encontrada.</p><a href="#atenciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a></div>`;
    return;
  }

  // Mismo criterio de permiso de edición que atenciones/list.js.
  const esAdmin = ctx.perfil.rol === 'ADMINISTRADOR';
  const esProfesional = ctx.perfil.rol === 'PROFESIONAL';
  const puedeEditar = esAdmin || (esProfesional && atencion.profesional_responsable_id === ctx.perfil.id);

  contenedor.innerHTML = `
    <div class="rodeo-card rodeo-ficha">
      <div class="rodeo-card-header">
        <h2>Atención Clínica — ${escapeHtml(etiquetaPaciente(atencion.animales, { conEspecie: true }))}</h2>
        ${puedeEditar ? `<a class="rodeo-btn" href="#atenciones/editar/${atencion.id}">Editar</a>` : ''}
      </div>

      <div class="rodeo-ficha-grid">
        ${campo('Fecha', fmt(atencion.fecha))}
        ${campo('Hora', atencion.hora?.slice(0, 5))}
        ${campo('Estado', atencion.estado === 'abierta' ? 'Abierta' : 'Cerrada')}
        ${campo('Próxima visita', fmt(atencion.proxima_visita))}
        ${campo('Profesional responsable', atencion.perfiles?.nombre)}
        ${campo('Lote', atencion.lotes?.nombre, { vacio: 'Sin lote' })}
        ${campo('Visita de terreno relacionada', atencion.visitas ? `${fmt(atencion.visitas.fecha)} — ${atencion.visitas.tipo ?? ''}` : null, { vacio: 'Sin visita asociada' })}
      </div>

      ${bloqueTexto('Motivo de consulta', atencion.motivo)}
      ${bloqueTexto('Antecedentes', atencion.antecedentes)}
      ${bloqueTexto('Examen', atencion.examen)}
      ${bloqueTexto('Diagnóstico', atencion.diagnostico)}
      ${bloqueTexto('Tratamiento', atencion.tratamiento)}
      ${bloqueTexto('Exámenes / estudios', atencion.examenes_estudios)}
      ${bloqueTexto('Observaciones', atencion.observaciones)}

      <div class="rodeo-form-acciones" style="margin-top:16px">
        <a href="#atenciones" class="rodeo-link-btn" style="margin-left:0">Volver al listado</a>
      </div>
    </div>`;
}
