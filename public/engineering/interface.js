let searchTimer;
function scheduleSearchRender() {
  clearTimeout(searchTimer);
  searchTimer=setTimeout(renderKeepingFocus,140);
}

function renderKeepingFocus() {
  const table=$('#table');
  const focused=typeof document.activeElement==='object'?document.activeElement:null;
  const attributes=focused&&table.contains?.(focused)
    ? Object.entries(focused.dataset).filter(([key])=>key!=='followSave') : [];
  const viewport=table.parentElement;
  const left=viewport?.scrollLeft;
  const top=viewport?.scrollTop;
  render();
  if(viewport){viewport.scrollLeft=left;viewport.scrollTop=top}
  if(!attributes.length)return;
  const replacement=[...table.querySelectorAll('button, input, select, textarea')].find(control=>
    control.tagName===focused.tagName && !control.disabled && attributes.every(([key,value])=>control.dataset[key]===value));
  const projectId=focused.closest('tr')?.querySelector('[data-project]')?.dataset.project;
  const fallback=projectId&&[...table.querySelectorAll('[data-project]')].find(button=>button.dataset.project===projectId);
  (replacement||fallback)?.focus({preventScroll:true});
}

function renderActiveFilters() {
  const chips = [];
  for (const id of ['search','engineer','filter','stagefilter','statefilter']) {
    const control = $('#'+id);
    if (!control.value.trim() || (id === 'filter' && control.value === 'all')) continue;
    const text = control.selectedOptions?.[0]?.textContent || control.value;
    chips.push([id,text]);
  }
  if (onlyMine) chips.push(['mine','المسند لي']);
  $('#activeFilters').innerHTML = chips.map(([id,text]) =>
    '<button type="button" data-remove-filter="'+id+'" aria-label="إزالة '+esc(text)+'" title="'+esc(text)+'">'+esc(text)+' ×</button>'
  ).join('');
}

function refreshInterface() {
  if(searchTimer!==undefined)clearTimeout(searchTimer);
  const tabs={projects:'projectsTab',documents:'documentsTab',tender:'tenderTab',supervision:'superTab',followup:'followupTab'};
  for(const [name,id] of Object.entries(tabs)) {
    if(view===name) $('#'+id).setAttribute('aria-current','page');
    else $('#'+id).removeAttribute?.('aria-current');
  }
  const menu=$('.admin-menu');
  if(menu){menu.hidden=!managerPreview();if(!managerPreview())menu.open=false}
  $('#mine').disabled=!previewUser;
  $('#mine').setAttribute('aria-pressed', String(onlyMine));
  $('#mine').className='btn '+(onlyMine?'primary':'');
  $('#settings').hidden=!managerPreview();
  $('#backup').hidden=!managerPreview();
  const count=Number(onlyMine)+['search','engineer','statefilter'].filter(id=>$('#'+id).value.trim()).length+
    Number($('#filter').value!=='all') + Number(!!$('#stagefilter').value);
  renderActiveFilters();
  $('#clearFilters').textContent=count?'مسح الفلاتر ('+count+')':'مسح الفلاتر';
  $('#clearFilters').disabled=!count&&!$('#stagefilter').value;
}

function initInterface() {
  $('#activeFilters').onclick = event => {
    const button = event.target.closest('[data-remove-filter]');
    if (!button) return;
    const id = button.dataset.removeFilter;
    if (id === 'mine') onlyMine = false;
    else $('#'+id).value = id === 'filter' ? 'all' : '';
    if (id === 'stagefilter') updateFilter();
    else render();
    $('#'+(id === 'mine' ? 'mine' : id)).focus?.();
  };
  $('#clearFilters').onclick=()=>{
    reportDrill=null;
    for(const id of ['search','engineer','stagefilter','savedFilters']) $('#'+id).value='';
    $('#filter').value='all';
    onlyMine=false;
    updateFilter();
  };
  document.addEventListener('click',event=>{
    const menu=$('.admin-menu');
    if(menu?.open && (!menu.contains(event.target)||event.target.closest('.admin-actions button')))menu.open=false;
  });
  let openedFromAdmin=false;
  document.addEventListener('click',event=>{
    if(event.target.closest('.admin-actions button'))openedFromAdmin=true;
  },true);
  $('#edit').addEventListener?.('close',()=>{
    if($('#edit').open)return;
    const restoreFocus=openedFromAdmin;
    openedFromAdmin=false;
    const menu=$('.admin-menu');
    if(restoreFocus&&!menu?.hidden&&document.activeElement!==$('#savedFilters'))menu?.querySelector('summary').focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{
    const menu=$('.admin-menu');
    if(event.key!=='Escape'||!menu?.open||$('#edit').open)return;
    menu.open=false;
    menu.querySelector('summary').focus();
  });
}
