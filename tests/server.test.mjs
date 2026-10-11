import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';

test('local API protects credentials and files, persists uploads and validates scheduling',async t=> {
 const root=await mkdtemp(path.join(os.tmpdir(),'orbit-server-test-'));const port=5174;const base=`http://localhost:${port}`;
 const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:String(port),ORBIT_DATA_DIR:root,ORBIT_DISABLE_SPEECH_WARMUP:'1'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(root,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
 const post=async(url,body)=>fetch(base+url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const asset of ['/vendor/marked.js','/vendor/purify.js','/app.js']) { const response=await fetch(base+asset);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/); }
 const response=await post('/api/settings',{groqKey:'gsk_'+ 'x'.repeat(40),speech:false});assert.equal(response.status,200);
 let state=await(await fetch(base+'/api/state')).json();assert.equal(state.setup.hasKey,true);assert.ok(!JSON.stringify(state).includes('gsk_'));
 assert.equal((await fetch(base+'/api/settings',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/.orbit-data/config.json')).status,404);assert.equal((await fetch(base+'/server/store.mjs')).status,404);
 const uploaded=await fetch(base+'/api/files',{method:'POST',headers:{Origin:base,'Content-Type':'text/plain','X-File-Name':'test.txt'},body:'Silver Comet'});assert.equal(uploaded.status,201);const file=await uploaded.json();assert.equal(file.capability,'Readable text');
 state=await(await fetch(base+'/api/state')).json();assert.equal(state.files.length,1);assert.ok(!('text' in state.files[0]));assert.equal((await(await fetch(base+`/api/files/${file.id}/text`)).json()).text,'Silver Comet');
 const schedule=await post('/api/tasks',{title:'Future test',dueAt:new Date(Date.now()+3600000).toISOString(),action:'reminder',args:{}});assert.equal(schedule.status,201);const task=await schedule.json();assert.equal(task.status,'scheduled');
 assert.equal((await post('/api/tasks',{title:'Bad',dueAt:'tomorrow',action:'reminder',args:{}})).status,400);
 const cancel=await fetch(base+`/api/tasks/${task.id}`,{method:'PATCH',headers:{Origin:base,'Content-Type':'application/json'},body:'{"status":"cancelled"}'});assert.equal(cancel.status,200);
 const deleted=await fetch(base+`/api/files/${file.id}`,{method:'DELETE',headers:{Origin:base}});assert.equal(deleted.status,200);assert.equal((await fetch(base+`/api/files/${file.id}`)).status,404);
});
