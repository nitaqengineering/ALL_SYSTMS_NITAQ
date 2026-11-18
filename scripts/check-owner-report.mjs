// Generate the shipped bilingual report through its public entry point; no company data.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile('public/engineering/report.js','utf8');
const keys=['design','planning','coordination','electric','water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender'];
const project={id:'synthetic-report',name:'Synthetic owner',service:'SEWA',contract:false,info:{},workflow:{},stages:Object.fromEntries(keys.map(k=>[k,{status:'REQ',date:'',note:''}]))};
let blob;
const sandbox={projects:[project],keys,Blob,URL:{createObjectURL:b=>(blob=b,'blob:synthetic'),revokeObjectURL(){}},location:{href:'https://example.invalid/engineering/index.html'},window:{open:()=>({})},setTimeout(){},today:()=> '2030-01-01',permit:()=> 'بانتظار المتطلبات',columnTitle:k=>k,esc:s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
vm.runInNewContext(source,sandbox);
async function generate(){sandbox.window.openOwnerReport(project.id);return blob.text();}
function selected(html,status){return (html.match(/<select class="stsel[^>]*>[\s\S]*?<\/select>/g)||[]).filter(s=>s.includes(`value="${status}" selected`));}
for(const [status,ar,en,colour] of [['dwg','جارٍ العمل على المخططات','Drafting','s-work'],['SUB COM','إعادة تقديم الملاحظات','Resubmitted','s-sub']]){
 project.stages.design.status=status;project.stages.tender.status=status;
 for(const k of ['electric','water','gas'])project.stages[k].status=status;
 const html=await generate();
 const rows=selected(html,status);
 assert.ok(rows.length>=8,'drawing, grouped utilities and tender preserve the status in both languages');
 assert.ok(rows.every(s=>s.startsWith(`<select class="stsel ${colour}"`)));
 assert.ok(rows.some(s=>s.includes(ar)));assert.ok(rows.some(s=>s.includes(en)));
 assert.match(html,new RegExp(`value="${status}" selected`));
 assert.ok(html.includes(`{c:"${colour}",t:"${ar}"}`)||html.includes(`"c":"${colour}","t":"${ar}"`),'legend contains the translated status');
 const embedded=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const interactive={window:{addEventListener(){}},document:{},setTimeout(){}};
 vm.runInNewContext(embedded,interactive);vm.runInNewContext('syncWA=function(){}',interactive);
 const select={value:status};interactive.stChange(select);assert.equal(select.className,'stsel '+colour);
 if(status==='SUB COM')assert.match(html,/data-sec="tender"[\s\S]*?50%/);
}
project.stages.electric.status='COM';
assert.ok(selected(await generate(),'COM').length>=4,'unresolved comments retain priority over resubmission in a grouped report');
for(const k of ['electric','water','gas'])project.stages[k].status='DONE';
assert.ok(selected(await generate(),'OK').length>=4,'completed grouped stages do not regress to in progress');
console.log('PASS owner reports: dwg/SUB COM selected and translated in Arabic/English, grouping, tender progress, legend and interactive colours; HTML generation only');

// Custom statuses must remain selected, never silently become the first standard option (OK).
for(const custom of ['INSP','فحص خاص','x"<unsafe>&']){
 project.stages.struct.status=custom;project.stages.tender.status=custom;
 const html=await generate(),encoded=sandbox.esc(custom),rows=selected(html,encoded);
 assert.equal(rows.length,4,'single drawing and tender each preserve the custom value in both languages');
 assert.ok(rows.every(row=>row.includes(`value="${encoded}" selected>${encoded}</option>`)));
 assert.ok(rows.every(row=>!row.includes('value="OK" selected')));
}
sandbox.statusMeaning=code=>code==='INSP'?'معاينة خاصة':'';
project.stages.struct.status='INSP';assert.ok((await generate()).includes('value="INSP" selected>معاينة خاصة</option>'));
console.log('PASS custom report statuses: unknown values and optional meanings remain selected and HTML-escaped');
