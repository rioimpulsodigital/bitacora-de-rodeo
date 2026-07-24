// Backend del módulo Proyecto Recuperación de Rodeo — Google
// Apps Script y Google Sheet propios, totalmente independientes
// del módulo Rescate Equino Municipalidad (ver rescate/api.js).

const URL_GS_RODEO = "https://script.google.com/macros/s/AKfycbwmqxoitQKmGRrYf7HR20JKzt_fPMWRNTl0fklOlwhjhjgywIPOVLJ-_oo9XxGeBebU/exec";

export async function saveRegistro(payload) {
  const params = new URLSearchParams({ action: 'save', ...payload });
  const res = await fetch(`${URL_GS_RODEO}?${params}`);
  return res.json();
}
