import { mkdir, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const files = ['index.html', 'style.css', 'app.js', 'singularity.js', 'core-field.js', 'favicon.svg'];
for (const file of files.filter(name => name.endsWith('.js'))) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of files) await copyFile(file, `dist/${file}`);
console.log('Orbit built successfully. Static frontend is in dist/.');
