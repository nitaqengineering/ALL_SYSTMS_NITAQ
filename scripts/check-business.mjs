import vm from 'node:vm';
import assert from 'node:assert/strict';
import {sourceOf} from './source-tools.mjs';
const path='public/';let checks=0;
const financial=await sourceOf(path+'accounting/index.html');
const crm=await sourceOf(path+'crm/index.html');
const studio=await sourceOf(path+'studio/index.html');
console.log('PASS full inline JavaScript/JSX parse: accounting, CRM and Studio ('+[financial,crm,studio].reduce((n,x)=>n+x.scripts.length,0)+' scripts)');
function context(source,names,extras={}){const c=vm.createContext({console,Date,Intl,JSON,Math,Set,Map,...extras});vm.runInContext(names.map(n=>source.extract(n)).join('\n'),c);return c;}
const finance=context(financial,['paymentControl','isArchived','collectedOf','remainderOf','vatRateOf','grossFactor','expVatRate','expGross','incVatRate','incGross','OWN_BANK','isDebtExpense','computeCashFlows'],{todayISO:()=> '2026-11-09',fmtMonth:x=>x});
function f(code,args={}){Object.assign(finance,args);return vm.runInContext(code,finance)}
function test(name,fn){fn();checks++;console.log('PASS '+name)}
test('Payment collection validation and protected corrections',()=>{
 const unpaid={id:'p',amount:100,status:'معلقة',projectId:'a',contractId:'c'};
 assert.ok(f('paymentControl(before,after).error',{before:unpaid,after:{...unpaid,amount:-1}}));
 assert.ok(f('paymentControl(before,after).error',{before:unpaid,after:{...unpaid,status:'مدفوعة جزئياً',collectedAmount:101}}));
 assert.ok(f('paymentControl(before,after).error',{before:unpaid,after:{...unpaid,status:'مدفوعة'}}));
 const paid={...unpaid,status:'مدفوعة',paidDate:'2026-11-09',method:'نقداً',account:'الخزينة'};
 assert.equal(f('paymentControl(before,after).error',{before:unpaid,after:paid}),undefined);
 assert.equal(f('paymentControl(before,after).correction',{before:paid,after:{...paid,amount:90}}),true);
 assert.ok(f('paymentControl(before,after).error',{before:paid,after:{...paid,archived:true}}));
 assert.ok(f('paymentControl(before,after,"delete").error',{before:paid,after:paid}));
});
const empty=()=>({projects:[],payments:[],govFees:[],officeExpenses:[],projectCosts:[],treasury:[],advances:[],employees:[],otherIncome:[]});
test('Partial collections, tax and bank/cash transfers reconcile',()=>{
 const data=empty();data.payments=[{amount:1000,collectedAmount:200,status:'مدفوعة جزئياً',taxable:'خاضعة',method:'نقداً',date:'2026-11-09'},{amount:300,status:'مدفوعة',taxable:'غير خاضعة',account:'البنك',date:'2026-11-09'},{amount:999,status:'مدفوعة',archived:true,date:'2026-11-09'}];
 data.treasury=[{type:'تحويل',amount:100,account:'الخزينة',toAccount:'البنك',date:'2026-11-09'}];
 const result=f('computeCashFlows(data)',{data});assert.equal(result.cash,110);assert.equal(result.bank,400);assert.equal(result.cash+result.bank,510);
});
test('Archived treasury transactions never affect cash balances',()=>{
 const data=empty();data.treasury=[{type:'قبض',amount:500,account:'الخزينة',archived:true,date:'2026-11-09'}];assert.equal(f('computeCashFlows(data).cash',{data}),0);
});
const c=context(crm,['BASE_PERMS','can','canEdit','assignedTo']);
test('CRM visibility permission does not grant edit permission in UI',()=>{
 c.user={id:'me',role:'engineer',perms:{seeAll:true}};c.lead={ownerId:'other',engineerId:'other'};
 assert.equal(vm.runInContext('canEdit(user,lead)',c),false);
 c.user.perms.editAll=true;assert.equal(vm.runInContext('canEdit(user,lead)',c),true);
 c.user.perms.editAll=false;c.lead.engineerId='me';assert.equal(vm.runInContext('canEdit(user,lead)',c),true);
});
const studioLocal=new Map();
const sc=context(studio,['PROJECT_IDENTITY_FIELDS','PROJECT_IDENTITY_KEY','PROJECT_COLLECTION_KEY','cleanProjectIdentity','parseProjectFile','readProjectIdentity','newProjectId','readProjectCollection'],{localStorage:{getItem:key=>studioLocal.get(key)||null},crypto:{randomUUID:()=> 'test-project-id'}});
test('Studio project import validation',()=>{
 sc.value={name:'Project',materials:'Stone',floors:'G+1',lighting:'Day',fixed:'Keep design'};
 const cleaned=vm.runInContext('cleanProjectIdentity(value)',sc);assert.equal(cleaned.name,'Project');
 sc.raw=JSON.stringify({format:'nitaq-project',version:1,identity:sc.value});assert.equal(vm.runInContext('parseProjectFile(raw).name',sc),'Project');
 sc.raw=JSON.stringify({format:'other',version:1,identity:sc.value});assert.throws(()=>vm.runInContext('parseProjectFile(raw)',sc));
});


test('Studio corrupt collections are protected instead of silently normalized',()=>{
 studioLocal.set('nitaq-projects-v1',JSON.stringify({version:1,projects:[{uid:'one',identity:[]}],activeId:'one'}));
 assert.equal(vm.runInContext('readProjectCollection().readError',sc),true);
 studioLocal.set('nitaq-projects-v1',JSON.stringify({version:1,projects:[{uid:'one',identity:{name:'Project',materials:'Stone',floors:'G+1',lighting:'Day',fixed:'Keep design'}}],activeId:'one'}));
 assert.equal(vm.runInContext('readProjectCollection().projects.length',sc),1);
});
test('All operational dates use Dubai at the UTC date boundary',()=>{
 class OfficeDate extends Date{constructor(...a){super(...(a.length?a:['2026-11-08T21:30:00Z']))}}
 for(const source of [financial,crm]){const c=context(source,['todayISO'],{Date:OfficeDate});assert.equal(vm.runInContext('todayISO()',c),'2026-11-09');}
});
test('Accounting and CRM source packages contain no business seed records',()=>{
 const f=context(financial,['seedData']);assert.equal(vm.runInContext('Object.values(seedData()).filter(Array.isArray).flat().length',f),0);
 const c=context(crm,['RAW']);assert.equal(vm.runInContext('RAW.length',c),0);
});
const persist=context(financial,['migrateData','NITAQ_PERSIST'],{window:{addEventListener(){}}});
test('Accounting imports validate income and timesheet fields',()=>{
 persist.bad={projects:[],otherIncome:[{id:'income',amount:'invalid'}]};assert.throws(()=>vm.runInContext('NITAQ_PERSIST.prepare(bad)',persist));
 persist.bad={projects:[],timesheets:[{id:'time',hours:'invalid'}]};assert.throws(()=>vm.runInContext('NITAQ_PERSIST.prepare(bad)',persist));
 persist.good={projects:[]};assert.equal(vm.runInContext('NITAQ_PERSIST.prepare(good).otherIncome.length',persist),0);
});
console.log('Total business regression groups passed: '+checks);

// Exercise the real CRM pagination function using a deterministic transport fixture.
const pages=context(crm,['fetchAllPages']);
let orderCalled=0;const rows=Array.from({length:2501},(_,i)=>({id:String(i).padStart(5,'0')}));
pages.sb={from(){let after=null,size=500;return {select(){return this},order(field,options){assert.equal(field,'id');assert.equal(options.ascending,true);orderCalled++;return this},limit(n){size=n;return this},gt(field,value){after=value;return this},then(resolve){return Promise.resolve({count:rows.length,data:rows.filter(r=>after===null||r.id>after).slice(0,size)}).then(resolve)}}}};
const paginated=await vm.runInContext("fetchAllPages(sb,'nitaq_crm_records')",pages);
assert.equal(paginated.data.length,2501);assert.equal(orderCalled,6);
console.log('PASS CRM ordered pagination loads 2501 rows over six keyset pages');
