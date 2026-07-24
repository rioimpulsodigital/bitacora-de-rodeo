// Tracker de jornada: llegada, log de actividades y salida.
// Dueño exclusivo del estado `session` — ningún otro archivo
// debe leer o escribir bitacora_session directamente.

import { pad, now, fTime, fElap, fISO, calcH, esc } from '../../core/format.js';
import { flash } from '../../core/flash.js';
import { getJSON, setJSON, removeItem } from '../../core/storage.js';
import { rerenderModuloActivo as rerender } from '../../core/app.js';
import { saveJornada } from './api.js';

const STORAGE_KEY = 'bitacora_session';
let session = getJSON(STORAGE_KEY, null);

export function hasActiveSession() {
  return !!session;
}

export function tplIdle() {
  const n = now();
  return `
      <div class="idle-screen">
        <div>
          <div class="big-clock" id="clock">${fTime(n)}</div>
          <div class="big-clock-sec" id="clock-sec">:${pad(n.getSeconds())}</div>
        </div>
        <button class="llegada-btn" onclick="Rescate.doLlegada()">LLEGADA</button>
        <div class="hint">Presiona para iniciar la jornada</div>
      </div>`;
}

export function tplActive() {
  return `
      <div class="session-wrap">
        <div class="status-bar">
          <div>
            <div class="status-label">Llegada</div>
            <div class="val-orange">${fTime(new Date(session.arrivalTs))}</div>
          </div>
          <div style="text-align:center">
            <div class="badge-active">● activo</div>
            <div class="val-center" id="elapsed">${fElap(Date.now() - session.arrivalTs)}</div>
          </div>
          <div style="text-align:right">
            <div class="status-label">Actividades</div>
            <div class="val-teal" id="act-count">${session.activities.length}</div>
          </div>
        </div>
        <div id="activity-log">${tplLog()}</div>
        <div class="input-area">
          <textarea id="act-input" class="act-textarea" rows="2"
            placeholder="Describe la actividad... (Enter para agregar)"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();Rescate.doAdd();}"></textarea>
          <button class="add-btn" onclick="Rescate.doAdd()">+</button>
        </div>
        ${Date.now() - session.arrivalTs > 43200000 ? `
        <div style="margin:0 22px 0;padding:14px 16px;background:#fff3cd;border:1px solid #ffeaa0;border-radius:10px;font-size:13px;color:#7a5c00;">
          <div style="font-weight:bold;margin-bottom:8px;">⚠️ La sesión lleva más de 12 horas activa</div>
          <div style="margin-bottom:10px;">¿Olvidaste cerrar el día anterior? Ingresa la hora real de salida:</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="time" id="dep-time-input" value="17:00"
              style="padding:8px 12px;border:1px solid #ffc107;border-radius:8px;background:#fffdf0;font-size:14px;font-family:inherit;outline:none;flex:1;">
            <button onclick="Rescate.doSalidaConHora()" style="background:#f87523;border:none;color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:bold;cursor:pointer;white-space:nowrap;">Cerrar con esta hora</button>
          </div>
        </div>` : ''}
        <div class="salida-area">
          <button class="salida-btn" onclick="Rescate.doSalida()">Salida — cerrar jornada</button>
        </div>
      </div>`;
}

function tplLog() {
  if (!session || session.activities.length === 0)
    return `<div class="act-empty">Aún no hay actividades registradas.<br>Escribe abajo y presiona Enter o +</div>`;
  return session.activities.map(a => `
      <div class="act-item">
        <span class="act-time">${a.time}</span>
        <span class="act-text">${esc(a.text)}</span>
      </div>`).join('');
}

function refreshLog() {
  const log = document.getElementById('activity-log');
  if (log) { log.innerHTML = tplLog(); log.scrollTop = log.scrollHeight; }
  const cnt = document.getElementById('act-count');
  if (cnt) cnt.textContent = session.activities.length;
}

export function doLlegada() {
  session = { arrivalTs: Date.now(), activities: [] };
  setJSON(STORAGE_KEY, session);
  rerender();
  setTimeout(() => document.getElementById('act-input')?.focus(), 100);
}

export function doAdd() {
  const inp = document.getElementById('act-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  session.activities.push({ time: fTime(now()), text });
  setJSON(STORAGE_KEY, session);
  inp.value = '';
  refreshLog();
  inp.focus();
}

export function doSalidaConHora() {
  const inp = document.getElementById('dep-time-input');
  if (!inp || !inp.value) return;
  const arrival = new Date(session.arrivalTs);
  const [h, m] = inp.value.split(':').map(Number);
  const customEnd = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate(), h, m, 0);
  doSalida(customEnd.getTime());
}

export async function doSalida(customEndTs) {
  if (!session) return;
  const endTs = customEndTs || Date.now();
  const arrival = new Date(session.arrivalTs);
  const elapsed = fElap(endTs - session.arrivalTs);
  const actsText = session.activities.length > 0
    ? session.activities.map(a => `[${a.time}] ${a.text}`).join('\n')
    : 'Sin actividades registradas';

  const payload = {
    date: fISO(arrival),
    arrival: fTime(arrival),
    departure: fTime(new Date(endTs)),
    activities: actsText,
    duration: calcH(session.arrivalTs, endTs),
  };

  session = null;
  removeItem(STORAGE_KEY);
  rerender();

  try {
    const data = await saveJornada(payload);
    if (data.success) flash('ok', `✓ Jornada guardada — ${elapsed} trabajadas`);
    else flash('error', `Error al guardar: ${data.error || 'respuesta inesperada'}`);
  } catch {
    flash('error', 'Sin conexión — verifica tu internet');
  }
}

export function tickClock(n) {
  const clk = document.getElementById('clock');
  if (clk) clk.textContent = fTime(n);
  const sec = document.getElementById('clock-sec');
  if (sec) sec.textContent = ':' + pad(n.getSeconds());
}

export function tickSession(n) {
  const elp = document.getElementById('elapsed');
  if (elp && session) elp.textContent = fElap(n - session.arrivalTs);
}
