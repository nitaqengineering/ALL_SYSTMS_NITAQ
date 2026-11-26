// Build the folder engineers install the NITAQ Showcase button from:
//   node tools/revit/pack-showcase-extension.mjs [outDir]       (default dist/NITAQ-Showcase)
//   node tools/revit/pack-showcase-extension.mjs --engineer "<name>"
// It holds the pyRevit extension with its tools (the read-only Revit exports, the build and the
// upload scripts) and install.ps1. The cloud address comes from SHOWCASE_URL in .env; no villa data
// goes in.
// With --engineer it makes that engineer's own package: a fresh personal key is built into
// install.ps1 (nothing to type), zipped as dist/engineers/<name>.zip, and the SQL that registers
// the key (its SHA-256 only, never the key) is written next to it as <name>.sql and printed, to run
// in the showcase project's SQL editor. dist/ is git-ignored; hand the zip to that engineer only.
import {readFile, writeFile, mkdir, cp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {newPublisherKey} from './showcase_publish.mjs';

const args = process.argv.slice(2), e = args.indexOf('--engineer');
const engineer = e >= 0 ? String(args[e + 1] || '').trim() : '';
if (e >= 0 && !engineer) { console.error('usage: --engineer "<name>"'); process.exit(1); }
const safe = engineer.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
if (e >= 0 && !safe) { console.error('name has no usable characters'); process.exit(1); }
const out = engineer ? join('dist/engineers', safe, 'NITAQ-Showcase') : (args[0] || 'dist/NITAQ-Showcase');

let base = process.env.SHOWCASE_URL || '';
try {
  for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*SHOWCASE_URL\s*=\s*(.*?)\s*$/); if (m && !base) base = m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env */ }
const endpoint = /^https:\/\//.test(base) ? base.replace(/\/+$/, '') + '/functions/v1/showcase-publish' : '';
if (engineer && !endpoint) { console.error('Set SHOWCASE_URL in .env first.'); process.exit(1); }

await rm(engineer ? join('dist/engineers', safe) : out, {recursive: true, force: true});
const ext = join(out, 'NITAQ.extension');
await cp('tools/revit/extension/NITAQ.extension', ext, {recursive: true});
await mkdir(join(ext, 'tools'), {recursive: true});
for (const f of ['showcase_export.py', 'showcase_export_mesh.py', 'showcase_build.mjs', 'showcase_publish.mjs']) {
  await cp(join('tools/revit', f), join(ext, 'tools', f));
}
const key = engineer ? newPublisherKey() : '';
const ps = (await readFile('tools/revit/install-showcase.ps1', 'utf8')).replace('__ENDPOINT__', endpoint).replace('__KEY__', key);
await writeFile(join(out, 'install.ps1'), '﻿' + ps.replace(/^﻿/, '')); // BOM: Windows PowerShell reads Arabic text right
await cp('docs/showcase-engineers.md', join(out, 'README.md'));

if (!engineer) {
  console.log(`packed ${out}${endpoint ? '' : ' (no SHOWCASE_URL yet: install.ps1 will ask for the address)'}`);
} else {
  const zip = join('dist/engineers', safe + '.zip');
  await rm(zip, {force: true});
  execFileSync('powershell', ['-NoProfile', '-Command', 'Compress-Archive -Path $env:SRC -DestinationPath $env:DST'],
    {env: {...process.env, SRC: out, DST: zip}, stdio: 'inherit'});
  const hash = createHash('sha256').update(key).digest('hex'), q = (s) => "'" + s.replace(/'/g, "''") + "'";
  const sql = `insert into public.showcase_publishers (name, key_hash) values (${q(engineer)}, ${q(hash)})\n` +
    `  on conflict (name) do update set key_hash = excluded.key_hash, active = true;\n`;
  await writeFile(join('dist/engineers', safe + '.sql'), sql);
  console.log(`packed ${zip} for ${engineer} (key built in; the previous key of that name stops working once the SQL runs)`);
  console.log(sql);
}
