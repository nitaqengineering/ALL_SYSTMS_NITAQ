// Mobile progressive disclosure: move existing controls, never clone IDs or handlers.
(()=>{
 const media=matchMedia('(max-width:760px)'),navigation=document.querySelector('.compact-navigation'),tools=document.getElementById('secondaryFilters');
 if(!navigation||!tools)return;
 const entries=[];
 function disclosure(target,title){
  const anchor=document.createComment('mobile-tools-anchor');target.before(anchor);
  const details=document.createElement('details');details.className='mobile-tool-disclosure';
  const summary=document.createElement('summary');summary.textContent=title;details.append(summary);
  entries.push({target,anchor,details});
 }
 disclosure(navigation,'التنقل وأدوات المتابعة');disclosure(tools,'أدوات الجدول والتصدير');
 function layout(){for(const {target,anchor,details} of entries){
  if(media.matches){if(!details.isConnected){anchor.after(details);details.append(target);}}
  else if(details.isConnected){anchor.after(target);details.remove();details.open=false;}
 }}
 media.addEventListener('change',layout);layout();
})();
