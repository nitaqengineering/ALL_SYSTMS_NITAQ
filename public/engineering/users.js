let legacyUserNames;
const userRoles = ['مهندس', 'منسق', 'مدير', 'مالك'];

function projectUsers() {
  if (Array.isArray(db.users)) return db.users;
  legacyUserNames ??= [...people];
  return legacyUserNames.map((name, index) => ({
    id: 'legacy-' + index,
    name,
    email: '',
    role: 'مهندس',
    active: true,
    permissions: db.permissions?.[name] ?? {edit: true, assign: false}
  }));
}

function previewAccount() {
  return projectUsers().find(user => user.name === previewUser);
}

function managerPreview() {
  return !previewUser || (previewAccount()?.active !== false && ['مدير','مالك'].includes(previewAccount()?.role));
}

function syncUserChoices(selectedEngineer) {
  const users = projectUsers();
  const active = users.filter(user => user.active !== false);
  people.splice(0, people.length, ...active.map(user => user.name));
  if (previewUser && !active.some(user => user.name === previewUser)) previewUser = '';
  const preview = $('#previewUser');
  preview.innerHTML = '<option value="">معاينة المدير · كل الفريق</option>' + opts(people, previewUser);
  const engineer = $('#engineer');
  const selected = selectedEngineer ?? engineer.value;
  engineer.innerHTML = '<option value="">كل المسؤولين</option>' + opts(users.map(user => user.name), selected);
}

function userPermissionControls(user, prefix) {
  const savedPermissions = user.permissions ?? db.permissions?.[user.name];
  const permissions = savedPermissions == null ? {edit:true, assign:false} : {edit:savedPermissions.edit === true, assign:savedPermissions.assign === true};
  const manager = ['مدير','مالك'].includes(user.role);
  const preset = permissionPresets.findIndex(value => value.edit === permissions.edit && value.assign === permissions.assign);
  return '<label for="' + prefix + '-preset">نموذج الصلاحيات</label>' +
    '<select id="' + prefix + '-preset" data-user-preset="' + prefix + '" ' + (manager ? 'disabled' : '') + '>' +
    permissionPresets.map((value, index) => '<option value="' + index + '" ' + (index === preset ? 'selected' : '') + '>' + value.label + '</option>').join('') + '</select>' +
    '<div class="user-permissions"><label><input id="' + prefix + '-edit" type="checkbox" data-user-permission="' + prefix + '" ' + (permissions.edit || manager ? 'checked ' : '') + (manager ? 'disabled' : '') + '> تعديل البنود المسندة إليه</label>' +
    '<label><input id="' + prefix + '-assign" type="checkbox" data-user-permission="' + prefix + '" ' + (permissions.assign || manager ? 'checked ' : '') + (manager ? 'disabled' : '') + '> إسناد أي بند وتغيير المسؤول</label></div>';
}

function renderUsers() {
  if (!managerPreview()) return;
  const users = projectUsers();
  const cards = users.map((user, index) => {
    const prefix = 'user-' + index;
    const assigned = projects.reduce((count, project) => count + Object.values(project.stages).filter(stage => stage.engineer === user.name).length, 0);
    return '<section class="user-card"><div class="user-card-heading"><div><h3>' + esc(user.name) + '</h3><span class="tag">' + esc(user.role) + '</span> <span class="sub">' + assigned + ' بند مسند · ' + (user.active !== false ? 'نشط' : 'موقوف') + '</span></div>' +
      '<button type="button" class="btn" data-user-toggle="' + esc(user.id) + '">' + (user.active !== false ? 'إيقاف المستخدم' : 'تفعيل المستخدم') + '</button></div>' +
      '<div class="user-fields">' + field('الاسم', prefix + '-name', user.name) +
      select('الدور', prefix + '-role', userRoles, user.role) + field('البريد الإلكتروني', prefix + '-email', user.email, 'email') + '</div>' +
      '<div class="user-permission-editor" data-user-role-prefix="' + prefix + '">' + userPermissionControls(user, prefix) + '</div>' +
      '<p class="sub">المدير يدير المستخدمين والقوائم والسجل. جميع المستخدمين يطلعون على المشاريع، والتعديل حسب الإسناد والصلاحيات.</p>' +
      '<div class="user-card-actions"><button type="button" class="btn primary" data-user-save="' + esc(user.id) + '" data-user-prefix="' + prefix + '">حفظ المستخدم</button>'+
      (window.NITAQ_SHARED_ACTIVE?'<button type="button" class="btn" data-invite-user="'+esc(user.id)+'">دعوة / فحص حساب الدخول</button>':'')+
      '<span id="' + prefix + '-error" role="alert" class="late"></span></div></section>';
  }).join('');
  $('#usersPanel').innerHTML = '<div class="users-heading"><div><h2>المستخدمون والصلاحيات</h2><p>إدارة المستخدمين وصلاحياتهم. في الحفظ المشترك يرتبط كل مستخدم ببريد حساب دخوله.</p></div><button type="button" class="btn" id="returnProjects">العودة للمشاريع</button></div>' +
    '<section class="user-card"><h3>إضافة مستخدم</h3><form id="newUserForm"><div class="user-fields">' +
    field('الاسم', 'newUserName', '') + select('الدور', 'newUserRole', userRoles, 'مهندس') + field('البريد الإلكتروني', 'newUserEmail', '', 'email') +
    '</div><button type="submit" class="btn primary">إضافة المستخدم</button><p id="newUserError" class="late" role="alert"></p></form></section>' + cards;
  $('#newUserName').required = true;
  $('#newUserEmail').required = window.NITAQ_SHARED_ACTIVE===true;
  $('#returnProjects').onclick = () => {view = 'projects'; render();};
}

function saveUserProfile(id, values) {
  if (!managerPreview()) throw Error('إدارة المستخدمين متاحة للمدير');
  const users = projectUsers();
  const current = id ? users.find(user => user.id === id) : null;
  if (id && !current) throw Error('المستخدم غير موجود');
  const name = values.name.trim();
  const email = values.email.trim();
  if(window.NITAQ_SHARED_ACTIVE&&!email)throw Error('البريد الإلكتروني مطلوب لربط المستخدم بحساب الدخول.');
  if (!name) throw Error('اكتب اسم المستخدم');
  if (!userRoles.includes(values.role)) throw Error('اختر دورًا صحيحًا');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('البريد الإلكتروني غير صحيح');
  if (users.some(user => user.id !== id && user.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('الاسم مستخدم بالفعل');
  if (email && users.some(user => user.id !== id && user.email?.toLowerCase() === email.toLowerCase())) throw Error('البريد الإلكتروني مستخدم بالفعل');

  const updated = {
    id: current?.id || 'user-' + crypto.randomUUID(), name, email, role: values.role,
    active: current?.active !== false,
    permissions: {edit: values.edit === true, assign: values.assign === true}
  };
  let selectedEngineer = $('#engineer').value;
  if (current && current.name !== name) {
    for (const project of projects) {
      if (project.owner === current.name) project.owner = name;
      for (const stage of Object.values(project.stages)) if (stage.engineer === current.name) stage.engineer = name;
      if (project.supervision?.engineer === current.name) project.supervision.engineer = name;
      for (const workflow of Object.values(project.workflow||{})) {
        if(workflow.blocker?.actionOwner===current.name)workflow.blocker.actionOwner=name;
        for(const field of ['preparedBy','checkedBy'])if(workflow.review?.[field]===current.name)workflow.review[field]=name;
        for(const submission of workflow.submissions||[])if(submission.responseOwner===current.name)submission.responseOwner=name;
      }
    }
    for (const task of db.tasks || []) if (task.engineer === current.name) task.engineer = name;
    if (previewUser === current.name) previewUser = name;
    if (selectedEngineer === current.name) selectedEngineer = name;
    for (const filter of Object.values(db.savedFilters || {})) if (filter.engineer === current.name) filter.engineer = name;
  }
  db.users = current ? users.map(user => user.id === id ? updated : user) : [...users, updated];
  syncUserChoices(selectedEngineer);
  persist();
}

function openUsers() {
  if (!managerPreview()) return;
  view = 'users';
  render();
}

function initUsers() {
  syncUserChoices();
  document.addEventListener('submit', event => {
    if (event.target.id !== 'newUserForm') return;
    event.preventDefault();
    try {
      saveUserProfile(null, {name: $('#newUserName').value, email: $('#newUserEmail').value, role: $('#newUserRole').value, edit: true, assign: false});
    } catch (error) { $('#newUserError').textContent = error.message; }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-user-save], [data-user-toggle]');
    if (!button || !managerPreview()) return;
    if (button.dataset.userToggle) {
      const users = projectUsers();
      const user = users.find(user => user.id === button.dataset.userToggle);
      if (!user) return;
      db.users = users.map(account => account.id === user.id ? {...account, active: account.active === false} : account);
      syncUserChoices();
      persist();
      return;
    }
    const prefix = button.dataset.userPrefix;
    try {
      saveUserProfile(button.dataset.userSave, {
        name: $('#' + prefix + '-name').value, email: $('#' + prefix + '-email').value,
        role: $('#' + prefix + '-role').value, edit: $('#' + prefix + '-edit').checked,
        assign: $('#' + prefix + '-assign').checked
      });
    } catch (error) { $('#' + prefix + '-error').textContent = error.message; }
  });
  document.addEventListener('change', event => {
    const presetPrefix = event.target.dataset.userPreset;
    const checkPrefix = event.target.dataset.userPermission;
    const prefix = presetPrefix || checkPrefix || event.target.id.match(/^(user-\d+)-role$/)?.[1];
    if (!prefix) return;
    const manager = ['مدير','مالك'].includes($('#' + prefix + '-role').value);
    const edit = $('#' + prefix + '-edit');
    const assign = $('#' + prefix + '-assign');
    const preset = $('#' + prefix + '-preset');
    if (presetPrefix) {
      const values = permissionPresets[Number(preset.value)];
      edit.checked = values.edit;
      assign.checked = values.assign;
    }
    edit.disabled = assign.disabled = preset.disabled = manager;
    if (manager) edit.checked = assign.checked = true;
    preset.value = String(permissionPresets.findIndex(value => value.edit === edit.checked && value.assign === assign.checked));
  });
}
