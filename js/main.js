// Punto de entrada / raíz de composición. Único archivo que
// conoce la lista completa de módulos existentes — agregar un
// módulo nuevo (Gestión Ganadera, Tratamientos, Inspecciones...)
// significa escribir su carpeta en js/modules/ y sumar dos líneas
// acá. Nada más del proyecto necesita cambiar.

import { registerModule, selectModulo, backToPortada, boot } from './core/app.js';
import { getSession, onAuthStateChange, signOut } from './core/auth.js';
import rescateModule from './modules/rescate/index.js';
import rodeoModule from './modules/rodeo/index.js';

registerModule(rescateModule);
registerModule(rodeoModule);

async function handleSignOut() {
  await signOut();
  location.replace('login.html');
}

// Namespace del shell para los onclick inline de index.html.
window.App = { selectModulo, backToPortada, signOut: handleSignOut };

// Guardia de sesión: sin sesión válida, no hay app — se resuelve acá,
// antes de boot(), para que ningún módulo llegue a montarse sin auth.
const session = await getSession();
if (!session) {
  location.replace('login.html');
} else {
  // Si la sesión se cierra mientras la app está abierta (logout en otra
  // pestaña, token vencido), redirige en vez de dejar la UI a medias.
  onAuthStateChange((s) => {
    if (!s) location.replace('login.html');
  });
  boot();
}
