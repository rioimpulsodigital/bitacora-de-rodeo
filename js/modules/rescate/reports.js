// Informes diario/semanal/mensual. Dueño exclusivo del estado de
// esta sub-vista (fase, tipo, fecha elegida, mes de calendario,
// datos cargados). session.js no conoce nada de este archivo, y
// viceversa — son dos sub-vistas hermanas, no dependientes entre sí.

import { now, fISO, fH, esc } from '../../core/format.js';
import { flash } from '../../core/flash.js';
import { rerenderModuloActivo as rerender } from '../../core/app.js';
import { fetchReport } from './api.js';
import { tplWeekCalendar } from './calendar.js';

let reportPhase = 'idle';   // idle | selecting | picking-date | loaded
let reportType = null;
let reportDate = null;
let calendarMonth = null;
let report = null;
let loading = false;

// ── NAVEGACIÓN INTERNA DE LA VISTA ──────────────────────────────
// Reemplazan las mutaciones inline `S.reportPhase = '...'; render()`
// que antes vivían directamente en los `onclick` de las plantillas.
export function mostrarSelectorPeriodo() {
  reportPhase = 'selecting';
  reportDate = null;
  rerender();
}

export function elegirPeriodo(type) {
  reportPhase = 'picking-date';
  reportType = type;
  rerender();
}

export function cancelarSeleccion() {
  reportPhase = 'idle';
  rerender();
}

export function nuevoInforme() {
  reportPhase = 'idle';
  report = null;
  reportDate = null;
  rerender();
}

// ── CALENDARIO DE SEMANAS ───────────────────────────────────────
export function calPrev() {
  const d = calendarMonth || now();
  calendarMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  rerender();
}

export function calNext() {
  const d = calendarMonth || now();
  calendarMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  rerender();
}

export function calSelectMonday(dateStr) {
  reportDate = reportDate === dateStr ? null : dateStr;
  rerender();
}

// ── PLANTILLAS ───────────────────────────────────────────────────
export function tplInformes() {
  if (reportPhase === 'idle') return `
      <div class="informes-wrap">
        <div class="informes-idle">
          <div style="text-align:center">
            <div style="font-size:11px;color:var(--faint);letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px;">Informes de trabajo</div>
            <div style="font-size:13px;color:var(--muted);">Genera un informe diario, semanal o mensual</div>
          </div>
          <button class="crear-btn" onclick="Rescate.mostrarSelectorPeriodo()">Crear informe</button>
        </div>
      </div>`;

  if (reportPhase === 'picking-date') {
    if (reportType === 'weekly') return `
        <div class="informes-wrap">
          <div style="font-size:11px;color:var(--faint);letter-spacing:0.14em;text-transform:uppercase;margin-bottom:16px;text-align:center;">¿Qué semana quieres ver?</div>
          ${tplWeekCalendar({ calendarMonth, reportDate })}
          <div style="text-align:center;margin-top:10px;">
            <button class="back-btn" onclick="Rescate.mostrarSelectorPeriodo()">← Volver</button>
          </div>
        </div>`;

    const labels = { daily: '¿Qué día quieres ver?', monthly: '¿Qué mes quieres ver?' };
    const iType = reportType === 'monthly' ? 'month' : 'date';
    const defVal = reportType === 'monthly' ? fISO(now()).slice(0, 7) : fISO(now());
    return `
        <div class="informes-wrap">
          <div style="padding-top:30px;max-width:320px;margin:0 auto;">
            <div style="font-size:11px;color:var(--faint);letter-spacing:0.14em;text-transform:uppercase;margin-bottom:20px;text-align:center;">${labels[reportType]}</div>
            <input type="${iType}" id="report-date" value="${defVal}"
              style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:15px;font-family:inherit;margin-bottom:14px;outline:none;">
            <button class="salida-btn" style="margin-bottom:10px;" onclick="Rescate.confirmReportDate()">Ver informe</button>
            <div style="text-align:center;">
              <button class="back-btn" onclick="Rescate.mostrarSelectorPeriodo()">← Volver</button>
            </div>
          </div>
        </div>`;
  }

  if (reportPhase === 'selecting') return `
      <div class="informes-wrap">
        <div style="padding-top:20px;">
          <div style="font-size:11px;color:var(--faint);letter-spacing:0.14em;text-transform:uppercase;margin-bottom:16px;text-align:center;">¿Qué período quieres ver?</div>
          <button class="rpt-option" style="border-left:4px solid #f87523" onclick="Rescate.elegirPeriodo('daily')">
            <div><div style="font-size:14px;font-weight:bold;">Informe diario</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Actividades de hoy</div></div>
            <span style="font-size:18px;color:#f87523">→</span>
          </button>
          <button class="rpt-option" style="border-left:4px solid #1db7b9" onclick="Rescate.elegirPeriodo('weekly')">
            <div><div style="font-size:14px;font-weight:bold;">Informe semanal</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Resumen de esta semana</div></div>
            <span style="font-size:18px;color:#1db7b9">→</span>
          </button>
          <button class="rpt-option" style="border-left:4px solid #126d68" onclick="Rescate.elegirPeriodo('monthly')">
            <div><div style="font-size:14px;font-weight:bold;">Informe mensual</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Resumen del mes en curso</div></div>
            <span style="font-size:18px;color:#126d68">→</span>
          </button>
          <button class="back-btn" onclick="Rescate.cancelarSeleccion()">← Cancelar</button>
        </div>
      </div>`;

  // loaded
  const titles = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' };
  const body = loading
    ? `<div style="color:var(--muted);text-align:center;padding:40px 0;">Generando informe...</div>`
    : report ? tplReportData() : '';

  return `
      <div class="informes-wrap">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <div style="font-size:10px;color:var(--faint);text-transform:uppercase;letter-spacing:0.12em;">Informe</div>
            <div style="font-size:16px;font-weight:bold;">${titles[reportType]}</div>
            ${reportDate ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${reportDate}</div>` : ''}
          </div>
          <button class="nuevo-btn" onclick="Rescate.nuevoInforme()">+ Nuevo informe</button>
        </div>
        ${body}
      </div>`;
}

function tplReportData() {
  const r = report;
  const entries = r.data.length === 0
    ? `<div style="color:var(--faint);text-align:center;padding:30px;font-size:13px;">Sin registros para este período</div>`
    : [...r.data].reverse().map(item => `
          <div class="entry-card" onclick="Rescate.toggleEntry(this)">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-size:13px;font-weight:bold;">${item.date}</span>
                <span style="font-size:11px;color:var(--muted);margin-left:10px;">${item.arrival} → ${item.departure}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:13px;color:var(--dark-teal);font-weight:bold;">${fH(item.duration)}</span>
                <span style="font-size:11px;color:var(--faint);" class="arrow">▼</span>
              </div>
            </div>
            <div class="entry-acts">${esc(item.activities)}</div>
          </div>`).join('');

  return `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-lbl">Jornadas</div><div style="font-size:20px;color:var(--orange);font-weight:bold;">${r.summary.total_entries}</div></div>
        <div class="stat-card"><div class="stat-lbl">Horas totales</div><div style="font-size:20px;color:var(--teal);font-weight:bold;">${fH(r.summary.total_hours)}</div></div>
        <div class="stat-card"><div class="stat-lbl">Promedio/día</div><div style="font-size:20px;color:var(--dark-teal);font-weight:bold;">${fH(r.summary.avg_hours)}</div></div>
      </div>
      ${r.data.length > 0 ? `<button class="export-btn" onclick="Rescate.doExport()">↓ Descargar informe (.txt)</button>` : ''}
      ${entries}`;
}

export function toggleEntry(card) {
  const acts = card.querySelector('.entry-acts');
  const arrow = card.querySelector('.arrow');
  const open = acts.style.display === 'block';
  acts.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▼' : '▲';
}

export function confirmReportDate() {
  const input = document.getElementById('report-date');
  const defaultVal = reportType === 'monthly' ? fISO(now()).slice(0, 7) : fISO(now());
  reportDate = input ? input.value : defaultVal;
  doReport(reportType);
}

export async function doReport(type) {
  reportType = type;
  reportPhase = 'loaded';
  loading = true;
  report = null;
  rerender();
  try {
    const data = await fetchReport(type, reportDate);
    if (data.success) report = data;
    else flash('error', 'Error al cargar el informe');
  } catch {
    flash('error', 'No se pudo conectar');
    reportPhase = 'idle';
  }
  loading = false;
  rerender();
}

export function doExport() {
  if (!report) return;
  const t = { daily: 'DIARIO', weekly: 'SEMANAL', monthly: 'MENSUAL' }[reportType];
  const r = report;
  const lines = [
    `INFORME ${t} — BITÁCORA DE TRABAJO`,
    `Generado: ${new Date().toLocaleString('es-MX')}`,
    '─'.repeat(52),
    `Jornadas: ${r.summary.total_entries}   Horas: ${fH(r.summary.total_hours)}   Promedio: ${fH(r.summary.avg_hours)}`,
    '─'.repeat(52), '',
    ...r.data.map(e => `${e.date}   ${e.arrival} → ${e.departure}   (${fH(e.duration)})\n${e.activities}\n`)
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
  a.download = `bitacora_${reportType}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
}
