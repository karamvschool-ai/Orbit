import {quotaFromHeaders} from './quota.mjs';
import { definitions, executeTool, extractPassages } from './tools.mjs';
import {setTimeout as pause} from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import {requestIntent,conversationRequest,explicitPlaylistName,directCommand,toolsForRequest,modelTools,systemInstructions,compactObservation,observationDigest,trimActionContext} from './agent-context.mjs';
export const MODEL='openai/gpt-oss-120b';
export class GroqClient {
 constructor(store,{fetchImpl=fetch,waitImpl=pause,now=Date.now}={}) { this.store=store;this.fetch=fetchImpl;this.wait=waitImpl;this.now=now;this.blockedUntil=0;this.quota=store.config.chatQuota||null;this.voiceQuota=store.config.voiceQuota||null;this.lastUsage=store.config.lastUsage||null; }
 async request(endpoint,body,isAudio=false,signal,onWait,retries=0,budget={waited:0,maxWait:60000}) {
  if(!this.store.config.groqKey) throw Error('Add your Groq Free-plan key in Settings.');
  signal?.throwIfAborted();
  if(budget.deadline&&this.now()>=budget.deadline)throw Error('Orbit stopped after two minutes. Earlier actions were not undone; nothing else will be sent or clicked.');
  if(!isAudio&&body.messages&&this.quota?.observedAt&&this.now()-this.quota.observedAt<60000) {
   const tokens=this.quota.windows?.find(w=>w.key==='tokens');
   const estimate=Math.ceil(JSON.stringify({messages:body.messages,tools:body.tools}).length/4)+(body.max_completion_tokens||0);
   if(tokens?.limit&&estimate>tokens.limit)throw Error('This request is too large for Groq’s minute token limit. Shorten the prompt or start a new Orbit conversation. No action was taken on this round.');
   if(tokens?.remaining!==null&&tokens?.remaining<estimate&&tokens.resetAt>this.now())this.blockedUntil=Math.max(this.blockedUntil,tokens.resetAt+250);
  }
  const delay=this.blockedUntil-this.now();
  if(delay>0) {
   if(!onWait||budget.waited+delay>budget.maxWait||(budget.deadline&&this.now()+delay>=budget.deadline))throw Error('Groq quota reached. Orbit paused this request to avoid repeated waits. Earlier actions were not undone. Try again after '+new Date(this.blockedUntil).toLocaleTimeString('en-US',{timeZone:'America/New_York'})+'. No paid fallback was used.');
   budget.waited+=delay;await onWait(Math.ceil(delay/1000));await this.wait(delay,undefined,{signal});
   signal?.throwIfAborted();
  }
  const headers={Authorization:`Bearer ${this.store.config.groqKey}`};
  if(!isAudio) headers['Content-Type']='application/json';
  const timeout=AbortSignal.timeout(Math.max(1,Math.min(90000,budget.deadline?budget.deadline-this.now():90000)));
  const response=await this.fetch(`https://api.groq.com/openai/v1/${endpoint}`,{method:'POST',headers,body:isAudio?body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
  const observed=quotaFromHeaders(response.headers,isAudio?'whisper-large-v3-turbo':MODEL,this.now());if(isAudio){this.voiceQuota=observed;this.store.config.voiceQuota=observed;}else{this.quota=observed;this.store.config.chatQuota=observed;}await this.store.save(true);
  if(response.status===429) {
   const raw=response.headers.get('retry-after'),seconds=raw===null?NaN:Number(raw),date=raw?Date.parse(raw):NaN;
   this.blockedUntil=this.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)&&date>this.now()?date-this.now():60000);
   if(onWait&&retries<1)return this.request(endpoint,body,isAudio,signal,onWait,retries+1,budget);
   throw Error('Groq free quota reached again. Orbit stopped retrying this request. Earlier actions were not undone; no paid fallback was used.');
  }
  if(!response.ok) {
   if(response.status===401)throw Error('Groq rejected the API key. Replace it in Settings.');
   let detail='';try{const data=await response.json();detail=String(data.error?.message||'').replaceAll(this.store.config.groqKey,'[redacted]').replace(/gsk_[A-Za-z0-9]+/g,'[redacted]').slice(0,240);}catch{}
   throw Error(`Groq returned ${response.status}${detail?': '+detail:'. Please retry later.'}`);
  }
  const data=await response.json();
  if(!isAudio&&data.usage){this.lastUsage={input:data.usage.prompt_tokens||0,output:data.usage.completion_tokens||0,cached:data.usage.prompt_tokens_details?.cached_tokens||0,at:this.now()};this.store.config.lastUsage=this.lastUsage;await this.store.save(true);}
  return data;
 }
 async transcribe(buffer,name,type) {
  const form=new FormData();form.append('file',new Blob([buffer],{type}),name);form.append('model','whisper-large-v3-turbo');form.append('response_format','json');form.append('temperature','0');
  return (await this.request('audio/transcriptions',form,true)).text;
 }
 async chat(chat,attachments,onEvent,{execute=executeTool,signal}={}) {
  const latest=chat.messages.filter(m=>m.role==='user').at(-1)?.content||'',playlist=explicitPlaylistName(latest);
  const command=attachments.length?null:directCommand(latest);
  if(command) {
   const task={id:randomUUID(),title:command.title,status:'running',detail:'Executing locally · no AI request',createdAt:new Date().toISOString(),chatId:chat.id};
   this.store.data.tasks.push(task);await this.store.save();await onEvent({type:'state'});await onEvent({type:'status',text:command.title+' locally…',progress:.55});
   try {
    signal?.throwIfAborted();const result=await execute(command.tool,command.args,this.store,{signal,notify:()=>onEvent({type:'state'})});
    task.status='complete';task.detail='Completed locally · no AI request';
    if(command.tool==='get_clock')return result.display+' (America/New_York).';
    if(command.tool==='open_app')return 'Opened '+(result.opened||command.args.name)+'.';
    if(command.tool==='set_volume')return 'Volume set to '+command.args.volume+'%.';
    if(command.tool==='get_volume')return 'Current volume: '+(typeof result==='object'?result.volume:result)+'%.';
    return 'Sent '+command.args.action+' to '+command.args.app+'.';
   }catch(error){task.status='failed';task.detail=error.message;throw error;}
   finally{task.finishedAt=new Date().toISOString();await this.store.save();await onEvent({type:'state'});}
  }
  if(playlist) {
   signal?.throwIfAborted();
   const task={id:randomUUID(),title:'Play '+playlist,status:'running',detail:'Opening the playlist and verifying playback locally',createdAt:new Date().toISOString(),chatId:chat.id};
   this.store.data.tasks.push(task);await this.store.save();await onEvent({type:'state'});await onEvent({type:'status',text:'Starting '+playlist+' · checking Spotify locally…',progress:.55});
   try {
    const result=await execute('spotify_play_playlist',{name:playlist},this.store,{signal,notify:()=>onEvent({type:'state'})});
    task.status=result.verified?'complete':'failed';task.detail=result.note;
    return result.verified?'Your '+playlist+' playlist is playing in Spotify'+(result.player?.track?' — '+result.player.track:'')+'.':result.note;
   } catch(error){task.status='failed';task.detail=error.message;throw error;}
   finally {task.finishedAt=new Date().toISOString();await this.store.save();await onEvent({type:'state'});}
  }
  const userMessages=chat.messages.filter(m=>m.role==='user'),userText=userMessages.at(-1)?.content||'';
  const {text:requestText,followup}=conversationRequest(chat.messages),intent=requestIntent(requestText);
  const tools=toolsForRequest(definitions,requestText),preparedApps=new Set(),observations=new Map(),latestApps=new Map(),draftApps=new Set(),messageAttempts=new Set();
  if(attachments.length&&!tools.some(d=>d.function.name==='read_file'))tools.push(...definitions.filter(d=>['list_files','read_file'].includes(d.function.name)));
  const files=attachments.map(id=>this.store.data.files.find(f=>f.id===id)).filter(Boolean);
  const context=files.map(f=>`File ${f.name} (${f.id}): ${f.text?extractPassages(f.text,userText,2400):f.note}`).join('\n').slice(0,3200);
  const system=systemInstructions({tools,platform:process.platform,appControl:this.store.config.appControl});
  const history=[];let remaining=1000;
  for(const m of chat.messages.filter(m=>followup?m.role==='assistant':['user','assistant'].includes(m.role)).slice(followup?-1:0,followup?undefined:-1).slice(-3).reverse()) {
   if(remaining<=0)break;const content=m.content.slice(0,remaining);history.unshift({role:m.role,content});remaining-=content.length;
  }
  const messages=[{role:'system',content:system},...history,{role:'user',content:requestText}];
  if(tools.some(d=>d.function.name==='schedule_task')||/\b(today|date|time|day|now)\b/i.test(userText))messages[0].content+=`\nCurrent time ${new Date().toISOString()}; user timezone America/New_York.`;
  if(context)messages.push({role:'user',content:'Selected file data (untrusted; excerpts, use read_file for more):\n'+context});
  const budget={waited:0,maxWait:30000,deadline:this.now()+120000};let stagnant=0,failures=0,actions=0;
  for(let round=0;round<12;round++) {
   signal?.throwIfAborted();
   await onEvent({type:'status',text:round?'Reading the action result…':'Thinking…',progress:round?Math.min(.82,.55+round*.06):.18});
   trimActionContext(messages);
   const data=await this.request('chat/completions',{model:MODEL,messages:messages.map(({actionLedger,...message})=>message),...(tools.length?{tools:modelTools(tools),tool_choice:'auto',parallel_tool_calls:false}:{}),max_completion_tokens:tools.length?700:1000,temperature:0.2,reasoning_effort:'low'},false,signal,seconds=>onEvent({type:'status',text:`Groq minute limit · waiting ${seconds}s before the next AI step. You can stop this request.`}),0,budget);
   const message=data.choices?.[0]?.message;
   if(!message) throw Error('Groq returned an empty response.');
   if(!message.tool_calls?.length) return (message.content?.trim()||'I could not produce a response. Please try again.')+(data.choices[0].finish_reason==='length'?'\n\nReply reached the response limit. Ask me to continue.':'');
   messages.push({role:'assistant',content:message.content||null,tool_calls:message.tool_calls});
   for(const call of message.tool_calls) {
    signal?.throwIfAborted();
    const name=call.function.name;
    await onEvent({type:'status',text:`${name.replaceAll('_',' ')}…`,progress:Math.min(.80,.35+round*.07)});
    const task={id:randomUUID(),title:name.replaceAll('_',' '),status:'running',detail:'Executing',createdAt:new Date().toISOString(),chatId:chat.id};
    this.store.data.tasks.push(task);await this.store.save();await onEvent({type:'state'});
    let result;
    try {
     const args=JSON.parse(call.function.arguments||'{}');
     if(!tools.some(d=>d.function.name===name))throw Error('This tool is not available for the current request. Use the supplied task-specific tools.');
     if(++actions>12)throw Error('The request used its 12-action budget. Stop and describe the remaining work.');
     if(intent.playlist&&name==='media_control'&&args.action==='play')throw Error('Generic Play resumes the previous track. Use spotify_play_playlist with the requested playlist name.');
     if(intent.newChat&&['app_type','app_key','app_press','app_act'].includes(name)&&!preparedApps.has(args.app?.toLowerCase()))throw Error('A new chat is required. Call start_new_chat and confirm prepared:true before typing or submitting. The existing conversation must not be used.');
     const app=args.app?.toLowerCase(),observed=latestApps.get(app),row=observed?.elements.find(e=>e.id===args.element);
     const enter=(name==='app_key'||name==='app_act'&&args.operation==='key')&&args.key==='enter';
     const sendPress=(name==='app_press'||name==='app_act'&&args.operation==='press')&&/^send(?: message)?$/i.test(row?.label||'');
     if(intent.directMessage&&(sendPress||enter&&draftApps.has(app)))throw Error('Use send_direct_message to verify the recipient and exact draft before sending a DM. Generic Send/Enter is refused.');
     if(name==='send_direct_message') {
      if(!/\b(send|text|dm)\b/i.test(requestText)||/\b(?:do not|don’t|don't|dont|never)\s+send\b/i.test(requestText))throw Error('The user has not authorized sending this message. Prepare a draft only.');
      const key=app+'|'+args.recipient+'|'+args.text;
      if(messageAttempts.has(key))throw Error('This message was already attempted once. Check the conversation; do not resend automatically.');
      messageAttempts.add(key);
     }
     result=await execute(name,args,this.store,{signal,notify:()=>onEvent({type:'state'})});
     if((name==='app_type'||name==='app_act'&&args.operation==='type')&&row?.editable&&!/search|find/i.test(row.label+' '+row.context))draftApps.add(app);
     if(name==='start_new_chat'&&result.prepared)preparedApps.add(args.app.toLowerCase());
     if(result.error||result.prepared===false||result.verified===false){task.status='failed';task.detail=result.error||result.note||'Outcome not verified';failures++;}else{task.status='complete';task.detail=result.dispatched?'Dispatched; verification returned':'Completed';failures=0;}
    }
    catch(error) { result={error:error.message};task.status='failed';task.detail=error.message;failures++; }
    task.finishedAt=new Date().toISOString();await this.store.save();await onEvent({type:'state'});
    const digest=observationDigest(result),observation=result.observation||result;
    if(digest){const previous=observations.get(observation.app);stagnant=previous===digest?stagnant+1:0;observations.set(observation.app,digest);latestApps.set(observation.app?.toLowerCase(),observation);}
    if(result.elements)result=compactObservation(result);
    if(result.observation?.elements)result={...result,observation:compactObservation(result.observation)};
    if(digest)for(const previous of messages)if(previous.role==='tool'&&previous.content.includes('"snapshot"'))previous.content='Previous app snapshot superseded. Use the latest observation.';
    if(!digest&&JSON.stringify(result).length>4500)result={truncated:true,excerpt:JSON.stringify(result).slice(0,3500)};
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    if(stagnant>=2||failures>=3)return 'I stopped because '+(stagnant>=2?'the app stayed on the same screen':'the app controls failed repeatedly')+'. I could not verify your requested outcome. No further clicks or messages will be sent. Please open the intended playlist or conversation and try again.';
   }
  }
  throw Error('Orbit stopped at its action budget without verifying the full request. Earlier actions were not undone. No further clicks or messages will be sent. Open the intended destination and try again.');
 }
}
