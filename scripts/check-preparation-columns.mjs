import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile('public/engineering/app.js','utf8'),columns=await readFile('public/engineering/columns.js','utf8');
const start=app.indexOf('const groups='),end=app.indexOf(';const people=',start);
assert.ok(start>0&&end>start);
function load(store,blocked=false){
 const ctx=vm.createContext({db:{columnLayout:{}},document:{addEventListener(){}},localStorage:{getItem:k=>{if(blocked)throw Error('storage unavailable');return store.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('storage unavailable');store.set(k,v);}}});
 vm.runInContext(app.slice(start,end+1)+columns,ctx);return ctx;
}
const visible=ctx=>JSON.parse(vm.runInContext('JSON.stringify(tableGroups())',ctx));

const store=new Map([['nitaq-eng-hidden-cols','["telecom"]']]),ctx=load(store);
const list=visible(ctx);
assert.ok(!list.some(([id])=>['struct','sanitary','telecom'].includes(id)));
assert.deepEqual(list.find(([id])=>id==='municipal')[2],['munArch','munStruct','munSanitary']);
assert.equal(vm.runInContext('keys.includes("struct")||keys.includes("sanitary")',ctx),false,'retired stages are deleted from the schema');
assert.equal(vm.runInContext('columnGroups().some(([id])=>id==="struct"||id==="sanitary")',ctx),false,'retired stages cannot be revealed from column visibility');
vm.runInContext('hiddenColumnGroups.clear()',ctx);
assert.ok(!visible(ctx).some(([id])=>['struct','sanitary'].includes(id)),'show all cannot resurrect retired stages');
assert.ok(!visible(load(new Map(),true)).some(([id])=>['struct','sanitary'].includes(id)));
console.log('PASS removed preparation stages: absent from schema, table/mobile groups and show-all; municipal approvals retained');
