import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
if(process.platform==='darwin') {
 mkdirSync('native',{recursive:true});
 execFileSync('/usr/bin/xcrun',['swiftc','-O','-target','arm64-apple-macos12.0','native/OrbitAccessibility.swift','-o','native/orbit-accessibility','-framework','Cocoa','-framework','ApplicationServices'],{stdio:'inherit'});
 execFileSync('/usr/bin/codesign',['--force','--sign','-','--identifier','com.orbit.personalassistant.control','native/orbit-accessibility'],{stdio:'inherit'});
 console.log('Orbit Accessibility helper built for Apple Silicon.');
}
