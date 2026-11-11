// Stores one encrypted backup file in a PRIVATE Supabase Storage bucket, proves the stored copy is
// byte-identical, and removes copies older than the retention period (always keeping the newest ones).
//   STORAGE_URL=https://<ref>.supabase.co STORAGE_KEY=<service role key> node scripts/backup-store.mjs <file> <folder>
// Prints file names and sizes only. The service key is read from the environment and never printed.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
const [file,folder]=process.argv.slice(2);
const base=(process.env.STORAGE_URL||'').replace(/\/+$/,''),key=process.env.STORAGE_KEY||'';
const bucket=process.env.STORAGE_BUCKET||'nitaq-backups',keepDays=Number(process.env.KEEP_DAYS||90),keepNewest=Number(process.env.KEEP_NEWEST||14);
const fail=message=>{console.error('FAIL backup storage: '+message);process.exit(1);};
if(!file||!/^[a-z0-9-]+$/.test(folder||''))fail('usage: backup-store.mjs <file> <folder>');
if(!/^https?:\/\//.test(base)||!key)fail('STORAGE_URL and STORAGE_KEY are required');
const name=basename(file);
if(!/^nitaq-backup-[a-z0-9-]+\.tar\.gz\.gpg$/.test(name))fail('only encrypted nitaq-backup-*.tar.gz.gpg files are stored');
const body=await readFile(file);
// An OpenPGP symmetric-encrypted file never starts like a tar/gzip/pg_dump file; refuse anything unencrypted.
if(body.length<64||body.subarray(0,2).equals(Buffer.from([0x1f,0x8b]))||body.subarray(0,5).toString()==='PGDMP')fail(name+' does not look encrypted');
const headers={Authorization:'Bearer '+key,apikey:key};
const call=async(method,path,options={})=>{const response=await fetch(base+'/storage/v1/'+path,{method,headers:{...headers,...options.headers},body:options.body,signal:AbortSignal.timeout(120000)});return response;};
const object=bucket+'/'+folder+'/'+name;
const upload=await call('POST','object/'+object,{headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body});
if(!upload.ok)fail('upload of '+name+' was refused (HTTP '+upload.status+'). Check the bucket "'+bucket+'" exists and the service key belongs to this project.');
const stored=await call('GET','object/'+object);
if(!stored.ok)fail('stored copy of '+name+' could not be read back (HTTP '+stored.status+')');
const sha=data=>createHash('sha256').update(data).digest('hex');
if(sha(Buffer.from(await stored.arrayBuffer()))!==sha(body))fail('stored copy of '+name+' differs from the file that was uploaded');
// Retention: delete only our own backup files in this folder, older than keepDays, never the newest keepNewest.
const listing=await call('POST','object/list/'+bucket,{headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:folder+'/',limit:1000,sortBy:{column:'name',order:'desc'}})});
if(!listing.ok)fail('could not list stored backups (HTTP '+listing.status+')');
const items=(await listing.json()).filter(item=>/^nitaq-backup-[a-z0-9-]+\.tar\.gz\.gpg$/.test(item.name)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
const cutoff=Date.now()-keepDays*86400000;
const expired=items.slice(keepNewest).filter(item=>item.name!==name&&Date.parse(item.created_at)<cutoff);
if(expired.length){
 const removal=await call('DELETE','object/'+bucket,{headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:expired.map(item=>folder+'/'+item.name)})});
 if(!removal.ok)fail('old backups could not be removed (HTTP '+removal.status+')');
}
console.log('PASS stored '+folder+'/'+name+' ('+Math.round(body.length/1024)+' KB), read back identical; '+(items.length-expired.length)+' backups kept, '+expired.length+' older than '+keepDays+' days removed');
