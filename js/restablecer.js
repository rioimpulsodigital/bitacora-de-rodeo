// BIT-75 — Pantalla para elegir/cambiar la contraseña. Dos entradas legítimas:
//  1) enlace de correo (recuperación/alta): Supabase abre una sesión desde el fragmento de la URL;
//  2) usuario con sesión que quiere cambiarla (?modo=cambio).
// La contraseña viaja solo del navegador a Supabase Auth; no se guarda, no se registra ni se muestra.
import { getSession, signOut, updatePassword } from './core/auth.js';

const estadoEl = document.getElementById('rest-estado');
const form = document.getElementById('rest-form');
const errorEl = document.getElementById('rest-error');
const submitBtn = document.getElementById('rest-submit');
const modoCambio = new URLSearchParams(location.search).get('modo') === 'cambio';
if (modoCambio) document.getElementById('rest-volver').href = 'rodeo/index.html';

function mostrarError(m) { errorEl.textContent = m; errorEl.classList.add('visible'); }

// El cliente procesa el fragmento de forma asíncrona: se espera un instante antes de decidir.
async function sesionDisponible() {
  for (let i = 0; i < 10; i++) {
    const s = await getSession();
    if (s) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

const sesion = await sesionDisponible();
// Limpia el fragmento (tokens) de la barra de direcciones y del historial.
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

if (!sesion) {
  estadoEl.textContent = 'El enlace no es válido o venció. Pedí uno nuevo desde «Olvidé mi contraseña».';
} else {
  estadoEl.style.display = 'none';
  form.style.display = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('visible');
  const p1 = document.getElementById('rest-pass').value;
  const p2 = document.getElementById('rest-pass2').value;
  if (p1.length < 10) return mostrarError('La contraseña debe tener al menos 10 caracteres.');
  if (p1 !== p2) return mostrarError('Las contraseñas no coinciden.');
  submitBtn.disabled = true;
  const { error } = await updatePassword(p1);
  if (error) {
    submitBtn.disabled = false;
    mostrarError('No se pudo guardar la contraseña. Probá con otra o pedí un enlace nuevo.');
    return;
  }
  if (modoCambio) { location.replace('rodeo/index.html'); return; }
  await signOut();
  location.replace('login.html?clave=ok');
});
