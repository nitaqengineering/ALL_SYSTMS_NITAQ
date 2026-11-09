/* Shared pure operations: explicit edits only; a missing row is never an implicit cloud delete. */
(function(root){
  'use strict';
  const entities={clients:'client',leads:'lead',inter:'inter',audit:'audit',tasks:'task',users:'profile'};
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  function delta(before,after){
    const result=[];
    for(const [key,entity] of Object.entries(entities)){
      const field=key==='audit'?'aid':'id';
      const a=new Map((before[key]||[]).map(r=>[r[field],r]));
      const b=new Map((after[key]||[]).map(r=>[r[field],r]));
      for(const id of new Set([...a.keys(),...b.keys()])){
        if(!id||typeof id!=='string')throw Error('رقم سجل غير صالح');
        const old=a.get(id)||null,next=b.get(id)||null;
        if(!equal(old,next))result.push({key,entity,id,before:clone(old),after:clone(next)});
      }
    }
    const old={lookups:before.lookups,projSeq:before.projSeq||0};
    const next={lookups:after.lookups,projSeq:after.projSeq||0};
    // Project numbers are manual ERP metadata, not a reason for engineers to write global settings.
    if(!equal(old.lookups,next.lookups))result.push({key:'settings',entity:'settings',id:'settings',before:clone(old),after:{lookups:clone(next.lookups),projSeq:old.projSeq}});
    return result;
  }
  function inverse(current,changes){
    const next=clone(current);
    for(const change of changes){
      if(change.entity==='audit')continue;
      const {key,id,before,after}=change;
      if(key==='settings'){
        if(!equal(next.lookups,after.lookups))throw Error('الإعدادات تغيرت بعد التعديل؛ حدّث البيانات قبل التراجع');
        next.lookups=clone(before.lookups);continue;
      }
      const field=key==='audit'?'aid':'id',list=next[key]||[],index=list.findIndex(r=>r[field]===id),row=index<0?null:list[index];
      if(!before||!after){
        if(!equal(row,after))throw Error('السجل تغير بعد التعديل؛ لم يتم التراجع');
        if(!before)list.splice(index,1);else list.push(clone(before));
      }else{
        if(!row)throw Error('السجل حُذف؛ لم يتم التراجع');
        for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
          if(equal(before[field],after[field]))continue;
          if(!equal(row[field],after[field]))throw Error('هذا الحقل عدله مستخدم آخر؛ لم يتم التراجع');
          if(Object.hasOwn(before,field))row[field]=clone(before[field]);else delete row[field];
        }
      }
      next[key]=list;
    }
    return next;
  }
  function mergeImport(current,input){
    if(!input||typeof input!=='object'||!Array.isArray(input.clients)||!Array.isArray(input.leads))throw Error('ملف CRM غير صالح');
    const next=clone(current);let added=0;
    for(const key of ['clients','leads','inter']){
      const rows=input[key]===undefined?[]:input[key];
      if(!Array.isArray(rows)||rows.length>50000)throw Error('حجم أو نوع البيانات غير صالح');
      const ids=new Set((next[key]||[]).map(r=>r.id)),inputIds=new Set();
      for(const row of rows){
        if(!row||Array.isArray(row)||typeof row.id!=='string'||!row.id||row.id.length>150||inputIds.has(row.id))throw Error('أرقام سجلات غير صالحة أو مكررة');
        inputIds.add(row.id);
        if(JSON.stringify(row).length>100000)throw Error('سجل أكبر من المسموح');
        if(ids.has(row.id))continue;
        if(key==='clients'&&(typeof row.name!=='string'||typeof row.phone!=='string'))throw Error('بيانات العميل غير صالحة');
        if(key==='leads'&&!(next.clients||[]).some(c=>c.id===row.clientId))throw Error('مشروع بدون عميل مرتبط');
        if(key==='leads'&&['ownerId','engineerId'].some(k=>row[k]&&!(current.users||[]).some(u=>u.id===row[k])))throw Error('اربط مستخدمي النسخة بالمستخدمين الحاليين قبل استيراد المشاريع');
        if(key==='inter'&&!(next.leads||[]).some(l=>l.id===row.leadId))throw Error('تواصل بدون مشروع مرتبط');
        (next[key]??=[]).push(clone(row));ids.add(row.id);added++;
      }
    }
    // Users, permissions, audit history, tasks and settings are never restored from an uploaded file.
    return {db:next,added};
  }
  function enqueue(queue,changes,baseline,inFlight=new Set()){
    const planned=new Map(queue);
    for(const change of changes){
      if(change.entity==='profile'&&change.after===null)throw Error('استخدم إيقاف المستخدم بدل الحذف');
      if(change.entity==='audit'&&change.before)throw Error('سجل التدقيق لا يُعدّل أو يُحذف');
      const key=change.entity+':'+change.id,existing=planned.get(key);
      const expected=existing?existing.before:baseline(change);
      const item={...clone(change),before:clone(expected),revision:(existing?.revision||0)+1};
      if(change.entity==='settings')item.after={...clone(expected||{}),lookups:clone(change.after.lookups)};
      if(equal(item.before,item.after)&&!inFlight.has(key))planned.delete(key);else planned.set(key,item);
    }
    queue.clear();for(const [key,value] of planned)queue.set(key,value);
  }
  function safeUrl(value,attachment){
    const s=String(value||'').trim();
    if(/^https?:\/\//i.test(s))return s;
    if(attachment&&/^data:(?:image\/(?:png|jpeg|webp)|application\/pdf);base64,[a-z0-9+/=\s]+$/i.test(s))return s;
    return '#';
  }
  root.NitaqCrmSafety={delta,inverse,mergeImport,enqueue,safeUrl,equal,clone};
})(globalThis);
