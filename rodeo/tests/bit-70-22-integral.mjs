// BIT-70-22: real local Auth/PostgREST/Storage integration against RiO Local Lab.
// Synthetic data only. Does not invoke Supabase CLI or any remote endpoint.
import { readFile } from 'node:fs/promises';

const lab = 'C:/Desarrollo_Lab/bitacora-de-rodeo';
const env = Object.fromEntries((await readFile(`${lab}/.local-credentials.env`, 'utf8'))
  .split(/\r?\n/).filter(x => x.includes('=')).map(x => {
    const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, '')];
  }));
if (env.API_URL !== 'http://127.0.0.1:25421' || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
  throw Error('RiO Local Lab endpoint or keys missing');
}
const password = (await readFile(`${lab}/.lab-user-password`, 'utf8')).trim();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const patient = '11111111-cccc-4ccc-8ccc-cccccccccccc';
const lotA = '11111111-eeee-4eee-8eee-eeeeeeeeeeee';
const lotB = '22222222-ffff-4fff-8fff-ffffffffffff';
const tutorA = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const makeId = () => crypto.randomUUID();
const encode = encodeURIComponent;
function check(ok, label, detail = '') {
  if (!ok) throw Error(`FAIL ${label}: ${detail.slice(0, 400)}`);
  console.log(`PASS ${label}`);
}
async function call(path, token, method = 'GET', body, extra = {}) {
  const key = token === env.SERVICE_ROLE_KEY ? env.SERVICE_ROLE_KEY : env.ANON_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${token || key}`, ...extra };
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(env.API_URL + path, { method, headers, body });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return { ok: response.ok, status: response.status, data, raw };
}
async function json(path, token, method, body, headers) {
  return call(path, token, method, body === undefined ? undefined : JSON.stringify(body), headers);
}
async function login(email) {
  const r = await json('/auth/v1/token?grant_type=password', null, 'POST', { email, password });
  check(r.ok && !!r.data.access_token, `Auth ${email}`, r.raw);
  return r.data.access_token;
}
const admin = await login('admin@lab.invalid');
const pro = await login('profesional@lab.invalid');
const operator = await login('operador@lab.invalid');

// A professional with only B access gives an independent historical isolation probe.
const email = 'profesional-b-bit70@lab.invalid';
let users = await json('/auth/v1/admin/users?page=1&per_page=1000', env.SERVICE_ROLE_KEY);
check(users.ok, 'Auth admin local list', users.raw);
let bUser = users.data.users.find(u => u.email === email);
if (!bUser) {
  const created = await json('/auth/v1/admin/users', env.SERVICE_ROLE_KEY, 'POST',
    { email, password, email_confirm: true });
  check(created.ok, 'Auth synthetic B professional creation', created.raw);
  bUser = created.data;
}
for (const [table, row, conflict] of [
  ['perfiles', { id: bUser.id, nombre: 'Profesional Beta Ficticio', rol: 'PROFESIONAL' }, 'id'],
  ['establecimientos_usuarios', { perfil_id: bUser.id, establecimiento_id: B }, 'perfil_id,establecimiento_id']
]) {
  const r = await json(`/rest/v1/${table}?on_conflict=${conflict}`, env.SERVICE_ROLE_KEY,
    'POST', [row], { Prefer: 'resolution=merge-duplicates,return=minimal' });
  check(r.ok, `synthetic B profile ${table}`, r.raw);
}
const proB = await login(email);

const seenA = await json(`/rest/v1/animales?id=eq.${patient}&select=id`, pro);
const unseenB = await json(`/rest/v1/animales?id=eq.${patient}&select=id`, proB);
check(seenA.ok && seenA.data.length === 1 && unseenB.ok && unseenB.data.length === 0,
  'RLS patient isolation before transfer', seenA.raw + ' / ' + unseenB.raw);

let r = await json('/rest/v1/lotes', operator, 'POST',
  { id: makeId(), establecimiento_id: A, nombre: 'No autorizado' });
check(!r.ok, 'R-04 operator cannot create Lot', r.raw);
r = await json('/rest/v1/lotes', pro, 'POST',
  { id: makeId(), establecimiento_id: A, nombre: 'Lote profesional ficticio' });
check(r.ok, 'R-04 professional can create Lot in A', r.raw);
r = await json('/rest/v1/lotes', pro, 'POST',
  { id: makeId(), establecimiento_id: B, nombre: 'Fuera de acceso' });
check(!r.ok, 'R-04 professional cannot create Lot in B', r.raw);

r = await json(`/rest/v1/personas_establecimientos?persona_id=eq.${tutorA}&establecimiento_id=eq.${A}`,
  operator, 'PATCH', { rol: 'cambio denegado' }, { Prefer: 'return=representation' });
check(r.ok && r.data.length === 0, 'R-04 operator cannot edit Tutor link', r.raw);
r = await json(`/rest/v1/personas_establecimientos?persona_id=eq.${tutorA}&establecimiento_id=eq.${A}`,
  pro, 'PATCH', { rol: 'responsable ficticio' }, { Prefer: 'return=representation' });
check(r.ok && r.data.length === 1, 'R-04 professional can edit Tutor link', r.raw);

const membership = makeId();
r = await json('/rest/v1/lotes_animales', pro, 'POST',
  { id: membership, animal_id: patient, lote_id: lotB });
check(!r.ok, 'R-03 rejects cross-establishment Lot membership', r.raw);
r = await json('/rest/v1/lotes_animales', operator, 'POST',
  { id: membership, animal_id: patient, lote_id: lotA });
check(!r.ok, 'R-04 operator cannot assign Patient to Lot', r.raw);
r = await json('/rest/v1/lotes_animales', pro, 'POST',
  { id: membership, animal_id: patient, lote_id: lotA });
check(r.ok, 'R-03/R-04 professional can assign matching Lot', r.raw);

const attention = makeId(), observation = makeId();
r = await json('/rest/v1/atenciones_clinicas', pro, 'POST',
  { id: attention, establecimiento_id: A, animal_id: patient, notas: 'Historial de origen ficticio' });
check(r.ok, 'historical Attention created in A', r.raw);
r = await json('/rest/v1/observaciones_campo', pro, 'POST',
  { id: observation, establecimiento_id: A, animal_id: patient,
    visita_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', descripcion: 'Historial de origen ficticio' });
check(r.ok, 'historical Observation created in A', r.raw);

r = await json(`/rest/v1/animales?id=eq.${patient}`, admin, 'PATCH',
  { establecimiento_actual_id: B }, { Prefer: 'return=representation' });
check(!r.ok, 'R-02 direct Patient transfer rejected', r.raw);
r = await json(`/rest/v1/lotes?id=eq.${lotA}`, admin, 'PATCH',
  { establecimiento_id: B }, { Prefer: 'return=representation' });
check(!r.ok, 'R-02 direct Lot transfer rejected', r.raw);
r = await json('/rest/v1/rpc/bit70_trasladar_paciente', operator, 'POST',
  { p_animal_id: patient, p_origen_id: A, p_destino_id: B,
    p_foto_origen_path: null, p_foto_destino_path: null });
check(!r.ok, 'R-02 operator transfer RPC rejected', r.raw);
r = await json('/rest/v1/rpc/bit70_trasladar_paciente', pro, 'POST',
  { p_animal_id: patient, p_origen_id: A, p_destino_id: B,
    p_foto_origen_path: null, p_foto_destino_path: null });
check(!r.ok, 'R-02 professional without destination access rejected', r.raw);

const png = await readFile(`${lab}/valid-fixture.png`);
const oldPhoto = `${A}/${patient}/origin-valid.png`;
r = await call(`/storage/v1/object/paciente-fotos/${oldPhoto}`, admin, 'POST', png,
  { 'Content-Type': 'image/png' });
check(r.ok, 'Storage original photo upload', r.raw);
r = await json(`/rest/v1/animales?id=eq.${patient}`, admin, 'PATCH',
  { foto_path: oldPhoto }, { Prefer: 'return=representation' });
check(r.ok && r.data.length === 1, 'Patient references original photo', r.raw);
r = await json('/rest/v1/rpc/bit70_trasladar_paciente', admin, 'POST',
  { p_animal_id: patient, p_origen_id: A, p_destino_id: B,
    p_foto_origen_path: oldPhoto, p_foto_destino_path: null });
check(!r.ok, 'R-02 photo transfer without Storage copy rejected', r.raw);
const wrongPhoto = `${B}/${makeId()}/wrong.png`;
r = await call(`/storage/v1/object/paciente-fotos/${wrongPhoto}`, admin, 'POST', png,
  { 'Content-Type': 'image/png' });
check(r.ok, 'Storage wrong-patient copy setup', r.raw);
r = await json('/rest/v1/rpc/bit70_trasladar_paciente', admin, 'POST',
  { p_animal_id: patient, p_origen_id: A, p_destino_id: B,
    p_foto_origen_path: oldPhoto, p_foto_destino_path: wrongPhoto });
check(!r.ok, 'R-02 wrong-patient photo rejected', r.raw);
r = await call(`/storage/v1/object/paciente-fotos/${wrongPhoto}`, admin, 'DELETE');
check(r.ok, 'Storage orphan copy compensation', r.raw);

const state = await json(`/rest/v1/animales?id=eq.${patient}&select=establecimiento_actual_id,foto_path`, admin);
check(state.ok && state.data[0].establecimiento_actual_id === A && state.data[0].foto_path === oldPhoto,
  'failed transfers preserve Patient and original photo', state.raw);
console.log('READY_FOR_UI_TRANSFER ' + JSON.stringify({ patient, origin: A, destination: B,
  oldPhoto, membership, attention, observation, professionalB: email }));
