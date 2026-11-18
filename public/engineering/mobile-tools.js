// Compact workspace chrome. Move the live controls so handlers, values and permissions survive.
(()=>{
 const navigation=document.querySelector('.compact-navigation');
 const primary=document.getElementById('primaryFilters');
 const search=document.querySelector('.workspace-filter-search');
 if(!navigation||!primary||!search)return;
 const bar=document.createElement('div');bar.className='workspace-quickbar';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='btn';
 toggle.id='workspaceControlsToggle';toggle.setAttribute('aria-controls','workspaceControlsPanel');
 const panel=document.createElement('section');panel.id='workspaceControlsPanel';
 panel.className='workspace-controls-panel';panel.setAttribute('aria-label','الفلاتر وأدوات متابعة المشاريع');
 navigation.before(bar,panel);
 for(const node of [navigation,document.getElementById('stats'),primary.closest('.combined-filters'),document.getElementById('secondaryFilters'),document.getElementById('statusLegend')]){
  if(node)panel.append(node);
 }
 bar.append(toggle,search);
 for(const id of ['add','workspaceSaveNow','workspaceSaveStatus']){
  const node=document.getElementById(id);if(node)bar.append(node);
 }
 function setExpanded(expanded){
  panel.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));
  toggle.textContent=expanded?'إخفاء الفلاتر والأدوات':'الفلاتر وأدوات المتابعة';
  if(!expanded){const menu=panel.querySelector('.admin-menu');if(menu)menu.open=false;}
 }
 toggle.addEventListener('click',()=>setExpanded(panel.hidden));
 // A compact default on every visit; never clear filters when closing the panel.
 setExpanded(false);
 const syncSearch=()=>{search.hidden=primary.hidden;};
 new MutationObserver(syncSearch).observe(primary,{attributes:true,attributeFilter:['hidden']});syncSearch();
 // The existing ? shortcut activates this same button, so its result must be visible.
 document.getElementById('colorKey')?.addEventListener('click',()=>setExpanded(true),true);
 // Removing a chip still works while its original filter is collapsed.
 document.getElementById('activeFilters')?.addEventListener('click',event=>{
  if(event.target.closest('[data-remove-filter]')&&panel.hidden)toggle.focus({preventScroll:true});
 });
})();
