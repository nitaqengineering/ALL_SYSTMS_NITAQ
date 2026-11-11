// Pre-deployment gate: the frontends must not be published against a database that lacks what they call.
//   node scripts/check-live-contract.mjs                 static only (every frontend call is declared)
//   node scripts/check-live-contract.mjs --live          also asks the live Supabase projects
//   node scripts/check-live-contract.mjs --live --allow-fallback   a missing entry with a declared fallback only warns
// The live probe is read-only: it uses the public publishable key shipped in the frontend, sends null
// arguments, and relies on PostgREST answering PGRST202/PGRST205 when a function/table is absent.
// Optional dedicated TEST accounts (never a team member's password) prove the signed-in role may execute:
//   NITAQ_CONTRACT_ACCOUNTING_EMAIL / _PASSWORD and NITAQ_CONTRACT_CRM_EMAIL / _PASSWORD
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const live=process.argv.includes('--live'),allowFallback=process.argv.includes('--allow-fallback');
const contract=JSON.parse(await readFile('database/frontend-contract.json','utf8'));

// 1) Static: every rpc(), from() and functions.invoke() in the shipped sources is declared.
const sources={accounting:['src/accounting.jsx','public/crm/index.html',...(await readdir('public/engineering')).filter(f=>f.endsWith('.js')&&!f.startsWith('fflate')).map(f=>'public/engineering/'+f)],crm:['src/crm.jsx','public/crm/safety.js']};
const used={};
for(const [project,files] of Object.entries(sources)){
 used[project]={functions:new Set(),tables:new Set(),edgeFunctions:new Set()};
 for(const file of files){
  const text=await readFile(file,'utf8');
  for(const m of text.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g))used[project].functions.add(m[1]);
  for(const m of text.matchAll(/\.from\(\s*'([a-z0-9_]+)'\s*\)/g))used[project].tables.add(m[1]);
  for(const m of text.matchAll(/functions\.invoke\(\s*'([a-z0-9-]+)'/g))used[project].edgeFunctions.add(m[1]);
 }
 for(const kind of ['functions','tables','edgeFunctions']){
  const declared=new Set(contract.projects[project][kind].map(item=>item.name));
  for(const name of used[project][kind])assert.ok(declared.has(name),`${project}: frontend uses ${kind.slice(0,-1)} "${name}" that is not declared in database/frontend-contract.json`);
  for(const item of contract.projects[project][kind])if(item.frontend!==false)assert.ok(used[project][kind].has(item.name),`${project}: contract lists unused ${kind.slice(0,-1)} "${item.name}"`);
 }
 for(const item of contract.projects[project].functions)if(item.fallback)assert.ok(contract.projects[project].functions.some(other=>other.name===item.fallback),'Unknown fallback '+item.fallback);
}
console.log('PASS database contract: every frontend function, table and edge function call is declared');
if(!live)process.exit(0);

// 2) Live: ask each project.
function classify(kind,status,body){
 const code=body?.code||'',message=body?.message||'';
 if(kind==='edge'){
  if(status===404)return 'missing';
  if(status>=200&&status<300||status===400&&body?.error==='A valid email is required'||status===401&&body?.error==='Sign in first')return 'present';
  return 'unknown';
 }
 if(code==='PGRST202'||code==='PGRST205'||code==='42883'||code==='42P01')return 'missing';
 if(status>=500||status===0)return 'unknown';
 if(code==='42501'&&/permission denied for (function|table|schema)/.test(message))return 'present-denied';
 if(status>=200&&status<300)return 'present-executable';
 if(status===400&&['22023','22P02','23502'].includes(code))return 'present-executable';
 if(['42501','P0001','28000'].includes(code)&&message)return 'present-denied';
 return 'unknown';
}
async function ask(url,init){
 try{const response=await fetch(url,{...init,signal:AbortSignal.timeout(20000)});let body=null;try{body=await response.json();}catch{}return {status:response.status,body};}
 catch(error){return {status:0,body:{message:String(error.message||error)}};}
}
const problems=[],warnings=[];
for(const [project,spec] of Object.entries(contract.projects)){
 const config=await readFile(spec.config,'utf8');
 // NITAQ_CONTRACT_BASE_<PROJECT> points the probe at a local stand-in; used only by scripts/check-contract-gate.mjs.
 const base=process.env['NITAQ_CONTRACT_BASE_'+project.toUpperCase()]||(config.match(/https:\/\/[a-z0-9]+\.supabase\.co/)||[])[0],key=(config.match(/sb_publishable_[A-Za-z0-9_-]+/)||[])[0];
 assert.ok(base&&key,'Public Supabase URL/key not found in '+spec.config);
 const headers={apikey:key,'Content-Type':'application/json'};
 let token=null;const prefix='NITAQ_CONTRACT_'+project.toUpperCase()+'_';
 if(process.env[prefix+'EMAIL']&&process.env[prefix+'PASSWORD']){
  const login=await ask(base+'/auth/v1/token?grant_type=password',{method:'POST',headers,body:JSON.stringify({email:process.env[prefix+'EMAIL'],password:process.env[prefix+'PASSWORD']})});
  if(!login.body?.access_token){problems.push(`${project}: test account sign-in failed (HTTP ${login.status}); fix the ${prefix}* secrets`);}
  else token=login.body.access_token;
 }
 const missing=new Set();
 const record=(item,label,state)=>{
  if(state==='missing'){missing.add(item.name);const text=`${project}: ${label} "${item.name}" is MISSING on the live database. Apply: ${item.migration}`;
   if(item.fallback&&allowFallback)warnings.push(text+` (deployment allowed: frontend falls back to ${item.fallback})`);else problems.push(text);}
  else if(state==='unknown')problems.push(`${project}: could not confirm ${label} "${item.name}" (network or server error); not deploying on an unconfirmed database`);
 };
 for(const item of spec.functions){
  const body=JSON.stringify(Object.fromEntries(item.params.map(name=>[name,null])));
  const anon=await ask(base+'/rest/v1/rpc/'+item.name,{method:'POST',headers,body});
  const state=classify('function',anon.status,anon.body);record(item,'function',state);
  if(state==='present-executable'&&/42501|P0001|22023|28000/.test(anon.body?.code||'')===false&&anon.status<300)warnings.push(`${project}: function "${item.name}" answered an anonymous caller (HTTP ${anon.status}); review its grants`);
  if(token&&state!=='missing'&&state!=='unknown'){
   const signed=await ask(base+'/rest/v1/rpc/'+item.name,{method:'POST',headers:{...headers,Authorization:'Bearer '+token},body});
   if(classify('function',signed.status,signed.body)!=='present-executable')problems.push(`${project}: signed-in test account executable access to "${item.name}" was not confirmed (HTTP ${signed.status}). Review role, service health and: ${item.migration}`);
  }
 }
 for(const item of spec.functions)if(item.fallback&&missing.has(item.name)&&missing.has(item.fallback))problems.push(`${project}: both "${item.name}" and its fallback "${item.fallback}" are missing`);
 for(const item of spec.tables){
  const reply=await ask(base+'/rest/v1/'+item.name+'?select='+item.column+'&limit=0',{headers});
  record(item,'table',classify('table',reply.status,reply.body));
 }
 for(const item of spec.edgeFunctions){
  const reply=await ask(base+'/functions/v1/'+item.name,{method:'POST',headers:token?{...headers,Authorization:'Bearer '+token}:headers,body:'{}'});
  record(item,'edge function',reply.status===0||reply.status>=500?'unknown':classify('edge',reply.status,reply.body));
 }
}
for(const text of warnings)console.log('WARN '+text);
if(problems.length){for(const text of problems)console.error('FAIL '+text);console.error('Deployment stopped: the live database is not ready for this frontend.');process.exit(1);}
console.log('PASS live database contract: all functions, tables and edge functions the frontend needs are present'+(warnings.length?' (with '+warnings.length+' warning)':''));
