// Composición del módulo Catastro (BIT-50) — alta rápida de equinos de
// Fundación Dolly. Una sola ruta, una sola pantalla -- no hay listado
// propio (el listado general de Pacientes ya existe en #animales).

import { registerRoute } from '../../router.js';
import { mountCatastroForm } from './form.js';

export function registrarRutasCatastro(contenedor, ctx) {
  registerRoute('catastro', () => mountCatastroForm(contenedor, ctx));
}
