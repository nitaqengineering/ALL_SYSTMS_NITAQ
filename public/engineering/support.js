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
  if(documentView==='noc'){fields=[];ordered=ordered.filter(column=>column.kind==='request'&&[...column.entries.values()].some(entry=>['telecomNoc','fewaNoc'].includes(entry.id)));}
  if(documentView==='all')fields.push(...(db.documentColumns||[]).map(column=>[column.name,column.id,column.type]));
  const input=(p,label,key,value,request='',type='text')=>{
    const expiry=key.endsWith('Expiry')||request;
    const warning=expiry?expiryNote(value):'';
    const master=accountingMasterLocked(p)&&['plotGovernment','plotPrivate'].includes(key);
    return `<td><input class="document-grid-input" ${master?'readonly title="يُحدّث من الحسابات"':''} type="${expiry?'date':type}" ${type==='number'?'step="any"':''} dir="ltr" aria-label="${esc(label)} — مشروع ${esc(p.id)}" data-grid-project="${esc(p.id)}" data-grid-field="${key}" data-grid-request="${request}" value="${esc(value??'')}">${warning?'<div class="sub late">'+esc(warning)+'</div>':''}</td>`;
  };
  const noc=column=>column.kind==='request'&&['telecomNoc','fewaNoc'].includes(column.entries.values().next().value?.id);
  const cell=(p,{kind,entries})=>{
    const entry=entries.get(p.id);
    if(!entry)return '<td>—</td>'+ (noc({kind,entries})?'<td>—</td>':'');
    const request=kind==='request';
    const applicable=!request||requestApplicable(p,entry);
    const status=request?requestStatus(p,entry):entry.status;
    const attrs=request?`data-request-status="${esc(p.id)}" data-entry-id="${esc(entry.id)}"`:`data-doc-status="${esc(p.id)}" data-doc-id="${esc(entry.id)}"`;
    return `<td><select class="badge" aria-label="${esc(entry.name)} — مشروع ${esc(p.id)}" ${attrs} ${applicable?'':'disabled'}>${opts(request?requestStates:documentStates,status)}</select>${applicable?docButton('⋯',kind+'-edit',p,entry.id):''}${!request&&expiryNote(entry.expiry)?'<div class="sub late">'+esc(expiryNote(entry.expiry))+'</div>':''}</td>`+(noc({kind,entries})?(applicable?input(p,'انتهاء '+entry.name,'expiry',entry.expiry,entry.id):'<td>لا يلزم</td>'):'');
  };
  $('#hinttext').textContent='حالات المستندات والطلبات قابلة للتعديل من الجدول · زر ⋯ للتفاصيل';
  $('#table').innerHTML=`<thead><tr><th class="fixednum">المشروع</th><th class="fixedname">المالك</th>${fields.map(([label])=>`<th>${esc(label)}</th>`).join('')}${ordered.map(c=>`<th>${esc(c.name)}</th>`+(noc(c)?`<th>انتهاء ${esc(c.name)}</th>`:'')).join('')}<th>الموقع</th><th>ملف المشروع</th><th>الحالة العامة</th></tr></thead><tbody>${list.map(p=>`<tr><td class="fixednum">${esc(p.id)}</td><td class="fixedname">${esc(p.name)}</td>${fields.map(([label,key,type])=>input(p,label,key,p.info?.[key] ?? p.documents?.find(d=>d.id===({idExpiry:'identity',passportExpiry:'passport'})[key])?.expiry,'',type)).join('')}${ordered.map(c=>cell(p,c)).join('')}<td>${esc(p.location)}</td><td>${documentSummary(p)}</td><td>${stopped(p)?p.stages.design.status:'جارٍ العمل'}</td></tr>`).join('')||`<tr><td class="empty" colspan="${ordered.length+fields.length+ordered.filter(noc).length+5}">لا توجد مشاريع تطابق الفلاتر</td></tr>`}</tbody>`;
}
function docStatus(d){return d.status!=='لا يلزم'&&d.expiry&&d.expiry<today()?'منتهي الصلاحية':d.status}
function docCounts(p){const docs=documentList(p);return {received:docs.filter(d=>docStatus(d)==='مستلم').length,required:docs.filter(d=>d.status!=='لا يلزم').length,total:docs.length}}
function documentSummary(p){const d=docCounts(p),i=infoCounts(p);return `<button class="btn xs" data-docs="${esc(p.id)}">فتح ملف المستندات</button><div class="sub">بيانات ${i.complete}/${i.total} · مستندات ${d.received}/${d.required}</div><div class="sub">${requestSummary(p)}</div>`}

function tenderFields(p){return field('المقاول المختار / المرشح','tendercontractor',p.tender?.contractor||'')+'<label for="tenderoffers">العروض والمقارنة / ملاحظات المناقصة</label><textarea id="tenderoffers">'+esc(p.tender?.offers||'')+'</textarea><p class="sub">توقيع عقد المقاول يُسجل مستقلًا في عمود عقد المقاول.</p>'}
function tenderInput(project,key,label,value){
  const attrs=`class="document-grid-input" aria-label="${label} — مشروع ${esc(project.id)}" data-tender-project="${esc(project.id)}" data-tender-field="${key}" ${stopped(project)?'disabled':''}`;
  if(key==='engineer')return `<select ${attrs}>${opts([...new Set(['',...people,...(value?[value]:[])])],value||'')}</select>`;
  if(key==='offers'||key==='note')return `<textarea ${attrs} rows="2" placeholder="${label}">${esc(value)}</textarea>`;
  return `<input ${attrs} type="${key==='date'?'date':'text'}" value="${esc(value)}">`;
}
document.addEventListener('change',event=>{
  const {tenderProject,tenderField}=event.target.dataset;
  if(!tenderProject)return;
  const project=projects.find(p=>p.id===tenderProject);
  if(!project||stopped(project))return;
  if(tenderField==='engineer'?!canAssignStage():!canEditStage(project.stages.tender)){toast('ليس لديك صلاحية تعديل هذا الحقل');render();return;}
  const value=event.target.value.trim();
  if(['engineer','date','note'].includes(tenderField)){
    project.stages.tender[tenderField]=value;
  }else if(['contractor','offers'].includes(tenderField)){
    (project.tender??={})[tenderField]=value;
  }else return;
  persist();
});
function renderSupport(kind,list){$('#hinttext').textContent=kind==='documents'?'مستندات مرتبطة برقم المشروع':'متابعة المناقصات مرتبطة بالمشروع · الحالة والمسؤول والموعد والعروض';if(kind==='documents'){renderDocumentColumns(list);return}else{$('#table').innerHTML='<thead><tr><th>المشروع</th><th>المالك</th><th>حالة المناقصة</th><th>المسؤول</th><th>الموعد المستهدف</th><th>المقاول</th><th>العروض والملاحظات</th></tr></thead><tbody>'+list.map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${badge(p,'tender')}</td><td>${tenderInput(p,'engineer','المسؤول',p.stages.tender.engineer)}</td><td>${tenderInput(p,'date','الموعد المستهدف',p.stages.tender.date)}</td><td>${tenderInput(p,'contractor','المقاول',p.tender?.contractor)}</td><td style="white-space:normal">${tenderInput(p,'offers','العروض',p.tender?.offers)}<div>${tenderInput(p,'note','الملاحظات',p.stages.tender.note)}</div></td></tr>`).join('')+'</tbody>'}if(!list.length)$('#table').innerHTML+='<caption class="empty">لا توجد مشاريع تطابق الفلاتر</caption>'}
function showDocuments(p){openDocumentsHub(p)}


document.addEventListener('change',e=>{if(e.target.dataset.docStatus){try{const p=projects.find(p=>p.id===e.target.dataset.docStatus);setDocumentStatus(p,e.target.dataset.docId,e.target.value);persist()}catch(err){toast(err.message)}}});

document.addEventListener('change', event=>{
  const {gridProject,gridField,gridRequest}=event.target.dataset;
  if(!gridProject)return;
  const project=projects.find(p=>p.id===gridProject);
  if(!project)return;
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
