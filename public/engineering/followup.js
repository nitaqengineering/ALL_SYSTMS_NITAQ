let previewUser = '';
let onlyMine = false;
const followupDrafts = new Map();
const draftKey = (project, stage) => JSON.stringify([previewUser,project,stage]);

function captureFollowupDraft(event) {
  const {followProject,followStage,followField}=event.target.dataset;
  if (view!=='followup' || !['status','date','note'].includes(followField)) return;
  const stage=projects.find(p=>p.id===followProject)?.stages[followStage];
  if (!stage || !canEditStage(stage)) return;
  const key=draftKey(followProject,followStage);
  const draft=followupDrafts.get(key) || {};
  if (event.target.value===(stage[followField]||'')) delete draft[followField];
  else draft[followField]=event.target.value;
  if (Object.keys(draft).length) followupDrafts.set(key,draft);
  else followupDrafts.delete(key);
}
document.addEventListener('input',captureFollowupDraft);
document.addEventListener('change',captureFollowupDraft);

function followupRows(list, now = today()) {
  const sections = {late:[], today:[], undated:[]};
  for (const project of list) {
    if (stopped(project)) continue;
    for (const [key, stage] of Object.entries(project.stages)) {
      if (!managerPreview() && stage.engineer !== previewUser) continue;
      const engineer = $('#engineer').value;
      if (engineer && stage.engineer !== engineer) continue;
      const status = $('#statefilter').value;
      const selectedStage = $('#stagefilter').value;
      if (selectedStage && selectedStage !== 'permit' && key !== selectedStage) continue;
      if (status && selectedStage !== 'permit' && stage.status !== status) continue;
      if (['OK','N/A','DONE','HOLD'].includes(stage.status) || (key === 'gas' && project.service === 'FEWA')) continue;
      const group = !stage.date ? 'undated' : stage.date < now ? 'late' : stage.date === now ? 'today' : null;
      if (group) sections[group].push({project,key,stage});
    }
  }
  return sections;
}

function renderFollowup(list) {
  const groups = followupRows(list);
  $('#hinttext').innerHTML = '<button type="button" class="btn xs" id="saveAllFollowup">حفظ التعديلات الظاهرة</button> · عدّل الحالة والموعد والملاحظات، ثم اضغط حفظ في نفس الصف';
  $('#table').innerHTML = '<thead><tr>'+['المشروع','المالك','البند','المسؤول','الحالة','الموعد','الملاحظات','الحفظ'].map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+[['late','المتأخر'],['today','المستحق اليوم'],['undated','بدون موعد']].map(([key,label])=>{
    const rows=groups[key];
    return `<tr><td colspan="8" class="followup-group">${label} · ${rows.length}</td></tr>`+rows.map(({project,key,stage})=>{
      const attrs=`data-follow-project="${esc(project.id)}" data-follow-stage="${key}"`;
      const draft=followupDrafts.get(draftKey(project.id,key));
      const values={...stage,...draft};
      const disabled=canEditStage(stage)?'':'disabled';
      return `<tr><td>${esc(project.id)}</td><td>${esc(project.name)}</td><td>${esc(titles[key])}</td><td>${esc(stage.engineer)||'—'}</td><td><select class="badge ${cls(values.status)}" ${attrs} ${disabled} data-follow-field="status" aria-label="الحالة">${inlineOptions(stageStates(project,key),values.status)}</select></td><td><input class="document-grid-input" type="date" ${attrs} ${disabled} data-follow-field="date" aria-label="الموعد" value="${esc(values.date)}"></td><td><textarea class="document-grid-input" ${attrs} ${disabled} data-follow-field="note" aria-label="الملاحظات">${esc(values.note)}</textarea></td><td><button type="button" class="btn xs" ${attrs} data-follow-save ${disabled}>حفظ</button>${draft?'<div class="sub">مسودة</div>':''}</td></tr>`;
    }).join('');
  }).join('')+'</tbody>';
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-follow-save]');
  if (!button) return;
  const {followProject,followStage}=button.dataset;
  const project=projects.find(p=>p.id===followProject);
  const stage=project?.stages[followStage];
  if (!stage || !canEditStage(stage) || stopped(project) || (!managerPreview() && stage.engineer!==previewUser)) return;

  const row=button.closest('tr');
  const input=key=>row.querySelector('[data-follow-field="'+key+'"]');
  const date=input('date');
  if (!date.reportValidity()) return;
  const status=input('status').value;
  const note=input('note').value.trim();
  if (status===stage.status && date.value===stage.date && note===stage.note) return;

  try {
    if (status!==stage.status) updateStage(project,followStage,status);
    if (date.value!==stage.date || note!==stage.note) {
      audit(project,titles[followStage]+' — تعديل الموعد أو الملاحظات');
      stage.date=date.value;
      stage.note=note;
    }
    followupDrafts.delete(draftKey(followProject,followStage));
    persist();
  } catch(error){toast(error.message)}
});

function initFollowup() {
  $('#previewUser').innerHTML='<option value="">معاينة المدير · كل الفريق</option>'+opts(people,'');
  $('#previewUser').onchange=event=>{previewUser=event.target.value;onlyMine=Boolean(previewUser);$('#engineer').value='';$('#savedFilters').value='';render()};
  $('#mine').onclick=()=>{if(!previewUser)return toast('اختر اسم مهندس للمعاينة أولًا');onlyMine=!onlyMine;render()};
  $('#followupTab').onclick=()=>{view='followup';render()};
}
