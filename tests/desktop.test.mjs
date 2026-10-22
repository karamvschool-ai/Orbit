import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {splitSpeech} from '../speech-playback.js';
import {computerAction} from '../server/platform.mjs';
import {validateState} from '../server/store.mjs';

test('speech starts with a short phrase and preserves subsequent text',()=> {
 const text='Hello. '+Array.from({length:100},(_,i)=>`word${i}`).join(' ')+'.';
 const chunks=splitSpeech(text);assert.ok(chunks[0].length<=100);assert.ok(chunks.slice(1).every(c=>c.length<=240));assert.equal(chunks.join(' '),text);
 assert.deepEqual(splitSpeech(' **Hello**   there! '),['Hello there!']);
});
test('Windows actions use the fixed adapter and transmit arguments without script interpolation',async()=> {
 const calls=[];const run=async(...args)=>{calls.push(args);return {stdout:calls.length===1?'[{"Name":"Calculator","AppID":"Microsoft.WindowsCalculator!App"}]':'{"ok":true}'};};
 await computerAction('open_app',{name:'calculator'},{platform:'win32',run});
 assert.equal(calls[0][0],'powershell.exe');assert.ok(calls[0][2].env.ORBIT_ADAPTER.endsWith('windows.ps1'));assert.ok(!calls[0][1].includes('-ExecutionPolicy'));
 assert.equal(calls[1][2].env.ORBIT_ACTION,'open_app');assert.deepEqual(JSON.parse(calls[1][2].env.ORBIT_ARGUMENTS),{id:'Microsoft.WindowsCalculator!App'});
 const url='https://example.com/?x=$(bad)';await computerAction('open_url',{url},{platform:'win32',run});assert.ok(!calls[2][1].some(a=>a.includes(url)));assert.equal(JSON.parse(calls[2][2].env.ORBIT_ARGUMENTS).url,url);
});
test('imported workspace paths cannot escape private storage',()=> {
 const state={chats:[],tasks:[],files:[{diskName:'123-abc.txt'}]};assert.equal(validateState(state),state);
 for(const diskName of ['../config.json','C:\\secret','/etc/passwd','x/../../secret'])assert.throws(()=>validateState({...state,files:[{diskName}]}),/file path/);
 assert.throws(()=>validateState({chats:[],files:[]}),/must be lists/);
});
test('desktop runtime serves built imports and requires its private session',async t=> {
 const root=await mkdtemp(path.join(os.tmpdir(),'orbit-desktop-test-')),base='http://127.0.0.1:5175',token='test-desktop-session';
 const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'5175',ORBIT_DATA_DIR:root,ORBIT_APP_ROOT:path.resolve('dist'),ORBIT_DESKTOP_TOKEN:token,ORBIT_DISABLE_SPEECH_WARMUP:'1'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(root,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
 assert.equal((await fetch(base+'/api/state')).status,403);
 assert.equal((await fetch(base+'/api/state',{headers:{Cookie:`orbit_session=${token}-wrong`}})).status,403);
 for(const asset of ['/','/app.js','/speech-playback.js','/vendor/marked.js','/vendor/purify.js']) {
  const response=await fetch(base+asset,{headers:{Cookie:`orbit_session=${token}`}});assert.equal(response.status,200,asset);
  if(asset.endsWith('.js'))assert.match(response.headers.get('Content-Type'),/javascript/);
 }
 assert.equal((await fetch(base+'/api/state',{headers:{'X-Orbit-Token':token}})).status,200);
 assert.equal((await fetch(base+'/api/state',{headers:{Cookie:`orbit_session=${token}`,Origin:'https://untrusted.example'}})).status,403);
});

test('cancelling an old phrase cannot stop the next phrase’s animation or playback controls',async t=> {
 const {createSpeechPlayer}=await import('../speech-playback.js');
 const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 t.after(()=>Object.assign(globalThis,saved));
 const nodes=[],cancelled=[];let frame=0;
 globalThis.requestAnimationFrame=()=>++frame;globalThis.cancelAnimationFrame=id=>cancelled.push(id);
 class Context {
  sampleRate=24000;destination={};resume(){return Promise.resolve();}decodeAudioData(){return Promise.resolve({});}
  createAnalyser(){return {frequencyBinCount:256,connect(){},disconnect(){}};}
  createBufferSource(){const node={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};nodes.push(node);return node;}
 }
 globalThis.window={AudioContext:Context};
 const player=createSpeechPlayer({request:async()=>new Response(new Uint8Array([1]))});
 const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 const first=player.speak('First phrase.');await settle();assert.equal(nodes.length,1);
 const second=player.speak('Second phrase.');await settle();assert.equal(nodes.length,2);
 const secondFrame=frame;nodes[0].onended();await settle();assert.ok(!cancelled.includes(secondFrame),'old playback must leave new animation running');
 player.stop();assert.equal(nodes[1].stopped,true);nodes[1].onended();await Promise.all([first,second]);
});
