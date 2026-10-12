import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {GroqClient} from '../server/groq.mjs';
import {actAndObserve,startNewChat,playSpotifyPlaylist,sendDirectMessage} from '../server/app-workflows.mjs';
import {toolsForRequest,compactObservation,explicitPlaylistName} from '../server/agent-context.mjs';
import {definitions} from '../server/tools.mjs';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'orbit-workflow-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Store(root);await store.init();store.config.groqKey='test';store.config.appControl=true;return store;}
const button=(label,id='e1',context='')=>({id,role:'AXButton',label,context,actions:['AXPress'],enabled:true});
const observation=(elements,snapshot='s')=>({app:'Spotify',snapshot,elements});
test('playlist workflow presses the playlist control, never resumes the player, and verifies playlist Pause',async()=>{
 const calls=[];let inspected=0,started=false;
 const result=await playSpotifyPlaylist({name:'Summer?'},{wait:async()=>{},computer:async(name,args)=>{calls.push([name,args]);return {state:'playing',track:'Playlist song'};},control:async(action,args)=>{
  calls.push([action,args]);if(action==='press'){if(args.element==='e3')started=true;return {dispatched:true};}
  if(inspected++===0)return observation([{id:'e1',role:'AXLink',label:'Summer?',context:'Summer? · Mixed playlist · Me'}]);
  if(args.query==='pause Summer?')return observation(started?[button('Pause Summer?')]:[]);
  return observation([button('Play','e2','Player controls'),button('Play Summer?','e3','Summer?')]);
 }});
 assert.equal(result.verified,true);assert.ok(calls.some(([a,b])=>a==='press'&&b.element==='e3'));
 assert.ok(!calls.some(([a,b])=>a==='media_control'&&b.action==='play'));
});
test('playlist refuses ambiguous matches and an unavailable playlist Play control',async()=>{
 let presses=0;
 const control=async action=>action==='press'?(presses++,{}):observation([{id:'e1',role:'AXLink',label:'Summer?',context:'Playlist · A'},{id:'e2',role:'AXLink',label:'Summer?',context:'Playlist · B'}]);
 await assert.rejects(playSpotifyPlaylist({name:'Summer?'},{control,computer:async()=>{},wait:async()=>{}}),/Multiple playlists/);assert.equal(presses,0);
 let reads=0;
 await assert.rejects(playSpotifyPlaylist({name:'Summer?'},{control:async action=>action==='press'?{}:++reads===1?observation([{id:'e1',role:'AXLink',label:'Summer?',context:'Playlist · A'}]):observation([button('Play','e3','Player controls')]),computer:async()=>{},wait:async()=>{}}),/own named Play/);
});
test('playing the old track alone is not playlist verification',async()=>{
 let reads=0;
 const result=await playSpotifyPlaylist({name:'Summer?'},{control:async action=>action==='press'?{}:++reads===1?observation([{id:'e1',role:'AXLink',label:'Summer?',context:'Playlist'}]):observation([button('Play Summer?')]),computer:async()=>({state:'playing',track:'Old song'}),wait:async()=>{}});
 assert.equal(result.verified,false);
});
test('new-chat workflow refuses an unchanged existing chat even with an empty composer',async()=>{
 const original=observation([button('New chat'),{id:'e2',role:'AXTextArea',label:'Message',editable:true,value:''},{id:'e3',role:'AXStaticText',value:'Old conversation'}]);
 const result=await startNewChat({app:'ChatGPT'},{control:async action=>action==='press'?{}:original});assert.equal(result.prepared,false);
});
test('new-chat workflow verifies a changed blank destination and never types or submits',async()=>{
 let count=0;const actions=[];
 const result=await startNewChat({app:'ChatGPT'},{control:async action=>{actions.push(action);if(action==='press')return {};return ++count===1?observation([button('New chat'),{role:'AXStaticText',value:'Old answer'}]):observation([{id:'e2',role:'AXTextArea',label:'Message',editable:true,value:''},{role:'AXStaticText',value:'What can I help with?'}],'fresh');}});
 assert.equal(result.prepared,true);assert.equal(result.observation.snapshot,'fresh');assert.deepEqual(actions,['inspect','press','inspect']);
});
test('one app action returns its fresh verification snapshot without another model call',async()=>{
 const actions=[];const result=await actAndObserve({app:'TextEdit',operation:'type',snapshot:'s',element:'e1',text:'Draft'},{control:async(action,args)=>{actions.push([action,args]);return action==='inspect'?{snapshot:'fresh',elements:[]}:{dispatched:true};}});
 assert.equal(result.observation.snapshot,'fresh');assert.deepEqual(actions.map(([a])=>a),['type','inspect']);
});
test('DM sending rejects a sidebar/profile match without a verified conversation header',async()=>{
 let writes=0;
 await assert.rejects(sendDirectMessage({app:'Discord',recipient:'Alex',text:'Hello'},{control:async action=>{if(action!=='inspect')writes++;return observation([button('Alex'),{role:'AXTextArea',label:'Message',editable:true,value:''}]);}}),/not verified/);
 assert.equal(writes,0);
 await assert.rejects(sendDirectMessage({app:'Discord',recipient:'Alex',text:'Hello'},{control:async()=>observation([{role:'AXHeading',label:'Alex'},{role:'AXTextArea',label:'Message #Alex',editable:true,value:''}])}),/not verified/);
});
test('DM workflow verifies the exact draft and recipient before one submission and checks visible delivery',async()=>{
 let reads=0;const actions=[];
 const state=value=>observation([{role:'AXHeading',label:'Alex'},{id:'e2',role:'AXTextArea',label:'Message Alex',editable:true,value},button('Send','e3')]);
 const result=await sendDirectMessage({app:'Discord',recipient:'Alex',text:'Hello'},{control:async(action,args)=>{actions.push([action,args]);if(action!=='inspect')return {};return ++reads===1?state(''):reads===2?state('Hello'):{...state(''),elements:[...state('').elements,{role:'AXStaticText',value:'Hello'}]};}});
 assert.equal(result.verified,true);assert.equal(actions.filter(([a])=>a==='press').length,1);
});
test('DM workflow does not submit when the recipient changes after typing',async()=>{
 let reads=0,submits=0;
 await assert.rejects(sendDirectMessage({app:'Discord',recipient:'Alex',text:'Hello'},{control:async action=>{if(action==='press'||action==='key')submits++;if(action!=='inspect')return {};return observation([{role:'AXHeading',label:++reads===1?'Alex':'Someone else'},{id:'e2',role:'AXTextArea',label:'Message Alex',editable:true,value:reads===1?'':'Hello'}]);}}),/not submitted/);assert.equal(submits,0);
});
test('chat blocks writing to an existing conversation when a new chat was requested',async t=>{
 const store=await fixture(t);let calls=0,acted=false;
 const client=new GroqClient(store,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:++calls===1?{tool_calls:[{id:'c1',function:{name:'app_act',arguments:JSON.stringify({app:'ChatGPT',snapshot:'s',operation:'type',text:'Build my website'})}}]}:{content:'A new chat must be opened first.'}}]}))});
 await client.chat({id:'x',messages:[{role:'user',content:'Send a prompt IN A NEW CHAT to ChatGPT'}]},[],async()=>{},{execute:async()=>{acted=true;}});
 assert.equal(acted,false);assert.equal(store.data.tasks[0].status,'failed');
});
test('repeated identical app observations stop early instead of using twelve rounds',async t=>{
 const store=await fixture(t);let calls=0;
 const client=new GroqClient(store,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{tool_calls:[{id:'c'+(++calls),function:{name:'inspect_app',arguments:'{"app":"Messages"}'}}]}}]}))});
 const reply=await client.chat({id:'x',messages:[{role:'user',content:'Find my friend in Messages'}]},[],async()=>{},{execute:async()=>({app:'Messages',snapshot:'s'+calls,elements:[button('Profile')]})});
 assert.equal(calls,3);assert.match(reply,/same screen/);
});
test('Groq waits before the next step when reported minute tokens are insufficient',async t=>{
 const store=await fixture(t);let now=100000,calls=0,waits=[];
 const client=new GroqClient(store,{now:()=>now,waitImpl:async ms=>{waits.push(ms);now+=ms;},fetchImpl:async()=>{calls++;return new Response('{"usage":{"prompt_tokens":120,"completion_tokens":30}}');}});
 client.quota={observedAt:now,windows:[{key:'tokens',remaining:20,limit:8000,resetAt:now+14000}]};
 await client.request('chat/completions',{messages:[{role:'user',content:'Hello'}],max_completion_tokens:700},false,undefined,async()=>{});
 assert.equal(calls,1);assert.deepEqual(waits,[14250]);assert.equal(client.lastUsage.input,120);
});
test('shared wait budget prevents an action loop waiting a minute after every call',async t=>{
 const store=await fixture(t);let now=100000,calls=0;
 const client=new GroqClient(store,{now:()=>now,waitImpl:async ms=>{now+=ms;},fetchImpl:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'14'}});}});
 const budget={waited:0,maxWait:30000};
 await assert.rejects(client.request('chat/completions',{},false,undefined,async()=>{},0,budget),/stopped retrying/);
 await assert.rejects(client.request('chat/completions',{},false,undefined,async()=>{},0,budget),/paused this request/);
 assert.ok(calls<=3);assert.ok(budget.waited<=30000);
});
test('tool schemas and observation context are reduced without cutting JSON or losing observed IDs',()=>{
 const tools=toolsForRequest(definitions,'Play my Summer? playlist on Spotify');assert.ok(!tools.some(d=>d.function.name==='read_file'));assert.ok(!tools.some(d=>d.function.name==='app_press'));
 const result=compactObservation(observation(Array.from({length:65},(_,i)=>button('x'.repeat(140),'e'+i,'y'.repeat(180)))));
 assert.ok(JSON.stringify(result).length<=3000);assert.ok(result.elements.length>0);assert.ok(result.truncated);assert.ok(result.elements.every(e=>e.id));
});
test('explicit playlist command runs and verifies locally using zero Groq requests',async t=>{
 const store=await fixture(t);let requests=0;
 const client=new GroqClient(store,{fetchImpl:async()=>{requests++;throw Error('No model call expected');}});
 const reply=await client.chat({id:'x',messages:[{role:'user',content:'Play my Summer? playlist on Spotify.'}]},[],async()=>{},{execute:async(name,args)=>{assert.equal(name,'spotify_play_playlist');assert.equal(args.name,'Summer?');return {verified:true,player:{track:'First track'},note:'Verified'};}});
 assert.equal(requests,0);assert.match(reply,/Summer\?.*playing/);assert.equal(store.data.tasks[0].status,'complete');
 assert.equal(explicitPlaylistName('How do I play my Summer? playlist?'),null);
 assert.equal(explicitPlaylistName('Play my Summer? playlist and send my friend a message'),null);
});
