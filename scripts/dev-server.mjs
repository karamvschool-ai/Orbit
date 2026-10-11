import {testTextEditControl} from '../server/app-control-check.mjs';
import { appControl, closeAppControl } from '../server/app-control.mjs';
import { computerAction } from '../server/platform.mjs';
import http from 'node:http';
import { readFile, stat, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { GroqClient, MODEL } from '../server/groq.mjs';
import { executeTool, runDueTasks } from '../server/tools.mjs';
import { speech, speechStatus, loadSpeech } from '../server/speech.mjs';
const exec=promisify(execFile);
const project=path.resolve('.');
const root=path.resolve(process.env.ORBIT_APP_ROOT||(process.argv.includes('--dist')?'dist':'.'));
const port=Number(process.env.PORT||5173);
const store=new Store(path.resolve(process.env.ORBIT_DATA_DIR||'.orbit-data'));await store.init();
await mkdir(path.join(store.root,'uploads'),{recursive:true,mode:0o700});
const groq=new GroqClient(store);const subscribers=new Set();let chatBusy=false, chatController;
const filePublic=({text,diskName,...f})=>({...f,characters:text?.length||0});
const publicState=()=>({...store.data,files:store.data.files.map(filePublic),setup:{hasKey:!!store.config.groqKey,speech:store.config.speech,voice:store.config.voice,model:MODEL,platform:process.platform,appControl:!!store.config.appControl,kokoro:speechStatus(),quota:groq.quota,blockedUntil:groq.blockedUntil},busy:chatBusy});
const broadcast=(event={type:'state'})=>{for(const res of subscribers) res.write(`data: ${JSON.stringify(event)}\n\n`);};
const saveState=async()=>{await store.save();broadcast();};
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webm':'video/webm','.mp4':'video/mp4','.jpg':'image/jpeg'};
const allowed=new Set(['index.html','style.css','app.js','speech-playback.js','startup.js','singularity.js','core-field.js','fluid-simulation.js','scene-layout.js','favicon.svg','runtime.js']);
async function readBody(req,max=26*1024*1024) {
 let length=0;const chunks=[];
 for await(const chunk of req) {length+=chunk.length;if(length>max) throw Error('File or request too large (25 MB maximum).');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function jsonBody(req) {return JSON.parse((await readBody(req,64000)).toString());}
function json(res,body,status=200) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function extract(buffer,name,type) {
 if(/\.(pdf)$/i.test(name)) {const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(buffer)});try{return (await parser.getText()).text;}finally{await parser.destroy();}}
 if(/\.docx$/i.test(name)) {const mammoth=await import('mammoth');return (await mammoth.extractRawText({buffer})).value;}
 if(type.startsWith('text/')||/\.(txt|md|csv|tsv|json|log|js|ts|jsx|tsx|py|html|css|xml|yaml|yml|swift|rs|go|java|c|cpp|sql)$/i.test(name)) return buffer.toString('utf8');
 if(type.startsWith('audio/')||type.startsWith('video/')||/\.(mp3|mp4|wav|m4a|ogg|webm|flac|mpeg|mpga)$/i.test(name)) return groq.transcribe(buffer,name,type);
 return null;
}
async function routes(req,res,url) {
 const p=url.pathname;
 if(p==='/api/events'&&req.method==='GET') {res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: {"type":"state"}\n\n');subscribers.add(res);req.on('close',()=>subscribers.delete(res));return;}
 if(p==='/api/state'&&req.method==='GET') return json(res,publicState());
 if(p==='/api/settings'&&req.method==='POST') {
  const data=await jsonBody(req);
  if(data.groqKey!==undefined) {if(typeof data.groqKey!=='string'||(data.groqKey&&!/^gsk_[A-Za-z0-9]{20,100}$/.test(data.groqKey))) throw Error('Invalid Groq key format.');store.config.groqKey=data.groqKey;groq.blockedUntil=0;}
  if(typeof data.appControl==='boolean'){store.config.appControl=data.appControl;if(!data.appControl)closeAppControl();}
  if(typeof data.speech==='boolean')store.config.speech=data.speech;
  if(['af_heart','af_bella','am_adam','bf_emma','bm_george'].includes(data.voice))store.config.voice=data.voice;
  await store.save(true);broadcast();return json(res,{ok:true});
 }
 if(p==='/api/app-control/test'&&req.method==='POST'){if(chatBusy)throw Error('Stop the current request before testing app control.');return json(res,await testTextEditControl(store));}
 if(p==='/api/app-control/status'&&req.method==='GET')return json(res,await appControl('status'));
 if(p==='/api/speech'&&req.method==='POST') {const {text}=await jsonBody(req);if(typeof text!=='string'||!text.trim())throw Error('Speech text is empty.');const wav=await speech(store.root,text,store.config.voice);res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'});res.end(wav);broadcast();return;}
 if(p==='/api/speech/load'&&req.method==='POST') {await loadSpeech(store.root);broadcast();return json(res,{ok:true});}
 if(p==='/api/transcribe'&&req.method==='POST') {const buffer=await readBody(req,25*1024*1024);const type=req.headers['content-type']||'audio/webm';const name=type.includes('mp4')?'recording.m4a':type.includes('wav')?'recording.wav':'recording.webm';return json(res,{text:await groq.transcribe(buffer,name,type)});}
 if(p==='/api/files'&&req.method==='POST') {
  const name=decodeURIComponent(req.headers['x-file-name']||'file').replaceAll(/[/\\\x00-\x1f]/g,'_').slice(0,180);const type=String(req.headers['content-type']||'application/octet-stream');
  const buffer=await readBody(req,25*1024*1024);const id=randomUUID();const extension=path.extname(name).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12);const diskName=id+extension;
  const file={id,name,type,size:buffer.length,diskName,createdAt:new Date().toISOString(),capability:'Stored only',note:'This file is stored, but GPT-OSS cannot interpret this format.'};
  await writeFile(path.join(store.root,'uploads',diskName),buffer,{mode:0o600});
  try {const text=await extract(buffer,name,type);if(text?.trim()){file.text=text.slice(0,1000000);file.capability=type.startsWith('audio/')||type.startsWith('video/')||/\.(mp3|mp4|wav|m4a|ogg|webm|flac)$/i.test(name)?'Audio transcript':'Readable text';file.note=file.capability==='Audio transcript'?'Audio only; video visuals are not analyzed.':'Text can be read by Orbit.';}else if(type.startsWith('image/')){file.capability='Image preview';file.note='Preview available. GPT-OSS is text-only and cannot interpret images.';}else if(/\.pdf$/i.test(name)){file.note='No extractable text. Scanned PDFs need OCR, which is not enabled.';}}
  catch(error){file.note=`Saved, but extraction failed: ${error.message}`;}
  store.data.files.push(file);await saveState();return json(res,filePublic(file),201);
 }
 const fileMatch=p.match(/^\/api\/files\/([a-f0-9-]+)(\/text)?$/);
 if(fileMatch) {
  const file=store.data.files.find(f=>f.id===fileMatch[1]);if(!file)return json(res,{error:'File not found'},404);
  if(req.method==='DELETE'){await unlink(path.join(store.root,'uploads',file.diskName));store.data.files=store.data.files.filter(f=>f.id!==file.id);await saveState();return json(res,{ok:true});}
  if(req.method==='GET'&&fileMatch[2])return json(res,{text:file.text||'',note:file.note});
  if(req.method==='GET'){res.writeHead(200,{'Content-Type':file.type,'Content-Disposition':`${url.searchParams.has('preview') && /^(image\/(png|jpeg|webp|gif)|audio\/(wav|mpeg|ogg)|video\/(mp4|webm))$/.test(file.type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store'});return res.end(await readFile(path.join(store.root,'uploads',file.diskName)));}
 }
 if(p==='/api/chats'&&req.method==='POST') {const chat={id:randomUUID(),title:'New conversation',createdAt:new Date().toISOString(),messages:[]};store.data.chats.unshift(chat);await saveState();return json(res,chat,201);}
 const chatMatch=p.match(/^\/api\/chats\/([a-f0-9-]+)$/);
 if(chatMatch&&req.method==='DELETE'){if(chatBusy)throw Error('Wait for the current request to finish.');store.data.chats=store.data.chats.filter(c=>c.id!==chatMatch[1]);await saveState();return json(res,{ok:true});}
 if(p==='/api/tasks'&&req.method==='POST') {const task=await executeTool('schedule_task',await jsonBody(req),store,{notify:broadcast});return json(res,task,201);}
 const taskMatch=p.match(/^\/api\/tasks\/([a-f0-9-]+)$/);
 if(taskMatch&&req.method==='DELETE'){const task=store.data.tasks.find(t=>t.id===taskMatch[1]);if(!task||!['complete','cancelled','failed'].includes(task.status))throw Error('Only finished tasks can be removed.');store.data.tasks=store.data.tasks.filter(t=>t.id!==task.id);await saveState();return json(res,{ok:true});}
 if(taskMatch&&req.method==='PATCH') {const data=await jsonBody(req);const t=store.data.tasks.find(t=>t.id===taskMatch[1]);if(!t)throw Error('Task not found.');if(!['cancelled','complete'].includes(data.status)||!['scheduled','complete','failed'].includes(t.status))throw Error('Task cannot be changed while running.');t.status=data.status;t.detail=data.status==='complete'?'Marked complete':'Cancelled';await saveState();return json(res,t);}
 if(p==='/api/chat/cancel'&&req.method==='POST'){chatController?.abort();closeAppControl();return json(res,{ok:true});}
 if(p==='/api/chat'&&req.method==='POST') {
  const {text,chatId,method='text',attachments=[]}=await jsonBody(req);
  if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('Message must contain 1–8000 characters.');
  if(!Array.isArray(attachments)||attachments.length>8||attachments.some(id=>!store.data.files.some(f=>f.id===id)))throw Error('Invalid file attachments.');
  if(chatBusy)throw Error('Orbit is already handling a request.');if(!store.config.groqKey)throw Error('Add your Groq Free-plan key in Settings.');
  let chat=store.data.chats.find(c=>c.id===chatId);if(chatId&&!chat)throw Error('Conversation not found.');
  if(!chat){chat={id:randomUUID(),title:text.slice(0,50),createdAt:new Date().toISOString(),messages:[]};store.data.chats.unshift(chat);}
  chatBusy=true;chatController=new AbortController();chat.title=chat.messages.length?chat.title:text.slice(0,50);chat.messages.push({role:'user',content:text,method:method==='voice'?'voice':'text',attachments,createdAt:new Date().toISOString()});
  const job={id:randomUUID(),title:text.slice(0,60),status:'running',detail:'Thinking…',chatId:chat.id,createdAt:new Date().toISOString()};store.data.tasks.push(job);
  res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
  const event=async data=>{if(data.type==='status')job.detail=data.text;if(!res.destroyed)res.write(JSON.stringify(data)+'\n');broadcast();};
  try {await saveState();await event({type:'chat',id:chat.id});const answer=await groq.chat(chat,attachments,event,{signal:chatController.signal});chat.messages.push({role:'assistant',content:answer,createdAt:new Date().toISOString()});job.status='complete';job.detail='Completed';await event({type:'answer',text:answer});}
  catch(error){const message=chatController.signal.aborted?'Request stopped. Actions already completed were not undone.':error.message;job.status=chatController.signal.aborted?'cancelled':'failed';job.detail=message;chat.messages.push({role:'assistant',content:message,error:true,createdAt:new Date().toISOString()});await event({type:'error',text:message});}
  finally{chatBusy=false;chatController=null;job.finishedAt=new Date().toISOString();await saveState();res.end();}return;
 }
 return json(res,{error:'Not found'},404);
}
const server=http.createServer(async(req,res)=> {
 try {
  const validHosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`]);
  if(!validHosts.has(req.headers.host))return json(res,{error:'Invalid host'},403);
  const origin=req.headers.origin;
  if(origin&&!new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]).has(origin))return json(res,{error:'Local access only'},403);
  if(!['GET','HEAD'].includes(req.method)&&!origin)return json(res,{error:'Origin required'},403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  if(process.env.ORBIT_DESKTOP_TOKEN && req.headers['x-orbit-token']!==process.env.ORBIT_DESKTOP_TOKEN && !(req.headers.cookie||'').split(';').some(c=>c.trim()==='orbit_session='+process.env.ORBIT_DESKTOP_TOKEN))return json(res,{error:'Desktop session required'},403);
  const url=new URL(req.url,`http://localhost:${port}`);
  if(url.pathname.startsWith('/api/'))return await routes(req,res,url);
  let rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  if(!allowed.has(rel)&&!['vendor/marked.js','vendor/purify.js'].includes(rel)&&!/^assets\/[\w.-]+$/.test(rel))return json(res,{error:'Not found'},404);
  const vendor={ 'vendor/marked.js':'node_modules/marked/lib/marked.esm.js', 'vendor/purify.js':'node_modules/dompurify/dist/purify.es.mjs' };
  const file=path.resolve(root,(process.argv.includes('--dist')||process.env.ORBIT_APP_ROOT)?rel:(vendor[rel]||rel));const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
 }catch(error){if(!res.headersSent)json(res,{error:error.message},400);else res.end();}
});
let ticking=false;
const scheduler=setInterval(async()=>{if(ticking)return;ticking=true;try{await runDueTasks(store,{notify:async task=>broadcast(task?{type:'reminder',task}:undefined),remind:async task=>{if(process.parentPort)process.parentPort.postMessage({type:'notification',title:task.title});else await computerAction('notify',{title:task.title});}});}catch{console.error('Scheduler failed to persist task state.');}finally{ticking=false;}},1000);
scheduler.unref();
const heartbeat=setInterval(()=>{for(const res of subscribers)res.write(': heartbeat\n\n');},15000);heartbeat.unref();
server.listen(port,'127.0.0.1',()=>{console.log(`Orbit is ready at http://localhost:${port} · local assistant enabled`);process.parentPort?.postMessage({type:'ready',port});if(store.config.speech&&process.env.ORBIT_DISABLE_SPEECH_WARMUP!=='1')loadSpeech(store.root).catch(()=>{});});

process.on('exit',closeAppControl);
