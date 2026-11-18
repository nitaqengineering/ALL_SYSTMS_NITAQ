// Supervision is part of the existing project CAS document. Managers write;
// other workspace members read. No new auth grants or separate data store.
const supervisionStates=['لم يبدأ','جارٍ التنفيذ','متوقف بالموقع','مكتمل'];
const supervisionVisitStates=['مخططة','منفذة','ملغاة'];
const supervisionResults=['لم تسجل نتيجة','بدون ملاحظات','ملاحظات تحتاج متابعة'];
const supervisionPhases=['تجهيز الموقع','الحفر والأساسات','الهيكل الإنشائي','الأعمال الصحية والكهربائية','التشطيبات','التسليم','أخرى'];
function supervisionVisits(project){
  const visits=project.supervision?.visits;
  if(visits===undefined)return [];
  if(!Array.isArray(visits))throw Error('سجل زيارات الإشراف يحتاج مراجعة؛ لم يتم استبداله.');
  return visits;
}
function supervisionWritable(project){
  return !!project&&managerPreview()&&!stopped(project)&&project.permit==='صدرت';
}
function requireSupervisionWrite(project){
  if(!supervisionWritable(project))throw Error('تعديل الإشراف متاح للمدير بعد صدور الإجازة وفي المشاريع الجارية فقط.');
}
function supervisionDate(value,label){
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)
    throw Error(label+' غير صحيح.');
}
function supervisionText(value,label,limit=2000){
  const text=String(value??'').trim();if(text.length>limit)throw Error(label+' أطول من الحد المسموح ('+limit+' حرف).');return text;
}
function validateSupervisionEngineer(name,previous=''){
  if(name&&!people.includes(name)&&name!==previous)throw Error('اختر مهندسًا نشطًا للإشراف.');
}
function saveSupervisionSummary(project,values){
  requireSupervisionWrite(project);
  const current=project.supervision||{};
  if(!supervisionStates.includes(values.status))throw Error('حالة الإشراف غير صحيحة.');
  validateSupervisionEngineer(values.engineer,current.engineer);
  if(values.status==='جارٍ التنفيذ'&&!values.engineer)throw Error('حدد مهندس الإشراف قبل بدء التنفيذ.');
  if(values.status==='مكتمل'&&supervisionOpenActions(project).length)throw Error('أغلق المتابعات المفتوحة قبل إكمال الإشراف.');
  const note=supervisionText(values.note,'ملاحظات الإشراف');
  project.supervision={...current,status:values.status,engineer:values.engineer,note};
}
function saveSupervisionVisit(project,visitId,values){
  requireSupervisionWrite(project);
  const visits=supervisionVisits(project),old=visitId?visits.find(v=>v.id===visitId):null;
  if(visitId&&!old)throw Error('الزيارة غير موجودة؛ أعد قراءة الملف.');
  if(!supervisionVisitStates.includes(values.status)||!supervisionPhases.includes(values.phase)||!supervisionResults.includes(values.result))throw Error('اختر حالة الزيارة والمرحلة والنتيجة من القوائم.');
  supervisionDate(values.date,'تاريخ الزيارة');
  if(!values.engineer)throw Error('حدد مهندس الزيارة.');
  validateSupervisionEngineer(values.engineer,old?.engineer);
  if(values.status==='منفذة'&&values.date>today())throw Error('لا يمكن تسجيل زيارة منفذة بتاريخ مستقبلي.');
  if(values.status==='منفذة'&&values.result==='لم تسجل نتيجة')throw Error('سجل نتيجة الزيارة المنفذة.');
  const notes=supervisionText(values.notes,'ملاحظات الزيارة'),action=supervisionText(values.action,'الإجراء القادم',500);
  const report=supervisionText(values.report,'مرجع التقرير',160);
  if(values.status==='ملغاة'&&!notes)throw Error('سجل سبب إلغاء الزيارة.');
  if(values.status!=='منفذة'&&values.result!=='لم تسجل نتيجة')throw Error('النتيجة متاحة للزيارة المنفذة فقط.');
  if(values.result==='ملاحظات تحتاج متابعة'){
    if(!notes||!action||!values.actionOwner||!values.due)throw Error('سجل الملاحظات والإجراء ومسؤول المتابعة وموعدها.');
  }
  if(values.due){supervisionDate(values.due,'موعد المتابعة');if(values.due<values.date)throw Error('موعد المتابعة لا يسبق الزيارة.');}
  validateSupervisionEngineer(values.actionOwner,old?.actionOwner);
  if(!['مفتوحة','منجزة'].includes(values.followupStatus))throw Error('حالة المتابعة غير صحيحة.');
  if(values.followupStatus==='منجزة'&&(!old||old.followupStatus!=='منجزة')&&!values.completionNote?.trim())throw Error('سجل ما تم تنفيذه لإغلاق المتابعة.');
  const completionNote=supervisionText(values.completionNote,'نتيجة المتابعة');
  const now=new Date().toISOString();
  const entry={...old,id:old?.id||'visit-'+crypto.randomUUID(),date:values.date,phase:values.phase,status:values.status,engineer:values.engineer,result:values.result,notes,report,action,actionOwner:values.actionOwner,due:values.due,followupStatus:values.followupStatus,completionNote,createdAt:old?.createdAt||now,updatedAt:now};
  project.supervision={...project.supervision,visits:old?visits.map(v=>v.id===visitId?entry:v):[...visits,entry]};
  return entry.id;
}
function supervisionNextVisit(project){
  return supervisionVisits(project).filter(v=>v.status==='مخططة').slice().sort((a,b)=>a.date.localeCompare(b.date))[0];
}
function supervisionOpenActions(project){
  return supervisionVisits(project).filter(v=>v.status!=='ملغاة'&&v.result==='ملاحظات تحتاج متابعة'&&v.followupStatus!=='منجزة');
}
function supervisionOverview(project){
  const visits=supervisionVisits(project),next=supervisionNextVisit(project),actions=supervisionOpenActions(project);
  return {count:visits.length,completed:visits.filter(v=>v.status==='منفذة').length,next,actions,late:actions.filter(v=>v.due&&v.due<today()).length};
}
function supervisionIsLate(project){
  if(stopped(project))return false;
  const summary=supervisionOverview(project);return summary.late>0||!!(summary.next&&summary.next.date<today());
}
function supervisionVisitRows(project){
  return supervisionVisits(project).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(v=>[
    esc(v.date),esc(v.phase),esc(v.engineer),esc(v.status),esc(v.result),esc(v.notes||'—'),esc(v.report||'—'),
    esc(v.action||'—')+(v.actionOwner?'<br>'+esc(v.actionOwner):'')+(v.due?'<br>'+esc(v.due):'')+(v.followupStatus?'<br>'+esc(v.followupStatus):'')+(v.completionNote?'<br>'+esc(v.completionNote):''),
    supervisionWritable(project)?'<button type="button" class="btn xs" data-super-visit="'+esc(project.id)+'" data-visit-id="'+esc(v.id)+'">تعديل الزيارة</button>':'قراءة فقط'
  ]);
}
function openSupervisionFile(id){
  const project=projects.find(p=>p.id===id);if(!project||project.permit!=='صدرت')return toast('ملف الإشراف متاح بعد صدور إجازة البناء.');
  try{
    const current=project.supervision||{},summary=supervisionOverview(project),writable=supervisionWritable(project);
    const actions=writable?'<div class="operation-toolbar"><button type="button" class="btn" data-super-summary="'+esc(id)+'">تعديل بيانات الإشراف</button><button type="button" class="btn primary" data-super-visit="'+esc(id)+'">＋ زيارة جديدة</button></div>':'<p class="sub">قراءة فقط؛ الحفظ متاح للمدير في المشاريع الجارية.</p>';
    const body='<dl class="supervision-info"><div><dt>الحالة</dt><dd>'+esc(current.status||'لم يبدأ')+'</dd></div><div><dt>مهندس الإشراف</dt><dd>'+esc(current.engineer||'غير مسند')+'</dd></div><div><dt>إجازة البناء</dt><dd>'+esc(project.permitIssue?.number||'صدرت')+' · '+esc(project.permitIssue?.date||'تاريخ غير مسجل')+'</dd></div><div><dt>الزيارة القادمة</dt><dd>'+esc(summary.next?.date||'غير مجدولة')+'</dd></div></dl>'+
      '<p>'+esc(current.note||'لا توجد ملاحظات عامة.')+'</p>'+actions+
      '<p class="sub">'+summary.completed+' زيارة منفذة · '+summary.actions.length+' متابعة مفتوحة · '+summary.late+' متابعة متأخرة. سجلات الزيارات للمتابعة الداخلية ولا تستبدل اعتماد الجهة المختصة.</p>'+
      (summary.count?'<div class="supervision-visits">'+operationTable(['التاريخ','المرحلة','المهندس','الحالة','النتيجة','الملاحظات','مرجع التقرير','المتابعة','الإجراء'],supervisionVisitRows(project))+'</div>':'<p class="empty">لم تسجل زيارات لهذا المشروع بعد. أضف زيارة مخططة أو وثّق زيارة منفذة.</p>');
    if($('#edit').open)$('#edit').close();
    show('ملف الإشراف · '+id,project.name+' · '+project.location,body,'documentHub',id);
  }catch(error){toast(error.message);}
}
function openSupervisionSummary(id){
  const project=projects.find(p=>p.id===id);requireSupervisionWrite(project);const s=project.supervision||{};
  if($('#edit').open)$('#edit').close();
  show('بيانات الإشراف · '+id,project.name,select('حالة الإشراف','sup-status',[...new Set([...supervisionStates,s.status||'لم يبدأ'])],s.status||'لم يبدأ')+select('مهندس الإشراف','sup-engineer',[...new Set(['',...people,s.engineer||''])],s.engineer||'')+'<label for="sup-note">الملاحظات العامة</label><textarea id="sup-note" maxlength="2000">'+esc(s.note||'')+'</textarea>','supervisionSummary',id);
}
function openSupervisionVisit(id,visitId=''){
  const project=projects.find(p=>p.id===id);requireSupervisionWrite(project);const v=visitId?supervisionVisits(project).find(v=>v.id===visitId):{};
  if(!v)throw Error('الزيارة غير موجودة.');
  if($('#edit').open)$('#edit').close();
  const text=(label,name,value,max=2000)=>'<label for="'+name+'">'+label+'</label><textarea id="'+name+'" maxlength="'+max+'">'+esc(value||'')+'</textarea>';
  const html=field('تاريخ الزيارة','visit-date',v.date||today(),'date')+select('المرحلة بالموقع','visit-phase',supervisionPhases,v.phase||supervisionPhases[0])+select('حالة الزيارة','visit-status',supervisionVisitStates,v.status||'مخططة')+
    select('مهندس الزيارة','visit-engineer',[...new Set(['',...people,v.engineer||project.supervision?.engineer||''])],v.engineer||project.supervision?.engineer||'')+
    select('نتيجة الزيارة','visit-result',supervisionResults,v.result||supervisionResults[0])+text('الملاحظات / سبب الإلغاء','visit-notes',v.notes)+field('مرجع تقرير الزيارة — اختياري','visit-report',v.report||'')+
    text('الإجراء القادم','visit-action',v.action,500)+select('مسؤول المتابعة','visit-actionOwner',[...new Set(['',...people,v.actionOwner||''])],v.actionOwner||'')+field('موعد المتابعة','visit-due',v.due||'','date')+
    select('حالة المتابعة','visit-followupStatus',['مفتوحة','منجزة'],v.followupStatus||'مفتوحة')+text('ما تم تنفيذه في المتابعة','visit-completionNote',v.completionNote);
  show(visitId?'تعديل زيارة · '+id:'زيارة إشراف جديدة · '+id,project.name,html,'supervisionVisit',id,visitId);
  for(const name of ['date','engineer'])$('#visit-'+name).required=true;
}
function saveSupervisionForm(project,mode,visitId){
  if(mode==='supervisionSummary')saveSupervisionSummary(project,{status:$('#sup-status').value,engineer:$('#sup-engineer').value,note:$('#sup-note').value});
  else saveSupervisionVisit(project,visitId,Object.fromEntries(['date','phase','status','engineer','result','notes','report','action','actionOwner','due','followupStatus','completionNote'].map(k=>[k,$('#visit-'+k).value])));
  // Keep a project history entry; the existing server CAS audit preserves exact before/after.
  audit(project,mode==='supervisionSummary'?'تحديث بيانات الإشراف':visitId?'تعديل زيارة إشراف':'إضافة زيارة إشراف');
}
function renderSupervision(list){
  $('#gridViewport').hidden=true;$('#table-scroll-top').hidden=true;$('#projectCards').hidden=false;
  $('#hinttext').textContent='متابعة الموقع بعد صدور إجازة البناء · زيارات وملاحظات ومواعيد متابعة';
  $('#pageTitle').textContent='متابعة الإشراف بالموقع';
  const summaries=list.map(p=>{try{return supervisionOverview(p);}catch{return null;}});
  $('#stats').innerHTML=[['مشاريع ضمن النتائج',list.length],['زيارات مخططة متأخرة',summaries.filter(s=>s?.next&&s.next.date<today()).length],['متابعات متأخرة',summaries.reduce((n,s)=>n+(s?.late||0),0)],['بدون مهندس إشراف',list.filter(p=>!p.supervision?.engineer).length]].map(([label,value])=>'<div class="stat"><span>'+esc(label)+'</span><b>'+value+'</b></div>').join('');
  $('#projectCards').innerHTML=paginateProjects(list).map(project=>{
    let summary;try{summary=supervisionOverview(project);}catch{return '<article class="pcard"><h3>'+esc(project.id)+'</h3><p class="late">تعذرت قراءة سجل الزيارات؛ راجع الإدارة.</p></article>';}
    return '<article class="pcard"><div class="pcard-top"><strong class="pcard-id">'+esc(project.id)+'</strong><h3>'+esc(project.name)+'</h3></div><p>'+esc(project.location||'')+'</p><dl class="supervision-info"><div><dt>الحالة</dt><dd>'+esc(project.supervision?.status||'لم يبدأ')+'</dd></div><div><dt>مهندس الإشراف</dt><dd>'+esc(project.supervision?.engineer||'غير مسند')+'</dd></div><div><dt>الزيارة القادمة</dt><dd>'+esc(summary.next?.date||'غير مجدولة')+'</dd></div><div><dt>متابعات مفتوحة / متأخرة</dt><dd>'+summary.actions.length+' / '+summary.late+'</dd></div></dl><button type="button" class="btn" data-super="'+esc(project.id)+'">فتح ملف الإشراف</button></article>';
  }).join('')||'<p class="empty">لا توجد مشاريع صدرت لها إجازة بناء ضمن الفلاتر الحالية.</p>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try{if(button.dataset.superSummary)openSupervisionSummary(button.dataset.superSummary);if(button.dataset.superVisit)openSupervisionVisit(button.dataset.superVisit,button.dataset.visitId||'');}
  catch(error){toast(error.message);}
});

function supervisionExportRows(list){
  const rows=[['المشروع','المالك','الموقع','حالة الإشراف','مهندس الإشراف','رقم الإجازة','تاريخ الزيارة','المرحلة','المهندس','حالة الزيارة','النتيجة','الملاحظات','مرجع التقرير','الإجراء القادم','مسؤول المتابعة','موعد المتابعة','حالة المتابعة','ما تم تنفيذه']];
  for(const p of list){
    const visits=supervisionVisits(p),prefix=[p.id,p.name,p.location,p.supervision?.status||'لم يبدأ',p.supervision?.engineer||'',p.permitIssue?.number||''];
    if(!visits.length)rows.push([...prefix,...Array(12).fill('')]);
    for(const v of visits)rows.push([...prefix,...['date','phase','engineer','status','result','notes','report','action','actionOwner','due','followupStatus','completionNote'].map(k=>v[k]||'')]);
  }
  return rows;
}
function exportSupervision(){
  try{
    const rows=supervisionExportRows(visible());
    const csv='\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='nitaq-supervision-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast(error.message);}
}
