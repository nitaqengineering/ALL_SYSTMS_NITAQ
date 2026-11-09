function engineerPermissions(name) {
  const account=projectUsers().find(user=>user.name===name);
  if(account?.active===false)return {edit:false,assign:false};
  if(['مدير','مالك'].includes(account?.role))return {edit:true,assign:true};
  const saved=account?.permissions ?? db.permissions?.[name];
  return saved==null ? {edit:true,assign:false} : {edit:saved.edit===true,assign:saved.assign===true};
}

function canEditStage(stage) {
  return managerPreview() || (stage.engineer===previewUser && engineerPermissions(previewUser).edit);
}

function canAssignStage() {
  return managerPreview() || engineerPermissions(previewUser).assign;
}

function trimActivity() {
  if(db.activity?.length>500) db.activity.splice(0,db.activity.length-500);
}

function recordChanges(before, after) {
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  const entries = db.activity ??= [];
  function record(project, field, oldValue, newValue, target) {
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
    entries.push({at:new Date().toISOString(), by:previewUser || 'المدير (معاينة)', project, field, target, ...(target||[oldValue,newValue].every(value=>value==null||typeof value!=='object')?{before:oldValue??null,after:newValue??null}:{})});
  }
  const previousById = new Map([...previous.projects].reverse().map(project=>[project.id,project]));
  for (const project of current.projects) {
    const old = previousById.get(project.id);
    if (!old) { record(project.id,'إنشاء المشروع',null,project.id); continue; }
    if (JSON.stringify(old) === JSON.stringify(project)) continue;
    for (const [key, stage] of Object.entries(project.stages)) {
      for (const [field, label] of [['status','الحالة'],['date','الموعد'],['note','الملاحظات'],['engineer','المسؤول'],['type','نوع الطلب'],['exemptedBy','اعتماد لا يلزم']]) {
        record(project.id,columnTitle(key)+' · '+label,old.stages[key]?.[field],stage[field],['date','note'].includes(field)?{key,field}:undefined);
      }
    }
    for(const [field,label] of [['number','رقم الإجازة'],['date','تاريخ الإصدار'],['recordedBy','مسجل الإصدار']])record(project.id,label,old.permitIssue?.[field],project.permitIssue?.[field]);
    for(const key of keys){
      const previousWorkflow=old.workflow?.[key]||{},currentWorkflow=project.workflow?.[key]||{};
      for(const section of ['blocker','review']){
        const names={reason:'سبب التعطيل',waitingOn:'منتظر من',nextAction:'الخطوة القادمة',actionOwner:'مسؤول المتابعة',due:'موعد المتابعة',note:'الملاحظات',revision:'رقم المراجعة',preparedBy:'أعدها',checkedBy:'راجعها',status:'حالة المراجعة',date:'التاريخ',authorizedBy:'المصرح'};
        for(const [field,label]of Object.entries(names))record(project.id,columnTitle(key)+' · '+label,previousWorkflow[section]?.[field],currentWorkflow[section]?.[field]);
      }
      const oldCycles=new Map((previousWorkflow.submissions||[]).map(cycle=>[cycle.id,cycle]));
      for(const cycle of currentWorkflow.submissions||[]){const before=oldCycles.get(cycle.id);for(const [field,label]of Object.entries({reference:'رقم المعاملة',revision:'المراجعة المقدمة',submitted:'تاريخ التقديم',outcome:'نتيجة الجهة',responseDate:'تاريخ الرد',comments:'ملاحظات الجهة',responseOwner:'مسؤول الرد',resubmitBy:'موعد الرد'}))record(project.id,columnTitle(key)+' · '+label,before?.[field],cycle[field]);}
    }
    for (const [field, label] of Object.entries({accountingProjectId:'معرف مشروع الحسابات',accountingProjectName:'اسم المشروع بالحسابات',landType:'نوع الأرض',name:'المالك',desc:'الوصف',descEn:'الوصف بالإنجليزي',location:'الموقع',clientId:'ربط ملف المالك',owner:'مسؤول المشروع',info:'بيانات المالك والأرض',documents:'المستندات',requests:'الطلبات',contract:'عقد المقاول',permit:'إجازة البناء',tender:'بيانات المناقصة',extra:'قيم الأعمدة الإضافية',projectType:'نوع المشروع',workKind:'طبيعة الأعمال',service:'جهة الخدمات',telecom:'جهة الاتصالات',system:'نظام البلدية',municipality:'البلدية',sketch:'رقم الاسكتش'})) {
      record(project.id,label,old[field],project[field]);
    }
  }
  if (current.projects.length < previous.projects.length) {
    for (const old of previous.projects.filter(p=>!current.projects.some(n=>n.id===p.id))) record(old.id,'التراجع عن إضافة المشروع',old.id,null);
  }
  record('—','القوائم والإعدادات',previous.custom,current.custom);
  record('—','تنظيم الأعمدة',previous.columnLayout,current.columnLayout);
  record('—','البلديات',previous.municipalities,current.municipalities);
  const oldUsers=new Map((previous.users||[]).map(user=>[user.id,user]));
  for(const user of current.users||[]){
    const oldUser=oldUsers.get(user.id);
    for(const [key,label] of [['name','الاسم'],['email','البريد'],['role','الدور'],['active','الحالة']]){
      record('—','مستخدم '+user.name+' · '+label,oldUser?.[key],user[key]);
    }
    for(const [key,label] of [['edit','تعديل المسند'],['assign','الإسناد']]){
      record('—','مستخدم '+user.name+' · '+label,oldUser?.permissions?.[key],user.permissions?.[key]);
    }
  }
  const oldTasks=new Map((previous.tasks||[]).map(task=>[task.id,task]));
  for(const task of current.tasks||[]) {
    const old=oldTasks.get(task.id);
    for(const [key,label] of [['title','العنوان'],['stage','القسم'],['engineer','المسؤول'],['date','الموعد'],['status','الحالة'],['note','الملاحظات'],['projectId','المشروع']])record(task.projectId,'مهمة '+task.title+' · '+label,old?.[key],task[key]);
  }
  for(const task of previous.tasks||[])if(!(current.tasks||[]).some(item=>item.id===task.id))record(task.projectId,'التراجع عن إضافة مهمة',task.title,null);
  trimActivity();
}

const permissionPresets=[
  {label:'قراءة فقط',edit:false,assign:false},
  {label:'مهندس منفذ',edit:true,assign:false},
  {label:'مسؤول إسناد',edit:false,assign:true},
  {label:'منسق ومهندس منفذ',edit:true,assign:true}
];

function openPermissions() { openUsers(); }

function restorableActivity(entry) {
  const target=entry?.target;
  if(!target||!['date','note'].includes(target.field)) return null;
  const stage=projects.find(p=>p.id===entry.project&&!stopped(p))?.stages[target.key];
  if(!stage||(stage[target.field]??null)!==entry.after) return null;
  const latest=db.activity.findLast(event=>event.project===entry.project &&
    (['إنشاء المشروع','التراجع عن إضافة المشروع'].includes(event.field) ||
      (event.target?.key===target.key && event.target?.field===target.field)));
  return latest===entry?stage:null;
}

function activityValue(entry,key) {
  if(!Object.hasOwn(entry,key)) return '—';
  const value=entry[key];
  return value===true?'نعم':value===false?'لا':value||'—';
}

let activityReturnView='projects';
function openActivity() {
  if(!managerPreview())return;
  if(view!=='activity')activityReturnView=view;
  $('#activity').closest?.('details')?.removeAttribute('open');
  view='activity';
  render();
}

function renderActivityPage(){
  $('#usersPanel').innerHTML='<section class="user-card activity-page"><div class="users-heading"><div><h2>سجل التغييرات</h2><p>كل المشاريع · توقيت دبي</p></div><button type="button" class="btn" id="activityBack">رجوع</button></div><p id="activityError" role="status"></p>'+activityTable()+'</section>';
  $('#activityBack').onclick=()=>{view=activityReturnView;render();};
}

function activityTable(){
  const rows=(db.activity||[]).map((entry,index)=>({entry,index})).slice(-500).reverse().map(({entry,index})=>
    `<tr><td>${esc(entry.project)}</td><td>${esc(entry.by)}</td><td>${esc(entry.field)}</td>
    <td>${esc(activityValue(entry,'before'))}</td><td>${esc(activityValue(entry,'after'))}</td>
    <td>${esc(new Date(entry.at).toLocaleString('ar-AE',{timeZone:'Asia/Dubai'}))}</td>
    <td>${restorableActivity(entry)?'<button type="button" class="btn xs" data-restore-activity="'+index+'">استرجاع</button>':''}</td></tr>`).join('');
  return '<p>يمكن استرجاع آخر تغيير في الموعد أو الملاحظات لكل بند. القيم تظهر للتعديلات الجديدة على الحقول الفردية. يعرض السجل آخر 500 بند تغيير.</p>'+
    '<div class="activity-scroll"><table class="doc-list"><thead><tr><th>المشروع</th><th>المستخدم</th><th>التعديل</th><th>قبل</th><th>بعد</th><th>الوقت</th><th></th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="7">لا توجد تعديلات مسجلة بعد</td></tr>')+'</tbody></table></div>';
}

function openLists() {
  if(!managerPreview())return;
  show('القوائم','اختيارات النماذج والجدول',
    '<div class="column-actions"><button type="button" class="btn" id="listValues">الحالات والبلديات</button>'+
    '<button type="button" class="btn" id="listColumns">إدارة الأعمدة</button>'+
    '<button type="button" class="btn" id="listFilters">الفلاتر المحفوظة</button></div>',
    'documentHub');
  $('#listValues').onclick=openLookupSettings;
  $('#listColumns').onclick=()=>openColumns();
  $('#listFilters').onclick=()=>{
    $('#edit').close();
    $('#savedFilters').focus();
  };
}

document.addEventListener('click',event=>{
  const control=event.target.closest('[data-restore-activity]');
  if(!control||!managerPreview())return;
  const entry=db.activity?.[Number(control.dataset.restoreActivity)];
  const stage=restorableActivity(entry);
  if(!stage){$('#activityError').textContent='الحقل اتغيّر بعد فتح السجل';return}
  if(!confirm('استرجاع القيمة السابقة لهذا الحقل؟'))return;
  stage[entry.target.field]=entry.before??'';
  persist();
  $('#activityError').textContent=saveWarning;
});

const filterFields=['search','engineer','filter','stagefilter','statefilter'];
function refreshSavedFilters() {
  const list=$('#savedFilters');
  const selected=list.value;
  const names=Object.keys(db.savedFilters||{});
  const signature=JSON.stringify(names);
  if(list.dataset?.names===signature)return;
  if(list.dataset)list.dataset.names=signature;
  list.innerHTML='<option value="">الفلاتر المحفوظة</option>'+opts(names,selected);
}

function initAdmin() {
  $('#permissions').onclick=openPermissions;
  $('#activity').onclick=openActivity;
  $('#saveFilter').onclick=()=>show('حفظ الفلتر الحالي','اكتب اسم القائمة',field('اسم الفلتر','filterName',''),'saveFilter');
  $('#savedFilters').onchange=event=>{
    const name=event.target.value;
    const values=Object.hasOwn(db.savedFilters||{},name)?db.savedFilters[name]:null;
    if (!values) return;
    focusedProjectId='';
    reportDrill=null;
    for(const key of filterFields.slice(0,-1)) $('#'+key).value=values[key] ?? (key==='filter'?'all':'');
    if(!$('#filter').value)$('#filter').value='all';
    updateFilter();
    $('#statefilter').value=values.statefilter||'';
    if($('#statefilter').selectedIndex===-1)$('#statefilter').value='';
    onlyMine=!!previewUser && !!values.onlyMine;
    render();
  };
  $('#deleteFilter').onclick=()=>{
    const name=$('#savedFilters').value;
    if(!name||!Object.hasOwn(db.savedFilters||{},name))return;
    delete db.savedFilters[name];
    writeDb('تم حذف الفلتر');
  };
}

function saveFilter() {
  const name=$('#filterName').value.trim();
  if(!name)throw Error('اسم الفلتر مطلوب');
  const values=Object.fromEntries(filterFields.map(key=>[key,$('#'+key).value]));
  db.savedFilters={...db.savedFilters,[name]:{...values,onlyMine}};
}
