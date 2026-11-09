let focusedProjectId = '';
let projectContextSignature;
let documentView = 'all';
let reportDrill = null;
function reportStageMatches(project){if(!reportDrill)return true;if(stopped(project)||reportDrill.key==='gas'&&project.service==='FEWA')return false;const status=project.stages[reportDrill.key]?.status;return reportDrill.bucket==='work'?!['SUB','COM','OK','N/A','HOLD','DONE'].includes(status):reportDrill.bucket==='complete'?['OK','N/A'].includes(status):status===reportDrill.bucket;}
function focusProject(id, destination='projects') {
  if (!projects.some(project=>project.id===id)) return toast('المشروع غير موجود');
  reportDrill=null;focusedProjectId=id;view=destination;onlyMine=false;
  for(const field of ['search','engineer','stagefilter','statefilter','savedFilters'])$('#'+field).value='';
  $('#filter').value='all';
  render();
}
function renderProjectContext() {
  const project=projects.find(project=>project.id===focusedProjectId);
  if(!project)focusedProjectId='';
  const signature = JSON.stringify([
    view, focusedProjectId, reportDrill,
    projects.map(item => [item.id, item.name])
  ]);
  if (signature !== projectContextSignature) {
    $('#projectContext').innerHTML='<label for="contextProject">المشروع الحالي</label><select id="contextProject"><option value="">كل المشاريع</option>'+projects.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===focusedProjectId?'selected':'')+'>'+esc(item.id+' · '+item.name)+'</option>').join('')+'</select>'+
      (reportDrill?'<span class="sub">نتائج تقرير '+esc(columnTitle(reportDrill.key))+'</span><button type="button" class="btn xs" id="clearReportDrill">إلغاء تصفية التقرير</button>':'')+
      (project?'<button type="button" class="btn xs" data-workflow-hub="'+esc(project.id)+'">التقديمات والمراجعة</button><span class="sub">التنقل يحتفظ بنفس المشروع</span><button type="button" class="btn xs" id="contextClear">عرض الكل</button>':'')+
      '<span class="sub">'+(view==='followup'?'تعديلات المتابعة تحتاج حفظ الصف أو حفظ الكل':'حقول الجداول تحفظ تلقائيًا عند إنهاء التعديل')+'</span>';
    if(reportDrill)$('#clearReportDrill').onclick=()=>{reportDrill=null;render();};
    $('#contextProject').onchange=event=>{if(event.target.value)focusProject(event.target.value,view);else{focusedProjectId='';render();}};
    if(project)$('#contextClear').onclick=()=>{focusedProjectId='';render();};
    projectContextSignature = signature;
  }
  $('#documentViews').hidden=view!=='documents';
  if(view==='documents'){
    $('#documentViews').innerHTML=[['all','كل المستندات'],['personal','الشخصية'],['land','الأرض'],['noc','NOC'],['expiring','قرب الانتهاء']].map(([value,label])=>'<button type="button" class="btn xs '+(documentView===value?'primary':'')+'" data-document-view="'+value+'">'+label+'</button>').join('')+(managerPreview()?'<button type="button" class="btn xs" id="addDocumentColumn">＋ إضافة عمود</button>':'');
    if(managerPreview())$('#addDocumentColumn').onclick=openDocumentColumn;
    if(managerPreview()&&db.documentColumns?.length){
      const button=document.createElement('button');
      button.type='button';
      button.className='btn xs';
      button.textContent='حذف عمود';
      button.onclick=openRemoveDocumentColumn;
      $('#documentViews').append(button);
    }
  }
}
function existingOwnerField() {
  return '<label for="existingOwner">المالك</label><select id="existingOwner"><option value="">＋ مالك جديد</option>'+ownerGroups().map(group=>'<option value="'+esc(group.project.id)+'">'+esc(group.project.name)+' · '+esc(group.projects.map(project=>project.id).join('، '))+'</option>').join('')+'</select><p class="sub">اختيار مالك موجود يربط بياناته الشخصية تلقائيًا. الأرض والوصف خاصان بالمشروع الجديد.</p>';
}
function attachExistingOwner(project, id) {
  if(!id)return;
  const existing=projects.find(item=>item.id===id && item!==project);
  if(!existing)throw Error('ملف المالك غير موجود');
  const clientId=existing.clientId || 'owner-'+crypto.randomUUID();
  existing.clientId=clientId;project.clientId=clientId;project.name=existing.name;
  project.info={...project.info,...Object.fromEntries(sharedOwnerFields.map(key=>[key,existing.info?.[key]||'']))};
}
function dueDocumentEntries(project) {
  return [...documentList(project).filter(entry=>entry.status!=='لا يلزم').map(entry=>({kind:'document',id:entry.id,name:entry.name,date:entry.expiry})),
    ...requestList(project).filter(entry=>requestApplicable(project,entry)&&entry.status!=='لا يلزم').map(entry=>({kind:'request',id:entry.id,name:entry.name,date:entry.expiry})),
    ...[['plotGovernmentExpiry','الخارطة الحكومية'],['plotPrivateExpiry','الخارطة المِلك']].map(([key,name])=>({kind:'info',id:key,name,date:project.info?.[key]}))].filter(entry=>expiryNote(entry.date));
}
function renderExpiringDocuments(list) {
  const rows=list.flatMap(project=>dueDocumentEntries(project).map(entry=>'<tr><td>'+esc(project.id)+'</td><td>'+esc(project.name)+'</td><td>'+esc(entry.name)+'</td><td>'+esc(entry.date)+'</td><td class="late">'+esc(expiryNote(entry.date))+'</td><td><button type="button" class="btn xs" data-expiry-project="'+esc(project.id)+'" data-expiry-kind="'+entry.kind+'" data-expiry-id="'+esc(entry.id)+'">تحديث</button></td></tr>'));
  $('#table').innerHTML='<thead><tr>'+['المشروع','المالك','المستند','الانتهاء','التنبيه','الإجراء'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+(rows.join('')||'<tr><td colspan="6" class="empty">لا توجد مستندات تنتهي خلال أسبوعين أو منتهية</td></tr>')+'</tbody>';
}
function saveAllFollowupDrafts() {
  const visibleIds=new Set(visible().map(project=>project.id));
  const drafts=[...followupDrafts.entries()].filter(([key])=>{const [user,id]=JSON.parse(key);return user===previewUser&&visibleIds.has(id);});
  if(!drafts.length)return toast('لا توجد تعديلات منتظرة');
  const original=JSON.stringify(projects);
  try {
    for(const [key,draft] of drafts){
      const [,projectId,stageKey]=JSON.parse(key),project=projects.find(item=>item.id===projectId),stage=project?.stages[stageKey];
      if(!stage||stopped(project)||!canEditStage(stage))throw Error('راجع صلاحية وحالة المشروع '+projectId);
      if(draft.date && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)||!Number.isFinite(Date.parse(draft.date))||new Date(draft.date).toISOString().slice(0,10)!==draft.date))throw Error('موعد غير صحيح في المشروع '+projectId);
      if(draft.status!==undefined && draft.status!==stage.status)updateStage(project,stageKey,draft.status);
      if(draft.date!==undefined)stage.date=draft.date;
      if(draft.note!==undefined)stage.note=draft.note.trim();
    }
  } catch(error){db.projects=projects=JSON.parse(original);toast(error.message);return;}
  for(const [key] of drafts)followupDrafts.delete(key);
  persist();
}
function stageInlineField(project,key,field) {
  const stage=project.stages[key],blocked=stopped(project)||key==='gas'&&project.service==='FEWA';
  const allowed=!blocked&&(field==='engineer'?canAssignStage():canEditStage(stage));
  const attrs='class="document-grid-input" data-stage-project="'+esc(project.id)+'" data-stage-key="'+key+'" data-stage-field="'+field+'" aria-label="'+esc(columnTitle(key)+' · '+({engineer:'المسؤول',date:'الموعد',note:'الملاحظات'})[field]+' · '+project.id)+'" '+(allowed?'':'disabled');
  if(field==='engineer')return '<select '+attrs+'>'+opts([...new Set(['',...people,stage.engineer])],stage.engineer)+'</select>';
  if(field==='note')return '<textarea rows="1" '+attrs+'>'+esc(stage.note)+'</textarea>';
  return '<input type="date" '+attrs+' value="'+esc(stage.date)+'">';
}
function initUsability() {
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.id==='existingOwner'){
      const owner=projects.find(project=>project.id===input.value);
      $('#name').disabled=!!owner;
      if(owner)$('#name').value=owner.name;
      return;
    }
    if(!input.dataset.stageProject)return;
    const project=projects.find(item=>item.id===input.dataset.stageProject),key=input.dataset.stageKey,field=input.dataset.stageField,stage=project?.stages[key];
    try{
      if(!stage||!['engineer','date','note'].includes(field)||stopped(project)||key==='gas'&&project.service==='FEWA')throw Error('البند غير متاح للتعديل');
      if(field==='engineer'?!canAssignStage():!canEditStage(stage))throw Error('ليس لديك صلاحية تعديل هذا الحقل');
      if(field==='engineer' && input.value && !people.includes(input.value))throw Error('اختر مسؤولًا نشطًا');
      if(field==='date' && !input.reportValidity())return;
      if(stage[field]===input.value)return;
      stage[field]=input.value.trim();persist();
    }catch(error){toast(error.message);render();}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.focusDocumentView)documentView=button.dataset.focusDocumentView;
    if(button.dataset.reportStage){focusedProjectId='';reportDrill={key:button.dataset.reportStage,bucket:button.dataset.reportBucket};view='projects';onlyMine=false;for(const id of ['search','engineer','stagefilter','statefilter'])$('#'+id).value='';$('#filter').value='all';const group=tableGroups().find(([, ,columns])=>columns.includes(reportDrill.key));if(group)opened.add(group[0]);render();}
    if(button.dataset.focusProject)focusProject(button.dataset.focusProject,button.dataset.focusView || 'projects');
    if(button.dataset.documentView){documentView=button.dataset.documentView;render();}
    if(button.id==='saveAllFollowup')saveAllFollowupDrafts();
    if(button.dataset.expiryProject){
      const project=projects.find(item=>item.id===button.dataset.expiryProject);
      if(!project)return;
      if(button.dataset.expiryKind==='info'){focusProject(project.id,'documents');documentView='land';render();}
      else openEntry(project,button.dataset.expiryId,button.dataset.expiryKind);
    }
  });
}

function normalizeSearch(value){return String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[\s()+\-]/g,'');}
function projectMatchesSearch(project,query){const q=normalizeSearch(query);return !q||[project.id,project.name,project.location,project.sketch,project.parent,project.desc,project.descEn,project.projectType,project.workKind,...Object.values(project.info||{})].some(value=>normalizeSearch(value).includes(q));}
function dialogHasChanges(){
  if(!$('#edit').open || editing?.mode==='documentHub')return false;
  return [...$('#fields').querySelectorAll('input,select,textarea')].some(input=>{
    if(['checkbox','radio'].includes(input.type))return input.checked!==input.defaultChecked;
    if(input.tagName==='SELECT'){const options=[...input.options];const initial=options.find(option=>option.defaultSelected)||options[0];return input.value!==(initial?.value||'');}
    return input.value!==input.defaultValue;
  });
}
function confirmDiscardDialog(){return !dialogHasChanges()||confirm('توجد تعديلات غير محفوظة. هل تريد تجاهلها وإغلاق النافذة؟');}
function requestDialogClose(){if(confirmDiscardDialog())$('#edit').close();}
function taskShortcut(project,key=''){
  return managerPreview()&&!stopped(project)?'<button type="button" class="btn xs" data-create-task-project="'+esc(project.id)+'" data-create-task-stage="'+esc(key)+'">＋ مهمة</button>':'';
}
function initQuickWork(){
  $('#edit').addEventListener?.('cancel',event=>{event.preventDefault();requestDialogClose();});
  document.addEventListener('click',event=>{
    if(!$('#edit').open)return;
    const button=event.target.closest('button');
    if(!button||button.hasAttribute('data-keep-dialog-draft')||button.type==='submit'||['closeDialog','cancel'].includes(button.id)||!$('#fields').contains(button))return;
    if(!confirmDiscardDialog()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-create-task-project]');
    if(button)openTaskForm(undefined,button.dataset.createTaskProject,button.dataset.createTaskStage);
  });
  if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(dialogHasChanges()||followupDrafts.size||saveWarning){event.preventDefault();event.returnValue='';}});
}
