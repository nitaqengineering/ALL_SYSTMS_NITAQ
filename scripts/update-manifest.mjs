// Refreshes FILE-MANIFEST.sha256 from the files staged in git (run after `git add`).
// Hashes the staged content, so the result does not depend on the machine's line-ending settings.
//   node scripts/update-manifest.mjs          rewrite the manifest
//   node scripts/update-manifest.mjs --check  fail when the manifest is stale
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const name='FILE-MANIFEST.sha256',check=process.argv.includes('--check');
const text=await readFile(name,'utf8'),eol=text.includes('\r\n')?'\r\n':'\n';
const order=text.split(/\r?\n/).filter(Boolean).map(line=>line.slice(66));
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(path=>path&&path!==name);
const present=new Set(tracked),compare=(a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0;
const paths=order.filter(path=>present.has(path));
for(const path of tracked.filter(path=>!order.includes(path)).sort(compare)){
 const at=paths.findIndex(existing=>compare(existing,path)>0);
 if(at<0)paths.push(path);else paths.splice(at,0,path);
}
const hash=path=>createHash('sha256').update(execFileSync('git',['show',':'+path],{maxBuffer:1<<28})).digest('hex');
const next=paths.map(path=>hash(path)+'  '+path).join(eol)+eol;
if(check){if(next!==text){console.error('FAIL '+name+' is stale; run: git add -A && node scripts/update-manifest.mjs');process.exit(1);}console.log('PASS file manifest matches the staged files');}
else{await writeFile(name,next);console.log('Updated '+name+' ('+paths.length+' files)');}
