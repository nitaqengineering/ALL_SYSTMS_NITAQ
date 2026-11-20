// Decode transport dictionaries into independent, complete project documents before any UI/save code sees them.
(function(root){
 'use strict';
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const clone=value=>JSON.parse(JSON.stringify(value));
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function decode(page){
  if(!object(page))throw Error('رد خدمة المشاريع غير صالح.');
  if(!own(page,'wire_format'))return page;
  if(page.wire_format!=='dictionary-v1'||!Array.isArray(page.projects)||page.projects.length>500||
    !Array.isArray(page.stage_sets)||!Array.isArray(page.history_entries)||!Array.isArray(page.histories))throw Error('صيغة نقل المشاريع غير صالحة.');
  const stageText=new Map(),historyText=new Map();
  function stage(index){
   if(!Number.isSafeInteger(index)||index<0||index>=page.stage_sets.length||!object(page.stage_sets[index]))throw Error('مرجع مراحل غير صالح.');
   if(!stageText.has(index))stageText.set(index,JSON.stringify(page.stage_sets[index]));
   return JSON.parse(stageText.get(index));
  }
  function event(index){
   if(!Number.isSafeInteger(index)||index<0||index>=page.history_entries.length)throw Error('مرجع سجل غير صالح.');
   const entry=page.history_entries[index];
   if(!object(entry)||!own(entry,'value'))throw Error('عنصر سجل غير صالح.');
   const value=clone(entry.value);
   if(own(entry,'stage_ref')){if(!object(value)||own(value,'stages'))throw Error('عنصر مراحل سجل غير صالح.');value.stages=stage(entry.stage_ref);}
   return value;
  }
  const projects=page.projects.map(row=>{
   if(!object(row)||!object(row.data))throw Error('عنصر مشروع غير صالح.');
   const value=clone(row.data);
   if(own(row,'stage_ref')){if(own(value,'stages'))throw Error('مراحل مشروع مكررة.');value.stages=stage(row.stage_ref);}
   if(own(row,'history_ref')){
    if(own(value,'history')||!Number.isSafeInteger(row.history_ref)||row.history_ref<0||row.history_ref>=page.histories.length||!Array.isArray(page.histories[row.history_ref]))throw Error('سجل مشروع غير صالح.');
    if(!historyText.has(row.history_ref))historyText.set(row.history_ref,JSON.stringify(page.histories[row.history_ref].map(event)));
    value.history=JSON.parse(historyText.get(row.history_ref));
   }
   return value;
  });
  const {wire_format,stage_sets,history_entries,histories,...rest}=page;
  return {...rest,projects};
 }
 root.NitaqWorkspaceWire={decode};
})(globalThis);
