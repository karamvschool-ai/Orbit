import {appControl} from './app-control.mjs';
import {computerAction} from './platform.mjs';
import {setTimeout as pause} from 'node:timers/promises';

const normalize=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const pressable=row=>row.enabled!==false && row.actions?.some(a=>['AXPress','press','select'].includes(a));
const composer=row=>row.editable && /message|prompt|ask|chat|reply/i.test(row.label+' '+row.context);
export async function sendDirectMessage({app,recipient,text},{control=appControl,signal}={}) {
 const matchesRecipient=state=>state.elements.some(row=>{
  const label=normalize(row.label),context=normalize(row.context),name=normalize(recipient);
  const namedComposer=state.elements.some(field=>composer(field)&&!/search|find|#/.test(field.label+' '+field.context)&&normalize(field.label+' '+field.context).includes(name));
  return /heading/i.test(row.role)&&label===name&&namedComposer || label.includes(name)&&/direct message with|conversation with|chat with/.test(label+' '+context);
 });
 const inspect=async()=>{signal?.throwIfAborted();return control('inspect',{app});};
 let state=await inspect();
 if(!matchesRecipient(state))throw Error('The direct conversation with '+recipient+' is not verified. A sidebar/profile match is insufficient. Open that DM first; nothing was typed or sent.');
 let fields=state.elements.filter(row=>composer(row)&&!/search|find/i.test(row.label+' '+row.context));
 if(fields.length!==1||fields[0].value?.trim())throw Error('A unique empty message composer is required. Existing drafts will not be replaced.');
 const field=fields[0];
 signal?.throwIfAborted();await control('type',{app,snapshot:state.snapshot,element:field.id,text});
 state=await inspect();fields=state.elements.filter(row=>composer(row)&&!/search|find/i.test(row.label+' '+row.context));
 if(!matchesRecipient(state)||fields.length!==1||fields[0].value!==text)throw Error('The draft or recipient could not be verified after typing. The draft was not submitted.');
 const submit=state.elements.filter(row=>pressable(row)&&/^send(?: message)?$/i.test(row.label));
 signal?.throwIfAborted();
 if(submit.length===1)await control('press',{app,snapshot:state.snapshot,element:submit[0].id,operation:'AXPress'});
 else {await control('focus',{app,snapshot:state.snapshot,element:fields[0].id});state=await inspect();if(!matchesRecipient(state))throw Error('The recipient changed; draft not submitted.');await control('key',{app,snapshot:state.snapshot,key:'enter'});}
 state=await inspect();
 const verified=matchesRecipient(state)&&state.elements.some(row=>!row.editable&&(row.value===text||row.label===text))&&state.elements.some(row=>composer(row)&&!row.value?.trim());
 return {recipient,verified,note:verified?'The exact message is visible in the verified direct conversation and the composer is empty.':'Submission was attempted once, but delivery could not be verified. Do not resend automatically or claim delivery.'};
}
export async function actAndObserve(args,{control=appControl,signal}={}) {
 const operation=args.operation;
 const input={app:args.app,snapshot:args.snapshot,...(args.element?{element:args.element}:{})};
 signal?.throwIfAborted();
 let dispatched;
 try {
  if(operation==='press')dispatched=await control('press',{...input,operation:'AXPress'});
  else if(operation==='type')dispatched=await control(args.element?'type':'keyboard_type',{...input,text:args.text});
  else if(operation==='focus')dispatched=await control('focus',input);
  else dispatched=await control('key',{...input,key:args.key});
 } catch(error){return {error:error.message,observation:await control('inspect',{app:args.app,...(args.query?{query:args.query}:{})})};}
 signal?.throwIfAborted();
 return {...dispatched,observation:await control('inspect',{app:args.app,...(args.query?{query:args.query}:{})})};
}

export async function startNewChat({app},{control=appControl,signal}={}) {
 signal?.throwIfAborted();
 const original=await control('inspect',{app});
 let before=original;
 let controls=before.elements.filter(row=>pressable(row)&&/^(?:start |create )?new (?:chat|conversation|task)(?:\s|$)/i.test(row.label||''));
 if(!controls.length){before=await control('inspect',{app,query:'new'});controls=before.elements.filter(row=>pressable(row)&&/^(?:start |create )?new (?:chat|conversation|task)(?:\s|$)/i.test(row.label||''));}
 if(controls.length!==1)throw Error('A unique New chat control is not readable in '+app+'. No prompt was typed or sent. Open a new chat yourself, then try again.');
 await control('press',{app,snapshot:before.snapshot,element:controls[0].id,operation:'AXPress'});
 signal?.throwIfAborted();
 const observation=await control('inspect',{app});
 const fields=observation.elements.filter(composer);
 const valueLooksEmpty=row=>!row.value?.trim() || row.value===row.placeholder;
 // Fail closed if the destination still contains a draft or a prior conversation.
 const oldConversation=observation.elements.some(row=>/^(?:user message|assistant message|you said|chatgpt said)/i.test(row.label||''));
 const content=state=>state.elements.filter(row=>!row.editable&&!row.actions?.length&&/text|heading/i.test(row.role)).map(row=>row.label+' '+row.value).join('|');
 const welcome=observation.elements.some(row=>!pressable(row)&&/what (?:can|would|do)|how can .*help|start a (?:new )?(?:chat|conversation)|new conversation/i.test(row.label+' '+row.value));
 const changed=content(original)!==content(observation)&&!!content(original);
 const prepared=fields.length===1&&valueLooksEmpty(fields[0])&&!oldConversation&&(welcome||changed);
 return {prepared,app,composer:prepared?fields[0].id:undefined,observation,note:prepared?'New chat opened and an empty message field observed. Use only this fresh snapshot.':'New chat was requested, but a blank destination could not be confirmed. Do not type or send into an existing chat.'};
}

export async function playSpotifyPlaylist({name},{control=appControl,computer=computerAction,wait=pause,signal}={}) {
 const requested=normalize(name);
 const observe=async query=>{signal?.throwIfAborted();return control('inspect',{app:'Spotify',...(query?{query}:{})});};
 const press=async(observation,row)=>{signal?.throwIfAborted();await control('press',{app:'Spotify',snapshot:observation.snapshot,element:row.id,operation:'AXPress'});};
 let observation=await observe(name),links=[];
 const playlistLinks=state=>state.elements.filter(row=>{
  const label=normalize(row.label),context=normalize(row.context);
  return ['AXLink','Hyperlink','AXButton','Button'].includes(row.role)&&!/^play |^pause |edit details/.test(label)&&/playlist/.test(label+' '+context)&&(label===requested||label.startsWith(requested+' ')&&/playlist/.test(label.slice(requested.length)));
 });
 links=playlistLinks(observation);
 if(!links.length)await computer('spotify_search',{query:name});
 for(let attempt=0;attempt<3;attempt++) {
  if(links.length)break;
  observation=await observe(name);links=playlistLinks(observation);
  if(links.length)break;
  if(attempt<2)await wait(250,undefined,{signal});
 }
 if(links.length!==1)throw Error(links.length>1?'Multiple playlists have that name. Specify its owner or provide a unique playlist name. No playback was started.':'The requested playlist link is not readable. No generic Play command was used.');
 await press(observation,links[0]);
 for(let attempt=0;attempt<3;attempt++) {
  const active=await observe('pause '+name);
  if(active.elements.some(row=>normalize(row.label)==='pause '+requested)) {
   const player=await computer('media_control',{app:'Spotify',action:'status'});
   if(player.state==='playing')return {playlist:name,verified:true,player,note:'The requested playlist already has its Pause control and playback is active.'};
  }
  observation=await observe(name);
  // Named playlist button is required; never substitute the bottom player's Play.
  const starts=observation.elements.filter(row=>pressable(row)&&normalize(row.label)==='play '+requested&&!/song|now playing|player controls/i.test(row.context||''));
  if(starts.length===1) {
   await press(observation,starts[0]);
   await wait(700,undefined,{signal});
   let after=await observe('pause '+name);
   for(let retry=0;retry<2&&!after.elements.some(row=>normalize(row.label)==='pause '+requested);retry++){await wait(700,undefined,{signal});after=await observe('pause '+name);}
   signal?.throwIfAborted();
   const player=await computer('media_control',{app:'Spotify',action:'status'});
   const verified=player.state==='playing'&&after.elements.some(row=>normalize(row.label)==='pause '+requested);
   return {playlist:name,verified,player,note:verified?'The requested playlist Play control was pressed, its control changed to Pause, and playback is active.':'I pressed the playlist’s Play button, but could not confirm playback. I stopped without retrying the button.'};
  }
  if(attempt<2)await wait(250,undefined,{signal});
 }
 throw Error('The playlist opened, but its own named Play control is unavailable. The previous song was not resumed.');
}
