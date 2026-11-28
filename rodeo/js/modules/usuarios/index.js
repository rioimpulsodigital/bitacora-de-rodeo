import { registerRoute } from '../../router.js';
import { mountUsuarios } from './list.js';
import { mountUsuarioForm } from './form.js';

// BIT-75: solo ADMINISTRADOR. El bloqueo real es servidor (función admin-usuarios + RLS);
// acá además se cubre el hash escrito a mano.
export function registrarRutasUsuarios(contenedor, ctx) {
  registerRoute('usuarios', (partes) => {
    if (ctx.perfil?.rol !== 'ADMINISTRADOR') {
      contenedor.innerHTML = '<div class="rodeo-card"><p class="rodeo-error">No tenés acceso a usuarios.</p></div>';
      return;
    }
    if (partes[0] === 'nuevo' || (partes[0] === 'editar' && partes[1])) mountUsuarioForm(contenedor, ctx, partes);
    else mountUsuarios(contenedor, ctx);
  });
}
