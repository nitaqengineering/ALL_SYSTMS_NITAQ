// Proves the deployment gate itself: it must stop when save_v2 is absent and pass once it exists.
// A local stand-in answers like PostgREST; no company database is contacted.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const contract=JSON.parse(await readFile('database/frontend-contract.json','utf8'));
const known=new Set(Object.values(contract.projects).flatMap(p=>[...p.functions.map(f=>'/rest/v1/rpc/'+f.name),...p.tables.map(t=>'/rest/v1/'+t.name),...p.edgeFunctions.map(e=>'/functions/v1/'+e.name)]));
let absent=new Set();
const server=http.createServer((request,response)=>{
 const path=new URL(request.url,'http://local').pathname;
 const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(body));};
 if(!known.has(path)||absent.has(path))return send(404,path.startsWith('/functions/')?{message:'Function not found'}:{code:path.includes('/rpc/')?'PGRST202':'PGRST205',message:'Could not find '+path+' in the schema cache'});
 if(path.startsWith('/functions/'))return send(401,{message:'Missing authorization header'});
 send(401,{code:'42501',message:'permission denied for '+(path.includes('/rpc/')?'function':'table')+' '+path.split('/').pop()});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
function gate(...flags){return new Promise(resolve=>{let output='';const child=spawn(process.execPath,['scripts/check-live-contract.mjs','--live',...flags],{env:{...process.env,NITAQ_CONTRACT_BASE_ACCOUNTING:base,NITAQ_CONTRACT_BASE_CRM:base}});
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>resolve({code,output}));});}
try{
 const v2='/rest/v1/rpc/nitaq_engineering_workspace_save_v2',v1='/rest/v1/rpc/nitaq_engineering_workspace_save_v1';
 absent=new Set([v2]);
 let result=await gate();
 assert.equal(result.code,1,result.output);assert.match(result.output,/nitaq_engineering_workspace_save_v2" is MISSING/);assert.match(result.output,/20261109_012_atomic_large_save\.sql/);
 result=await gate('--allow-fallback');assert.equal(result.code,0,result.output);assert.match(result.output,/WARN .*save_v2/);
 absent=new Set([v2,v1]);result=await gate('--allow-fallback');assert.equal(result.code,1,result.output);
 absent=new Set(['/rest/v1/rpc/nitaq_crm_apply_v2']);result=await gate('--allow-fallback');assert.equal(result.code,1,result.output);assert.match(result.output,/20261109_001_safe_mutations\.sql/);
 absent=new Set(['/functions/v1/invite-workspace-user']);result=await gate();assert.equal(result.code,1,result.output);
 absent=new Set();result=await gate();assert.equal(result.code,0,result.output);assert.doesNotMatch(result.output,/WARN|FAIL/);
 console.log('PASS deployment gate: stops and names the SQL file when save_v2 or another dependency is missing; passes once the database has it');
}finally{server.close();}
