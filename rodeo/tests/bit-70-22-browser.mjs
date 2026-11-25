import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import os from 'node:os';
const password=(await readFile('C:/Desarrollo_Lab/bitacora-de-rodeo/.lab-user-password','utf8')).trim();
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
  await cd('Page.navigate',{url:'http://127.0.0.1:25430/rodeo/#animales/ver/11111111-cccc-4ccc-8ccc-cccccccccccc'});
  await waitFor("!!document.getElementById('rodeo-trasladar-paciente')",30000);
  await waitFor("!!document.querySelector('#ficha-foto img') || document.getElementById('ficha-foto')?.textContent.includes('No se pudo')",10000);
  const prior=await evaluate("({context:document.getElementById('rodeo-establecimiento-select')?.value,photo:!!document.querySelector('#ficha-foto img'),photoText:document.getElementById('ficha-foto')?.textContent})");
  if(prior.context!=='11111111-1111-4111-8111-111111111111'||!prior.photo){
    const diag=await evaluate("(async()=>{const {supabase}=await import('/js/core/supabase-client.js');const {getAnimal}=await import('/rodeo/js/modules/animales/services.js');const a=await getAnimal('11111111-cccc-4ccc-8ccc-cccccccccccc');const r=await supabase.storage.from('paciente-fotos').createSignedUrl(a.foto_path,60);const u=r.data?.signedUrl;const f=u?await fetch(u):null;let bitmap=null;try{bitmap=await createImageBitmap(await f.blob())}catch(e){bitmap=e.message};return {path:a.foto_path,error:r.error?.message,urlLocal:u?.startsWith('http://127.0.0.1:25421'),fetchStatus:f?.status,contentType:f?.headers.get('content-type'),bitmap:bitmap?.width||bitmap}})()");
    throw Error('Origen o foto no visibles: '+JSON.stringify({prior,diag}));
  }
  await evaluate("window.confirm=()=>true;document.getElementById('rodeo-traslado-destino').value='22222222-2222-4222-8222-222222222222';document.getElementById('rodeo-trasladar-paciente').click();true");
  await waitFor("document.getElementById('rodeo-content')?.textContent.includes('Paciente trasladado')",30000);
  process.stdout.write('PASS interfaz real: foto visible, traslado Auth/RLS/Storage/RPC y confirmacion\n');
  if(remoteRequests.length)throw Error('Solicitud a Supabase remoto detectada');
  process.stdout.write('PASS navegador Edge: sin solicitudes a Supabase remoto\n');
}finally{
  ws?.close();browser.kill();
  const base=resolve(os.tmpdir())+sep;
  if(resolve(profile).startsWith(base))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
