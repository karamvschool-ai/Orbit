import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { executeTool, runDueTasks, extractPassages } from '../server/tools.mjs';
import { GroqClient, MODEL } from '../server/groq.mjs';
async function fixture(t) { const root=await mkdtemp(path.join(os.tmpdir(),'orbit-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Store(root);await store.init();store.config.groqKey='test-key';return store; }
test('private persistent state survives a restart; interrupted work fails clearly',async t=> {
 const store=await fixture(t);store.data.chats.push({id:'saved',messages:[{role:'user',content:'Remember this'}]});store.data.tasks.push({id:'running',status:'running'});await store.save();await store.save(true);
 const restored=new Store(store.root);await restored.init();assert.equal(restored.data.chats[0].messages[0].content,'Remember this');assert.equal(restored.data.tasks[0].status,'failed');assert.equal((await stat(path.join(store.root,'config.json'))).mode&0o777,0o600);
});
test('simultaneous saves cannot overwrite a newer snapshot',async t=> {const store=await fixture(t);store.data.tasks.push({id:'one'});const one=store.save();store.data.tasks.push({id:'two'});const two=store.save();await Promise.all([one,two]);assert.equal(JSON.parse(await readFile(path.join(store.root,'state.json'),'utf8')).tasks.length,2);});
test('schedule validates time and action, persists and cancels',async t=> {
 const store=await fixture(t);const args={title:'Focus time',dueAt:new Date(Date.now()+60000).toISOString(),action:'reminder',args:{}};const task=await executeTool('schedule_task',args,store);assert.equal(task.status,'scheduled');
 await assert.rejects(executeTool('schedule_task',{...args,dueAt:'tomorrow'},store));await assert.rejects(executeTool('schedule_task',{...args,dueAt:new Date(0).toISOString()},store));await assert.rejects(executeTool('schedule_task',{...args,action:'run_shell'},store));
 await executeTool('cancel_task',{id:task.id},store);assert.equal(task.status,'cancelled');
});
test('due reminders run once and persist their result',async t=> {const store=await fixture(t);store.data.tasks.push({id:'due',title:'Test',status:'scheduled',action:'reminder',dueAt:new Date(0).toISOString()});let calls=0;await runDueTasks(store,{remind:async()=>calls++});await runDueTasks(store,{remind:async()=>calls++});assert.equal(calls,1);assert.equal(store.data.tasks[0].status,'complete');});
test('failed scheduled computer actions never report completion',async t=> {const store=await fixture(t);store.data.tasks.push({id:'due',status:'scheduled',action:'open_app',args:{name:'Missing'},dueAt:new Date(0).toISOString()});await runDueTasks(store,{execute:async()=>{throw Error('Unavailable');}});assert.equal(store.data.tasks[0].status,'failed');assert.equal(store.data.tasks[0].detail,'Unavailable');});
test('Mac tools use fixed executables and validated arguments',async t=> {
 const store=await fixture(t);const calls=[];const run=async(...args)=>{calls.push(args);return {stdout:'true'};};
 await executeTool('set_volume',{volume:42},store,{run});assert.deepEqual(calls[0].slice(0,2),['/usr/bin/osascript',['-e','set volume output volume 42']]);
 for(const volume of [-1,101,'40; do shell script'])await assert.rejects(executeTool('set_volume',{volume},store,{run}));
 await assert.rejects(executeTool('open_url',{url:'file:///etc/passwd'},store,{run}));await assert.rejects(executeTool('open_url',{url:'javascript:alert(1)'},store,{run}));await assert.rejects(executeTool('media_control',{app:'Finder',action:'play'},store,{run}));await assert.rejects(executeTool('arbitrary_shell',{command:'anything'},store,{run}));
});
test('workspace tools only read registered files; search retrieves later sections',async t=> {const store=await fixture(t);store.data.files.push({id:'file',name:'notes',text:'a'.repeat(18000)+'Important zebra observation'});const result=await executeTool('read_file',{id:'file',query:'zebra'},store);assert.match(result.text,/zebra/);await assert.rejects(executeTool('read_file',{id:'../../config.json'},store));assert.ok(extractPassages('x'.repeat(50000)).length<14500);});
test('quota exhaustion stops subsequent requests without a fallback',async t=> {const store=await fixture(t);let requests=0;const client=new GroqClient(store,{fetchImpl:async()=>{requests++;return new Response('{}',{status:429,headers:{'retry-after':'120'}});}});await assert.rejects(client.request('chat/completions',{}),/quota/);await assert.rejects(client.request('chat/completions',{}),/quota/);assert.equal(requests,1);assert.ok(client.blockedUntil>Date.now());});
test('tool calls execute, create real tasks, and feed results to the model',async t=> {
 const store=await fixture(t);let requests=0;const events=[];
 const client=new GroqClient(store,{fetchImpl:async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.model,MODEL);assert.equal(body.parallel_tool_calls,false);assert.ok(!body.messages.some(m=>m.content?.includes('test-key')));requests++;
 return new Response(JSON.stringify({choices:[{message:requests===1?{role:'assistant',tool_calls:[{id:'call',type:'function',function:{name:'list_files',arguments:'{}'}}]}:{role:'assistant',content:'Your workspace is empty.'}}]}),{status:200});}});
 const chat={id:'chat',messages:[{role:'user',content:'List my files'}]};assert.equal(await client.chat(chat,[],async e=>events.push(e)),'Your workspace is empty.');assert.equal(store.data.tasks[0].status,'complete');assert.ok(events.some(e=>e.text==='list files…'));assert.equal(requests,2);
});
test('failed tool is returned as an error and never marked successful',async t=> {const store=await fixture(t);let count=0;const client=new GroqClient(store,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:++count===1?{tool_calls:[{id:'call',function:{name:'set_volume',arguments:'{"volume":999}'}}]}:{content:'Invalid volume.'}}]}))});await client.chat({id:'chat',messages:[{role:'user',content:'Do it'}]},[],async()=>{});assert.equal(store.data.tasks[0].status,'failed');});
