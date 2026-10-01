// Composición del módulo Catastro Equino (BIT-50) — alta rápida de equinos
// como Paciente Animal, disponible solo en los establecimientos que tienen
// la capacidad habilitada (la ruta se protege en form.js). Una sola ruta,
// una sola pantalla -- no hay listado propio (el listado general de
// Pacientes ya existe en #animales).

import { registerRoute } from '../../router.js';
import { mountCatastroForm } from './form.js';

export function registrarRutasCatastro(contenedor, ctx) {
  registerRoute('catastro', () => mountCatastroForm(contenedor, ctx));
}
