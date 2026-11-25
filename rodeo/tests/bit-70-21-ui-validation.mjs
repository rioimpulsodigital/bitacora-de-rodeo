// BIT-70-21: prueba de la interfaz y el orden Storage/RPC sin red externa.
// Sirve los módulos reales de Pacientes con un cliente Supabase local simulado.
// No equivale a ejecutar los servicios de Supabase; no usa Producción.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const PATIENT = '11111111-cccc-4ccc-8ccc-cccccccccccc';
const oldPath = `${A}/old.jpg`;

const mock = `
const A=${JSON.stringify(A)},B=${JSON.stringify(B)},PATIENT=${JSON.stringify(PATIENT)};
const mode=new URL(location.href).searchParams.get('mode')||'success';
const state={mode,events:[],objects:new Map(),animal:{
  id:PATIENT,nombre:'Paciente ficticio',especie:'equino',sexo:'hembra',
  numero_identificacion:'FICT-1',pelaje:'',edad_aproximada_anios:5,
  fecha_nacimiento:null,notas:'',establecimiento_actual_id:A,
  tutor_responsable_id:'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  personas:{nombre:'Tutor ficticio'},foto_path:A+'/old.jpg'
}};
state.objects.set(state.animal.foto_path,new Blob(['foto-ficticia'],{type:'image/jpeg'}));
window.__testState=state;
window.confirm=()=>true;
window.__localSupabase={
  from(table){
    if(table!=='animales') throw Error('tabla no simulada: '+table);
    return {select(){return this},eq(){return this},async maybeSingle(){
      return {data:mode==='inaccessible' && state.animal.establecimiento_actual_id===B
        ? null:{...state.animal},error:null};
    }};
  },
  storage:{from(bucket){
    if(bucket!=='paciente-fotos') throw Error('bucket no simulado');
    return {
      async createSignedUrl(p){return {data:{signedUrl:location.origin+'/photo'},error:null}},
      async download(p){
        state.events.push(['download',p]);
        const data=state.objects.get(p);
        return data?{data,error:null}:{data:null,error:new Error('foto ausente')};
      },
      async upload(p,file){
        state.events.push(['upload',p]);
        if(state.objects.has(p)) return {error:new Error('ruta duplicada')};
        state.objects.set(p,file);
        return {error:null};
      },
      async remove(paths){
        for(const p of paths){state.events.push(['remove',p]);state.objects.delete(p)}
        return {error:null};
      }
    };
  }},
  async rpc(name,args){
    if(name!=='bit70_trasladar_paciente') throw Error('RPC no simulada');
    state.events.push(['rpc',args]);
    if(mode==='failure') return {data:null,error:new Error('fallo simulado')};
    if(args.p_origen_id!==A||args.p_destino_id!==B||
       args.p_foto_origen_path!==A+'/old.jpg'||
       !args.p_foto_destino_path.startsWith(B+'/'+PATIENT+'/')||
       !state.objects.has(args.p_foto_destino_path))
      return {data:null,error:new Error('precondición de traslado')};
    state.animal.establecimiento_actual_id=B;
    state.animal.tutor_responsable_id=null;
    state.animal.personas=null;
    state.animal.foto_path=args.p_foto_destino_path;
    if(mode==='uncertain'||mode==='inaccessible')
      return {data:null,error:new Error('respuesta perdida')};
    return {data:A+'/old.jpg',error:null};
  }
};
const {mountAnimalDetail}=await import('/rodeo/js/modules/animales/detail.js');
const ctx={perfil:{rol:mode==='operator'?'OPERADOR_CAMPO':'PROFESIONAL'},
  establecimientos:[{id:A,nombre:'Origen ficticio'},{id:B,nombre:'Destino ficticio'}],
  establecimientoActivoId:A};
await mountAnimalDetail(document.getElementById('root'),ctx,PATIENT);
window.__renderDestination=async()=>{
  ctx.establecimientoActivoId=B;
  await mountAnimalDetail(document.getElementById('root'),ctx,PATIENT);
};
window.__ready=true;
`;

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/test') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(`<html><body><div id="root"></div><script type="module">${mock}</script></body></html>`);
    return;
  }
  if (pathname === '/js/core/supabase-client.js') {
    res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'});
    res.end('export const supabase=window.__localSupabase;');
    return;
  }
  if (pathname === '/photo') {
    res.writeHead(200,{'Content-Type':'image/svg+xml'});
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
    return;
  }
  const file = path.resolve(root, '.'+pathname);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    const data = await fs.readFile(file);
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
    res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'bit70-ui-'));
console.log('Servidor local y perfil desechable preparados');
const chrome='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(chrome,[
  '--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--no-proxy-server',
  '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,
  `http://127.0.0.1:${port}/test?mode=success`
],{stdio:'ignore',windowsHide:true});

let ws;let seq=0;const pending=new Map();
async function cd(method,params={}){
  const id=++seq;
  const promise=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},10000);
    pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v)},
      reject:e=>{clearTimeout(timeout);reject(e)}});
  });
  ws.send(JSON.stringify({id,method,params}));
  return promise;
}
async function evaluate(expression){
  const result=await cd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(predicate,timeoutMs=10000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    if(await evaluate(predicate)) return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Tiempo agotado: '+predicate);
}
async function scenario(mode){
  console.log('Escenario',mode);
  await cd('Page.navigate',{url:`http://127.0.0.1:${port}/test?mode=${mode}`});
  await waitFor('window.__ready===true');
  if(mode==='operator'){
    if(await evaluate("!!document.getElementById('rodeo-trasladar-paciente')"))
      throw Error('OPERADOR_CAMPO ve la acción de traslado');
    console.log('PASS interfaz oculta traslado a OPERADOR_CAMPO');
    return;
  }
  await evaluate(`document.getElementById('rodeo-traslado-destino').value=${JSON.stringify(B)};
    document.getElementById('rodeo-trasladar-paciente').click();true`);
  await waitFor(mode==='failure'
    ? "document.getElementById('rodeo-traslado-error')?.textContent.includes('fallo simulado')"
    : mode==='inaccessible'
      ? "document.getElementById('rodeo-traslado-error')?.textContent.includes('respuesta perdida')"
      : "document.getElementById('root')?.textContent.includes('Paciente trasladado')");
  const state=await evaluate(`(()=>{const s=window.__testState;return {
    events:s.events.map(([op,x])=>[op,typeof x==='string'?x:x.p_foto_destino_path]),
    est:s.animal.establecimiento_actual_id,photo:s.animal.foto_path,
    oldExists:s.objects.has(${JSON.stringify(oldPath)}),
    newExists:s.objects.has(s.animal.foto_path),objects:[...s.objects.keys()]
  }})()`);
  const ops=state.events.map(x=>x[0]);
  if(ops.slice(0,3).join(',')!=='download,upload,rpc')
    throw Error('Orden Storage/RPC incorrecto: '+JSON.stringify(state.events));
  const upload=state.events.find(x=>x[0]==='upload')[1];
  if(!upload.startsWith(`${B}/${PATIENT}/`))
    throw Error('Foto sin correspondencia con Paciente');
  if(mode==='failure'){
    if(state.est!==A||!state.oldExists||state.objects.includes(upload)||
       !state.events.some(x=>x[0]==='remove'&&x[1]===upload))
      throw Error('Compensación de fallo incorrecta: '+JSON.stringify(state));
    console.log('PASS fallo RPC conserva origen y retira copia huérfana');
  }else if(mode==='inaccessible'){
    if(state.est!==B||!state.oldExists||!state.newExists||
       state.events.some(x=>x[0]==='remove'))
      throw Error('La compensación borró una foto posiblemente activa: '+JSON.stringify(state));
    console.log('PASS respuesta incierta y fila invisible: conserva ambas fotos para conciliación');
  }else{
    if(state.est!==B||state.oldExists||!state.newExists||
       !state.events.some(x=>x[0]==='remove'&&x[1]===oldPath))
      throw Error('Traslado o limpieza incorrectos: '+JSON.stringify(state));
    await evaluate('window.__renderDestination()');
    const destinationVisible=await evaluate(`document.getElementById('root').textContent.includes('Destino ficticio')
      && !!document.querySelector('#ficha-foto img')`);
    if(!destinationVisible) throw Error('La ficha del destino no muestra el Paciente y su foto: '
      +await evaluate(`({text:document.getElementById('root').textContent,
        imageCount:document.querySelectorAll('#ficha-foto img').length})`).then(JSON.stringify));
    console.log(`PASS ${mode}: interfaz, Storage y RPC en orden`);
  }
}

try{
  const debugFile=path.join(profile,'DevToolsActivePort');
  let debugPort;
  for(let i=0;i<100;i++){
    try{debugPort=Number((await fs.readFile(debugFile,'utf8')).split('\n')[0]);break}
    catch{await new Promise(resolve=>setTimeout(resolve,100))}
  }
  if(!debugPort) throw Error('Chrome no abrió el puerto de depuración');
  console.log('Puerto de depuración local abierto');
  const tabs=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`,
    {signal:AbortSignal.timeout(5000)})).json();
  console.log('Pestañas CDP:',tabs.map(t=>({type:t.type,url:t.url})));
  const tab=tabs.find(t=>t.type==='page');
  if(!tab) throw Error('Chrome no creó la pestaña local');
  console.log('Pestaña local identificada');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(!data.id)return;
    const p=pending.get(data.id);pending.delete(data.id);
    if(data.error)p.reject(Error(data.error.message));else p.resolve(data.result);
  });
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('WebSocket CDP no abrió')),10000);
    ws.addEventListener('open',()=>{clearTimeout(timeout);resolve()},{once:true});
    ws.addEventListener('error',e=>{clearTimeout(timeout);reject(e)},{once:true});
  });
  console.log('CDP conectado');
  await cd('Runtime.enable');
  await cd('Page.enable');
  const modes=process.argv.slice(2);
  for(const mode of (modes.length?modes:['success','failure','uncertain','operator','inaccessible']))
    await scenario(mode);
  console.log('RESULT escenarios UI/Storage local simulado PASS');
}finally{
  ws?.close();browser.kill();server.close();
  const expected=path.resolve(os.tmpdir())+path.sep;
  if(path.resolve(profile).startsWith(expected))
    await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
