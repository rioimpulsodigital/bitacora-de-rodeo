// Lógica de la pantalla de Login. No conoce nada del shell de la
// app (js/core/app.js) — su único trabajo es autenticar y redirigir.

import { getSession, signIn, requestPasswordReset } from './core/auth.js';

const form = document.getElementById('login-form');
const emailEl = document.getElementById('login-email');
const passwordEl = document.getElementById('login-password');
const errorEl = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('visible');
}

function clearError() {
  errorEl.textContent = '';
  errorEl.classList.remove('visible');
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? 'Ingresando…' : 'Ingresar';
}

// Si ya hay sesión activa, no tiene sentido mostrar el Login.
const existing = await getSession();
if (existing) {
  location.replace('index.html');
}

// Toggle de visibilidad de contraseña
const toggleBtn = document.getElementById('toggle-password');
const eyeShow = toggleBtn.querySelector('.eye-show');
const eyeHide = toggleBtn.querySelector('.eye-hide');

toggleBtn.addEventListener('click', () => {
  const visible = passwordEl.type === 'text';
  passwordEl.type = visible ? 'password' : 'text';
  eyeShow.style.display = visible ? '' : 'none';
  eyeHide.style.display = visible ? 'none' : '';
  toggleBtn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  setLoading(true);

  const { error } = await signIn(emailEl.value.trim(), passwordEl.value);

  setLoading(false);

  if (error) {
    showError('Email o contraseña incorrectos.');
    return;
  }

  location.replace('index.html');
});

// BIT-75: recuperación de contraseña. Respuesta idéntica exista o no la cuenta (no revela usuarios).
const infoEl = document.getElementById('login-info');
function mostrarInfo(m) { infoEl.textContent = m; infoEl.classList.add('visible'); }
if (new URLSearchParams(location.search).get('clave') === 'ok') mostrarInfo('Contraseña guardada. Ya podés ingresar.');
document.getElementById('login-olvide').addEventListener('click', async (e) => {
  e.preventDefault();
  clearError();
  const email = emailEl.value.trim();
  if (!email.includes('@')) { showError('Ingresá tu email y volvé a tocar «Olvidé mi contraseña».'); return; }
  await requestPasswordReset(email, new URL('restablecer.html', location.href).href);
  mostrarInfo('Si el email corresponde a una cuenta activa, te enviamos un correo para elegir una contraseña nueva.');
});
