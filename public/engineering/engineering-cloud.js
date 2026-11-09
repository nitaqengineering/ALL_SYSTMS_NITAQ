// Coordination uses the authenticated server state and never the local preview role.
let engineeringCloudRows = [];
let engineeringCloudAfter = null;
let engineeringCloudNext = null;
let engineeringCloudBusy = false;
const engineeringCloudPending = new Map();

function engineeringCloudMessage(text) {
  const target = document.getElementById('engineeringCloudMessage');
  if (target) target.textContent = text;
}

function renderEngineeringCloudRows() {
  const target = document.getElementById('engineeringCloudRows');
  if (!target) return;
  target.replaceChildren();
  for (const project of engineeringCloudRows) {
    const stage = project.stages.coordination;
    if (!stage) continue;
    const row = document.createElement('tr');
    const projectCell = document.createElement('td');
    projectCell.textContent = project.project_id;
    const currentCell = document.createElement('td');
    currentCell.textContent = stage.status;
    const changeCell = document.createElement('td');
    const select = document.createElement('select');
    select.setAttribute('aria-label','حالة التنسيق للمشروع '+project.project_id);
    for (const value of ['REQ','COM','OK']) select.add(new Option(value,value));
    const pending = engineeringCloudPending.get(project.project_id);
    select.value = pending?.p_status || stage.status;
    select.disabled = Boolean(pending) || !['REQ','OK'].includes(project.design_status);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = pending ? 'إعادة تأكيد الحفظ' : 'حفظ';
    save.disabled = !pending && (!['REQ','OK'].includes(project.design_status) ||
      !['REQ','COM','OK'].includes(stage.status));
    save.onclick = () => void saveEngineeringCoordination(project,select.value);
    changeCell.append(select,save);
    row.append(projectCell,currentCell,changeCell);
    target.append(row);
  }
}

async function readEngineeringCloudPage() {
  const client = await loadAccountingCloudClient();
  const result = await client.rpc('nitaq_engineering_stage_summary_v1',
    {p_after:engineeringCloudAfter,p_limit:50});
  if (result.error) {
    if (result.error.code === '42501') throw Error('حسابك يحتاج تفعيل صلاحية متابعة المشاريع.');
    throw Error('تعذرت قراءة المراحل. تحقق من الاتصال وتسجيل الدخول.');
  }
  engineeringCloudRows = result.data;
  engineeringCloudNext = result.data.length === 50 ? result.data[49].project_id : null;
  renderEngineeringCloudRows();
  document.getElementById('engineeringCloudNext').disabled = !engineeringCloudNext;
}

async function runEngineeringCloud(action) {
  if (engineeringCloudBusy) return;
  engineeringCloudBusy = true;
  const fields = document.getElementById('engineeringCloudFields');
  if (fields) fields.disabled = true;
  try { await action(); }
  catch (error) { engineeringCloudMessage(error.message || 'تعذر إكمال الطلب.'); }
  finally {
    engineeringCloudBusy = false;
    if (fields) fields.disabled = false;
  }
}

async function saveEngineeringCoordination(project,status) {
  await runEngineeringCloud(async () => {
    const client = await loadAccountingCloudClient();
    let request = engineeringCloudPending.get(project.project_id);
    if (!request) {
      request = {p_project:project.project_id,p_version:project.stages.coordination.version,
        p_status:status,p_operation:crypto.randomUUID()};
      engineeringCloudPending.set(project.project_id,request);
    }
    let result;
    try {
      result = await client.rpc('nitaq_engineering_save_coordination_v1',request);
    } catch {
      renderEngineeringCloudRows();
      throw Error('نتيجة الحفظ غير مؤكدة. اضغط إعادة تأكيد الحفظ لإرسال نفس الطلب.');
    }
    if (result.error) {
      if (result.status >= 400 && result.status < 500 && ![408,429].includes(result.status)) {
        engineeringCloudPending.delete(project.project_id);
        renderEngineeringCloudRows();
        throw Error('الحفظ مرفوض. راجع صلاحية الحساب وسجّل الدخول من جديد عند انتهاء الجلسة.');
      }
      renderEngineeringCloudRows();
      throw Error('نتيجة الحفظ غير مؤكدة. اضغط إعادة تأكيد الحفظ لإرسال نفس الطلب.');
    }
    const outcome = result.data;
    if (!['saved','already_saved','unchanged','conflict','project_stopped'].includes(outcome?.result)) {
      renderEngineeringCloudRows();
      throw Error('تعذر تأكيد النتيجة. أعد تأكيد نفس الطلب.');
    }
    engineeringCloudPending.delete(project.project_id);
    if (outcome.result === 'conflict') {
      engineeringCloudMessage('تغيرت الحالة بواسطة مستخدم آخر إلى '+outcome.status+
        '. اقتراحك كان '+request.p_status+'. راجع الحالة قبل اختيار تعديل جديد.');
    } else if (outcome.result === 'project_stopped') {
      engineeringCloudMessage('المشروع متوقف. تعذّر تعديل التنسيق.');
    } else {
      engineeringCloudMessage('تم تأكيد حفظ المشروع '+project.project_id+'.');
    }
    await readEngineeringCloudPage();
  });
}

function openEngineeringCloud() {
  show('تنسيق المخططات السحابي','حالات مباشرة من قاعدة البيانات',
    '<fieldset id="engineeringCloudFields" style="border:0;padding:0">'+
    '<details id="engineeringCloudLogin"><summary>تسجيل الدخول بحساب نطاق</summary>'+
    field('البريد الإلكتروني','engineeringEmail','','email')+
    field('كلمة مرور الحساب','engineeringPassword','','password')+
    '<button type="button" class="btn" id="engineeringCloudConnect">دخول</button></details>'+
    '<p id="engineeringCloudMessage" role="status" aria-live="polite"></p>'+
    '<button type="button" class="btn" id="engineeringCloudRefresh">تحديث</button> '+
    '<button type="button" class="btn" id="engineeringCloudFirst">أول صفحة</button> '+
    '<button type="button" class="btn" id="engineeringCloudNext" disabled>التالي</button>'+
    '<table><thead><tr><th>رقم المشروع</th><th>الحالة السحابية</th><th>تعديل التنسيق</th></tr></thead>'+
    '<tbody id="engineeringCloudRows"></tbody></table></fieldset>',
    'documentHub');
  renderEngineeringCloudRows();
  document.getElementById('engineeringCloudConnect').onclick = () => void runEngineeringCloud(async () => {
    if (engineeringCloudPending.size) throw Error('أكد طلبات الحفظ المعلقة قبل تغيير الحساب.');
    const email = document.getElementById('engineeringEmail');
    const password = document.getElementById('engineeringPassword');
    if (!email.reportValidity() || !email.value.trim() || !password.value) {
      throw Error('أدخل البريد الإلكتروني وكلمة مرور الحساب.');
    }
    const client = await loadAccountingCloudClient();
    const secret = password.value;
    password.value = '';
    const result = await client.auth.signInWithPassword({email:email.value.trim(),password:secret});
    if (result.error) throw Error('تعذر تسجيل الدخول. راجع بريد الحساب وكلمة مروره.');
    engineeringCloudRows = [];
    engineeringCloudAfter = null;
    await readEngineeringCloudPage();
    document.getElementById('engineeringCloudLogin').open = false;
    engineeringCloudMessage('تم الاتصال بالحفظ السحابي.');
  });
  document.getElementById('engineeringCloudRefresh').onclick = () => void runEngineeringCloud(readEngineeringCloudPage);
  document.getElementById('engineeringCloudFirst').onclick = () => void runEngineeringCloud(async () => {
    engineeringCloudAfter = null;
    await readEngineeringCloudPage();
  });
  document.getElementById('engineeringCloudNext').onclick = () => void runEngineeringCloud(async () => {
    if (!engineeringCloudNext) return;
    engineeringCloudAfter = engineeringCloudNext;
    await readEngineeringCloudPage();
  });
  void runEngineeringCloud(readEngineeringCloudPage);
}

const engineeringCloudButton = document.createElement('button');
engineeringCloudButton.type = 'button';
engineeringCloudButton.className = 'btn';
engineeringCloudButton.textContent = 'التنسيق السحابي';
engineeringCloudButton.onclick = openEngineeringCloud;
document.getElementById('projectsTab').after(engineeringCloudButton);
