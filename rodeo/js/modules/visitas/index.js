import { registerRoute } from '../../router.js';
import { mountVisitasList } from './list.js';
import { mountVisitaForm } from './form.js';
import { mountVisitaDetail } from './detail.js';
import { puedeAccederModulo, renderSinAccesoModulo } from '../../services/permisos.js';

export function registrarRutasVisitas(contenedor, ctx) {
  registerRoute('visitas', (partes) => {
    // BIT-70/F-05: OPERADOR_CAMPO no accede al módulo (decisión vigente,
    // Notas 15 Sep 2026). Cubre listado, detalle y formularios por hash
    // directo; la frontera real sigue siendo RLS.
    if (!puedeAccederModulo(ctx.perfil, 'visitas')) {
      renderSinAccesoModulo(contenedor, 'Visitas');
      return;
    }
    if (partes[0] === 'nueva') mountVisitaForm(contenedor, ctx, null);
    else if (partes[0] === 'ver') mountVisitaDetail(contenedor, ctx, partes[1]);
    else if (partes[0] === 'editar') mountVisitaForm(contenedor, ctx, partes[1]);
    else mountVisitasList(contenedor, ctx);
  });
}
