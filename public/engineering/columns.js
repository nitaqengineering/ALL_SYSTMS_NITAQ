const columnTypes = {text:'نص', number:'رقم', date:'تاريخ'};
const columnGroups = () => [...groups.map(([id,title])=>[id,title]), ...(db.columnLayout?.groups||[])];

function tableGroups() {
  const layout = db.columnLayout || {};
  const columns = [...keys, ...Object.keys(layout.fields||{})];
  const order=layout.order||[];
  columns.sort((a,b)=>(order.indexOf(a)<0?Infinity:order.indexOf(a))-(order.indexOf(b)<0?Infinity:order.indexOf(b)));
  return columnGroups().map(([id,title])=>[id,title,columns.filter(key=>
    (layout.moves?.[key] ?? layout.fields?.[key]?.group ?? groups.find(g=>g[2].includes(key))?.[0])===id
  )]).filter(group=>group[2].length);
}

function columnTitle(key) {
  return db.columnLayout?.names?.[key] || db.columnLayout?.fields?.[key]?.title || titles[key];
}

function customColumnCell(project,key) {
  const field = db.columnLayout.fields[key];
  return `<td><input class="document-grid-input" type="${field.type}" ${field.type==='number'?'step="any"':''}
    aria-label="${esc(columnTitle(key))} — مشروع ${esc(project.id)}" data-extra-key="${esc(key)}"
    data-extra-project="${esc(project.id)}" value="${esc(project.extra?.[key] ?? '')}" ${!managerPreview()||stopped(project)?'disabled':''}></td>`;
}

function layoutOptions(items, selected) {
  return items.map(([id,title])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(title)}</option>`).join('');
}

function openColumns(mode='add') {
  if(!managerPreview()) return;
  const moving=mode==='move';
  const locations=tableGroups().flatMap(([id,title,columns])=>
    columns.map(key=>[key,columnTitle(key)+' — '+title,id]));
  const tabs='<div class="column-actions"><button type="button" class="btn '+(!moving?'primary':'')+'" id="columnAddTab">إضافة عمود</button>'+
    '<button type="button" class="btn '+(moving?'primary':'')+'" id="columnMoveTab">نقل عمود</button></div>';
  const firstGroup=moving?locations[0]?.[2]:undefined;
  const fields=moving
    ? '<label for="columnToMove">العمود</label><select id="columnToMove">'+layoutOptions(locations)+'</select>'
    : field('اسم العمود','columnName','')+
      '<label for="columnType">نوع البيانات</label><select id="columnType">'+layoutOptions(Object.entries(columnTypes))+'</select>';
  show('إدارة أعمدة المشاريع',moving?'اختر العمود ثم المجموعة اللي هينتقل لها':'سمِّ العمود واختر مكانه',
    tabs+fields+(moving?field('اسم جديد للعمود — اختياري','columnRename','')+
    '<label for="columnBefore">مكان العمود داخل المجموعة</label><select id="columnBefore"></select>':'')+'<label for="columnGroup">'+(moving?'انقل إلى':'المجموعة')+'</label>'+
    '<select id="columnGroup">'+layoutOptions(columnGroups(),firstGroup)+'<option value="new-group">＋ مجموعة جديدة</option></select>'+
    '<div id="newColumnGroupField" hidden>'+field('اسم المجموعة الجديدة','columnNewGroup','')+'</div>',
    'columnLayout',null,mode);
  $('#columnAddTab').onclick=()=>openColumns('add');
  $('#columnMoveTab').onclick=()=>openColumns('move');
  $('#columnGroup').onchange=()=>{
    const addingGroup=$('#columnGroup').value==='new-group';
    $('#newColumnGroupField').hidden=!addingGroup;
    $('#columnNewGroup').required=addingGroup;
    if(addingGroup)$('#columnNewGroup').focus();
    if(moving){
      const key=$('#columnToMove').value;
      const target=tableGroups().find(([id])=>id===$('#columnGroup').value);
      const siblings=target?.[2]||[];
      const current=siblings.indexOf(key);
      const next=current<0?undefined:siblings[current+1];
      $('#columnBefore').innerHTML='<option value="">آخر المجموعة</option>'+layoutOptions(
        siblings.filter(other=>other!==key).map(other=>[other,'قبل '+columnTitle(other)]),next);
    }
  };
  if(moving)$('#columnToMove').onchange=()=>{
    $('#columnGroup').value=locations.find(([key])=>key===$('#columnToMove').value)[2];
    $('#columnGroup').onchange();
  };
  else $('#columnName').required=true;
  if(moving)$('#columnGroup').onchange();
}

function saveColumnLayout() {
  if(!managerPreview()) throw Error('إدارة الأعمدة متاحة في معاينة المدير');
  const moving=editing.k==='move';
  const key=moving?$('#columnToMove').value:'';
  const title=moving?'':$('#columnName').value.trim();
  const type=moving?'':$('#columnType').value;
  if(moving&&!tableGroups().some(([, ,columns])=>columns.includes(key))) throw Error('اختر عمودًا');
  if(!moving&&(!title||!Object.hasOwn(columnTypes,type))) throw Error('اكتب اسم العمود واختر نوعه');

  let group=$('#columnGroup').value;
  const groupsAvailable=columnGroups();
  const newTitle=group==='new-group'?$('#columnNewGroup').value.trim():'';
  if(group==='new-group'&&!newTitle) throw Error('اكتب اسم المجموعة الجديدة');
  if(!newTitle&&!groupsAvailable.some(([id])=>id===group)) throw Error('اختر مجموعة');
  const layout=db.columnLayout ??= {groups:[],fields:{},moves:{}};
  if(newTitle){
    group=groupsAvailable.find(([,label])=>label===newTitle)?.[0];
    if(!group){
      group='group-'+crypto.randomUUID();
      layout.groups.push([group,newTitle]);
    }
  }
  if(moving){
    const before=$('#columnBefore').value;
    const order=tableGroups().flatMap(([, ,columns])=>columns).filter(other=>other!==key);
    const index=before?order.indexOf(before):-1;
    order.splice(index<0?order.length:index,0,key);
    layout.order=order;
    layout.moves[key]=group;
    const rename=$('#columnRename').value.trim();
    if(rename)(layout.names??={})[key]=rename;
  }
  else layout.fields['field-'+crypto.randomUUID()]={title,type,group};
}

document.addEventListener('change',event=>{
  const {extraKey,extraProject}=event.target.dataset;
  if(!extraKey||!managerPreview()||!db.columnLayout?.fields?.[extraKey]) return;
  const project=projects.find(p=>p.id===extraProject);
  if(!project||stopped(project)||!event.target.reportValidity()) return;
  (project.extra??={})[extraKey]=event.target.value.trim();
  persist();
});
