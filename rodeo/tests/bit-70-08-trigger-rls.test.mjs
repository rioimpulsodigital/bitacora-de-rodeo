// BIT-70-08: modelo local del trigger y RLS; NO ejecuta PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('rodeo/js/modules/visitas/migration-BIT-70-05-rls-visitas.sql', 'utf8');
const rollback = readFileSync('rodeo/js/modules/visitas/rollback-BIT-70-05-rls-visitas.sql', 'utf8');
const allowed = new Set(['ADMINISTRADOR', 'PROFESIONAL']);
const visits = [
  { id: 'v-a', establecimiento_id: 'A' },
  { id: 'v-b', establecimiento_id: 'B' },
];

function canReadVisit(role, access) {
  return access && allowed.has(role);
}
function validateObservation({ op, role, access, oldRow, nextRow, definer = true }) {
  if (!access) throw new Error('Establecimiento no autorizado');
  if (op === 'UPDATE' && nextRow.establecimiento_id !== oldRow.establecimiento_id) {
    throw new Error('Establecimiento inmutable');
  }
  const relationChanged = op === 'INSERT'
    ? nextRow.visita_id !== null
    : nextRow.visita_id !== oldRow.visita_id;
  if (relationChanged && !allowed.has(role)) {
    throw new Error('No se permite cambiar la Visita relacionada');
  }
  if (nextRow.visita_id !== null) {
    const visible = visits.find((v) => v.id === nextRow.visita_id
      && (definer || canReadVisit(role, access)));
    if (!visible || visible.establecimiento_id !== nextRow.establecimiento_id) {
      throw new Error('Visita no compatible con la Observacion');
    }
  }
  return nextRow;
}

const oldRow = { establecimiento_id: 'A', visita_id: 'v-a', descripcion: 'Antes' };
const edited = { ...oldRow, descripcion: 'Despues' };

test('P-01 reproducido: trigger invoker no ve Visita de OPERADOR_CAMPO', () => {
  assert.equal(canReadVisit('OPERADOR_CAMPO', true), false);
  assert.throws(() => validateObservation({
    op: 'UPDATE', role: 'OPERADOR_CAMPO', access: true,
    oldRow, nextRow: edited, definer: false,
  }), /Visita no compatible/);
});

test('Trigger definer: OPERADOR_CAMPO edita y conserva Visita existente', () => {
  assert.equal(validateObservation({
    op: 'UPDATE', role: 'OPERADOR_CAMPO', access: true,
    oldRow, nextRow: edited,
  }).visita_id, 'v-a');
  assert.equal(canReadVisit('OPERADOR_CAMPO', true), false);
});

test('OPERADOR_CAMPO crea Observacion sin Visita', () => {
  const row = { establecimiento_id: 'A', visita_id: null };
  assert.equal(validateObservation({
    op: 'INSERT', role: 'OPERADOR_CAMPO', access: true, nextRow: row,
  }), row);
});

test('OPERADOR_CAMPO no crea ni cambia ni desliga la relacion', () => {
  for (const [op, nextRow] of [
    ['INSERT', { establecimiento_id: 'A', visita_id: 'v-a' }],
    ['UPDATE', { ...oldRow, visita_id: 'v-b' }],
    ['UPDATE', { ...oldRow, visita_id: null }],
  ]) {
    assert.throws(() => validateObservation({
      op, role: 'OPERADOR_CAMPO', access: true, oldRow, nextRow,
    }), /No se permite cambiar/);
  }
});

test('ADMINISTRADOR y PROFESIONAL conservan asociacion legitima', () => {
  for (const role of allowed) {
    for (const op of ['INSERT', 'UPDATE']) {
      const row = { establecimiento_id: 'A', visita_id: 'v-a' };
      assert.equal(validateObservation({
        op, role, access: true, oldRow: { ...oldRow, visita_id: null }, nextRow: row,
      }), row);
    }
  }
});

test('Trigger rechaza Visita de otro establecimiento y Visita inexistente', () => {
  for (const visitId of ['v-b', 'no-existe']) {
    assert.throws(() => validateObservation({
      op: 'INSERT', role: 'PROFESIONAL', access: true,
      nextRow: { establecimiento_id: 'A', visita_id: visitId },
    }), /Visita no compatible/);
  }
});

test('Trigger no otorga acceso a otro establecimiento ni permite traslado', () => {
  assert.throws(() => validateObservation({
    op: 'UPDATE', role: 'OPERADOR_CAMPO', access: false,
    oldRow, nextRow: edited,
  }), /Establecimiento no autorizado/);
  assert.throws(() => validateObservation({
    op: 'UPDATE', role: 'ADMINISTRADOR', access: true,
    oldRow, nextRow: { ...oldRow, establecimiento_id: 'B' },
  }), /inmutable/);
});

test('SQL integra trigger acotado y RLS en una transaccion', () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(migration, /CREATE FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  assert.match(migration, /TG_RELID <> 'public\.observaciones_campo'::regclass/);
  assert.match(migration, /TG_NAME <> 'observaciones_campo_validar_coherencia_visita'/);
  assert.match(migration, /RLS de Observaciones no esta activo/);
  assert.match(migration, /TG_OP NOT IN \('INSERT', 'UPDATE'\)/);
  assert.match(migration, /NEW\.visita_id IS DISTINCT FROM OLD\.visita_id/);
  assert.match(migration, /v_rol IS DISTINCT FROM 'ADMINISTRADOR'[\s\S]*v_rol IS DISTINCT FROM 'PROFESIONAL'/);
  assert.match(migration, /public\.tiene_acceso_establecimiento\(NEW\.establecimiento_id\)/);
  assert.match(migration, /FROM public\.visitas AS v WHERE v\.id = NEW\.visita_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)/);
  assert.match(migration, /a\.grantee <> p\.proowner/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.match(migration, new RegExp(`has_function_privilege\\('${role}'`));
  }
  assert.match(migration, /CREATE TRIGGER observaciones_campo_validar_coherencia_visita[\s\S]*EXECUTE FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)/);
  assert.equal((migration.match(/^ALTER POLICY visitas_/gm) ?? []).length, 4);
  assert.ok(migration.indexOf('CREATE FUNCTION public.bit70_observaciones_validar_visita_rls()')
    < migration.indexOf('ALTER POLICY visitas_select'));
  assert.doesNotMatch(migration, /\bEXECUTE\s+format\b|\bEXECUTE\s+[a-z_]+_sql\b/i);
});

test('H-3 compara las cuatro policies y ambas expresiones de UPDATE completas', () => {
  const reference = /CREATE TEMP TABLE bit70_expected_policy \(establecimiento_id uuid\) ON COMMIT DROP;[\s\S]*?CREATE POLICY bit70_expected_integrated ON pg_temp\.bit70_expected_policy\s+USING \(\s+public\.tiene_acceso_establecimiento\(establecimiento_id\)\s+AND public\.get_mi_rol\(\) IN \('ADMINISTRADOR', 'PROFESIONAL'\)\s+\);/;
  for (const sql of [migration, rollback]) {
    assert.match(sql, reference);
    assert.match(sql, /pg_get_expr\(e\.polqual, e\.polrelid\)/);
    assert.match(sql, /count\(\*\) = 4/);
    for (const [name, cmd] of [
      ['select', 'SELECT'], ['insert', 'INSERT'],
      ['update', 'UPDATE'], ['delete', 'DELETE'],
    ]) {
      assert.match(sql, new RegExp(`p\\.policyname = 'visitas_${name}' AND p\\.cmd = '${cmd}'`));
    }
    assert.match(sql, /p\.qual IS NULL/);
    assert.match(sql, /p\.with_check IS NULL/);
    assert.match(sql, /p\.cmd = 'UPDATE'[\s\S]*?p\.qual, ''\), '\[\[:space:\]\]\+', '', 'g'\) = v_integrated[\s\S]*?p\.with_check, ''\), '\[\[:space:\]\]\+', '', 'g'\) = v_integrated/);
    assert.doesNotMatch(sql, /position\('ADMINISTRADOR' in coalesce\(p\./);
  }
});

test('Rollback restituye trigger original y cuatro policies sin cambiar funcion BIT-63', () => {
  assert.match(rollback, /^BEGIN;/m);
  assert.match(rollback, /^COMMIT;/m);
  assert.match(rollback, /EXECUTE FUNCTION public\.observaciones_campo_validar_coherencia_visita\(\)/);
  assert.match(rollback, /DROP FUNCTION public\.bit70_observaciones_validar_visita_rls\(\)/);
  assert.equal((rollback.match(/^ALTER POLICY visitas_/gm) ?? []).length, 4);
  assert.match(rollback, /BIT-70-08 rollback: policies no restauradas/);
  assert.ok(rollback.indexOf('CREATE TRIGGER observaciones_campo_validar_coherencia_visita')
    < rollback.indexOf('DROP FUNCTION public.bit70_observaciones_validar_visita_rls()'));
});
