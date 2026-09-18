import { getVisita, crearVisita, actualizarVisita, listLotesParaSelector } from './services.js';
import { escapeHtml } from '../../dashboard.js';

const TIPOS = ['programada', 'seguimiento', 'emergencia', 'control', 'sanitaria', 'otro'];
const LABEL_TIPO_OPT = {
  programada: 'Programada',
  seguimiento: 'Seguimiento',
  emergencia: 'Emergencia',
  control: 'Control',
  sanitaria: 'Sanitaria',
  otro: 'Otro',
};

const CATEGORIAS = ['Vaca', 'Vaquilla', 'Ternero', 'Ternera', 'Novillo', 'Novillito', 'Toro', 'Otro'];

export async function mountVisitaForm(contenedor, ctx, id) {
  contenedor.innerHTML = '<p class="rodeo-loading">Cargando…</p>';

  let visita = null;
  if (id) {
    try {
      visita = await getVisita(id);
    } catch (e) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (!visita) {
      contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Visita no encontrada.</p></div>`;
      return;
    }
  }

  const activoId = ctx.establecimientoActivoId;
  const establecimientos = ctx.establecimientos;
  const seleccionadoId = visita?.establecimiento_id ?? activoId;

  let lotes = [];
  try {
    lotes = await listLotesParaSelector(activoId);
  } catch (e) {
    contenedor.innerHTML = `<div class="rodeo-card"><p class="rodeo-error">Error al cargar lotes: ${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const establecimientosOpts = establecimientos.map(
    (e) => `<option value="${e.id}" ${seleccionadoId === e.id ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`
  ).join('');

  const hoy = new Date().toISOString().split('T')[0];

  const tipoOpts = TIPOS.map(
    (t) => `<option value="${t}" ${(visita?.tipo ?? 'programada') === t ? 'selected' : ''}>${LABEL_TIPO_OPT[t]}</option>`
  ).join('');

  const loteSeleccionadoId = visita?.lote_id ?? '';
  const lotesOpts = [
    '<option value="">— Sin lote —</option>',
    ...lotes.map(
      (l) => `<option value="${l.id}" ${loteSeleccionadoId === l.id ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`
    ),
  ].join('');

  const alcance = visita?.alcance ?? 'todo_lote';
  const categoriaGuardada = visita?.categoria ?? '';
  const categoriaEsDelCatalogo = CATEGORIAS.slice(0, -1).includes(categoriaGuardada);
  const categoriaSelectValue = categoriaEsDelCatalogo ? categoriaGuardada : (categoriaGuardada ? 'Otro' : '');
  const categoriaOtraValue = categoriaEsDelCatalogo ? '' : categoriaGuardada;

  const categoriaOpts = [
    '<option value="">— Seleccionar categoría —</option>',
    ...CATEGORIAS.map((c) => `<option value="${c}" ${categoriaSelectValue === c ? 'selected' : ''}>${c}</option>`),
  ].join('');

  contenedor.innerHTML = `
    <div class="rodeo-card">
      <h2>${visita ? 'Editar Visita' : 'Nueva Visita'}</h2>
      <form id="rodeo-visita-form">

        <label class="form-label">Fecha <span class="rodeo-required">*</span></label>
        <input class="form-field" type="date" name="fecha" value="${visita?.fecha ?? hoy}" required>

        <label class="form-label">Tipo de visita <span class="rodeo-required">*</span></label>
        <select class="form-field" name="tipo" required>
          ${tipoOpts}
        </select>

        <label class="form-label">Establecimiento <span class="rodeo-required">*</span></label>
        <select class="form-field" name="establecimiento_id" required>
          ${establecimientosOpts}
        </select>

        <label class="form-label">Hora de inicio (opcional)</label>
        <input class="form-field" type="time" name="hora_inicio" value="${visita?.hora_inicio?.slice(0, 5) ?? ''}">

        <label class="form-label">Hora de fin (opcional)</label>
        <input class="form-field" type="time" name="hora_fin" value="${visita?.hora_fin?.slice(0, 5) ?? ''}">

        ${visita ? `
        <label class="form-label">Estado</label>
        <select class="form-field" name="estado">
          <option value="abierta" ${visita.estado === 'abierta' ? 'selected' : ''}>Abierta</option>
          <option value="cerrada" ${visita.estado === 'cerrada' ? 'selected' : ''}>Cerrada</option>
        </select>` : ''}

        <div id="visita-sanitaria-campos" style="display:none">
          <label class="form-label">Lote (opcional)</label>
          <select class="form-field" name="lote_id">
            ${lotesOpts}
          </select>

          <label class="form-label">Alcance</label>
          <select class="form-field" name="alcance">
            <option value="todo_lote" ${alcance === 'todo_lote' ? 'selected' : ''}>Todo el lote</option>
            <option value="categoria" ${alcance === 'categoria' ? 'selected' : ''}>Categoría del lote</option>
          </select>

          <div id="visita-categoria-campos" style="display:none">
            <label class="form-label">Categoría</label>
            <select class="form-field" name="categoria_catalogo">
              ${categoriaOpts}
            </select>

            <div id="visita-categoria-otra-campo" style="display:none">
              <label class="form-label">Especificar categoría</label>
              <input class="form-field" type="text" name="categoria_otra" value="${escapeHtml(categoriaOtraValue)}">
            </div>
          </div>

          <label class="form-label">Acciones realizadas</label>
          <textarea class="form-field act-textarea" name="acciones_realizadas" rows="4">${visita?.acciones_realizadas ? escapeHtml(visita.acciones_realizadas) : ''}</textarea>
        </div>

        <label class="form-label">Notas (opcional)</label>
        <textarea class="form-field act-textarea" name="notas" rows="3">${visita?.notas ? escapeHtml(visita.notas) : ''}</textarea>

        <div id="rodeo-form-error" class="rodeo-error"></div>

        <div class="rodeo-form-acciones">
          <button type="submit" class="salida-btn">Guardar</button>
          <a href="#visitas" class="rodeo-link-btn">Volver al listado</a>
        </div>
      </form>
    </div>`;

  const formEl = document.getElementById('rodeo-visita-form');
  const tipoSelect = formEl.querySelector('[name="tipo"]');
  const alcanceSelect = formEl.querySelector('[name="alcance"]');
  const categoriaSelect = formEl.querySelector('[name="categoria_catalogo"]');
  const sanitariaCampos = document.getElementById('visita-sanitaria-campos');
  const categoriaCampos = document.getElementById('visita-categoria-campos');
  const categoriaOtraCampo = document.getElementById('visita-categoria-otra-campo');

  function actualizarVisibilidad() {
    const esSanitaria = tipoSelect.value === 'sanitaria';
    sanitariaCampos.style.display = esSanitaria ? '' : 'none';

    const esAlcanceCategoria = esSanitaria && alcanceSelect.value === 'categoria';
    categoriaCampos.style.display = esAlcanceCategoria ? '' : 'none';

    const esCategoriaOtra = esAlcanceCategoria && categoriaSelect.value === 'Otro';
    categoriaOtraCampo.style.display = esCategoriaOtra ? '' : 'none';
  }

  tipoSelect.addEventListener('change', actualizarVisibilidad);
  alcanceSelect.addEventListener('change', actualizarVisibilidad);
  categoriaSelect.addEventListener('change', actualizarVisibilidad);
  actualizarVisibilidad();

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('rodeo-form-error');
    errorEl.textContent = '';

    const esSanitaria = fd.get('tipo') === 'sanitaria';
    const alcanceValor = fd.get('alcance');
    const categoriaCatalogo = fd.get('categoria_catalogo');
    const categoriaFinal = categoriaCatalogo === 'Otro' ? fd.get('categoria_otra') : categoriaCatalogo;

    const campos = {
      fecha: fd.get('fecha'),
      tipo: fd.get('tipo'),
      establecimiento_id: fd.get('establecimiento_id'),
      hora_inicio: fd.get('hora_inicio'),
      hora_fin: fd.get('hora_fin'),
      estado: fd.get('estado') ?? 'abierta',
      notas: fd.get('notas'),
      lote_id: esSanitaria ? fd.get('lote_id') : null,
      alcance: esSanitaria ? alcanceValor : null,
      categoria: esSanitaria && alcanceValor === 'categoria' ? categoriaFinal : null,
      acciones_realizadas: esSanitaria ? fd.get('acciones_realizadas') : null,
    };

    if (!campos.fecha) { errorEl.textContent = 'La fecha es obligatoria.'; return; }
    if (!campos.tipo) { errorEl.textContent = 'El tipo de visita es obligatorio.'; return; }
    if (!campos.establecimiento_id) { errorEl.textContent = 'El establecimiento es obligatorio.'; return; }
    if (esSanitaria && alcanceValor === 'categoria' && !categoriaFinal?.trim()) {
      errorEl.textContent = 'Seleccioná una categoría o especificá una.';
      return;
    }

    try {
      if (visita) {
        await actualizarVisita(visita.id, campos);
      } else {
        await crearVisita(campos);
      }
      location.hash = '#visitas';
    } catch (err) {
      errorEl.textContent = 'Error al guardar: ' + err.message;
    }
  });
}
