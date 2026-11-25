import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import os from 'node:os';
const password=(await readFile('C:/Desarrollo_Lab/bitacora-de-rodeo/.lab-user-password','utf8')).trim();
const env=Object.fromEntries((await readFile('C:/Desarrollo_Lab/bitacora-de-rodeo/.local-credentials.env','utf8'))
  .split(/\r?\n/).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')]}));
if(env.API_URL!=='http://127.0.0.1:25421')throw Error('Nonlocal endpoint');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const patient=crypto.randomUUID();
const oldPhoto=`${A}/${patient}/stale.png`;
async function api(path,token,method='GET',body,contentType='application/json'){
  const r=await fetch(env.API_URL+path,{method,headers:{apikey:env.ANON_KEY,
    Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':contentType}:{})},body});
  const raw=await r.text();if(!r.ok)throw Error(method+' '+path+' HTTP '+r.status+' '+raw.slice(0,300));
  try{return JSON.parse(raw)}catch{return raw}
}
const auth=await api('/auth/v1/token?grant_type=password',env.ANON_KEY,'POST',
  JSON.stringify({email:'admin@lab.invalid',password}));
const token=auth.access_token;
await api('/storage/v1/object/paciente-fotos/'+oldPhoto,token,'POST',
  await readFile('C:/Desarrollo_Lab/bitacora-de-rodeo/valid-fixture.png'),'image/png');
await api('/rest/v1/animales',token,'POST',JSON.stringify({id:patient,nombre:'Paciente de compensacion ficticio',
  establecimiento_actual_id:A,especie:'bovino',foto_path:oldPhoto}));
const profile=await mkdtemp(join(os.tmpdir(),'bit74-browser-'));
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=spawn(edge,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check','--disable-background-networking','--no-proxy-server',
  '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'http://127.0.0.1:25430/login.html'],{stdio:'ignore',windowsHide:true});
let ws,seq=0;const pending=new Map(),remoteRequests=[];
async function cd(method,params={}){
  const id=++seq;
  const p=new Promise((resolve,reject)=>{
    const t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},15000);
    pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});
  });
  ws.send(JSON.stringify({id,method,params}));
  return p;
}
async function evaluate(expression){
  const r=await cd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr,limit=20000){
  const start=Date.now();
  while(Date.now()-start<limit){
    try{if(await evaluate(expr))return;}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  throw Error('Timeout '+expr+'; page='+String(await evaluate('location.href')));
}
try{
  let port;
  for(let i=0;i<100;i++){
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}
    catch{await new Promise(r=>setTimeout(r,100))}
  }
  if(!port)throw Error('Edge no abrió CDP');
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const tab=tabs.find(t=>t.type==='page');
  if(!tab)throw Error('No hay pestaña local');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Network.requestWillBeSent' && m.params?.request?.url?.includes('supabase.co')) remoteRequests.push(m.params.request.url);
    if(!m.id)return;
    const p=pending.get(m.id);pending.delete(m.id);
    if(p){if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  await cd('Runtime.enable');await cd('Page.enable');await cd('Network.enable');
  await waitFor("document.readyState==='complete' && !!document.getElementById('login-form')");
  await new Promise(r=>setTimeout(r,800));
  await evaluate("document.getElementById('login-email').value='admin@lab.invalid';document.getElementById('login-password').value="+JSON.stringify(password)+";document.getElementById('login-form').requestSubmit();true");
  await waitFor("location.pathname.endsWith('/index.html')",30000);
  await cd('Page.navigate',{url:'http://127.0.0.1:25430/rodeo/'});
  await waitFor("document.getElementById('rodeo-content')?.textContent.includes('Perfil cargado')",30000);
  const text=await evaluate("document.getElementById('rodeo-content').textContent");
  if(!text.includes('Admin Ficticio')||!text.includes('Estancia Alfa Ficticia'))throw Error('Dashboard incompleto: '+text.slice(0,500));
  await cd('Page.navigate',{url:'http://127.0.0.1:25430/rodeo/#animales/ver/'+patient});
  await waitFor("!!document.getElementById('rodeo-trasladar-paciente')",30000);
  await waitFor("!!document.querySelector('#ficha-foto img') || document.getElementById('ficha-foto')?.textContent.includes('No se pudo')",10000);
  const prior=await evaluate("({context:document.getElementById('rodeo-establecimiento-select')?.value,photo:!!document.querySelector('#ficha-foto img'),photoText:document.getElementById('ficha-foto')?.textContent})");
  if(prior.context!==A||!prior.photo)throw Error('Origen o foto no visibles: '+JSON.stringify(prior));
  // A concurrent legitimate edit makes the rendered photo stale after it was loaded.
  await api(`/rest/v1/animales?id=eq.${patient}`,token,'PATCH',JSON.stringify({foto_path:null}));
  await evaluate("window.confirm=()=>true;document.getElementById('rodeo-traslado-destino').value='22222222-2222-4222-8222-222222222222';document.getElementById('rodeo-trasladar-paciente').click();true");
  await waitFor("document.getElementById('rodeo-traslado-error')?.textContent.includes('No se pudo trasladar')",30000);
  const state=await api(`/rest/v1/animales?id=eq.${patient}&select=establecimiento_actual_id,foto_path`,token);
  if(state.length!==1||state[0].establecimiento_actual_id!==A||state[0].foto_path!==null)
    throw Error('Paciente cambio en fallo de RPC: '+JSON.stringify(state));
  const objects=await api('/storage/v1/object/list/paciente-fotos',token,'POST',JSON.stringify({prefix:`${B}/${patient}/`,limit:100}));
  if(objects.length!==0)throw Error('Copia huerfana no compensada: '+JSON.stringify(objects));
  const origin=await api('/storage/v1/object/authenticated/paciente-fotos/'+oldPhoto,token);
  if(!origin)throw Error('Foto origen perdida');
  process.stdout.write('PASS interfaz real: error de RPC por estado obsoleto, origen intacto y copia Storage compensada\n');
  await api('/storage/v1/object/paciente-fotos/'+oldPhoto,token,'DELETE');
  if(remoteRequests.length)throw Error('Solicitud a Supabase remoto detectada');
  process.stdout.write('PASS navegador Edge: sin solicitudes a Supabase remoto\n');
}finally{
  ws?.close();browser.kill();
  const base=resolve(os.tmpdir())+sep;
  if(resolve(profile).startsWith(base))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
