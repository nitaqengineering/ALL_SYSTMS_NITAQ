const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync('supabase/functions/invite-workspace-user/index.ts','utf8')
 .replace(/^\uFEFF?import [^\r\n]*\r?\n/,'')
 .replace('(status: number, body: Record<string, unknown>)','(status, body)');

async function run({authorization='Bearer verified-user',origin='https://nitaq-coordination-cloud-check.elnoby448.chatgpt.site',
  appUrl='https://nitaq-coordination-cloud-check.elnoby448.chatgpt.site',userError=false,targetError=null,registered=false,body={email:'engineer@example.invalid'}}={}){
 let handler,sent=0,constructed=0,inviteOptions;
 const context=vm.createContext({
  Response,Request,URL,console,encodeURIComponent,
  Deno:{env:{get:key=>({NITAQ_PUBLIC_APP_URL:appUrl,SUPABASE_URL:'https://project.invalid',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test'})[key]},
    serve:fn=>{handler=fn}},
  createClient:(url,key)=>{
   constructed++;
   if(key==='server-test')return {auth:{admin:{inviteUserByEmail:async(email,options)=>{
    sent++;inviteOptions={email,...options};return {error:null};
   }}}};
   return {auth:{getUser:async()=>({error:userError?{message:'invalid'}:null,data:{user:userError?null:{id:'verified-manager'}}})},
    rpc:async()=>({error:targetError,data:{email:body.email,name:'Engineer',registered}})};
  }
 });
 vm.runInContext(source,context);
 const response=await handler(new Request('https://project.invalid/functions/v1/invite-workspace-user',{
  method:'POST',headers:{authorization,origin,'Content-Type':'application/json'},body:JSON.stringify(body)
 }));
 return {status:response.status,data:await response.json(),sent,constructed,inviteOptions};
}
(async()=>{
 assert.equal((await run({appUrl:''})).status,503);
 assert.equal((await run({appUrl:'javascript:alert(1)'})).sent,0);
 assert.equal((await run({authorization:''})).status,401);
 assert.equal((await run({userError:true})).sent,0);
 const denied=await run({targetError:{code:'42501',message:'Denied'}});
 assert.equal(denied.status,403);assert.equal(denied.sent,0);assert.equal(denied.constructed,1);
 const known=await run({registered:true});
 assert.equal(known.data.result,'already_registered');assert.equal(known.sent,0);
 const invited=await run();
 assert.equal(invited.status,200);assert.equal(invited.sent,1);
 assert.equal(invited.inviteOptions.redirectTo,
  'https://nitaq-coordination-cloud-check.elnoby448.chatgpt.site/engineering/index.html?onboard=1&email=engineer%40example.invalid');
 const pages=await run({appUrl:'https://example.github.io/nitaq-systems/',origin:'https://example.github.io'});
 assert.equal(pages.status,200);
 assert.equal(pages.inviteOptions.redirectTo,'https://example.github.io/nitaq-systems/engineering/index.html?onboard=1&email=engineer%40example.invalid');
 assert.equal((await run({origin:'https://untrusted.invalid'})).status,403);
 const workspace=readFileSync('public/engineering/shared-workspace.js','utf8').replace(/\r\n?/g,'\n');
 const recoverySource=workspace.slice(workspace.indexOf('async function offerWorkspacePasswordReset('),workspace.indexOf("document.addEventListener('click',event=>{\n  const button=event.target.closest('[data-invite-user]');"));
 let approved=false,recoveryCalls=0,recoveryRequest,providerError=false;
 const recovery=vm.createContext({URL,location:{href:'https://example.github.io/nitaq-systems/engineering/index.html#engineering'},confirm:()=>approved,toast:()=>{},
  client:{auth:{resetPasswordForEmail:async(email,options)=>{recoveryCalls++;recoveryRequest={email,...options};return {error:providerError?{message:'rate limited'}:null}}}},user:{email:'engineer@example.invalid'}});
 vm.runInContext(recoverySource,recovery);
 await vm.runInContext('offerWorkspacePasswordReset(client,user)',recovery);
 assert.equal(recoveryCalls,0,'Declining recovery must never send email');
 approved=true;
 await vm.runInContext('offerWorkspacePasswordReset(client,user)',recovery);
 assert.equal(recoveryCalls,1);
 assert.equal(recoveryRequest.email,'engineer@example.invalid');
 assert.equal(recoveryRequest.redirectTo,'https://example.github.io/nitaq-systems/engineering/index.html?onboard=1');
 providerError=true;
 await assert.rejects(vm.runInContext('offerWorkspacePasswordReset(client,user)',recovery),/تعيين كلمة المرور/);
 assert.ok(workspace.includes('await offerWorkspacePasswordReset(client,user);'));
 console.log('PASS existing-account recovery: explicit confirmation, no mail on cancel, correct Pages onboarding URL, provider failures visible; no live emails');
 console.log('PASS invitation handler: token verification, manager gate, existing-account handling, fixed redirect, CORS; no live emails');
})().catch(error=>{console.error(error);process.exitCode=1});
