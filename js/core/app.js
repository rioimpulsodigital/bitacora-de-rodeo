// Núcleo de la aplicación: registro de módulos, selector de
// módulo activo (portada / módulo_bar) y el tick de reloj global.
//
// Contrato que debe cumplir un módulo para poder registrarse:
//   {
//     id, icon, color,               // identidad visual
//     portalTitle, portalSubtitle,   // tarjeta en la portada
//     shortLabel,                    // texto corto en la barra de módulo
//     headerLabel,                   // texto del header cuando está activo
//     mount(mainEl),                 // renderiza el contenido del módulo
//     mountNav(navEl),               // opcional: sub-navegación en el header
//     onTick(now),                   // opcional: actualización por segundo
//   }
//
// Este archivo NUNCA debe importar nada de js/modules/* — la
// dependencia va siempre en un solo sentido (módulos → core).

import { fDate } from './format.js';
import { getItem, setItem, removeItem } from './storage.js';
import { tplPortada } from './portal.js';

const STORAGE_KEY = 'bitacora_modulo';
const modules = [];
let current = null;

export function registerModule(mod) {
  modules.push(mod);
}

function els() {
  return {
    main: document.getElementById('main'),
    nav: document.getElementById('header-nav'),
    headerLabel: document.getElementById('header-label'),
    moduloBar: document.getElementById('modulo-bar'),
    moduloLabel: document.getElementById('modulo-bar-label'),
  };
}

function renderPortada() {
  const { main, nav, headerLabel, moduloBar } = els();
  nav.style.display = 'none';
  nav.innerHTML = '';
  headerLabel.textContent = 'Bitácora de Rodeo';
  moduloBar.style.display = 'none';
  main.innerHTML = tplPortada(modules);
}

function renderModuloActivo() {
  if (!current) return renderPortada();

  const { main, nav, headerLabel, moduloBar, moduloLabel } = els();
  moduloBar.style.display = 'flex';
  moduloLabel.textContent = `${current.icon} ${current.shortLabel}`;
  headerLabel.textContent = current.headerLabel;

  if (current.mountNav) {
    nav.style.display = 'flex';
    current.mountNav(nav);
  } else {
    nav.style.display = 'none';
    nav.innerHTML = '';
  }

  current.mount(main);
}

export function selectModulo(id) {
  current = modules.find(m => m.id === id) || null;
  if (current) setItem(STORAGE_KEY, id);
  renderModuloActivo();
}

export function backToPortada() {
  current = null;
  removeItem(STORAGE_KEY);
  renderPortada();
}

// Cada módulo llama a esto tras cambiar su propio estado interno
// (equivalente al render() global de la versión anterior, pero
// resuelto solo para el módulo activo).
export function rerenderModuloActivo() {
  renderModuloActivo();
}

export function boot() {
  const savedId = getItem(STORAGE_KEY);
  current = modules.find(m => m.id === savedId) || null;
  renderModuloActivo();

  document.getElementById('header-date').textContent = fDate(new Date());
  setInterval(() => {
    const n = new Date();
    document.getElementById('header-date').textContent = fDate(n);
    if (current && current.onTick) current.onTick(n);
  }, 1000);
}
