import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative,join,extname} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve('.');
async function walk(dir){const files=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const files=await walk(join(root,'public'));
for(const name of ['index.html','accounting/index.html','crm/index.html','engineering/index.html','studio/index.html'])assert.ok((await stat(join(root,'public',name))).size>0);
let checked=0;
for(const file of files){
 if(!['.js','.html','.css'].includes(extname(file)))continue;
 const text=await readFile(file,'utf8');
 assert.ok(!/sb_secret_[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\//.test(text),'Forbidden credential in '+relative(root,file));
 for(const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
   const claims=JSON.parse(Buffer.from(token[0].split('.')[1],'base64url').toString());
   assert.equal(claims.role,'anon','Non-public JWT in '+relative(root,file));
 }
 if(extname(file)==='.js'){new vm.Script(text,{filename:relative(root,file)});checked++;}
}
const prepared=await readFile('public/engineering/accounting-projects.js','utf8');
assert.ok(prepared.includes('projects: []'),'Customer snapshot must not be shipped');
const html=await readFile('public/engineering/index.html','utf8');
assert.ok(html.indexOf('window.NITAQ_REQUIRE_SHARED=true')<html.search(/src="app\.js(?:\?[^"]*)?"/),'Cloud gate flag must precede application startup');
console.log('PASS package: four systems, '+files.length+' assets, '+checked+' JS files parsed, no private credential patterns, customer preview removed, cloud startup flag checked');
