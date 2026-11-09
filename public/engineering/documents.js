function ownerExpiry(project,key){
  const documentId=key==='idExpiry'?'identity':'passport';
  return project.info?.[key] ?? project.documents?.find(item=>item.id===documentId)?.expiry ?? '';
}
const infoFields=[['nameAr','اسم المالك بالعربي','text'],['nameEn','اسم المالك بالإنجليزي','text'],['phone','رقم الهاتف','tel'],['email','البريد الإلكتروني','email'],['idNumber','رقم الهوية','text'],['idExpiry','تاريخ انتهاء الهوية','date'],['passportNumber','رقم الجواز','text'],['passportExpiry','تاريخ انتهاء الجواز','date'],['plotGovernment','رقم الأرض الحكومي','text'],['plotPrivate','رقم الأرض المِلك','text'],['descriptionAr','وصف المشروع بالعربي','text'],['descriptionEn','وصف المشروع بالإنجليزي','text']];
const requestStates=['مطلوب','تم التقديم','تم الاستلام','لا يلزم'];
const documentStates=['ناقص','مستلم','منتهي الصلاحية','لا يلزم'];
function ownerInfo(p){return {...(p.info||{}),idExpiry:ownerExpiry(p,'idExpiry'),passportExpiry:ownerExpiry(p,'passportExpiry'),nameAr:p.name||'',descriptionAr:p.desc||'',descriptionEn:p.descEn||p.info?.descriptionEn||''}}
function infoCounts(p){const v=ownerInfo(p);return {complete:infoFields.filter(([k])=>String(v[k]||'').trim()).length,total:infoFields.length}}
function documentList(p){const basic=[{id:'identity',name:'صورة الهوية',expiry:p.info?.idExpiry||''},{id:'passport',name:'صورة الجواز',expiry:p.info?.passportExpiry||''},{id:'titleDeed',name:'سند الملكية',expiry:''}];const existing=p.documents||[];return [...basic.map(d=>{const saved=existing.find(x=>x.id===d.id)||{};return {status:'ناقص',note:'',...d,...saved,expiry:d.id==='identity'?ownerExpiry(p,'idExpiry'):d.id==='passport'?ownerExpiry(p,'passportExpiry'):'',builtin:true}}),...existing.filter(d=>!basic.some(x=>x.id===d.id)).map(d=>({...d,builtin:false}))]}
function requestList(p){const basics=[{id:'soil',name:'فحص التربة'},{id:'planningPapers',name:'ورقيات المشروع من التخطيط والمساحة'},{id:'telecomNoc',name:'NOC اتصالات'},{id:'fewaNoc',name:'NOC فيوا'}],existing=p.requests||[];return [...basics.map(r=>({status:'مطلوب',note:'',...r,...existing.find(x=>x.id===r.id),builtin:true})),...existing.filter(r=>!basics.some(x=>x.id===r.id)).map(r=>({...r,builtin:false}))]}
function requestApplicable(p,r){return r.id!=='fewaNoc'||p.service==='FEWA'}
function requestStatus(p,r){return requestApplicable(p,r)?r.status:'لا يلزم'}
function requestCounts(p){const list=requestList(p);return {received:list.filter(r=>requestStatus(p,r)==='تم الاستلام').length,required:list.filter(r=>requestStatus(p,r)!=='لا يلزم').length}}
function requestSummary(p){const c=requestCounts(p);return c.received+' / '+c.required+' طلب مستلم'}
function expiryNote(date){if(!date)return '';const days=Math.ceil((Date.parse(date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000);return days<0?'منتهي الصلاحية':days===0?'تنتهي الصلاحية اليوم':days<=14?'تنتهي الصلاحية خلال '+days+' يومًا':''}
function docButton(label,action,p,id){return `<button type="button" class="btn xs" data-${action}="${esc(p.id)}" ${id?'data-entry-id="'+esc(id)+'"':''}>${label}</button>`}
function openDocumentsHub(p){const ic=infoCounts(p),dc=docCounts(p),rc=requestCounts(p);const info=ownerInfo(p);const expired=[expiryNote(info.idExpiry)?'الهوية: '+expiryNote(info.idExpiry):'',expiryNote(info.passportExpiry)?'الجواز: '+expiryNote(info.passportExpiry):''].filter(Boolean);const rows=documentList(p).map(d=>`<tr><td>${esc(d.name)}<div class="sub">${esc(d.note)}</div></td><td><select aria-label="حالة ${esc(d.name)}" data-doc-status="${esc(p.id)}" data-doc-id="${esc(d.id)}">${opts(documentStates,d.status)}</select>${expiryNote(d.expiry)?'<div class="sub late">'+esc(expiryNote(d.expiry))+'</div>':''}</td><td>${esc(d.expiry)||'—'}</td><td>${docButton('تعديل','document-edit',p,d.id)}${!d.builtin?docButton('إزالة','document-remove',p,d.id):''}</td></tr>`).join('');const requests=requestList(p).map(r=>`<tr><td>${esc(r.name)}<div class="sub">${esc(r.note)}</div></td><td><select aria-label="حالة ${esc(r.name)}" data-request-status="${esc(p.id)}" data-entry-id="${esc(r.id)}" ${requestApplicable(p,r)?'':'disabled'}>${opts(requestStates,requestStatus(p,r))}</select>${r.id==='fewaNoc'?'<div class="sub">خاص بالمشاريع التابعة لـFEWA</div>':''}</td><td>${docButton('تفاصيل','request-edit',p,r.id)}</td></tr>`).join('');show('ملف بيانات ومستندات المشروع '+p.id,p.name,`<div class="support-notice">البيانات محفوظة محليًا في هذا المتصفح.</div><section class="doc-section"><h3>بيانات المالك والمشروع <span class="sub">${ic.complete} / ${ic.total} مكتمل</span></h3><progress max="${ic.total}" value="${ic.complete}" style="width:100%"></progress><p>${esc(p.name)}${info.nameEn?' / '+esc(info.nameEn):''}</p>${expired.length?'<p class="late">'+esc(expired.join(' · '))+'</p>':''}${docButton('فتح / استكمال البيانات','owner-info',p)}</section><section class="doc-section"><h3>المستندات <span class="sub">${dc.received} / ${dc.required} مستلم</span></h3><div style="overflow:auto"><table class="doc-list"><thead><tr><th>المستند</th><th>الحالة</th><th>الصلاحية</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${docButton('＋ إضافة مستند آخر','document-edit',p)}</section><section class="doc-section"><h3>الطلبات <span class="sub">${rc.received} / ${rc.required} مستلم</span></h3><div style="overflow:auto"><table class="doc-list"><thead><tr><th>الطلب</th><th>الحالة</th><th></th></tr></thead><tbody>${requests}</tbody></table></div>${docButton('＋ إضافة طلب آخر','request-edit',p)}</section>`,'documentHub',p.id)}
function openOwnerInfo(p){openOwnerProfile(p.id)}
function saveOwnerInfo(p){const values=Object.fromEntries(infoFields.map(([k])=>[k,$('#info-'+k).value.trim()]));if(!values.nameAr)throw Error('اسم المالك بالعربي مطلوب');if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw Error('البريد الإلكتروني غير صحيح');p.name=values.nameAr;p.desc=values.descriptionAr;p.descEn=values.descriptionEn;p.info={...(p.info||{}),...values};delete p.info.nameAr;delete p.info.descriptionAr;delete p.info.descriptionEn;return p}
function setDocumentStatus(p,id,status){if(!documentStates.includes(status))throw Error('حالة مستند غير متاحة');p.documents=documentList(p).map(d=>d.id===id?{...d,status}:d)}
function setRequestStatus(p,id,status){if(!requestStates.includes(status))throw Error('حالة طلب غير متاحة');const r=requestList(p).find(r=>r.id===id);if(!r)throw Error('الطلب غير موجود');if(!requestApplicable(p,r))throw Error('طلب NOC فيوا خاص بالمشاريع التابعة لـFEWA');p.requests=requestList(p).map(r=>r.id===id?{...r,status}:r)}
function openEntry(p,id,kind){const request=kind==='request',entry=(request?requestList(p):documentList(p)).find(d=>d.id===id);if(request&&entry&&!requestApplicable(p,entry))return toast('طلب NOC فيوا لا يلزم للمشروع الحالي');show(entry?'تعديل '+entry.name:request?'إضافة طلب':'إضافة مستند',p.name+' · '+p.id,field(request?'اسم الطلب':'اسم المستند','entry-name',entry?.name||'')+select('الحالة','entry-status',request?requestStates:documentStates,entry?.status||(request?'مطلوب':'ناقص'))+(request||entry?.id==='titleDeed'?'':field('تاريخ انتهاء الصلاحية — إن وجد','entry-expiry',entry?.expiry||'','date'))+field('ملاحظات / نواقص','entry-note',entry?.note||''),'documentEntry',p.id,{kind,id})}
function saveEntry(project, meta) {
  const isRequest = meta.kind === 'request';
  const entries = isRequest ? requestList(project) : documentList(project);
  const previous = entries.find(entry => entry.id === meta.id);
  if (isRequest && previous && !requestApplicable(project, previous)) throw Error('الطلب لا يلزم لهذا المشروع');
  const name = $('#entry-name').value.trim();
  const status = $('#entry-status').value;
  if (!name) throw Error(isRequest ? 'اسم الطلب مطلوب' : 'اسم المستند مطلوب');
  if (!(isRequest ? requestStates : documentStates).includes(status)) throw Error('الحالة غير صحيحة');

  const id = previous?.id || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const updated = {...previous, id, name, status, note: $('#entry-note').value.trim()};
  if (!isRequest) updated.expiry = $('#entry-expiry')?.value || '';
  const saved = previous ? entries.map(entry => entry.id === id ? updated : entry) : [...entries, updated];
  if (isRequest) {
    project.requests = saved;
  } else {
    project.documents = saved;
    if (id === 'identity' || id === 'passport') {
      (project.info ??= {})[id === 'identity' ? 'idExpiry' : 'passportExpiry'] = updated.expiry;
    }
  }
}
document.addEventListener('input',e=>{if(e.target.dataset.infoInput){let count=0;infoFields.forEach(([k,,type])=>{const value=$('#info-'+k).value.trim();if(value)count++;$('[data-info-check="'+k+'"]').textContent=value?'✓':'○';if(type==='date')$('[data-expiry-warning="'+k+'"]').textContent=expiryNote(value)});$('#info-progress').textContent=count+' / '+infoFields.length+' مكتمل';$('#info-bar').value=count}});
document.addEventListener('change',e=>{if(e.target.dataset.requestStatus){try{const p=projects.find(p=>p.id===e.target.dataset.requestStatus);setRequestStatus(p,e.target.dataset.entryId,e.target.value);persist()}catch(err){toast(err.message)}}});
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t||t.disabled)return;const id=t.dataset.ownerInfo||t.dataset.documentEdit||t.dataset.requestEdit||t.dataset.documentRemove;if(!id)return;const p=projects.find(p=>p.id===id);if(!p)return;if(t.dataset.ownerInfo)openOwnerInfo(p);if(t.dataset.documentEdit)openEntry(p,t.dataset.entryId,'document');if(t.dataset.requestEdit)openEntry(p,t.dataset.entryId,'request');if(t.dataset.documentRemove){p.documents=documentList(p).filter(d=>d.id!==t.dataset.entryId||d.builtin);persist();openDocumentsHub(p)}if(t.dataset.documentFile)downloadEntry(p,t.dataset.entryId,t.dataset.entryKind)});

