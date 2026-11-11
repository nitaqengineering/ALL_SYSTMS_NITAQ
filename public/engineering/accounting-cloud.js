let accountingCloudClient;
const accountingIdentityCache=new WeakMap();
let accountingCloudLoading;
let accountingCloudBusy = false;
let accountingCloudGeneration = 0;
let accountingCloudPreview = null;
const accountingCloudPreference = 'nitaq-engineering-accounting-sync-v1';
const accountingCloudFields = [
  'id', 'projectNo:data->projectNo', 'name:data->name', 'owner:data->owner',
  'plotNumber:data->plotNumber', 'ownershipNumber:data->ownershipNumber',
  'landType:data->landType', 'emirate:data->emirate', 'area:data->area'
].join(',');

async function loadAccountingCloudClient() {
  if (accountingCloudClient) return accountingCloudClient;
  if (!accountingCloudLoading) {
    accountingCloudLoading = (async () => {
      if (!window.supabase) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '../vendor/supabase-2.45.3.min.js';
          script.onload = resolve;
          script.onerror = () => reject(Error('تعذر تحميل الاتصال. تحقق من الإنترنت ثم أعد المحاولة.'));
          document.head.append(script);
        });
      }
      accountingCloudClient = window.supabase.createClient(accountingCloudConfig.url, accountingCloudConfig.key, {
        auth: {storageKey:'nitaq-engineering-accounting-auth', persistSession:true, autoRefreshToken:true}
      });
      return accountingCloudClient;
    })().catch(error => {accountingCloudLoading = null; throw error;});
  }
  return accountingCloudLoading;
}

function accountingCloudStatus(message) {
  const status = $('#accountingCloudStatus');
  if (status) status.textContent = message;
  const panel = $('#cloudMessage');
  if (panel) panel.textContent = message;
}

function accountingCloudEnabledUser() {
  return localStorage.getItem(accountingCloudPreference) || '';
}

async function readAccountingCloudProjects(client, userId) {
  const user = await client.auth.getUser();
  if (user.error || user.data?.user?.id !== userId) throw Error('تغير حساب الاتصال. سجّل الدخول من جديد.');
  async function scan() {
    const projects = [];
    let after = null;
    let total = null;
    const seen = new Set();
    for (let page = 0; page < 1000; page++) {
      let query = client.from('nitaq_records')
        .select(accountingCloudFields, total === null ? {count:'exact'} : undefined)
        .eq('entity','projects').order('id',{ascending:true}).limit(500);
      if (after !== null) query = query.gt('id', after);
      const result = await query;
      if (result.error) throw Error('تعذر قراءة مشاريع الحسابات. راجع صلاحية الحساب أو الاتصال.');
      if (!Array.isArray(result.data)) throw Error('رد خدمة المشاريع غير صالح.');
      if (total === null) {
        if (!Number.isSafeInteger(result.count) || result.count < 0) throw Error('تعذر تأكيد عدد المشاريع.');
        total = result.count;
      }
      for (const project of result.data) {
        if (!project?.id || seen.has(project.id)) throw Error('نسخة المشاريع غير متسقة. أعد المحاولة.');
        seen.add(project.id);
        projects.push(project);
      }
      if (projects.length === total) return projects;
      if (!result.data.length || projects.length > total) throw Error('تغيرت المشاريع أثناء التحميل.');
      after = result.data.at(-1).id;
    }
    throw Error('تجاوز تحميل المشاريع الحد المسموح.');
  }
  async function revision() {
    const result=await client.rpc('nitaq_accounting_project_identity_revision_v1');
    if(result.error){
      if(result.error.code==='PGRST202'&&String(result.error.message||'').includes('nitaq_accounting_project_identity_revision_v1'))return null;
      throw Error('تعذر التحقق من تحديث بيانات الحسابات');
    }
    if(typeof result.data!=='string'||!/^[a-f0-9]{32}$/.test(result.data))throw Error('إصدار بيانات الحسابات غير صالح');
    return result.data;
  }
  let beforeRevision=await revision();
  if(beforeRevision!==null){
    const cached=accountingIdentityCache.get(client);
    if(cached?.userId===userId&&cached.revision===beforeRevision){
      const current=await client.auth.getUser();
      if(current.error||current.data?.user?.id!==userId)throw Error('تغير حساب الاتصال أثناء القراءة');
      return structuredClone(cached.data);
    }
    for(let attempt=0;attempt<3;attempt++){
      const data={projects:await scan()},afterRevision=await revision();
      const current=await client.auth.getUser();
      if(current.error||current.data?.user?.id!==userId)throw Error('تغير حساب الاتصال أثناء القراءة');
      if(afterRevision!==null&&beforeRevision===afterRevision){
        accountingIdentityCache.set(client,{userId,revision:afterRevision,data:structuredClone(data)});return data;
      }
      beforeRevision=afterRevision;
    }
    throw Error('بيانات الحسابات تغيرت أثناء القراءة؛ أعد المحاولة');
  }
  // Older databases retain the conservative double-scan until migration 004 is applied.
  let previous = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = {projects:await scan()};
    const signature = JSON.stringify(data);
    if (previous === signature) {
      const current=await client.auth.getUser();
      if(current.error||current.data?.user?.id!==userId)throw Error('تغير حساب الاتصال أثناء القراءة.');
      return data;
    }
    previous = signature;
  }
  throw Error('مشاريع الحسابات تتغير أثناء القراءة. أعد المحاولة.');
}

function validateAccountingCloudApply() {
  if (!managerPreview()) throw Error('تشغيل الربط متاح للمدير.');
  if (storageReadFailed || localStorage.getItem(storage) !== loadedStorage) throw Error('راجع حالة الحفظ أو أعد فتح الصفحة قبل الربط.');
  if (followupDrafts.size || dialogHasChanges()) throw Error('احفظ تعديلاتك المفتوحة قبل تحديث بيانات الحسابات.');
}

function commitAccountingCloudData(data, approvedInitialMatches = false) {
  validateAccountingCloudApply();
  const rows = accountingImportPlan(JSON.stringify(data));
  if (rows.some(row => !row.projectId && !row.values.name)) throw Error('يوجد مشروع جديد بدون اسم مالك. استكمل بياناته في الحسابات.');
  const unverified = rows.filter(row => row.projectId &&
    !projects.find(project => project.id === row.projectId)?.accountingProjectId);
  if (!approvedInitialMatches && unverified.length) {
    throw Error('مطابقة جديدة تحتاج معاينة المدير: '+unverified.map(row => row.number).join('، '));
  }

  const changed = rows.some(row => {
    const project = projects.find(item => item.id === row.projectId);
    return !project || project.accountingProjectId !== row.sourceId ||
      project.accountingProjectName !== row.projectName ||
      (row.values.name && project.name !== row.values.name) ||
      (row.landType && project.landType !== row.landType) ||
      ['plotGovernment','plotPrivate'].some(field => row.values[field] &&
        row.values[field] !== project.info?.[field]);
  });
  if (!changed) return rows.length;
  if (loadedStorage !== null) localStorage.setItem(storage+'-before-accounting-link',loadedStorage);
  try {
    applyAccountingPlan(rows,true);
    persist();
    if (saveWarning) throw Error(saveWarning);
  } catch (error) {
    if (saveWarning) {
      accountingCloudStatus('توقف الربط بسبب فشل الحفظ. احتفظ بنسخة من التعديلات وراجع حالة التخزين.');
    }
    throw error;
  }
  return rows.length;
}

function accountingCloudScreenActive() {
  if(document.hidden)return false;
  try { if(window.frameElement?.closest('[hidden]'))return false; } catch {}
  return true;
}

async function syncAccountingCloud() {
  if(!accountingCloudScreenActive())return;
  if(window.NITAQ_REQUIRE_SHARED&&!window.NITAQ_SHARED_ACTIVE)return;
  const userId = accountingCloudEnabledUser();
  if (!userId || accountingCloudBusy || !managerPreview()) return;
  if ($('#edit').open || followupDrafts.size || saveWarning) {
    accountingCloudStatus('الربط ينتظر حفظ أو إغلاق التعديلات المفتوحة.');
    return;
  }
  accountingCloudBusy = true;
  const generation = accountingCloudGeneration;
  try {
    const client = await loadAccountingCloudClient();
    const data = await readAccountingCloudProjects(client,userId);
    if (generation !== accountingCloudGeneration || userId !== accountingCloudEnabledUser()) return;
    // Recheck after network reads, since edits may have started while awaiting the server.
    if ($('#edit').open || followupDrafts.size) return;
    const count = commitAccountingCloudData(data);
    accountingCloudStatus('متصل بالحسابات · '+count+' مشروع · آخر تحديث '+new Date().toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai'}));
  } catch (error) {
    accountingCloudStatus('تعذر تحديث الحسابات · '+error.message);
  } finally {
    accountingCloudBusy = false;
  }
}

function openAccountingCloud() {
  if (!managerPreview()) return;
  show('الاتصال التلقائي بالحسابات','بيانات المالك والأراضي من نفس خدمة الحسابات',
    '<p>استخدم حسابك المسجل في نظام الحسابات. تُحدّث بيانات المشاريع كل دقيقة أثناء فتح البرنامج. المشاريع الجديدة تبدأ REQ وتحتاج استكمال جهات الاعتماد والمسؤولين.</p>'+
    field('البريد الإلكتروني','cloudEmail','','email')+field('كلمة المرور','cloudPassword','','password')+
    '<button type="button" class="btn" id="cloudPreview" data-keep-dialog-draft>تسجيل الدخول ومعاينة المشاريع</button>'+
    '<p id="cloudMessage" role="status"></p><div id="cloudProjectsPreview"></div>'+
    '<label><input type="checkbox" id="cloudApprove" disabled> أوافق على اعتماد بيانات الحسابات وتفعيل تحديثها تلقائيًا</label>'+
    '<div class="data-actions"><button type="button" class="btn primary" id="cloudEnable" disabled data-keep-dialog-draft>تفعيل الربط التلقائي</button>'+
    '<button type="button" class="btn" id="cloudPause" data-keep-dialog-draft>إيقاف التحديث التلقائي</button></div>',
    'documentHub');
  accountingCloudPreview = null;
  $('#cloudPause').onclick = () => {
    accountingCloudGeneration++;
    localStorage.removeItem(accountingCloudPreference);
    accountingCloudPreview = null;
    $('#cloudApprove').checked=false;
    $('#cloudApprove').disabled=true;
    $('#cloudEnable').disabled=true;
    accountingCloudStatus('تم إيقاف التحديث التلقائي.');
  };
  const invalidate = () => {
    accountingCloudPreview = null;
    $('#cloudApprove').checked=false;
    $('#cloudApprove').disabled=true;
    $('#cloudEnable').disabled=true;
  };
  $('#cloudEmail').oninput=invalidate;
  $('#cloudPassword').oninput=invalidate;
  $('#cloudPreview').onclick=async()=>{
    invalidate();
    $('#cloudPreview').disabled=true;
    try {
      const client=await loadAccountingCloudClient();
      const email=$('#cloudEmail').value.trim(), password=$('#cloudPassword').value;
      let userId;
      if (email || password) {
        if (!email || !password || !$('#cloudEmail').reportValidity()) throw Error('أدخل البريد وكلمة المرور.');
        accountingCloudGeneration++;
        localStorage.removeItem(accountingCloudPreference);
        const result=await client.auth.signInWithPassword({email,password});
        $('#cloudPassword').value='';
        if (result.error || !result.data?.user?.id) throw Error('تعذر تسجيل الدخول. راجع بيانات الحساب.');
        userId=result.data.user.id;
      } else {
        const result=await client.auth.getUser();
        if (result.error || !result.data?.user?.id) throw Error('سجّل الدخول بحساب الحسابات أولًا.');
        userId=result.data.user.id;
      }
      const data=await readAccountingCloudProjects(client,userId);
      const rows=accountingImportPlan(JSON.stringify(data));
      const body = rows.map(row => {
        const project = projects.find(item => item.id === row.projectId);
        const compare = (current, incoming) => {
          if (!incoming) return esc(current || '—') + ' (فارغ في الحسابات)';
          if (current === incoming) return esc(incoming) + ' (مطابق)';
          return esc(current || '—') + ' ← ' + esc(incoming);
        };
        const action = !project ? 'مشروع جديد'
          : project.accountingProjectId ? 'مرتبط بمعرّف الحسابات' : 'مطابقة أولية برقم المشروع';
        return [esc(row.number), compare(project?.name, row.values.name),
          compare(project?.info?.plotGovernment, row.values.plotGovernment),
          compare(project?.info?.plotPrivate, row.values.plotPrivate), action];
      });
      $('#cloudProjectsPreview').innerHTML = operationTable(
        ['المشروع','المالك: المتابعة ← الحسابات','الحكومي: المتابعة ← الحسابات',
          'المِلك: المتابعة ← الحسابات','المطابقة'], body);
      accountingCloudPreview={userId,signature:JSON.stringify(data),localSnapshot:snapshot()};
      $('#cloudApprove').disabled=!rows.length;
      $('#cloudEnable').disabled=!rows.length;
      accountingCloudStatus('تمت معاينة '+rows.length+' مشروعًا. أكد لتفعيل الربط.');
    } catch(error) {accountingCloudStatus(error.message);}
    finally {$('#cloudPreview').disabled=false;}
  };
  $('#cloudEnable').onclick=async()=>{
    if (!accountingCloudPreview || !$('#cloudApprove').checked) return accountingCloudStatus('عاين المشاريع وحدد الموافقة أولًا.');
    $('#cloudEnable').disabled=true;
    try {
      const preview=accountingCloudPreview;
      const client=await loadAccountingCloudClient();
      const data=await readAccountingCloudProjects(client,preview.userId);
      if (JSON.stringify(data)!==preview.signature) throw Error('تغيرت مشاريع الحسابات. أعد المعاينة قبل التفعيل.');
      if (accountingCloudPreview !== preview || snapshot() !== preview.localSnapshot) {
        throw Error('تغيرت البيانات بعد المعاينة. أعد المعاينة قبل التفعيل.');
      }
      const count=commitAccountingCloudData(data,true);
      localStorage.setItem(accountingCloudPreference,preview.userId);
      accountingCloudGeneration++;
      $('#edit').close();
      accountingCloudStatus('تم تفعيل الاتصال بالحسابات · '+count+' مشروع');
    } catch(error) {accountingCloudStatus(error.message);}
    finally {$('#cloudEnable').disabled=false;}
  };
}

function initAccountingCloud() {
  if (typeof window==='undefined' || typeof accountingCloudConfig==='undefined') return;
  setInterval(()=>void syncAccountingCloud(),60000);
  window.addEventListener('online',()=>void syncAccountingCloud());
  window.addEventListener('focus',()=>void syncAccountingCloud());
  document.addEventListener('visibilitychange',()=>{if(accountingCloudScreenActive())void syncAccountingCloud();});
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='nitaq-section-active'&&event.data.section==='engineering')void syncAccountingCloud();});
  if(accountingCloudEnabledUser())void syncAccountingCloud();
}
