import { registerRoute } from '../../router.js';
import { mountPapelera } from './list.js';

export function registrarRutasPapelera(contenedor, ctx) {
  registerRoute('papelera', () => mountPapelera(contenedor, ctx));
}
