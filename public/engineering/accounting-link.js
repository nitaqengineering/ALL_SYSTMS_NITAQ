function accountingIdentifier(value,label) {
  if(value===undefined||value===null)return '';
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error(label+' ليس رقمًا صحيحًا آمنًا');
  if(!['number','string'].includes(typeof value))throw Error(label+' يجب أن يكون نصًا أو رقمًا');
  return String(value).trim();
}
function accountingImportPlan(text){
  let source;
  try{source=JSON.parse(text);}catch{throw Error('الصق محتوى نسخة JSON صالحة من الحسابات');}
  if(!source||!Array.isArray(source.projects))throw Error('قائمة مشاريع الحسابات غير موجودة');
  const ids=new Set(),numbers=new Set(),targets=new Set();
  const rows=source.projects.map(raw=>{
    if(!raw||typeof raw!=='object')throw Error('سجل مشروع غير صحيح');
    const sourceId=accountingIdentifier(raw.id,'معرف المشروع');
    const number=accountingIdentifier(raw.projectNo,'رقم المشروع');
    if(!sourceId||!number)throw Error('كل مشروع بالحسابات يحتاج معرفًا ورقم مشروع');
    if(ids.has(sourceId)||numbers.has(number))throw Error('معرف أو رقم مشروع مكرر في نسخة الحسابات: '+number);
    ids.add(sourceId);numbers.add(number);
    const linked=projects.filter(project=>project.accountingProjectId===sourceId);
    if(linked.length>1)throw Error('معرف الحسابات مربوط بأكثر من مشروع: '+number);
    const project=linked[0]||projects.find(item=>item.id===number);
    if(project&&project.id!==number)throw Error('رقم المشروع المرتبط مختلف: '+project.id+' / '+number+' — راجع الترقيم قبل الاستيراد');
    if(project?.accountingProjectId&&project.accountingProjectId!==sourceId)throw Error('المشروع '+number+' مربوط بمعرف حسابات آخر');
    if(project&&targets.has(project.id))throw Error('مطابقة مكررة للمشروع '+number);
    if(project)targets.add(project.id);
    if(raw.owner!==undefined&&typeof raw.owner!=='string')throw Error('اسم المالك غير صحيح في المشروع '+number);
    const values={name:raw.owner?.trim()||'',plotGovernment:accountingIdentifier(raw.plotNumber,'رقم الأرض الحكومي'),plotPrivate:accountingIdentifier(raw.ownershipNumber,'رقم الأرض الملك')};
    return {sourceId,number,projectId:project?.id||'',values,projectName:typeof raw.name==='string'?raw.name.trim():'',landType:typeof raw.landType==='string'?raw.landType:'',location:[raw.emirate,raw.area].filter(value=>typeof value==='string'&&value.trim()).join(' / ')};
  });
  const ownerNames=new Map();
  for(const row of rows.filter(row=>row.projectId&&row.values.name)){
    const project=projects.find(item=>item.id===row.projectId),key=ownerKey(project);
    if(ownerNames.has(key)&&ownerNames.get(key)!==row.values.name)throw Error('المشاريع المرتبطة بنفس المالك لها أسماء مختلفة بالحسابات. راجع ربط المالك أولًا.');
    ownerNames.set(key,row.values.name);
  }
  return rows;
}
function applyAccountingPlan(rows,createMissing=false){
  if(!managerPreview())throw Error('ربط بيانات الحسابات متاح للمدير');
  const incoming=rows.filter(item=>item.projectId||createMissing);
  if(incoming.some(row=>!row.projectId&&!row.values.name))throw Error('المشاريع الجديدة تحتاج اسم مالك في الحسابات');
  for(const row of incoming){
    let project=projects.find(item=>item.id===row.projectId);
    if(!project){
      project=linkedProject(null,{id:row.number,name:row.values.name,sketch:'',desc:'',descEn:'',location:row.location,owner:'',service:'غير محدد',telecom:'غير محدد',system:'غير محدد',municipality:''});
      projects.push(project);
    }
    project.accountingProjectId=row.sourceId;
    project.accountingProjectName=row.projectName;
    if(row.values.name)project.name=row.values.name;
    project.info={...project.info};
    for(const field of ['plotGovernment','plotPrivate'])if(row.values[field])project.info[field]=row.values[field];
    if(row.landType)project.landType=row.landType;
  }
}
function openAccountingLink(){
  if(!managerPreview())return;
  show('ربط بيانات المشاريع بالحسابات','الحسابات هي المرجع لاسم المالك وأرقام الأراضي',
    '<p>من نظام الحسابات نزّل النسخة الاحتياطية JSON، والصق محتواها هنا. تُقرأ بيانات المشاريع فقط. كل نقل يحتاج معاينة وتأكيد. تعديل اسم المالك ينعكس على كل المشاريع المرتبطة بملفه في المسار الهندسي.</p>'+
    '<label for="accountingFile">اختيار نسخة الحسابات من الجهاز</label><input id="accountingFile" type="file" accept=".json,application/json">'+
    '<label for="accountingText">محتوى نسخة الحسابات</label><textarea id="accountingText" dir="ltr" required></textarea>'+
    '<button type="button" class="btn" id="previewAccounting" data-keep-dialog-draft>معاينة الفروق</button>'+
    '<label><input type="checkbox" id="createMissingAccounting"> إنشاء المشاريع غير الموجودة في المسار الهندسي بحالات REQ وجهات تحتاج تحديدًا</label>'+
    '<div id="accountingPreview"></div><label><input type="checkbox" id="confirmAccounting" disabled> أوافق على تحديث المشاريع المطابقة. الخانات الفارغة في الحسابات تحتفظ بالقيم الحالية.</label>',
    'accountingLink');
  $('#accountingText').oninput=()=>{$('#confirmAccounting').checked=false;$('#confirmAccounting').disabled=true;$('#accountingPreview').innerHTML='';};
  $('#createMissingAccounting').onchange=()=>$('#accountingText').oninput();
  $('#accountingFile').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>20*1024*1024)throw Error('حجم النسخة أكبر من 20 ميجابايت');$('#accountingText').oninput();$('#accountingText').value=await file.text();$('#previewAccounting').click();}catch(error){$('#dialogError').textContent=error.message;}
  };
  $('#previewAccounting').onclick=()=>{
    $('#confirmAccounting').checked=false;$('#confirmAccounting').disabled=true;
    try{
      const rows=accountingImportPlan($('#accountingText').value);
      const content=rows.map(row=>{
        const project=projects.find(item=>item.id===row.projectId);
        const compare=(old,next)=>esc(old||'—')+' ← '+esc(next||'غير مسجل؛ الاحتفاظ بالحالي');
        return [esc(row.number),project?'مطابق':'غير موجود — يُنشأ عند اختيار الإضافة',compare(project?.name,row.values.name),compare(project?.info?.plotGovernment,row.values.plotGovernment),compare(project?.info?.plotPrivate,row.values.plotPrivate)];
      });
      $('#accountingPreview').innerHTML=operationTable(['المشروع','المطابقة','المالك الحالي ← الحسابات','الحكومي الحالي ← الحسابات','الملك الحالي ← الحسابات'],content)+'<p>مشاريع مطابقة: '+rows.filter(row=>row.projectId).length+' من '+rows.length+'. المشاريع الجديدة تبدأ من REQ، وتحتاج تحديد المسؤولين وجهات الاعتماد.</p>';
      $('#confirmAccounting').disabled=!rows.some(row=>row.projectId||$('#createMissingAccounting').checked);
      $('#dialogError').textContent='';
    }catch(error){$('#accountingPreview').innerHTML='';$('#dialogError').textContent=error.message;}
  };
  if(typeof preparedAccountingProjects!=='undefined'){
    $('#accountingText').value=JSON.stringify(preparedAccountingProjects,null,2);
    $('#createMissingAccounting').checked=true;
    $('#previewAccounting').onclick();
  }
}
function saveAccountingLink(){
  if(!managerPreview()||$('#confirmAccounting').disabled||!$('#confirmAccounting').checked)throw Error('عاين الفروق وأكد التحديث أولًا');
  const rows=accountingImportPlan($('#accountingText').value);
  if(localStorage.getItem(storage)!==loadedStorage)throw Error('تغيرت البيانات في تبويب آخر. أعد فتح الصفحة قبل الربط');
  if(loadedStorage!==null)localStorage.setItem(storage+'-before-accounting-link',loadedStorage);
  applyAccountingPlan(rows,$('#createMissingAccounting').checked);
}
