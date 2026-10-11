import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import path from 'node:path';
export function validateState(data) {
  if (!data || !['chats','files','tasks'].every(key=>Array.isArray(data[key]))) throw Error('Invalid Orbit data: chats, files and tasks must be lists.');
  for (const file of data.files) {
    if (!file || typeof file.diskName!=='string' || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9]+)?$/.test(file.diskName)) throw Error('Invalid workspace file path in Orbit data.');
  }
  return data;
}
export class Store {
  constructor(root) { this.root = root; this.tail = Promise.resolve(); }
  async init() {
    await mkdir(this.root, { recursive:true, mode:0o700 });
    await chmod(this.root,0o700);
    const load = async (name, fallback) => { try { return JSON.parse(await readFile(path.join(this.root,name),'utf8')); } catch(error) { if(error.code==='ENOENT') return fallback; throw error; } };
    this.data = validateState(await load('state.json',{ chats:[], files:[], tasks:[] }));
    this.config = await load('config.json',{groqKey:'', speech:true, voice:'af_heart'});
    for (const task of this.data.tasks) if(task.status==='running') { task.status='failed'; task.detail='Interrupted by server restart. Please try again.'; }
    await this.save();
  }
  save(config=false) {
    const name = config ? 'config.json' : 'state.json';
    const text = JSON.stringify(config ? this.config : this.data);
    this.tail = this.tail.catch(()=>{}).then(async()=> {
      const file = path.join(this.root,name);
      await writeFile(file+'.tmp',text,{mode:0o600});
      await rename(file+'.tmp',file); await chmod(file,0o600);
    });
    return this.tail;
  }
}
