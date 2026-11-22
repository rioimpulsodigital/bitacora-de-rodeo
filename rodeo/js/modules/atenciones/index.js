import { registerRoute } from '../../router.js';
import { mountAtencionesList } from './list.js';
import { mountAtencionForm } from './form.js';
import { mountAtencionDetail } from './detail.js';
import { puedeAccederModulo, renderSinAccesoModulo } from '../../services/permisos.js';

export function registrarRutasAtenciones(contenedor, ctx) {
  registerRoute('atenciones', (partes) => {
    // BIT-70/F-05: OPERADOR_CAMPO sin acceso clínico (decisión vigente). El
    // listado y el formulario ya lo bloqueaban; el detalle por hash directo
    // no. Se centraliza acá para cubrir todas las subrutas. RLS sigue siendo
    // la frontera real.
    if (!puedeAccederModulo(ctx.perfil, 'atenciones')) {
      renderSinAccesoModulo(contenedor, 'Atenciones Clínicas');
      return;
    }
    if (partes[0] === 'nueva') {
      mountAtencionForm(contenedor, ctx, null);
    } else if (partes[0] === 'ver' && partes[1]) {
      mountAtencionDetail(contenedor, ctx, partes[1]);
    } else if (partes[0] === 'editar' && partes[1]) {
      mountAtencionForm(contenedor, ctx, partes[1]);
    } else {
      mountAtencionesList(contenedor, ctx);
    }
  });
}
