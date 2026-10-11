import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {Store} from '../server/store.mjs';
import {executeTool,validateAction} from '../server/tools.mjs';
import {appControl} from '../server/app-control.mjs';
import {computerAction} from '../server/platform.mjs';
import {GroqClient} from '../server/groq.mjs';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'orbit-control-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Store(root);await store.init();store.config.groqKey='test-key';return store;}
test('app interaction requires explicit opt-in and dispatches only validated scoped arguments',async t=> {
 const store=await fixture(t);const calls=[];const control=async(...args)=>{calls.push(args);return {dispatched:true};};
 await assert.rejects(executeTool('inspect_app',{app:'Spotify'},store,{control}),/disabled/);assert.equal(calls.length,0);
 store.config.appControl=true;
 await executeTool('app_type',{app:'TextEdit',snapshot:'observed',element:'e2',text:'Draft only.'},store,{control});assert.deepEqual(calls[0],['type',{app:'TextEdit',snapshot:'observed',element:'e2',text:'Draft only.'}]);
 await executeTool('app_press',{app:'TextEdit',snapshot:'observed',element:'e2',action:'focus'},store,{control});assert.equal(calls[1][0],'focus');
 await executeTool('app_key',{app:'TextEdit',snapshot:'observed',key:'cmd+a'},store,{control});assert.equal(calls[2][0],'key');
 for(const args of [{app:'TextEdit',key:'enter'},{app:'TextEdit',snapshot:'old',key:'cmd+q;rm anything'},{app:'',snapshot:'old',key:'enter'}])assert.throws(()=>validateAction('app_key',args,store));
 assert.throws(()=>validateAction('app_type',{app:'TextEdit',snapshot:'old',text:'x'.repeat(8001)},store));
});
test('Windows app control uses the platform adapter, not a model-provided script',async()=> {
 const result=await appControl('inspect',{app:'Notepad'},{platform:'win32',windowsImpl:async(name,args)=>{assert.equal(name,'app_control');assert.deepEqual(args,{action:'inspect',app:'Notepad'});return {snapshot:'real'};}});assert.equal(result.snapshot,'real');
});
test('Spotify song search is scoped to Spotify and never reports playback',async()=> {
 const calls=[];const result=await computerAction('spotify_search',{query:'Song title & artist'},{platform:'darwin',run:async(...args)=>{calls.push(args);return {stdout:''};}});
 assert.deepEqual(calls[0][1],['-a','Spotify','spotify:search:Song%20title%20%26%20artist']);assert.ok(!result.playing);assert.match(result.verify,/not playback/);
});
test('Spotify playback verification reads state, title and artist',async()=> {
 let count=0;const result=await computerAction('media_control',{app:'Spotify',action:'status'},{platform:'darwin',run:async()=>({stdout:['true','playing','Song title','Artist'][count++]})});assert.deepEqual(result,{app:'Spotify',state:'playing',track:'Song title',artist:'Artist'});
});
test('app snapshots remain valid JSON, retain IDs, and superseded snapshots leave model context',async t=> {
 const store=await fixture(t);store.config.appControl=true;let count=0;
 const client=new GroqClient(store,{fetchImpl:async(_url,options)=> {
  const body=JSON.parse(options.body);count++;
  if(count===2){const observation=JSON.parse(body.messages.at(-1).content);assert.equal(observation.snapshot,'snapshot1');assert.ok(observation.elements.length>0);assert.ok(observation.truncated);}
  if(count===3){assert.ok(body.messages.some(m=>m.content==='Previous app snapshot superseded. Use the latest observation.'));return new Response(JSON.stringify({choices:[{message:{content:'Observed controls.'}}]}));}
  return new Response(JSON.stringify({choices:[{message:{tool_calls:[{id:'c'+count,function:{name:'inspect_app',arguments:'{"app":"TextEdit"}'}}]}}]}));
 }});
 const execute=async()=>({app:'TextEdit',snapshot:'snapshot'+count,elements:Array.from({length:65},(_,i)=>({id:'e'+i,label:'x'.repeat(140),value:'y'.repeat(180),role:'AXButton',actions:['AXPress']}))});
 assert.equal(await client.chat({id:'test',messages:[{role:'user',content:'Inspect TextEdit'}]},[],async()=>{},{execute}),'Observed controls.');
});
test('cancelling a model response prevents subsequent app actions',async t=> {
 const store=await fixture(t);const controller=new AbortController();let executed=false;
 const client=new GroqClient(store,{fetchImpl:async()=>{controller.abort();return new Response(JSON.stringify({choices:[{message:{tool_calls:[{id:'c',function:{name:'inspect_app',arguments:'{"app":"TextEdit"}'}}]}}]}));}});
 await assert.rejects(client.chat({id:'test',messages:[{role:'user',content:'Inspect TextEdit'}]},[],async()=>{},{signal:controller.signal,execute:async()=>{executed=true;}}));assert.equal(executed,false);
});
test('native Mac helper reports permission status without reading an application',async t=> {
 if(process.platform!=='darwin'){t.skip('Mac-only helper');return;}
 await access('native/orbit-accessibility');
 const done=Promise.withResolvers();const child=execFile('native/orbit-accessibility',[],(error,stdout)=>{if(error)done.reject(error);else done.resolve(JSON.parse(stdout));});
 child.stdin.end('{"action":"status"}\n');const result=await done.promise;assert.equal(typeof result.available,'boolean');assert.equal(result.platform,'darwin');
});
test('a free-plan retry wait can be stopped without sending another request',async t=> {
 const store=await fixture(t);const controller=new AbortController();let requests=0,waited=false;
 const client=new GroqClient(store,{fetchImpl:async()=>{requests++;return new Response('{}',{status:429,headers:{'retry-after':'60'}});}});
 await assert.rejects(client.request('chat/completions',{},false,controller.signal,async seconds=>{assert.equal(seconds,60);waited=true;controller.abort();}),/abort/i);
 assert.equal(waited,true);assert.equal(requests,1);
});
test('local TextEdit diagnostic verifies typing without a model call and refuses existing text',async()=> {
 const {testTextEditControl}=await import('../server/app-control-check.mjs');const calls=[];let typed=false;
 const control=async(action,args)=>{calls.push([action,args]);if(action==='status')return {available:true};if(action==='type'){typed=true;return {dispatched:true};}return {snapshot:'s',elements:[{id:'e1',role:'AXTextArea',editable:true,value:typed?'Orbit app control works. This is an unsaved local test document.':''}]};};
 const result=await testTextEditControl({config:{appControl:true}},{control,computer:async()=>{},wait:async()=>{},platform:'darwin'});assert.equal(result.ok,true);assert.ok(calls.some(([action])=>action==='type'));
 let actions=0;
 await assert.rejects(testTextEditControl({config:{appControl:true}},{control:async action=>{if(action==='status')return {available:true};if(action==='type')actions++;return {snapshot:'s',elements:[{id:'e1',role:'AXTextArea',editable:true,value:'Existing user document'}]};},computer:async()=>{},wait:async()=>{},platform:'darwin'}),/blank document/);assert.equal(actions,0);
});
