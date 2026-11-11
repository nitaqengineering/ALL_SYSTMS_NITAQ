// Exercises scripts/backup-store.mjs against a local stand-in for Supabase Storage. No real project is contacted.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const objects=new Map();let corrupt=false,refuseKey=false;
const day=86400000,age=days=>new Date(Date.now()-days*day).toISOString();
const server=http.createServer((request,response)=>{
 const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
  const body=Buffer.concat(chunks),path=decodeURIComponent(new URL(request.url,'http://local').pathname.replace('/storage/v1/',''));
  const send=(status,data,type='application/json')=>{response.writeHead(status,{'Content-Type':type});response.end(data);};
  if(request.headers.authorization!=='Bearer test-service-key'||refuseKey)return send(403,'{"message":"denied"}');
  if(request.method==='POST'&&path.startsWith('object/list/')){const {prefix}=JSON.parse(body);return send(200,JSON.stringify([...objects].filter(([name])=>name.startsWith('nitaq-backups/'+prefix)).map(([name,value])=>({name:name.split('/').pop(),created_at:value.created_at}))));}
  if(request.method==='POST'&&path.startsWith('object/')){const name=path.slice(7);if(objects.has(name))return send(409,'{"message":"exists"}');objects.set(name,{data:body,created_at:new Date().toISOString()});return send(200,'{}');}
  if(request.method==='GET'&&path.startsWith('object/')){const item=objects.get(path.slice(7));if(!item)return send(404,'{}');return send(200,corrupt?Buffer.concat([item.data,Buffer.from('x')]):item.data,'application/octet-stream');}
  if(request.method==='DELETE'&&path==='object/nitaq-backups'){for(const prefix of JSON.parse(body).prefixes)objects.delete('nitaq-backups/'+prefix);return send(200,'[]');}
  send(400,'{}');
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,dir=await mkdtemp(join(tmpdir(),'nitaq-store-'));
const store=(file,folder,env={})=>new Promise(resolve=>{let output='';const child=spawn(process.execPath,['scripts/backup-store.mjs',file,folder],{env:{...process.env,STORAGE_URL:base,STORAGE_KEY:'test-service-key',...env}});
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>resolve({code,output}));});
try{
 const encrypted=Buffer.concat([Buffer.from([0x8c,0x0d,0x04,0x09]),randomBytes(4096)]);
 const make=async(name,data=encrypted)=>{const path=join(dir,name);await writeFile(path,data);return path;};
 // Existing history: recent ones, old ones, and a foreign file that must never be touched.
 for(let i=1;i<=20;i++)objects.set('nitaq-backups/accounting/nitaq-backup-accounting-old'+String(i).padStart(2,'0')+'.tar.gz.gpg',{data:encrypted,created_at:age(i*10)});
 objects.set('nitaq-backups/accounting/notes.txt',{data:Buffer.from('keep'),created_at:age(400)});
 objects.set('nitaq-backups/crm/nitaq-backup-crm-old.tar.gz.gpg',{data:encrypted,created_at:age(400)});
 let result=await store(await make('nitaq-backup-accounting-20261112-0210.tar.gz.gpg'),'accounting');
 assert.equal(result.code,0,result.output);
 assert.ok(objects.get('nitaq-backups/accounting/nitaq-backup-accounting-20261112-0210.tar.gz.gpg').data.equals(encrypted));
 const left=[...objects.keys()].filter(name=>name.startsWith('nitaq-backups/accounting/nitaq-backup-'));
 // Newest 14 are always kept; beyond those, only files older than 90 days go (old10..old20 are 100-200 days old, old14+ fall outside the newest 14).
 assert.ok(left.includes('nitaq-backups/accounting/nitaq-backup-accounting-old09.tar.gz.gpg'));
 assert.ok(left.includes('nitaq-backups/accounting/nitaq-backup-accounting-old13.tar.gz.gpg'),'newest 14 are kept even when old');
 assert.ok(!left.includes('nitaq-backups/accounting/nitaq-backup-accounting-old14.tar.gz.gpg'));
 assert.ok(!left.includes('nitaq-backups/accounting/nitaq-backup-accounting-old20.tar.gz.gpg'));
 assert.ok(objects.has('nitaq-backups/accounting/notes.txt')&&objects.has('nitaq-backups/crm/nitaq-backup-crm-old.tar.gz.gpg'),'other files and folders are untouched');
 // Same name is never overwritten.
 result=await store(await make('nitaq-backup-accounting-20261112-0210.tar.gz.gpg'),'accounting');assert.equal(result.code,1);
 // A stored copy that differs fails the run.
 corrupt=true;result=await store(await make('nitaq-backup-accounting-20261113-0210.tar.gz.gpg'),'accounting');assert.equal(result.code,1);assert.match(result.output,/differs/);corrupt=false;
 // Unencrypted or misnamed files are refused before any upload.
 const before=objects.size;
 result=await store(await make('nitaq-backup-accounting-20261114-0210.tar.gz.gpg',Buffer.concat([Buffer.from([0x1f,0x8b]),randomBytes(200)])),'accounting');assert.equal(result.code,1);assert.match(result.output,/encrypted/);
 result=await store(await make('accounting.dump',Buffer.concat([Buffer.from('PGDMP'),randomBytes(200)])),'accounting');assert.equal(result.code,1);
 assert.equal(objects.size,before);
 // Wrong key is reported without printing it.
 refuseKey=true;result=await store(await make('nitaq-backup-accounting-20261115-0210.tar.gz.gpg'),'accounting');assert.equal(result.code,1);assert.ok(!result.output.includes('test-service-key'));refuseKey=false;
 console.log('PASS backup storage: upload verified byte for byte, no overwrite, unencrypted files refused, retention keeps the newest 14 and other files');
}finally{server.close();await rm(dir,{recursive:true,force:true});}
