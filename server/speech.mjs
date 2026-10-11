import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
let worker, sequence=0, status='not loaded',loading;
const pending=new Map(), cache=new Map();
export const speechStatus=()=>status;
function send(root,body) {
 if(!worker) {
  worker=new Worker(new URL('./speech-worker.mjs',import.meta.url),{workerData:{root}});
  worker.unref();
  worker.on('message',message=>{const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);if(message.error)item.reject(Error(message.error));else item.resolve(message.buffer?Buffer.from(message.buffer):true);});
  worker.on('error',error=>{status='unavailable';for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();worker=null;loading=null;});
  worker.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Local speech worker stopped. Please retry.'));}pending.clear();worker=null;loading=null;status='not loaded';});
 }
 const id=++sequence;
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local speech generation timed out.'));},180000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,...body});});
}
export async function loadSpeech(root) {
 if(!loading) {status='loading';loading=send(root,{type:'load'}).then(()=>{status='ready';return true;}).catch(error=>{status='unavailable';loading=null;throw error;});}
 return loading;
}
export async function speech(root,text,voice='af_heart') {
 const clean=text.trim().slice(0,1800),key=createHash('sha256').update(voice+'\0'+clean).digest('hex');
 if(cache.has(key))return cache.get(key);
 await loadSpeech(root);
 const result=await send(root,{type:'generate',text:clean,voice});
 cache.set(key,result);if(cache.size>16)cache.delete(cache.keys().next().value);return result;
}
