// Offline request-size comparison. No Groq calls or real computer actions.
import {mkdtemp,mkdir,writeFile,symlink,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {GroqClient} from '../server/groq.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),scratch=await mkdtemp(path.join(tmpdir(),'orbit-efficiency-'));
try {
 const server=path.join(scratch,'server');await mkdir(server);
 for(const file of await readdir(path.join(root,'server'))){
  if(!file.endsWith('.mjs'))continue;
  if(['groq.mjs','agent-context.mjs','tools.mjs','app-workflows.mjs'].includes(file))await writeFile(path.join(server,file),execFileSync('git',['show','045f3d2:server/'+file],{cwd:root}));
  else await symlink(path.join(root,'server',file),path.join(server,file));
 }
 const {GroqClient:Before}=await import(pathToFileURL(path.join(server,'groq.mjs')));
 async function measure(Client,prompt,mode){
  const bodies=[];let step=0;
  const store={config:{groqKey:'offline-test',appControl:true},data:{tasks:[],files:[]},save:async()=>{}};
  const client=new Client(store,{fetchImpl:async(_url,options)=>{
   const body=JSON.parse(options.body);bodies.push(body);step++;
   let message={content:'Verified result.'};
   if(mode==='app'&&step<=5)message={tool_calls:[{id:'c'+step,type:'function',function:{name:step===1?'inspect_app':'app_act',arguments:JSON.stringify(step===1?{app:'Discord',query:'Alex'}:{app:'Discord',snapshot:'s'+(step-1),operation:'focus',element:'e1'})}}]};
   if(mode==='open'&&step===1)message={tool_calls:[{id:'c1',type:'function',function:{name:'open_app',arguments:'{"name":"Spotify"}'}}]};
   return new Response(JSON.stringify({choices:[{message}]}));
  }});
  await client.chat({id:'offline',messages:[{role:'user',content:prompt}]},[],async()=>{},{execute:async name=>name==='open_app'?{opened:'Spotify'}:{app:'Discord',snapshot:'s'+step,observation:undefined,elements:Array.from({length:24},(_,i)=>({id:'e'+(i+1),role:i?'AXButton':'AXTextField',label:i?'Alex '+i+' profile action '+step:'Search people',context:i?'Alex '+i+' profile action '+step:'Search people',value:'',editable:i===0,enabled:true,actions:['AXPress']}))}});
  return {calls:bodies.length,inputCharacters:bodies.reduce((n,b)=>n+JSON.stringify({messages:b.messages,tools:b.tools}).length,0)};
 }
 const cases=[['Simple question','What is the capital of France?','chat'],['Six-step app simulation','Find my friend Alex in Discord','app'],['Open app','Open Spotify','open']];
 const results=[];
 for(const [scenario,prompt,mode] of cases){const before=await measure(Before,prompt,mode),after=await measure(GroqClient,prompt,mode);results.push({scenario,before,after,inputCharacterReductionPercent:Math.round((1-after.inputCharacters/before.inputCharacters)*100)});}
 const report={measurement:'Serialized model-input characters, not provider token counts. Offline fixtures; no API calls or real app actions.',baseline:'045f3d2',results};
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally {await rm(scratch,{recursive:true,force:true});}
