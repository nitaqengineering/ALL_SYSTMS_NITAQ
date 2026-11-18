import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
let manager=true,counter=0;
const ctx=vm.createContext({managerPreview:()=>manager,stopped:p=>['HOLD','DONE'].includes(p.stages.design.status),people:['Engineer A','Engineer B'],today:()=> '2030-01-15',crypto:{randomUUID:()=>String(++counter)},document:{addEventListener(){}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(await readFile('public/engineering/supervision.js','utf8'),ctx);
const project={id:'sup-test',permit:'صدرت',stages:{design:{status:'OK'}},supervision:{status:'لم يبدأ',engineer:'Engineer A',note:'existing',legacyReference:'keep-me'}};
const visit={date:'2030-01-16',phase:'الحفر والأساسات',status:'مخططة',engineer:'Engineer A',result:'لم تسجل نتيجة',notes:'',report:'',action:'',actionOwner:'',due:'',followupStatus:'مفتوحة',completionNote:''};
const save=(values,id='')=>ctx.saveSupervisionVisit(project,id,values);
const reject=(values,pattern,id='')=>{const before=JSON.stringify(project);assert.throws(()=>save(values,id),pattern);assert.equal(JSON.stringify(project),before,'invalid changes must never partially modify the document');};
ctx.saveSupervisionSummary(project,{status:'جارٍ التنفيذ',engineer:'Engineer A',note:'General note'});
assert.equal(project.supervision.legacyReference,'keep-me');
assert.throws(()=>ctx.saveSupervisionSummary(project,{status:'جارٍ التنفيذ',engineer:'',note:''}),/حدد/);
const id=save(visit);assert.equal(project.supervision.visits.length,1);
assert.equal(ctx.supervisionNextVisit(project).id,id);
reject({...visit,date:'2030-02-30'},/تاريخ/);
reject({...visit,status:'منفذة',result:'بدون ملاحظات'},/مستقبلي/);
reject({...visit,date:'2030-01-14',status:'منفذة'},/نتيجة/);
reject({...visit,engineer:'Unknown'},/نشط/);
reject({...visit,status:'ملغاة'},/سبب/);
reject({...visit,notes:'x'.repeat(2001)},/الحد/);
const completed={...visit,date:'2030-01-14',status:'منفذة',result:'ملاحظات تحتاج متابعة',notes:'Check reinforcement',action:'Review site observation',actionOwner:'Engineer B',due:'2030-01-15'};
reject({...completed,actionOwner:''},/مسؤول/);
reject({...completed,due:'2030-01-13'},/يسبق/);
save(completed,id);assert.equal(project.supervision.visits.length,1,'edit updates the visit, never adds a duplicate');
assert.throws(()=>ctx.saveSupervisionSummary(project,{status:'مكتمل',engineer:'Engineer A',note:''}),/المتابعات/);
assert.equal(ctx.supervisionOverview(project).actions.length,1);assert.equal(ctx.supervisionOverview(project).late,0);
save({...completed,due:'2030-01-14'},id);assert.equal(ctx.supervisionOverview(project).late,1);assert.equal(ctx.supervisionIsLate(project),true);
reject({...completed,followupStatus:'منجزة'},/إغلاق/ ,id);
save({...completed,followupStatus:'منجزة',completionNote:'Observation addressed'},id);assert.equal(ctx.supervisionOpenActions(project).length,0);
assert.ok(project.supervision.visits[0].createdAt);assert.ok(project.supervision.visits[0].updatedAt);
save({...visit,date:'2030-01-20',status:'ملغاة',notes:'Site inaccessible'});
assert.equal(ctx.supervisionNextVisit(project),undefined,'cancelled visits do not appear as upcoming');
manager=false;reject(visit,/للمدير/);assert.equal(ctx.supervisionWritable(project),false);
manager=true;project.permit='بانتظار المتطلبات';reject(visit,/صدور/);project.permit='صدرت';project.stages.design.status='DONE';reject(visit,/الجارية/);project.stages.design.status='OK';
project.supervision.visits={bad:true};reject(visit,/مراجعة/);
project.supervision.visits=[];save({...completed,notes:'<script>alert(1)</script>',report:'javascript:alert(1)'});
const rows=ctx.supervisionVisitRows(project);assert.ok(rows[0][5].includes('&lt;script>'));assert.ok(!rows[0].join('').includes('href="javascript:'));
// Preserve existing input data when merely rendering or opening a summary.
const before=JSON.stringify(project);ctx.supervisionOverview(project);ctx.supervisionVisitRows(project);assert.equal(JSON.stringify(project),before);
console.log('PASS supervision: permit/manager/stopped gates, date validation, immutable failed edits, plan/complete/cancel visits, required follow-up, closure evidence, no duplicate edits, legacy fields and safe text output');

const exported=ctx.supervisionExportRows([project]);assert.equal(exported.length,2);assert.equal(exported[1][0],project.id);assert.equal(exported[1][11],'<script>alert(1)</script>');

// Exercise real view/form entry points against UI doubles (not browser layout QA).
let opened;const nodes=new Map();ctx.projects=[project];ctx.operationTable=(heads,rows)=>JSON.stringify({heads,rows});
ctx.toast=message=>{throw Error(message);};ctx.$=selector=>{if(!nodes.has(selector))nodes.set(selector,{open:false,close(){this.open=false;}});return nodes.get(selector);};
ctx.show=(title,sub,html,mode,id,k)=>{opened={title,sub,html,mode,id,k};};
ctx.field=()=>'';ctx.select=()=>'';ctx.paginateProjects=list=>list;
manager=false;ctx.openSupervisionFile(project.id);assert.equal(opened.mode,'documentHub');assert.ok(opened.html.includes('قراءة فقط'));assert.ok(!opened.html.includes('data-super-visit='));
manager=true;ctx.openSupervisionFile(project.id);assert.ok(opened.html.includes('data-super-visit='));
ctx.openSupervisionVisit(project.id);assert.equal(opened.mode,'supervisionVisit');assert.equal(nodes.get('#visit-date').required,true);
ctx.renderSupervision([project]);assert.equal(nodes.get('#gridViewport').hidden,true);assert.equal(nodes.get('#projectCards').hidden,false);assert.ok(nodes.get('#projectCards').innerHTML.includes('فتح ملف الإشراف'));
console.log('PASS supervision UI entry points: read-only file, manager controls, required visit fields and shared desktop/mobile cards');

project.supervision.visits=[];save({...visit,date:'2030-01-14'});assert.equal(ctx.supervisionIsLate(project),true,'past planned visits count as overdue');
project.stages.design.status='HOLD';assert.equal(ctx.supervisionIsLate(project),false,'stopped projects do not count as active overdue supervision');
