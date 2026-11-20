function CloudSplash({text,hint}){
  return <div style={{minHeight:'100vh',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(160deg,var(--abyss),var(--navy))'}}>
    <div style={{textAlign:'center',color:'#fff'}}>
      <img src={NITAQ_LOGO} alt="نطاق" style={{width:96,margin:'0 auto 18px',display:'block'}}/>
      <div className="glyph" style={{width:26,height:26,border:'2px solid var(--gold)',borderRadius:'50%',
        margin:'0 auto 16px',borderTopColor:'transparent',animation:'spin 1s linear infinite'}}/>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{fontWeight:800,fontSize:15}}>{text}</div>
      {hint&&<div style={{marginTop:10,fontSize:12,color:'#C7D0DB',maxWidth:320}}>{hint}</div>}
    </div>
  </div>;
}

function CloudError({err,onRetry}){
  return <div style={{minHeight:'100vh',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(160deg,var(--abyss),var(--navy))'}}>
    <div className="card" style={{width:'min(430px,100%)'}}>
      <div className="card-h" style={{background:'var(--abyss)',borderColor:'transparent'}}>
        <img src={NITAQ_LOGO} alt="نطاق" style={{width:26,height:26,objectFit:'contain',flex:'0 0 26px'}}/>
        <h3 style={{color:'#fff'}}>تعذّر الاتصال بالسحابة</h3>
      </div>
      <div style={{padding:18}}>
        <div className="warn" style={{marginBottom:14}}>{err||'خطأ غير معروف'}</div>
        <p style={{fontSize:12.5,marginBottom:14}}>العمل متوقف حتى يعود الاتصال، حتى لا تُسجَّل بيانات على هذا الجهاز فقط ولا تصل لبقية الفريق.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn gold" onClick={onRetry}>إعادة المحاولة</button>
        </div>
      </div>
    </div>
  </div>;
}

/* تسجيل الدخول / إنشاء حساب — بإيميل وباسورد حقيقيين عبر Supabase Auth.
   أول حساب يتسجل في المشروع بيبقى مالك تلقائياً (تريجر في قاعدة البيانات). */
function CloudAuth({sb}){
  const [mode,setMode]=useState('signin'); // signin | signup | reset
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[pass,setPass]=useState('');
  const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[okMsg,setOkMsg]=useState('');

  const submit=async()=>{
    setErr('');setOkMsg('');
    if(!email.trim()||(mode!=='reset'&&!pass)) return setErr('اكتب الإيميل والباسورد');
    setBusy(true);
    try{
      if(mode==='signin'){
        const {error}=await sb.auth.signInWithPassword({email:email.trim(),password:pass});
        if(error) throw error;
      }else{
        const {error}=await sb.auth.resetPasswordForEmail(email.trim());
        if(error) throw error;
        setOkMsg('لو الإيميل ده مسجّل، هيوصلك لينك لإعادة تعيين الباسورد.');
      }
    }catch(e){ setErr(e.message||'حصل خطأ — جرّب تاني'); }
    setBusy(false);
  };

  return <div style={{minHeight:'100vh',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(160deg,var(--abyss),var(--navy))'}}>
    <img src={NITAQ_LOGO} alt="نطاق" style={{width:120,marginBottom:22}}/>
    <div className="card" style={{width:'min(430px,100%)'}}>
      <div className="card-h" style={{background:'var(--abyss)',borderColor:'transparent'}}>
        <h3 style={{color:'#fff'}}>{mode==='signup'?'إنشاء حساب':mode==='reset'?'استرجاع الباسورد':'تسجيل الدخول'}</h3>
      </div>
      <div style={{padding:18}}>
        {mode==='signup'&&<Field label="الاسم">
          <input className="in" value={name} onChange={e=>setName(e.target.value)} autoFocus/></Field>}
        <Field label="الإيميل">
          <input className="in en" type="email" value={email} autoFocus={mode!=='signup'}
            onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&mode==='reset')submit()}}/></Field>
        {mode!=='reset'&&<Field label="كلمة المرور">
          <input className="in" type="password" value={pass} onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')submit()}}/></Field>}
        {err&&<div className="hint" style={{color:'var(--red)',marginBottom:10}}>{err}</div>}
        {okMsg&&<div className="hint" style={{color:'var(--green,#1a7f37)',marginBottom:10}}>{okMsg}</div>}
        <button className="btn gold" style={{width:'100%',marginBottom:10}} onClick={submit} disabled={busy}>
          {busy?'لحظة…':mode==='signup'?'إنشاء الحساب':mode==='reset'?'إرسال لينك الاسترجاع':'دخول'}</button>
        {mode==='signin'&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}>
          <a onClick={()=>{setMode('reset');setErr('');setOkMsg('')}} style={{cursor:'pointer',color:'var(--ink-soft)'}}>نسيت الباسورد؟</a>
        </div>}
        {mode!=='signin'&&<div style={{textAlign:'center',fontSize:12.5}}>
          <a onClick={()=>{setMode('signin');setErr('');setOkMsg('')}} style={{cursor:'pointer',color:'var(--brass)'}}>رجوع لتسجيل الدخول</a>
        </div>}
        <div className="hint" style={{marginTop:14,lineHeight:1.8}}>
          الدخول للمستخدمين المعتمدين فقط. الحساب الجديد لا يحصل على صلاحيات تلقائيًا؛ الإدارة تعتمد الحساب وتربطه بالمستخدم الصحيح.
        </div>
      </div>
    </div>
  </div>;
}

function Login({db,onPick}){
  const [sel,setSel]=useState(null),[pin,setPin]=useState(''),[err,setErr]=useState('');
  const users=(db.users||[]).filter(u=>u.active!==false);
  const go=u=>{
    if(u.pin){setSel(u);setPin('');setErr('')}
    else onPick(u);
  };
  const ok=()=>{if(pin===sel.pin){onPick(sel)}else setErr('الرقم السري غلط')};
  return <div style={{minHeight:'100vh',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(160deg,var(--abyss),var(--navy))'}}>
    <div className="card" style={{width:'min(430px,100%)'}}>
      <div className="card-h" style={{background:'var(--abyss)',borderColor:'transparent'}}>
        <div className="glyph" style={{width:26,height:26,flex:'0 0 26px',border:'1.5px solid var(--gold)',position:'relative'}}/>
        <h3 style={{color:'#fff'}}>نطاق — مين بيشتغل دلوقتي؟</h3>
      </div>
      <div style={{padding:18}}>
        {!sel
          ? <>
              {users.map(u=>(
                <button key={u.id} className="btn ghost" style={{width:'100%',justifyContent:'space-between',marginBottom:8,padding:'12px 15px'}}
                  onClick={()=>go(u)}>
                  <span style={{fontWeight:800,fontSize:14}}>{u.name}</span>
                  <Tag c={u.role==='owner'?'t-gold':'t-blue'}>{u.role==='owner'?'مالك':'مهندس'}</Tag>
                </button>))}
              <div className="hint" style={{marginTop:12,lineHeight:1.8}}>
                الاختيار ده بينظّم الشغل — كل واحد يشوف مهامه. مش حماية أمنية،
                لأن التطبيق شغّال على الجهاز نفسه.
              </div>
            </>
          : <>
              <Field label={'الرقم السري — '+sel.name}>
                <input className="in num" type="password" inputMode="numeric" value={pin} autoFocus
                  onChange={e=>{setPin(e.target.value);setErr('')}}
                  onKeyDown={e=>{if(e.key==='Enter')ok()}}/>
              </Field>
              {err&&<div className="hint" style={{color:'var(--red)',marginBottom:10}}>{err}</div>}
              <div style={{display:'flex',gap:8}}>
                <button className="btn gold" onClick={ok}>دخول</button>
                <button className="btn ghost" onClick={()=>{setSel(null);setPin('');setErr('')}}>رجوع</button>
              </div>
            </>}
      </div>
    </div>
  </div>;
}

/* ============ المستخدمون والصلاحيات — للمالك فقط ============ */
function Users({db,setDb,me,toast,inCloud,invite,mergeProfile}){
  const users=db.users||[];
  const LOADS=useMemo(()=>{const m=new Map();
    for(const l of db.leads){[l.ownerId,l.engineerId].forEach((id,i)=>{
      if(!id||(i===1&&id===l.ownerId))return; m.set(id,(m.get(id)||0)+1)})}
    return m},[db.leads]);
  const upd=(id,p)=>setDb(d=>({...d,users:d.users.map(u=>u.id===id?{...u,...p}:u)}));
  const perm=(id,k,v)=>setDb(d=>({...d,users:d.users.map(u=>u.id===id?{...u,perms:{...(u.perms||{}),[k]:v}}:u)}));
  const [nn,setNn]=useState(''),[ne,setNe]=useState(''),[busy,setBusy]=useState(false);
  const [mergeSel,setMergeSel]=useState({}); // {legacyId: chosenRealUserId}
  const realUsers=users.filter(u=>u.authId);
  const legacyUsers=users.filter(u=>!u.authId);
  const add=()=>{
    const n=nn.trim(); if(!n) return;
    if(users.some(u=>u.name===n)) return toast('الاسم موجود بالفعل');
    setDb(d=>({...d,users:[...d.users,{id:uid(),name:n,role:'engineer',pin:'',perms:{...BASE_PERMS},active:true}]}));
    setNn(''); toast('اتضاف — وظهر فوراً في قوائم المسؤول والمهندس');
  };
  const doInvite=async()=>{
    const n=nn.trim(), e=ne.trim();
    if(!n||n.length>200||!/^\S+@\S+\.\S+$/.test(e)||e.length>254) return toast('اكتب اسمًا وبريدًا إلكترونيًا صحيحين');
    if(users.some(u=>String(u.email||'').toLowerCase()===e.toLowerCase())) return toast('الإيميل ده مدعو بالفعل');
    setBusy(true);
    const r=await invite(n,e);
    setBusy(false);
    if(r&&r.ok){ setNn('');setNe(''); toast('تم تسجيل المستخدم. الإدارة تنشئ دعوة الدخول من Supabase ثم تربط الحساب من دمج المستخدمين؛ لم تُرسل رسالة من هذه الشاشة'); }
    else toast('حصل خطأ في الدعوة — جرّب تاني');
  };
  const doMerge=async(legacyId)=>{
    const targetId=mergeSel[legacyId];
    const target=realUsers.find(u=>u.id===targetId);
    if(!target) return toast('اختار الحساب الحقيقي الأول');
    if(!confirm('هيتم دمج السجلات القديمة كلها في حساب «'+target.name+'» — الإجراء ده نهائي. تكمل؟')) return;
    const r=await mergeProfile(legacyId, target);
    if(r&&r.ok) toast('اتدمج — سجلات '+target.name+' القديمة رجعت تظهر ليه');
    else toast('حصل خطأ في الدمج — جرّب تاني');
  };

  return <div className="wrap">
    {!inCloud&&<div className="warn" style={{marginBottom:16}}>
      ◆ الصلاحيات دي <b>تنظيم تشغيلي</b> — بتحدّد اللي كل واحد يشوفه ويعمله من الشاشة.
      مش حماية أمنية، لأن الملف شغّال على جهاز المستخدم. الحماية الحقيقية بتيجي مع نقل النظام لسيرفر Supabase.
    </div>}
    {inCloud&&<div className="hint" style={{marginBottom:16}}>
      ◆ النظام متصل بالسحابة — الصلاحيات دي حماية حقيقية على مستوى قاعدة البيانات (RLS)، مش تنظيم شكلي بس.
    </div>}

    <div className="card" style={{marginBottom:14}}>
      <div className="card-h"><span className="dot"/><h3>{inCloud?'دعوة مستخدم جديد':'إضافة مستخدم'}</h3></div>
      <div style={{padding:16,display:'flex',gap:8,flexWrap:'wrap'}}>
        <input className="in" style={{flex:'1 1 160px'}} placeholder="الاسم…" value={nn}
          onChange={e=>setNn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')(inCloud?doInvite:add)()}}/>
        {inCloud&&<input className="in en" style={{flex:'1 1 200px'}} placeholder="الإيميل…" value={ne}
          onChange={e=>setNe(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')doInvite()}}/>}
        <button className="btn gold" onClick={inCloud?doInvite:add} disabled={busy}>
          {busy?'لحظة…':inCloud?'تسجيل المستخدم':'إضافة'}</button>
      </div>
      {inCloud&&<div className="hint" style={{padding:'0 16px 14px'}}>
        هذه الشاشة تسجل الاسم والصلاحيات. ترسل الإدارة دعوة الدخول من Supabase، ثم تربط الحساب بالمستخدم المسجل عبر «دمج مستخدم قديم». لا توجد صلاحيات تلقائية أو رسالة دعوة من هذا الزر.
      </div>}
    </div>

    {inCloud&&legacyUsers.length>0&&realUsers.length>0&&<div className="card" style={{marginBottom:14}}>
      <div className="card-h"><span className="dot"/><h3>دمج مستخدمين قدامى بحسابات حقيقية</h3></div>
      <div style={{padding:16}}>
        <div className="hint" style={{marginBottom:12}}>
          الأسماء دي مالهاش حساب دخول حقيقي (سجلات قديمة من قبل الربط السحابي، أو دعوة لسه معلّقة).
          لو حد منهم هو نفسه شخص عنده حساب حقيقي دلوقتي، ادمجهم عشان سجلاته القديمة ترجع تظهر ليه.
        </div>
        {legacyUsers.map(u=>{
          const load=LOADS.get(u.id)||0;
          return <div key={u.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',
              padding:'8px 0',borderBottom:'1px solid var(--line)'}}>
            <b style={{minWidth:110}}>{u.name}</b>
            <span className="hint num">{load} سجل</span>
            <span>=</span>
            <select className="in" style={{flex:'1 1 180px'}} value={mergeSel[u.id]||''}
              onChange={e=>setMergeSel(s=>({...s,[u.id]:e.target.value}))}>
              <option value="">اختار الحساب الحقيقي…</option>
              {realUsers.map(r=><option key={r.id} value={r.id}>{r.name} ({r.email})</option>)}
            </select>
            <button className="btn sm gold" onClick={()=>doMerge(u.id)} disabled={!mergeSel[u.id]}>دمج</button>
          </div>;
        })}
      </div>
    </div>}

    {users.map(u=>{
      const own=u.role==='owner', self=u.id===me.id;
      const load=LOADS.get(u.id)||0;
      return <div className="card" style={{marginBottom:14,opacity:u.active===false?.55:1}} key={u.id}>
        <div className="card-h"><span className="dot"/>
          <h3>{u.name}</h3>
          <Tag c={own?'t-gold':'t-blue'}>{own?'مالك':'مهندس'}</Tag>
          {inCloud&&!u.authId&&<Tag c="t-gray">{u.email?'دعوة معلّقة':'قديم — بلا حساب دخول'}</Tag>}
          <span className="hint num">{load} سجل</span>
          <span className="grow"/>
          {!self&&<button className="btn sm ghost" onClick={()=>upd(u.id,{active:u.active===false})}>
            {u.active===false?'تفعيل':'إيقاف'}</button>}
        </div>
        <div style={{padding:16}}>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))'}}>
            <Field label="الاسم" hint="غيّره براحتك — سجلاته مربوطة برقمه مش باسمه">
              <input className="in" value={u.name} onChange={e=>upd(u.id,{name:e.target.value})}/></Field>
            <Field label="الدور" hint={self?'مش هتقدر تغيّر دورك انت':''}>
              <select className="in" value={u.role} disabled={self}
                onChange={e=>upd(u.id,{role:e.target.value})}>
                <option value="engineer">مهندس</option><option value="owner">مالك</option></select></Field>
            {inCloud
              ? <Field label="الإيميل" hint="مربوط بحساب الدخول — مش قابل للتعديل من هنا">
                  <input className="in en" value={u.email||''} disabled/></Field>
              : <Field label="رقم سري (اختياري)" hint="بيمنع الفتح بالغلط باسم غيرك — مش تشفير">
                  <input className="in num" value={u.pin||''} inputMode="numeric" placeholder="بدون"
                    onChange={e=>upd(u.id,{pin:e.target.value})}/></Field>}
          </div>

          {own
            ? <div className="hint">المالك عنده كل الصلاحيات تلقائياً.</div>
            : <>
                <label style={{marginBottom:9}}>الصلاحيات الإضافية</label>
                <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:2}}>
                  {PERMS.map(p=>(
                    <label key={p.id} style={{display:'flex',gap:9,alignItems:'center',padding:'7px 9px',
                      borderRadius:7,cursor:'pointer',fontWeight:600,fontSize:12.5,color:'var(--ink)',margin:0}}>
                      <input type="checkbox" checked={!!(u.perms||{})[p.id]}
                        onChange={e=>perm(u.id,p.id,e.target.checked)}/>
                      {p.l}
                    </label>))}
                </div>
                <div className="hint" style={{marginTop:10}}>
                  من غير «يشوف كل السجلات»، {u.name} بيشوف السجلات اللي هو مسؤول عنها أو مهندسها بس.
                </div>
              </>}
        </div>
      </div>;
    })}
  </div>;
}

/* ============ طباعة مهام اليوم — A4 ============ */
const PSECS=[
 {id:'late', l:'متأخر'},
 {id:'now',  l:'اليوم'},
 {id:'deliv',l:'التسليمات'},
 {id:'foll', l:'المتابعة'}
];

function PrintDialog({db,me,close,run}){
  const canAll=me.role==='owner'||can(me,'seeAll');
  const users=(db.users||[]).filter(u=>u.active!==false);
  const [who,setWho]=useState(canAll?'all':me.id);
  const [secs,setSecs]=useState({late:true,now:true,deliv:true,foll:true});
  const [empty,setEmpty]=useState(false);
  const list=who==='all'?users:users.filter(u=>u.id===who);
  const counts=list.map(u=>{
    const b=taskBuckets(db,l=>assignedTo(u,l));
    return {u,n:PSECS.reduce((t,s)=>t+(secs[s.id]?b[s.id].length:0),0)};
  });
  const pages=counts.filter(x=>empty||x.n>0).length;

  return <div className="mo" onClick={e=>e.target===e.currentTarget&&close()}>
    <div className="box">
      <h3>طباعة مهام اليوم — A4</h3>
      <div className="bd">
        <Field label="لمين؟">
          <select className="in" value={who} onChange={e=>setWho(e.target.value)}>
            {canAll&&<option value="all">كل المهندسين — ورقة لكل واحد</option>}
            {users.filter(u=>canAll||u.id===me.id).map(u=>
              <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="الأقسام اللي تتطبع">
          {PSECS.map(s=>(
            <label key={s.id} style={{display:'flex',gap:9,alignItems:'center',padding:'6px 8px',
              borderRadius:7,cursor:'pointer',fontWeight:600,fontSize:13,color:'var(--ink)',margin:0}}>
              <input type="checkbox" checked={secs[s.id]}
                onChange={e=>setSecs({...secs,[s.id]:e.target.checked})}/>{s.l}</label>))}
        </Field>
        <label style={{display:'flex',gap:9,alignItems:'center',padding:'6px 8px',borderRadius:7,
          cursor:'pointer',fontWeight:600,fontSize:13,color:'var(--ink)',margin:'0 0 10px'}}>
          <input type="checkbox" checked={empty} onChange={e=>setEmpty(e.target.checked)}/>
          اطبع ورقة حتى للمهندس اللي مالوش مهام
        </label>

        <div className="card" style={{background:'#FAF7F1'}}><div style={{padding:'10px 13px'}}>
          {counts.map(({u,n})=>(
            <div key={u.id} style={{display:'flex',gap:8,fontSize:12.5,padding:'3px 0'}}>
              <b style={{flex:1}}>{u.name}</b>
              <span className={n?'':'hint'}>{n} مهمة</span>
            </div>))}
          <div className="hint" style={{marginTop:8,borderTop:'1px solid var(--line)',paddingTop:7}}>
            هيتطبع <b>{pages}</b> صفحة A4.
          </div>
        </div></div>
      </div>
      <div className="ft">
        <button className="btn gold" disabled={!pages} style={!pages?{opacity:.45}:{}}
          onClick={()=>run({who,secs,empty})}>طباعة</button>
        <button className="btn ghost" onClick={close}>إلغاء</button>
      </div>
    </div>
  </div>;
}

function PrintSheets({db,cfg}){
  if(!cfg) return null;
  const users=(db.users||[]).filter(u=>u.active!==false)
    .filter(u=>cfg.who==='all'||u.id===cfg.who);
  const T=todayISO();
  const D=new Date(T+'T00:00:00');
  const dayName=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][D.getDay()];

  const sheets=users.map(u=>{
    const b=taskBuckets(db,l=>assignedTo(u,l));
    const secs=PSECS.filter(s=>cfg.secs[s.id]&&b[s.id].length);
    const n=secs.reduce((t,s)=>t+b[s.id].length,0);
    return {u,b,secs,n};
  }).filter(x=>cfg.empty||x.n>0);

  return <div className="printsheet">
    {sheets.map(({u,b,secs,n})=>(
      <section className="psheet" key={u.id}>
        <div className="ph">
          <img src={NITAQ_LOGO} alt="نطاق" className="plogo"/>
          <div>
            <h1>مهام اليوم</h1>
            <div className="sb">نطاق للاستشارات الهندسية · NITAQ ENGINEERING CONSULTANTS</div>
          </div>
          <div className="who">
            المهندس / <b>{u.name}</b><br/>
            <span className="num">{fmt(T)}</span> — {dayName}
          </div>
        </div>
        <div className="pmeta">
          <span>إجمالي المهام: <b>{n}</b></span>
          {secs.map(s=><span key={s.id}>{s.l}: <b>{b[s.id].length}</b></span>)}
        </div>

        {n===0&&<div className="psec"><h2>مفيش مهام مستحقة</h2></div>}

        {secs.map(s=>(
          <div className="psec" key={s.id}>
            <h2>{s.l} — {b[s.id].length}</h2>
            <table className="ptab">
              <thead><tr>
                <th style={{width:'4%'}}>تم</th>
                <th style={{width:'8%'}}>رقم</th>
                <th style={{width:'20%'}}>العميل</th>
                <th style={{width:'11%'}}>التليفون</th>
                <th style={{width:'9%'}}>المطلوب</th>
                <th style={{width:'9%'}}>الجدية</th>
                <th style={{width:'11%'}}>{s.id==='deliv'?'موعد التسليم':'الموعد'}</th>
                <th style={{width:'28%'}}>نتيجة التنفيذ</th>
              </tr></thead>
              <tbody>
                {b[s.id].map(({l,f,c})=>(
                  <tr key={l.id}>
                    <td><span className="cbx"/></td>
                    <td className="num">{l.projectNo?'م'+l.projectNo:l.sketchNo}</td>
                    <td><b>{c.name}</b>{l.desc?<><br/><span style={{fontSize:'8pt',color:'#555'}}>{l.desc}</span></>:null}</td>
                    <td className="num" style={{fontSize:'8.5pt'}}>{phoneOut(c.phone)}</td>
                    <td>{dsp(l.required)||'—'}</td>
                    <td>{gradeOf(l.grade).l}</td>
                    <td className="num" style={{fontSize:'8.5pt'}}>
                      {s.id==='deliv'?fmt(l.deliverDate):fmt(l.nextDate)}
                      {s.id!=='deliv'&&f.k==='late'?<><br/><span style={{fontSize:'8pt'}}>متأخر {f.days} يوم</span></>:null}
                    </td>
                    <td><span className="pline"/></td>
                  </tr>))}
              </tbody>
            </table>
          </div>))}

        <div className="pfoot">
          <div>توقيع المهندس<div className="sig"/></div>
          <div>توقيع مدير الاستوديو<div className="sig"/></div>
          <div>تاريخ التسليم<div className="sig"/></div>
        </div>
        <div className="pnote">
          INFO@NITAQ.AE · +971 56 816 6402 · SHARJAH–UAE · نصنع الحيّز ليبقى الأثر
        </div>
      </section>))}
  </div>;
}

/* ============ طباعة سجل العملاء ============ */
/* نص كل خانة عند الطباعة — نفس أعمدة الشاشة بدون محرّرات */
function printCell(id,{l,f,s,c},db){
  switch(id){
    case 'name':   return c.name+(c.vip?' (VIP)':'');
    case 'phone':  return phoneOut(c.phone);
    case 'group':  return isGroup(l.waGroup)?'✓':'—';
    case 'proj':   return l.projectNo||'اسكتش';
    case 'sk':     return String(l.sketchNo||'');
    case 'grade':  return gradeOf(l.grade).l+(l.grade==='dead'&&l.lossReason?' — '+l.lossReason:'');
    case 'req':    return l.required||'—';
    case 'work':   return l.workst||'—';
    case 'follow': return f.l;
    case 'last':   return fmt(l.lastDate);
    case 'next':   return fmt(l.nextDate);
    case 'stale':  return gradeOf(l.grade).live?s.days+' يوم':'—';
    case 'type':   return l.subType||'—';
    case 'main':   return l.mainType||'—';
    case 'desc':   return l.desc||'—';
    case 'owner':  return uName(db,l.ownerId)||'—';
    case 'eng':    return uName(db,l.engineerId)||'—';
    case 'emirate':return l.emirate||'—';
    case 'area':   return l.area||'—';
    case 'source': return c.source||'—';
    case 'refBy':  return c.refBy||'—';
    case 'deliver':return fmt(l.deliverDate);
    case 'notes':  return l.notes||'';
    default: return '';
  }
}

function PrintRecDialog({payload,close,run}){
  const [orient,setOrient]=useState('landscape');
  const [cbx,setCbx]=useState(true);
  const [sig,setSig]=useState(true);
  const cols=COLS.filter(x=>payload.colIds.includes(x.id)&&x.id!=='act');
  return <div className="mo" onClick={e=>e.target===e.currentTarget&&close()}>
    <div className="box">
      <h3>طباعة سجل العملاء — A4</h3>
      <div className="bd">
        <div className="card" style={{background:'#FAF7F1',marginBottom:14}}><div style={{padding:'11px 13px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:5}}>
            هيتطبع <span className="num">{payload.rows.length}</span> سجل × <span className="num">{cols.length}</span> عمود
          </div>
          <div className="hint">{payload.label||'من غير فلاتر — كل السجلات المتاحة لك'}</div>
          <div className="hint" style={{marginTop:6}}>الأعمدة: {cols.map(c=>c.l).join(' · ')}</div>
        </div></div>
        <Field label="اتجاه الورق" hint={cols.length>7&&orient==='portrait'?'⚠ الأعمدة كتير على العمودي — الأفقي أوضح':''}>
          <select className="in" value={orient} onChange={e=>setOrient(e.target.value)}>
            <option value="landscape">أفقي — مناسب للأعمدة الكتير</option>
            <option value="portrait">عمودي</option>
          </select>
        </Field>
        {[['عمود تعليم ☐ في أول الجدول',cbx,setCbx],['خانة توقيع في آخر الصفحة',sig,setSig]].map(([t,v,fn])=>(
          <label key={t} style={{display:'flex',gap:9,alignItems:'center',padding:'6px 8px',borderRadius:7,
            cursor:'pointer',fontWeight:600,fontSize:13,color:'var(--ink)',margin:0}}>
            <input type="checkbox" checked={v} onChange={e=>fn(e.target.checked)}/>{t}</label>))}
        <div className="hint" style={{marginTop:10}}>
          بيتطبع اللي ظاهر قدامك بالظبط — نفس الفلتر ونفس الترتيب ونفس الأعمدة.
          غيّرهم من الشاشة الأول لو عايز نتيجة مختلفة.
        </div>
      </div>
      <div className="ft">
        <button className="btn gold" disabled={!payload.rows.length}
          style={!payload.rows.length?{opacity:.45,cursor:'not-allowed'}:{}}
          onClick={()=>run({orient,cbx,sig})}>
          {payload.rows.length?'طباعة':'مفيش سجلات للطباعة'}</button>
        <button className="btn ghost" onClick={close}>إلغاء</button>
      </div>
    </div>
  </div>;
}

function PrintRecords({db,cfg}){
  if(!cfg||cfg.kind!=='records') return null;
  const cols=COLS.filter(x=>cfg.colIds.includes(x.id)&&x.id!=='act');
  const T=todayISO();
  return <div className="printsheet">
    <style>{'@page{size:A4 '+cfg.orient+';margin:9mm 8mm}'}</style>
    <section className="psheet">
      <div className="ph">
        <img src={NITAQ_LOGO} alt="نطاق" className="plogo"/>
        <div>
          <h1>سجل العملاء</h1>
          <div className="sb">نطاق للاستشارات الهندسية · NITAQ ENGINEERING CONSULTANTS</div>
        </div>
        <div className="who">
          <span className="num">{fmt(T)}</span><br/>
          <span style={{fontSize:'8.5pt'}}>طبعها: {cfg.by}</span>
        </div>
      </div>
      <div className="pmeta">
        <span>عدد السجلات: <b>{cfg.rows.length}</b></span>
        {cfg.label&&<span>{cfg.label}</span>}
      </div>

      <table className="rtab">
        <thead><tr>
          {cfg.cbx&&<th style={{width:'3%'}}>☐</th>}
          {cols.map(c=><th key={c.id}>{c.l}</th>)}
        </tr></thead>
        <tbody>
          {cfg.rows.map(r=>(
            <tr key={r.l.id} className={r.dl.k==='late'?'lt':r.dl.k==='today'?'td2':''}>
              {cfg.cbx&&<td><span className="cbx"/></td>}
              {cols.map(c=>{
                const wrapCol=['notes','desc','name','area','refBy','main','type','group'].includes(c.id);
                const smallCol=c.id==='notes'||c.id==='desc';
                return <td key={c.id}
                  className={(smallCol?'rsmall ':'')+(wrapCol?'wrap':'')+(c.id==='phone'?' num':'')}>
                  {printCell(c.id,r,db)}</td>;})}
            </tr>))}
        </tbody>
      </table>

      {cfg.sig&&<div className="pfoot">
        <div>توقيع المسؤول<div className="sig"/></div>
        <div>توقيع مدير الاستوديو<div className="sig"/></div>
        <div>التاريخ<div className="sig"/></div>
      </div>}
      <div className="pnote">
        INFO@NITAQ.AE · +971 56 816 6402 · SHARJAH–UAE · نصنع الحيّز ليبقى الأثر
      </div>
    </section>
  </div>;
}

/* ============ عرض التغييرات ============ */
function ChgRow({db,e,revert,showEnt}){
  const when=new Date(e.at);
  const d=new Date(when.getTime()-when.getTimezoneOffset()*6e4).toISOString();
  const isNew=e.f==='__new', isDel=e.f==='__del';
  return <div className="chg">
    <div className="cf">{isNew?'سجل جديد':isDel?'اتحذف':(FLD[e.f]||e.f)}</div>
    <div className="cv">
      {showEnt&&<div style={{fontWeight:700,marginBottom:3}}>{entLabel(db,e.t,e.rid)}</div>}
      {!isNew&&!isDel&&<>
        <span className="old">{fldVal(db,e.f,e.from)}</span>
        {' ← '}
        <span className="new">{fldVal(db,e.f,e.to)}</span>
      </>}
    </div>
    <div className="cm">
      <span className="num">{d.slice(0,10).split('-').reverse().join('/')}</span>
      {' '}<span className="num">{d.slice(11,16)}</span> · {uName(db,e.byId)||'—'}
    </div>
    {!isNew&&!isDel&&<button className="btn xs ghost" onClick={()=>revert(e)}
      title="رجّع القيمة القديمة">↶ استرجاع</button>}
  </div>;
}

/* تبويب التعديلات جوّه ملف السجل */
function RecChanges({db,lead,clientId,revert}){
  const rows=(db.audit||[]).filter(e=>
      (e.t==='lead'&&e.rid===lead.id)||(e.t==='client'&&e.rid===clientId))
    .slice().reverse();
  if(!rows.length) return <div className="hint">لسه مفيش تعديلات متسجّلة على السجل ده.</div>;
  return <>
    <div className="hint" style={{marginBottom:12}}>
      كل خانة اتغيّرت على السجل ده أو على بيانات العميل. اضغط «استرجاع» لأي قيمة ترجّعها.
    </div>
    {rows.map(e=><ChgRow key={e.aid} db={db} e={e} revert={revert}/>)}
  </>;
}

function ServerAudit({sb,users}){
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false);
  const load=async(after=null)=>{setBusy(true);try{let q=sb.from('nitaq_crm_audit_v2').select('id,at,actor,operation,entity,record_id,before_data,after_data').order('id',{ascending:false}).limit(100);if(after!==null)q=q.lt('id',after);const r=await q;if(r.error)throw r.error;setRows(r.data||[]);setCursor(after);setError('');}catch(e){setError('تعذرت قراءة سجل الخادم: '+e.message);}finally{setBusy(false);}};
  useEffect(()=>{void load();},[sb]);
  return <div className="wrap"><h3>سجل الخادم الموثق</h3><p className="hint">الهوية والتوقيت من الخادم، ولا يمكن تعديل هذه السجلات أو حذفها من الواجهة. السجلات قبل تحديث الحماية متاحة في سجل العمليات أسفل الصفحة.</p>{error&&<p role="alert">{error}</p>}<button className="btn" disabled={busy} onClick={()=>load()}>الأحدث</button><table><thead><tr><th>الوقت · دبي</th><th>المستخدم</th><th>العملية</th><th>السجل</th><th>قبل وبعد</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.at).toLocaleString('ar-AE',{timeZone:'Asia/Dubai'})}</td><td>{users.find(u=>u.authId===r.actor)?.name||r.actor}</td><td>{r.operation}</td><td>{r.entity} · {r.record_id}</td><td><details><summary>عرض</summary><pre style={{whiteSpace:'pre-wrap',maxWidth:600}}>{JSON.stringify({before:r.before_data,after:r.after_data},null,2)}</pre></details></td></tr>)}</tbody></table><button className="btn" disabled={busy||rows.length<100} onClick={()=>load(rows.at(-1).id)}>الأقدم</button></div>;
}
/* ============ شاشة سجل التغييرات العامة ============ */
function Audit({db,me,revert,open}){
  const [q,setQ]=useState(''),[fu,setFu]=useState(''),[ff,setFf]=useState(''),[fd,setFd]=useState('');
  const seeAll=me.role==='owner'||can(me,'seeAll');
  /* اللي معاهوش «seeAll» يشوف تعديلاته هو + أي تعديل حصل على سجلاته هو
     (حتى لو حد تاني — زي المالك — هو اللي عدّله)، مش بس اللي هو نفسه عمله */
  const myLeadIds=useMemo(()=>new Set(db.leads.filter(l=>isMine(me,l)).map(l=>l.id)),[db.leads,me]);
  const myClientIds=useMemo(()=>new Set(db.leads.filter(l=>isMine(me,l)).map(l=>l.clientId)),[db.leads,me]);
  const all=(db.audit||[]).slice(-AUDIT_MAX).reverse();
  const rows=all.filter(e=>{
    if(!seeAll){
      const mine=e.byId===me.id||(e.t==='lead'&&myLeadIds.has(e.rid))||(e.t==='client'&&myClientIds.has(e.rid));
      if(!mine) return false;
    }
    if(fu&&e.byId!==fu) return false;
    if(ff&&e.f!==ff) return false;
    if(fd&&String(e.at).slice(0,10)!==fd) return false;
    if(q){const t=(entLabel(db,e.t,e.rid)+' '+(FLD[e.f]||'')+' '+fldVal(db,e.f,e.from)+' '+fldVal(db,e.f,e.to)).toLowerCase();
      if(!t.includes(q.toLowerCase())) return false}
    return true;
  }).slice(0,400);
  const fields=[...new Set(all.map(e=>e.f))].filter(f=>FLD[f]);

  return <div className="wrap">
    <div className="hint" style={{marginBottom:12}}>
      سجل العمليات الظاهر للتتبع اليومي؛ سجل الخادم أعلاه هو المرجع الموثق للتعديلات الجديدة. <b>Ctrl+Z</b> بيرجّع آخر خطوة،
      و«استرجاع» بيرجّع أي قيمة قديمة في أي وقت — حتى بعد ما تقفل البرنامج وتفتحه.
    </div>
    <div className="filt">
      <input className="in" style={{minWidth:190,flex:'1 1 190px'}} placeholder="بحث بالاسم أو القيمة…" value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="in" value={ff} onChange={e=>setFf(e.target.value)}>
        <option value="">كل الخانات</option>{fields.map(f=><option key={f} value={f}>{FLD[f]}</option>)}</select>
      {seeAll&&<select className="in" value={fu} onChange={e=>setFu(e.target.value)}>
        <option value="">كل المستخدمين</option>{uOpts(db).map(o=><option key={o.id} value={o.id}>{o.l}</option>)}</select>}
      <input type="date" className="in num" value={fd} onChange={e=>setFd(e.target.value)}/>
      {(q||ff||fu||fd)&&<button className="btn sm ghost" onClick={()=>{setQ('');setFf('');setFu('');setFd('')}}>مسح</button>}
      <span className="grow"/><span className="hint">{rows.length} تعديل</span>
    </div>
    <div className="card"><div style={{padding:16}}>
      {rows.length===0
        ? <div className="empty"><div className="big">⟲</div><b style={{fontSize:15}}>مفيش تعديلات مطابقة</b></div>
        : rows.map(e=><ChgRow key={e.aid} db={db} e={e} revert={revert} showEnt/>)}
    </div></div>
  </div>;
}

/* ============ طباعة شاشة العملاء ============ */
function PrintCliDialog({payload,close,run}){
  const [orient,setOrient]=useState('portrait');
  const [cbx,setCbx]=useState(false);
  const [sig,setSig]=useState(false);
  const [recs,setRecs]=useState(true);
  const tot=payload.rows.reduce((t,r)=>t+r.ls.length,0);
  return <div className="mo" onClick={e=>e.target===e.currentTarget&&close()}>
    <div className="box">
      <h3>طباعة العملاء — A4</h3>
      <div className="bd">
        <div className="card" style={{background:'#FAF7F1',marginBottom:14}}><div style={{padding:'11px 13px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:5}}>
            <span className="num">{payload.rows.length}</span> عميل · <span className="num">{tot}</span> سجل
          </div>
          <div className="hint">{payload.label||'كل العملاء المتاحين لك'}</div>
        </div></div>
        <Field label="اتجاه الورق">
          <select className="in" value={orient} onChange={e=>setOrient(e.target.value)}>
            <option value="portrait">عمودي</option>
            <option value="landscape">أفقي</option>
          </select>
        </Field>
        {[['اعرض اسكتشات كل عميل وجديتها',recs,setRecs],
          ['عمود تعليم ☐',cbx,setCbx],
          ['خانة توقيع',sig,setSig]].map(([t,v,fn])=>(
          <label key={t} style={{display:'flex',gap:9,alignItems:'center',padding:'6px 8px',borderRadius:7,
            cursor:'pointer',fontWeight:600,fontSize:13,color:'var(--ink)',margin:0}}>
            <input type="checkbox" checked={v} onChange={e=>fn(e.target.checked)}/>{t}</label>))}
        <div className="hint" style={{marginTop:10}}>
          بيتطبع اللي ظاهر قدامك — نفس البحث ونفس الترتيب (الأكثر سجلات الأول).
        </div>
      </div>
      <div className="ft">
        <button className="btn gold" disabled={!payload.rows.length}
          style={!payload.rows.length?{opacity:.45,cursor:'not-allowed'}:{}}
          onClick={()=>run({orient,cbx,sig,recs})}>
          {payload.rows.length?'طباعة':'مفيش عملاء للطباعة'}</button>
        <button className="btn ghost" onClick={close}>إلغاء</button>
      </div>
    </div>
  </div>;
}

function PrintClients({db,cfg}){
  if(!cfg||cfg.kind!=='clients') return null;
  const T=todayISO();
  const tot=cfg.rows.reduce((t,r)=>t+r.ls.length,0);
  return <div className="printsheet">
    <style>{'@page{size:A4 '+cfg.orient+';margin:9mm 8mm}'}</style>
    <section className="psheet">
      <div className="ph">
        <img src={NITAQ_LOGO} alt="نطاق" className="plogo"/>
        <div>
          <h1>سجل العملاء</h1>
          <div className="sb">نطاق للاستشارات الهندسية · NITAQ ENGINEERING CONSULTANTS</div>
        </div>
        <div className="who">
          <span className="num">{fmt(T)}</span><br/>
          <span style={{fontSize:'8.5pt'}}>طبعها: {cfg.by}</span>
        </div>
      </div>
      <div className="pmeta">
        <span>عدد العملاء: <b>{cfg.rows.length}</b></span>
        <span>إجمالي السجلات: <b>{tot}</b></span>
        {cfg.label&&<span>{cfg.label}</span>}
      </div>

      <table className="rtab">
        <thead><tr>
          {cfg.cbx&&<th style={{width:'3%'}}>☐</th>}
          <th style={{width:'4%'}}>م</th>
          <th style={{width:'20%'}}>العميل</th>
          <th style={{width:'12%'}}>التليفون</th>
          <th style={{width:'11%'}}>المنطقة</th>
          <th style={{width:'10%'}}>المصدر</th>
          <th style={{width:'12%'}}>من طرف</th>
          <th style={{width:'5%'}}>جروب</th>
          <th style={{width:'5%'}}>سجلاته</th>
          {cfg.recs&&<th>الاسكتشات والمشاريع</th>}
        </tr></thead>
        <tbody>
          {cfg.rows.map(({c,ls},i)=>(
            <tr key={c.id}>
              {cfg.cbx&&<td><span className="cbx"/></td>}
              <td className="num">{i+1}</td>
              <td className="wrap"><b>{c.name}</b>{c.vip?' (VIP)':''}</td>
              <td className="num">{phoneOut(c.phone)}</td>
              <td className="wrap">{(()=>{const s=[...new Set(ls.map(l=>l.area||l.emirate).filter(Boolean))];
                return s.length?s.join(' · '):'—'})()}</td>
              <td>{dsp(c.source)||'—'}</td>
              <td className="wrap">{c.refBy||'—'}</td>
              <td style={{textAlign:'center'}}>{(()=>{const n=ls.filter(l=>isGroup(l.waGroup)).length;
                return ls.length?(n===ls.length?'✓':n+'/'+ls.length):'—'})()}</td>
              <td className="num" style={{textAlign:'center'}}>{ls.length}</td>
              {cfg.recs&&<td className="rsmall wrap">
                {ls.length
                  ? ls.map(l=>(l.projectNo?'مشروع '+l.projectNo:'اسكتش '+l.sketchNo)
                      +' — '+gradeOf(l.grade).l+(l.subType?' · '+l.subType:'')).join('   |   ')
                  : '—'}
              </td>}
            </tr>))}
        </tbody>
      </table>

      {cfg.sig&&<div className="pfoot">
        <div>توقيع المسؤول<div className="sig"/></div>
        <div>توقيع مدير الاستوديو<div className="sig"/></div>
        <div>التاريخ<div className="sig"/></div>
      </div>}
      <div className="pnote">
        INFO@NITAQ.AE · +971 56 816 6402 · SHARJAH–UAE · نصنع الحيّز ليبقى الأثر
      </div>
    </section>
  </div>;
}

/* ============ تشغيل التطبيق — آخر حاجة بعد ما كل المكوّنات تتعرّف ============ */
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
