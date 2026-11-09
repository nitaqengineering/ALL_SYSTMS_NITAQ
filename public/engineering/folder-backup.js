let folderBackupBusy=false;
let folderBackupMessage='';

async function folderPreference(value) {
  const database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('nitaq-backup-preferences',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction('settings',value?'readwrite':'readonly');
      const store=transaction.objectStore('settings');
      const request=value?store.put(value,'folder'):store.get('folder');
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error);
    });
  } finally { database.close(); }
}

function showFolderBackupStatus(message, needsAttention=false) {
  folderBackupMessage=message;
  const status=$('#folderBackupStatus');
  if(status)status.textContent=message;
  const warning=$('#folderBackupWarning');
  if(warning)warning.textContent=needsAttention?message:'';
}

async function dailyFolderBackup({manual=false,choose=false}={}) {
  if(folderBackupBusy||typeof window==='undefined'||!window.showDirectoryPicker||!managerPreview())return;
  if(window.NITAQ_REQUIRE_SHARED&&!window.NITAQ_SHARED_ACTIVE)return;
  folderBackupBusy=true;
  try {
    const folder=choose?await window.showDirectoryPicker({mode:'readwrite',id:'nitaq-backups'}):await folderPreference();
    if(!folder)return showFolderBackupStatus('اختر مجلدًا لحفظ النسخ اليومية أثناء فتح نطاق.');
    const options={mode:'readwrite'};
    let permission=await folder.queryPermission(options);
    if(permission!=='granted'&&manual)permission=await folder.requestPermission(options);
    if(permission!=='granted')return showFolderBackupStatus('المجلد: '+folder.name+' · اضغط «نسخ الآن» لتجديد إذن الكتابة.',true);
    if(choose)await folderPreference(folder);
    const date=today();
    const prefix='nitaq-backup-'+date;
    if(!manual){
      for await(const [name,handle] of folder.entries()){
        if(handle.kind!=='file'||!(name===prefix+'.json'||(name.startsWith(prefix+'-')&&name.endsWith('.json'))))continue;
        if((await handle.getFile()).size>0)return showFolderBackupStatus('المجلد: '+folder.name+' · نسخة اليوم: '+name);
      }
    }
    const saved=await backupSourceJson();
    if(!saved||!validDatabase(JSON.parse(saved)))return showFolderBackupStatus('احفظ بيانات نطاق الصالحة أولًا قبل النسخ.',true);
    const filename=prefix+'-'+crypto.randomUUID()+'.json';
    const file=await folder.getFileHandle(filename,{create:true});
    const writer=await file.createWritable();
    try { await writer.write(saved); await writer.close(); }
    catch(error){await writer.abort().catch(()=>{});throw error}
    showFolderBackupStatus('تم حفظ '+filename+' في '+folder.name);
  } catch(error) {
    if(error.name!=='AbortError')showFolderBackupStatus('تعذّر النسخ إلى المجلد: '+error.message,true);
  } finally { folderBackupBusy=false; }
}

function initFolderControls() {
  const supported=typeof window!=='undefined'&&!!window.showDirectoryPicker;
  $('#chooseBackupFolder').disabled=!supported;
  $('#backupNow').disabled=!supported;
  if(!supported)return showFolderBackupStatus('اختيار المجلد متاح في متصفح يدعم حفظ الملفات مباشرة، مثل Edge أو Chrome. يمكنك تنزيل JSON يدويًا.');
  $('#folderBackupStatus').textContent=folderBackupMessage||'اختر مجلدًا لحفظ النسخ اليومية أثناء فتح نطاق.';
  $('#chooseBackupFolder').onclick=()=>void dailyFolderBackup({manual:true,choose:true});
  $('#backupNow').onclick=()=>void dailyFolderBackup({manual:true});
}
