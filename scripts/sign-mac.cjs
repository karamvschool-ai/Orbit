const {execFileSync}=require('node:child_process');
const path=require('node:path');
function signOrbit(appPath){
 execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',appPath],{stdio:'inherit'});
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',appPath],{stdio:'inherit'});
 console.log('Orbit has a local ad-hoc signature with its own app identity. No certificate or paid signing service is used.');
}
module.exports=async context=>{if(context.electronPlatformName==='darwin')signOrbit(path.join(context.appOutDir,'Orbit.app'));};
if(require.main===module)signOrbit(path.resolve(process.argv[2]));
