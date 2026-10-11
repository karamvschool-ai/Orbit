import {setTimeout as pause} from 'node:timers/promises';
import {appControl} from './app-control.mjs';
import {computerAction} from './platform.mjs';
export async function testTextEditControl(store,{control=appControl,computer=computerAction,wait=pause,platform=process.platform}={}) {
 if(!store.config.appControl)throw Error('Enable Allow app interaction first.');
 if(platform!=='darwin')throw Error('This local TextEdit test is available on macOS.');
 if(!(await control('status')).available)throw Error('Grant Orbit macOS Accessibility access, then retry this local test.');
 const app='TextEdit',text='Orbit app control works. This is an unsaved local test document.';
 await computer('open_app',{name:app});await wait(250);
 let snapshot=await control('inspect',{app});
 await control('key',{app,snapshot:snapshot.snapshot,key:'cmd+n'});
 let field;
 for(let attempt=0;attempt<8;attempt++) {
  await wait(150);snapshot=await control('inspect',{app});field=snapshot.elements.find(e=>e.role==='AXTextArea');
  if(field)break;
 }
 if(!field)throw Error('No TextEdit document field was exposed. Open a blank document and retry.');
 if(field.value?.trim())throw Error('TextEdit did not open a blank document. The local test stopped without changing its text.');
 if(field.editable)await control('type',{app,snapshot:snapshot.snapshot,element:field.id,text});
 else {await control('focus',{app,snapshot:snapshot.snapshot,element:field.id});snapshot=await control('inspect',{app});await control('keyboard_type',{app,snapshot:snapshot.snapshot,text});}
 await wait(150);const result=await control('inspect',{app});
 if(!result.elements.some(e=>e.role==='AXTextArea'&&e.value?.includes(text)))throw Error('Typing was attempted but its result could not be verified. Check the unsaved TextEdit document.');
 return {ok:true,message:'Verified: Orbit created a blank TextEdit document, entered text and read it back. No Groq request was made. The document is unsaved.'};
}
