// Print the current project result set, never the unfiltered database or editors.
let projectPrintSnapshot=null;
const projectPrintEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function projectPrintColumns(){
  const columns=[
    {id:'id',title:'رقم المشروع',value:p=>p.id},
    {id:'name',title:'المالك / المشروع',value:p=>[p.name,p.sketch?'اسكتش '+p.sketch:'',p.parent?'مرجع '+p.parent:''].filter(Boolean).join(' · ')},
    {id:'details',title:'تصنيف المشروع',value:p=>[p.projectType,p.workKind].filter(Boolean).join(' · ')},
    {id:'building',title:'نوع المشروع',value:p=>p.desc||p.descEn||p.info?.descriptionEn||'غير محدد'},
    {id:'location',title:'الموقع',value:p=>[p.location,[p.system,p.municipality].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')},
    {id:'owner',title:'المسؤول',value:p=>p.owner},
    {id:'general',title:'الحالة العامة',value:p=>p.stages.design.status==='DONE'?'مغلق نهائيًا':p.stages.design.status==='HOLD'?'إيقاف مؤقت':'جارٍ العمل'}
  ];
  for(const [group,title,groupKeys] of tableGroups())for(const key of groupKeys){
    const label=columnTitle(key),prefix=title===label?title:title+' · '+label;
    if(!keys.includes(key)){columns.push({id:'extra:'+key,title:label,value:p=>p.extra?.[key]??''});continue;}
    columns.push({id:'stage:'+key,title:prefix,value:p=>key==='gas'&&p.service==='FEWA'&&!stopped(p)?'غير متاح لدى الجهة':p.stages[key].status+' — '+stateLabel(key,p.stages[key].status)});
    if(opened.has(group))for(const [field,label] of [['engineer','المسؤول'],['date','الموعد المستهدف'],['note','الملاحظات / المعوق']])
      columns.push({id:'stage:'+key+':'+field,title:prefix+' · '+label,value:p=>p.stages[key][field]||''});
  }
  columns.push(
    {id:'contract',title:'عقد المقاول',value:p=>stopped(p)?p.stages.design.status:p.contract?'موقّع':'غير موقّع'},
    {id:'permit',title:'إجازة البناء',value:p=>permit(p)},
    {id:'supervision',title:'الإشراف',value:p=>stopped(p)?p.stages.design.status:p.permit==='صدرت'?(p.supervision?.status||'لم يبدأ'):'بانتظار إجازة البناء'}
  );
  return columns;
}
function projectPrintFilters(){
  const parts=[];
  for(const [id,label] of [['contextProject','المشروع'],['search','البحث'],['engineer','المسؤول'],['filter','المشاريع'],['stagefilter','المرحلة'],['statefilter','الحالة']]){
    const input=document.getElementById(id);if(!input?.value||input.value==='all')continue;
    parts.push(label+': '+(input.selectedOptions?.[0]?.textContent||input.value));
  }
  if(onlyMine)parts.push('المسند لي');
  if(previewUser)parts.push('معاينة الفريق: '+previewUser);
  if(focusedProjectId)parts.push('مشروع محدد: '+focusedProjectId);
  return parts.join(' · ')||'كل النتائج المتاحة حسب العرض الحالي';
}
function captureProjectPrint(){
  if(view!=='projects')throw Error('افتح جدول المشاريع لاختيار الصفوف والأعمدة المطلوب طباعتها.');
  const columns=projectPrintColumns(),list=visible();
  const page=Math.min(Math.max(projectPage,0),Math.max(0,Math.ceil(list.length/projectPageSize)-1));
  return {columns:columns.map(({id,title})=>({id,title})),rows:list.map(p=>columns.map(c=>String(c.value(p)??''))),pageStart:page*projectPageSize,pageSize:projectPageSize,filters:projectPrintFilters(),date:today(),by:previewUser||'مساحة المشاريع'};
}
function projectPrintSelection(snapshot,scope,ids){
  if(!['all','page'].includes(scope))throw Error('نطاق الطباعة غير صحيح.');
  const selected=new Set(['id','name',...ids]);
  const indices=snapshot.columns.map((c,i)=>selected.has(c.id)?i:-1).filter(i=>i>=0);
  const rows=scope==='page'?snapshot.rows.slice(snapshot.pageStart,snapshot.pageStart+snapshot.pageSize):snapshot.rows;
  return {...snapshot,columns:indices.map(i=>snapshot.columns[i]),rows:rows.map(row=>indices.map(i=>row[i])),scope};
}
function projectPrintPanels(data,paper,orientation,split){
  if(!split)return [data.columns.map((_,i)=>i)];
  const max=paper==='A3'?(orientation==='landscape'?12:8):(orientation==='landscape'?8:5);
  const rest=data.columns.map((_,i)=>i).filter(i=>!['id','name'].includes(data.columns[i].id));
  const identity=data.columns.map((c,i)=>['id','name'].includes(c.id)?i:-1).filter(i=>i>=0);
  const panels=[];for(let i=0;i<rest.length;i+=max)panels.push([...identity,...rest.slice(i,i+max)]);
  return panels.length?panels:[identity];
}
function projectPrintHtml(data,options){
  const e=projectPrintEscape,paper=options.paper==='A3'?'A3':'A4',orientation=options.orientation==='portrait'?'portrait':'landscape';
  const panels=projectPrintPanels(data,paper,orientation,options.split);
  const logo=new URL('../NITAQ-Logo-gold.svg',location.href).href;
  const sections=panels.map((indices,part)=>'<section class="print-part"><header><img src="'+e(logo)+'" alt="نطاق"><div><h1>جدول متابعة المشاريع</h1><p>نطاق للاستشارات الهندسية · NITAQ ENGINEERING</p></div><p>'+e(data.date)+'<br>الجزء '+(part+1)+' من '+panels.length+'</p></header>'+
    '<div class="print-meta">'+e(data.filters)+'<br>'+data.rows.length+' مشروع · '+data.columns.length+' عمود محدد · '+(data.scope==='page'?'الصفحة المعروضة فقط':'كل النتائج المفلترة')+' · '+e(data.by)+'</div>'+
    '<table><thead><tr>'+(options.mark?'<th class="mark">تعليم</th>':'')+indices.map(i=>'<th scope="col">'+e(data.columns[i].title)+'</th>').join('')+'</tr></thead><tbody>'+
    data.rows.map(row=>'<tr>'+(options.mark?'<td class="mark">☐</td>':'')+indices.map(i=>'<td>'+e(row[i]||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+
    (options.signature?'<footer>اسم المسؤول: ____________________ &nbsp; التوقيع: ____________________ &nbsp; التاريخ: ______________</footer>':'')+'</section>').join('');
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نطاق — طباعة جدول المشاريع</title><style>'+ 
    '@page{size:'+paper+' '+orientation+';margin:10mm 8mm}*{box-sizing:border-box}body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#132a46;background:#eceeea;margin:0;font-size:10pt}.controls{padding:12px;display:flex;gap:12px;align-items:center;justify-content:center;background:#132a46;color:white;position:sticky;top:0}.controls button{font:inherit;min-height:40px;padding:8px 18px;border:0;border-radius:5px;background:#c9a25d;color:#101725;cursor:pointer}.print-part{background:white;padding:12mm;margin:16px auto;max-width:'+(paper==='A3'?(orientation==='landscape'?420:297):(orientation==='landscape'?297:210))+'mm}header{display:flex;gap:16px;align-items:center;justify-content:space-between;border-bottom:2px solid #c9a25d;padding-bottom:10px}header img{width:70px;height:54px;object-fit:contain}h1{font-size:17pt;margin:0 0 5px}header p{font-size:9pt;margin:3px 0}.print-meta{padding:10px 0;font-size:9pt;line-height:1.7;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #c7cbd0;padding:5px;text-align:right;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;font-variant-numeric:tabular-nums}th{background:#edf0ec;font-weight:bold;font-size:8.5pt}td{font-size:9pt;line-height:1.5}tr{break-inside:avoid}.mark{width:12mm;text-align:center}footer{margin-top:18px;font-size:9pt;break-inside:avoid}@media print{body{background:white}.controls{display:none}.print-part{margin:0;padding:0;max-width:none;break-after:page}.print-part:last-child{break-after:auto}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
    '</style></head><body><div class="controls"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button><span>'+data.rows.length+' مشروع · '+panels.length+' جزء للأعمدة — راجع المعاينة قبل الطباعة</span></div>'+sections+'</body></html>';
}
function openProjectPrint(){
  try{
    if(typeof sharedWorkspacePending!=='undefined'&&(sharedWorkspacePending||sharedWorkspaceRestorePending||sharedWorkspaceBusy))throw Error('انتظر تأكيد حفظ التعديلات ثم افتح الطباعة.');
    projectPrintSnapshot=captureProjectPrint();const data=projectPrintSnapshot,e=projectPrintEscape;
    const pageCount=Math.min(data.pageSize,Math.max(0,data.rows.length-data.pageStart));
    show('طباعة جدول المشاريع',data.filters,
      '<p id="projectPrintCount" role="status">'+data.rows.length+' مشروع · '+data.columns.length+' عمود ظاهر</p>'+
      '<label for="projectPrintScope">الصفوف</label><select id="projectPrintScope"><option value="all">كل النتائج المفلترة ('+data.rows.length+')</option><option value="page">الصفحة الحالية فقط ('+pageCount+')</option></select>'+
      '<div class="user-fields"><div><label for="projectPrintPaper">مقاس الورق</label><select id="projectPrintPaper"><option>A4</option><option>A3</option></select></div><div><label for="projectPrintOrientation">اتجاه الورق</label><select id="projectPrintOrientation"><option value="landscape">أفقي</option><option value="portrait">عمودي</option></select></div></div>'+
      '<fieldset class="project-print-options"><legend>الأعمدة الظاهرة المطلوب طباعتها</legend>'+data.columns.map(c=>'<label><input type="checkbox" data-project-print-column="'+e(c.id)+'" checked '+(['id','name'].includes(c.id)?'disabled':'')+'> '+e(c.title)+'</label>').join('')+'</fieldset>'+
      '<div class="project-print-options"><label><input type="checkbox" id="projectPrintSplit" checked> تقسيم الأعمدة الكثيرة إلى أجزاء مع تكرار رقم المشروع والمالك</label><label><input type="checkbox" id="projectPrintMark" checked> عمود تعليم ☐</label><label><input type="checkbox" id="projectPrintSignature" checked> خانة اسم وتوقيع المسؤول</label></div>'+
      '<p class="sub">نفس ترتيب النتائج والأعمدة الحالية، دون أزرار التعديل أو الأعمدة المخفية. الأعمدة التفصيلية المفتوحة مشمولة. للطباعة يجب أن يتأكد حفظ التعديلات أولًا.</p>', 'projectPrint');
    const submit=document.querySelector('#form button[type="submit"]');submit.disabled=!data.rows.length;
    const update=()=>{const count=document.querySelectorAll('[data-project-print-column]:checked').length;const rows=$('#projectPrintScope').value==='page'?pageCount:data.rows.length;$('#projectPrintCount').textContent=rows+' مشروع · '+count+' عمود محدد';};
    $('#projectPrintScope').onchange=update;for(const input of document.querySelectorAll('[data-project-print-column]'))input.onchange=update;
  }catch(error){toast(error.message);}
}
function runProjectPrint(){
  if(!projectPrintSnapshot)throw Error('افتح إعدادات الطباعة من جديد.');
  if(typeof sharedWorkspacePending!=='undefined'&&(sharedWorkspacePending||sharedWorkspaceRestorePending||sharedWorkspaceBusy))throw Error('انتظر تأكيد حفظ التعديلات ثم اضغط معاينة الطباعة.');
  const ids=[...document.querySelectorAll('[data-project-print-column]:checked')].map(input=>input.dataset.projectPrintColumn);
  const data=projectPrintSelection(projectPrintSnapshot,$('#projectPrintScope').value,ids);
  if(!data.rows.length)throw Error('لا توجد مشاريع للطباعة.');
  const html=projectPrintHtml(data,{paper:$('#projectPrintPaper').value,orientation:$('#projectPrintOrientation').value,split:$('#projectPrintSplit').checked,mark:$('#projectPrintMark').checked,signature:$('#projectPrintSignature').checked});
  const output=window.open('','_blank');if(!output)throw Error('اسمح بالنوافذ المنبثقة لفتح معاينة الطباعة.');
  output.opener=null;output.document.open();output.document.write(html);output.document.close();
  $('#edit').close();projectPrintSnapshot=null;
}
document.getElementById('printProjects')?.addEventListener('click',openProjectPrint);

document.getElementById('edit')?.addEventListener('close',()=>{projectPrintSnapshot=null;});
