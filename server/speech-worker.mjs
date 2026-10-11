import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
let model;
async function load() {
 if(!model) {
  const {env,StyleTextToSpeech2Model,AutoTokenizer}=await import('@huggingface/transformers');
  env.cacheDir=path.join(workerData.root,'models');
  const {KokoroTTS}=await import('kokoro-js');
  const id='onnx-community/Kokoro-82M-v1.0-ONNX';
  const [network,tokenizer]=await Promise.all([
   StyleTextToSpeech2Model.from_pretrained(id,{dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}}),
   AutoTokenizer.from_pretrained(id)
  ]);
  model=new KokoroTTS(network,tokenizer);
 }
 return model;
}
// Serialize synthesis so cancelled playback cannot make the next request fail as busy.
let queue=Promise.resolve();
parentPort.on('message',message=> {
 queue=queue.catch(()=>{}).then(async()=> {
  try {
   const tts=await load();
   if(message.type==='load') return parentPort.postMessage({id:message.id,ready:true});
   const audio=await tts.generate(message.text,{voice:message.voice});
   const buffer=await audio.toBlob().arrayBuffer();parentPort.postMessage({id:message.id,buffer},[buffer]);
  }catch(error){parentPort.postMessage({id:message.id,error:error.message});}
 });
});
