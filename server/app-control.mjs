import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';
import {windowsAction} from './platform.mjs';
const binary=fileURLToPath(new URL('../native/orbit-accessibility',import.meta.url));
const windowsPending=new Set();
const desktopPending=new Map();let desktopSequence=0;
process.parentPort?.on('message',event=>{const message=event.data;if(message?.type!=='app_control_result')return;const pending=desktopPending.get(message.id);if(!pending)return;desktopPending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(Error(message.error));else pending.resolve(message.result);});
function desktopInvoke(action,args){return new Promise((resolve,reject)=>{const id=++desktopSequence;const timer=setTimeout(()=>{desktopPending.delete(id);reject(Error('Desktop app control timed out. Retry the request.'));},25000);desktopPending.set(id,{resolve,reject,timer});process.parentPort.postMessage({type:'app_control',id,action,args});});}
let helper,queue=Promise.resolve(),pending;
function invoke(body) {
 const operation=queue.catch(()=>{}).then(()=>new Promise((resolve,reject)=> {
  if(!helper) {
   helper=spawn(binary,[],{stdio:['pipe','pipe','ignore']});const child=helper;
   readline.createInterface({input:helper.stdout}).on('line',line=>{if(helper!==child||!pending)return;const p=pending;pending=null;clearTimeout(p.timer);try{const result=JSON.parse(line);if(result.error)p.reject(Error(result.error));else p.resolve(result);}catch(error){p.reject(error);}});
   const failed=error=>{if(helper!==child)return;helper=null;if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
   helper.on('error',failed);helper.on('exit',()=>failed(Error('App control stopped. Retry the request.')));
  }
  const timer=setTimeout(()=>{const process=helper;helper=null;pending=null;process?.kill();reject(Error('The app did not respond to Accessibility.'));},20000);
  pending={resolve,reject,timer};helper.stdin.write(JSON.stringify(body)+'\n');
 }));
 queue=operation;return operation;
}
export async function appControl(action,args={}, {platform=process.platform,invokeImpl=invoke,windowsImpl=windowsAction}={}) {
 if(platform==='darwin'){if(process.parentPort&&invokeImpl===invoke)return desktopInvoke(action,args);return invokeImpl({action,...args});}
 if(platform==='win32'){const controller=new AbortController();windowsPending.add(controller);try{return await windowsImpl('app_control',{action,...args},undefined,{signal:controller.signal});}finally{windowsPending.delete(controller);}}
 throw Error('App control requires macOS or Windows.');
}
export function closeAppControl(){if(process.parentPort){process.parentPort.postMessage({type:'app_control_close'});for(const pending of desktopPending.values()){clearTimeout(pending.timer);pending.reject(Error('App control stopped.'));}desktopPending.clear();}for(const controller of windowsPending)controller.abort();windowsPending.clear();const child=helper;helper=null;if(pending){clearTimeout(pending.timer);pending.reject(Error('App control stopped.'));pending=null;}child?.kill();}
export function validateAppControl(name,args) {
 if(typeof args.app!=='string'||!args.app.trim()||args.app.length>100)throw Error('Specify the target application name.');
 if(name==='inspect_app') {if(args.query!==undefined&&(typeof args.query!=='string'||args.query.length>120))throw Error('Search text must be at most 120 characters.');return;}
 if(typeof args.snapshot!=='string'||args.snapshot.length>80||!args.snapshot)throw Error('Inspect the target app before acting.');
 if(name==='app_press' && (typeof args.element!=='string'||!/^e\d+$/.test(args.element)||!['press','confirm','show_menu','focus'].includes(args.action||'press')))throw Error('Use a control ID and supported action from the current snapshot.');
 if(name==='app_type' && (typeof args.text!=='string'||!args.text||args.text.length>8000|| (args.element!==undefined&&!/^e\d+$/.test(args.element))))throw Error('Type 1–8000 characters into a known text field.');
 if(name==='app_key'&&(typeof args.key!=='string'||args.key.length>60||!/^(?:(?:cmd|ctrl|alt|shift)\+)*(?:enter|tab|escape|space|up|down|left|right|backspace|home|end|pageup|pagedown|delete|f(?:[1-9]|1[0-2])|[a-z0-9])$/.test(args.key)))throw Error('Unsupported app keyboard shortcut.');
}
