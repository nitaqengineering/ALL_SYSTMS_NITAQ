const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const standard=['REQ','READY','SUB','COM','OK','N/A'],design=['REQ','HOLD','DONE','OK'],permitStates=['بانتظار المتطلبات','جاهز للإصدار','تم التقديم','صدرت'];
const projectTypes=['غير محدد','سكني — منح إسكان والشيخ زايد','سكني استثماري','تجاري','صناعي','حكومي'];
const workKinds=['غير محدد','REQ — مطلوب','ADD — إضافة','MOD — تعديل','MOD SUPERVISION — تعديل إشراف'];
function feeInfo(type){return ({'سكني — منح إسكان والشيخ زايد':'معفى من رسوم المستندات والمخططات','سكني استثماري':'الرسوم حسب المساحة','تجاري':'برسوم','صناعي':'برسوم','حكومي':'حسب الجهة — الإعفاء يتطلب رسالة من الجهة'})[type]||'معاملة الرسوم غير محددة'}
function detailsFields(p){return select('نوع المشروع','projecttype',projectTypes,p?.projectType||'غير محدد')+select('طبيعة الأعمال','workkind',workKinds,p?.workKind||'غير محدد')+'<p class="sub">طبيعة الأعمال مستقلة عن حالة تقدم الأقسام. بيان الرسوم إرشادي، ولا يحسب مبالغ.</p>'+field('وصف المشروع بالعربي','detailsdesc',p?.desc||'')+field('وصف المشروع بالإنجليزي','detailsdescEn',p?.descEn||p?.info?.descriptionEn||'')}
function detailValues(){const projectType=$('#projecttype').value,workKind=$('#workkind').value;if(!projectTypes.includes(projectType)||!workKinds.includes(workKind))throw Error('تصنيف مشروع غير متاح');return {projectType,workKind,desc:$('#detailsdesc').value.trim(),descEn:$('#detailsdescEn').value.trim()}}
function detailsCell(p){return `<td class="project-details"><button class="owner" data-details="${esc(p.id)}" title="تعديل تفاصيل المشروع">${esc(p.projectType||'غير محدد')} <span style="color:#a9824f">✎</span></button><div class="sub" style="color:#132a46">${esc(p.workKind||'غير محدد')}</div><div class="sub">${esc(p.desc)||'—'}</div>${p.descEn?'<div class="sub" dir="ltr">'+esc(p.descEn)+'</div>':''}<div class="sub fee-note">${esc(feeInfo(p.projectType))}</div></td>`}
const labels={REQ:'مطلوب / جارٍ العمل',READY:'جاهز',SUB:'تم التقديم',COM:'ملاحظات',OK:'معتمد', 'N/A':'لا يلزم',HOLD:'إيقاف مؤقت بطلب المالك',DONE:'مغلق نهائيًا'};
const groups=[['design','التصميم',['design']],['planning','التخطيط',['planning']],['coordination','COORDINATION — تنسيق المخططات',['coordination']],['services','اعتمادات الخدمات',['electric','water','gas']],['telecom','الاتصالات',['telecom']],['civil','الدفاع المدني',['civil']],['struct','الإنشائي',['struct']],['sanitary','الصحي',['sanitary']],['municipal','البلدية',['munArch','munStruct','munSanitary']],['tender','قسم المناقصات',['tender']]];
const titles={design:'التصميم',planning:'التخطيط',coordination:'تنسيق ومطابقة المخططات',electric:'الكهرباء',water:'المياه',gas:'الغاز',telecom:'الاتصالات',civil:'الدفاع المدني',struct:'إعداد الإنشائي',sanitary:'إعداد الصحي',munArch:'اعتماد المعماري',munStruct:'اعتماد الإنشائي',munSanitary:'اعتماد الصحي',tender:'قسم المناقصات'};
const keys=Object.keys(titles),approvalKeys=['planning','electric','water','gas','telecom','civil','munArch','munStruct','munSanitary'];const people=['أحمد','مروة','عمر','سيد'];const storage='nitaq-project-demo-v2';let opened=new Set(),view='projects',editing=null,saveWarning='';
function fresh(){return Object.fromEntries(keys.map(k=>[k,{status:'REQ',engineer:'',date:'',note:'',type:'جديد'}]))}
function seed(){return ['محمد الكعبي','عبدالله المنصوري','خالد الشامسي','حمد المزروعي','سالم القاسمي','راشد النعيمي'].map((name,i)=>{let p={id:String(105+i),sketch:String(4011+i),name,desc:'فيلا سكنية',location:'الشارقة / '+['الرحمانية','السيوح','حوشي'][i%3],owner:people[i%4],service:i===2?'FEWA':'SEWA',telecom:i%2?'دو':'اتصالات',system:i===3?'نظام البلديات الموحد':'بلدية الشارقة',municipality:i===3?'المدام':'الشارقة',contract:i===4,permit:i===4?'صدرت':'بانتظار المتطلبات',parent:'',stages:fresh(),supervision:{status:'لم يبدأ',engineer:'',note:''},history:[]};keys.forEach(k=>p.stages[k].engineer=p.owner);p.stages.design.status=i===1?'HOLD':i===5?'DONE':'OK';if(i===4)approvalKeys.forEach(k=>p.stages[k].status='OK');else{p.stages.planning.status=i%2?'SUB':'COM';p.stages.planning.note='مراجعة مستندات التقديم';}if(p.service==='FEWA')p.stages.gas.status='N/A';return p})}
const storageCompressionPrefix = 'nitaq-deflate-v1:';

function decodeStoredDatabase(value) {
  if (!value.startsWith(storageCompressionPrefix)) return value;
  const bytes = Uint8Array.from(atob(value.slice(storageCompressionPrefix.length)), char => char.charCodeAt(0));
  return fflate.strFromU8(fflate.inflateSync(bytes));
}

function encodeStoredDatabase(json) {
  if (json.length < 256 * 1024) return json;
  const bytes = fflate.deflateSync(fflate.strToU8(json), {level: 1});
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  const compressed = storageCompressionPrefix + btoa(binary);
  return compressed.length < json.length ? compressed : json;
}

let loadedStorage = null;
let storageReadFailed = false;

function validDatabase(data) {
  return !!data && Array.isArray(data.projects) && !!data.custom &&
    typeof data.custom === 'object' && Array.isArray(data.municipalities) &&
    (data.documentColumns===undefined || Array.isArray(data.documentColumns) &&
      data.documentColumns.every(column=>column && typeof column.id==='string' && column.id.startsWith('doc-') &&
        typeof column.name==='string' && column.name.trim() && ['text','number','date'].includes(column.type)) &&
      new Set(data.documentColumns.map(column=>column.id)).size===data.documentColumns.length) &&
    (data.tasks===undefined || Array.isArray(data.tasks) && new Set(data.tasks.map(task=>task?.id)).size===data.tasks.length && data.tasks.every(task=>task && typeof task.id==='string' && typeof task.title==='string' && typeof task.engineer==='string' && typeof task.note==='string' && typeof task.date==='string' && ['open','done'].includes(task.status) && keys.includes(task.stage) && data.projects.some(project=>project.id===task.projectId))) &&
    data.projects.every(project=>project && typeof project.id==='string' &&
      project.supervision && keys.every(key=>['coordination','tender'].includes(key) ||
        typeof project.stages?.[key]?.status==='string'));
}

function migrate(){try{
  loadedStorage=localStorage.getItem(storage);
  if(loadedStorage!==null){
    const data=JSON.parse(decodeStoredDatabase(loadedStorage));
    if(!validDatabase(data))throw Error('Invalid saved database');
    return data;
  }
const old=JSON.parse(localStorage.getItem('nitaq-project-demo-v1'));if(Array.isArray(old)&&old.length){const map={'مطلوب':'REQ','تحت العمل':'REQ','تحت المراجعة':'REQ','بانتظار المالك':'READY','تم التقديم':'SUB','ملاحظات':'COM','معتمد':'OK','مكتمل':'OK','لا يلزم':'N/A','معلق':'REQ'};return {projects:old.map(o=>{let p={...o,service:'SEWA',telecom:'اتصالات',system:'بلدية الشارقة',municipality:'الشارقة',contract:false,permit:'بانتظار المتطلبات',parent:'',supervision:{status:'لم يبدأ',engineer:'',note:''},history:[],stages:fresh()};['design','planning','electric','telecom','civil','struct','munArch'].forEach((k,j)=>{if(o.stages[j])p.stages[k]={...p.stages[k],...o.stages[j],status:map[o.stages[j].status]||'REQ'}});p.stages.design.status=o.hold?'HOLD':p.stages.design.status==='OK'?'OK':'REQ';return p}),custom:{},municipalities:['الشارقة','المدام','الحمرية']}}}catch{
  storageReadFailed=true;
  saveWarning='تعذّرت قراءة البيانات المحفوظة. الحفظ متوقف لحماية الأصل. استخدم النسخ الاحتياطي لاستعادتها.';
  return {projects:[],custom:{},municipalities:['الشارقة','المدام','الحمرية']};
}return {projects:seed(),custom:{},municipalities:['الشارقة','المدام','الحمرية']}}
let db=migrate(),projects=db.projects;
function normalizeCoordination(data){let changed=false;(data.projects||[]).forEach(p=>{if(!p.stages.tender){p.stages.tender={status:['HOLD','DONE'].includes(p.stages.design.status)?p.stages.design.status:'REQ',engineer:'',date:'',note:''};changed=true}if(!p.stages.coordination){p.stages.coordination={status:['HOLD','DONE'].includes(p.stages.design.status)?p.stages.design.status:'REQ',engineer:'',date:'',note:'',type:'جديد'};changed=true}else if(!['REQ','COM','OK','HOLD','DONE'].includes(p.stages.coordination.status)){p.stages.coordination.legacyStatus=p.stages.coordination.status;p.stages.coordination.status='REQ';changed=true}});return changed}
function migrateCoordination(){let changed=normalizeCoordination(db);if(db.undo){for(const part of ['before','after']){try{const prior=JSON.parse(db.undo[part]);if(normalizeCoordination(prior)){db.undo[part]=JSON.stringify(prior);changed=true}}catch{db.undo=null;changed=true;break}}}if(changed){try{storeDatabase(db)}catch{saveWarning='تعذر حفظ إضافة مرحلة التنسيق؛ موجودة في الجلسة فقط'}}}
const stopped=p=>['HOLD','DONE'].includes(p.stages.design.status);const activeKeys=p=>approvalKeys.filter(k=>!(k==='gas'&&p.service==='FEWA'));function missing(project){
  const requirements=project.contract?[]:['عقد مقاول موقّع'];
  for(const key of activeKeys(project)){
    const stage=project.stages[key];
    if(stage.status==='N/A'&&stage.exemptedBy)continue;
    const submission=latestSubmission(workflowStage(project,key).submissions);
    if(submission&&submission.outcome!=='اعتماد'){
      requirements.push(titles[key]+' — '+submission.outcome+' ('+submission.reference+')');
    }else if(project.stages[key].status==='N/A'&&!project.stages[key].exemptedBy){
      requirements.push(titles[key]+' — استثناء غير معتمد');
    }else if(!['OK','N/A'].includes(project.stages[key].status)){
      requirements.push(titles[key]);
    }
  }
  return requirements;
}
const ready=p=>missing(p).length===0;function permit(p){if(stopped(p))return p.stages.design.status;if(p.permit==='صدرت')return 'صدرت';return !ready(p)?'بانتظار المتطلبات':['تم التقديم','صدرت'].includes(p.permit)?p.permit:'جاهز للإصدار'}const dubaiDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'});const today=()=>dubaiDate.format(new Date());const late=s=>s.date&&s.date<today()&&!['OK','N/A','DONE'].includes(s.status);const islate=p=>!stopped(p)&&Object.entries(p.stages).some(([key,stage])=>!(key==='gas'&&p.service==='FEWA')&&late(stage));
function audit(p,event){(p.history??=[]).push({at:new Date().toISOString(),event,stages:JSON.parse(JSON.stringify(p.stages)),permit:p.permit,contract:p.contract,supervision:{...p.supervision}})}
function propagateStop(p,status){keys.filter(k=>k!=='design').forEach(k=>p.stages[k].status=status);p.supervision.status=status}
function changeDesign(p,next){const old=p.stages.design.status;if(!design.includes(next))throw Error('حالة تصميم غير متاحة');if(old==='DONE'&&next!=='DONE')throw Error('المشروع مغلق نهائيًا؛ افتح مشروعًا جديدًا مرتبطًا به');if(old===next)return;if(old==='HOLD'&&next==='OK')throw Error('لفك الإيقاف اختر REQ؛ تبدأ جميع المراحل من جديد');if(['HOLD','DONE'].includes(next)&&typeof confirm==='function'&&!confirm(next==='DONE'?'إغلاق المشروع وكل أقسامه نهائيًا؟':'إيقاف العمل في كل أقسام المشروع؟'))throw Error('تم إلغاء تغيير الحالة');audit(p,'تغيير التصميم من '+old+' إلى '+next);if(next==='HOLD'||next==='DONE'){propagateStop(p,next)}else if(next==='OK'||old==='HOLD'){keys.filter(k=>k!=='design').forEach(k=>{p.stages[k].status='REQ';delete p.stages[k].exemptedBy});p.permit='بانتظار المتطلبات';p.supervision.status='لم يبدأ'}p.stages.design.status=next}
function stageStates(p,k){if(k==='design'&&p.stages.design.status==='HOLD')return ['HOLD','REQ','DONE'];return [...new Set([...states(k),p.stages[k].status])]}
function updateStage(p,k,next){if(!canEditStage(p.stages[k]||{}))throw Error('تعديل البند متاح للمسؤول عنه حسب الصلاحيات');if(!keys.includes(k))throw Error('مرحلة غير متاحة');if(k==='design'){changeDesign(p,next);return}if(stopped(p))throw Error('المشروع متوقف بسبب '+p.stages.design.status);if(k==='gas'&&p.service==='FEWA')throw Error('الغاز غير متاح لدى الجهة');if(!states(k).includes(next))throw Error('حالة غير متاحة');const stage=p.stages[k];const exemption=next==='N/A'&&approvalKeys.includes(k);
if(exemption&&!stage.exemptedBy&&!managerPreview())throw Error('اعتماد «لا يلزم» لهذا البند متاح للمدير');
if(stage.status===next&&(!exemption||stage.exemptedBy))return;
audit(p,'تغيير '+columnTitle(k)+' إلى '+next);
if(exemption)stage.exemptedBy=previewUser||'المدير (معاينة)';
else delete stage.exemptedBy;p.stages[k].status=next;if(!ready(p)&&p.permit!=='صدرت')p.permit='بانتظار المتطلبات'}
function setPermit(project,next,issue){
  if(!managerPreview())throw Error('تسجيل حالة الإجازة متاح للمدير');
  if(stopped(project)||!ready(project))throw Error('يجب استكمال متطلبات إجازة البناء أولًا');
  if(!permitStates.slice(1).includes(next))throw Error('حالة إجازة غير متاحة');
  if(next==='صدرت'){
    const number=typeof issue?.number==='string'?issue.number.trim():'';
    if(!number||!issue.date)throw Error('رقم الإجازة وتاريخ الإصدار مطلوبان');
    checkWorkflowDate(issue.date,'تاريخ الإصدار');
    if(issue.date>today())throw Error('تاريخ الإصدار لا يمكن أن يكون مستقبلًا');
    project.permitIssue={...issue,number,recordedBy:previewUser||'المدير (معاينة)'};
  }
  audit(project,'إجازة البناء: '+next);
  project.permit=next;
}
function openPermitEditor(project,status){
  const issue=project.permitIssue||{};
  show('إجازة البناء',project.name,select('الحالة','permitstatus',permitStates.slice(1),status)+ '<div id="permitIssueFields">'+field('رقم الإجازة','permit-number',issue.number||'')+field('تاريخ الإصدار','permit-date',issue.date||'','date')+'</div>','permit',project.id);
  const statusInput=$('#permitstatus');
  const sync=()=>{
    const issuing=statusInput.value==='صدرت';
    $('#permitIssueFields').hidden=!issuing;
    for(const id of ['permit-number','permit-date']){ $('#'+id).disabled=!issuing; $('#'+id).required=issuing; }
  };
  statusInput.onchange=sync;
  sync();
}
function linkedProject(parent,values){if(parent&&parent.stages.design.status!=='DONE')throw Error('المشروع المرجعي يجب أن يكون مغلقًا');return {...values,clientId:parent?.clientId||undefined,info:parent?Object.fromEntries(sharedOwnerFields.map(key=>[key,parent.info?.[key]||''])):undefined,name:parent?parent.name:values.name,location:parent?parent.location:values.location,parent:parent?.id||'',contract:false,permit:'بانتظار المتطلبات',stages:fresh(),history:[],supervision:{status:'لم يبدأ',engineer:'',note:''}}}
function repairStopped(){let changed=false;projects.forEach(p=>{if(stopped(p)&&(keys.some(k=>p.stages[k].status!==p.stages.design.status)||p.supervision.status!==p.stages.design.status)){audit(p,'توحيد حالات الأقسام مع توقف التصميم — إصلاح بيانات النسخة السابقة');propagateStop(p,p.stages.design.status);changed=true}});if(changed){try{storeDatabase(db)}catch{saveWarning='تعذر حفظ تصحيح حالات الإيقاف؛ موجود في الجلسة فقط'}}}

let committedState='';
function snapshot(){return JSON.stringify({projects:db.projects,custom:db.custom,municipalities:db.municipalities,columnLayout:db.columnLayout??undefined,users:db.users??undefined,permissions:db.permissions??undefined,documentColumns:db.documentColumns??undefined,tasks:db.tasks??undefined})}
function undoLabel(before,after){const a=JSON.parse(before),b=JSON.parse(after);if(a.projects.length!==b.projects.length)return 'إضافة مشروع';const changed=b.projects.filter(p=>JSON.stringify(p)!==JSON.stringify(a.projects.find(x=>x.id===p.id)));if(changed.length===1){const p=changed[0],old=a.projects.find(x=>x.id===p.id);const stage=keys.find(k=>old?.stages[k].status!==p.stages[k].status);return 'مشروع '+p.id+(stage?' — '+columnTitle(stage):'')}return 'الإعدادات'}
function storeDatabase(data, restoring=false) {
  if(storageReadFailed && !restoring) throw Error(saveWarning);
  if(localStorage.getItem(storage)!==loadedStorage) {
    throw Error('تم تغيير البيانات في تبويب آخر. احفظ نسخة احتياطية من تعديلاتك هنا ثم أعد تحميل الصفحة.');
  }
  const serialized=encodeStoredDatabase(JSON.stringify(data));
  localStorage.setItem(storage,serialized);
  loadedStorage=serialized;
  storageReadFailed=false;
}

function writeDb(message) {
  try {
    storeDatabase(db);
    saveWarning='';
    if($('#edit').open)$('#dialogError').textContent='';
    toast(message);
  } catch(error) {
    saveWarning=error.name==='QuotaExceededError'
      ? 'مساحة التخزين ممتلئة. التعديلات الحالية في الجلسة فقط. نزّل نسخة احتياطية.'
      : 'لم يتم الحفظ. '+error.message;
    toast(saveWarning);
    if($('#edit').open)$('#dialogError').textContent=saveWarning;
  }
  renderKeepingFocus();
}
const undoLimit = 5;

// Detect stale undo history without storing a second full snapshot.
function undoSignature(snapshotText) {
  let first = 2166136261;
  let second = 5381;
  for (let i = 0; i < snapshotText.length; i++) {
    const code = snapshotText.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return snapshotText.length + ':' + (first >>> 0) + ':' + (second >>> 0);
}

function makeUndoEntry(before, after) {
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  const entry = {label: undoLabel(before, after), fields: {}, removedFields: []};

  for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    if (key === 'projects') continue;
    if (JSON.stringify(previous[key]) === JSON.stringify(current[key])) continue;
    if (Object.hasOwn(previous, key)) entry.fields[key] = previous[key];
    else entry.removedFields.push(key);
  }

  const oldProjects = previous.projects;
  const newProjects = current.projects;
  if (oldProjects.length === newProjects.length &&
      oldProjects.every((project, index) => project.id === newProjects[index].id)) {
    entry.projectChanges = [];
    for (let index = 0; index < oldProjects.length; index++) {
      if (JSON.stringify(oldProjects[index]) !== JSON.stringify(newProjects[index])) {
        entry.projectChanges.push([index, oldProjects[index]]);
      }
    }
  } else {
    // Project creation or replacement can change the order. Retain the old list for those edits.
    entry.fields.projects = oldProjects;
  }
  return entry;
}

function restoreUndoEntry(entry, current) {
  if (typeof entry.before === 'string') return JSON.parse(entry.before);
  const previous = JSON.parse(current);
  for (const key of entry.removedFields) delete previous[key];
  Object.assign(previous, entry.fields);
  for (const [index, project] of entry.projectChanges || []) {
    previous.projects[index] = project;
  }
  return previous;
}

function persist() {
  reconcileOwnerChanges(committedState);
  const next = snapshot();
  if (committedState && next !== committedState) {
    recordChanges(committedState,next);
    const stack = db.undoStack;
    stack.push(makeUndoEntry(committedState,next));
    if (stack.length > undoLimit) stack.shift();
    db.undoAfter = undoSignature(next);
  }
  committedState = next;
  writeDb('تم الحفظ على هذا المتصفح');
}

function undoLast() {
  if(!managerPreview())return toast('التراجع العام متاح في معاينة المدير');
  const entry = db.undoStack.at(-1);
  if (!entry) return toast('لا يوجد تعديل متاح للتراجع');
  const current = snapshot();
  if (current !== committedState || undoSignature(current) !== db.undoAfter) {
    db.undoStack = [];
    delete db.undoAfter;
    writeDb('لم يعد هذا التراجع مطابقًا للبيانات الحالية');
    return;
  }
  const previous=restoreUndoEntry(entry,current);
  if(!previous.columnLayout)delete db.columnLayout;
  if(!previous.users)delete db.users;
  if(!previous.permissions)delete db.permissions;
  if(!previous.documentColumns)delete db.documentColumns;
  if(!previous.tasks)delete db.tasks;
  Object.assign(db,previous);
  syncUserChoices();
  projects = db.projects;
  db.undoStack.pop();
  committedState = snapshot();
  if (db.undoStack.length) db.undoAfter = undoSignature(committedState);
  else delete db.undoAfter;
  recordChanges(current,committedState);
  $('#edit').close();
  writeDb('تم التراجع واستعادة الحالة السابقة — '+entry.label);
  updateFilter(true);
}

function initUndo() {
  committedState = snapshot();
  const historyMatches = db.undoAfter === committedState || db.undoAfter === undoSignature(committedState);
  const stack = historyMatches && Array.isArray(db.undoStack)
    ? db.undoStack.slice(-undoLimit) : [];
  if (!stack.length && db.undo?.after === committedState) {
    stack.push({before:db.undo.before,label:db.undo.label});
  }
  db.undoStack = stack;
  if (stack.length) db.undoAfter = undoSignature(committedState);
  else delete db.undoAfter;
  delete db.undo;
}

function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3500)}
const coordLabels={REQ:'مطلوب / جارٍ المراجعة',COM:'توجد ملاحظات',OK:'تمت المطابقة',HOLD:labels.HOLD,DONE:labels.DONE};function stateLabel(k,s){return (k==='coordination'?coordLabels:labels)[s]||s}
function opts(arr,v,k){return arr.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(x)}${(k==='coordination'?coordLabels:labels)[x]?' — '+esc((k==='coordination'?coordLabels:labels)[x]):''}</option>`).join('')}
function field(label,id,v,type='text'){return `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(v)}">`}
function select(label,id,arr,v,k){return `<label for="${id}">${label}</label><select id="${id}">${opts(arr,v,k)}</select>`}
function states(k){return k==='coordination'?['REQ','COM','OK']:k==='design'?design:[...standard,...(db.custom[k]||[])]}function projectAssignedTo(project, engineer) {
  return project.owner === engineer || Object.values(project.stages).some(stage => stage.engineer === engineer);
}

function projectFilterStatus(project, stage) {
  if (stage === 'permit') return permit(project);
  if (stage === 'gas' && project.service === 'FEWA' && !stopped(project)) return 'N/A';
  return project.stages[stage]?.status;
}

function visible(ignoreEngineer = false, ignoreStageStatus = false) {
  const query = $('#search').value.trim();
  const general = $('#filter').value;
  const stage = $('#stagefilter').value;
  const status = $('#statefilter').value;
  const engineer = $('#engineer').value;
  return projects.filter(project => {
    if (!reportStageMatches(project) || (focusedProjectId && project.id !== focusedProjectId)) return false;
    if (!projectMatchesSearch(project, query)) return false;
    if (view !== 'followup' && onlyMine && previewUser && !projectAssignedTo(project, previewUser)) return false;
    if (!ignoreEngineer && engineer && !projectAssignedTo(project, engineer)) return false;
    const designStatus = project.stages.design.status;
    if (general === 'stopped' && !stopped(project)) return false;
    if (general === 'active' && stopped(project)) return false;
    if (general === 'late' && !islate(project)) return false;
    if (general === 'hold' && designStatus !== 'HOLD') return false;
    if (general === 'done' && designStatus !== 'DONE') return false;
    if (view === 'supervision' && permit(project) !== 'صدرت') return false;
    if (view === 'documents' && documentView === 'expiring' && !dueDocumentEntries(project).length) return false;
    return ignoreStageStatus || !stage || !status || projectFilterStatus(project, stage) === status;
  });
}
const cls=s=>['OK','صدرت'].includes(s)?'done':['COM','HOLD','DONE','بانتظار المتطلبات'].includes(s)?'blocked':['READY','جاهز للإصدار'].includes(s)?'wait':['SUB','تم التقديم','REQ'].includes(s)?'work':'';
function inlineOptions(arr,v){return arr.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(x)}</option>`).join('')}
function badge(p,k){let s=p.stages[k];if(k==='gas'&&p.service==='FEWA'&&!stopped(p))return '<span class="sub">غير متاح لدى الجهة</span>';const locked=(stopped(p)&&k!=='design')||(k==='design'&&s.status==='DONE');return `<div class="inline-state"><select class="badge ${cls(s.status)}" data-inline="${esc(p.id)}:${k}" aria-label="حالة ${esc(columnTitle(k))} للمشروع ${esc(p.id)}" title="${esc(stateLabel(k,s.status))}" ${locked?'disabled':''}>${inlineOptions(stageStates(p,k),s.status)}</select><button class="detail-btn" data-edit="${esc(p.id)}:${k}" aria-label="تفاصيل ${esc(columnTitle(k))} للمشروع ${esc(p.id)}" title="التفاصيل والملاحظات" ${locked?'disabled':''}>⋯</button></div>${stopped(p)&&k!=='design'?'<div class="sub">العمل متوقف</div>':late(s)&&!stopped(p)?'<div class="sub late">تجاوز الموعد</div>':''}`}
function applyInline(id,k,next){const p=projects.find(p=>p.id===id);if(!p)return;try{updateStage(p,k,next);persist()}catch(err){toast(err.message);renderKeepingFocus()}}
document.addEventListener('change',e=>{if(e.target.dataset.inline){const [id,k]=e.target.dataset.inline.split(':');applyInline(id,k,e.target.value)}if(e.target.dataset.inlinePermit){const p=projects.find(p=>p.id===e.target.dataset.inlinePermit);if(!p||stopped(p)||!ready(p)){toast('يجب استكمال المتطلبات أولًا');render();return}const next=e.target.value;e.target.value=permit(p);try{if(!managerPreview())throw Error('تسجيل حالة الإجازة متاح للمدير');if(next==='صدرت')openPermitEditor(p,next);else{setPermit(p,next);persist()}}catch(error){toast(error.message)}}});

function cell(p,k,group){if(!keys.includes(k))return customColumnCell(p,k);let s=p.stages[k];return `<td>${badge(p,k)}${opened.has(group)?taskShortcut(p,k):''}</td>${opened.has(group)?`<td>${stageInlineField(p,k,'engineer')}</td><td>${stageInlineField(p,k,'date')}</td><td class="note">${stageInlineField(p,k,'note')}${k==='planning'?'<div class="sub">'+esc(s.type)+'</div>':''}</td>`:''}`}
const projectPageSize = 50;
let projectPage = 0;
let projectPageFilter = '';

function paginateProjects(list) {
  const filter = JSON.stringify(['search','engineer','filter','stagefilter','statefilter']
    .map(id => $('#'+id)?.value).concat(view, onlyMine, focusedProjectId, list.length, list[0]?.id, list.at(-1)?.id));
  if (filter !== projectPageFilter) projectPage = 0;
  projectPageFilter = filter;
  const pageCount = Math.max(1, Math.ceil(list.length / projectPageSize));
  projectPage = Math.min(projectPage, pageCount - 1);
  $('#projectPager').hidden = pageCount === 1;
  $('#projectPageLabel').textContent = (projectPage + 1) + ' / ' + pageCount;
  $('#projectPrev').disabled = projectPage === 0;
  $('#projectNext').disabled = projectPage + 1 >= pageCount;
  $('#projectPrev').onclick = () => changeProjectPage(-1);
  $('#projectNext').onclick = () => changeProjectPage(1);
  const start = projectPage * projectPageSize;
  return list.slice(start, start + projectPageSize);
}

function changeProjectPage(offset) {
  projectPage = Math.max(0, projectPage + offset);
  render();
  $('#gridViewport').scrollTop = 0;
}

function renderStageBreakdown(list) {
  const panel = $('#stageBreakdown');
  const stage = $('#stagefilter').value;
  const selected = $('#statefilter').value;
  panel.hidden = view !== 'projects' || !stage;
  if (panel.hidden) return;
  const scope = selected ? visible(false, true) : list;
  const counts = new Map();
  for (const project of scope) {
    const value = projectFilterStatus(project, stage);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const button = (value, label, count) =>
    '<button type="button" class="btn xs" data-stage-status="'+esc(value)+
    '" aria-pressed="'+String(value===selected)+'">'+esc(label)+' <b>'+count+'</b></button>';
  const options = stage === 'permit' ? [...permitStates,'HOLD','DONE']
    : stage === 'design' ? design : [...states(stage),'HOLD','DONE'];
  panel.innerHTML = '<span><strong>'+esc(stage==='permit'?'إجازة البناء':columnTitle(stage))+
    '</strong> · اضغط على حالة لتصفية المشاريع</span>'+button('','كل الحالات',scope.length)+
    [...new Set(options)].filter(value=>counts.has(value)||selected===value)
      .map(value=>button(value,value,counts.get(value)||0)).join('');
}

function render(){
  $('#stageBreakdown').hidden = true;
  $('#projectPager').hidden = true;
  $('#savehint').setAttribute('data-save-state', saveWarning ? 'error' : 'ok');
  renderProjectContext();
  for(const [id,name] of [['ownersTab','owners'],['tasksTab','tasks'],['dashboardTab','dashboard'],['reportsTab','reports'],['archiveTab','archive']]){ $('#'+id).className='btn '+(view===name?'primary':'');$('#'+id).hidden=['dashboard','reports'].includes(name)&&!managerPreview();}
  $('#savehint').textContent=saveWarning||(window.NITAQ_SHARED_ACTIVE?'الحفظ المشترك على Supabase':'التعديلات محفوظة على هذا المتصفح');
  $('#undo').disabled=!managerPreview()||!db.undoStack?.length;
  $('#undolabel').textContent='خطوات التراجع المتاحة: '+(db.undoStack?.length||0);
  $('#projectContext').hidden=false;
  if(renderOperations())return;
  if(['users','activity'].includes(view)&&!managerPreview())view='projects';
  const usersView=view==='users'||view==='activity';
  $('#projectContext').hidden=view==='activity';
  $('#usersPanel').hidden=!usersView;
  for(const id of ['primaryFilters','secondaryFilters','gridHint','gridViewport','stats'])$('#'+id).hidden=usersView;
  if(usersView)$('#table-scroll-top').hidden=true;
  $('#pageTitle').textContent=view==='activity'?'سجل التغييرات':usersView?'المستخدمون والصلاحيات':'متابعة مشاريع نطاق';
  if(usersView){refreshInterface();if(view==='activity')renderActivityPage();else renderUsers();return}
  refreshInterface();const layoutGroups=tableGroups();$('#manageColumns').hidden=!managerPreview();refreshSavedFilters();$('#permissions').hidden=!managerPreview();$('#activity').hidden=!managerPreview();$('#savehint').textContent=saveWarning||(window.NITAQ_SHARED_ACTIVE?'الحفظ المشترك على Supabase':'التعديلات محفوظة على هذا المتصفح · غير مرتبط بالـCRM');const undo=$('#undo');const lastUndo=db.undoStack.at(-1);undo.disabled=!managerPreview()||!lastUndo;undo.title=lastUndo?'التراجع عن '+lastUndo.label:'يُتاح بعد أول تعديل جديد';$('#undolabel').textContent=lastUndo?'خطوات التراجع المتاحة: '+db.undoStack.length+' · آخر تعديل: '+lastUndo.label:'لا يوجد تعديل متاح للتراجع';const list=visible(view==='followup');renderStageBreakdown(list);$('#followupTab').className='btn '+(view==='followup'?'primary':'');$('#stats').innerHTML=[['إجمالي المشاريع',projects.length,'all'],['مشاريع جارية',projects.filter(p=>!stopped(p)).length,'active'],['متأخرة',projects.filter(islate).length,'late'],['معلقة / مغلقة',projects.filter(stopped).length,'stopped']].map(([s,n,f])=>`<button class="stat" data-filter="${f}" aria-pressed="${$('#filter').value===f}"><span>${s}</span><b>${n.toLocaleString('ar-AE')}</b></button>`).join('');$('#count').textContent=list.length+' من '+projects.length+' مشروع';$('#expand').textContent=opened.size?'طي التفاصيل':'فتح تفاصيل المراحل';$('#projectsTab').className='btn '+(view==='projects'?'primary':'');$('#superTab').className='btn '+(view==='supervision'?'primary':'');$('#hinttext').textContent=view==='projects'?'غيّر الحالة مباشرة من الخلية · الحفظ تلقائي · زر ⋯ للتفاصيل والملاحظات':'متابعة مستقلة مرتبطة برقم المشروع — تفاصيل الإشراف سنحددها في الخطوة القادمة';
$('#documentsTab').className='btn '+(view==='documents'?'primary':'');$('#tenderTab').className='btn '+(view==='tender'?'primary':'');if(view==='followup'){renderFollowup(list);appendDailyTasks(list);appendWorkflowFollowup(visible(true));return}if(view==='documents'||view==='tender'){renderSupport(view,view==='tender'?paginateProjects(list):list);return}if(view==='supervision'){$('#table').innerHTML='<thead><tr><th>رقم المشروع</th><th>المالك</th><th>مسؤول المشروع</th><th>إجازة البناء</th><th>متابعة الإشراف</th></tr></thead><tbody>'+paginateProjects(list.filter(p=>p.permit==='صدرت')).map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${esc(p.owner)}</td><td>${stopped(p)?p.stages.design.status:'صدرت'}</td><td>${stopped(p)?'متوقف بسبب '+p.stages.design.status:'<button class="btn sm" data-super="'+esc(p.id)+'">فتح ملف الإشراف</button>'}</td></tr>`).join('')+'</tbody>';if(!list.some(p=>p.permit==='صدرت'))$('#table').innerHTML+='<caption class="empty">لا توجد مشاريع صدرت لها إجازة بناء ضمن النتائج</caption>';return}
$('#table').innerHTML=`<thead><tr><th class="fixednum" rowspan="2">رقم المشروع</th><th class="fixedname" rowspan="2">المالك / المشروع</th><th rowspan="2">تفاصيل المشروع</th><th rowspan="2">الموقع</th><th rowspan="2">المسؤول</th><th rowspan="2">الحالة العامة</th>${layoutGroups.map(([id,title,ks])=>`<th class="group" colspan="${ks.length+(opened.has(id)?ks.filter(k=>keys.includes(k)).length*3:0)}"><button data-group="${id}" aria-expanded="${opened.has(id)}"> ${id==='coordination'?'<span class="coord-title">تنسيق المخططات</span><small class="coord-en" lang="en" dir="ltr">COORDINATION</small>':esc(title)} ${opened.has(id)?'−':'＋'}${['struct','sanitary'].includes(id)?'<div class="sub">مرحلة متوازية</div>':''}</button></th>`).join('')}<th rowspan="2">عقد المقاول</th><th rowspan="2">إجازة البناء</th><th rowspan="2">الإشراف</th></tr><tr>${layoutGroups.map(([id,title,ks])=>ks.map(k=>`<th>${esc(!db.columnLayout?.names?.[k]&&keys.includes(k)&&groups.find(g=>g[0]===id)?.[2].join()===k?'الحالة':columnTitle(k))}</th>${opened.has(id)&&keys.includes(k)?'<th>المسؤول</th><th>الموعد المستهدف</th><th>ملاحظات / معوق</th>':''}`).join('')).join('')}</tr></thead><tbody>${paginateProjects(list).map(p=>`<tr><td class="fixednum project-number">${esc(p.id)}</td><td class="fixedname"><button class="owner" data-project="${esc(p.id)}">${esc(p.name)}</button><div class="project-row-meta"><span class="sub">اسكتش ${esc(p.sketch)||'—'}</span><select class="project-actions-select" data-project-actions="${esc(p.id)}" aria-label="إجراءات المشروع ${esc(p.id)}"><option value="">إجراءات</option><option value="focus">متابعة المشروع</option><option value="timer">⏱ العدّاد</option><option value="workflow">التقديمات والتعطيل</option>${managerPreview()&&!stopped(p)?'<option value="task">إضافة مهمة</option>':''}${managerPreview()?'<option value="history">سجل التغييرات</option>':''}</select></div>${p.parent?'<div class="sub">مرجع: '+esc(p.parent)+'</div>':''}</td>${detailsCell(p)}<td>${esc(p.location)}<div class="sub">${esc(p.system)} / ${esc(p.municipality)}</div></td><td>${esc(p.owner)}</td><td><span class="badge ${stopped(p)?'blocked':'work'}">${p.stages.design.status==='DONE'?'مغلق نهائيًا':p.stages.design.status==='HOLD'?'إيقاف مؤقت':'جارٍ العمل'}</span>${p.stages.design.status==='DONE'?'<div><button class="btn xs" data-reopen="'+esc(p.id)+'">مشروع جديد مرتبط</button></div>':''}${workflowSummary(p)?'<div class="sub note" title="'+esc(workflowSummary(p))+'">'+esc(workflowSummary(p))+'</div>':''}</td>${layoutGroups.flatMap(([id,,columns])=>columns.map(k=>cell(p,k,id))).join('')}<td><button class="badge ${p.contract?'done':'wait'}" data-contract="${esc(p.id)}" ${!managerPreview()||stopped(p)?'disabled':''}>${p.contract?'موقّع':'غير موقّع'}</button></td><td><select class="badge ${cls(permit(p))}" data-inline-permit="${esc(p.id)}" aria-label="حالة إجازة البناء للمشروع ${esc(p.id)}" ${!managerPreview()||stopped(p)||!ready(p)?'disabled':''}>${inlineOptions(stopped(p)?[p.stages.design.status]:p.permit==='صدرت'&&!ready(p)?['صدرت']:ready(p)?permitStates.slice(1):[permitStates[0]],permit(p))}</select>${p.permit==='صدرت'&&!stopped(p)?'<div class="sub">'+(p.permitIssue?esc(p.permitIssue.number)+' · '+esc(p.permitIssue.date):'بيانات الإصدار ناقصة')+(managerPreview()?' <button type="button" class="btn xs" data-permit="'+esc(p.id)+'">بيانات الإجازة</button>':'')+'</div>':''}<div class="sub note" title="${esc(missing(p).join('، '))}">${stopped(p)?'متوقف بسبب التصميم':(p.permit==='صدرت'&&!ready(p)?'الإجازة صادرة؛ راجع الاعتمادات الحالية: ':'')+esc(missing(p).join('، '))}</div></td><td>${stopped(p)?'<span class="badge blocked">'+p.stages.design.status+'</span>':permit(p)==='صدرت'?`<button class="btn xs" data-super="${esc(p.id)}" ${stopped(p)?'disabled':''}>فتح الإشراف</button>`:'<span class="sub">بانتظار إجازة البناء</span>'}</td></tr>`).join('')||'<tr><td colspan="70" class="empty">لا توجد نتائج</td></tr>'}</tbody>`}
function show(title,sub,html,mode,id,k){$('#dialogError').textContent=saveWarning;editing={mode,id,k};$('#dialogtitle').textContent=title;$('#dialogsub').textContent=sub;$('#fields').innerHTML=html;$('#form button[type="submit"]').style.display=mode==='documentHub'?'none':'';$('#cancel').textContent=mode==='documentHub'?'إغلاق':'إلغاء';$('#edit').showModal();$('#edit').scrollTop=0}
function editStage(p,k){if(stopped(p)&&k!=='design')return toast('المشروع متوقف');let s=p.stages[k];if(k==='design'&&s.status==='DONE')return toast('المشروع مغلق نهائيًا؛ استخدم مشروع جديد مرتبط');show(columnTitle(k),p.name+' · '+p.id,select('الحالة','status',stageStates(p,k),s.status,k)+(k==='tender'?tenderFields(p):'')+(k==='coordination'?'<p>مراجعة توافق جميع المخططات بعد إعدادها وقبل التقديم للخدمات والبلدية. OK تعني اكتمال التنسيق والمطابقة، وليست اعتمادًا حكوميًا.</p>':'')+(k==='design'?'<p>OK يعيد باقي الأقسام إلى REQ. فك HOLD يعيد كل المراحل إلى REQ. DONE إغلاق نهائي.</p>':'')+select('المسؤول','assignee',[...new Set(['',...people,s.engineer||''])],s.engineer)+field('الموعد المستهدف','date',s.date,'date')+(k==='planning'?select('نوع الطلب','requesttype',['جديد','تعديل','إعادة اعتماد'],s.type):'')+'<label for="note">الملاحظات / سبب التعطيل</label><textarea id="note">'+esc(s.note)+'</textarea>','stage',p.id,k)}
function projectForm(p,parent){show(p?'بيانات المشروع':'مشروع جديد',parent?'مرتبط بالمشروع المغلق '+parent.id:'بيانات المشروع والجهات المختصة',(!p&&!parent?existingOwnerField():'')+field('رقم المشروع','number',p?.id||'')+field('رقم الاسكتش','sketch',p?.sketch||'')+field('اسم المالك','name',p?.name||parent?.name||'')+detailsFields(p)+field('الإمارة / المنطقة','location',p?.location||parent?.location||'')+select('مسؤول المشروع','manager',[...new Set(['',...people,p?.owner||''])],p?.owner||'')+select('جهة الخدمات','service',['غير محدد','SEWA','FEWA'],p?.service||'SEWA')+select('جهة الاتصالات','telecom',['غير محدد','اتصالات','دو'],p?.telecom||'اتصالات')+select('نظام البلدية','system',['غير محدد','بلدية الشارقة','نظام البلديات الموحد'],p?.system||'بلدية الشارقة')+select('البلدية المختصة','municipality',db.municipalities,p?.municipality||'الشارقة')+(p?.parent?'<p>مرجع المشروع السابق: '+esc(p.parent)+'</p>':''),'project',p?.id,parent?.id);$('#number').required=true;$('#name').required=true;if(accountingMasterLocked(p)){$('#name').readOnly=true;$('#name').title='اسم المالك يُحدّث من الحسابات'}}
function updateFilter(preserve=false){const previous=preserve===true?$('#statefilter').value:'';const k=$('#stagefilter').value;$('#statefilter').innerHTML='<option value="">كل الحالات</option>'+opts(!k?[]:k==='permit'?[...permitStates,'HOLD','DONE']:k==='design'?design:[...states(k),'HOLD','DONE'],'',k);$('#statefilter').disabled=!k;$('#statefilter').value=previous;if($('#statefilter').selectedIndex===-1)$('#statefilter').value='';render()}
$('#form').onsubmit=e=>{e.preventDefault();const {mode,id,k}=editing,p=projects.find(p=>p.id===id);try{if(mode==='accountingLink'){saveAccountingLink()}else if(mode==='removeDocumentColumn'){if(!removeDocumentColumn())return}else if(mode==='addDocumentColumn'){saveDocumentColumn()}else if(mode==='workflowEntry'){saveWorkflowForm(p,k);$('#edit').close();persist();openProjectWorkflow(p.id);return}else if(mode==='projectTask'){saveTaskForm(id)}else if(mode==='ownerProfile'){if(!saveOwnerProfileForm(id))return}else if(mode==='columnLayout'){saveColumnLayout()}else if(mode==='restoreBackup'){restoreBackup();return}else if(mode==='saveFilter'){saveFilter()}else if(mode==='ownerInfo'){saveOwnerInfo(p)}else if(mode==='documentEntry'){saveEntry(p,k)}else if(mode==='documentHub'){return}else if(mode==='details'){Object.assign(p,detailValues())}else if(mode==='stage'){const next=$('#status').value;const stage=p.stages[k];const assignee=$('#assignee').value;if(assignee!==stage.engineer&&!canAssignStage())throw Error('ليس لديك صلاحية الإسناد');if(!canEditStage(stage)){if(!canAssignStage()||stopped(p))throw Error('ليس لديك صلاحية تعديل البند');stage.engineer=assignee;$('#edit').close();persist();return}updateStage(p,k,next);Object.assign(p.stages[k],{engineer:$('#assignee').value,date:$('#date').value,note:$('#note').value});if(k==='planning')p.stages[k].type=$('#requesttype').value;if(k==='tender')p.tender={contractor:$('#tendercontractor').value.trim(),offers:$('#tenderoffers').value.trim()};if(!stopped(p)&&!ready(p)&&p.permit!=='صدرت')p.permit='بانتظار المتطلبات'}else if(mode==='project'){const num=$('#number').value.trim(),name=accountingMasterLocked(p)?p.name:$('#name').value.trim();if(!num||!name)throw Error('رقم المشروع واسم المالك مطلوبان');if(projects.some(x=>x!==p&&x.id===num))throw Error('رقم المشروع مستخدم');if(p&&num!==p.id)throw Error('رقم المشروع ثابت للحفاظ على ربط السجلات');const v={id:num,name,sketch:$('#sketch').value.trim(),...detailValues(),location:$('#location').value.trim(),owner:$('#manager').value,service:$('#service').value,telecom:$('#telecom').value,system:$('#system').value,municipality:$('#system').value==='بلدية الشارقة'?'الشارقة':$('#municipality').value};if(p){Object.assign(p,v);if(!stopped(p)&&!ready(p)&&p.permit!=='صدرت')p.permit='بانتظار المتطلبات'}else{const parent=k?projects.find(x=>x.id===k):null;const created=linkedProject(parent,v);if(!parent)attachExistingOwner(created,$('#existingOwner').value);projects.push(created)}}else if(mode==='permit'){if(stopped(p)||!ready(p))throw Error('يجب استكمال المتطلبات أولًا');setPermit(p,$('#permitstatus').value,{number:$('#permit-number').value.trim(),date:$('#permit-date').value})}else if(mode==='settings'){if(!managerPreview())throw Error('الإعدادات متاحة للمدير');const target=$('#customstage').value,value=$('#customcode').value.trim();if(value){if(['design','permit','coordination'].includes(target))throw Error('حالات التصميم والمطابقة والإجازة ثابتة');if(!states(target).includes(value))(db.custom[target]??=[]).push(value)}const m=$('#newmunicipality').value.trim();if(m&&!db.municipalities.includes(m))db.municipalities.push(m)}$('#edit').close();persist();if(mode==='settings')updateFilter();if(mode==='ownerInfo'||mode==='documentEntry')showDocuments(p)}catch(err){$('#dialogError').textContent=err.message}};
$('#closeDialog').onclick=requestDialogClose;$('#cancel').onclick=requestDialogClose;$('#add').onclick=()=>projectForm(null,null);$('#expand').onclick=()=>{opened=opened.size?new Set():new Set(tableGroups().map(g=>g[0]));render()};$('#search').oninput=scheduleSearchRender;$('#filter').onchange=render;$('#engineer').innerHTML='<option value="">كل المسؤولين</option>'+opts(people,'');$('#engineer').onchange=render;
$('#stagefilter').innerHTML='<option value="">كل المراحل</option>'+Object.entries(titles).map(([k,t])=>`<option value="${k}">${t}</option>`).join('')+'<option value="permit">إجازة البناء</option>';$('#stagefilter').onchange=updateFilter;
$('#stageBreakdown').onclick = event => {
  const control = event.target.closest('[data-stage-status]');
  if (!control) return;
  const value = control.dataset.stageStatus;
  $('#statefilter').value = value;
  render();
  Array.from($('#stageBreakdown').querySelectorAll('button'))
    .find(button => button.dataset.stageStatus === value)?.focus();
};$('#statefilter').onchange=render;$('#projectsTab').onclick=()=>{view='projects';onlyMine=false;render()};$('#superTab').onclick=()=>{view='supervision';render()};function openLookupSettings(){if(!managerPreview())return;show('إعدادات الحالات والبلديات','إضافة حالات للمراحل مع إبقاء القواعد المتفق عليها',select('المرحلة','customstage',keys.filter(k=>!['design','coordination'].includes(k)),'planning')+field('رمز الحالة الجديدة — اتركه فارغًا إن لم يلزم','customcode','')+field('بلدية جديدة — اتركها فارغة إن لم يلزم','newmunicipality',''),'settings')}
$('#settings').onclick=openLists;
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t||t.disabled)return;const id=t.dataset.docs||t.dataset.details||t.dataset.project||t.dataset.contract||t.dataset.permit||t.dataset.super||t.dataset.reopen,p=projects.find(p=>p.id===id);if(t.dataset.group){const g=t.dataset.group;opened.has(g)?opened.delete(g):opened.add(g);renderKeepingFocus()}if(t.dataset.edit){const [id,k]=t.dataset.edit.split(':');editStage(projects.find(p=>p.id===id),k)}if(t.dataset.docs)showDocuments(p);if(t.dataset.details)show('تفاصيل المشروع',p.name+' · '+p.id,detailsFields(p),'details',p.id);if(t.dataset.project)projectForm(p,null);if(t.dataset.reopen)projectForm(null,p);if(t.dataset.contract&&!stopped(p)){if(!managerPreview())return toast('تعديل حالة عقد المقاول متاح للمدير');audit(p,'تحديث عقد المقاول');p.contract=!p.contract;if(!ready(p)&&p.permit!=='صدرت')p.permit='بانتظار المتطلبات';persist()}if(t.dataset.permit&&!stopped(p)){if(!ready(p))return toast('المتطلبات الناقصة: '+missing(p).join('، '));if(managerPreview())openPermitEditor(p,permit(p))}if(t.dataset.super){if(stopped(p)||permit(p)!=='صدرت')return toast('الإشراف متاح بعد صدور الإجازة وللمشاريع الجارية فقط');show('ملف الإشراف — مشروع '+p.id,p.name,'<p>ملف مستقل مرتبط بالمشروع. سنحدد جدول متابعة الإشراف بالتفصيل في الخطوة القادمة.</p><p>الموقع: '+esc(p.location)+'</p><p>إجازة البناء: صدرت</p>','super',p.id)}if(t.dataset.filter){$('#filter').value=t.dataset.filter;render()}});
$('#export').onclick=()=>{const rows=[['المشروع','المرجع السابق','المالك','نوع المشروع','طبيعة الأعمال','وصف المشروع','بيان الرسوم','المستندات المستلمة','إجمالي المستندات المطلوبة','الموقع','الخدمات','الاتصالات','النظام','البلدية',...keys.flatMap(k=>[columnTitle(k),columnTitle(k)+' المسؤول',columnTitle(k)+' الموعد',columnTitle(k)+' الملاحظات']),'عقد المقاول','إجازة البناء',...Object.keys(db.columnLayout?.fields||{}).map(columnTitle)],...visible().map(p=>[p.id,p.parent,p.name,p.projectType||'غير محدد',p.workKind||'غير محدد',p.desc,feeInfo(p.projectType),docCounts(p).received,docCounts(p).required,p.location,p.service,p.telecom,p.system,p.municipality,...keys.flatMap(k=>[k==='gas'&&p.service==='FEWA'&&!stopped(p)?'N/A':p.stages[k].status,p.stages[k].engineer,p.stages[k].date,p.stages[k].note]),p.contract?'موقّع':'غير موقّع',permit(p),...Object.keys(db.columnLayout?.fields||{}).map(key=>p.extra?.[key]??'')])];const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='nitaq-projects.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};$('#documentsTab').onclick=()=>{view='documents';render()};$('#tenderTab').onclick=()=>{view='tender';render()};migrateCoordination();repairStopped();initUsers();initOperations();initUsability();initQuickWork();initWorkflow();initUndo();initFollowup();initAdmin();initBackup();initInterface();$('#manageColumns').onclick=()=>openColumns();$('#undo').onclick=undoLast;updateFilter();

document.addEventListener('change',event=>{
  const id=event.target.dataset.projectActions;
  if(!id)return;
  const action=event.target.value;
  event.target.value='';
  if(action==='focus')focusProject(id);
  if(action==='workflow')openProjectWorkflow(id);
  if(action==='task')openTaskForm(undefined,id);
  if(action==='history')openProjectHistory(id);
  if(action==='timer'&&typeof openTimerFor==='function')openTimerFor(id);
});

$('#accountingLink').onclick=openAccountingLink;

$('#accountingCloud').onclick=openAccountingCloud;
initAccountingCloud();
