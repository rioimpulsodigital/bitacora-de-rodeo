// ============================================================
// PROYECTO RECUPERACIÓN DE RODEO — Google Apps Script
// Backend independiente del módulo Rescate Equino Municipalidad
// (ese módulo usa apps-script.gs, sobre otra Google Sheet).
//
// Cómo deployar:
// 1. Crear una Google Sheet nueva llamada "Proyecto Recuperación de Rodeo".
// 2. Extensions > Apps Script > pegar este código.
// 3. Deploy > New Deployment > Web App > Execute as: Me > Who has access: Anyone > Deploy.
// 4. Copiar la URL del Web App y pegarla en URL_GS_RODEO dentro de index.html.
//    (La hoja "Registros" y sus encabezados se crean solos en el primer guardado.)
// ============================================================

const SHEET_NAME = 'Registros';
const HEADERS = [
  'Timestamp',
  'Caravana',
  'Dueño',
  'Clasificación',
  'Vitamina',
  'Antiparasitario Interno',
  'Antiparasitario Externo',
  'Observaciones'
];

function doGet(e) {
  const action = e.parameter.action;

  // ── GUARDAR REGISTRO ─────────────────────────────────────
  if (action === 'save') {
    const sheet = getOrCreateSheet();
    const row = [
      new Date(), // Timestamp: generado por el servidor, nunca por el usuario
      e.parameter.caravana,
      e.parameter.dueno,
      e.parameter.clasificacion,
      e.parameter.vitamina || 'No',
      e.parameter.antiparasitario_interno || 'No',
      e.parameter.antiparasitario_externo || 'No',
      e.parameter.observaciones || ''
    ];
    sheet.appendRow(row);
    return respond({ success: true, message: 'Registro guardado' });
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
