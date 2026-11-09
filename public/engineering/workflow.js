const reviewStates=['لم تبدأ','قيد المراجعة','ملاحظات','مراجع داخليًا','مصرح بالتقديم'];
const blockerReasons=['لا يوجد تعطيل','بانتظار المالك','بانتظار جهة حكومية','بانتظار قسم آخر','مستندات ناقصة','بانتظار طرف خارجي','أخرى'];
const submissionOutcomes=['بانتظار الرد','ملاحظات','اعتماد','رفض','سحب التقديم'];
function workflowStage(project,key){return project.workflow?.[key] || {};}
function workflowEditable(project,key){return !stopped(project)&&!(key==='gas'&&project.service==='FEWA')&&canEditStage(project.stages[key]||{});}
function workflowButton(project,key,kind,label,cycle=''){
  return '<button type="button" class="btn xs" data-workflow-project="'+esc(project.id)+'" data-workflow-stage="'+key+'" data-workflow-kind="'+kind+'" '+(cycle?'data-workflow-cycle="'+esc(cycle)+'" ':'')+(!workflowEditable(project,key)&&!['history','view'].includes(kind)?'disabled':'')+'>'+label+'</button>';
}
function openProjectWorkflow(id){
  const project=projects.find(item=>item.id===id);if(!project)return;
  const rows=keys.filter(key=>!(key==='gas'&&project.service==='FEWA')).map(key=>{
    const data=workflowStage(project,key),blocker=data.blocker,review=data.review,cycles=data.submissions||[],last=latestSubmission(cycles);
    return [esc(columnTitle(key)),esc(project.stages[key].engineer || 'غير مسند'),esc(review?.status || 'لم تبدأ')+(review?.revision?'<div class="sub">مراجعة '+esc(review.revision)+'</div>':''),esc(blocker?.reason || 'لا يوجد تعطيل')+(blocker?.reason&&blocker.reason!=='لا يوجد تعطيل'?'<div class="sub">'+esc(blocker.nextAction)+' · '+esc(blocker.actionOwner)+' · '+esc(blocker.due || 'بدون موعد')+'</div>':''),last?esc(last.reference)+' · '+esc(last.outcome)+'<div class="sub">'+esc(last.submitted)+' · نسخة '+esc(last.revision)+' · '+cycles.length+' تقديم</div>':'لا توجد تقديمات',workflowButton(project,key,'review','المراجعة')+' '+workflowButton(project,key,'blocker','التعطيل')+' '+(approvalKeys.includes(key)?workflowButton(project,key,'submission','＋ تقديم')+' '+workflowButton(project,key,'history','السجل'):'')];
  });
  show('التقديمات والمراجعة الداخلية',project.name+' · '+id,'<p class="sub">المراجعة الداخلية مستقلة عن اعتماد الجهة. تسجيل تقديم أو رد لا يغير حالة المرحلة تلقائيًا. لا يلزم رفع ملفات.</p>'+'<div class="workflow-wide">'+operationTable(['المرحلة','المسؤول','المراجعة الداخلية','التعطيل والخطوة القادمة','آخر تقديم','الإجراءات'],rows)+'</div>','documentHub',id);
}
function workflowFields(project,key,kind,cycleId){
  const data=workflowStage(project,key),value=kind==='submission'?(data.submissions||[]).find(cycle=>cycle.id===cycleId)||{}:data[kind]||{};
  let html='';
  if(kind==='blocker')html=select('سبب التعطيل','wf-reason',blockerReasons,value.reason || 'لا يوجد تعطيل')+field('منتظر رد / إجراء من','wf-waitingOn',value.waitingOn || '')+field('الخطوة القادمة','wf-nextAction',value.nextAction || '')+select('مسؤول المتابعة','wf-actionOwner',['',...people],value.actionOwner || project.stages[key].engineer || '')+field('موعد المتابعة','wf-due',value.due || '','date')+field('تفاصيل التعطيل','wf-note',value.note || '');
  if(kind==='review')html=field('رقم مراجعة المخططات / الحزمة','wf-revision',value.revision || '')+select('أعدها','wf-preparedBy',['',...people],value.preparedBy || project.stages[key].engineer || '')+select('راجعها','wf-checkedBy',['',...people],value.checkedBy || '')+select('حالة المراجعة','wf-status',reviewStates,value.status || 'لم تبدأ')+field('تاريخ المراجعة','wf-date',value.date || '','date')+field('ملاحظات المراجعة','wf-note',value.note || '')+'<p class="sub">المراجع مختلف عن المعدّ. التصريح بالتقديم متاح للمدير. التصريح مرتبط برقم مراجعة محدد.</p>';
  if(kind==='submission'){
    if(!approvalKeys.includes(key))return;
    const warn=data.review?.status!=='مصرح بالتقديم';
    html=(warn?'<p class="late">لم يُسجل تصريح داخلي بالتقديم لهذه المرحلة. يمكن توثيق المعاملة القائمة، ويظل نقص المراجعة ظاهرًا.</p>':'')+field('رقم المعاملة / المرجع','wf-reference',value.reference || '')+field('رقم مراجعة المخططات المقدمة','wf-revision',value.revision || data.review?.revision || '')+field('تاريخ التقديم','wf-submitted',value.submitted || today(),'date')+select('النتيجة','wf-outcome',submissionOutcomes,value.outcome || 'بانتظار الرد')+field('تاريخ رد الجهة','wf-responseDate',value.responseDate || '','date')+field('ملاحظات الجهة / تفاصيل الرد','wf-comments',value.comments || '')+select('مسؤول الرد والمتابعة','wf-responseOwner',['',...people],value.responseOwner || project.stages[key].engineer || '')+field('موعد الرد / إعادة التقديم','wf-resubmitBy',value.resubmitBy || '','date')+'<p class="sub">كل إعادة تقديم تُسجل كتقديم جديد. تعديل نتيجة دورة سابقة يحافظ على باقي الدورات.</p>';
  }
  show((kind==='review'?'المراجعة الداخلية':kind==='blocker'?'التعطيل والخطوة القادمة':cycleId?'تسجيل رد الجهة':'تقديم جديد')+' · '+columnTitle(key),project.name+' · '+project.id,html,'workflowEntry',project.id,{key,kind,cycleId});
}
function checkWorkflowDate(value,label){if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error(label+' غير صحيح');}
function saveWorkflowEntry(project,key,kind,values,cycleId){
  if(!keys.includes(key)||!workflowEditable(project,key))throw Error('تعديل المتابعة متاح لمسؤول المرحلة أو المدير في المشاريع الجارية');
  const current=workflowStage(project,key);let next={...current};
  const activeName=name=>!name||people.includes(name);
  if(kind==='blocker'){
    if(!blockerReasons.includes(values.reason))throw Error('سبب التعطيل غير صحيح');
    if(values.reason!=='لا يوجد تعطيل'&&(!values.waitingOn||!values.nextAction||!values.actionOwner||!values.due))throw Error('حدد المنتظر منه والخطوة القادمة ومسؤول وموعد المتابعة');
    if(!activeName(values.actionOwner))throw Error('اختر مسؤولًا نشطًا');checkWorkflowDate(values.due,'موعد المتابعة');
    next.blocker={...values,updatedAt:new Date().toISOString(),by:previewUser||'المدير'};
  }else if(kind==='review'){
    if(!reviewStates.includes(values.status)||![values.preparedBy,values.checkedBy].every(activeName))throw Error('بيانات المراجعة غير صحيحة');
    checkWorkflowDate(values.date,'تاريخ المراجعة');
    if(['مراجع داخليًا','مصرح بالتقديم'].includes(values.status)){
      if(!values.revision||!values.preparedBy||!values.checkedBy||!values.date)throw Error('حدد رقم المراجعة والمعدّ والمراجع والتاريخ');
      if(values.preparedBy===values.checkedBy)throw Error('المراجع يجب أن يختلف عن معد المخططات');
    }
    if(!managerPreview() && (values.status==='مصرح بالتقديم'||current.review?.status==='مصرح بالتقديم'))throw Error('تعديل تصريح التقديم متاح للمدير');
    next.review={...values,authorizedBy:values.status==='مصرح بالتقديم'?(previewUser||'المدير'):'',updatedAt:new Date().toISOString()};
  }else if(kind==='submission'){
    if(!approvalKeys.includes(key)||!values.reference||!values.revision||!values.submitted||!submissionOutcomes.includes(values.outcome))throw Error('حدد رقم المعاملة والمراجعة والتاريخ والنتيجة');
    for(const field of ['submitted','responseDate','resubmitBy'])checkWorkflowDate(values[field],field==='submitted'?'تاريخ التقديم':'تاريخ المتابعة أو الرد');
    if(values.submitted>today())throw Error('تاريخ التقديم لا يمكن أن يكون مستقبلًا');
    if(values.responseDate&&values.responseDate<values.submitted)throw Error('رد الجهة لا يسبق التقديم');
    if(values.outcome!=='بانتظار الرد'&&!values.responseDate)throw Error('سجل تاريخ رد الجهة');
    if(values.outcome==='ملاحظات'&&(!values.comments||!values.responseOwner||!values.resubmitBy))throw Error('سجل الملاحظات ومسؤول الرد وموعده');
    if(!activeName(values.responseOwner))throw Error('اختر مسؤول متابعة نشطًا');
    const cycles=current.submissions||[],old=cycles.find(cycle=>cycle.id===cycleId);
    if(cycleId&&!old)throw Error('التقديم غير موجود');
    const authorizedBy=current.review?.status==='مصرح بالتقديم'&&current.review.revision===values.revision?current.review.authorizedBy:'';
    const cycle={...values,authorizedBy:old&&old.revision===values.revision?old.authorizedBy||'':authorizedBy,id:old?.id||'submission-'+crypto.randomUUID(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),by:previewUser||'المدير'};
    next.submissions=old?cycles.map(item=>item.id===cycleId?cycle:item):[...cycles,cycle];
  }else throw Error('نوع متابعة غير صحيح');
  project.workflow={...project.workflow,[key]:next};
  if(kind==='submission'&&project.permit!=='صدرت'&&!ready(project))project.permit='بانتظار المتطلبات';
}
function saveWorkflowForm(project,context){
  const fields=context.kind==='blocker'?['reason','waitingOn','nextAction','actionOwner','due','note']:context.kind==='review'?['revision','preparedBy','checkedBy','status','date','note']:['reference','revision','submitted','outcome','responseDate','comments','responseOwner','resubmitBy'];
  const values=Object.fromEntries(fields.map(field=>[field,$('#wf-'+field).value.trim()]));
  saveWorkflowEntry(project,context.key,context.kind,values,context.cycleId);
  if(context.kind!=='submission')return;
  const cycles=workflowStage(project,context.key).submissions;
  const latest=latestSubmission(cycles);
  const saved=context.cycleId?cycles.find(cycle=>cycle.id===context.cycleId):cycles.at(-1);
  const proposed={اعتماد:'OK',ملاحظات:'COM','بانتظار الرد':'SUB'}[saved.outcome];
  const stage=project.stages[context.key];
  if(latest!==saved||!proposed||stage.status===proposed||!states(context.key).includes(proposed))return;
  if(confirm('تحديث حالة '+columnTitle(context.key)+' إلى '+proposed+' وفق المعاملة '+saved.reference+' (مراجعة '+saved.revision+')؟')){
    updateStage(project,context.key,proposed);
  }
}
function openSubmissionHistory(project,key){
  const rows=(workflowStage(project,key).submissions||[]).slice().reverse().map(cycle=>[esc(cycle.reference),esc(cycle.revision)+'<div class="sub">'+esc(cycle.authorizedBy?'تصريح داخلي: '+cycle.authorizedBy:'بدون تصريح مسجل للنسخة')+'</div>',esc(cycle.submitted),esc(cycle.outcome),esc(cycle.responseDate || '—'),esc(cycle.comments),esc(cycle.responseOwner || '—'),esc(cycle.resubmitBy || '—'),workflowButton(project,key,'submission','تسجيل / تعديل الرد',cycle.id)]);
  show('سجل التقديمات · '+columnTitle(key),project.name+' · '+project.id,operationTable(['المعاملة','المراجعة','التقديم','النتيجة','رد الجهة','الملاحظات','المسؤول','الموعد','الإجراء'],rows),'documentHub',project.id);
}
function workflowSummary(project){return Object.entries(project.workflow||{}).filter(([,entry])=>entry.blocker?.reason&&entry.blocker.reason!=='لا يوجد تعطيل').map(([key,entry])=>columnTitle(key)+': '+entry.blocker.reason+' · '+entry.blocker.nextAction).join('، ');}
function initWorkflow(){document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.workflowHub){openProjectWorkflow(button.dataset.workflowHub);return;}
  if(!button.dataset.workflowProject)return;
  const project=projects.find(item=>item.id===button.dataset.workflowProject),key=button.dataset.workflowStage,kind=button.dataset.workflowKind;
  if(!project||!keys.includes(key))return;
  if(kind==='view'){openProjectWorkflow(project.id);return;}
  if(kind==='history'){openSubmissionHistory(project,key);return;}
  if(workflowEditable(project,key))workflowFields(project,key,kind,button.dataset.workflowCycle);
});}

function latestSubmission(cycles=[]){
  return cycles.filter(cycle=>typeof cycle.submitted==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cycle.submitted)).reduce((latest,cycle)=>!latest||cycle.submitted>=latest.submitted?cycle:latest,null);
}
function appendWorkflowFollowup(list){
  const rows=[];
  const due=today();
  const engineer=$('#engineer').value;
  const selectedStage=$('#stagefilter').value;
  const add=(project,key,owner,date,label,kind,cycle)=>{
    if(!date||date>due||(!managerPreview()&&owner!==previewUser)||(engineer&&owner!==engineer))return;
    rows.push('<tr><td>'+esc(project.id)+'</td><td>'+esc(project.name)+'</td><td>'+esc(columnTitle(key))+'</td><td>'+esc(owner)+'</td><td>'+ (date<due?'متأخر':'اليوم')+'</td><td>'+esc(date)+'</td><td>'+esc(label)+'</td><td>'+workflowButton(project,key,workflowEditable(project,key)?kind:'view','فتح',cycle)+'</td></tr>');
  };
  for(const project of list){
    if(stopped(project))continue;
    for(const [key,data] of Object.entries(project.workflow||{})){
      if(!keys.includes(key)||(key==='gas'&&project.service==='FEWA')||(selectedStage&&key!==selectedStage))continue;
      const blocker=data.blocker;
      if(blocker?.reason&&blocker.reason!=='لا يوجد تعطيل')add(project,key,blocker.actionOwner,blocker.due,blocker.nextAction,'blocker');
      const cycle=latestSubmission(data.submissions);
      if(cycle?.outcome==='ملاحظات')add(project,key,cycle.responseOwner,cycle.resubmitBy,'رد الجهة · '+cycle.reference+' · '+cycle.comments,'submission',cycle.id);
    }
  }
  if(rows.length)$('#table').insertAdjacentHTML('beforeend','<tbody><tr><td colspan="8" class="followup-group">متابعة التعطيل وردود الجهات</td></tr>'+rows.join('')+'</tbody>');
}
