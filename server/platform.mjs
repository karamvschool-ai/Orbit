import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
const script=fileURLToPath(new URL('./windows.ps1',import.meta.url));
export async function windowsAction(action,args={},run=exec,{signal}={}) {
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); & ([ScriptBlock]::Create([IO.File]::ReadAllText($env:ORBIT_ADAPTER)))"],{timeout:20000,signal,windowsHide:true,env:{...process.env,ORBIT_ADAPTER:script,ORBIT_ACTION:action,ORBIT_ARGUMENTS:JSON.stringify(args)}});
 return result.stdout.trim()?JSON.parse(result.stdout.trim()):{ok:true};
}
export async function appEntries(platform=process.platform,run=exec) {
 if(platform==='win32') {
  const apps=await windowsAction('list_apps',{},run);
  return (Array.isArray(apps)?apps:apps?[apps]:[]).map(a=>({name:a.Name,id:a.AppID}));
 }
 const apps=[];
 for(const dir of ['/Applications','/System/Applications','/System/Applications/Utilities',path.join(homedir(),'Applications')]) {
  try {for(const file of await readdir(dir))if(file.endsWith('.app'))apps.push({name:file.slice(0,-4),id:path.join(dir,file)});}catch{}
 }
 return apps;
}
export async function computerAction(name,args,{run=exec,platform=process.platform}={}) {
 if(platform==='win32') {
  if(name==='open_app') {
   const app=(await appEntries(platform,run)).find(a=>a.name.toLowerCase()===args.name.toLowerCase());
   if(!app)throw Error('Application is not installed. Use list_apps.');return windowsAction('open_app',{id:app.id},run);
  }
  return windowsAction(name,args,run);
 }
 if(platform!=='darwin')throw Error('Computer controls require macOS or Windows.');
 if(name==='open_app'){if(!(await appEntries()).some(a=>a.name===args.name))throw Error('Application is not installed. Use list_apps.');await run('/usr/bin/open',['-a',args.name],{timeout:10000});return {opened:args.name};}
 if(name==='open_url'||name==='open_file'){await run('/usr/bin/open',[args.url||args.path],{timeout:10000});return {opened:args.url||args.path};}
 if(name==='spotify_search'){await run('/usr/bin/open',['-a','Spotify','spotify:search:'+encodeURIComponent(args.query)],{timeout:10000});return {searchOpened:args.query,verify:'Inspect Spotify, select the matching song, and use its Play control. A search is not playback.'};}
 if(name==='get_volume')return (await run('/usr/bin/osascript',['-e','output volume of (get volume settings)'],{timeout:10000})).stdout.trim();
 if(name==='set_volume'){await run('/usr/bin/osascript',['-e',`set volume output volume ${args.volume}`],{timeout:10000});return {volume:args.volume};}
 if(name==='media_control') {
  const running=await run('/usr/bin/osascript',['-e',`application "${args.app}" is running`],{timeout:10000});if(running.stdout.trim()!=='true')throw Error(`${args.app} is not running. Open it first.`);
  if(args.action==='status') {
   const read=async property=>(await run('/usr/bin/osascript',['-e',`tell application "${args.app}" to ${property}`],{timeout:10000})).stdout.trim();
   const state=await read('player state as string');let track='',artist='';try{track=await read('name of current track');artist=await read('artist of current track');}catch{}
   return {app:args.app,state,track,artist};
  }
  const command={play:'play',pause:'pause',next:'next track',previous:'previous track'}[args.action];await run('/usr/bin/osascript',['-e',`tell application "${args.app}" to ${command}`],{timeout:10000});return {app:args.app,action:args.action};
 }
 if(name==='notify'){await run('/usr/bin/osascript',['-e','on run argv','-e','display notification (item 1 of argv) with title "Orbit"','-e','end run',args.title],{timeout:10000});return {ok:true};}
 throw Error('Unsupported computer action.');
}
