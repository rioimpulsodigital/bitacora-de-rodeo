// Etiqueta legible de un Paciente Animal para selectores y listados de OTROS
// módulos (Atenciones, Observaciones, Novedades) -- BIT-50 / H-19.
//
// Un Paciente creado por Catastro Equino puede no tener `nombre` pero sí
// `numero_identificacion`. Reglas (solo presentación, nunca se guarda ni se
// copia un campo en otro; `nombre` y `numero_identificacion` siguen siendo
// datos distintos):
//   nombre + identificación -> "Luna · ID 12345"
//   solo nombre             -> "Luna"            (igual que antes)
//   solo identificación     -> "ID 12345"
//   ninguno                 -> "Equino sin identificación" (neutro, sin inventar)
//
// `conEspecie` agrega " (equino)" cuando hay nombre o identificación, que es
// el formato que ya usaba Atenciones. Requiere que la consulta traiga
// `nombre`, `numero_identificacion` y `especie`.

const LABEL_ESPECIE = {
  equino: 'Equino', bovino: 'Bovino', ovino: 'Ovino', caprino: 'Caprino',
  canino: 'Canino', felino: 'Felino', otro: 'Otro',
};

export function etiquetaPaciente(a, { conEspecie = false } = {}) {
  if (!a) return '—';
  const nombre = a.nombre?.trim();
  const id = a.numero_identificacion?.trim();

  let base;
  if (nombre) base = id ? `${nombre} · ID ${id}` : nombre;
  else if (id) base = `ID ${id}`;
  else return `${LABEL_ESPECIE[a.especie] ?? 'Paciente'} sin identificación`;

  return conEspecie && a.especie ? `${base} (${a.especie})` : base;
}
