import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {quotaFromHeaders,resetMilliseconds} from '../server/quota.mjs';
import {Store} from '../server/store.mjs';
import {GroqClient,MODEL} from '../server/groq.mjs';
test('quota bars use reported limits and the correct daily/minute windows',()=>{
 const headers=new Headers({'x-ratelimit-limit-requests':'1000','x-ratelimit-remaining-requests':'750','x-ratelimit-reset-requests':'2h3m4.5s','x-ratelimit-limit-tokens':'8000','x-ratelimit-remaining-tokens':'2000','x-ratelimit-reset-tokens':'7.66s'});
 const quota=quotaFromHeaders(headers,MODEL,1000);assert.equal(quota.windows[0].percent,25);assert.equal(quota.windows[1].percent,75);assert.equal(quota.windows[0].resetAt,7385500);assert.equal(quota.windows[1].resetAt,8660);assert.equal(quota.windows[1].label,'Tokens per minute');
 assert.equal(resetMilliseconds('3ms'),3);assert.equal(resetMilliseconds('tomorrow'),null);
});
test('missing or invalid quota data stays unknown rather than displaying zero usage',()=>{
 const quota=quotaFromHeaders(new Headers({'x-ratelimit-limit-requests':'-1','x-ratelimit-remaining-tokens':'8'}),MODEL);assert.equal(quota.windows[0].limit,null);assert.equal(quota.windows[0].percent,null);assert.equal(quota.windows[1].limit,null);assert.equal(quota.windows[1].percent,null);
});
test('voice quota cannot overwrite chat usage and chat headers survive restart',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'orbit-quota-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Store(root);await store.init();store.config.groqKey='test';
 const client=new GroqClient(store,{fetchImpl:async url=>new Response(JSON.stringify(url.includes('transcriptions')?{text:'Hello'}:{}),{headers:{'x-ratelimit-limit-requests':url.includes('transcriptions')?'2000':'1000','x-ratelimit-remaining-requests':'900','x-ratelimit-limit-tokens':'8000','x-ratelimit-remaining-tokens':'4000'}})});
 await client.request('chat/completions',{});const before=client.quota;
 await client.transcribe(Buffer.from('audio'),'test.wav','audio/wav');assert.deepEqual(client.quota,before);assert.equal(client.voiceQuota.model,'whisper-large-v3-turbo');
 const reloaded=new Store(root);await reloaded.init();assert.deepEqual(new GroqClient(reloaded).quota,before);
});
