// Postconditions for the actual Edge transfer in RiO Local Lab.
import { readFile } from 'node:fs/promises';
const lab = 'C:/Desarrollo_Lab/bitacora-de-rodeo';
const env = Object.fromEntries((await readFile(`${lab}/.local-credentials.env`, 'utf8'))
  .split(/\r?\n/).filter(x => x.includes('=')).map(x => {
    const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, '')];
  }));
if (env.API_URL !== 'http://127.0.0.1:25421') throw Error('Nonlocal endpoint');
const password = (await readFile(`${lab}/.lab-user-password`, 'utf8')).trim();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const patient = '11111111-cccc-4ccc-8ccc-cccccccccccc';
async function req(path, token, method = 'GET', body) {
  const r = await fetch(env.API_URL + path, { method, headers: {
    apikey: env.ANON_KEY, Authorization: 'Bearer ' + token,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(method === 'PATCH' ? { Prefer: 'return=representation' } : {})
  }, body: body ? JSON.stringify(body) : undefined });
  const raw = await r.text(); let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { ok: r.ok, status: r.status, raw, data };
}
async function login(email) {
  const r = await req('/auth/v1/token?grant_type=password', env.ANON_KEY,
    'POST', { email, password });
  if (!r.ok) throw Error('Auth local ' + email + ' ' + r.raw);
  return r.data.access_token;
}
function check(ok, label, detail = '') {
  if (!ok) throw Error(`FAIL ${label}: ${detail.slice(0, 300)}`);
  console.log('PASS ' + label);
}
const admin = await login('admin@lab.invalid');
const proA = await login('profesional@lab.invalid');
const proB = await login('profesional-b-bit70@lab.invalid');
const op = await login('operador@lab.invalid');
const animal = await req(`/rest/v1/animales?id=eq.${patient}&select=id,establecimiento_actual_id,tutor_responsable_id,foto_path`, admin);
check(animal.ok && animal.data.length === 1 && animal.data[0].establecimiento_actual_id === B
  && animal.data[0].tutor_responsable_id === null
  && animal.data[0].foto_path.startsWith(`${B}/${patient}/`),
  'R-02 destination, Tutor and unique photo path', animal.raw);
const photo = animal.data[0].foto_path;
const lots = await req(`/rest/v1/lotes_animales?animal_id=eq.${patient}&select=fecha_fin`, admin);
check(lots.ok && lots.data.length === 1 && !!lots.data[0].fecha_fin,
  'R-02 active Lot closed atomically', lots.raw);
const old = await req(`/storage/v1/object/authenticated/paciente-fotos/${A}/${patient}/origin-valid.png`, admin);
const dest = await req(`/storage/v1/object/authenticated/paciente-fotos/${photo}`, admin);
check(!old.ok && dest.ok, 'Storage old photo removed after commit; destination readable', old.raw);
const aPatient = await req(`/rest/v1/animales?id=eq.${patient}&select=id`, proA);
const bPatient = await req(`/rest/v1/animales?id=eq.${patient}&select=id`, proB);
check(aPatient.ok && aPatient.data.length === 0 && bPatient.ok && bPatient.data.length === 1,
  'RLS patient visible only at destination', aPatient.raw + bPatient.raw);
const aAttention = await req(`/rest/v1/atenciones_clinicas?animal_id=eq.${patient}&select=id,establecimiento_id`, proA);
const bAttention = await req(`/rest/v1/atenciones_clinicas?animal_id=eq.${patient}&select=id,establecimiento_id`, proB);
const aObs = await req(`/rest/v1/observaciones_campo?animal_id=eq.${patient}&select=id,establecimiento_id`, proA);
const bObs = await req(`/rest/v1/observaciones_campo?animal_id=eq.${patient}&select=id,establecimiento_id`, proB);
check(aAttention.ok && aAttention.data.length >= 1 && aAttention.data.every(x => x.establecimiento_id === A)
  && bAttention.ok && bAttention.data.length === 0 && aObs.ok && aObs.data.length >= 1
  && aObs.data.every(x => x.establecimiento_id === A) && bObs.ok && bObs.data.length === 0,
  'historical Attention and Observation remain in A and isolated from B',
  aAttention.raw + bAttention.raw + aObs.raw + bObs.raw);
let r = await req('/rest/v1/observaciones_campo', proB, 'POST', {
  id: crypto.randomUUID(), establecimiento_id: B, animal_id: patient,
  descripcion: 'Observación posterior ficticia' });
check(r.ok, 'new destination Observation allowed', r.raw);
r = await req('/rest/v1/observaciones_campo', proA, 'POST', {
  id: crypto.randomUUID(), establecimiento_id: A, animal_id: patient,
  descripcion: 'Vínculo de origen inválido' });
check(!r.ok, 'new origin historical link rejected', r.raw);
r = await req('/rest/v1/visitas?id=eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', admin,
  'PATCH', { establecimiento_id: B });
check(!r.ok, 'F-07 Visit establishment remains immutable', r.raw);
r = await req('/rest/v1/observaciones_campo?id=eq.dddddddd-dddd-4ddd-8ddd-dddddddddddd', proA,
  'PATCH', { descripcion: 'Edición legítima posterior al traslado' });
check(r.ok && r.data.length === 1, 'P-01 legitimate Observation edit preserved', r.raw);
r = await req('/rest/v1/rpc/bit70_trasladar_paciente', op, 'POST', {
  p_animal_id: patient, p_origen_id: B, p_destino_id: A,
  p_foto_origen_path: photo, p_foto_destino_path: null });
check(!r.ok, 'operator transfer remains denied after UI flow', r.raw);
console.log('RESULTADO postcondiciones BIT-70-22 PASS');
