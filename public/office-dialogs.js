// Shared dialog presentation. Explicit cancel handlers keep ownership of dismissal.
(()=>{
 const tracked=new Map();let serial=0,queued=false;
 const selector='.overlay>.modal,.ov>.dw,.mo>.box';
 const focusable=box=>[...box.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&!e.closest('[hidden],[inert]'));
 const cancelButton=box=>[...box.querySelectorAll('button')].find(b=>['إلغاء','الغاء','إغلاق','اغلاق','cancel','close'].includes(b.textContent.trim().toLowerCase()));
 const closeButton=box=>box.querySelector('button.close-x,button.x')||cancelButton(box);
 function describe(box){
  const title=box.querySelector('h2,h3,[data-office-dialog-title]');
  if(title){title.id=title.id||'office-dialog-title-'+(++serial);box.setAttribute('aria-labelledby',title.id);}
  else if(!box.hasAttribute('aria-label')&&!box.hasAttribute('aria-labelledby'))box.setAttribute('aria-label','نافذة تفاصيل');
  const close=closeButton(box);
  let shortcut=box.querySelector('button.office-dialog-close');
  if(!shortcut&&title&&close&&!box.querySelector('button.close-x,button.x')){
   shortcut=document.createElement('button');shortcut.type='button';shortcut.className='office-dialog-close';shortcut.textContent='×';
   // Resolve the live React button at click time, never keep a detached cancel node.
   shortcut.onclick=()=>{const live=closeButton(box);if(live&&!live.disabled)live.click();};title.after(shortcut);
  }
  for(const button of [box.querySelector('button.close-x,button.x'),shortcut].filter(Boolean)){button.setAttribute('aria-label','إغلاق النافذة');button.title='إغلاق';}
 }
 function scan(){
  queued=false;
  for(const [box,state] of tracked)if(!box.isConnected){tracked.delete(box);const previous=state.previous;if(previous?.isConnected){const top=[...document.querySelectorAll(selector)].at(-1);if(!top||top.contains(previous))previous.focus();}}
  for(const box of document.querySelectorAll(selector)){
   describe(box);if(tracked.has(box))continue;
   const state={previous:document.activeElement,dirty:false};tracked.set(box,state);
   box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.tabIndex=-1;
   box.addEventListener('input',()=>{state.dirty=true;});box.addEventListener('change',()=>{state.dirty=true;});
   box.addEventListener('keydown',e=>{
    const top=[...document.querySelectorAll(selector)].at(-1);if(top!==box)return;
    const editing=e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="combobox"]');
    if(e.key==='Escape'){
     // Never discard entered values, dismiss an IME, or compete with native input popups.
     if(e.isComposing||e.defaultPrevented||editing||state.dirty)return;
     const close=closeButton(box);if(close&&!close.disabled){e.preventDefault();e.stopPropagation();close.click();}return;
    }
    if(e.key!=='Tab')return;const items=focusable(box);if(!items.length){e.preventDefault();box.focus();return;}
    if(e.shiftKey&&(document.activeElement===items[0]||document.activeElement===box)){e.preventDefault();items.at(-1).focus();}
    else if(!e.shiftKey&&(document.activeElement===items.at(-1)||document.activeElement===box)){e.preventDefault();items[0].focus();}
   });
   if(!box.contains(document.activeElement))box.focus();
  }
 }
 const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan);}});
 observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});scan();
})();
