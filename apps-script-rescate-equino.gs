// ============================================================
// RESCATE EQUINO MUNICIPALIDAD — Google Apps Script
// Backend independiente del módulo Proyecto Recuperación de Rodeo
// (ese módulo usa apps-script-rodeo.gs, sobre otra Google Sheet).
//
// Pega este código en Extensions > Apps Script de tu Google Sheet.
// Luego: Deploy > New Deployment > Web App > Execute as: Me >
// Who has access: Anyone > Deploy.
// (La hoja "Registros" y sus encabezados se crean solos si no existen.)
// ============================================================

const SHEET_NAME = 'Registros';
const HEADERS = ['Fecha', 'Llegada', 'Salida', 'Actividades', 'Duración (hs)'];

function doGet(e) {
  const action = e.parameter.action;
  const sheet = getOrCreateSheet();

  // ── GUARDAR ENTRADA ──────────────────────────────────────
  if (action === 'save') {
    const row = [
      e.parameter.date,
      e.parameter.arrival,
      e.parameter.departure,
      e.parameter.activities,
      parseFloat(e.parameter.duration)
    ];
    sheet.appendRow(row);

    // Formatear Fecha/Llegada/Salida como texto plano DESPUÉS de
    // escribirlas, y volver a escribir los mismos valores: si solo
    // se cambia el formato de la celda ya no alcanza, Sheets necesita
    // que el valor se re-escriba para dejar de tratarlo como Fecha/Hora.
    const lastRow = sheet.getLastRow();
    const dateRange = sheet.getRange(lastRow, 1, 1, 3);
    dateRange.setNumberFormat('@');
    dateRange.setValues([[e.parameter.date, e.parameter.arrival, e.parameter.departure]]);

    return respond({ success: true, message: 'Entrada guardada' });
  }

  // ── OBTENER REPORTE ──────────────────────────────────────
  if (action === 'report') {
    const type = e.parameter.type || 'daily';
    const allData = sheet.getDataRange().getValues();

    if (allData.length <= 1) {
      return respond({ success: true, data: [], summary: emptySummary() });
    }

    const rows = allData.slice(1).filter(r => r[0] !== ''); // skip empty rows

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = [];

    if (type === 'daily') {
      const dateParam = e.parameter.date;
      const target = dateParam ? new Date(dateParam + 'T00:00:00') : today;
      target.setHours(0, 0, 0, 0);
      const targetStr = formatDateStr(target);
      filtered = rows.filter(r => {
        const d = parseDate(r[0]);
        return d && formatDateStr(d) === targetStr;
      });

    } else if (type === 'weekly') {
      const dateParam = e.parameter.date;
      const ref = dateParam ? new Date(dateParam + 'T00:00:00') : today;
      ref.setHours(0, 0, 0, 0);
      const weekStart = new Date(ref);
      const dow = ref.getDay();
      weekStart.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1)); // Lunes
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      filtered = rows.filter(r => {
        const d = parseDate(r[0]);
        return d && d >= weekStart && d <= weekEnd;
      });

    } else if (type === 'monthly') {
      const dateParam = e.parameter.date; // YYYY-MM o YYYY-MM-DD
      let targetMonth, targetYear;
      if (dateParam) {
        const parts = dateParam.split('-');
        targetYear  = parseInt(parts[0]);
        targetMonth = parseInt(parts[1]) - 1;
      } else {
        targetMonth = today.getMonth();
        targetYear  = today.getFullYear();
      }
      filtered = rows.filter(r => {
        const d = parseDate(r[0]);
        return d && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });
    }

    const entries = filtered.map(r => ({
      date: formatCellDate(r[0]),
      arrival: formatCellTime(r[1]),
      departure: formatCellTime(r[2]),
      activities: String(r[3]),
      duration: parseFloat(r[4]) || 0
    }));

    const totalHours = entries.reduce((sum, e) => sum + e.duration, 0);
    const avgHours = entries.length > 0 ? totalHours / entries.length : 0;

    return respond({
      success: true,
      data: entries,
      summary: {
        total_entries: entries.length,
        total_hours: Math.round(totalHours * 100) / 100,
        avg_hours: Math.round(avgHours * 100) / 100
      }
    });
  }

  // ── PING (verificar conexión) ────────────────────────────
  if (action === 'ping') {
    return respond({ success: true, message: 'Conexión OK ✅' });
  }

  return respond({ success: false, error: 'Acción no reconocida' });
}

// ── HELPERS ─────────────────────────────────────────────────

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Defensivos: si Sheets guardó la celda como Fecha/Hora en vez de
// texto plano (auto-detección de Google Sheets, ver 'save' arriba),
// esto la formatea igual de bien que si fuera el texto esperado.
// Cubre tanto entradas nuevas como filas viejas ya mal tipadas.
function formatCellDate(val) {
  if (val instanceof Date) return formatDateStr(val);
  return String(val);
}

function formatCellTime(val) {
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(val);
}

function emptySummary() {
  return { total_entries: 0, total_hours: 0, avg_hours: 0 };
}
