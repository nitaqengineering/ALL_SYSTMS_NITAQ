async function backupSourceJson() {
  if(window.NITAQ_REQUIRE_SHARED&&!window.NITAQ_SHARED_ACTIVE){
    throw Error('سجّل الدخول للمشاريع المشتركة قبل أخذ النسخة الاحتياطية.');
  }
  if(window.NITAQ_SHARED_ACTIVE){
    if(sharedWorkspacePending||sharedWorkspaceRestorePending||sharedWorkspaceBusy)throw Error('أكد نتيجة الحفظ المعلق قبل أخذ نسخة احتياطية.');
    const latest=await readSharedWorkspace();
    return JSON.stringify({...latest.state,backupMetadata:{
      source:'nitaq-engineering-supabase',revision:latest.revision,createdAt:new Date().toISOString()
    }});
  }
  return storageReadFailed?loadedStorage:JSON.stringify(db);
}

async function downloadBackup() {
  try{
    const contents=await backupSourceJson();
    if(contents==null)return toast('لا توجد بيانات محفوظة لتنزيلها');
    downloadBackupContents(contents,'nitaq-backup-'+today()+'.json');
  }catch(error){toast(error.message)}
}

function downloadBackupContents(contents,filename) {
  const url = URL.createObjectURL(new Blob([contents], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function initBackup() {
  $('#backup').onclick=openDataCenter;
  void dailyFolderBackup();
  setInterval(()=>void dailyFolderBackup(),60000);
}

function openDataCenter() {
  if(!managerPreview()) return;
  const status=saveWarning?'راجع حالة الحفظ':window.NITAQ_SHARED_ACTIVE?'المصدر السحابي على Supabase':'التخزين على هذا المتصفح';
  show('البيانات والنسخ',status,
    '<div class="data-center">'+
    '<section><h3>تصدير الجدول</h3><p>نزّل المشاريع المطابقة للفلاتر الحالية بصيغة CSV لفتحها في Excel.</p>'+
    '<button type="button" class="btn" id="exportDataCsv">تصدير CSV</button></section>'+
    '<section><h3>النسخة الاحتياطية</h3><p>نزّل نسخة JSON كاملة من البيانات الحالية، أو استعد نسخة سابقة بعد مراجعتها.</p>'+
    '<div class="data-actions"><button type="button" class="btn primary" id="downloadBackup">تنزيل نسخة JSON</button>'+
    '<button type="button" class="btn" id="openRestore">استعادة نسخة</button></div></section>'+
    '<section><h3>النسخ اليومي</h3><p id="folderBackupStatus" role="status"></p><div class="data-actions">'+
    '<button type="button" class="btn" id="chooseBackupFolder">اختيار مجلد النسخ</button>'+
    '<button type="button" class="btn" id="backupNow">نسخ الآن إلى المجلد</button></div></section></div>',
    'documentHub');
  $('#exportDataCsv').onclick=()=>$('#export').click();
  $('#downloadBackup').onclick=downloadBackup;
  const previous=localStorage.getItem(storage+'-before-restore');
  if(previous!==null){
    const button=document.createElement('button');
    button.type='button';
    button.className='btn';
    button.textContent='تنزيل النسخة قبل آخر استعادة';
    button.onclick=()=>downloadBackupContents(previous,'nitaq-before-restore.json');
    $('#openRestore').parentElement.append(button);
  }
  $('#openRestore').onclick=openBackupRestore;
  initFolderControls();
}

function readBackup(text) {
  let data;
  try { data=JSON.parse(text); }
  catch { throw Error('محتوى النسخة ليس JSON صالحًا'); }
  if(!validDatabase(data)) throw Error('محتوى النسخة لا يطابق بيانات نطاق');
  if(new Set(data.projects.map(project=>project.id)).size!==data.projects.length) {
    throw Error('النسخة تحتوي على أرقام مشاريع مكررة');
  }
  return data;
}

function openBackupRestore() {
  if(!managerPreview())return;
  show('استعادة نسخة','راجع المشاريع والمهام والمستخدمين والصلاحيات قبل الاستعادة',
    '<button type="button" class="btn" id="backDataCenter">رجوع إلى البيانات والنسخ</button>'+
    '<label for="backupText">الصق محتوى نسخة JSON</label><textarea id="backupText" dir="ltr" required></textarea>'+
    '<button type="button" class="btn" id="previewBackup">فحص النسخة</button>'+
    '<p id="backupSummary" role="status"></p>'+
    '<label><input type="checkbox" id="replaceBackup" disabled> '+
    (window.NITAQ_SHARED_ACTIVE?'أوافق على استعادة المشاريع وإعدادات النسخة، بما فيها المهام والمستخدمون وصلاحياتهم. قد تُزال مهام أو صلاحيات أُضيفت بعد النسخة، وقد تعود صلاحيات قديمة. المشاريع الحالية الأخرى ستظل موجودة.':'أوافق على استبدال البيانات الحالية، بما فيها المهام والمستخدمون والصلاحيات')+'</label>',
    'restoreBackup');
  $('#backDataCenter').onclick=openDataCenter;
  $('#backupText').oninput=()=>{
    $('#replaceBackup').checked=false;
    $('#replaceBackup').disabled=true;
    $('#backupSummary').textContent='';
  };
  $('#previewBackup').onclick=()=>{
    const confirm=$('#replaceBackup');
    confirm.checked=false;
    confirm.disabled=true;
    $('#backupSummary').textContent='';
    $('#dialogError').textContent=saveWarning;
    try {
      const data=readBackup($('#backupText').value);
      $('#backupSummary').textContent='المشاريع: النسخة '+data.projects.length+' / الحالي '+projects.length+
        ' · المهام: النسخة '+(data.tasks||[]).length+' / الحالي '+(db.tasks||[]).length+
        ' · المستخدمون: النسخة '+(data.users||[]).length+' / الحالي '+(db.users||[]).length+
        '. ستُستعاد إعدادات وصلاحيات النسخة، وليس المشاريع فقط.';
      confirm.disabled=false;
    } catch(error){$('#dialogError').textContent=error.message}
  };
}

function restoreBackup() {
  if(!managerPreview()) throw Error('الاستعادة متاحة في معاينة المدير');
  if($('#replaceBackup').disabled||!$('#replaceBackup').checked) throw Error('افحص النسخة وأكّد الاستبدال أولًا');
  const restored=readBackup($('#backupText').value);
  normalizeCoordination(restored);
  const previous=localStorage.getItem(storage);
  if(previous!==loadedStorage)throw Error('البيانات اتغيرت في تبويب آخر. أعد فتح الصفحة قبل الاستعادة.');
  if(previous!==null)localStorage.setItem(storage+'-before-restore',previous);
  storeDatabase(restored,true);
  location.reload();
}
