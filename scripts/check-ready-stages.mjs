import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile('public/engineering/app.js','utf8');
const ctx=vm.createContext({db:{custom:{electric:['READY','SPECIAL'],design:['READY']}},document:{addEventListener(){}},managerPreview:()=>true,persist(){throw Error('Built-in status must not be deleted');}});
vm.runInContext(app.slice(app.indexOf('const standard='),app.indexOf('const projectTypes='))+
 app.slice(app.indexOf('const labels='),app.indexOf('function fresh()'))+
 app.slice(app.indexOf('function states('),app.indexOf('function projectAssignedTo('))+
 app.slice(app.indexOf('function normalizeCoordination('),app.indexOf('function migrateCoordination('))+
 app.slice(app.indexOf('const coordLabels='),app.indexOf('function opts(')),ctx);
for(const key of vm.runInContext('[...keys]',ctx)){
 const values=vm.runInContext(`states(${JSON.stringify(key)})`,ctx);
 assert.equal(values.filter(v=>v==='READY').length,key==='design'?0:1,key+': READY once in every non-design dropdown');
}
assert.equal(vm.runInContext("stateLabel('planning','READY')",ctx),'جاهز للتقديم');
assert.equal(vm.runInContext("stateLabel('coordination','READY')",ctx),'جاهز للمطابقة والمراجعة');
const project={stages:{design:{status:'REQ'},coordination:{status:'READY'},tender:{status:'READY'}}};
ctx.fixture={projects:[project]};assert.equal(vm.runInContext('normalizeCoordination(fixture)',ctx),false);assert.equal(project.stages.coordination.status,'READY','load/restore must not normalize READY back to REQ');
vm.runInContext(await readFile('public/engineering/status-admin.js','utf8'),ctx);
vm.runInContext("statusMgrStage='electric';statusMgrDelete('READY')",ctx);assert.ok(ctx.db.custom.electric.includes('READY'),'promoted built-in cannot be removed through the old custom-delete path');
// The same states() feeds inline selectors, details forms and stage status filters.
assert.ok(app.includes("inlineOptions(stageStates(p,k),s.status)"));assert.ok(app.includes("opts(!k?[]:k==='permit'"));
console.log('PASS READY UI: all non-design stages including coordination, no duplicates with old custom READY, built-in deletion guard, meaning, restore normalization and shared dropdown/filter source');

for(const key of vm.runInContext('[...keys]',ctx)){
 const values=vm.runInContext(`states(${JSON.stringify(key)})`,ctx);
 assert.equal(values.filter(v=>v==='rev').length,['design','coordination'].includes(key)?0:1);
}
assert.equal(vm.runInContext("stateLabel('planning','rev')",ctx),'المخططات تحتاج مراجعة');
console.log('PASS rev UI: one built-in option per drafting stage, shared dropdown/filter source and Arabic meaning');
