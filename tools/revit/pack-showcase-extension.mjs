// Build the folder engineers install the NITAQ Showcase button from:
//   node tools/revit/pack-showcase-extension.mjs [outDir]       (default dist/NITAQ-Showcase)
// It holds the pyRevit extension with its tools (the read-only Revit exports, the build and the
// upload scripts) and install.ps1. The cloud address comes from SHOWCASE_URL in .env; no key or
// villa data goes in. Copy the folder to the office share; each engineer runs install.ps1 once.
import {readFile, writeFile, mkdir, cp, rm} from 'node:fs/promises';
import {join} from 'node:path';

const out = process.argv[2] || 'dist/NITAQ-Showcase';
let base = process.env.SHOWCASE_URL || '';
try {
  for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*SHOWCASE_URL\s*=\s*(.*?)\s*$/); if (m && !base) base = m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env */ }
const endpoint = /^https:\/\//.test(base) ? base.replace(/\/+$/, '') + '/functions/v1/showcase-publish' : '';

await rm(out, {recursive: true, force: true});
const ext = join(out, 'NITAQ.extension');
await cp('tools/revit/extension/NITAQ.extension', ext, {recursive: true});
await mkdir(join(ext, 'tools'), {recursive: true});
for (const f of ['showcase_export.py', 'showcase_export_mesh.py', 'showcase_build.mjs', 'showcase_publish.mjs']) {
  await cp(join('tools/revit', f), join(ext, 'tools', f));
}
const ps = (await readFile('tools/revit/install-showcase.ps1', 'utf8')).replace('__ENDPOINT__', endpoint);
await writeFile(join(out, 'install.ps1'), '﻿' + ps.replace(/^﻿/, '')); // BOM: Windows PowerShell reads Arabic text right
await cp('docs/showcase-engineers.md', join(out, 'README.md'));
console.log(`packed ${out}${endpoint ? '' : ' (no SHOWCASE_URL yet: install.ps1 will ask for the address)'}`);
