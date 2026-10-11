import path from 'node:path';
let modelPromise;let busy=false;let status='not loaded';
export const speechStatus=()=>status;
export async function loadSpeech(root) {
 if(!modelPromise) {
  status='loading';
  modelPromise=(async()=> {
   const {env}=await import('@huggingface/transformers');
   env.cacheDir=path.join(root,'models');
   const {KokoroTTS}=await import('kokoro-js');
   const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
   status='ready'; return tts;
  })().catch(error=>{modelPromise=null;status='unavailable';throw error;});
 }
 return modelPromise;
}
export async function speech(root,text,voice='af_heart') {
 if(busy) throw Error('Kokoro is already generating speech. Try again shortly.');
 busy=true;
 try {const tts=await loadSpeech(root); const audio=await tts.generate(text.slice(0,1800),{voice});return Buffer.from(await audio.toBlob().arrayBuffer());}
 finally {busy=false;}
}
