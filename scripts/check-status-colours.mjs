import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile('public/engineering/app.js','utf8'),css=await readFile('public/engineering/tools-ui.css','utf8'),report=await readFile('public/engineering/report.js','utf8');
const codes=['REQ','dwg','dwg egy','rev','READY','SUB','COM','SUB COM','OK','HOLD','DONE','N/A'];
const cls=app.split('\n').find(line=>line.startsWith('const cls='));
const classes=vm.runInNewContext(cls+'\n'+JSON.stringify(codes)+'.map(cls)');
assert.equal(new Set(classes).size,codes.length,'Every basic status must have its own class');
const luminance=hex=>{const v=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const backgrounds=new Set();
const definitions=report.slice(report.indexOf(' const STATUS='),report.indexOf(' const ICON='));
const reportStates=vm.runInNewContext(definitions+'\nSTATUS');
for(let i=0;i<codes.length;i++){
 const all=[...css.matchAll(new RegExp('\\.badge\\.'+classes[i]+' \\{background:(#[a-f0-9]{6});color:(#[a-f0-9]{6})\\}','gi'))];assert.ok(all.length,codes[i]);
 const [,bg,fg]=all.at(-1),a=luminance(bg),b=luminance(fg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 assert.ok(ratio>=4.5,codes[i]+' contrast '+ratio);backgrounds.add(bg);
 const rc=reportStates[codes[i]].c;
 assert.ok(report.includes('.'+rc+'{background-color:'+bg+';color:'+fg+';'),'Report palette differs: '+codes[i]);
 assert.ok(css.includes('option.status-option.'+classes[i]),'Menu option style missing: '+codes[i]);
}
assert.equal(backgrounds.size,codes.length,'Every status needs a distinct background');
assert.ok(!app.includes("item('HOLD · DONE'"),'HOLD and DONE must be separate legend entries');
console.log('PASS 12 distinct status colours: unique classes/backgrounds, text contrast >=4.5, matching report and menu colours, separate HOLD/DONE legend');
