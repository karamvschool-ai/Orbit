const {app,BrowserWindow,Menu,Tray,nativeImage,Notification,session,shell,utilityProcess,dialog}=require('electron');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
let window,engine,tray,quitting=false,desktopControl;
const lock=app.requestSingleInstanceLock();if(!lock)app.quit();
app.on('second-instance',()=>{window?.show();window?.focus();});
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
app.whenReady().then(async()=> {
 if(!lock)return;
 const port=await freePort(),token=crypto.randomBytes(32).toString('hex'),base=`http://127.0.0.1:${port}`;
 if(process.platform==='darwin')desktopControl=await import('../server/app-control.mjs');
 const root=app.getAppPath(),data=process.env.ORBIT_DATA_DIR||path.join(app.getPath('userData'),'assistant');
 await fs.mkdir(data,{recursive:true,mode:0o700});
 engine=utilityProcess.fork(path.join(root,'scripts','dev-server.mjs'),[],{cwd:root,serviceName:'Orbit local assistant',stdio:'pipe',env:{...process.env,PORT:String(port),ORBIT_APP_ROOT:path.join(root,'dist'),ORBIT_DATA_DIR:data,ORBIT_DESKTOP_TOKEN:token},allowLoadingUnsignedLibraries:true});
 engine.stderr?.on('data',chunk=>console.error(chunk.toString()));
 let ready=false;
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Orbit’s local engine did not start.')),30000);
  engine.on('message',message=> {
   if(message.type==='app_control'&&desktopControl){desktopControl.appControl(message.action,message.args).then(result=>engine?.postMessage({type:'app_control_result',id:message.id,result})).catch(error=>engine?.postMessage({type:'app_control_result',id:message.id,error:error.message}));}
   if(message.type==='app_control_close')desktopControl?.closeAppControl();
   if(message.type==='ready'){ready=true;clearTimeout(timeout);resolve();}
   if(message.type==='notification'&&Notification.isSupported())new Notification({title:'Orbit',body:message.title}).show();
  });
  engine.on('exit',code=>{if(!ready){clearTimeout(timeout);reject(Error(`Orbit’s local engine exited (${code}).`));}else if(!quitting)dialog.showErrorBox('Orbit engine stopped','Restart Orbit to reconnect to your chats and schedules.');});
 });
 await session.defaultSession.cookies.set({url:base,name:'orbit_session',value:token,httpOnly:true,sameSite:'strict',path:'/'});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===window?.webContents&&contents.getURL().startsWith(base+'/')&&permission==='media'&&(!details.mediaTypes||details.mediaTypes.every(t=>t==='audio'))));
 session.defaultSession.setPermissionCheckHandler((contents,permission,origin,details)=>contents===window?.webContents&&origin.startsWith(base)&&permission==='media'&&details.mediaType!=='video');
 window=new BrowserWindow({width:1440,height:900,minWidth:760,minHeight:580,title:'Orbit',backgroundColor:'#efeff1',icon:path.join(root,'desktop','icon.png'),show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,autoplayPolicy:'no-user-gesture-required',backgroundThrottling:false}});
 window.once('ready-to-show',()=>window.show());
 window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();}});
 window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(base+'/')){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
 await window.loadURL(base);
 const image=nativeImage.createFromPath(path.join(root,'desktop','icon.png')).resize({width:18,height:18});
 if(process.platform==='darwin')image.setTemplateImage(true);
 tray=new Tray(image);tray.setToolTip('Orbit · local assistant');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Orbit',click:()=>window.show()},{label:'Quit Orbit',click:()=>app.quit()}]));tray.on('click',()=>window.show());
 async function importData() {
  const selection=await dialog.showOpenDialog(window,{title:'Import an existing Orbit .orbit-data folder',properties:['openDirectory','showHiddenFiles']});
  if(selection.canceled)return;
  const source=selection.filePaths[0];
  try {
   const {validateState}=await import('../server/store.mjs');
   validateState(JSON.parse(await fs.readFile(path.join(source,'state.json'),'utf8')));
   if(source===data)throw Error('Choose a different source folder.');
   // Preserve current app data as a recoverable backup before importing.
   const backup=data+'-backup-'+Date.now();await fs.cp(data,backup,{recursive:true});
   quitting=true;engine.kill();await fs.cp(source,data,{recursive:true});await fs.chmod(path.join(data,'config.json'),0o600).catch(()=>{});
   app.relaunch();app.quit();
  }catch(error){dialog.showErrorBox('Could not import Orbit data',error.message);if(quitting){app.relaunch();app.quit();}}
 }
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{label:'Orbit',submenu:[{role:'about'},{type:'separator'},{label:'Import existing Orbit data…',click:importData},{type:'separator'},{role:'quit'}]}]:[{label:'File',submenu:[{label:'Import existing Orbit data…',click:importData},{label:'Quit Orbit',click:()=>app.quit()}]}]),
  {role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'},
  {label:'Help',submenu:[{label:'Open private data folder',click:()=>shell.openPath(data)},{label:'About Orbit',click:()=>dialog.showMessageBox(window,{title:'Orbit',message:'Orbit · local personal assistant',detail:'GPT-OSS via your Groq Free-plan key, local Kokoro voice, saved chats, files, schedules, and computer tools. Closing the window keeps reminders running in the tray. Quitting stops the engine. Your Mac/PC must be awake.'})}]}
 ]));
}).catch(error=>{dialog.showErrorBox('Orbit could not start',error.message);app.quit();});
app.on('activate',()=>window?.show());
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;desktopControl?.closeAppControl();engine?.kill();});
