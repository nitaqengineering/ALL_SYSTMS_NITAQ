/* Pending changes only: no sessions/passwords. Server CAS and permissions remain authoritative. */
(function(root){
 'use strict';
 const keys={client:'clients',lead:'leads',inter:'inter',task:'tasks',profile:'users',audit:'audit',settings:'settings'};
 const copy=value=>JSON.parse(JSON.stringify(value));
 function validateItem(item){
  if(!item||!Object.hasOwn(keys,item.entity)||typeof item.id!=='string'||!item.id||
     !Number.isSafeInteger(item.revision)||item.revision<1)throw Error('سجل التعديلات المحلية غير صالح؛ احتفظ بنسخة منه قبل الاستعادة.');
  for(const value of [item.before,item.after])if(value!==null&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('بيانات التعديل المحلي غير صالحة.');
  if(item.after&&item.entity!=='settings'&&item.after[item.entity==='audit'?'aid':'id']!==item.id)throw Error('هوية التعديل المحلي غير متطابقة.');
 }
 function create(storage,url,actor){
  if(!url||!actor)throw Error('هوية سجل الحفظ غير متاحة.');
  const key='nitaq-crm-pending-v1:'+encodeURIComponent(url)+':'+encodeURIComponent(actor);
  function decode(raw){
   if(raw===null)return null;
   const value=JSON.parse(raw);
   if(value.version!==1||value.url!==url||value.actor!==actor||!Array.isArray(value.items)||value.items.length>10000)throw Error('هوية أو حجم سجل الحفظ غير صالح.');
   const seen=new Set();
   for(const item of value.items){validateItem(item);const id=item.entity+':'+item.id;if(seen.has(id))throw Error('تعديلات محلية مكررة.');seen.add(id);}
   if(value.batch){
    if(typeof value.batch.id!=='string'||!value.batch.id||!Array.isArray(value.batch.items)||value.batch.items.length<1||value.batch.items.length>100)throw Error('طلب الحفظ المحلي غير صالح.');
    const sent=new Set();
    for(const item of value.batch.items){validateItem(item);const id=item.entity+':'+item.id;if(!seen.has(id)||sent.has(id))throw Error('طلب الحفظ لا يطابق التعديلات المحلية.');sent.add(id);}
   }
   return value;
  }
  return {key,actor,url,
   read(){try{return decode(storage.getItem(key));}catch{throw Error('تعذر قراءة سجل تعديلات CRM؛ لم نستبدله. احتفظ ببيانات المتصفح قبل الاستعادة.');}},
   write(queue,batch){
    const items=[...queue.values()];
    if(!items.length&&!batch){storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('تعذر تأكيد إزالة سجل الحفظ.');return;}
    const raw=JSON.stringify({version:1,url,actor,items,batch:batch||null});decode(raw);
    storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('تعذر تأكيد حفظ التعديلات على الجهاز.');
   }
  };
 }
 function overlay(db,items){
  const next=copy(db);
  for(const item of items){
   validateItem(item);const key=keys[item.entity];
   if(key==='settings'){if(item.after)next.lookups=copy(item.after.lookups||{});continue;}
   const field=key==='audit'?'aid':'id',rows=next[key]||[],index=rows.findIndex(row=>row[field]===item.id);
   if(item.after===null){if(index>=0)rows.splice(index,1);}
   else if(index>=0)rows[index]=copy(item.after);else rows.push(copy(item.after));
   next[key]=rows;
  }
  return next;
 }
 async function open(storage,url,actor,locks){
  if(!locks?.request)throw Error('الحفظ الآمن يحتاج Chrome أو Edge حديثًا عبر اتصال آمن.');
  const journal=create(storage,url,actor);
  const release=await new Promise((resolve,reject)=>{
   locks.request(journal.key,{ifAvailable:true},async lock=>{
    if(!lock){reject(Error('CRM مفتوح للحساب نفسه في نافذة أخرى؛ استخدمها أو أغلقها ثم حدّث الصفحة.'));return;}
    await new Promise(done=>resolve(done));
   }).catch(reject);
  });
  try{journal.read();return {...journal,release};}catch(error){release();throw error;}
 }
 root.NitaqCrmJournal={create,overlay,open};
})(globalThis);
