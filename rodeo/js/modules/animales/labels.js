// Etiquetas y presentación compartidas dentro del módulo Animales (listado,
// ficha y formulario). Mantiene los valores de Sexo idénticos a los que usa
// Catastro Equino (BIT-50) -- sin taxonomía nueva.

export const LABEL_ESPECIE = {
  equino: 'Equino', bovino: 'Bovino', ovino: 'Ovino', caprino: 'Caprino',
  canino: 'Canino', felino: 'Felino', otro: 'Otro',
};

export const SEXO_OPTS = [
  { value: 'macho', label: 'Macho' },
  { value: 'hembra', label: 'Hembra' },
  { value: 'no_determinado', label: 'No determinado' },
];

export const LABEL_SEXO = Object.fromEntries(SEXO_OPTS.map((o) => [o.value, o.label]));

// Título legible de un Paciente aunque `nombre` sea NULL (caso Catastro
// Equino): nombre propio > número de identificación > texto neutro. Nunca
// inventa un valor: es solo presentación, no se guarda.
export function tituloPaciente(a) {
  return a.nombre?.trim() || a.numero_identificacion?.trim() || 'Sin nombre ni identificación';
}
