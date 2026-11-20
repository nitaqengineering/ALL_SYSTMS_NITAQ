const SLICE_AR={core:'العملاء والسجلات',inter:'سجل التواصل',audit:'سجل التعديلات'};

/* ============ 3.ب الربط السحابي (Supabase) ============
   نفس فلسفة nitaq ERP: جدول عام nitaq_crm_records(id, entity, data jsonb)
   + جدول بروفايلات nitaq_crm_profiles(id, auth_user_id, name, email, role, perms, active).
   الحماية الحقيقية بتتنفّذ عن طريق RLS على مستوى قاعدة البيانات — راجع ملف
   nitaq_crm_supabase_schema.sql. */
const DEFAULT_SB_CONFIG={
  url:'https://hihjleshocaazanwyqdu.supabase.co',
  key:'sb_publishable_9kNiWtyb5EYMDedkn9ec-g_AR5vzqCN'
};
const SB_CFG_KEY='nitaq_crm_sb_cfg';
function loadSbConfig(){
  try{const r=localStorage.getItem(SB_CFG_KEY); if(r){const v=JSON.parse(r); if(v&&v.url&&v.key) return v;}}catch(e){}
  return {...DEFAULT_SB_CONFIG};
}
function saveSbConfig(cfg){ try{localStorage.setItem(SB_CFG_KEY, JSON.stringify(cfg))}catch(e){} }

let _sbClient=null, _sbClientKey='';
function getSb(cfg){
  if(!window.supabase||!cfg||!cfg.url||!cfg.key) return null;
  const k=cfg.url+'|'+cfg.key;
  if(!_sbClient||_sbClientKey!==k){
    _sbClient=window.supabase.createClient(cfg.url, cfg.key, {auth:{persistSession:true,autoRefreshToken:true}});
    _sbClientKey=k;
  }
  return _sbClient;
}

/* entity ↔ مفتاح db */
const ENT2KEY={client:'clients',lead:'leads',inter:'inter',audit:'audit',task:'tasks'};
const KEY2ENT={clients:'client',leads:'lead',inter:'inter',audit:'audit',tasks:'task'};

/* تجميع صفوف السحابة (records + profiles) في كائن db متوافق مع باقي الشاشات */
function cloudRowsToDb(rows, profiles){
  const out={clients:[],leads:[],inter:[],audit:[],tasks:[],users:[],
    lookups:JSON.parse(JSON.stringify(DEFAULT_LOOKUPS)),projSeq:0,ui:{},v:4};
  (rows||[]).forEach(r=>{
    if(r.entity==='settings'){
      if(r.data&&r.data.lookups) out.lookups=r.data.lookups;
      if(r.data&&r.data.projSeq!=null) out.projSeq=r.data.projSeq;
      // Tasks are migrated to independent rows by the CRM safety migration.
      return;
    }
    const k=ENT2KEY[r.entity];
    if(k&&r.data) out[k].push(r.data);
  });
  out.users=(profiles||[]).map(p=>({id:p.id,name:p.name,email:p.email||'',authId:p.auth_user_id||'',
    role:p.role||'engineer',perms:p.perms||{...BASE_PERMS},active:p.active!==false}));
  return migrate(out);
}

async function crmApplyBatch(sb, changes, operation, insertOnly=false, expectedActor=null){
  if(expectedActor){const identity=await sb.auth.getUser();if(identity.error||identity.data?.user?.id!==expectedActor)throw Error('تغير حساب الاتصال؛ احتفظ بتعديلاتك وادخل بالحساب الأصلي');}
  const {data,error}=await sb.rpc('nitaq_crm_apply_v2',{p_operation:operation,p_changes:changes.map(({entity,id,before,after})=>({entity,id,before,after})),p_insert_only:insertOnly});
  if(error){const failure=Error(error.code==='PGRST202'?'قاعدة CRM تحتاج تحديث الحفظ الآمن قبل التعديل':error.message||'تعذر الحفظ المشترك');failure.definitive=/^(22|23)/.test(error.code||'')||['40001','42501','P0001'].includes(error.code);throw failure;}
  if(!data||!['saved','already_saved'].includes(data.result))throw Error('لم يتأكد الحفظ؛ أعد المحاولة بنفس الطلب');
  return data;
}

/* دعوة موظف بإيميله — يترشّح ليتربط تلقائياً بأول تسجيل دخول بنفس الإيميل */
async function cloudInviteProfile(sb, name, email){
  try{
    const id=uid();
    const {error}=await sb.from('nitaq_crm_profiles')
      .insert({id, name, email:String(email||'').trim().toLowerCase(), role:'engineer', active:true});
    if(error){console.error('cloudInviteProfile',error); return {ok:false,error}}
    return {ok:true,id};
  }catch(e){console.error(e); return {ok:false,error:e}}
}

/* رفع كل البيانات المحلية للسحابة دفعة واحدة — أول مرة بعد الربط */
async function pushAllToCloud(sb, db, onProgress){
  try{
    const rows=[];
    for(const [key,entity] of [['clients','client'],['leads','lead'],['inter','inter']])for(const row of db[key]||[])rows.push({entity,id:row.id,before:null,after:row});
    for(let i=0;i<rows.length;i+=100){await crmApplyBatch(sb,rows.slice(i,i+100),crypto.randomUUID(),true);onProgress?.(Math.min(i+100,rows.length),rows.length);}
    return {ok:true,count:rows.length};
  }catch(error){return {ok:false,error};}
}

/* بيضيف أي مستخدم قديم مش موجود أصلاً في nitaq_crm_profiles — ومبيلمسش
   أي بروفايل موجود بالفعل (خصوصاً لو مربوط بحساب دخول حقيقي) */
/* دمج بروفايل قديم (من غير حساب دخول) بحساب دخول حقيقي بالفعل —
   البروفايل القديم بياخد auth_user_id بتاع الحساب الحقيقي، والبروفايل
   المكرر الجديد (اللي اتعمل تلقائياً وقت التسجيل) بيتشال. */
async function mergeLegacyProfile(sb, legacyId, realProfile){
  const {error}=await sb.rpc('nitaq_crm_merge_profile_v2',{p_legacy:legacyId,p_real:realProfile.id});
  return {ok:!error,error};
}

/* ============ 4. بيانات الشيت ============ */
/* [اسكتش, مشروع, تاريخ, اسم, تليفون, إمارة, منطقة, مصدر, من طرف, مسؤول, مهندس, وصف, رئيسي, فرعي, جدية, مطلوب, حالة, موعد قادم, آخر تواصل, ملاحظات, VIP] */
const RAW=[]; // Customer data is loaded from authenticated Supabase; no customer records are shipped.

function seed(){
  const users=[
    {id:'u1',name:'سيد', role:'owner',   pin:'',perms:{},active:true},
    {id:'u2',name:'احمد',role:'engineer',pin:'',perms:{...BASE_PERMS},active:true},
    {id:'u3',name:'مروة',role:'engineer',pin:'',perms:{...BASE_PERMS},active:true},
    {id:'u4',name:'عمر', role:'engineer',pin:'',perms:{...BASE_PERMS},active:true}
  ];
  const uid4=n=>{const u=users.find(x=>x.name===n);return u?u.id:''};
  const clients=[],leads=[],inter=[],byPhone={};
  RAW.forEach(r=>{
    const[sk,pr,date,name,phone,em,area,src,ref,owner,eng,desc,mt,st,gr,req,ws,next,last,note,vip]=r;
    const np=normPhone(phone);
    let c=byPhone[np];
    if(!c){c={id:uid(),name,phone:np,phoneRaw:String(phone),source:src,refBy:ref,vip:!!vip,notes:'',
      createdAt:date,createdBy:uid4(owner),updatedAt:date,updatedBy:uid4(owner)};
      clients.push(c);byPhone[np]=c}
    const L={id:uid(),clientId:c.id,sketchNo:String(sk),projectNo:pr?String(pr):'',desc,mainType:mt,subType:st,
      grade:gr,required:req,workst:ws,lossReason:'',ownerId:uid4(owner),engineerId:uid4(eng),
      emirate:em||'',area:area||'',
      nextDate:next||'',lastDate:last||'',deliverDate:'',notes:note,waGroup:'',createdAt:date,snoozed:0,
      gradeLog:[{g:gr,date}]};
    leads.push(L);
    if(last) inter.push({id:uid(),leadId:L.id,date:last,channel:'اتصال',outcome:'تم الرد',note:'آخر تواصل مرحّل من الشيت',byId:uid4(owner)});
  });
  const seq=Math.max(104,...leads.map(l=>parseInt(String(l.projectNo||''),10)).filter(v=>!isNaN(v)));
  return {clients,leads,inter,users,tasks:[],projSeq:seq,lookups:JSON.parse(JSON.stringify(DEFAULT_LOOKUPS)),v:6};
}

/* ============ التراجع وسجل التغييرات ============
   الطبقة 1: مكدّس تراجع في الذاكرة — Ctrl+Z وزرار «تراجع»
   الطبقة 2: سجل تغييرات محفوظ — كل خانة اتغيّرت: قيمتها قبل وبعد ومين ومتى
   الطبقة 3: استرجاع أي قيمة قديمة في أي وقت من السجل */

const FLD={
 sketchNo:'رقم الاسكتش', projectNo:'رقم المشروع', desc:'الوصف', mainType:'النوع الرئيسي',
 subType:'النوع الفرعي', grade:'الجدية', required:'المطلوب', workst:'الحالة',
 lossReason:'سبب عدم الفاعلية', ownerId:'المسؤول', engineerId:'المهندس',
 nextDate:'الموعد المتوقع', lastDate:'آخر تواصل', deliverDate:'موعد التسليم', notes:'ملاحظات',
 snoozed:'مرات الترحيل',
 name:'الاسم', phone:'رقم التليفون', emirate:'الإمارة', area:'المنطقة', source:'مصدر العميل',
 refBy:'من طرف', waGroup:'جروب الواتساب', vip:'عميل VIP', role:'الدور', pin:'الرقم السري', active:'مفعّل'
};
const LEAD_F=['sketchNo','projectNo','desc','mainType','subType','grade','required','workst',
  'lossReason','ownerId','engineerId','nextDate','lastDate','deliverDate','notes','waGroup','emirate','area'];
const CLIENT_F=['name','phone','source','refBy','vip'];
const USER_F=['name','role','pin','active'];
/* المهمة: عنوان + تفاصيل + المهندس المسند له + موعد التسليم + الحالة (Done؟) + تواريخ */
const TASK_F=['title','desc','engineerId','deliverDate','workst','doneAt','createdAt','createdBy'];

/* صياغة القيمة للعرض البشري */
function fldVal(db,f,v){
  if(v===''||v===null||v===undefined) return '(فاضي)';
  if(f==='ownerId'||f==='engineerId') return uName(db,v)||'(محذوف)';
  if(f==='grade')  return gradeOf(v).l;
  if(f==='vip'||f==='active') return v?'نعم':'لا';
  if(f==='phone')  return phoneOut(v);
  if(f==='waGroup')return isGroup(v)?'رابط مربوط':'(فاضي)';
  if(f==='pin')    return v?'••••':'(بدون)';
  if(/Date$/.test(f)) return fmt(v);
  return String(v);
}
/* اسم السجل عشان السطر يبقى مفهوم لوحده */
function entLabel(db,t,id){
  if(t==='lead'){
    const l=lIdx(db).get(id); if(!l) return 'سجل محذوف';
    const c=cIdx(db).get(l.clientId)||{};
    return (c.name||'—')+' · '+(l.projectNo?'مشروع '+l.projectNo:'اسكتش '+l.sketchNo);
  }
  if(t==='client'){const c=cIdx(db).get(id);return c?c.name:'عميل محذوف'}
  if(t==='user'){const u=uIdx(db).get(id);return u?u.name:'مستخدم محذوف'}
  return '—';
}

/* مقارنة نسختين وإخراج التغييرات على مستوى الخانة */
function diffDb(a,b){
  const out=[];
  const scan=(t,fields,A,B)=>{
    const ma={}; (A||[]).forEach(x=>ma[x.id]=x);
    const mb={}; (B||[]).forEach(x=>mb[x.id]=x);
    (B||[]).forEach(x=>{
      const p=ma[x.id];
      if(!p){out.push({t,rid:x.id,f:'__new',from:'',to:''});return}
      fields.forEach(f=>{
        const u=p[f]===undefined?'':p[f], v=x[f]===undefined?'':x[f];
        if(String(u)!==String(v)) out.push({t,rid:x.id,f,from:u,to:v});
      });
    });
    (A||[]).forEach(x=>{if(!mb[x.id]) out.push({t,rid:x.id,f:'__del',from:JSON.stringify(x),to:''})});
  };
  scan('lead',LEAD_F,a.leads,b.leads);
  scan('client',CLIENT_F,a.clients,b.clients);
  scan('user',USER_F,a.users,b.users);
  scan('task',TASK_F,a.tasks,b.tasks);
  return out;
}

const AUDIT_MAX=1500;   /* أقصى عدد سطور محفوظة */
const UNDO_MAX=5;      /* أقصى عدد خطوات تراجع في الجلسة */

/* ============ عناصر مشتركة ============ */
const Tag=({c,children})=>React.createElement('span',{className:'tag '+c},children);
const Kpi=({v,l,k,onClick,sub})=>(
  <div className={'kpi '+(k||'')+(onClick?' click':'')} onClick={onClick}>
    <div className="v">{v}</div><div className="l">{l}</div>
    {sub&&<div className="l" style={{fontSize:10,opacity:.75}}>{sub}</div>}
  </div>);
const Field=({label,req,hint,children})=>(
  <div className="f"><label className={req?'req':''}>{label}</label>{children}
    {hint&&<div className="hint" style={{marginTop:4}}>{hint}</div>}</div>);
const Sel=({v,on,opts,ph='—',disabled})=>(
  <select className="in" value={v||''} disabled={disabled} onChange={e=>on(e.target.value)}>
    <option value="">{ph}</option>
    {opts.map(o=>typeof o==='string'
      ?<option key={o} value={o}>{dsp(o)}</option>
      :<option key={o.id} value={o.id}>{dsp(o.l)}</option>)}
  </select>);
const Bars=({rows})=>{
  const max=Math.max(1,...rows.map(r=>r[1]));
  return <div className="bars">{rows.map(([n,v])=>(
    <div className="b" key={n}>
      <div className="n">{dsp(n)}</div>
      <div className="tr"><div className="fl" style={{width:(v/max*100)+'%'}}/></div>
      <div className="v">{v}</div>
    </div>))}</div>;
};

/* لافتة ربط الجروبات — بتظهر في متابعة اليوم ولوحة التحكم لحد ما تخلص */
const GroupCta=({leads,go})=>{
  const n=leads.filter(l=>!isGroup(l.waGroup)).length;
  if(!n) return null;
  return <div className="cta cta-compact">
    <div className="tx">زرار «واتساب» بيفتح جروب الاسكتش — بس لازم تربط جروب كل اسكتش مرة واحدة.
      لسه <b>{n}</b> اسكتش من <b>{leads.length}</b> مش مربوط.</div>
    <button className="btn gold" onClick={()=>go('groups')}>اربط الجروبات دلوقتي</button>
  </div>;
};

/* ============ لوحة التحكم ============ */
function Dashboard({db,go,me,all}){
  const leads=db.leads;
  /* حساب واحد لكل سجل (المتابعة · الركود · العميل) يتعاد استخدامه في كل الأقسام */
  const M=useMemo(()=>{
    const ci=cIdx(db), used=new Set();
    const fuA=[], igA=[], cA=[];
    for(const l of leads){ fuA.push(followUp(l)); igA.push(inGrade(l));
      const c=ci.get(l.clientId)||{}; cA.push(c); if(c.id)used.add(c.id); }
    return {fuA,igA,cA,clients:db.clients.filter(c=>used.has(c.id))};
  },[leads,db.clients]);
  const clients=M.clients;
  const fu=M.fuA;
  const g=id=>leads.filter(l=>l.grade===id).length;
  const late=fu.filter(f=>f.k==='late').length, tod=fu.filter(f=>f.k==='today').length;
  const noDate=leads.filter((l,i)=>fu[i].k==='none').length;
  const stale=leads.reduce((n,l,i)=>n+((gradeOf(l.grade).live&&M.igA[i].stale)?1:0),0);
  const uidset=new Set(((all||db).users||[]).map(u=>u.id));
  const orphan=leads.filter(l=>(l.ownerId&&!uidset.has(l.ownerId))||(l.engineerId&&!uidset.has(l.engineerId))).length;
  const proj=g('proj'), dead=g('dead'), closed=proj+dead;
  /* تمريرة واحدة على كل السجلات تبني إحصاءات كل المهندسين */
  const ENG=useMemo(()=>{
    const m=new Map();
    if(!all) return m;
    const get=id=>{let v=m.get(id);if(!v){v={liv:0,lt:0,td:0,st:0,pr:0,dd:0};m.set(id,v)}return v};
    for(const l of all.leads){
      const f=followUp(l), g=inGrade(l), live=gradeOf(l.grade).live;
      const ids=l.ownerId===l.engineerId?[l.ownerId]:[l.ownerId,l.engineerId];
      for(const id of ids){ if(!id)continue; const v=get(id);
        if(live){v.liv++; if(f.k==='late')v.lt++; if(f.k==='today')v.td++; if(g.stale)v.st++;}
        if(l.grade==='proj')v.pr++; if(l.grade==='dead')v.dd++; }
    }
    return m;
  },[all&&all.leads]);

  const projNums=new Set(leads.filter(l=>String(l.projectNo||'').trim()).map(l=>String(l.projectNo).trim())).size;
  const rate=closed?Math.round(proj/closed*100):0;
  const mx=Math.max(1,...GRADES.map(x=>g(x.id)));
  /* بدون clients.find جوه الحلقة — العميل متحسب مسبقاً لكل سجل */
  const group=f=>{const m={};leads.forEach((l,i)=>{
      const k=f(l,M.cA[i])||'غير محدد';m[k]=(m[k]||0)+1});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,7)};

  return <div className="wrap">
    <div className="kpis" style={{marginBottom:16}}>
      <Kpi v={leads.length} l="إجمالي السجلات" sub={clients.length+' عميل'} onClick={()=>go('records')}/>
      <Kpi v={projNums||proj} l="مشاريع موقّعة" k="g"
        sub={projNums&&projNums!==proj?proj+' سجل':''}/>
      <Kpi v={leads.filter(l=>gradeOf(l.grade).live).length} l="اسكتشات نشطة" k="b"/>
      <Kpi v={g('vimp')} l="هام جدا — على التوقيع" k="r"/>
      <Kpi v={late} l="متأخر التواصل" k="r" onClick={()=>go('today')}/>
      <Kpi v={tod} l="تواصل اليوم" k="a" onClick={()=>go('today')}/>
    </div>

    {(noDate>0||stale>0||orphan>0)&&<div className="warn" style={{marginBottom:16}}>
      {noDate>0&&<div>◆ <b>{noDate}</b> سجل نشط <b>بدون موعد تواصل</b> — المتابعة الآلية معطّلة عليه تماماً.</div>}
      {stale>0&&<div>◆ <b>{stale}</b> سجل راكد فوق الحد المسموح لدرجته — محتاج قرار.</div>}
      {orphan>0&&<div>◆ <b>{orphan}</b> سجل مسؤوله أو مهندسه مش موجود في المستخدمين — مش ظاهر لأي مهندس.</div>}
    </div>}
    <GroupCta leads={leads} go={go}/>

    <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))'}}>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>سلّم الجدية — من أول اتصال للتوقيع</h3></div>
        <div className="funnel">
          {GRADES.map(x=>(
            <div className={'fr '+(x.id==='proj'?'win':x.id==='dead'?'lost':'')} key={x.id} title={x.d}>
              <div className="nm">{x.l}</div>
              <div className="bar"><div className="fill" style={{width:(g(x.id)/mx*100)+'%'}}/></div>
              <div className="c">{g(x.id)}</div></div>))}
          <div className="conv">
            <div className="big">{rate}%</div>
            <div className="tx">نسبة التحويل لمشروع موقّع<br/>
              على <b>{closed}</b> سجل خرج من السلّم ({proj} موقّع / {dead} غير فعال)</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><span className="dot"/><h3>مصدر العميل</h3></div>
        <div style={{padding:16}}><Bars rows={group((l,c)=>c.source)}/></div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>من طرف — قناة الإحالة الحقيقية</h3></div>
        <div style={{padding:16}}><Bars rows={group((l,c)=>c.refBy||'بدون إحالة')}/></div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>المسؤول</h3></div>
        <div style={{padding:16}}><Bars rows={group(l=>uName(db,l.ownerId))}/></div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>المنطقة</h3></div>
        <div style={{padding:16}}><Bars rows={group((l,c)=>l.area||l.emirate)}/></div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>المطلوب حالياً</h3></div>
        <div style={{padding:16}}><Bars rows={REQUIRED.map(r=>[r,leads.filter(l=>l.required===r&&gradeOf(l.grade).live).length])}/></div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>حالة التصميم</h3></div>
        <div style={{padding:16}}><Bars rows={WORKST.map(w=>[w,leads.filter(l=>l.workst===w).length])}/></div></div>
    </div>

    {me.role==='owner'&&all&&<div className="card" style={{marginTop:14}}>
      <div className="card-h"><span className="dot"/><h3>أداء المهندسين — حِمل كل واحد ومتأخراته</h3></div>
      <div className="scroll"><table>
        <thead><tr><th>المهندس</th><th>نشط</th><th>متأخر</th><th>اليوم</th><th>راكد</th><th>موقّع</th><th>غير فعال</th><th>التحويل</th></tr></thead>
        <tbody>{(all.users||[]).filter(u=>u.active!==false).map(u=>{
          const v=ENG.get(u.id)||{liv:0,lt:0,td:0,st:0,pr:0,dd:0};
          const liv={length:v.liv}, lt=v.lt, td=v.td, st=v.st, pr=v.pr, dd=v.dd;
          const cl=pr+dd;
          return <tr key={u.id}>
            <td><b>{u.name}</b> {u.role==='owner'&&<Tag c="t-gold">مالك</Tag>}</td>
            <td className="num">{liv.length}</td>
            <td>{lt?<Tag c="t-red">{lt}</Tag>:<span className="hint">0</span>}</td>
            <td>{td?<Tag c="t-amber">{td}</Tag>:<span className="hint">0</span>}</td>
            <td>{st?<Tag c="t-amber">{st}</Tag>:<span className="hint">0</span>}</td>
            <td className="num">{pr}</td><td className="num">{dd}</td>
            <td>{cl?<Tag c={pr/cl>=.5?'t-green':pr/cl>0?'t-amber':'t-red'}>{Math.round(pr/cl*100)}%</Tag>:<span className="hint">لسه</span>}</td>
          </tr>})}</tbody>
      </table></div>
      <div className="hint" style={{padding:'10px 14px'}}>
        لو مهندس عنده متأخرات كتير مع حِمل عالي، المشكلة توزيع مش أداء. وزّع من عمود «المسؤول» في سجل العملاء.
      </div>
    </div>}
  </div>;
}

/* ============ شاشة المهام — مهام المهندسين المستقلة (المدير بيضيف/يعدّل) ============ */
function Tasks({db,me,addTask,patchTask,delTask,taskDone,taskReopen,toast}){
  const isOwner=me.role==='owner';
  const umap=useMemo(()=>uIdx(db),[db.users]);
  const engs=useMemo(()=>(db.users||[]).filter(u=>u.active!==false),[db.users]);
  const [tab,setTab]=useState('open');          /* open | done */
  const [form,setForm]=useState({title:'',engineerId:'',deliverDate:'',desc:''});
  const [edit,setEdit]=useState(null);          /* id بتاع المهمة اللي بتتعدّل */

  const all=db.tasks||[];
  const open=all.filter(t=>t.workst!=='Done');
  const doneL=all.filter(t=>t.workst==='Done');
  const sortOpen=[...open].sort((a,b)=>{
    const da=a.deliverDate?diffDays(todayISO(),a.deliverDate):-9999;
    const dbb=b.deliverDate?diffDays(todayISO(),b.deliverDate):-9999;
    return dbb-da;
  });
  const sortDone=[...doneL].sort((a,b)=>String(b.doneAt||'').localeCompare(String(a.doneAt||'')));
  const list=tab==='open'?sortOpen:sortDone;

  const submit=()=>{
    if(!form.title.trim()) return toast('اكتب عنوان المهمة');
    if(!form.engineerId)   return toast('اختر المهندس');
    addTask(form);
    setForm({title:'',engineerId:'',deliverDate:'',desc:''});
  };

  return <div className="wrap">
    {isOwner&&<div className="card" style={{padding:16,marginBottom:18}}>
      <div className="card-h"><span className="dot"/><h3>مهمة جديدة</h3></div>
      <div className="tform">
        <input className="in" style={{flex:'2 1 220px'}} placeholder="عنوان المهمة"
          value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <select className="in" style={{flex:'1 1 150px'}}
          value={form.engineerId} onChange={e=>setForm(f=>({...f,engineerId:e.target.value}))}>
          <option value="">المهندس…</option>
          {engs.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input className="in" type="date" style={{flex:'1 1 150px'}}
          value={form.deliverDate} onChange={e=>setForm(f=>({...f,deliverDate:e.target.value}))}/>
        <input className="in" style={{flex:'2 1 220px'}} placeholder="تفاصيل (اختياري)"
          value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))}/>
        <button className="btn gold" onClick={submit}>إضافة</button>
      </div>
    </div>}

    <div className="secbar" style={{cursor:'default'}}>
      <span className="dot"/>
      <h3 style={{cursor:'pointer',opacity:tab==='open'?1:.5}} onClick={()=>setTab('open')}>
        قيد التنفيذ <span className="num">({open.length})</span></h3>
      <span style={{width:14}}/>
      <h3 style={{cursor:'pointer',opacity:tab==='done'?1:.5}} onClick={()=>setTab('done')}>
        منجزة <span className="num">({doneL.length})</span></h3>
    </div>

    {list.length===0
      ? <div className="card empty"><div className="big">✦</div>
          <b style={{fontSize:15}}>{tab==='open'?'مفيش مهام قيد التنفيذ':'مفيش مهام منجزة'}</b></div>
      : <div className="fcards">
          {list.map(t=>{
            const st=taskState(t);
            const eng=(umap.get(t.engineerId)||{}).name||'—';
            const isEd=edit===t.id;
            if(isEd) return <div key={t.id} className="fc">
              <div className="tform" style={{flexDirection:'column',alignItems:'stretch'}}>
                <input className="in" value={t.title} onChange={e=>patchTask(t.id,{title:e.target.value})} placeholder="عنوان المهمة"/>
                <select className="in" value={t.engineerId||''} onChange={e=>patchTask(t.id,{engineerId:e.target.value})}>
                  <option value="">المهندس…</option>
                  {engs.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input className="in" type="date" value={t.deliverDate||''} onChange={e=>patchTask(t.id,{deliverDate:e.target.value})}/>
                <textarea className="in" value={t.desc||''} onChange={e=>patchTask(t.id,{desc:e.target.value})} placeholder="تفاصيل"/>
                <div className="acts">
                  <button className="btn sm gold" onClick={()=>setEdit(null)}>تم</button>
                  <button className="btn sm ghost" onClick={()=>{if(confirm('حذف المهمة نهائياً؟')){delTask(t.id);setEdit(null)}}}>حذف</button>
                </div>
              </div></div>;
            return <div key={t.id} className={'fc '+(st.k==='late'?'late':st.k==='today'?'today':'')}>
              <div className="chips">
                <Tag c={st.c}>{st.l}</Tag>
                <Tag c="t-gray">م/{eng}</Tag>
                {t.deliverDate&&<Tag c="t-gray">{fmt(t.deliverDate)}</Tag>}
              </div>
              <div className="nm">{t.title||'—'}</div>
              {t.desc&&<div className="note">{t.desc}</div>}
              {t.workst==='Done'&&t.doneAt&&<div className="meta">اتسلّمت في {fmt(t.doneAt)}</div>}
              <div className="acts">
                {t.workst!=='Done'
                  ? <button className="btn sm gold" onClick={()=>taskDone(t)}>تم التسليم</button>
                  : (isOwner&&<button className="btn sm ghost" onClick={()=>taskReopen(t)}>إعادة فتح</button>)}
                {isOwner&&t.workst!=='Done'&&<button className="btn sm ghost" onClick={()=>setEdit(t.id)}>تعديل</button>}
                {isOwner&&<button className="btn sm ghost" onClick={()=>{if(confirm('حذف المهمة نهائياً؟'))delTask(t.id)}}>حذف</button>}
              </div>
            </div>;
          })}
        </div>}
  </div>;
}

/* ============ يومي — مهام المهندس نفسه ============ */
/* كارت المهمة — مكوّن مستقل على مستوى الملف عشان React يعيد استخدامه
   بدل ما يفكّه ويركّبه من جديد مع كل رسمة */
function TaskCard({l,f,s,c,kind,me,uname,open,logCall,done,snooze}){
  const T=todayISO();
  const isD=kind==='deliv';
  const dd=isD?diffDays(T,l.deliverDate):0;
  const g=isGroup(l.waGroup)?l.waGroup:'';
  return <div className={'fc '+(isD?(dd>=0?'late':'today'):f.k)}>
    <div className="chips">
      {isD
        ? <Tag c={dd>0?'t-red':dd===0?'t-amber':'t-blue'}>
            تسليم {dd>0?'متأخر '+dd+' يوم':dd===0?'النهاردة':'بعد '+(-dd)+' يوم'}</Tag>
        : <Tag c={f.c}>{f.l}</Tag>}
      <Tag c={gradeOf(l.grade).c}>{gradeOf(l.grade).l}</Tag>
      <Tag c="t-gray">{dsp(l.required)||'—'}</Tag>
      {!isD&&s.stale&&<Tag c="t-amber">راكد {s.days} يوم</Tag>}
      {l.snoozed>=3&&<Tag c="t-red">اترحّل {l.snoozed} مرات</Tag>}
    </div>
    <div className="nm">{c.name}</div>
    <div className="meta">
      <span className="num">{recType(l)==='مشروع'?'مشروع '+l.projectNo:'اسكتش '+l.sketchNo}</span>
      {' · '}{l.subType||'—'}{l.engineerId&&l.engineerId!==me.id?' · م/'+uname:''}
    </div>
    {l.notes&&<div className="note">{l.notes}</div>}
    <div className="acts">
      <button className="btn sm gold" onClick={()=>done(l,isD)}>{isD?'تم التسليم':'تم'}</button>
      <select className="ed" style={{width:'auto',minWidth:96,border:'1px solid var(--line)',background:'#fff'}}
        value="" onChange={e=>{if(e.target.value){snooze(l,+e.target.value);e.target.value=''}}}>
        <option value="">ترحيل…</option>
        <option value="1">بكرة</option><option value="3">بعد ٣ أيام</option>
        <option value="7">أسبوع</option><option value="14">أسبوعين</option><option value="30">شهر</option>
      </select>
      <button className="btn sm ghost" onClick={()=>logCall(l)}>تواصل</button>
      <a className={'btn sm '+(g?'wa':'ghost')} target="_blank" rel="noopener"
         href={g||waLink(c.phone)}>واتساب</a>
      <button className="btn sm ghost" onClick={()=>open(l)}>ملف</button>
    </div>
  </div>;
}

const DSEC=[
 {id:'late', l:'متأخر',     kind:'late',  hint:'دي أول حاجة تتعمل النهاردة — كل يوم تأخير بيقلّل فرصة التوقيع.'},
 {id:'now',  l:'اليوم',     kind:'today', hint:'المواعيد المستحقة النهاردة بالظبط.'},
 {id:'deliv',l:'التسليمات', kind:'deliv', hint:'مواعيد تسليم مستحقة أو خلال أسبوع. «تم التسليم» بيقفل حالة التصميم على Done.'},
 {id:'foll', l:'المتابعة',  kind:'foll',  hint:'قادم خلال أسبوع، أو راكد، أو من غير موعد أصلاً.'}
];
const STEP=20;

function Daily({db,me,open,logCall,done,snooze,go,onPrint,taskDone}){
  /* الأقسام بتتحسب مرة واحدة وتتعاد لحد ما السجلات أو المستخدم يتغيّروا */
  const B=useMemo(()=>taskBuckets(db,l=>isMine(me,l)),[db.leads,db.clients,me]);
  const umap=useMemo(()=>uIdx(db),[db.users]);
  const noGrp=useMemo(()=>db.leads.reduce((n,l)=>n+(isGroup(l.waGroup)?0:1),0),[db.leads]);
  const total=B.late.length+B.now.length+B.deliv.length+B.foll.length;
  /* مهام المهندس نفسه — مسندة ليه ولسه مش منجزة، الأقرب/الأكثر تأخيراً الأول */
  const myTasks=useMemo(()=>(db.tasks||[])
    .filter(t=>t.workst!=='Done'&&(me.role==='owner'||t.engineerId===me.id))
    .sort((a,b)=>{
      const da=a.deliverDate?diffDays(todayISO(),a.deliverDate):-9999;
      const dbb=b.deliverDate?diffDays(todayISO(),b.deliverDate):-9999;
      return dbb-da;
    }),[db.tasks,me]);

  const [shut,setShut]=useState({});                 /* الأقسام المقفولة */
  const [lim,setLim]=useState({late:STEP,now:STEP,deliv:STEP,foll:STEP});

  return <div className="wrap">
    <div className="ptools">
      <button className="btn ghost sm" onClick={onPrint}>🖨 طباعة مهام اليوم — A4</button>
      <span className="hint">ورقة لكل مهندس، فيها مربعات تعليم وخانة توقيع.</span>
    </div>
    <div className="kpis" style={{marginBottom:18}}>
      <Kpi v={B.late.length}  l="متأخر"     k="r"/>
      <Kpi v={B.now.length}   l="اليوم"     k="a"/>
      <Kpi v={B.deliv.length} l="التسليمات" k="b"/>
      <Kpi v={B.foll.length}  l="المتابعة"  k="g"/>
    </div>

    {noGrp>0&&can(me,'groups')&&<details className="cta cta-compact"><summary>{noGrp} سجل يحتاج ربط جروب واتساب</summary>
      <div className="tx"><b>{noGrp}</b> اسكتش من <b>{db.leads.length}</b> لسه مش مربوط بجروب الواتساب بتاعه.
        اربطهم مرة واحدة، وبعدها زرار «واتساب» هيفتح الجروب على طول.</div>
      <button className="btn gold" onClick={()=>go('groups')}>افتح شاشة ربط الجروبات</button>
    </details>}

    {myTasks.length>0&&<div style={{marginBottom:22}}>
      <div className="secbar" style={{cursor:'default'}}>
        <span className="dot"/>
        <h3>{me.role==='owner'?'المهام':'مهامي'} <span className="num">({myTasks.length})</span></h3>
      </div>
      <div className="hint" style={{marginBottom:10}}>
        {me.role==='owner'?'كل مهام المهندسين المفتوحة — «تم التسليم» بيقفل المهمة.':'مهام مسندة ليك من الإدارة — «تم التسليم» بيقفل المهمة.'}</div>
      <div className="fcards">
        {myTasks.map(t=>{
          const st=taskState(t);
          const eng=(umap.get(t.engineerId)||{}).name||'—';
          return <div key={t.id} className={'fc '+(st.k==='late'?'late':st.k==='today'?'today':'')}>
            <div className="chips">
              <Tag c={st.c}>{st.l}</Tag>
              {me.role==='owner'&&<Tag c="t-gray">م/{eng}</Tag>}
              {t.deliverDate&&<Tag c="t-gray">{fmt(t.deliverDate)}</Tag>}
            </div>
            <div className="nm">{t.title||'—'}</div>
            {t.desc&&<div className="note">{t.desc}</div>}
            <div className="acts">
              <button className="btn sm gold" onClick={()=>taskDone(t)}>تم التسليم</button>
            </div>
          </div>;
        })}
      </div>
    </div>}

    {total===0
      ? (myTasks.length===0&&<div className="card empty"><div className="big">✦</div>
          <b style={{fontSize:15}}>مفيش مهام مستحقة عليك النهاردة</b>
          <div className="hint" style={{marginTop:6}}>
            {me.role==='owner'?'كل المواعيد قدّام ومفيش سجل راكد.':'شغلك نضيف. لو محتاج تشوف سجلات تانية اطلب الصلاحية من المالك.'}
          </div></div>)
      : DSEC.map(sc=>{
          const items=B[sc.id];
          if(!items.length) return null;
          const isOpen=!shut[sc.id];
          const n=Math.min(lim[sc.id],items.length);
          return <div key={sc.id}>
            <div className="secbar" onClick={()=>setShut(o=>({...o,[sc.id]:!o[sc.id]}))}>
              <span className="dot"/>
              <h3>{sc.l} <span className="num">({items.length})</span></h3>
              <span className="grow"/>
              <span className="chev">{isOpen?'▾':'▸'}</span>
            </div>
            {isOpen&&<>
              <div className="hint" style={{marginBottom:10}}>{sc.hint}</div>
              <div className="fcards" style={{marginBottom:n<items.length?12:22}}>
                {items.slice(0,n).map(x=>
                  <TaskCard key={x.l.id} {...x} kind={sc.kind} me={me}
                    uname={(umap.get(x.l.engineerId)||{}).name||''}
                    open={open} logCall={logCall} done={done} snooze={snooze}/>)}
              </div>
              {n<items.length&&<div className="moreb">
                <button className="btn ghost sm"
                  onClick={()=>setLim(o=>({...o,[sc.id]:o[sc.id]+STEP}))}>
                  تحميل المزيد — فاضل <span className="num">{items.length-n}</span>
                </button>
              </div>}
            </>}
          </div>;
        })}
  </div>;
}

/* ============ سجل العملاء — أعمدة قابلة للإظهار/الإخفاء + تعديل مباشر ============ */
const EdSel=({v,on,opts,cls='',ph='—'})=>(
  <select className={'ed '+cls} value={v||''} onChange={e=>on(e.target.value)} onClick={e=>e.stopPropagation()}>
    <option value="">{ph}</option>
    {opts.map(o=>typeof o==='string'
      ?<option key={o} value={o}>{dsp(o)}</option>
      :<option key={o.id} value={o.id} disabled={!!o.d}>{dsp(o.l)}</option>)}
  </select>);
/* لو القيمة المخزّنة اتشالت من القوائم، نضيفها للعرض عشان القيمة ما تختفيش من الشاشة */
const withVal=(opts,v)=>{
  const t=String(v==null?'':v); if(!t) return opts;
  const has=opts.some(o=>String(typeof o==='string'?o:o.id)===t);
  if(has) return opts;
  return typeof opts[0]==='object'
    ? [...opts,{id:t,l:'(محذوف)'}]
    : [...opts,t];
};
const EdTxt=({v,on,cls='',ph='',k})=>(
  <input key={k} className={'ed '+cls} defaultValue={v||''} placeholder={ph} title={v||''}
    onClick={e=>e.stopPropagation()}
    onBlur={e=>{if(e.target.value!==(v||''))on(e.target.value)}}
    onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}/>);
/* زي EdTxt بس بتتمدّد رأسياً عشان النص الطويل (وصف/ملاحظات) يبان كامل من غير ما يتقطع */
const EdArea=({v,on,cls='',ph='',k})=>{
  const grow=el=>{ if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } };
  return <textarea key={k} ref={grow} rows={1} className={'ed area '+cls} defaultValue={v||''} placeholder={ph} title={v||''}
    onClick={e=>e.stopPropagation()}
    onInput={e=>grow(e.target)}
    onBlur={e=>{if(e.target.value!==(v||''))on(e.target.value)}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.blur()}}}/>;
};
const EdDate=({v,on})=>(
  <input type="date" className="ed dt" value={v||''} onClick={e=>e.stopPropagation()} onChange={e=>on(e.target.value)}/>);

/* تعريف كل الأعمدة المتاحة — الثابتة مش بتتخفي */
const COLS=[
 {id:'name',   l:'الاسم',          fixed:true},
 {id:'proj',   l:'مشروع'},
 {id:'sk',     l:'اسكتش'},
 {id:'phone',  l:'رقم التليفون'},
 {id:'group',  l:'جروب الواتساب'},
 {id:'grade',  l:'الجدية'},
 {id:'work',   l:'الحالة'},
 {id:'req',    l:'المطلوب'},
 {id:'follow', l:'المتابعة'},
 {id:'owner',  l:'المسؤول'},
 {id:'eng',    l:'المهندس'},
 {id:'deliver',l:'موعد التسليم'},
 {id:'stale',  l:'في الدرجة'},
 {id:'main',   l:'النوع الرئيسي'},
 {id:'type',   l:'النوع الفرعي'},
 {id:'desc',   l:'الوصف'},
 {id:'emirate',l:'الإمارة'},
 {id:'area',   l:'المنطقة'},
 {id:'source', l:'مصدر العميل'},
 {id:'refBy',  l:'من طرف'},
 {id:'last',   l:'آخر تواصل'},
 {id:'next',   l:'الموعد المتوقع'},
 {id:'notes',  l:'ملاحظات'},
 {id:'act',    l:'',              fixed:true}
];
/* أعمدة الهوية: بتتقرا في الجدول وبتتعدّل من داخل الملف بس */
const ID_COLS=['name','phone','sk'];
const DEFAULT_COLS=['name','proj','sk','phone','group','grade','req','work','follow','last','next','stale','type','owner','area','act'];
/* الأعمدة المثبّتة عند التمرير الأفقي — لازم تكون متجاورة في أول الجدول */
const STK={name:158,proj:104,sk:74};

/* فلتر متعدد الاختيار — قايمة بتفتح فيها checkboxes.
   sel = مصفوفة القيم المختارة، opts = [{v,l}] القيمة والعنوان. */
function MultiFilter({label,sel,setSel,opts}){
  const [o,setO]=useState(false);
  const arr=Array.isArray(sel)?sel:(sel?[sel]:[]);
  const on=v=>arr.includes(v);
  const tog=v=>setSel(on(v)?arr.filter(x=>x!==v):[...arr,v]);
  const n=arr.length;
  const cap=n===0?label:(n===1?(opts.find(o=>o.v===arr[0])||{}).l||label:label+' · '+n);
  return <span className="pop">
    <button className={'btn ghost sm mfbtn'+(n?' mfon':'')} onClick={()=>setO(!o)}>{cap} ▾</button>
    {o&&<>
      <div className="backdrop" onClick={()=>setO(false)}/>
      <div className="panel">
        <div className="hd">
          <button className="btn sm ghost" onClick={()=>setSel(opts.map(x=>x.v))}>الكل</button>
          <button className="btn sm ghost" onClick={()=>setSel([])}>مسح</button>
        </div>
        {opts.map(x=>(
          <label key={x.v}>
            <input type="checkbox" checked={on(x.v)} onChange={()=>tog(x.v)}/>
            {x.l}
          </label>))}
      </div></>}
  </span>;
}

function ColPicker({vis,setVis}){
  const [o,setO]=useState(false);
  const on=id=>vis.includes(id);
  const tog=id=>setVis(on(id)?vis.filter(x=>x!==id):COLS.filter(c=>vis.includes(c.id)||c.id===id).map(c=>c.id));
  const hidden=COLS.filter(c=>!c.fixed&&!on(c.id)).length;
  return <span className="pop">
    <button className="btn ghost sm" onClick={()=>setO(!o)}>الأعمدة{hidden>0?' · مخفي '+hidden:''}</button>
    {o&&<>
      <div className="backdrop" onClick={()=>setO(false)}/>
      <div className="panel">
        <div className="hd">
          <button className="btn sm ghost" onClick={()=>setVis(COLS.map(c=>c.id))}>إظهار الكل</button>
          <button className="btn sm ghost" onClick={()=>setVis(DEFAULT_COLS)}>الافتراضي</button>
        </div>
        {COLS.filter(c=>c.l).map(c=>(
          <label key={c.id} className={c.fixed?'lock':''}>
            <input type="checkbox" checked={on(c.id)} disabled={c.fixed} onChange={()=>tog(c.id)}/>
            {c.l}{c.fixed&&' (ثابت)'}
          </label>))}
      </div></>}
  </span>;
}

function Records({db,me,open,add,logCall,patchLead,patchClient,cols,setCols,onPrint,toast,recF,setRecF,archived,done}){
  const [fixN,setFixN]=useState(0);   /* لإرجاع الخانة لقيمتها لو الرقم مرفوض */
  /* القيم بقت مصفوفات (اختيار متعدد). أي قيمة قديمة متخزّنة كنص بتتحوّل لمصفوفة. */
  const A=v=>Array.isArray(v)?v:(v?[v]:[]);
  const {q,sort,page,per}=recF;
  const fg=A(recF.fg),fo=A(recF.fo),fe=A(recF.fe),fr=A(recF.fr),ff=A(recF.ff),ft=A(recF.ft),fw=A(recF.fw);
  const setQ=v=>setRecF(s=>({...s,q:v}));
  const setFg=v=>setRecF(s=>({...s,fg:v}));
  const setFo=v=>setRecF(s=>({...s,fo:v}));
  const setFe=v=>setRecF(s=>({...s,fe:v}));
  const setFr=v=>setRecF(s=>({...s,fr:v}));
  const setFf=v=>setRecF(s=>({...s,ff:v}));
  const setFt=v=>setRecF(s=>({...s,ft:v}));
  const setFw=v=>setRecF(s=>({...s,fw:v}));
  const setSort=v=>setRecF(s=>({...s,sort:v}));
  const setPage=v=>setRecF(s=>({...s,page:v}));
  const setPer=v=>setRecF(s=>({...s,per:v}));
  /* خريطة العملاء مرة واحدة — بدل clients.find لكل سجل */
  const cmap=useMemo(()=>{const m=new Map();db.clients.forEach(c=>m.set(c.id,c));return m},[db.clients]);
  const cOf=id=>cmap.get(id)||{};
  const vis=COLS.filter(c=>cols.includes(c.id));
  /* ترتيب الصفوف بيتثبّت — يتغيّر بس لما الفلاتر/البحث/الترتيب يتغيّروا فعلياً،
     مش كل ما تعدّل قيمة في سجل. كده الصف مش بيقفز من تحتك وانت بتعدّل. */
  const orderRef=useRef({key:'',ids:[]});

  const rows=useMemo(()=>{
    const r=db.leads.map(l=>({l,f:followUp(l),s:inGrade(l),dl:deliverStatus(l),c:cOf(l.clientId)}))
    .filter(({l,f,c})=>{
      if(archived?l.workst!=='Done':l.workst==='Done')return false;
      if(fg.length&&!fg.includes(l.grade))return false;
      if(fo.length&&!fo.includes(l.ownerId))return false;
      if(fe.length&&!fe.includes(l.engineerId))return false;
      if(fr.length&&!fr.includes(l.required))return false;
      if(ft.length&&!ft.includes(recType(l)))return false;
      if(ff.length&&!ff.includes(f.k))return false;
      if(fw.length&&!fw.includes(l.workst))return false;
      if(q){const t=(c.name+' '+c.phone+' '+(l.area||'')+' '+l.sketchNo+' '+(l.projectNo||'')+' '+(l.desc||'')+' '+(l.notes||'')).toLowerCase();
        if(!t.includes(q.toLowerCase()))return false}
      return true;});
    /* الترتيب بيتحسب من جديد بس لو فعلاً الفلاتر/البحث/طريقة الترتيب اتغيّروا.
       غير كده بنحافظ على نفس ترتيب الصفوف اللي كان ظاهر، ونضيف أي سجل جديد في الآخر. */
    const sigKey=JSON.stringify([archived,q,fg,fo,fe,fr,ff,ft,fw,sort].map(x=>Array.isArray(x)?x.slice().sort():x));
    let ordered;
    if(orderRef.current.key!==sigKey){
      ordered=r.slice();
      if(sort==='num') ordered.sort((a,b)=>(+b.l.sketchNo||0)-(+a.l.sketchNo||0));
      else if(sort==='name') ordered.sort((a,b)=>a.c.name.localeCompare(b.c.name,'ar'));
      else if(sort==='stale') ordered.sort((a,b)=>b.s.days-a.s.days);
      else ordered.sort((a,b)=>b.f.days-a.f.days||String(b.l.createdAt).localeCompare(a.l.createdAt));
    }else{
      const byId=new Map(r.map(x=>[x.l.id,x]));
      const seen=new Set(); ordered=[];
      orderRef.current.ids.forEach(id=>{const x=byId.get(id); if(x){ordered.push(x); seen.add(id)}});
      r.forEach(x=>{if(!seen.has(x.l.id)){ordered.push(x); seen.add(x.l.id)}});
    }
    orderRef.current={key:sigKey, ids:ordered.map(x=>x.l.id)};
    return ordered;},[db.leads,cmap,me,q,fg.join(','),fo.join(','),fe.join(','),fr.join(','),ff.join(','),ft.join(','),fw.join(','),sort,archived]);

  /* وصف الفلاتر الشغّالة — بيتطبع فوق الجدول عشان الورقة تفسّر نفسها */
  const ffL={late:'متأخر',today:'اليوم',next:'قادم',none:'بدون موعد'};
  const filterLabel=[
    q&&('بحث: '+q), ft.length&&('النوع: '+ft.join('، ')),
    fg.length&&('الجدية: '+fg.map(x=>gradeOf(x).l).join('، ')), fr.length&&('المطلوب: '+fr.map(dsp).join('، ')),
    fo.length&&('المسؤول: '+fo.map(x=>uName(db,x)).join('، ')), fe.length&&('المهندس: '+fe.map(x=>uName(db,x)).join('، ')), fw.length&&('الحالة: '+fw.join('، ')),
    ff.length&&('المتابعة: '+ff.map(x=>ffL[x]).join('، '))
  ].filter(Boolean).join(' · ');

  /* الإزاحة التراكمية: كل عمود مثبّت يبدأ بعد مجموع عرض اللي قبله */
  const stk={}; let acc=0, lastStk=null;
  vis.forEach(c=>{ if(STK[c.id]!==undefined){ stk[c.id]=acc; acc+=STK[c.id]; lastStk=c.id; } });
  const stkProps=id=>STK[id]===undefined?{}:{
    className:'stk stk-'+id+(id!=='name'?' stkOpt':'')+(id===lastStk?' stkEdge':''),
    style:{'--stk':stk[id]+'px',width:STK[id],minWidth:STK[id],maxWidth:STK[id],whiteSpace:'normal'}
  };

  /* أي تغيير في البحث أو الفلاتر أو الترتيب أو حجم الصفحة → نرجع لأول صفحة */
  useEffect(()=>{setPage(1)},[q,fg.join(','),fo.join(','),fe.join(','),fr.join(','),ff.join(','),ft.join(','),fw.join(','),sort,per]);
  /* التقسيم بيحصل بعد الفلترة والترتيب — الصفحة بتتقصّ من النتائج الكاملة */
  const pages=Math.max(1,Math.ceil(rows.length/per));
  const cur=Math.min(page,pages);
  const from=rows.length?(cur-1)*per+1:0, to=Math.min(cur*per,rows.length);
  const pageRows=rows.slice((cur-1)*per,cur*per);

  const uids=new Set((db.users||[]).map(u=>u.id));
  const orphan=db.leads.filter(l=>(l.ownerId&&!uids.has(l.ownerId))||(l.engineerId&&!uids.has(l.engineerId))).length;
  const locked=rows.filter(r=>!canEdit(me,r.l)).length;

  /* فهرس المشاريع: يتبني مرة واحدة للجدول كله — مش لكل صف.
     Map للأرقام المحجوزة و Set للأرقام المتاحة، فمفيش مسح متكرر. */
  /* فهرس أرقام المشاريع المحجوزة — يتبني مرة واحدة للجدول كله بـ useMemo،
     فمفيش أي مسح للسجلات أو العملاء جوه الصفوف. */
  /* بيانات العميل (الاسم/التليفون/المنطقة/المصدر...) بتتعدّل بصلاحية «يعدّل سجلات غيره» بس —
     كونك مسؤول أو مهندس السجل بيدّيك حق تعدّل تقدّم شغلك، مش حق تعدّل هوية العميل. */
  const canEditClientData=me.role==='owner'||can(me,'editAll');

  const projTaken=useMemo(()=>{
    const m=new Map();
    db.leads.forEach(x=>{const v=String(x.projectNo||'').trim();if(v)m.set(v,x)});
    return m;
  },[db.leads]);

  /* إدخال يدوي: الرقم بيتاخد من ERP. بنتحقق من عدم التكرار بس. */
  const setProjNum=lead=>v=>{
    const val=String(v||'').trim();
    const cur=String(lead.projectNo||'').trim();
    if(val===cur) return;
    if(val){
      const own=projTaken.get(val);
      if(own&&own.id!==lead.id){
        const c=cOf(own.clientId);
        toast('رقم المشروع '+val+' مستخدم في سجل '+(c.name||'—')+' — اختر رقم تاني');
        setFixN(x=>x+1);           /* بيرجّع الخانة لقيمتها الأصلية */
        return;
      }
    }
    patchLead(lead.id,{projectNo:val});
  };

  const P=(id,k)=>v=>patchLead(id,{[k]:v});
  const PC=(id,k)=>v=>patchClient(id,{[k]:v});

  /* راسم الخانة — عمود واحد = حالة واحدة، فالعناوين والبيانات مستحيل يزحفوا */
  const cell=(id,r)=>{
    const {l,f,s,c}=r;
    /* صلاحية التعديل: سجلي، أو عندي «يعدّل سجلات غيره».
       بيانات العميل تتعدّل لو أقدر أعدّل أي سجل من سجلاته. */
    const ed=canEdit(me,l);
    const edC=canEditClientData;
    const LEAD_C=['proj','sk','grade','req','work','type','main','desc','owner','eng','last','next','deliver','notes'];
    const CLI_C=['name','phone','emirate','area','source','refBy'];
    if((LEAD_C.includes(id)&&!ed)||(CLI_C.includes(id)&&!edC)){
      return <span className="ro" title="مش مسموحلك تعدّل السجل ده">{printCell(id,r,db)||'—'}</span>;
    }
    /* أعمدة الهوية — التعديل من داخل الملف بس، عشان ما تتغيّرش بالغلط من الجدول */
    if(ID_COLS.includes(id)){
      if(id==='name') return <button className="nml" onClick={()=>open(l)}
        title="اضغط تفتح الملف — الاسم والتليفون وأرقام المشروع والاسكتش بيتعدّلوا من جوه">
        {c.name||'—'}{c.vip?' ★':''}</button>;
      return <span className="ro" title="التعديل من داخل الملف">{printCell(id,r,db)||'—'}</span>;
    }
    switch(id){
      case 'name':   return <EdTxt k={l.id+'n'} v={c.name} on={PC(c.id,'name')} cls="nm" ph="اسم العميل"/>;
      case 'phone':  return <EdTxt k={l.id+'t'+c.phone} v={phoneOut(c.phone)} on={PC(c.id,'phone')} cls="ltr" ph="05xxxxxxxx"/>;
      case 'group':  return isGroup(l.waGroup)
        ? <div className="rowbtns">
            <a className="btn wa xs" href={NitaqCrmSafety.safeUrl(normGroup(l.waGroup))} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}>واتساب · الجروب</a>
            {ed&&<button className="btn ghost xs" title="تغيير الرابط" onClick={()=>P(l.id,'waGroup')('')}>↺</button>}
          </div>
        : <div className="rowbtns" style={{alignItems:'center'}}>
            <a className="btn ghost xs" href={waLink(c.phone)} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}
               title="لسه مش مربوط بجروب — بيفتح محادثة فردية">واتساب</a>
            {ed
              ? <EdTxt k={l.id+'g'} v={l.waGroup} on={P(l.id,'waGroup')} cls="ltr" ph="الصق رابط جروب الاسكتش ده"/>
              : <span className="ro">—</span>}
          </div>;
      case 'proj':   return <EdTxt k={l.id+'p'+(l.projectNo||'')+'|'+fixN}
          v={l.projectNo} on={setProjNum(l)} cls="ltr" ph="اسكتش"/>;
      case 'sk':     return <EdTxt k={l.id+'s'} v={l.sketchNo} on={P(l.id,'sketchNo')} cls="ltr"/>;
      case 'grade':  return <>
          <EdSel v={l.grade} on={P(l.id,'grade')} opts={GRADES} cls={'g '+gradeOf(l.grade).c}/>
          {l.grade==='dead'&&!l.lossReason&&<div style={{marginTop:4}}>
            <EdSel v={l.lossReason} on={P(l.id,'lossReason')} opts={LOSS} ph="السبب؟" cls="t-red"/></div>}
        </>;
      case 'req':    return <EdSel v={l.required} on={P(l.id,'required')} opts={REQUIRED}/>;
      case 'work':   return <EdSel v={l.workst} on={P(l.id,'workst')} opts={WORKST}/>;
      case 'follow': return <Tag c={f.c}>{f.l}</Tag>;
      case 'last':   return <EdDate v={l.lastDate} on={P(l.id,'lastDate')}/>;
      case 'next':   return <EdDate v={l.nextDate} on={P(l.id,'nextDate')}/>;
      case 'stale':  return gradeOf(l.grade).live?<Tag c={s.stale?'t-amber':'t-gray'}>{s.days} يوم</Tag>:'—';
      case 'type':   return <EdSel v={l.subType} on={P(l.id,'subType')} opts={withVal(db.lookups.subType,l.subType)} cls="wide2"/>;
      case 'main':   return <EdSel v={l.mainType} on={P(l.id,'mainType')} opts={withVal(db.lookups.mainType,l.mainType)} cls="wide2"/>;
      case 'desc':   return <EdArea k={l.id+'d'} v={l.desc} on={P(l.id,'desc')} cls="wide" ph="وصف المشروع"/>;
      case 'owner':  return <EdSel v={l.ownerId} on={P(l.id,'ownerId')} opts={withVal(uOpts(db),l.ownerId)} cls="wide2"/>;
      case 'eng':    return <EdSel v={l.engineerId} on={P(l.id,'engineerId')} opts={withVal(uOpts(db),l.engineerId)} cls="wide2"/>;
      case 'emirate':return <EdSel v={l.emirate} on={P(l.id,'emirate')} opts={withVal(db.lookups.emirate,l.emirate)} cls="wide2"/>;
      case 'area':   return <EdSel v={l.area} on={P(l.id,'area')} opts={withVal(db.lookups.area,l.area)} cls="wide2"/>;
      case 'source': return <EdSel v={c.source} on={PC(c.id,'source')} opts={withVal(db.lookups.source,c.source)} cls="wide2"/>;
      case 'refBy':  return <EdArea k={l.id+'r'} v={c.refBy} on={PC(c.id,'refBy')} ph="مين حوّله"/>;
      case 'deliver':return <EdDate v={l.deliverDate} on={P(l.id,'deliverDate')}/>;
      case 'notes':  return <EdArea k={l.id+'o'} v={l.notes} on={P(l.id,'notes')} cls="wide" ph="ملاحظات"/>;
      case 'act':    return <div className="rowbtns">
          {ed&&l.deliverDate&&l.workst!=='Done'&&l.workst!=='جاهز'&&
            <button className="btn sm gold" onClick={()=>done(l,true)}>تم التسليم</button>}
          <button className="btn sm ghost" onClick={()=>logCall(l)}>تواصل</button>
          <button className="btn sm ghost" onClick={()=>open(l)}>ملف</button></div>;
      default: return null;
    }
  };

  return <div className="wrap">
    <div className="filt">
      <input className="in" style={{minWidth:175,flex:'1 1 175px'}} placeholder="بحث بالاسم / التليفون / رقم / ملاحظة…" value={q} onChange={e=>setQ(e.target.value)}/>
      <MultiFilter label="النوع" sel={ft} setSel={setFt} opts={[{v:'اسكتش',l:'اسكتش'},{v:'مشروع',l:'مشروع'}]}/>
      <MultiFilter label="كل الدرجات" sel={fg} setSel={setFg} opts={GRADES.map(x=>({v:x.id,l:x.l}))}/>
      <MultiFilter label="المطلوب" sel={fr} setSel={setFr} opts={REQUIRED.map(r=>({v:r,l:dsp(r)}))}/>
      <MultiFilter label="المسؤول" sel={fo} setSel={setFo} opts={uOpts(db).map(o=>({v:o.id,l:o.l}))}/>
      <MultiFilter label="المهندس" sel={fe} setSel={setFe} opts={uOpts(db).map(o=>({v:o.id,l:o.l}))}/>
      <MultiFilter label="المتابعة" sel={ff} setSel={setFf} opts={[{v:'late',l:'متأخر'},{v:'today',l:'اليوم'},{v:'next',l:'قادم'},{v:'none',l:'بدون موعد'}]}/>
      {!archived&&<MultiFilter label="كل الحالات" sel={fw} setSel={setFw} opts={WORKST.map(w=>({v:w,l:w}))}/>}
      <select className="in" value={sort} onChange={e=>setSort(e.target.value)}>
        <option value="follow">ترتيب: الأكثر تأخيراً</option><option value="stale">ترتيب: الأكثر ركوداً</option>
        <option value="num">ترتيب: رقم الاسكتش</option><option value="name">ترتيب: الاسم</option></select>
      <ColPicker vis={cols} setVis={setCols}/>
      <button className="btn ghost sm" onClick={()=>onPrint({rows,colIds:cols,label:filterLabel})}>🖨 طباعة</button>
      {(q||fg.length||fo.length||fe.length||fr.length||ff.length||ft.length||fw.length)&&<button className="btn sm ghost" onClick={()=>{setQ('');setFg([]);setFo([]);setFe([]);setFr([]);setFf([]);setFt([]);setFw([])}}>مسح الفلاتر</button>}
      <span className="grow"/><span className="hint">{rows.length} سجل</span>
      {!archived&&<button className="btn gold" onClick={add}>+ سجل جديد</button>}
    </div>
    <div className="hint" style={{marginBottom:10}}>
      {archived
        ?<>السجلات دي حالتها <b>Done</b> فاتنقلت هنا تلقائياً من «سجل العملاء». غيّر «الحالة» لأي قيمة تانية من عمودها عشان السجل يرجع تاني لسجل العملاء العادي.</>
        :<>عدّل أي خانة من مكانها — بتتحفظ لوحدها. المنطقة والمصدر بيتغيّروا على العميل وكل اسكتشاته.
      <b>الاسم · رقم التليفون · اسكتش</b> بيتعدّلوا من <b>داخل الملف</b> بس — اضغط على اسم العميل يفتحلك.
      رقم المشروع بيتكتب يدوياً من الـERP — وأول ما تكتبه الجدية بتبقى «مشروع». والنظام بيرفض أي رقم مستخدم في سجل تاني.
      السجل اللي حالته Done بيتنقل تلقائياً لـ«الأرشيف».</>}
      {locked>0&&<> <b>{locked}</b> سجل معروض للقراءة بس — انت مش مسؤول ولا مهندس فيه.</>}
    </div>
    {orphan>0&&me.role==='owner'&&<div className="warn" style={{marginBottom:12}}>
      ◆ <b>{orphan}</b> سجل مسؤوله أو مهندسه مش موجود في المستخدمين — <b>مش ظاهر لأي مهندس</b>.
      حدّد له مسؤول من عمود «المسؤول».
    </div>}

    <div className="card"><div className="scroll"><table>
      <thead><tr>{vis.map(c=><th key={c.id} {...stkProps(c.id)}>{c.l}</th>)}</tr></thead>
      <tbody>{pageRows.map(r=>(
        <tr key={r.l.id} className={r.dl.k==='late'?'late':r.dl.k==='today'?'today':''}>
          {vis.map(c=><td key={c.id} {...stkProps(c.id)}>{cell(c.id,r)}</td>)}
        </tr>))}</tbody>
    </table>{rows.length===0&&<div className="empty">{archived?'مفيش سجلات في الأرشيف.':'مفيش سجلات مطابقة.'}</div>}</div>

      {rows.length>0&&<div className="pgbar">
        <button className="btn ghost sm" disabled={cur<=1} style={cur<=1?{opacity:.4}:{}}
          onClick={()=>setPage(cur-1)}>› السابق</button>
        <span className="hint">صفحة <b className="num">{cur}</b> من <b className="num">{pages}</b></span>
        <button className="btn ghost sm" disabled={cur>=pages} style={cur>=pages?{opacity:.4}:{}}
          onClick={()=>setPage(cur+1)}>التالي ‹</button>
        <span className="grow"/>
        <span className="hint">عرض <b className="num">{from}</b>–<b className="num">{to}</b> من <b className="num">{rows.length}</b> سجل</span>
        <select className="in" style={{width:'auto',padding:'6px 9px',fontSize:12.5}}
          value={per} onChange={e=>setPer(+e.target.value)}>
          <option value={25}>25 في الصفحة</option>
          <option value={50}>50 في الصفحة</option>
          <option value={100}>100 في الصفحة</option>
        </select>
      </div>}
    </div>

  </div>;
}


/* ============ درج السجل ============ */
function LeadDrawer({db,me,lead,close,save,del,logCall,revert}){
  const isNew=!lead.id;
  const c0=db.clients.find(c=>c.id===lead.clientId)||{};
  const [L,setL]=useState({...lead});
  const [C,setC]=useState({name:'',phone:'',source:'Individual',refBy:'',vip:false,...c0,phone:phoneOut(c0.phone)});
  const [tab,setTab]=useState('info');
  const set=(k,v)=>setL(p=>({...p,[k]:v})); const setc=(k,v)=>setC(p=>({...p,[k]:v}));
  const logs=useMemo(()=>(idxGroup(db.inter,'leadId').get(lead.id)||[])
    .slice().sort((a,b)=>b.date.localeCompare(a.date)),[db.inter,lead.id]);
  const sib=useMemo(()=>(idxGroup(db.leads,'clientId').get(L.clientId)||[]).filter(l=>l.id!==L.id),
    [db.leads,L.clientId]);
  /* لو اتكتب رقم مشروع، الجدية هتبقى «مشروع» عند الحفظ — فالتحقق لازم يحسبها كده
     وإلا هيطلب «الموعد المتوقع» لسجل مش هيبقى نشط أصلاً */
  const effGrade=(String(L.projectNo||'').trim()&&L.grade!=='dead')?'proj':L.grade;
  const live=gradeOf(effGrade).live;
  const dup=db.clients.find(x=>x.id!==C.id&&x.phone===normPhone(C.phone));
  const s=isNew?null:inGrade(L);

  const mayEdit=isNew||canEdit(me,lead);
  /* بيانات العميل تتعدّل بصلاحية «يعدّل سجلات غيره» بس — إلا وقت إنشاء سجل جديد،
     لازم تدخل بيانات العميل ولو أول مرة، حتى لو مفيش عندك الصلاحية دي */
  const mayEditClient=isNew||me.role==='owner'||can(me,'editAll');
  const pdup=(()=>{const v=String(L.projectNo||'').trim();if(!v)return null;
    return db.leads.find(x=>x.id!==L.id&&String(x.projectNo||'').trim()===v)||null})();
  const err=!mayEdit?'مش مسموحلك تعدّل السجل ده'
    :pdup?('رقم المشروع '+String(L.projectNo).trim()+' مستخدم في سجل تاني')
    :!C.name.trim()?'الاسم مطلوب'
    :!C.phone.trim()?'رقم التليفون مطلوب'
    :(live&&!L.nextDate)?'حدّد الموعد المتوقع للتواصل'
    :(L.grade==='dead'&&!L.lossReason)?'اختر سبب عدم الفاعلية'
    :'';

  return <div className="ov" onClick={e=>e.target===e.currentTarget&&close()}>
   <div className="dw">
    <div className="dw-h">
      <div><h3>{isNew?'سجل جديد':C.name}</h3>
        <div className="s num">{isNew?'هياخد رقم اسكتش تلقائي'
          :(recType(L)==='مشروع'?'مشروع '+L.projectNo+' · اسكتش '+L.sketchNo:'اسكتش '+L.sketchNo)}</div></div>
      <button className="x" onClick={close}>×</button>
    </div>
    <div className="dw-b">
      {!isNew&&<div className="tabs">
        <button className={tab==='info'?'on':''} onClick={()=>setTab('info')}>البيانات</button>
        <button className={tab==='log'?'on':''} onClick={()=>setTab('log')}>سجل التواصل ({logs.length})</button>
        <button className={tab==='hist'?'on':''} onClick={()=>setTab('hist')}>تدرّج الجدية</button>
        <button className={tab==='chg'?'on':''} onClick={()=>setTab('chg')}>سجل التعديلات</button>
        {sib.length>0&&<button className={tab==='sib'?'on':''} onClick={()=>setTab('sib')}>سجلات العميل ({sib.length+1})</button>}
      </div>}

      {tab==='info'&&<>
        {dup&&<div className="warn" style={{marginBottom:14}}>⚠ الرقم مسجّل قبل كده باسم <b>{dup.name}</b>. لو نفس العميل، اقفل ده وضيف السجل من ملفه.</div>}
        {s&&s.stale&&<div className="warn" style={{marginBottom:14}}>◆ السجل قاعد في درجة «{gradeOf(L.grade).l}» من <b>{s.days}</b> يوم (الحد {s.lim}). محتاج قرار.</div>}

        <div className="card" style={{marginBottom:14}}>
          <div className="card-h"><span className="dot"/><h3>العميل</h3></div>
          <div style={{padding:16}}>
            {!mayEditClient&&<div className="hint" style={{marginBottom:10}}>
              بيانات العميل دي للقراءة بس — مش معاك صلاحية تعدّلها.</div>}
            <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))'}}>
              <Field label="الاسم" req><input className="in" value={C.name} disabled={!mayEditClient} onChange={e=>setc('name',e.target.value)}/></Field>
              <Field label="رقم التليفون" req><input className="in num" dir="ltr" value={C.phone} disabled={!mayEditClient} onChange={e=>setc('phone',e.target.value)} placeholder="0501234567"/></Field>
              <Field label="مصدر العميل"><Sel v={C.source} on={v=>setc('source',v)} opts={withVal(db.lookups.source,C.source)} disabled={!mayEditClient}/></Field>
              <Field label="من طرف" hint="مين حوّله لنا — ده مصدر الشغل الحقيقي"><input className="in" value={C.refBy||''} disabled={!mayEditClient} onChange={e=>setc('refBy',e.target.value)}/></Field>
            </div>
            <label style={{display:'flex',gap:8,alignItems:'center',cursor:mayEditClient?'pointer':'default'}}>
              <input type="checkbox" checked={!!C.vip} disabled={!mayEditClient} onChange={e=>setc('vip',e.target.checked)}/> عميل VIP</label>
          </div>
        </div>

        <div className="card" style={{marginBottom:14}}>
          <div className="card-h"><span className="dot"/><h3>الاسكتش / المشروع</h3></div>
          <div style={{padding:16}}>
            {!isNew && me.role==='owner' && !pdup && lead.grade==='proj' && String(lead.projectNo||'').trim() && String(L.projectNo||'').trim()===String(lead.projectNo).trim() && <CrmAccountingProject key={lead.id} lead={L} me={me} onLink={data=>setL(p=>({...p,...data}))}/>}
            <Field label="الوصف"><input className="in" value={L.desc||''} onChange={e=>set('desc',e.target.value)} placeholder="مثال: فيلا سكنية أرضي + أول"/></Field>
            <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))'}}>
              <Field label="النوع الرئيسي"><Sel v={L.mainType} on={v=>set('mainType',v)} opts={withVal(db.lookups.mainType,L.mainType)}/></Field>
              <Field label="النوع الفرعي"><Sel v={L.subType} on={v=>set('subType',v)} opts={withVal(db.lookups.subType,L.subType)}/></Field>
              <Field label="الإمارة" hint="موقع المشروع ده تحديداً"><Sel v={L.emirate} on={v=>set('emirate',v)} opts={withVal(db.lookups.emirate,L.emirate)}/></Field>
              <Field label="المنطقة" hint="الإضافة والتعديل من شاشة «القوائم»"><Sel v={L.area} on={v=>set('area',v)} opts={withVal(db.lookups.area,L.area)}/></Field>
              <Field label="رقم الاسكتش"><input className="in num" value={L.sketchNo} onChange={e=>set('sketchNo',e.target.value)}/></Field>
              <Field label="رقم المشروع" hint="اكتبه يدوياً من الـERP — وأول ما تكتبه الجدية بتبقى «مشروع»"><input className="in num" value={L.projectNo||''} onChange={e=>set('projectNo',e.target.value)} placeholder="اسكتش"/></Field>
              <Field label="المسؤول"><Sel v={L.ownerId} on={v=>set('ownerId',v)} opts={withVal(uOpts(db),L.ownerId)}/></Field>
              <Field label="المهندس"><Sel v={L.engineerId} on={v=>set('engineerId',v)} opts={withVal(uOpts(db),L.engineerId)}/></Field>
            </div>
            <Field label="رابط جروب الواتساب — خاص بالاسكتش ده بس"
              hint="من داخل الجروب: معلومات المجموعة ← رابط الدعوة ← نسخ الرابط. الصقه هنا مرة واحدة.">
              <div style={{display:'flex',gap:8}}>
                <input className="in ltr" dir="ltr" value={L.waGroup||''} onChange={e=>set('waGroup',e.target.value)}
                  placeholder="https://chat.whatsapp.com/…"/>
                {isGroup(normGroup(L.waGroup))&&
                  <a className="btn wa" href={normGroup(L.waGroup)} target="_blank" rel="noopener">افتح</a>}
              </div>
              {L.waGroup&&!isGroup(normGroup(L.waGroup))&&
                <div className="hint" style={{color:'var(--red)',marginTop:5}}>الرابط مش مظبوط — لازم يكون chat.whatsapp.com/…</div>}
            </Field>
          </div>
        </div>

        <div className="card" style={{marginBottom:14}}>
          <div className="card-h"><span className="dot"/><h3>الجدية والمطلوب</h3></div>
          <div style={{padding:16}}>
            <Field label="درجة الجدية (التوقيع)" req>
              <Sel v={L.grade} opts={GRADES} ph="اختر" on={v=>{
                setL(pv=>{
                  /* مفيش ترقيم تلقائي — الرقم بيتكتب يدوياً من الـERP */
                  if(v==='proj') return {...pv,grade:v};
                  return pv.grade==='proj'
                    ? {...pv,grade:v,prevProj:pv.projectNo||'',projectNo:''}
                    : {...pv,grade:v};
                });
              }}/>
              <div className="hint" style={{marginTop:5}}>{gradeOf(L.grade).d}</div>
            </Field>
            {L.grade==='dead'&&<Field label="سبب عدم الفاعلية" req hint="من غير سبب مكتوب مش هتعرف تسدّ التسريب">
              <Sel v={L.lossReason} on={v=>set('lossReason',v)} opts={LOSS} ph="اختر السبب"/></Field>}
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
              <Field label="المطلوب"><Sel v={L.required} on={v=>set('required',v)} opts={REQUIRED}/></Field>
              <Field label="الحالة"><Sel v={L.workst} on={v=>set('workst',v)} opts={WORKST}/></Field>
            </div>
          </div>
        </div>

        <div className="card" style={{marginBottom:14}}>
          <div className="card-h"><span className="dot"/><h3>المتابعة</h3></div>
          <div style={{padding:16}}>
            <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))'}}>
              <Field label="تاريخ آخر تواصل"><input type="date" className="in num" value={L.lastDate||''} onChange={e=>set('lastDate',e.target.value)}/></Field>
              <Field label="الموعد المتوقع للتواصل" req={live}><input type="date" className="in num" value={L.nextDate||''} onChange={e=>set('nextDate',e.target.value)}/></Field>
              <Field label="موعد التسليم"><input type="date" className="in num" value={L.deliverDate||''} onChange={e=>set('deliverDate',e.target.value)}/></Field>
            </div>
            <Field label="ملاحظات" hint="بتتحدّث آلياً مع كل تواصل بتسجّله"><textarea className="in" value={L.notes||''} onChange={e=>set('notes',e.target.value)}/></Field>
            {!isNew&&<button className="btn gold" onClick={()=>logCall(L)}>سجّل تواصل جديد</button>}
          </div>
        </div>
      </>}

      {tab==='log'&&<div className="card"><div style={{padding:18}}>
        {logs.length===0?<div className="hint">لسه مفيش تواصل مسجّل.</div>:
        <div className="tl">{logs.map(i=>(
          <div className="tli" key={i.id}>
            <div className="d"><span className="num">{fmt(i.date)}</span> · {i.channel} · {i.outcome} · {uName(db,i.byId)||i.by||'—'}</div>
            <div className="t">{i.note||'—'}</div></div>))}</div>}
      </div></div>}

      {tab==='hist'&&<div className="card"><div style={{padding:18}}>
        <div className="hint" style={{marginBottom:14}}>كام يوم قعد العميل في كل درجة — ده اللي بيقولك التسريب بيحصل فين.</div>
        <div className="tl">{(L.gradeLog||[]).slice().reverse().map((h,i,arr)=>{
          const nxt=arr[i-1]; const dur=nxt?diffDays(nxt.date,h.date):diffDays(todayISO(),h.date);
          return <div className="tli" key={i}>
            <div className="d"><span className="num">{fmt(h.date)}</span></div>
            <div className="t"><Tag c={gradeOf(h.g).c}>{gradeOf(h.g).l}</Tag>
              <span className="hint"> — قعد فيها <b>{dur}</b> يوم{!nxt?' (لسه فيها)':''}</span></div>
          </div>})}</div>
      </div></div>}

      {tab==='chg'&&<div className="card"><div style={{padding:16}}>
        {!isNew&&(()=>{
          /* سطر توثيق للقراءة فقط — بيتبني من الموجود بس، وبيختفي خالص لو مفيش أي قيمة */
          const cAt=C.createdAt||'', cBy=uName(db,C.createdBy)||'';
          const uAt=C.updatedAt||'', uBy=uName(db,C.updatedBy)||'';
          if(!cAt&&!cBy&&!uAt&&!uBy) return null;
          const one=(!cAt&&!cBy)||(!uAt&&!uBy);
          return <div className="hint" style={{marginBottom:14,paddingBottom:12,borderBottom:'1px solid var(--line)'}}>
            {(cAt||cBy)&&<>أُنشئ العميل
              {cAt&&<> <b className="num">{fmt(cAt)}</b></>}
              {cBy&&<> بواسطة <b>{cBy}</b></>}</>}
            {!one&&' · '}
            {(uAt||uBy)&&<>آخر تعديل
              {uAt&&<> <b className="num">{fmt(uAt)}</b></>}
              {uBy&&<> بواسطة <b>{uBy}</b></>}</>}
          </div>;
        })()}
        <RecChanges db={db} lead={L} clientId={C.id} revert={revert}/>
      </div></div>}

      {tab==='sib'&&<div className="card"><div style={{padding:8}}>
        <div className="hint" style={{padding:10}}>كل سجلات نفس العميل — عميل واحد بأكتر من اسكتش.</div>
        <table><tbody>{[L,...sib].map(x=>(
          <tr key={x.id}><td className="num">{x.projectNo?'م'+x.projectNo:x.sketchNo}</td>
            <td>{x.desc||x.subType}</td>
            <td><Tag c={gradeOf(x.grade).c}>{gradeOf(x.grade).l}</Tag></td>
            <td className="num">{fmt(x.nextDate)}</td></tr>))}</tbody></table>
      </div></div>}
    </div>

    <div className="dw-f">
      <button className="btn gold" disabled={!!err} style={err?{opacity:.45,cursor:'not-allowed'}:{}}
        onClick={()=>save(L,C)}>{err||'حفظ'}</button>
      <button className="btn ghost" onClick={close}>إلغاء</button>
      {!isNew&&mayEdit&&can(me,'del')&&<><span className="grow"/>
        <button className="btn danger sm" onClick={()=>del(L)}>حذف</button></>}
    </div>
   </div></div>;
}

/* ============ تسجيل تواصل ============ */
function CallModal({db,lead,close,submit}){
  const c=db.clients.find(x=>x.id===lead.clientId)||{};
  const [f,setF]=useState({date:todayISO(),channel:'اتصال',outcome:'تم الرد',note:'',byId:lead.ownerId||'',
    next:addDays(todayISO(),7),grade:lead.grade,required:lead.required,workst:lead.workst,lossReason:lead.lossReason||''});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const live=gradeOf(f.grade).live;
  const err=!f.note.trim()?'اكتب خلاصة المكالمة'
    :(live&&!f.next)?'حدّد الموعد الجاي'
    :(f.grade==='dead'&&!f.lossReason)?'اختر سبب عدم الفاعلية':'';
  return <div className="mo" onClick={e=>e.target===e.currentTarget&&close()}>
    <div className="box">
      <h3>تسجيل تواصل — {c.name}</h3>
      <div className="bd">
        <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <Field label="التاريخ"><input type="date" className="in num" value={f.date} onChange={e=>set('date',e.target.value)}/></Field>
          <Field label="الوسيلة"><Sel v={f.channel} on={v=>set('channel',v)} opts={CHANNELS} ph="اختر"/></Field>
          <Field label="نتيجة الاتصال"><Sel v={f.outcome} on={v=>set('outcome',v)} opts={OUTCOMES} ph="اختر"/></Field>
          <Field label="بواسطة"><Sel v={f.byId} on={v=>set('byId',v)} opts={uOpts(db)}/></Field>
        </div>
        <Field label="خلاصة المكالمة" req hint="بتتكتب في الملاحظات وتفضل في سجل التواصل">
          <textarea className="in" value={f.note} onChange={e=>set('note',e.target.value)} placeholder="اللي اتقال والمطلوب…"/></Field>
        <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <Field label="الجدية بعد المكالمة"><Sel v={f.grade} on={v=>set('grade',v)} opts={GRADES} ph="اختر"/></Field>
          <Field label="المطلوب"><Sel v={f.required} on={v=>set('required',v)} opts={REQUIRED}/></Field>
        </div>
        {f.grade==='dead'&&<Field label="سبب عدم الفاعلية" req>
          <Sel v={f.lossReason} on={v=>set('lossReason',v)} opts={LOSS} ph="اختر السبب"/></Field>}
        {live&&<Field label="الموعد المتوقع للتواصل الجاي" req>
          <input type="date" className="in num" value={f.next} onChange={e=>set('next',e.target.value)}/>
          <div className="chips" style={{marginTop:7}}>
            {[[2,'يومين'],[7,'أسبوع'],[14,'أسبوعين'],[30,'شهر'],[90,'٣ شهور']].map(([n,t])=>
              <button key={n} className="btn sm ghost" onClick={()=>set('next',addDays(todayISO(),n))}>{t}</button>)}
          </div></Field>}
      </div>
      <div className="ft">
        <button className="btn gold" disabled={!!err} style={err?{opacity:.45}:{}} onClick={()=>submit(lead,f)}>{err||'حفظ التواصل'}</button>
        <button className="btn ghost" onClick={close}>إلغاء</button>
      </div>
    </div></div>;
}

/* ============ العملاء ============ */
