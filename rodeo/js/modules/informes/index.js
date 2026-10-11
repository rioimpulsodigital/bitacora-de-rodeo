// Punto de composición del módulo Informes (BIT-12) -- módulo propio, NO
// anidado dentro de Jornadas/Historial. Sin capacidad/gate propia en esta
// etapa (decisión explícita) -- mismo nivel de acceso que el resto de los
// módulos de registro (Visitas/Atenciones/Novedades): visible a cualquier
// perfil con sesión, la autorización real sobre los datos la sigue
// resolviendo RLS tabla por tabla (ver services.js).

import { registerRoute } from '../../router.js';
import { mountInformeDiario } from './diario.js';
import { mountInformeMensual } from './mensual.js';

function mountInformesLanding(contenedor) {
  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>Informes</h2>
      <p class="rodeo-hint">Generá un informe a partir de lo que ya registraste -- nunca hace falta volver a escribirlo.</p>
      <div class="rodeo-form-acciones">
        <a class="rodeo-btn" href="#informes/diario">Informe Diario</a>
        <a class="rodeo-link-btn" href="#informes/mensual">Informe Mensual</a>
      </div>
    </div>`;
}

export function registrarRutasInformes(contenedor, ctx) {
  registerRoute('informes', (partes) => {
    if (partes[0] === 'diario') mountInformeDiario(contenedor, ctx);
    else if (partes[0] === 'mensual') mountInformeMensual(contenedor, ctx);
    else mountInformesLanding(contenedor);
  });
}
