import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const app=await readFile('public/engineering/app.js','utf8');
const source=await readFile('public/engineering/project-print.js','utf8');
const dom=new Map(),checked=[];let output='',closed=false;
const ctx=vm.createContext({URL,location:{href:'https://example.invalid/engineering/index.html'},view:'projects',onlyMine:false,focusedProjectId:'',previewUser:'',projectPage:1,projectPageSize:50,opened:new Set(['municipal']),
 db:{columnLayout:{fields:{'field-ref':{title:'مرجع إضافي',group:'municipal',type:'number'}},order:['munStruct','field-ref','munArch','munSanitary']}},
 localStorage:{getItem:()=> '["services"]'},document:{addEventListener(){},getElementById:id=>dom.get('#'+id)||null,querySelectorAll:()=>checked},
 $:id=>dom.get(id),feeInfo:()=>'',stopped:p=>['HOLD','DONE'].includes(p.stages.design.status),stateLabel:(key,code)=>code==='READY'?'جاهز للتقديم':'مطلوب',permit:p=>p.permit,today:()=> '2030-01-01',
 window:{open:()=>({opener:{},document:{open(){},write(html){output=html;},close(){}}})},
 persist(){throw Error('Print must not write data');}});
const groups=app.slice(app.indexOf('const groups='),app.indexOf(';const people=')+1);
const headerSource=await readFile('public/engineering/support.js','utf8');
vm.runInContext(headerSource.slice(0,headerSource.indexOf('function accountingMasterLocked')),ctx);
vm.runInContext(groups+await readFile('public/engineering/columns.js','utf8')+source,ctx);
const stageKeys=vm.runInContext('[...keys]',ctx);
const projects=Array.from({length:123},(_,i)=>({id:String(105+i),name:'Synthetic owner '+i,location:'موقع تجريبي',owner:'Engineer A',service:'SEWA',contract:false,permit:'بانتظار المتطلبات',stages:Object.fromEntries(stageKeys.map(k=>[k,{status:k==='munStruct'?'READY':'REQ',engineer:'Engineer A',date:'2030-01-02',note:k==='munStruct'?'<script>unsafe</script>':''}])),extra:{'field-ref':0},supervision:{status:'لم يبدأ'}}));
ctx.projects=[...projects,{id:'private-unmatched',name:'MUST_NOT_PRINT'}];ctx.visible=()=>projects;
dom.set('#search',{value:'Synthetic'});dom.set('#filter',{value:'active',selectedOptions:[{textContent:'مشاريع جارية'}]});
const data=ctx.captureProjectPrint();
assert.equal(data.rows.length,123);assert.ok(data.filters.includes('Synthetic'));assert.ok(data.filters.includes('مشاريع جارية'));
assert.ok(!data.columns.some(c=>c.id==='stage:electric'),'hidden groups must not leak into print');
assert.ok(data.columns.some(c=>c.id==='stage:munStruct:note'),'expanded detail columns must print');
assert.ok(data.columns.findIndex(c=>c.id==='stage:munStruct')<data.columns.findIndex(c=>c.id==='extra:field-ref'),'current column order is retained');
assert.equal(data.rows[0][data.columns.findIndex(c=>c.id==='extra:field-ref')],'0','numeric zero must not become blank');
const selected=ctx.projectPrintSelection(data,'page',['stage:munStruct','extra:field-ref']);
assert.equal(selected.rows.length,50);assert.equal(selected.rows[0][0],projects[50].id);assert.equal(selected.rows.at(-1)[0],projects[99].id);
assert.deepEqual(Array.from(selected.columns,c=>c.id),['id','name','stage:munStruct','extra:field-ref']);
assert.equal(ctx.projectPrintSelection(data,'all',[]).rows.length,123,'all filtered results are not limited to the current page');
assert.throws(()=>ctx.projectPrintSelection(data,'invalid',[]),/نطاق/);
const panels=ctx.projectPrintPanels(data,'A4','portrait',true);
assert.ok(panels.length>1);assert.ok(panels.every(p=>p[0]===0&&p[1]===1&&p.length<=7));
const html=ctx.projectPrintHtml(data,{paper:'A4',orientation:'landscape',split:true,mark:true,signature:true});
assert.ok(html.includes('@page{size:A4 landscape'));assert.ok(html.includes('display:table-header-group'));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
assert.ok(!html.includes('MUST_NOT_PRINT'));assert.ok(!html.includes('<script>unsafe'));assert.ok(!html.includes('data-inline='));assert.ok(!html.includes('<select'));
assert.ok(html.includes('توقيع'));assert.ok(html.includes('☐'));assert.ok(html.includes('READY — جاهز للتقديم'));
ctx.view='tasks';assert.throws(()=>ctx.captureProjectPrint(),/جدول المشاريع/);ctx.view='projects';
// Exercise the real preview action: no data writes, pending saves block, popups fail visibly.
for(const [id,value] of Object.entries({projectPrintScope:'page',projectPrintPaper:'A4',projectPrintOrientation:'landscape'}))dom.set('#'+id,{value});
for(const id of ['projectPrintSplit','projectPrintMark','projectPrintSignature'])dom.set('#'+id,{checked:true});
dom.set('#edit',{close(){closed=true;}});checked.push({dataset:{projectPrintColumn:'stage:munStruct'}});
ctx.fixture=data;vm.runInContext('projectPrintSnapshot=fixture',ctx);
ctx.sharedWorkspacePending={};ctx.sharedWorkspaceRestorePending=null;ctx.sharedWorkspaceBusy=false;
assert.throws(()=>ctx.runProjectPrint(),/تأكيد حفظ/);assert.equal(output,'');
ctx.sharedWorkspacePending=null;ctx.runProjectPrint();assert.ok(closed);assert.ok(output.includes('50 مشروع'));assert.ok(!output.includes('MUST_NOT_PRINT'));
vm.runInContext('projectPrintSnapshot=fixture',ctx);ctx.window.open=()=>null;assert.throws(()=>ctx.runProjectPrint(),/النوافذ المنبثقة/);
// Large result sets are rendered from the filtered model without embedding the database.
const large={...selected,scope:'all',rows:Array.from({length:5000},(_,i)=>[String(i),'Synthetic owner','READY','0'])};
const largeHtml=ctx.projectPrintHtml(large,{paper:'A3',orientation:'landscape',split:true,mark:false,signature:false});
assert.equal((largeHtml.match(/<tbody>/g)||[]).length,1);assert.equal((largeHtml.match(/<tr>/g)||[]).length,5001);assert.ok(!largeHtml.includes('توقيع المسؤول'));
await mkdir('../outputs/project-print-fixtures',{recursive:true});
await writeFile('../outputs/project-print-fixtures/project-table-preview.html',ctx.projectPrintHtml({...data,rows:data.rows.slice(0,6)},{paper:'A4',orientation:'landscape',split:true,mark:true,signature:true}));
console.log('PASS project print: filtered rows/page boundaries, exact visible column order, expanded details/custom values, 5000 rows, repeat identity panels, escaping, no editors/private rows, pending-save guard and popup failure; synthetic preview generated');
