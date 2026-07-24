// Calendario mensual, solo-lunes, para elegir la semana de un
// informe semanal. Componente puramente presentacional: no tiene
// estado propio, lo recibe por parámetro de reports.js. Podría
// reutilizarse tal cual en cualquier módulo futuro que necesite
// elegir una semana (p. ej. Reportes/Estadísticas).

import { pad, now } from '../../core/format.js';

export function tplWeekCalendar({ calendarMonth, reportDate }) {
  const ref = calendarMonth || now();
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const today = now();

  const monthName = new Date(year, month, 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const headers = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    .map(h => `<div style="text-align:center;font-size:10px;color:var(--faint);letter-spacing:0.06em;padding:4px 0;">${h}</div>`)
    .join('');

  const firstDow = new Date(year, month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayCells = cells.map((day, i) => {
    if (!day) return `<div></div>`;
    const col = i % 7;
    const isMonday = col === 0;
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    const isSelected = reportDate === dateStr;
    const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

    if (isMonday) {
      return `<div onclick="Rescate.calSelectMonday('${dateStr}')"
          style="padding:7px 2px;text-align:center;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;
          background:${isSelected ? 'var(--dark-teal)' : 'var(--surface2)'};
          color:${isSelected ? '#fff' : 'var(--dark-teal)'};">${day}</div>`;
    }
    return `<div style="padding:7px 2px;text-align:center;font-size:13px;
        color:${isToday ? 'var(--orange)' : 'var(--faint)'};">${day}</div>`;
  }).join('');

  const canConfirm = !!reportDate;
  const confirmStyle = canConfirm ? '' : 'opacity:0.4;pointer-events:none;';

  return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <button onclick="Rescate.calPrev()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--muted);padding:0 10px;line-height:1;">‹</button>
          <div style="font-size:13px;font-weight:bold;text-transform:capitalize;">${monthName}</div>
          <button onclick="Rescate.calNext()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--muted);padding:0 10px;line-height:1;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px;">${headers}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">${dayCells}</div>
      </div>
      <button class="salida-btn" style="margin-top:14px;${confirmStyle}" onclick="Rescate.doReport('weekly')">
        ${canConfirm ? 'Ver semana del ' + reportDate : 'Selecciona un lunes'}
      </button>`;
}
