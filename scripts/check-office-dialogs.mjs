// Keyboard behavior in an isolated DOM double; browser layout acceptance is separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
let boxes=[],mutation;
const document={activeElement:null,querySelectorAll:()=>boxes,getElementById:()=>null,body:{},createElement:()=>new Element('BUTTON')};
class Element{
 constructor(tagName,text=''){this.tagName=tagName;this.textContent=text;this.isConnected=true;this.tabIndex=0;this.attrs={};this.children=[];this.events={};}
 setAttribute(k,v){this.attrs[k]=v;}
 focus(){document.activeElement=this;}
 getClientRects(){return [1];}
 closest(selector){return (['INPUT','TEXTAREA','SELECT'].includes(this.tagName)||this.isContentEditable||this.attrs.role==='combobox')?this:null;}
 hasAttribute(k){return Object.hasOwn(this.attrs,k);}
 after(e){this.sibling=e;e.parent=this.parent;this.parent?.children.push(e);}
 contains(e){return this===e||this.children.some(c=>c.contains(e));}
 append(e){this.children.push(e);}
 addEventListener(k,fn){this.events[k]=fn;}
 click(){this.onclick?.();}
 querySelector(s){if(s==='button.office-dialog-close')return this.title?.sibling||null;if(s==='h2,h3,[data-office-dialog-title]')return this.title;if(s==='button.close-x,button.x')return this.close||null;return null;}
 querySelectorAll(s){return s==='button'?this.buttons:this.buttons.filter(b=>!b.disabled);}
}
const opener=new Element('BUTTON');opener.focus();
function dialog(hasClose=false){
 const box=new Element('DIV'),title=new Element('H3','عنوان'),cancel=new Element('BUTTON','إلغاء'),last=new Element('BUTTON','حفظ');
 box.title=title;title.parent=box;box.buttons=[cancel,last];box.children=[title,...box.buttons];
 cancel.onclick=()=>{box.isConnected=false;boxes=boxes.filter(b=>b!==box);};
 if(hasClose){box.close=new Element('BUTTON','×');box.close.onclick=cancel.onclick;box.buttons.unshift(box.close);box.children.push(box.close);}
 return box;
}
const first=dialog();boxes=[first];
vm.runInNewContext(await readFile('public/office-dialogs.js','utf8'),{document,MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},queueMicrotask:fn=>fn()});
function key(box,value,shiftKey=false,target=document.activeElement,extra={}){let prevented=false;box.events.keydown({key:value,shiftKey,target,...extra,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;}
assert.equal(first.attrs.role,'dialog');assert.equal(first.attrs['aria-modal'],'true');
assert.equal(document.activeElement,first);assert.equal(first.title.children.length,0,'close shortcut must be outside the accessible title');assert.equal(first.title.sibling.attrs['aria-label'],'إغلاق النافذة');
first.buttons.at(-1).focus();assert.ok(key(first,'Tab'));assert.equal(document.activeElement,first.buttons[0]);
assert.ok(key(first,'Tab',true));assert.equal(document.activeElement,first.buttons.at(-1));
assert.equal(key(first,'Escape',false,new Element('SELECT')),false);assert.equal(boxes.length,1);
for(const tag of ['INPUT','TEXTAREA','SELECT'])assert.equal(key(first,'Escape',false,new Element(tag)),false);
const editable=new Element('DIV');editable.isContentEditable=true;assert.equal(key(first,'Escape',false,editable),false);
assert.equal(key(first,'Escape',false,first,{isComposing:true}),false);
assert.equal(key(first,'Escape',false,first,{defaultPrevented:true}),false);
// React may replace a cancel button while preserving its enclosing dialog.
const detached=first.buttons[0],replacement=new Element('BUTTON','إلغاء');let replacementUsed=false;
replacement.onclick=()=>{replacementUsed=true;};first.buttons[0]=replacement;first.title.sibling.click();assert.ok(replacementUsed);
first.buttons[0]=detached;
const previous=first.buttons[0];previous.focus();const nested=dialog(true);boxes.push(nested);mutation();
assert.equal(key(first,'Escape'),false);assert.equal(boxes.length,2);
assert.ok(key(nested,'Escape'));mutation();assert.equal(document.activeElement,previous);assert.equal(boxes.length,1);
assert.ok(key(first,'Escape'));mutation();assert.equal(boxes.length,0);assert.equal(document.activeElement,opener);
// Escape also preserves a dirty form after focus moves from its field to a button.
const dirty=dialog();boxes=[dirty];mutation();dirty.events.input({target:new Element('INPUT')});dirty.buttons.at(-1).focus();
assert.equal(key(dirty,'Escape'),false);assert.equal(boxes.length,1);dirty.buttons[0].click();mutation();assert.equal(boxes.length,0);
// A document with no heading still has a name and can close in either language.
for(const label of ['إغلاق','Close']){const doc=dialog();doc.title=null;doc.buttons[0].textContent=label;boxes=[doc];mutation();assert.ok(doc.attrs['aria-label']);doc.focus();assert.ok(key(doc,'Escape'));mutation();assert.equal(boxes.length,0);}
console.log('PASS shared dialogs: labels, Tab wrap, select Escape, top dialog cancellation, nested and opener focus restoration (DOM double; no browser layout assertions)');
