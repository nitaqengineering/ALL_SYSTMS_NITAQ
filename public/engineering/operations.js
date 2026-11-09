// Shared owner profiles, project tasks and operational views. Local storage only.
const operationViews = {owners:'ملفات الملاك', tasks:'المهام', dashboard:'لوحة التحكم', reports:'التقارير التشغيلية', archive:'الأرشيف'};
const sharedOwnerFields = ['nameEn','phone','email','idNumber','idExpiry','passportNumber','passportExpiry'];
let operationQuery = '', taskScope = 'open';
function ownerKey(project) { return project.clientId || 'project:' + project.id; }
function ownerGroups() {
  const groups = new Map();
  for (const project of projects) {
    const id = ownerKey(project);
    if (!groups.has(id)) groups.set(id, {id, project, projects:[]});
    groups.get(id).projects.push(project);
  }
  return [...groups.values()];
}
function sharedOwnerValues(project) {
  return {name:project.name, ...Object.fromEntries(sharedOwnerFields.map(key => [key,key==='idExpiry'||key==='passportExpiry'?ownerExpiry(project,key):project.info?.[key] || '']))};
}
function reconcileOwnerChanges(before) {
  if (!before) return;
  const old = new Map(JSON.parse(before).projects.map(project => [project.id,project]));
  for (const group of ownerGroups().filter(group => group.projects.length > 1)) {
    const changed = group.projects.filter(project => old.has(project.id) && JSON.stringify(sharedOwnerValues(project)) !== JSON.stringify(sharedOwnerValues(old.get(project.id))));
    if (!changed.length) continue;
    const values = sharedOwnerValues(changed[0]);
    for (const project of group.projects) {
      if(!accountingMasterLocked(project))project.name = values.name;
      project.info = {...project.info, ...Object.fromEntries(sharedOwnerFields.map(key => [key,values[key]]))};
    }
  }
}
function saveOwnerProfile(projectId, values, targetId) {
  if (!managerPreview()) throw Error('تعديل ملف المالك متاح للمدير');
  const project = projects.find(project => project.id === projectId);
  if (!project) throw Error('المشروع غير موجود');
  const name = accountingMasterLocked(project)?project.name:values.name.trim();
  if (!name) throw Error('اسم المالك مطلوب');
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw Error('البريد الإلكتروني غير صحيح');
  const sourceGroup = projects.filter(item => ownerKey(item) === ownerKey(project));
  const target = targetId ? projects.find(item => item.id === targetId) : null;
  if (targetId && !target) throw Error('ملف المالك غير موجود');
  const group = target ? [...new Set([...sourceGroup, ...projects.filter(item => ownerKey(item) === ownerKey(target))])] : sourceGroup;
  const clientId = target?.clientId || project.clientId || 'owner-' + crypto.randomUUID();
  const shared = target ? sharedOwnerValues(target) : {name,...Object.fromEntries(sharedOwnerFields.map(key => [key,String(values[key] || '').trim()]))};
  if(group.some(item=>accountingMasterLocked(item)&&item.name!==shared.name))throw Error('اسم المالك للمشاريع المرتبطة يُعدّل من الحسابات. لا يمكن دمج أسماء مختلفة.');
  for (const item of group) {
    item.clientId = clientId;
    item.name = shared.name;
    item.info = {...item.info,...Object.fromEntries(sharedOwnerFields.map(key => [key,shared[key]]))};
  }
}
function openOwnerProfile(id) {
  const project = projects.find(project => project.id === id);
  if (!project) return;
  const related = projects.filter(item => ownerKey(item) === ownerKey(project));
  const shared = sharedOwnerValues(project);
  const fields = [['name','الاسم بالعربي','text'],['nameEn','الاسم بالإنجليزي','text'],['phone','الهاتف','tel'],['email','البريد','email'],['idNumber','رقم الهوية','text'],['idExpiry','انتهاء الهوية','date'],['passportNumber','رقم الجواز','text'],['passportExpiry','انتهاء الجواز','date']];
  show('ملف المالك',project.name,
    '<p>البيانات الشخصية مشتركة بين المشاريع المرتبطة. بيانات الأرض ووصف المشروع مستقلة لكل مشروع.</p>' +
    '<div class="user-fields">'+fields.map(([key,label,type]) => field(label,'owner-'+key,shared[key],type)).join('')+'</div>' +
    '<label for="owner-link">ربط مجموعة هذا المالك بملف مالك موجود — اختياري</label><select id="owner-link"><option value="">بدون تغيير الربط</option>'+
    ownerGroups().filter(group => group.id !== ownerKey(project)).map(group => '<option value="'+esc(group.project.id)+'">'+esc(group.project.name)+' · '+esc(group.projects.map(item => item.id).join('، '))+'</option>').join('')+'</select>' +
    '<p class="sub">عند الربط تُستخدم البيانات الشخصية للملف المختار في كل مشاريع المجموعتين. يمكن التراجع.</p><h3>المشاريع المرتبطة</h3>'+
    operationTable(['المشروع','الوصف','الحالة','السجل'],related.map(item => [esc(item.id),esc(item.desc),esc(labels[item.stages.design.status]),'<button type="button" class="btn xs" data-project-history="'+esc(item.id)+'">سجل المشروع</button>'])),managerPreview()?'ownerProfile':'documentHub',id);
  if(related.some(accountingMasterLocked)){$('#owner-name').readOnly=true;$('#owner-name').title='اسم المالك يُحدّث من الحسابات';}
  if(!managerPreview()) for(const input of $('#fields').querySelectorAll('input,select')) input.disabled=true;
}
function saveOwnerProfileForm(id) {
  const values = Object.fromEntries(['name',...sharedOwnerFields].map(key => [key,$('#owner-'+key).value.trim()]));
  const target = $('#owner-link').value;
  if (target && !confirm('ربط المجموعتين واستخدام بيانات المالك المختار؟')) return false;
  saveOwnerProfile(id,values,target);
  return true;
}
function taskList() {return db.tasks || [];}
function canManageTask(task) {return managerPreview() || (task.engineer === previewUser && engineerPermissions(previewUser).edit);}
function taskBlocked(task) {const project=projects.find(item=>item.id===task.projectId);return !project || stopped(project);}
function saveProjectTask(id, values) {
  const existing = taskList().find(task => task.id === id);
  if (!managerPreview() && (!existing || !canManageTask(existing))) throw Error('إضافة المهام والإسناد للمدير، وتعديل المهمة للمسؤول عنها');
  const project = projects.find(project => project.id === values.projectId);
  if (!project || stopped(project)) throw Error('اختر مشروعًا جاريًا');
  if (!values.title.trim()) throw Error('عنوان المهمة مطلوب');
  if (!keys.includes(values.stage)) throw Error('اختر قسمًا صحيحًا');
  if (values.stage==='gas' && project.service==='FEWA') throw Error('الغاز غير متاح لدى FEWA');
  if (!projectUsers().some(user => user.name === values.engineer && user.active !== false)) throw Error('اختر مسؤولًا نشطًا');
  if (values.date && (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !Number.isFinite(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0,10)!==values.date)) throw Error('تاريخ غير صحيح');
  if (!['open','done'].includes(values.status)) throw Error('حالة المهمة غير صحيحة');
  if (existing && !managerPreview() && ['projectId','stage','engineer'].some(key => values[key] !== existing[key])) throw Error('تغيير الإسناد متاح للمدير');
  const task = {...existing, ...values, title:values.title.trim(), note:values.note.trim(), id:existing?.id || 'task-'+crypto.randomUUID(), createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString()};
  task.doneAt=task.status==='done'?(existing?.doneAt || task.updatedAt):'';
  db.tasks=existing ? taskList().map(item => item.id===id?task:item) : [...taskList(),task];
}
function openTaskForm(id,contextProject,contextStage) {
  const task=taskList().find(item=>item.id===id);
  if (!managerPreview() && (!task || !canManageTask(task))) return toast('تعديل المهمة للمسؤول عنها');
  const activeProjects=projects.filter(project=>!stopped(project));
  if(!task && !activeProjects.length)return toast('لا توجد مشاريع جارية');
  const editable=managerPreview();
  if(!task&&(contextProject||focusedProjectId)&&!activeProjects.some(project=>project.id===(contextProject||focusedProjectId)))return toast('المشروع الحالي متوقف؛ اختر مشروعًا جاريًا');
  const projectId=task?.projectId || contextProject || focusedProjectId || activeProjects[0]?.id;
  const stageEngineer=contextStage?projects.find(project=>project.id===projectId)?.stages[contextStage]?.engineer:'';
  const suggestedEngineer=task?.engineer || (people.includes(stageEngineer)?stageEngineer:'');
  show(task?'تعديل المهمة':'مهمة جديدة','مهمة مرتبطة بمشروع وقسم ومسؤول',
    field('عنوان المهمة','task-title',task?.title || '')+
    '<label for="task-project">المشروع</label><select id="task-project" '+(!editable?'disabled':'')+'>'+activeProjects.map(project=>'<option value="'+esc(project.id)+'" '+(project.id===projectId?'selected':'')+'>'+esc(project.id+' · '+project.name)+'</option>').join('')+'</select>'+
    select('القسم','task-stage',keys,task?.stage || contextStage || 'coordination','taskStage')+
    select('المسؤول','task-engineer',people,suggestedEngineer)+
    field('الموعد','task-date',task?.date || '','date')+
    '<label for="task-status">الحالة</label><select id="task-status">'+[['open','مفتوحة'],['done','منجزة']].map(([value,label])=>'<option value="'+value+'" '+(task?.status===value?'selected':'')+'>'+label+'</option>').join('')+'</select>'+
    '<label for="task-note">التفاصيل والملاحظات</label><textarea id="task-note">'+esc(task?.note || '')+'</textarea>', 'projectTask',task?.id);
  $('#task-stage').innerHTML=keys.map(key=>'<option value="'+key+'" '+(key===(task?.stage || contextStage || 'coordination')?'selected':'')+'>'+esc(columnTitle(key))+'</option>').join('');
  $('#task-engineer').innerHTML='<option value="">اختر المسؤول</option>'+opts(people,suggestedEngineer);
  $('#task-stage').disabled=$('#task-engineer').disabled=!editable;
  $('#task-title').required=true;
}
function saveTaskForm(id) {
  const values=Object.fromEntries(['title','stage','engineer','date','status','note'].map(key=>[key,$('#task-'+key).value]));
  values.projectId=$('#task-project').value;
  saveProjectTask(id,values);
}
function operationTable(head, rows) {
  return '<div class="operation-scroll"><table class="operation-table"><thead><tr>'+head.map(label=>'<th>'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+ (rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('') || '<tr><td colspan="'+head.length+'" class="empty">لا توجد نتائج</td></tr>')+'</tbody></table></div>';
}
function relevantTasks(list=projects, dueOnly=false) {
  const ids=new Set(list.map(project=>project.id));
  return taskList().filter(task=>ids.has(task.projectId) && (!focusedProjectId||task.projectId===focusedProjectId) && (managerPreview() || task.engineer===previewUser) && (!dueOnly || task.status==='open' && !taskBlocked(task) && (!task.date || task.date<=today()))).sort((a,b)=>(a.date || '9999').localeCompare(b.date || '9999'));
}
function taskRowsHtml(tasks) {
  return tasks.map(task => '<tr><td>'+esc(task.projectId)+'</td><td>'+esc(task.title)+'<div class="sub">'+esc(task.note)+'</div></td><td>'+esc(columnTitle(task.stage))+'</td><td>'+esc(task.engineer)+'</td><td class="'+(task.date && task.date<today() && task.status==='open'?'late':'')+'">'+esc(task.date || 'بدون موعد')+'</td><td>'+ (taskBlocked(task)?'المشروع متوقف':task.status==='done'?'منجزة':'مفتوحة')+'</td><td><button type="button" class="btn xs" data-task-edit="'+esc(task.id)+'" '+(!canManageTask(task)||taskBlocked(task)?'disabled':'')+'>تعديل</button> <button type="button" class="btn xs" data-task-toggle="'+esc(task.id)+'" '+(!canManageTask(task)||taskBlocked(task)?'disabled':'')+'>'+(task.status==='done'?'إعادة فتح':'إنجاز')+'</button></td></tr>').join('');
}
function taskTable(tasks) {return '<div class="operation-scroll"><table class="operation-table"><thead><tr>'+['المشروع','المهمة','القسم','المسؤول','الموعد','الحالة','الإجراء'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+ (taskRowsHtml(tasks)||'<tr><td colspan="7" class="empty">لا توجد مهام</td></tr>')+'</tbody></table></div>';}
function appendDailyTasks(list) {
  const tasks=relevantTasks(list,true).filter(task=>!$('#engineer').value || task.engineer===$('#engineer').value).filter(task=>!$('#stagefilter').value || task.stage===$('#stagefilter').value);
  if (!tasks.length) return;
  $('#table').innerHTML+='<tbody><tr><td colspan="8" class="followup-group">مهام المشروع المستحقة وبدون موعد · '+tasks.length+'</td></tr>'+tasks.map(task=>'<tr><td>'+esc(task.projectId)+'</td><td>'+esc(projects.find(project=>project.id===task.projectId)?.name)+'</td><td>'+esc(task.title)+'<div class="sub">'+esc(columnTitle(task.stage))+'</div></td><td>'+esc(task.engineer)+'</td><td>مفتوحة</td><td>'+esc(task.date || 'بدون موعد')+'</td><td>'+esc(task.note)+'</td><td><button type="button" class="btn xs" data-task-toggle="'+esc(task.id)+'" '+(!canManageTask(task)?'disabled':'')+'>إنجاز</button></td></tr>').join('')+'</tbody>';
}
function openProjectHistory(id) {
  if (!managerPreview())return toast('سجل التغييرات متاح للمدير');
  const project=projects.find(project=>project.id===id);
  if (!project)return;
  const entries=(db.activity || []).filter(entry=>entry.project===id).slice().reverse();
  const format=value=>value==null?'—':typeof value==='object'?JSON.stringify(value):String(value);
  show('سجل المشروع '+id,project.name,'<p class="sub">آخر التغييرات المحفوظة في سجل التدقيق، بحد أقصى 500 تغيير للنظام.</p>'+operationTable(['الوقت','بواسطة','التغيير','قبل','بعد'],entries.map(entry=>[esc(entry.at),esc(entry.by),esc(entry.field),esc(format(entry.before)),esc(format(entry.after))])), 'documentHub');
}
function renderOperations() {
  if(!Object.hasOwn(operationViews,view))return false;
  if(['dashboard','reports'].includes(view)&&!managerPreview()){view='projects';return false;}
  $('#usersPanel').hidden=false;
  for(const id of ['primaryFilters','secondaryFilters','gridHint','gridViewport','stats','table-scroll-top'])$('#'+id).hidden=true;
  $('#pageTitle').textContent=operationViews[view];
  refreshInterface();
  const buttons=[['ownersTab','owners'],['tasksTab','tasks'],['dashboardTab','dashboard'],['reportsTab','reports'],['archiveTab','archive']];
  for(const id of ['projectsTab','documentsTab','tenderTab','superTab','followupTab'])$('#'+id).className='btn';
  for(const [id,name] of buttons){$('#'+id).className='btn '+(view===name?'primary':'');$('#'+id).hidden=['dashboard','reports'].includes(name)&&!managerPreview();}
  const search='<div class="operation-toolbar"><input id="operationSearch" aria-label="بحث في القسم" placeholder="بحث بالاسم أو رقم المشروع أو المهمة…" value="'+esc(operationQuery)+'"><button type="button" class="btn" id="operationSearchButton">بحث</button><button type="button" class="btn" id="operationSearchClear">مسح</button></div>';
  const matches=values=>!operationQuery || values.some(value=>normalizeSearch(value).includes(normalizeSearch(operationQuery)));
  const matchesScope = project => (!focusedProjectId || project.id === focusedProjectId) &&
    (!onlyMine || !previewUser || projectAssignedTo(project, previewUser));
  let content='';
  if(view==='owners') content=search+'<p class="sub">كل ملف يجمع مشاريع المالك المرتبطة به. الربط يدوي؛ تشابه الأسماء لا يدمج الملفات تلقائيًا.</p>'+operationTable(['المالك','الهاتف','البريد','المشاريع','الملف'],ownerGroups().filter(group=>group.projects.some(project=>matchesScope(project)&&projectMatchesSearch(project,operationQuery))).map(group=>[esc(group.project.name),esc(group.project.info?.phone || '—'),esc(group.project.info?.email || '—'),esc(group.projects.map(project=>project.id).join('، ')),'<button type="button" class="btn xs" data-owner-profile="'+esc(group.project.id)+'">فتح الملف</button>']));
  if(view==='tasks') content=search+'<div class="operation-toolbar">'+(managerPreview()?'<button type="button" class="btn primary" id="newProjectTask">＋ مهمة جديدة</button>':'')+[['open','المفتوحة'],['done','المنجزة'],['all','كل المهام']].map(([value,label])=>'<button type="button" class="btn '+(taskScope===value?'primary':'')+'" data-task-scope="'+value+'">'+label+'</button>').join('')+'</div>'+taskTable(relevantTasks().filter(task=>(taskScope==='all'||task.status===taskScope)&&(matches([task.title,task.projectId,task.engineer,task.note])||projectMatchesSearch(projects.find(project=>project.id===task.projectId)||{},operationQuery))));
  if(view==='archive')content=search+'<p class="sub">المشاريع المغلقة DONE فقط. المشاريع المعلقة HOLD تظل ضمن المتابعة. الإغلاق لا يعني اكتمال الاعتمادات.</p>'+operationTable(['المشروع','المالك','الوصف','السجل','المشروع البديل'],projects.filter(project=>matchesScope(project)&&project.stages.design.status==='DONE'&&projectMatchesSearch(project,operationQuery)).map(project=>[esc(project.id),esc(project.name),esc(project.desc),managerPreview()?'<button type="button" class="btn xs" data-project-history="'+esc(project.id)+'">سجل المشروع</button>':'—','<button type="button" class="btn xs" data-reopen="'+esc(project.id)+'">مشروع جديد مرتبط</button>']));
  if(['dashboard','reports'].includes(view))content=operationalSummary();
  $('#usersPanel').innerHTML='<section class="user-card"><h2>'+operationViews[view]+'</h2>'+content+'</section>';
  if($('#operationSearchButton'))$('#operationSearchButton').onclick=()=>{operationQuery=$('#operationSearch').value.trim();render();};
  if($('#operationSearchClear'))$('#operationSearchClear').onclick=()=>{operationQuery='';render();};
  if($('#operationSearch'))$('#operationSearch').oninput=event=>{const value=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{operationQuery=value.trim();render();const input=$('#operationSearch');input.focus();input.setSelectionRange(value.length,value.length);},180);};
  if($('#operationSearch'))$('#operationSearch').onkeydown=event=>{if(event.key==='Enter'){$('#operationSearchButton').click();}};
  if(managerPreview() && view==='tasks')$('#newProjectTask').onclick=()=>openTaskForm();
  return true;
}
function operationalSummary() {
  const active=projects.filter(project=>!stopped(project));
  const stages=active.flatMap(project=>Object.entries(project.stages).filter(([key])=>!(key==='gas' && project.service==='FEWA')).map(([key,stage])=>({project,key,stage})));
  const open=stages.filter(({stage})=>!['OK','N/A','DONE','HOLD'].includes(stage.status));
  const unassigned=open.filter(({stage})=>!stage.engineer).length;
  const expiry=projects.flatMap(project=>[...documentList(project).filter(entry=>entry.status!=='لا يلزم').map(entry=>({project,label:entry.name,date:entry.expiry})),...requestList(project).filter(entry=>requestApplicable(project,entry)&&entry.status!=='لا يلزم').map(entry=>({project,label:entry.name,date:entry.expiry})),...['plotGovernmentExpiry','plotPrivateExpiry'].map((key,index)=>({project,label:index?'الخارطة المِلك':'الخارطة الحكومية',date:project.info?.[key]}))]).filter(item=>expiryNote(item.date));
  const cards=[['مشاريع جارية',active.length],['مشاريع بها تأخير',active.filter(islate).length],['بنود بلا مسؤول',unassigned],['مهام مفتوحة',taskList().filter(task=>task.status==='open'&&!taskBlocked(task)).length]];
  if(view==='dashboard')return '<div class="operation-kpis">'+cards.map(([label,count])=>'<div><span>'+label+'</span><b>'+count+'</b></div>').join('')+'</div><h3>مشاريع تحتاج متابعة</h3>'+operationTable(['المشروع','المالك','متطلبات الإجازة الناقصة','بنود متأخرة','مهام مستحقة'],active.map(project=>['<button type="button" class="btn xs" data-focus-project="'+esc(project.id)+'">'+esc(project.id)+'</button>',esc(project.name),esc(missing(project).join('، ') || 'المتطلبات مكتملة'),String(open.filter(item=>item.project===project&&late(item.stage)).length),String(taskList().filter(task=>task.projectId===project.id&&task.status==='open'&&(!task.date||task.date<=today())).length)]))+'<p class="sub">مستندات منتهية أو تنتهي خلال أسبوعين: '+expiry.length+' · تفاصيل الأقسام وحمل الفريق والمستندات في التقارير.</p>';
  return '<div class="operation-kpis">'+cards.map(([label,count])=>'<div><span>'+label+'</span><b>'+count+'</b></div>').join('')+'</div><h3>الاعتمادات حسب القسم</h3>'+operationTable(['القسم','مطلوب / قيد العمل','تم التقديم','ملاحظات','مكتمل أو لا يلزم'],keys.map(key=>{const rows=stages.filter(item=>item.key===key);const count=(bucket,value)=>'<button type="button" class="btn xs" data-report-stage="'+key+'" data-report-bucket="'+bucket+'">'+value+'</button>';return [esc(columnTitle(key)),count('work',rows.filter(({stage})=>!['SUB','COM','OK','N/A'].includes(stage.status)).length),count('SUB',rows.filter(({stage})=>stage.status==='SUB').length),count('COM',rows.filter(({stage})=>stage.status==='COM').length),count('complete',rows.filter(({stage})=>['OK','N/A'].includes(stage.status)).length)];}))+
    '<h3>حمل المهندسين — البنود المفتوحة</h3>'+operationTable(['المهندس','بنود مفتوحة','متأخر','بدون موعد','مهام مفتوحة'],projectUsers().map(user=>{const rows=open.filter(({stage})=>stage.engineer===user.name);return [esc(user.name)+(user.active===false?' (موقوف)':''),String(rows.length),String(rows.filter(({stage})=>late(stage)).length),String(rows.filter(({stage})=>!stage.date).length),String(taskList().filter(task=>task.engineer===user.name&&task.status==='open'&&!taskBlocked(task)).length)];}))+
    '<h3>المستندات المنتهية أو التي تنتهي خلال أسبوعين</h3>'+operationTable(['المشروع','المالك','المستند','الانتهاء','التنبيه'],expiry.map(item=>['<button type="button" class="btn xs" data-focus-document-view="expiring" data-focus-view="documents" data-focus-project="'+esc(item.project.id)+'">'+esc(item.project.id)+'</button>',esc(item.project.name),esc(item.label),esc(item.date),esc(expiryNote(item.date))]))+
    '<p class="sub">الأعداد تخص الوضع الحالي للمشاريع الجارية. لا تمثل تقييمًا لأداء المهندس أو مدد اعتماد تاريخية.</p>';
}
function initOperations() {
  for(const [id,name] of [['ownersTab','owners'],['tasksTab','tasks'],['dashboardTab','dashboard'],['reportsTab','reports'],['archiveTab','archive']])$('#'+id).onclick=()=>{operationQuery='';view=name;render();};
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button || button.disabled)return;
    try{
      if(button.dataset.ownerProfile)openOwnerProfile(button.dataset.ownerProfile);
      if(button.dataset.projectHistory)openProjectHistory(button.dataset.projectHistory);
      if(button.dataset.taskEdit)openTaskForm(button.dataset.taskEdit);
      if(button.dataset.taskScope){taskScope=button.dataset.taskScope;render();}
      if(button.dataset.taskToggle){const task=taskList().find(task=>task.id===button.dataset.taskToggle);if(!task || taskBlocked(task))throw Error('المشروع متوقف');saveProjectTask(task.id,{...task,status:task.status==='done'?'open':'done'});persist();}
    }catch(error){toast(error.message);}
  });
}
