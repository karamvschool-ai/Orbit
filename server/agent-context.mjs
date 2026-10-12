import {createHash} from 'node:crypto';
export function requestIntent(text) {
 return {playlist:/\bplaylist\b/i.test(text)&&/\bplay\b/i.test(text),newChat:/\bnew (?:chat|conversation|task)\b/i.test(text),directMessage:/\b(?:dm|dms|direct messages?|friend)\b/i.test(text)};
}
export function explicitPlaylistName(text) {
 const match=text.trim().match(/^play\s+(?:(?:my|the)\s+)?(.+?)\s+playlist(?:\s+(?:in|on)\s+spotify)?[.!]?(?:\s+Start the playlist itself,? not the previous song[.!]?)?$/i);
 if(!match)return null;
 const name=match[1].replace(/^["“']|["”']$/g,'').trim();
 return name&&name.length<=120?name:null;
}
export function toolsForRequest(definitions,text) {
 if(requestIntent(text).playlist)return definitions.filter(d=>['spotify_play_playlist','media_control'].includes(d.function.name));
 const names=new Set(['list_tasks','schedule_task','cancel_task']);
 if(/file|workspace|document|pdf|upload|notes/i.test(text))['list_files','read_file','open_file'].forEach(n=>names.add(n));
 if(/volume|mute/i.test(text))['get_volume','set_volume'].forEach(n=>names.add(n));
 if(/spotify|music|song|playlist|pause|play/i.test(text))['spotify_search','spotify_play_playlist','media_control'].forEach(n=>names.add(n));
 if(/app|open|browser|website|chat|prompt|send|message|profile|friend|spotify|music|play|inspect|textedit/i.test(text))['list_apps','open_app','open_url','inspect_app','app_act','start_new_chat','send_direct_message'].forEach(n=>names.add(n));
 // Unknown requests still need discovery, but legacy one-action tools are omitted.
 if(names.size===3)definitions.filter(d=>!['app_press','app_type','app_key'].includes(d.function.name)).forEach(d=>names.add(d.function.name));
 return definitions.filter(d=>names.has(d.function.name));
}
export function compactObservation(result,limit=3000) {
 const compact={app:result.app,snapshot:result.snapshot,window:result.window,elements:[],truncated:!!result.truncated,interfaceState:result.interfaceState,note:result.note};
 const ranked=result.elements.map((row,index)=>({row,index,rank:row.editable?4:row.actions?.length?3:/heading/i.test(row.role)?2:1})).sort((a,b)=>b.rank-a.rank||a.index-b.index);
 for(const {row} of ranked) {
  const item={id:row.id,role:row.role,label:row.label,value:row.value,context:row.context,editable:row.editable,actions:row.actions,enabled:row.enabled};
  compact.elements.push(item);if(JSON.stringify(compact).length>limit){compact.elements.pop();compact.truncated=true;}
 }
 return compact;
}
export function observationDigest(result) {
 const observation=result.observation||result;
 if(!observation.elements)return null;
 return createHash('sha256').update(JSON.stringify({app:observation.app,rows:observation.elements.map(({role,label,value,context})=>({role,label,value,context}))})).digest('hex');
}
export function trimActionContext(messages) {
 const tools=messages.filter(m=>m.role==='tool');
 for(const old of tools.slice(0,-2)) {
  if(old.content.includes('"snapshot"'))old.content='Previous app snapshot superseded. Use the latest observation.';
  else old.content=old.content.slice(0,350);
 }
 // Keep tool-call protocol pairs intact while dropping obsolete reasoning prose.
 for(const old of messages.filter(m=>m.role==='assistant'&&m.tool_calls).slice(0,-2))old.content=null;
}
