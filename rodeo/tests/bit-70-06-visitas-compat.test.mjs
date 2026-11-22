// BIT-70-06: pruebas funcionales locales, sin red ni Supabase real.
// Ejecutar: node --experimental-vm-modules --test rodeo/tests/bit-70-06-visitas-compat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const root = 'rodeo/js/';
const visit = { id: 'visita-1', fecha: '2026-11-11', tipo: 'control', estado: 'abierta' };
const roles = ['ADMINISTRADOR', 'PROFESIONAL', 'OPERADOR_CAMPO'];

function fakeDom() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (id === 'btn-eliminar') return null;
      if (!elements.has(id)) {
        elements.set(id, {
          style: {}, textContent: '', disabled: false, listeners: {},
          addEventListener(type, fn) { this.listeners[type] = fn; },
          querySelector() { return { disabled: false, textContent: '' }; },
        });
      }
      return elements.get(id);
    },
  };
  class FakeFormData {
    constructor(target) { this.fields = new Map(Object.entries(target.fields)); }
    get(name) { return this.fields.get(name) ?? null; }
    entries() { return this.fields.entries(); }
  }
  return { document, elements, FakeFormData };
}

async function loadModule(file, mocks, globals = {}) {
  const context = createContext({ console, Date, ...globals });
  const cache = new Map();
  async function linker(specifier) {
    if (cache.has(specifier)) return cache.get(specifier);
    if (specifier === '../../services/permisos.js') {
      const mod = new SourceTextModule(readFileSync(root + 'services/permisos.js', 'utf8'), { context });
      cache.set(specifier, mod);
      return mod;
    }
    if (specifier === '../../services/contexto.js') {
      const mod = new SourceTextModule(readFileSync(root + 'services/contexto.js', 'utf8'), { context });
      cache.set(specifier, mod);
      return mod;
    }
    const values = mocks[specifier] ?? mocks['*'];
    assert.ok(values, 'Import sin doble: ' + specifier);
    const mod = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
    cache.set(specifier, mod);
    return mod;
  }
  const mod = new SourceTextModule(readFileSync(root + file, 'utf8'), { context });
  await mod.link(linker);
  await mod.evaluate();
  return mod.namespace;
}

function fixture(kind, role, editing) {
  const dom = fakeDom();
  const calls = { visits: 0, writes: [] };
  const existing = {
    id: kind + '-1', establecimiento_id: 'est-A', visita_id: visit.id,
    descripcion: 'Texto original', fecha: '2026-11-11', created_by: 'user-1',
  };
  const service = {
    getObservacion: async () => ({ ...existing, visitas: null }),
    crearObservacion: async (fields) => { calls.writes.push({ action: 'create', fields }); },
    actualizarObservacion: async (id, fields) => { calls.writes.push({ action: 'update', id, fields }); },
    getNovedad: async () => ({ ...existing, visitas: null }),
    crearNovedad: async (fields) => { calls.writes.push({ action: 'create', fields }); },
    actualizarNovedad: async (id, fields) => { calls.writes.push({ action: 'update', id, fields }); },
    eliminarNovedad: async () => { throw new Error('No se prueba eliminación aquí'); },
    listVisitasParaSelector: async () => { calls.visits++; return [visit, { ...visit, id: 'visita-2' }]; },
    listAnimalesParaSelector: async () => [],
    listLotesParaSelector: async () => [],
    TIPOS: ['otro'],
    tipoLabel: () => 'Otro',
  };
  const globals = {
    document: dom.document, FormData: dom.FakeFormData,
    location: { hash: '' },
  };
  const mocks = {
    './services.js': service,
    '../../dashboard.js': { escapeHtml: (value) => String(value) },
    '../dashboard.js': { escapeHtml: (value) => String(value) },
    '../../services/paciente-label.js': { etiquetaPaciente: () => 'Paciente' },
  };
  const ctx = {
    establecimientoActivoId: 'est-A',
    establecimientos: [{ id: 'est-A', nombre: 'A' }],
    perfil: { id: 'user-1', rol: role },
  };
  const formFile = kind === 'observaciones'
    ? 'modules/observaciones/form.js'
    : 'modules/novedades/form.js';
  const formId = kind === 'observaciones' ? 'rodeo-observacion-form' : 'form-novedad';
  const container = { innerHTML: '' };
  async function run() {
    const mod = await loadModule(formFile, mocks, globals);
    if (kind === 'observaciones') await mod.mountObservacionForm(container, ctx, editing ? existing.id : null);
    else await mod.mountNovedadForm(container, ctx, editing ? existing.id : null);
    const form = dom.document.getElementById(formId);
    assert.equal(typeof form.listeners.submit, 'function', 'Formulario montado');
    return { form, container };
  }
  return { calls, ctx, run, formId };
}

for (const kind of ['observaciones', 'novedades']) {
  for (const role of roles) {
    const allowed = role !== 'OPERADOR_CAMPO';
    test(kind + ' / ' + role + ' / editar conserva visita_id', async () => {
      const f = fixture(kind, role, true);
      const { form, container } = await f.run();
      assert.equal(container.innerHTML.includes('name="visita_id"'), allowed);
      assert.equal(f.calls.visits, allowed ? 1 : 0);
      if (allowed) assert.ok(container.innerHTML.includes('value="' + visit.id + '"'));
      form.fields = { descripcion: 'Texto editado', fecha: '2026-11-11' };
      form.fields.visita_id = allowed ? visit.id : 'visita-inyectada';
      await form.listeners.submit({ preventDefault() {}, target: form });
      assert.equal(f.calls.writes.length, 1);
      assert.equal(f.calls.writes[0].action, 'update');
      assert.equal(f.calls.writes[0].fields.visita_id, visit.id);
    });

    test(kind + ' / ' + role + ' / alta sin asociación indebida', async () => {
      const f = fixture(kind, role, false);
      const { form, container } = await f.run();
      assert.equal(container.innerHTML.includes('name="visita_id"'), allowed);
      assert.equal(f.calls.visits, allowed ? 1 : 0);
      form.fields = { descripcion: 'Nuevo registro', fecha: '2026-11-11' };
      form.fields.visita_id = allowed ? visit.id : 'visita-inyectada';
      await form.listeners.submit({ preventDefault() {}, target: form });
      assert.equal(f.calls.writes.length, 1);
      assert.equal(f.calls.writes[0].action, 'create');
      assert.equal(f.calls.writes[0].fields.visita_id, allowed ? visit.id : null);
    });
  }
}

for (const kind of ['observaciones', 'novedades']) {
  test(kind + ' / consulta opcional conserva fila simulada con Visita oculta', async () => {
    const queries = [];
    const row = {
      id: kind + '-1', establecimiento_id: 'est-A',
      visita_id: visit.id, visitas: null,
    };
    const supabase = {
      from(table) {
        const q = {
          table, columns: '', filters: [],
          select(columns) { this.columns = columns; return this; },
          eq(column, value) { this.filters.push([column, value]); return this; },
          is(column, value) { this.filters.push([column, value]); return this; },
          order() { return this; },
          maybeSingle() {
            queries.push({ table: this.table, columns: this.columns });
            return Promise.resolve({ data: { ...row }, error: null });
          },
          then(resolve, reject) {
            queries.push({ table: this.table, columns: this.columns });
            return Promise.resolve({ data: [{ ...row }], error: null }).then(resolve, reject);
          },
        };
        return q;
      },
    };
    const mod = await loadModule('modules/' + kind + '/services.js', {
      '../../../../js/core/supabase-client.js': { supabase },
    });
    const detail = kind === 'observaciones'
      ? await mod.getObservacion(row.id)
      : await mod.getNovedad(row.id);
    assert.equal(detail.id, row.id);
    assert.equal(detail.visita_id, visit.id);
    assert.equal(detail.visitas, null);
    assert.ok(queries[0].columns.includes('visitas('));
    assert.ok(!queries[0].columns.includes('!inner'));
    if (kind === 'observaciones') {
      const list = await mod.listObservaciones('est-A');
      assert.equal(list.length, 1);
      assert.equal(list[0].id, row.id);
      assert.equal(list[0].visitas, null);
      assert.ok(!queries[1].columns.includes('!inner'));
    } else {
      const list = await mod.listNovedades('est-A');
      assert.equal(list.length, 1);
      assert.equal(list[0].id, row.id);
      assert.ok(!queries[1].columns.includes('visitas('));
    }
  });
}

test('SQL integrado cubre las cuatro operaciones sin DML ni grants de tablas', () => {
  const sql = readFileSync(root + 'modules/visitas/migration-BIT-70-05-rls-visitas.sql', 'utf8');
  const statements = [...sql.matchAll(/ALTER POLICY (visitas_(?:select|insert|update|delete)) ON public\.visitas([\s\S]*?);/g)];
  assert.equal(statements.length, 4);
  for (const [, name, body] of statements) {
    assert.ok(body.includes('public.tiene_acceso_establecimiento(establecimiento_id)'), name);
    assert.ok(body.includes("public.get_mi_rol() IN ('ADMINISTRADOR', 'PROFESIONAL')"), name);
  }
  const update = statements.find((m) => m[1] === 'visitas_update')[2];
  assert.ok(update.includes('USING') && update.includes('WITH CHECK'));
  assert.equal((update.match(/public\.get_mi_rol\(\)/g) ?? []).length, 2);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.doesNotMatch(sql, /^(?:INSERT|UPDATE|DELETE)\s+(?:INTO|public\.)/mi);
  assert.doesNotMatch(sql, /^(?:GRANT|REVOKE)\s+.*ON\s+(?:TABLE\s+)?public\.visitas/mi);
  assert.match(sql, /CREATE FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)/);
});


for (const kind of ['observaciones', 'novedades']) {
  test(kind + ' / servicio conserva visita_id al persistir', async () => {
    const writes = [];
    const supabase = {
      from(table) {
        return {
          table, mode: '', payload: null,
          insert(payload) { this.mode = 'insert'; this.payload = payload; return this; },
          update(payload) { this.mode = 'update'; this.payload = payload; return this; },
          select() { return this; },
          eq() { return this; },
          single() {
            writes.push({ table: this.table, mode: this.mode, payload: this.payload });
            return Promise.resolve({ data: { id: 'nuevo' }, error: null });
          },
          then(resolve, reject) {
            writes.push({ table: this.table, mode: this.mode, payload: this.payload });
            return Promise.resolve({ data: [{ id: 'existente' }], error: null }).then(resolve, reject);
          },
        };
      },
    };
    const mod = await loadModule('modules/' + kind + '/services.js', {
      '../../../../js/core/supabase-client.js': { supabase },
    });
    const fields = {
      establecimiento_id: 'est-A', visita_id: visit.id,
      descripcion: 'Texto', fecha: '2026-11-11', tipo: 'otro',
    };
    if (kind === 'observaciones') {
      await mod.crearObservacion(fields);
      await mod.actualizarObservacion('existente', fields);
    } else {
      await mod.crearNovedad(fields);
      await mod.actualizarNovedad('existente', fields);
    }
    assert.deepEqual(writes.map((w) => w.mode), ['insert', 'update']);
    assert.deepEqual(writes.map((w) => w.payload.visita_id), [visit.id, visit.id]);
    assert.ok(writes.every((w) => w.table === (kind === 'observaciones'
      ? 'observaciones_campo' : 'novedades_establecimiento')));
  });
}


for (const kind of ['observaciones', 'novedades']) {
  for (const role of ['ADMINISTRADOR', 'PROFESIONAL']) {
    test(kind + ' / ' + role + ' / puede cambiar la Visita seleccionada', async () => {
      const f = fixture(kind, role, true);
      const { form, container } = await f.run();
      assert.ok(container.innerHTML.includes('name="visita_id"'));
      form.fields = {
        descripcion: 'Visita cambiada', fecha: '2026-11-11',
        visita_id: 'visita-2',
      };
      await form.listeners.submit({ preventDefault() {}, target: form });
      assert.equal(f.calls.writes.length, 1);
      assert.equal(f.calls.writes[0].fields.visita_id, 'visita-2');
    });
  }
}
