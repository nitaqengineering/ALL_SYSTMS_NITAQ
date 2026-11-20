function englishColumnHeading(value){
 const text=String(value??'').trim();
 const names={
  "رقم المشروع": "Project No.",
  "المشروع": "Project",
  "المالك / المشروع": "Owner / Project",
  "المالك": "Owner",
  "تفاصيل المشروع": "Project Details",
  "تصنيف المشروع": "Category",
  "نوع المشروع": "Building Type",
  "الموقع": "Location",
  "المسؤول": "Engineer",
  "الحالة العامة": "Overall Status",
  "عقد المقاول": "Contractor Contract",
  "إجازة البناء": "Building Permit",
  "الإشراف": "Supervision",
  "الحالة": "Status",
  "الموعد المستهدف": "Due Date",
  "ملاحظات / معوق": "Notes / Blockers",
  "التصميم": "Design",
  "التخطيط": "Planning",
  "تنسيق ومطابقة المخططات": "Coordination",
  "تنسيق المخططات": "Coordination",
  "COORDINATION — تنسيق المخططات": "Coordination",
  "اعتمادات الخدمات": "Utility Approvals",
  "الكهرباء": "Electricity",
  "المياه": "Water",
  "الغاز": "Gas",
  "الاتصالات": "Telecom",
  "الدفاع المدني": "Civil Defence",
  "البلدية": "Municipality",
  "اعتماد المعماري": "Architectural Approval",
  "اعتماد الإنشائي": "Structural Approval",
  "اعتماد الصحي": "Sanitary Approval",
  "قسم المناقصات": "Tendering",
  "البريد الإلكتروني": "Email",
  "البريد": "Email",
  "رقم الهوية": "Emirates ID",
  "انتهاء الهوية": "ID Expiry",
  "رقم الجواز": "Passport No.",
  "انتهاء الجواز": "Passport Expiry",
  "رقم سند الملكية": "Title Deed No.",
  "رقم الخارطة الحكومية": "Government Plot No.",
  "انتهاء الخارطة الحكومية": "Government Plan Expiry",
  "رقم الخارطة المِلك": "Private Plot No.",
  "انتهاء الخارطة المِلك": "Private Plan Expiry",
  "فحص التربة": "Soil Test",
  "ورقيات المشروع من التخطيط والمساحة": "Planning & Survey Documents",
  "NOC فيوا": "FEWA NOC",
  "ملف المشروع": "Project File",
  "حالة المناقصة": "Tender Status",
  "المقاول": "Contractor",
  "العروض والملاحظات": "Offers & Notes",
  "المستند": "Document",
  "الصلاحية": "Expiry",
  "الطلب": "Request",
  "التعديل": "Change",
  "المستخدم": "User",
  "الوقت": "Time",
  "بعد": "After",
  "قبل": "Before",
  "الحالة السحابية": "Cloud Status",
  "تعديل التنسيق": "Coordination Update",
  "تعليم": "Mark",
  "الإجمالي": "Total",
  "القسم": "Department",
  "المهندس": "Engineer",
  "جلسات": "Sessions",
  "المهمة": "Task",
  "الموعد": "Due Date",
  "الإجراء": "Action",
  "الانتهاء": "Expiry",
  "التنبيه": "Alert",
  "التاريخ": "Date",
  "المرحلة": "Stage",
  "النتيجة": "Result",
  "الملاحظات": "Notes",
  "مرجع التقرير": "Report Reference",
  "المتابعة": "Follow-up",
  "الوصف": "Description",
  "السجل": "History",
  "بواسطة": "By",
  "التغيير": "Change",
  "الهاتف": "Phone",
  "المشاريع": "Projects",
  "الملف": "Profile",
  "المشروع البديل": "Linked Project",
  "الملاحظات / المعوق": "Notes / Blockers",
  "بدون موعد": "No Due Date",
  "بنود متأخرة": "Overdue Items",
  "بنود مفتوحة": "Open Items",
  "تم التقديم": "Submitted",
  "متأخر": "Overdue",
  "متطلبات الإجازة الناقصة": "Missing Permit Requirements",
  "مطلوب / قيد العمل": "Required / In Progress",
  "مكتمل أو لا يلزم": "Complete / Not Required",
  "ملاحظات": "Comments",
  "مهام مستحقة": "Due Tasks",
  "مهام مفتوحة": "Open Tasks",
  "مرجع إضافي": "Additional Reference"
};
 if(names[text])return names[text];
 if(text.startsWith('انتهاء '))return englishColumnHeading(text.slice(7))+' Expiry';
 if(text.includes(' · '))return text.split(' · ').map(englishColumnHeading).join(' · ');
 return text; // User-defined field names remain intact rather than receiving an invented translation.
}
function accountingMasterLocked(project){return !!(window.NITAQ_SHARED_ACTIVE&&project?.accountingProjectId);}
const documentColumnTypes={text:'نص',number:'رقم',date:'تاريخ'};
function openDocumentColumn(){
  if(!managerPreview())return;
  show('إضافة عمود للمستندات','يظهر في عرض كل المستندات',field('اسم العمود','docColumnName','')+select('نوع البيانات','docColumnType',Object.values(documentColumnTypes),'نص'),'addDocumentColumn');
  $('#docColumnName').required=true;
}
function saveDocumentColumn(){
  if(!managerPreview())throw Error('إضافة الأعمدة متاحة للمدير');
  const name=$('#docColumnName').value.trim();
  const type=Object.keys(documentColumnTypes).find(key=>documentColumnTypes[key]===$('#docColumnType').value);
  if(!name||!type)throw Error('حدد اسم العمود ونوعه');
  if((db.documentColumns||[]).some(column=>column.name===name))throw Error('اسم العمود مستخدم');
  (db.documentColumns??=[]).push({id:'doc-'+crypto.randomUUID(),name,type});
  documentView='all';
}
function openRemoveDocumentColumn(){
  if(!managerPreview()||!db.documentColumns?.length)return;
  const options=db.documentColumns.map(column=>'<option value="'+esc(column.id)+'">'+esc(column.name)+'</option>').join('');
  show('حذف عمود مخصص','المستندات','<label for="removeDocColumn">اختر العمود</label><select id="removeDocColumn">'+options+'</select><p class="late">حذف العمود يحذف قيمه من كل المشاريع.</p>','removeDocumentColumn');
}
function removeDocumentColumn(){
  if(!managerPreview())throw Error('حذف الأعمدة متاح للمدير');
  const column=db.documentColumns?.find(item=>item.id===$('#removeDocColumn').value);
  if(!column)throw Error('اختر عمودًا مخصصًا');
  if(!confirm('حذف عمود «'+column.name+'» وقيمه من كل المشاريع؟'))return false;
  db.documentColumns=db.documentColumns.filter(item=>item.id!==column.id);
  for(const project of projects)if(project.info)delete project.info[column.id];
  return true;
}
function renderDocumentColumns(list){
  if(documentView==='expiring'){renderExpiringDocuments(list);return;}
  const columns = new Map();
  for(const p of projects){
    for(const [kind,entries] of [['document',documentList(p)],['request',requestList(p)]]){
      for(const entry of entries){
        if(kind==='document' && entry.builtin && ['identity','passport','titleDeed'].includes(entry.id)) continue;
        const key=kind+':'+(entry.builtin?entry.id:entry.name.trim());
        if(!columns.has(key))columns.set(key,{kind,name:entry.name,entries:new Map()});
        columns.get(key).entries.set(p.id,entry);
      }
    }
  }
  let ordered=[...columns.values()].sort((a,b)=>Number(a.kind==='request')-Number(b.kind==='request'));
  let fields=[
    ['البريد الإلكتروني','email','email'],['رقم الهوية','idNumber'],['انتهاء الهوية','idExpiry'],
    ['رقم الجواز','passportNumber'],['انتهاء الجواز','passportExpiry'],
    ['رقم سند الملكية','titleDeedNumber'],
    ['رقم الخارطة الحكومية','plotGovernment'],['انتهاء الخارطة الحكومية','plotGovernmentExpiry'],
    ['رقم الخارطة المِلك','plotPrivate'],['انتهاء الخارطة المِلك','plotPrivateExpiry']
  ];
  if(documentView==='personal'){fields=fields.filter(([,key])=>['email','idNumber','idExpiry','passportNumber','passportExpiry'].includes(key));ordered=[];}
  if(documentView==='land'){fields=fields.filter(([,key])=>!['email','idNumber','idExpiry','passportNumber','passportExpiry'].includes(key));ordered=ordered.filter(column=>column.kind==='request'&&column.name.includes('التخطيط'));}
  if(documentView==='noc'){fields=[];ordered=ordered.filter(column=>column.kind==='request'&&[...column.entries.values()].some(entry=>entry.id==='fewaNoc'));}
  if(documentView==='all')fields.push(...(db.documentColumns||[]).map(column=>[column.name,column.id,column.type]));
  const input=(p,label,key,value,request='',type='text')=>{
    const expiry=key.endsWith('Expiry')||request;
    const warning=expiry?expiryNote(value):'';
    const master=accountingMasterLocked(p)&&['plotGovernment','plotPrivate'].includes(key);
    return `<td><input class="document-grid-input" ${master?'readonly title="يُحدّث من الحسابات"':!canEditDocuments()?'readonly title="التعديل متاح للمدير أو المالك"':''} type="${expiry?'date':type}" ${type==='number'?'step="any"':''} dir="ltr" aria-label="${esc(label)} — مشروع ${esc(p.id)}" data-grid-project="${esc(p.id)}" data-grid-field="${key}" data-grid-request="${request}" value="${esc(value??'')}">${warning?'<div class="sub late">'+esc(warning)+'</div>':''}</td>`;
  };
  const noc=column=>column.kind==='request'&&column.entries.values().next().value?.id==='fewaNoc';
  const cell=(p,{kind,entries})=>{
    const entry=entries.get(p.id);
    if(!entry)return '<td>—</td>'+ (noc({kind,entries})?'<td>—</td>':'');
    const request=kind==='request';
    const applicable=!request||requestApplicable(p,entry);
    const status=request?requestStatus(p,entry):entry.status;
    const attrs=request?`data-request-status="${esc(p.id)}" data-entry-id="${esc(entry.id)}"`:`data-doc-status="${esc(p.id)}" data-doc-id="${esc(entry.id)}"`;
    return `<td><select class="badge" aria-label="${esc(entry.name)} — مشروع ${esc(p.id)}" ${attrs} ${applicable&&canEditDocuments()?'':'disabled'}>${opts(request?requestStates:documentStates,status)}</select>${applicable?docButton('⋯',kind+'-edit',p,entry.id):''}${!request&&expiryNote(entry.expiry)?'<div class="sub late">'+esc(expiryNote(entry.expiry))+'</div>':''}</td>`+(noc({kind,entries})?(applicable?input(p,'انتهاء '+entry.name,'expiry',entry.expiry,entry.id):'<td>لا يلزم</td>'):'');
  };
  $('#hinttext').textContent='حالات المستندات والطلبات قابلة للتعديل من الجدول · زر ⋯ للتفاصيل';
  $('#table').innerHTML=`<thead><tr><th class="fixednum">Project</th><th class="fixedname">Owner</th>${fields.map(([label])=>`<th>${esc(englishColumnHeading(label))}</th>`).join('')}${ordered.map(c=>`<th>${esc(englishColumnHeading(c.name))}</th>`+(noc(c)?`<th>${esc(englishColumnHeading(c.name))} Expiry</th>`:'')).join('')}<th>Location</th><th>Project File</th><th>Overall Status</th></tr></thead><tbody>${list.map(p=>`<tr><td class="fixednum">${esc(p.id)}</td><td class="fixedname">${esc(p.name)}</td>${fields.map(([label,key,type])=>input(p,label,key,p.info?.[key] ?? p.documents?.find(d=>d.id===({idExpiry:'identity',passportExpiry:'passport'})[key])?.expiry,'',type)).join('')}${ordered.map(c=>cell(p,c)).join('')}<td>${esc(p.location)}</td><td>${documentSummary(p)}</td><td>${stopped(p)?p.stages.design.status:'جارٍ العمل'}</td></tr>`).join('')||`<tr><td class="empty" colspan="${ordered.length+fields.length+ordered.filter(noc).length+5}">لا توجد مشاريع تطابق الفلاتر</td></tr>`}</tbody>`;
}
function docStatus(d){return d.status!=='لا يلزم'&&d.expiry&&d.expiry<today()?'منتهي الصلاحية':d.status}
function docCounts(p){const docs=documentList(p);return {received:docs.filter(d=>docStatus(d)==='مستلم').length,required:docs.filter(d=>d.status!=='لا يلزم').length,total:docs.length}}
function documentSummary(p){const d=docCounts(p),i=infoCounts(p);return `<button class="btn xs" data-docs="${esc(p.id)}">فتح ملف المستندات</button><div class="sub">بيانات ${i.complete}/${i.total} · مستندات ${d.received}/${d.required}</div><div class="sub">${requestSummary(p)}</div>`}

function tenderFields(p){return field('المقاول المختار / المرشح','tendercontractor',p.tender?.contractor||'')+'<label for="tenderoffers">العروض والمقارنة / ملاحظات المناقصة</label><textarea id="tenderoffers">'+esc(p.tender?.offers||'')+'</textarea><p class="sub">توقيع عقد المقاول يُسجل مستقلًا في عمود عقد المقاول.</p>'}
function tenderInput(project,key,label,value){
  const attrs=`class="document-grid-input" aria-label="${label} — مشروع ${esc(project.id)}" data-tender-project="${esc(project.id)}" data-tender-field="${key}" ${stopped(project)||(key==='engineer'?!canAssignStage():!canEditStage(project.stages.tender))?'disabled':''}`;
  if(key==='engineer')return `<select ${attrs}>${opts([...new Set(['',...people,...(value?[value]:[])])],value||'')}</select>`;
  if(key==='offers'||key==='note')return `<textarea ${attrs} rows="2" placeholder="${label}">${esc(value)}</textarea>`;
  return `<input ${attrs} type="${key==='date'?'date':'text'}" value="${esc(value)}">`;
}
document.addEventListener('change',event=>{
  const {tenderProject,tenderField}=event.target.dataset;
  if(!tenderProject)return;
  const project=projects.find(p=>p.id===tenderProject);
  if(!project||stopped(project))return;
  if(tenderField==='engineer'?!canAssignStage():!canEditStage(project.stages.tender)){toast(tenderField==='engineer'?stageAssignDenial():stageEditDenial(project.stages.tender));render();return;}
  const value=event.target.value.trim();
  if(['engineer','date','note'].includes(tenderField)){
    project.stages.tender[tenderField]=value;
  }else if(['contractor','offers'].includes(tenderField)){
    (project.tender??={})[tenderField]=value;
  }else return;
  persist();
});
function renderSupport(kind,list){$('#hinttext').textContent=kind==='documents'?'مستندات مرتبطة برقم المشروع':'متابعة المناقصات مرتبطة بالمشروع · الحالة والمسؤول والموعد والعروض';if(kind==='documents'){renderDocumentColumns(list);return}else{$('#table').innerHTML='<thead><tr><th>Project</th><th>Owner</th><th>Tender Status</th><th>Engineer</th><th>Due Date</th><th>Contractor</th><th>Offers & Notes</th></tr></thead><tbody>'+list.map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${badge(p,'tender')}</td><td>${tenderInput(p,'engineer','المسؤول',p.stages.tender.engineer)}</td><td>${tenderInput(p,'date','الموعد المستهدف',p.stages.tender.date)}</td><td>${tenderInput(p,'contractor','المقاول',p.tender?.contractor)}</td><td style="white-space:normal">${tenderInput(p,'offers','العروض',p.tender?.offers)}<div>${tenderInput(p,'note','الملاحظات',p.stages.tender.note)}</div></td></tr>`).join('')+'</tbody>'}if(!list.length)$('#table').innerHTML+='<caption class="empty">لا توجد مشاريع تطابق الفلاتر</caption>'}
function showDocuments(p){openDocumentsHub(p)}


document.addEventListener('change',e=>{if(e.target.dataset.docStatus){try{const p=projects.find(p=>p.id===e.target.dataset.docStatus);setDocumentStatus(p,e.target.dataset.docId,e.target.value);persist()}catch(err){toast(err.message)}}});

document.addEventListener('change', event=>{
  const {gridProject,gridField,gridRequest}=event.target.dataset;
  if(!gridProject)return;
  const project=projects.find(p=>p.id===gridProject);
  if(!project)return;
  if(!canEditDocuments()){toast('تعديل المستندات متاح للمدير أو المالك');render();return;}
  const value=event.target.value.trim();
  if(!event.target.reportValidity())return;
  if(gridRequest){
    const entry=requestList(project).find(r=>r.id===gridRequest);
    if(!entry||!requestApplicable(project,entry))return;
    project.requests=requestList(project).map(r=>r.id===gridRequest?{...r,expiry:value}:r);
  }else{
    (project.info??={})[gridField]=value;
    const docId={idExpiry:'identity',passportExpiry:'passport'}[gridField];
    const doc=project.documents?.find(d=>d.id===docId);
    if(doc)doc.expiry=value;
  }
  persist();
});
