// Lógica de la pantalla de Login. No conoce nada del shell de la
// app (js/core/app.js) — su único trabajo es autenticar y redirigir.

import { getSession, signIn } from './core/auth.js';

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
