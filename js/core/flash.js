// Servicio de notificaciones tipo "toast" compartido por todos
// los módulos. Cualquier módulo importa flash(type, msg) — nunca
// debería tocar el elemento #flash directamente.

let timer = null;

export function flash(type, msg) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.className = `flash ${type}`;
  el.textContent = msg;
  clearTimeout(timer);
  timer = setTimeout(() => { el.className = 'flash'; }, 4500);
}
