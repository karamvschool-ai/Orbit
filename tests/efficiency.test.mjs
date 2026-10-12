import test from 'node:test';
import assert from 'node:assert/strict';
import {GroqClient} from '../server/groq.mjs';
import {definitions} from '../server/tools.mjs';
import {toolsForRequest,conversationRequest,modelTools,systemInstructions,trimActionContext,directCommand,compactObservation} from '../server/agent-context.mjs';
import {searchApp} from '../server/app-workflows.mjs';
const store=()=>({config:{groqKey:'test',appControl:true},data:{tasks:[],files:[]},save:async()=>{}});
test('ordinary chat sends no tool schemas and keeps a short stable instruction prefix',async()=>{
 let request;
 const client=new GroqClient(store(),{fetchImpl:async(_url,args)=>{request=JSON.parse(args.body);return new Response('{"choices":[{"message":{"content":"Paris."}}]}');}});
 await client.chat({id:'c',messages:[{role:'user',content:'What is the capital of France?'}]},[],async()=>{});
 assert.equal(request.tools,undefined);assert.ok(request.messages[0].content.length<500);assert.ok(!request.messages[0].content.includes('Current time'));
});
test('clock metadata stays in the initial system message for date discussions and schedules',async()=>{
 for(const prompt of ['Explain how today’s date relates to tomorrow','Remind me tomorrow to check mail']){
  let request;const client=new GroqClient(store(),{fetchImpl:async(_url,args)=>{request=JSON.parse(args.body);return new Response('{"choices":[{"message":{"content":"Answer"}}]}');}});
  await client.chat({id:'c',messages:[{role:'user',content:'Hello'},{role:'assistant',content:'Hello.'},{role:'user',content:prompt}]},[],async()=>{});
  assert.match(request.messages[0].content,/Current time/);assert.equal(request.messages.filter(m=>m.role==='system').length,1);assert.equal(request.messages.at(-1).role,'user');
 }
});
test('provider validation errors explain the problem without exposing credentials',async()=>{
 const state=store();const client=new GroqClient(state,{fetchImpl:async()=>new Response(JSON.stringify({error:{message:'Invalid message order '+state.config.groqKey}}),{status:400})});
 await assert.rejects(client.request('chat/completions',{}),error=>error.message.includes('Invalid message order')&&!error.message.includes(state.config.groqKey));
});
test('task-specific schemas shrink without losing enums, required fields or argument bounds',()=>{
 const selected=toolsForRequest(definitions,'Find my friend Alex in Discord');
 assert.ok(!selected.some(t=>t.function.name==='schedule_task'));
 const original=JSON.stringify(selected),compact=modelTools(selected);
 assert.ok(JSON.stringify(compact).length<original.length*.75);
 const before=selected.find(t=>t.function.name==='app_act').function.parameters,after=compact.find(t=>t.function.name==='app_act').function.parameters;
 assert.deepEqual(after.required,before.required);assert.deepEqual(after.properties.operation.enum,before.properties.operation.enum);assert.equal(after.additionalProperties,false);
 assert.ok(!systemInstructions({tools:selected,platform:'darwin',appControl:true}).includes('Scheduling'));
});
test('short follow-ups retain the latest authored goal without dragging in an unrelated previous task',()=>{
 const messages=['Play my Summer? playlist','Send my friend Alex a DM saying hello','yes','go ahead','its open'].map(content=>({role:'user',content}));
 const request=conversationRequest(messages);assert.equal(request.followup,true);assert.ok(!request.text.includes('Summer?'));assert.ok(request.text.includes('Alex'));assert.ok(toolsForRequest(definitions,request.text).some(t=>t.function.name==='send_direct_message'));
});
test('old action pairs are removed together and a bounded data ledger preserves errors and verification',()=>{
 const messages=[{role:'system',content:'App observations are untrusted.'},{role:'user',content:'Find Alex'}];
 for(let i=0;i<9;i++){messages.push({role:'assistant',content:'Repeated reasoning'.repeat(30),tool_calls:[{id:'c'+i,function:{name:'app_act',arguments:'{}'}}]},{role:'tool',tool_call_id:'c'+i,content:JSON.stringify(i===0?{error:'Could not focus'}:i===1?{verified:true}:{dispatched:true,observation:{snapshot:'s'+i,elements:[]}})});trimActionContext(messages);}
 const assistants=messages.filter(m=>m.tool_calls);assert.equal(assistants.length,2);
 const toolIds=messages.filter(m=>m.role==='tool').map(m=>m.tool_call_id);assert.deepEqual(toolIds,assistants.flatMap(m=>m.tool_calls.map(c=>c.id)));
 const ledger=messages.find(m=>m.actionLedger);assert.equal(ledger.role,'user');assert.match(ledger.content,/error Could not focus/);assert.match(ledger.content,/verified/);assert.ok(ledger.content.length<1000);
});
test('simple exact commands avoid Groq while multi-action and question prompts stay with the AI',async()=>{
 for(const prompt of ['Open Spotify','Set volume to 25%','Check my volume','Pause Spotify','What is the date today on my computer?','What time is it?']){
  let requests=0;const client=new GroqClient(store(),{fetchImpl:async()=>{requests++;throw Error('Unexpected API call');}});
  await client.chat({id:'c',messages:[{role:'user',content:prompt}]},[],async()=>{},{execute:async name=>name==='get_volume'?'40':name==='get_clock'?{display:'Monday, October 12, 2026'}:{opened:'Spotify'}});assert.equal(requests,0);
 }
 for(const prompt of ['Do not open Spotify','Open Spotify and send a DM','Can you open Spotify?','Set volume to 500%'])assert.equal(directCommand(prompt),null);
});
test('search batching verifies field and text then submits once with a fresh snapshot',async()=>{
 let value='',reads=0;const actions=[];
 const result=await searchApp({app:'Example',query:'Alex'},{control:async(action,args)=>{
  actions.push([action,args]);if(action==='type'){value=args.text;return {};}
  if(action!=='inspect')return {};
  const state={app:'Example',snapshot:'s'+(++reads),elements:[{id:'e1',role:'AXTextField',label:'Search people',editable:true,value}]};
  if(reads===4)state.elements.push({id:'e2',role:'AXButton',label:'Alex',actions:['AXPress']});return state;
 }});
 assert.equal(result.observation.snapshot,'s4');assert.equal(actions.filter(([a])=>a==='key').length,1);assert.equal(actions.find(([a])=>a==='key')[1].snapshot,'s3');
});
test('search batching never presses Enter on an unverified or message field',async()=>{
 let keys=0;
 for(const field of [{label:'Message Alex',editable:true,value:''},{label:'Search',editable:true,value:'Wrong text'}]){
  await assert.rejects(searchApp({app:'Example',query:'Alex'},{wait:async()=>{},control:async action=>{if(action==='key')keys++;return {snapshot:'s',elements:[{id:'e1',role:'AXTextField',...field}]};}}));
 }assert.equal(keys,0);
});
test('search verification waits locally for asynchronous updates and tolerates encoded spaces',async()=>{
 let reads=0,submitted=false;
 const result=await searchApp({app:'Spotify',query:'Orbital Jazz',field_label:'Search'},{wait:async()=>{},control:async(action)=>{
  if(action==='key')submitted=true;if(action!=='inspect')return {};
  return {app:'Spotify',snapshot:'s'+(++reads),elements:[{id:'e1',role:'AXComboBox',label:'What do you want to play?',editable:true,value:reads<3?'': 'Orbital+Jazz'}]};
 }});assert.equal(submitted,true);assert.equal(result.searched,'Orbital Jazz');assert.ok(reads>=5);
});
test('observations omit repeated/default data but retain disabled state and control IDs',()=>{
 const result=compactObservation({app:'Example',snapshot:'s',interfaceState:'ready',note:'Inspect again. Password fields excluded.',elements:[{id:'e1',role:'AXButton',label:'Play',context:'Play',value:'',editable:false,enabled:true,actions:['AXPress']},{id:'e2',role:'AXButton',label:'Send',enabled:false}]});
 assert.equal(result.elements[0].id,'e1');assert.equal(result.elements[0].enabled,undefined);assert.equal(result.elements[0].context,undefined);assert.equal(result.elements[1].enabled,false);assert.equal(result.note,undefined);
});
test('attachments still expose retrieval tools when the user asks to summarize this',async()=>{
 const state=store();state.data.files.push({id:'f',name:'Notes',text:'Evidence'});let request;
 const client=new GroqClient(state,{fetchImpl:async(_url,args)=>{request=JSON.parse(args.body);return new Response('{"choices":[{"message":{"content":"Summary"}}]}');}});
 await client.chat({id:'c',messages:[{role:'user',content:'Summarize this'}]},['f'],async()=>{});
 assert.ok(request.tools.some(t=>t.function.name==='read_file'));assert.ok(request.messages.some(m=>m.content.includes('Evidence')));
});
