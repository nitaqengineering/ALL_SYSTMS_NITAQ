// The server baseline is independent of local undo history and preview filters.
let sharedWorkspace = null;
let sharedWorkspacePending = null;
let sharedWorkspaceRestorePending = null;
let sharedWorkspaceBusy = false;
let sharedWorkspaceRevision = null;
let sharedWorkspaceActor = null;
let sharedWorkspacePermissions = null;
const localManagerPreview = managerPreview;
const localEngineerPermissions = engineerPermissions;
const localWriteDb = writeDb;
const localRestoreBackup = restoreBackup;
const localOpenActivity = openActivity;
let workspaceInviteBusy=false;

function workspaceGate(message,actions=[]) {
  let panel=document.getElementById('workspaceGate');
  if(!panel){
    panel=document.createElement('section');
    panel.id='workspaceGate';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.style.cssText='position:fixed;inset:0;z-index:10000;background:#eeedeaf5;display:grid;place-content:center;padding:24px;overflow:auto';
    document.body.append(panel);
  }
  panel.replaceChildren();
  const heading=document.createElement('h2');
  heading.textContent='متابعة المشاريع';
  const text=document.createElement('p');
  text.textContent=message;
  text.setAttribute('role','status');
  panel.append(heading,text);
  for(const [label,action] of actions){
    const button=document.createElement('button');
    button.className='btn';
    button.type='button';
    button.textContent=label;
    button.onclick=action;
    panel.append(button);
  }
  document.querySelector('main').inert=true;
  return panel;
}

function closeWorkspaceGate() {
  document.getElementById('workspaceGate')?.remove();
  document.querySelector('main').inert=false;
}

function workspaceSettings(state) {
  const {projects,...settings}=state;
  return settings;
}

async function readSharedWorkspace() {
  const client=await loadAccountingCloudClient();
  for(let attempt=0;attempt<3;attempt++){
    let after=null,revision=null,settings=null;
    const all=[];
    let consistent=true;
    for(let page=0;page<10000;page++){
      const result=await client.rpc('nitaq_engineering_workspace_read_v1',{p_after:after});
      if(result.error)throw Error(result.error.code==='42501'
        ?'حسابك يحتاج تفعيل صلاحية مساحة المشاريع المشتركة.'
        :'تعذرت قراءة المشاريع المشتركة. راجع الاتصال وتسجيل الدخول.');
      const data=result.data;
      if(!data||!Array.isArray(data.projects)||!Number.isSafeInteger(data.revision))
        throw Error('رد خدمة المشاريع غير صالح.');
      if(revision===null){revision=data.revision;settings=data.settings}
      if(revision!==data.revision){consistent=false;break}
      all.push(...data.projects);
      if(data.projects.length<100)return {state:{...settings,projects:all},revision,permissions:data.permissions};
      const next=data.projects.at(-1).id;
      if(after!==null&&next<=after)throw Error('تعذرت قراءة بقية المشاريع.');
      after=next;
    }
    if(consistent)throw Error('عدد صفحات المشاريع تجاوز الحد المسموح.');
  }
  throw Error('المشاريع بتتحدث حاليًا. أعد القراءة للحصول على نسخة متسقة.');
}

function applySharedWorkspace(state,revision,permissions=sharedWorkspacePermissions) {
  if(!validDatabase(state))throw Error('بيانات المشاريع المشتركة تحتاج مراجعة.');
  db={...state,undoStack:[],activity:[]};
  projects=db.projects;
  sharedWorkspace=JSON.parse(JSON.stringify(state));
  sharedWorkspaceRevision=revision;
  sharedWorkspacePermissions=permissions;
  window.NITAQ_SHARED_ACTIVE=true;
  saveWarning='';
  storageReadFailed=false;
  previewUser=permissions?.manager?'':permissions?.name||'';
  syncUserChoices();
  if(!permissions?.manager) {
    previewUser=permissions?.name||'';
    document.getElementById('previewUser').disabled=true;
  }
  initUndo();
  updateFilter(true);
  document.getElementById('savehint').textContent='حفظ مشترك على Supabase';
  if(typeof engineeringCloudButton!=='undefined')engineeringCloudButton.hidden=true;
}

function downloadWorkspaceDraft() {
  const url=URL.createObjectURL(new Blob([JSON.stringify(db)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='nitaq-unsaved-projects-'+Date.now()+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function refreshSharedWorkspace() {
  workspaceGate('جارٍ قراءة المشاريع المشتركة…');
  try {
    const latest=await readSharedWorkspace();
    applySharedWorkspace(latest.state,latest.revision,latest.permissions);
    closeWorkspaceGate();
  }catch(error){
    workspaceGate(error.message,[['إعادة القراءة',()=>void refreshSharedWorkspace()]]);
  }
}

function workspaceRequest(after) {
  const beforeById=new Map(sharedWorkspace.projects.map(project=>[project.id,project]));
  const afterById=new Map(after.projects.map(project=>[project.id,project]));
  const changes=[];
  for(const id of new Set([...beforeById.keys(),...afterById.keys()])){
    const before=beforeById.get(id)||null,next=afterById.get(id)||null;
    if(JSON.stringify(before)!==JSON.stringify(next))changes.push({id,before,after:next});
  }
  const beforeSettings=workspaceSettings(sharedWorkspace),afterSettings=workspaceSettings(after);
  const changed=JSON.stringify(beforeSettings)!==JSON.stringify(afterSettings);
  return {p_operation:crypto.randomUUID(),p_changes:changes,
    p_settings_before:changed?beforeSettings:null,p_settings_after:changed?afterSettings:null};
}

async function saveSharedWorkspace() {
  if(sharedWorkspaceBusy)return;
  sharedWorkspaceBusy=true;
  workspaceGate('جارٍ الحفظ المشترك…');
  try {
    const client=await loadAccountingCloudClient();
    const user=await client.auth.getUser();
    if(user.error||user.data?.user?.id!==sharedWorkspaceActor)throw Error('تغير حساب الاتصال. ارجع لحسابك لتأكيد الحفظ.');
    const pending=sharedWorkspacePending;
    let result=await client.rpc('nitaq_engineering_workspace_save_v2',pending.request);
    // القاعدة لم تُحدَّث بعد بدالة الحفظ الجماعي (تحديث 012): الحفظ حتى 100 مشروع
    // يمرّ بالدالة الأصلية v1 بنفس الطلب ونفس فحص التعارض، وهي ذرية لهذا الحجم.
    if(result.error&&(result.error.code==='PGRST202'||result.status===404)){
      if(pending.request.p_changes.length>100){
        workspaceGate('القاعدة تحتاج تحديث الحفظ الجماعي (012) قبل حفظ أكثر من 100 مشروع دفعة واحدة. لم يُحفظ شيء.',[
          ['تنزيل تعديلاتك',downloadWorkspaceDraft],
          ['إلغاء التعديل ومتابعة المشاريع',()=>{sharedWorkspacePending=null;void refreshSharedWorkspace()}]
        ]);
        return;
      }
      result=await client.rpc('nitaq_engineering_workspace_save_v1',pending.request);
    }
    if(result.error) {
      if(result.status>=400&&result.status<500&&![408,429].includes(result.status)){
        const message=result.error.code==='42501'?'حسابك لا يملك صلاحية هذا التعديل.'
          :'رفضت القاعدة التعديل. '+(result.error.message||'راجع بيانات المشروع.');
        workspaceGate(message+' — المشروع '+pending.request.p_changes.map(change=>change.id).join('، '),[
          ['تنزيل تعديلاتك',downloadWorkspaceDraft],
          ['إلغاء التعديل المرفوض ومتابعة المشاريع',()=>{sharedWorkspacePending=null;void refreshSharedWorkspace()}]
        ]);
        return;
      }
      throw Error('نتيجة الحفظ غير مؤكدة. أعد المحاولة لتأكيد نفس الطلب.');
    }
    if(result.data?.result==='conflict'){
      workspaceGate('حصل تعديل أحدث في '+result.data.project+
        '. احتفظ بتعديلاتك ثم اقرأ النسخة الحالية وراجع التغيير.',[
          ['تنزيل تعديلاتك',downloadWorkspaceDraft],
          ['قراءة النسخة السحابية',()=>{sharedWorkspacePending=null;void refreshSharedWorkspace()}]
        ]);
      return;
    }
    if(!['saved','already_saved'].includes(result.data?.result))
      throw Error('تعذر تأكيد نتيجة الحفظ. أعد إرسال نفس الطلب.');
    sharedWorkspace=pending.after;
    sharedWorkspacePending=null;
    sharedWorkspaceRevision=result.data.revision??null;
    saveWarning='';
    closeWorkspaceGate();
    renderKeepingFocus();
    document.getElementById('savehint').textContent='تم الحفظ على Supabase';
    toast('تم الحفظ المشترك');
  } catch(error){
    workspaceGate(error.message,[
      ['إعادة تأكيد الحفظ',()=>void saveSharedWorkspace()],
      ['تسجيل الدخول مجددًا',()=>void startSharedWorkspace()],
      ['تنزيل تعديلاتك',downloadWorkspaceDraft]
    ]);
  } finally {sharedWorkspaceBusy=false}
}

writeDb=function(message){
  if(!sharedWorkspace)return localWriteDb(message);
  if(sharedWorkspacePending)return toast('أكد نتيجة الحفظ السابق أولًا.');
  const after=JSON.parse(snapshot());
  const request=workspaceRequest(after);
  if(!request.p_changes.length&&request.p_settings_after===null){
    renderKeepingFocus();
    return;
  }
  sharedWorkspacePending={request,after};
  void saveSharedWorkspace();
};

restoreBackup=function(){
  if(!sharedWorkspace)return localRestoreBackup();
  if(document.getElementById('replaceBackup').disabled||!document.getElementById('replaceBackup').checked)
    throw Error('افحص النسخة وأكّد الاستبدال أولًا.');
  const restored=readBackup(document.getElementById('backupText').value);
  normalizeCoordination(restored);
  if(sharedWorkspaceRevision===null)throw Error('حدّث النسخة السحابية من زر الحفظ المشترك قبل الاستعادة.');
  sharedWorkspaceRestorePending={p_operation:crypto.randomUUID(),
    p_expected_revision:sharedWorkspaceRevision,p_document:restored};
  void restoreSharedWorkspace();
};

async function restoreSharedWorkspace(){
  if(sharedWorkspaceBusy)return;
  sharedWorkspaceBusy=true;
  workspaceGate('جارٍ استعادة النسخة على Supabase…');
  try{
    const client=await loadAccountingCloudClient();
    const user=await client.auth.getUser();
    if(user.error||user.data?.user?.id!==sharedWorkspaceActor)throw Error('تغير حساب الاتصال. ادخل بنفس حساب المدير لإكمال الاستعادة.');
    const result=await client.rpc('nitaq_engineering_workspace_restore_v1',sharedWorkspaceRestorePending);
    if(result.error&&(/^(22|23)/.test(result.error.code||'')||['42501','P0001'].includes(result.error.code))){
      sharedWorkspaceRestorePending=null;
      workspaceGate('رُفضت الاستعادة ولم تُغيّر البيانات. راجع صلاحية النسخة وبيانات المالك والأرض المرجعية في الحسابات.',[
        ['الرجوع للمشاريع الحالية',()=>void refreshSharedWorkspace()]
      ]);
      return;
    }
    if(result.error)throw Error('لم تتأكد الاستعادة. أعد تأكيد نفس الطلب؛ إذا استمر الخطأ راجع صلاحية النسخة.');
    if(result.data?.result==='conflict'){
      sharedWorkspaceRestorePending=null;
      workspaceGate('تغيرت المشاريع منذ قراءتها. اقرأ النسخة الحالية وراجع الاستعادة قبل إعادة تنفيذها.',[
        ['قراءة النسخة الحالية',()=>void refreshSharedWorkspace()]
      ]);
      return;
    }
    if(!['restored','already_restored'].includes(result.data?.result))throw Error('تعذر تأكيد نتيجة الاستعادة.');
    sharedWorkspaceRestorePending=null;
    await refreshSharedWorkspace();
    toast('تمت استعادة مشاريع النسخة على Supabase.');
  }catch(error){
    workspaceGate(error.message,[
      ['إعادة تأكيد الاستعادة',()=>void restoreSharedWorkspace()],
      ['تسجيل الدخول مجددًا',()=>void startSharedWorkspace()]
    ]);
  }finally{sharedWorkspaceBusy=false}
}
openActivity=function(){
  if(!sharedWorkspace)return localOpenActivity();
  void (async()=>{
    try{
      const client=await loadAccountingCloudClient();
      const result=await client.rpc('nitaq_engineering_workspace_audit_v1');
      if(result.error)throw Error('تعذرت قراءة سجل التغييرات السحابي.');
      const entries=[];
      function difference(before,after,path,record,project){
        if(JSON.stringify(before)===JSON.stringify(after))return;
        if((before===null||typeof before!=='object')&&(after===null||typeof after!=='object')){
          const target=path.length===3&&path[0]==='stages'&&['date','note'].includes(path[2])
            ?{key:path[1],field:path[2]}:undefined;
          entries.push({at:record.at,by:record.email||record.actor,project,
            field:path.map(part=>titles[part]||part).join(' · '),before:before??null,after:after??null,target});
          return;
        }
        for(const key of new Set([...Object.keys(before||{}),...Object.keys(after||{})])){
          if(key==='history')continue;
          difference(before?.[key],after?.[key],[...path,key],record,project);
        }
      }
      for(const record of result.data){
        for(const change of record.request.changes){
          difference(change.before,change.after,[],record,change.id);
        }
        if(record.request.settingsBefore!==null)
          difference(record.request.settingsBefore,record.request.settingsAfter,['الإعدادات'],record,'—');
      }
      db.activity=entries.slice(-500);
      localOpenActivity();
    }catch(error){toast(error.message)}
  })();
};
document.getElementById('activity').onclick=()=>openActivity();

async function startSharedWorkspace() {
  const panel=workspaceGate('سجّل الدخول بحساب نطاق لفتح المشاريع المشتركة.');
  const form=document.createElement('form');
  form.innerHTML='<label>البريد الإلكتروني<input name="email" type="email" autocomplete="username" required></label>'+
    '<label>كلمة مرور الحساب<input name="password" type="password" autocomplete="current-password" required></label>'+
    '<button class="btn primary">دخول</button>';
  panel.append(form);
  form.onsubmit=async event=>{
    event.preventDefault();
    const email=form.elements.email.value.trim(),password=form.elements.password.value;
    form.elements.password.value='';
    form.querySelector('button').disabled=true;
    try {
      const client=await loadAccountingCloudClient();
      const result=await client.auth.signInWithPassword({email,password});
      if(result.error)throw Error('تعذر الدخول. راجع البريد وكلمة مرور الحساب.');
      if(sharedWorkspacePending||sharedWorkspaceRestorePending){
        if(result.data.user.id!==sharedWorkspaceActor)throw Error('ادخل بنفس الحساب الذي أرسل طلب الحفظ المعلق.');
        if(sharedWorkspaceRestorePending)await restoreSharedWorkspace();
        else await saveSharedWorkspace();
        return;
      }
      sharedWorkspaceActor=result.data.user.id;
      const latest=await readSharedWorkspace();
      applySharedWorkspace(latest.state,latest.revision,latest.permissions);
      closeWorkspaceGate();
    }catch(error){
      panel.querySelector('p').textContent=error.message;
    }finally{form.querySelector('button').disabled=false}
  };
}

const workspaceConnect=document.createElement('button');
workspaceConnect.type='button';
workspaceConnect.className='btn';
workspaceConnect.textContent='الحفظ المشترك';
workspaceConnect.onclick=()=>{
  if(sharedWorkspaceRestorePending)return void restoreSharedWorkspace();
  if(sharedWorkspacePending)return void saveSharedWorkspace();
  if(sharedWorkspace)return void refreshSharedWorkspace();
  void startSharedWorkspace();
};
document.getElementById('projectsTab').after(workspaceConnect);

async function checkSharedWorkspaceUpdates(){
  if(!sharedWorkspace||sharedWorkspaceBusy||sharedWorkspacePending||sharedWorkspaceRestorePending||document.getElementById('edit').open||
    (typeof followupDrafts!=='undefined'&&followupDrafts.size)||snapshot()!==committedState||
    document.activeElement?.matches('#table input,#table textarea,#table select'))return;
  try {
    const client=await loadAccountingCloudClient();
    const result=await client.rpc('nitaq_engineering_workspace_revision_v1');
    if(result.error){
      if(result.error.code==='42501')workspaceGate('صلاحية حسابك لمساحة المشاريع غير متاحة. راجع الإدارة.',[
        ['تسجيل الدخول',()=>void startSharedWorkspace()]
      ]);
      return;
    }
    if(result.data===sharedWorkspaceRevision)return;
    const latest=await readSharedWorkspace();
    if(sharedWorkspaceBusy||sharedWorkspacePending||document.getElementById('edit').open||snapshot()!==committedState)return;
    applySharedWorkspace(latest.state,latest.revision,latest.permissions);
  }catch{
    document.getElementById('savehint').textContent='تعذر تحديث المشاريع. تحقق من الاتصال.';
  }
}
setInterval(()=>void checkSharedWorkspaceUpdates(),30000);
window.addEventListener('focus',()=>void checkSharedWorkspaceUpdates());
window.addEventListener('beforeunload',event=>{
  if(sharedWorkspacePending||sharedWorkspaceRestorePending){event.preventDefault();event.returnValue=''}
});
async function onboardWorkspaceUser(){
  const client=await loadAccountingCloudClient();
  const result=await client.auth.getUser();
  if(result.error||!result.data?.user)return startSharedWorkspace();
  const invitedEmail=new URLSearchParams(location.search).get('email');
  if(!invitedEmail||result.data.user.email?.toLowerCase()!==invitedEmail.toLowerCase()){
    return workspaceGate('الحساب المفتوح مختلف عن حساب الدعوة. افتح رابط دعوتك الصحيح أو سجّل الدخول بحسابك.',[
      ['تسجيل الدخول',()=>void startSharedWorkspace()]
    ]);
  }
  const panel=workspaceGate('اختر كلمة مرور لحساب '+result.data.user.email+' في نطاق.');
  const form=document.createElement('form');
  form.innerHTML='<label>كلمة المرور الجديدة<input name="password" type="password" minlength="12" autocomplete="new-password" required></label>'+
    '<label>تأكيد كلمة المرور<input name="confirmPassword" type="password" minlength="12" autocomplete="new-password" required></label>'+
    '<button class="btn primary">حفظ وفتح المشاريع</button>';
  panel.append(form);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(form.elements.password.value!==form.elements.confirmPassword.value){
      panel.querySelector('p').textContent='كلمتا المرور غير متطابقتين.';
      return;
    }
    form.querySelector('button').disabled=true;
    try{
      const update=await client.auth.updateUser({password:form.elements.password.value});
      form.elements.password.value='';
      form.elements.confirmPassword.value='';
      if(update.error)throw Error('تعذر تعيين كلمة المرور. أعد المحاولة أو اطلب دعوة جديدة.');
      sharedWorkspaceActor=result.data.user.id;
      const latest=await readSharedWorkspace();
      applySharedWorkspace(latest.state,latest.revision,latest.permissions);
      history.replaceState(null,'',location.pathname);
      closeWorkspaceGate();
    }catch(error){panel.querySelector('p').textContent=error.message}
    finally{form.querySelector('button').disabled=false}
  };
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-invite-user]');
  if(!button||!sharedWorkspace||workspaceInviteBusy||!managerPreview())return;
  const user=projectUsers().find(item=>item.id===button.dataset.inviteUser);
  if(!user?.email)return toast('احفظ البريد الإلكتروني للمستخدم أولًا.');
  if(user.active===false)return toast('فعّل المستخدم قبل إرسال الدعوة.');
  if(!confirm('إرسال دعوة إلى '+user.email+' لإنشاء حساب دخوله في نطاق، أو فحص حسابه الموجود؟'))return;
  void (async()=>{
    workspaceInviteBusy=true;
    button.disabled=true;
    try{
      const client=await loadAccountingCloudClient();
      const result=await client.functions.invoke('invite-workspace-user',{body:{email:user.email}});
      if(result.error)throw Error('تعذر إرسال الدعوة. تحقق من الاتصال، ولو أرسلت دعوة حالًا انتظر دقيقة.');
      if(result.data?.error)throw Error(result.data.error);
      toast(result.data?.result==='already_registered'
        ?'حساب الدخول موجود بالفعل. يمكن للمستخدم الدخول ببريده وكلمة مروره.'
        :'تم إرسال الدعوة. يفتح المستخدم الرسالة ويختار كلمة مرور حسابه.');
    }catch(error){toast(error.message)}
    finally{workspaceInviteBusy=false;button.disabled=false}
  })();
});

if(window.NITAQ_REQUIRE_SHARED){
  if(new URLSearchParams(location.search).get('onboard')==='1'){
    void onboardWorkspaceUser().catch(error=>workspaceGate(error.message,[
      ['تسجيل الدخول',()=>void startSharedWorkspace()]
    ]));
  }else void startSharedWorkspace();
}

managerPreview=function(){
  if(!sharedWorkspace)return localManagerPreview();
  return sharedWorkspacePermissions?.manager===true&&localManagerPreview();
};
engineerPermissions=function(name){
  if(!sharedWorkspace)return localEngineerPermissions(name);
  if(sharedWorkspacePermissions?.manager)return localEngineerPermissions(name);
  return {edit:sharedWorkspacePermissions?.permissions?.edit===true,
    assign:sharedWorkspacePermissions?.permissions?.assign===true};
};
