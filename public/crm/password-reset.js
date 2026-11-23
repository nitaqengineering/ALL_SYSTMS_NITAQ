// Same project and default session storage as CRM; never accept a server URL from the recovery link.
const crmRecoveryConfig={url:'https://hihjleshocaazanwyqdu.supabase.co',key:'sb_publishable_9kNiWtyb5EYMDedkn9ec-g_AR5vzqCN'};
const crmRecoveryClient=window.supabase.createClient(crmRecoveryConfig.url,crmRecoveryConfig.key,{auth:{persistSession:true,autoRefreshToken:true}});
const crmRecoveryForm=document.getElementById('resetForm');
const crmRecoveryMessage=document.getElementById('message');
let crmRecoveryActor=null;

async function initializeCrmRecovery(){
  try{
    const session=await crmRecoveryClient.auth.getSession();
    if(session.error||!session.data?.session)throw Error('الرابط غير صالح أو انتهت صلاحيته. ارجع إلى CRM واطلب رابط استعادة جديدًا.');
    const identity=await crmRecoveryClient.auth.getUser();
    if(identity.error||!identity.data?.user)throw Error('تعذر التحقق من الحساب. اطلب رابط استعادة جديدًا.');
    crmRecoveryActor=identity.data.user.id;
    crmRecoveryMessage.textContent='اختر كلمة مرور جديدة لحساب '+identity.data.user.email;
    crmRecoveryForm.hidden=false;
  }catch(error){crmRecoveryMessage.textContent=error.message||'تعذر فتح رابط الاستعادة.';}
  finally{history.replaceState(null,'',location.pathname);}
}

crmRecoveryForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!crmRecoveryForm.reportValidity())return;
  const password=document.getElementById('password'),confirmation=document.getElementById('confirmPassword');
  if(password.value!==confirmation.value){crmRecoveryMessage.textContent='كلمتا المرور غير متطابقتين.';confirmation.focus();return;}
  const button=document.getElementById('savePassword');
  if(button.disabled)return;
  button.disabled=true;
  try{
    const identity=await crmRecoveryClient.auth.getUser();
    if(!crmRecoveryActor||identity.error||identity.data?.user?.id!==crmRecoveryActor)throw Error('تغير حساب الدخول. افتح رابط الاستعادة من جديد.');
    const result=await crmRecoveryClient.auth.updateUser({password:password.value});
    if(result.error)throw Error('تعذر حفظ كلمة المرور. جرّب كلمة أقوى، أو اطلب رابط استعادة جديدًا.');
    crmRecoveryForm.hidden=true;
    crmRecoveryMessage.textContent='تم حفظ كلمة المرور. افتح CRM من الرابط أدناه.';
  }catch(error){crmRecoveryMessage.textContent=error.message||'تعذر حفظ كلمة المرور.';}
  finally{password.value='';confirmation.value='';button.disabled=false;}
});
void initializeCrmRecovery();
