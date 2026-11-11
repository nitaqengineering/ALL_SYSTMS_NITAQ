// One exported snapshot for application data, Auth tables and verification counts.
import pg from 'pg';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const [name,url,out]=process.argv.slice(2);
if(!/^[a-z][a-z0-9_-]*$/.test(name||'')||!url||!out)throw Error('Invalid backup arguments');
await mkdir(out,{recursive:true});
const c=new pg.Client({connectionString:url});await c.connect();
function dump(args){return new Promise((resolve,reject)=>{const child=spawn('pg_dump',['--dbname='+url,...args],{stdio:['ignore','ignore','pipe'],windowsHide:true});let stderr='';child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('pg_dump failed; backup not complete (exit '+code+')')));});}
try{
 await c.query('begin isolation level repeatable read read only');
 const snapshot=(await c.query('select pg_export_snapshot() id')).rows[0].id;
 const common=['--snapshot='+snapshot,'--format=custom','--no-owner'];
 await dump([...common,'--schema=public','--schema=nitaq_*','--exclude-schema=nitaq_backup_*','--file='+join(out,name+'.dump')]);
 await dump([...common,'--table=auth.users','--table=auth.identities','--file='+join(out,name+'-auth.dump')]);
 const triggers=(await c.query("select pg_get_triggerdef(t.oid)||';' ddl from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal order by 1")).rows;
 await writeFile(join(out,name+'-auth-triggers.sql'),triggers.map(r=>r.ddl).join('\n')+'\n');
 const counts=(await c.query(await readFile(new URL('./backup-counts.sql',import.meta.url),'utf8'))).rows;
 if(!counts.length)throw Error('Refusing empty backup');
 await writeFile(join(out,name+'.counts'),counts.map(r=>Object.values(r)[0]).join('\n')+'\n');
 const structure=(await c.query(await readFile(new URL('./backup-structure.sql',import.meta.url),'utf8'))).rows;
 await writeFile(join(out,name+'.structure'),structure.map(r=>Object.values(r)[0]).join('\n')+'\n');
 await c.query('commit');
 console.log(name+': consistent application and Auth snapshot; '+counts.length+' tables counted');
}finally{await c.end();}
