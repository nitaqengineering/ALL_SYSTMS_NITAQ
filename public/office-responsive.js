// Presentation only: no data reads, mutations, permissions or persistence.
(()=>{
 const media=matchMedia('(max-width:760px)');let sidebar,nav,toggle,cleanup;
 function setup(){
  if(toggle?.isConnected)return;
  cleanup?.();cleanup=null;
  sidebar=document.querySelector('.sidebar,.side');nav=sidebar?.querySelector('nav.nav');
  const brand=sidebar?.querySelector('.brand');if(!nav||!brand)return;
  toggle=document.createElement('button');toggle.type='button';toggle.className='office-nav-toggle';
  toggle.textContent='القائمة';nav.id=nav.id||'office-section-navigation';toggle.setAttribute('aria-controls',nav.id);brand.append(toggle);
  const state=open=>{nav.hidden=media.matches&&!open;toggle.setAttribute('aria-expanded',String(!nav.hidden));};
  toggle.onclick=()=>state(nav.hidden);
  nav.addEventListener('click',e=>{if(media.matches&&e.target.closest('a,.nav-item,button')){state(false);toggle.focus();}});
  sidebar.addEventListener('keydown',e=>{if(e.key==='Escape'&&media.matches&&!nav.hidden){state(false);toggle.focus();}});
  const onMedia=()=>state(false);media.addEventListener('change',onMedia);cleanup=()=>media.removeEventListener('change',onMedia);state(false);
 }
 new MutationObserver(setup).observe(document.getElementById('root')||document.body,{childList:true,subtree:true});setup();
})();
