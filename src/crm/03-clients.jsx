function Clients({db,open,addFor,onPrint}){
  const [q,setQ]=useState('');
  const byC=useMemo(()=>idxGroup(db.leads,'clientId'),[db.leads]);
  const areasOf=ls=>{const s=[...new Set(ls.map(l=>l.area||l.emirate).filter(Boolean))];
    return s.length?s.join(' · '):'—';};
  const rows=db.clients.map(c=>({c,ls:byC.get(c.id)||[]}))
    .filter(({c,ls})=>!q||(c.name+c.phone+areasOf(ls)+(c.refBy||'')).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>b.ls.length-a.ls.length);
  return <div className="wrap">
    <div className="filt">
      <input className="in" style={{minWidth:200,flex:'1 1 200px'}} placeholder="بحث بالاسم أو التليفون أو المُحوِّل…" value={q} onChange={e=>setQ(e.target.value)}/>
      <button className="btn ghost sm" onClick={()=>onPrint({rows,label:q?('بحث: '+q):''})}>🖨 طباعة</button>
      <span className="grow"/><span className="hint">{rows.length} عميل</span></div>
    <div className="card"><div className="scroll"><table>
      <thead><tr><th>العميل</th><th>التليفون</th><th>الجروبات</th><th>المناطق</th><th>المصدر</th><th>من طرف</th><th>سجلاته</th><th></th></tr></thead>
      <tbody>{rows.map(({c,ls})=>{
        const linked=ls.filter(l=>isGroup(l.waGroup)).length;
        return <tr key={c.id}>
          <td><b>{c.name}</b> {c.vip&&<Tag c="t-gold">VIP</Tag>}</td>
          <td className="num">{phoneOut(c.phone)}</td>
          <td>{ls.length<=1
            ? <a className={'btn xs '+(linked?'wa':'ghost')} target="_blank" rel="noopener"
                href={linked?ls[0].waGroup:waLink(c.phone)}>واتساب{linked?' · الجروب':''}</a>
            : <span className="hint">{linked} من {ls.length} اسكتش مربوط — كل اسكتش جروبه لوحده، افتح سجله</span>}</td>
          <td>{areasOf(ls)}</td>
          <td className="en">{c.source}</td><td>{c.refBy||'—'}</td>
          <td>{ls.map(l=><button key={l.id} className={'tag '+gradeOf(l.grade).c} style={{margin:'1px 2px'}} onClick={()=>open(l)}>
            {l.projectNo?'م'+l.projectNo:l.sketchNo} · {gradeOf(l.grade).l}</button>)}</td>
          <td><button className="btn sm ghost" onClick={()=>addFor(c)}>+ اسكتش</button></td>
        </tr>;})}</tbody>
    </table>{rows.length===0&&<div className="empty">مفيش عملاء مطابقين.</div>}</div></div>
  </div>;
}

/* ============ التقارير ============ */
function Reports({db}){
  const {leads,clients}=db;
  const cOf=id=>clients.find(c=>c.id===id)||{};
  const byKey=f=>{const m={};leads.forEach(l=>{const k=f(l,cOf(l.clientId))||'غير محدد';
      m[k]=m[k]||{t:0,p:0,d:0,o:0};m[k].t++;
      if(l.grade==='proj')m[k].p++;else if(l.grade==='dead')m[k].d++;else m[k].o++});
    return Object.entries(m).sort((a,b)=>b[1].t-a[1].t)};
  const T=({title,head,rows,note})=>(
    <div className="card" style={{marginBottom:14}}>
      <div className="card-h"><span className="dot"/><h3>{title}</h3></div>
      <table><thead><tr><th>{head}</th><th>الكل</th><th>مشروع</th><th>نشط</th><th>غير فعال</th><th>التحويل</th></tr></thead>
      <tbody>{rows.map(([k,v])=>{const cl=v.p+v.d;return(
        <tr key={k}><td><b>{dsp(k)}</b></td><td className="num">{v.t}</td><td className="num">{v.p}</td>
        <td className="num">{v.o}</td><td className="num">{v.d}</td>
        <td>{cl?<Tag c={v.p/cl>=.5?'t-green':v.p/cl>0?'t-amber':'t-red'}>{Math.round(v.p/cl*100)}%</Tag>:<span className="hint">لسه</span>}</td></tr>)})}
      </tbody></table>
      {note&&<div className="hint" style={{padding:'10px 14px'}}>{note}</div>}</div>);

  const dead=leads.filter(l=>l.grade==='dead');
  const lossRows=LOSS.map(r=>[r,dead.filter(l=>l.lossReason===r).length]).filter(r=>r[1]>0);
  const liveL=leads.filter(l=>gradeOf(l.grade).live);
  const gradeAge=GRADES.filter(g=>g.live).map(g=>{
    const set=liveL.filter(l=>l.grade===g.id);
    const avg=set.length?Math.round(set.reduce((s,l)=>s+inGrade(l).days,0)/set.length):0;
    return [g.l+' (متوسط)',avg]});

  return <div className="wrap">
    <T title="أداء مصادر العملاء" head="المصدر" rows={byKey((l,c)=>c.source)}/>
    <T title="أداء الإحالات — «من طرف»" head="المُحوِّل" rows={byKey((l,c)=>c.refBy||'بدون إحالة')}
       note="ده أهم جدول في النظام: بيقولك مين بالظبط بيجيب شغل يتوقّع فعلاً."/>
    <T title="أداء المسؤولين" head="المسؤول" rows={byKey(l=>uName(db,l.ownerId))}/>
    <T title="أداء المناطق" head="المنطقة" rows={byKey((l,c)=>l.area||l.emirate)}/>
    <T title="أداء أنواع المشاريع" head="النوع الفرعي" rows={byKey(l=>l.subType)}/>

    <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))'}}>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>أسباب فقدان العملاء</h3></div>
        <div style={{padding:16}}>
          {lossRows.length?<Bars rows={lossRows}/>:<div className="hint">لسه مفيش سجلات «غير فعال» بسبب مكتوب. كل مرة تنقل عميل لغير فعال هيتسجّل السبب هنا — وبعد ٣ شهور هتشوف التسريب الحقيقي.</div>}
        </div></div>
      <div className="card">
        <div className="card-h"><span className="dot"/><h3>متوسط الأيام في كل درجة</h3></div>
        <div style={{padding:16}}><Bars rows={gradeAge}/>
          <div className="hint" style={{marginTop:10}}>لو «هام جدا» متوسطه عالي، يبقى المشكلة مش في جذب العملاء — المشكلة في إقفال التوقيع.</div>
        </div></div>
    </div>
  </div>;
}

/* ============ ربط الجروبات — جلسة واحدة تكفي ============ */
function Groups({db,patchLead,toast}){
  const [only,setOnly]=useState(true),[q,setQ]=useState('');
  const cmap=useMemo(()=>{const m=new Map();db.clients.forEach(c=>m.set(c.id,c));return m},[db.clients]);
  const linked=db.leads.filter(l=>isGroup(l.waGroup)).length;
  const rows=db.leads
    .map(l=>({l,c:cmap.get(l.clientId)||{}}))
    .filter(({l,c})=>(!only||!isGroup(l.waGroup))&&(!q||(c.name+c.phone).toLowerCase().includes(q.toLowerCase())))
    .sort((a,b)=>(a.c.name||'').localeCompare(b.c.name||'','ar'));

  const paste=async l=>{
    try{
      const t=await navigator.clipboard.readText();
      if(!t) return toast('الحافظة فاضية');
      const v=normGroup(t);
      if(!isGroup(v)) return toast('اللي في الحافظة مش رابط جروب');
      patchLead(l.id,{waGroup:v}); toast('اتربط');
    }catch(e){toast('المتصفح مش سامح بقراءة الحافظة — الصق يدوياً')}
  };

  return <div className="wrap">
    <div className="card" style={{marginBottom:14}}>
      <div className="card-h"><span className="dot"/><h3>إزاي تخلّصهم بسرعة</h3></div>
      <div style={{padding:16}}>
        <div className="hint" style={{lineHeight:2}}>
          كل اسكتش له جروب واتساب خاص بيه — حتى لو نفس العميل. افتح واتساب جنب الشاشة دي، وعلى كل اسكتش:<br/>
          <b>١</b> ادخل جروبه ← اضغط اسم الجروب فوق ← <b>رابط الدعوة</b> ← <b>نسخ الرابط</b><br/>
          <b>٢</b> ارجع هنا واضغط <b>لصق</b> قدامه (أو الصق يدوياً في الخانة)<br/>
          <b>٣</b> الصف بيتقفل ويختفي من القائمة — كمّل على اللي بعده
        </div>
        <div style={{marginTop:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div className="fr" style={{flex:'1 1 220px',margin:0}}>
            <div className="bar"><div className="fill" style={{width:(db.leads.length?linked/db.leads.length*100:0)+'%'}}/></div>
          </div>
          <b style={{fontFamily:"'DM Sans'"}}>{linked} / {db.leads.length}</b>
          <span className="hint">اسكتش مربوط بجروبه</span>
        </div>
      </div>
    </div>

    <div className="filt">
      <input className="in" style={{minWidth:200,flex:'1 1 200px'}} placeholder="بحث بالاسم أو التليفون…" value={q} onChange={e=>setQ(e.target.value)}/>
      <label style={{display:'flex',gap:7,alignItems:'center',margin:0,fontSize:12.5,fontWeight:700,cursor:'pointer'}}>
        <input type="checkbox" checked={only} onChange={e=>setOnly(e.target.checked)}/> اللي لسه مش مربوط بس</label>
      <span className="grow"/><span className="hint">{rows.length} اسكتش</span>
    </div>

    <div className="card"><div className="scroll"><table>
      <thead><tr><th>العميل</th><th>الاسكتش</th><th>التليفون</th><th>رابط الجروب</th><th></th></tr></thead>
      <tbody>{rows.map(({l,c})=>(
        <tr key={l.id}>
          <td><b>{c.name}</b> {c.vip&&<Tag c="t-gold">VIP</Tag>}</td>
          <td className="num">{l.projectNo?'م'+l.projectNo:l.sketchNo}</td>
          <td className="num">{phoneOut(c.phone)}</td>
          <td><input className="ed wide ltr" dir="ltr" defaultValue={l.waGroup||''} key={l.id+(l.waGroup||'')}
              placeholder="https://chat.whatsapp.com/…"
              onBlur={e=>{if(e.target.value!==(l.waGroup||''))patchLead(l.id,{waGroup:e.target.value})}}
              onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}/></td>
          <td><div className="rowbtns">
            <button className="btn xs ghost" onClick={()=>paste(l)}>لصق</button>
            {isGroup(l.waGroup)
              ? <a className="btn xs wa" href={NitaqCrmSafety.safeUrl(normGroup(l.waGroup))} target="_blank" rel="noopener">افتح</a>
              : <a className="btn xs ghost" href={waLink(c.phone)} target="_blank" rel="noopener">فردي</a>}
          </div></td>
        </tr>))}</tbody>
    </table>{rows.length===0&&<div className="empty">
      <div className="big">✦</div><b style={{fontSize:15}}>كل الاسكتشات مربوطة بجروباتها</b>
      <div className="hint" style={{marginTop:6}}>زرار «واتساب» في أي مكان بقى بيفتح الجروب على طول.</div></div>}
    </div></div>
  </div>;
}

/* ============ القوائم ============ */
function Lookups({db,setDb,toast}){
  const [k,setK]=useState('emirate'),[nv,setNv]=useState('');
  const labels={emirate:'الإمارة',area:'المنطقة',source:'مصدر العميل',mainType:'النوع الرئيسي',subType:'النوع الفرعي'};
  const list=db.lookups[k]||[];
  const upd=arr=>setDb({...db,lookups:{...db.lookups,[k]:arr}});
  /* كل قائمة بتغذّي خانة معيّنة — بنعدّ استخدامها الفعلي قبل الحذف */
  const usage=v=>{
    if(k==='emirate') return db.leads.filter(l=>l.emirate===v).length;
    if(k==='area')    return db.leads.filter(l=>l.area===v).length;
    if(k==='source')  return db.clients.filter(c=>c.source===v).length;
    if(k==='mainType')return db.leads.filter(l=>l.mainType===v).length;
    if(k==='subType') return db.leads.filter(l=>l.subType===v).length;
    return 0;
  };
  const rm=(v,i)=>{
    const u=usage(v);
    if(u&&!confirm('«'+v+'» مستخدمة في '+u+' سجل.\n\nالحذف بيشيلها من القائمة المنسدلة بس — السجلات القديمة بتحتفظ بقيمتها ومش بتضيع.\n\nتكمّل؟')) return;
    upd(list.filter((_,j)=>j!==i));
  };
  return <div className="wrap">
    <div className="tabs">{Object.keys(labels).map(x=>
      <button key={x} className={k===x?'on':''} onClick={()=>setK(x)}>{labels[x]}</button>)}</div>
    <div className="card" style={{maxWidth:560}}>
      <div className="card-h"><span className="dot"/><h3>{labels[k]}</h3></div>
      <div style={{padding:16}}>
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <input className="in" placeholder={'أضف '+labels[k]+'…'} value={nv} onChange={e=>setNv(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&nv.trim()){upd([...list,nv.trim()]);setNv('')}}}/>
          <button className="btn gold" onClick={()=>{if(nv.trim()){upd([...list,nv.trim()]);setNv('');toast('اتضاف')}}}>إضافة</button></div>
        {list.map((v,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid #F1EDE4'}}>
            <span style={{flex:1}}>{v}</span>
            {usage(v)>0&&<span className="hint num" title="عدد السجلات المستخدمة لها">{usage(v)}</span>}
            <button className="btn sm danger" onClick={()=>rm(v,i)}>حذف</button></div>))}
        <div className="hint" style={{marginTop:12}}>أي قيمة هنا بتظهر فوراً في كل القوائم. الحذف مش بيمسح السجلات القديمة.<br/>
          <b>المسؤول والمهندس</b> بقوا بيتداروا من شاشة «المستخدمون» — عشان السجل يشاور على رقم المستخدم مش اسمه.</div>
      </div></div></div>;
}

/* ============ البيانات ============ */
function Data({db,setDb,toast,mode,badKeys,flush,inCloud,sbCfg,setSbCfg,cloudSb}){
  const fileRef=useRef();
  const [url,setUrl]=useState(sbCfg?sbCfg.url:''),[key,setKey]=useState(sbCfg?sbCfg.key:'');
  const [pushBusy,setPushBusy]=useState(false),[pushProg,setPushProg]=useState(null);
  const saveCfg=()=>{
    if(!url.trim()||!key.trim()) return toast('اكتب الـProject URL والـkey');
    setSbCfg({url:url.trim(),key:key.trim()});
    toast('اتحفظ الإعداد — هيتصل النظام بالمشروع ده بعد إعادة تحميل الصفحة');
  };
  const pushAll=async()=>{
    if(!cloudSb) return toast('مفيش اتصال سحابي دلوقتي');
    if(!confirm('إضافة السجلات غير الموجودة فقط؟ لن نستبدل سجلات السحابة أو المستخدمين.')) return;
    setPushBusy(true); setPushProg({done:0,total:1});
    const r=await pushAllToCloud(cloudSb, db, (done,total)=>setPushProg({done,total}));
    setPushBusy(false); setPushProg(null);
    if(r.ok) toast('اترفع كل شيء للسحابة — '+r.count+' سجل'); else toast('حصل خطأ أثناء الرفع — جرّب تاني');
  };
  /* لو النظام بقى شغّال سحابياً، الشاشة بتعرض بيانات السحابة (ممكن تكون فاضية لسه) —
     مش الداتا القديمة المحفوظة على الجهاز ده. الزرار ده بيقرا الداتا القديمة مباشرة
     من localStorage (لسه موجودة زي ما هي، مبتتمسحش أبداً تلقائياً) ويرفعها هي. */
  const recoverAndPush=async()=>{
    if(!cloudSb) return toast('مفيش اتصال سحابي دلوقتي');
    const old=store.load().db;
    if(!old||!(old.clients||[]).length){ return toast('مفيش بيانات قديمة على الجهاز ده — الجهاز فاضي فعلاً'); }
    if(!confirm('إضافة السجلات الناقصة من نسخة الجهاز فقط، دون استبدال بيانات السحابة؟')) return;
    setPushBusy(true); setPushProg({done:0,total:1});
    const r=await pushAllToCloud(cloudSb, old, (done,total)=>setPushProg({done,total}));
    setPushBusy(false); setPushProg(null);
    if(r.ok) toast('اترفعت نسخة الجهاز القديمة — '+r.count+' سجل. لو مش ظاهرة، اعمل تحديث للصفحة');
    else toast('حصل خطأ أثناء الرفع — جرّب تاني');
  };
  const exportJSON=()=>{const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='NITAQ_CRM_'+todayISO()+'.json';a.click();toast('اتصدّرت نسخة كاملة')};
  const exportCSV=()=>{
    const H=['نوع السجل','مشروع','اسكتش','الاسم','التليفون','الإمارة','المنطقة','Source Lead','من طرف','رابط جروب الواتساب','تاريخ إنشاء العميل','أنشأه','آخر تعديل','عدّله','المسؤول','الوصف','النوع الرئيسي','النوع الفرعي','الحالة','المهندس','المطلوب','التوقيع','سبب عدم الفاعلية','تاريخ آخر تواصل','الموعد المتوقع','حالة المتابعة','أيام التأخير','أيام في الدرجة','ملاحظات'];
    const ci=cIdx(db);
    const rows=db.leads.map(l=>{const c=ci.get(l.clientId)||{};const f=followUp(l);const s=inGrade(l);
      return [recType(l),l.projectNo||'اسكتش',l.sketchNo,c.name,phoneOut(c.phone),l.emirate,l.area,c.source,c.refBy,l.waGroup,c.createdAt,uName(db,c.createdBy),c.updatedAt,uName(db,c.updatedBy),uName(db,l.ownerId),l.desc,
        l.mainType,l.subType,l.workst,uName(db,l.engineerId),l.required,gradeOf(l.grade).l,l.lossReason,l.lastDate,l.nextDate,
        f.l,f.days>0?f.days:0,s.days,(l.notes||'').replace(/\n/g,' ')]});
    const csv='\uFEFF'+[H,...rows].map(r=>r.map(x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='NITAQ_CRM_'+todayISO()+'.csv';a.click();toast('اتصدّر CSV بنفس ترتيب أعمدة الشيت')};
  /* تصدير Excel بنفس شكل شيت الشركة بالظبط — بناخد ملف القالب الأصلي (بتنسيقه وصيغه ولوحة تحكمه
     وقوائمه المنسدلة زي ما هي) ونملأ بس صفوف البيانات في «سجل العملاء» بأرقام الشركة الحالية. */
  const MONTHS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const akF=r=>'IF(NOT(OR(TRIM($W'+r+')="هام",TRIM($W'+r+')="هام جدا",TRIM($W'+r+')="فعال")),"",IF($AA'+r+'="","",IF(ISNUMBER($AA'+r+'),TODAY()-$AA'+r+',"")))';
  const alF=r=>'IF(NOT(OR(TRIM($W'+r+')="هام",TRIM($W'+r+')="هام جدا",TRIM($W'+r+')="فعال")),"—",IF($AA'+r+'="","—",IF(NOT(ISNUMBER($AA'+r+')),"—",IF(TODAY()-$AA'+r+'>0,"متأخر",IF(TODAY()-$AA'+r+'=0,"اليوم","قادم")))))';
  const amF=r=>'IF(TRIM($G'+r+')="اسكتش","اسكتش",IF($G'+r+'="","","مشروع"))';
  const exportXLSX=async()=>{
    if(!window.ExcelJS){toast('مكتبة الإكسل لسه بتحمّل من الإنترنت — جرّب تاني بعد شوية');return}
    try{
      const wb=new window.ExcelJS.Workbook();
      wb.creator='NITAQ';const ws=wb.addWorksheet('سجل العملاء',{views:[{state:'frozen',ySplit:1}]});
      const headers=['السنة','الشهر','اليوم','مرجع1','مرجع2','مرجع3','رقم المشروع','رقم الاسكتش','الإمارة','المنطقة','المالك','الهاتف','المصدر','من طرف','المسؤول','وصف المشروع','النوع الرئيسي','النوع الفرعي','حالة العمل','المهندس','ملاحظات المتابعة','المطلوب','التصنيف','سبب الإغلاق','الملاحظات','آخر تواصل','الموعد القادم','حقل إضافي1','حقل إضافي2','حقل إضافي3','موعد التسليم','حقل إضافي4','حقل إضافي5','حقل إضافي6','حقل إضافي7','حقل إضافي8','أيام التأخير','المتابعة','نوع السجل'];
      ws.columns=headers.map(h=>({header:h,width:18}));ws.getRow(1).height=28;
      ws.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF132A46'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={horizontal:'right'};});
      ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(db.leads.length+1,1),column:39}};
      for(const col of [4,5,6,21,28,29,30,32,33,34,35,36])ws.getColumn(col).hidden=true;
      /* ب) نكتب بيانات الشركة الحالية */
      db.leads.forEach((l,i)=>{
        const c=db.clients.find(x=>x.id===l.clientId)||{};
        const r=i+2, row=ws.getRow(r);
        const d=l.createdAt?new Date(l.createdAt):null;
        row.getCell(1).value =d?d.getUTCFullYear():'';
        row.getCell(2).value =d?MONTHS_EN[d.getUTCMonth()]:'';
        row.getCell(3).value =d?d.getUTCDate():'';
        row.getCell(7).value =l.projectNo?(Number(l.projectNo)||l.projectNo):'اسكتش';
        row.getCell(8).value =l.sketchNo?(Number(l.sketchNo)||l.sketchNo):'';
        row.getCell(9).value =l.emirate||'';
        row.getCell(10).value=l.area||'';
        row.getCell(11).value=c.name||'';
        row.getCell(12).value=String(c.phone||'');
        row.getCell(13).value=c.source||'';
        row.getCell(14).value=c.refBy||'';
        row.getCell(15).value=uName(db,l.ownerId)||'';
        row.getCell(16).value=l.desc||'';
        row.getCell(17).value=l.mainType||'';
        row.getCell(18).value=l.subType||'';
        row.getCell(19).value=l.workst||'';
        row.getCell(20).value=uName(db,l.engineerId)||'';
        row.getCell(22).value=l.required||'';
        row.getCell(23).value=gradeOf(l.grade).l||'';
        row.getCell(24).value=l.lossReason||'';
        row.getCell(25).value=l.notes||'';
        row.getCell(26).value=/^\d{4}-\d{2}-\d{2}$/.test(l.lastDate||'')?new Date(l.lastDate+'T12:00:00Z'):'';row.getCell(26).numFmt='yyyy-mm-dd';
        row.getCell(27).value=/^\d{4}-\d{2}-\d{2}$/.test(l.nextDate||'')?new Date(l.nextDate+'T12:00:00Z'):'';row.getCell(27).numFmt='yyyy-mm-dd';
        row.getCell(31).value=/^\d{4}-\d{2}-\d{2}$/.test(l.deliverDate||'')?new Date(l.deliverDate+'T12:00:00Z'):'';row.getCell(31).numFmt='yyyy-mm-dd';
        /* لو السجل خارج نطاق القالب الأصلي (٣٠٠ صف)، نضيف نفس فورمولات الأعمدة الآلية */
        {
          row.getCell(37).value={formula:akF(r)};
          row.getCell(38).value={formula:alF(r)};
          row.getCell(39).value={formula:amF(r)};
        }
      });
      const out=await wb.xlsx.writeBuffer();
      const b=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const a=document.createElement('a');a.href=URL.createObjectURL(b);
      a.download='NITAQ_CRM_'+todayISO()+'.xlsx';a.click();
      toast('تم تصدير جدول Excel من البيانات الحالية فقط');
    }catch(e){console.error(e);toast('حصل خطأ في تصدير الإكسل — جرّب تاني')}
  };
  const imp=e=>{const f=e.target.files[0];if(!f)return;if(f.size>20*1024*1024)return toast('الملف أكبر من20ميجابايت');const r=new FileReader();
    r.onload=()=>{try{
      const result=NitaqCrmSafety.mergeImport(db,JSON.parse(r.result,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('مفتاح غير آمن');return v}));
      if(!confirm('إضافة '+result.added+' سجل ناقص فقط؟ المستخدمون والصلاحيات والسجلات الحالية لن تتغير.'))return;
      setDb(result.db,'إضافة سجلات ناقصة من نسخة');toast('تمت إضافة '+result.added+' سجل؛ انتظر تأكيد الحفظ');
    }catch(x){toast(x.message||'ملف غير صالح')}};r.readAsText(f)};

  return <div className="wrap">
    <div className="card" style={{marginBottom:14}}>
      <div className="card-h"><span className="dot"/><h3>الربط السحابي (Supabase)</h3></div>
      <div style={{padding:16}}>
        <div className="hint" style={{marginBottom:12}}>
          الحالة دلوقتي: <b>{inCloud?'متصل — البيانات مشتركة ومتزامنة لحظياً':'غير متصل — النظام شغّال محلياً على الجهاز'}</b>
        </div>
        {inCloud&&<>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:6}}>
            <button className="btn ghost" onClick={recoverAndPush} disabled={pushBusy}>
              {pushBusy?'جارٍ الرفع…':'استرجاع نسخة الجهاز القديمة ورفعها للسحابة'}</button>
            <button className="btn gold" onClick={pushAll} disabled={pushBusy}>
              {pushBusy?'جارٍ الرفع…':'رفع البيانات الظاهرة دلوقتي للسحابة'}</button>
          </div>
          {pushProg&&<div className="hint">اترفع {pushProg.done} من {pushProg.total}</div>}
          <div className="hint" style={{marginTop:6}}>
            لو العملاء ظهروا فاضيين بعد أول ربط بالسحابة، ده لأن قاعدة البيانات الجديدة بدأت فاضية —
            بياناتك القديمة لسه محفوظة بأمان على الجهاز ده. استخدم زرار "استرجاع نسخة الجهاز القديمة"
            عشان تجيبها وترفعها. الزرار التاني بيرفع بس اللي ظاهر على الشاشة دلوقتي.
          </div>
        </>}
        {!inCloud&&<>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',marginBottom:10}}>
            <Field label="Project URL">
              <input className="in en" placeholder="https://xxxx.supabase.co" value={url} onChange={e=>setUrl(e.target.value)}/></Field>
            <Field label="anon / publishable key">
              <input className="in en" placeholder="sb_publishable_…" value={key} onChange={e=>setKey(e.target.value)}/></Field>
          </div>
          <button className="btn gold" onClick={saveCfg}>حفظ والاتصال</button>
          <div className="hint" style={{marginTop:10}}>
            تلاقيهم في Supabase Dashboard ← Settings ← API. لازم تكون شغّلت ملف
            <code style={{margin:'0 4px'}}>nitaq_crm_supabase_schema.sql</code> مرة واحدة في الـSQL Editor الأول.
          </div>
        </>}
      </div>
    </div>
    <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))'}}>
      <div className="card"><div className="card-h"><span className="dot"/><h3>النسخ الاحتياطي</h3></div>
        <div style={{padding:16}}>
          {badKeys&&badKeys.length>0&&<div className="warn" style={{marginBottom:12}}>
            ◆ مفتاح تخزين تالف اتصلّح عند التشغيل: <b>{badKeys.map(k=>SLICE_AR[k]).join(' · ')}</b>.
            البيانات اللي كانت فيه اتفضّت — راجعها واسترجع نسخة لو ناقصة.
          </div>}
          <div className="hint" style={{marginBottom:12}}>حالة التخزين: <b>{mode}</b>. صدّر JSON آخر كل يوم شغل.</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn gold" onClick={exportJSON}>تصدير نسخة كاملة (JSON)</button>
            <button className="btn ghost" onClick={exportXLSX}>تصدير Excel</button>
            <button className="btn ghost" onClick={exportCSV}>تصدير جدول (CSV)</button>
            <button className="btn ghost" onClick={()=>fileRef.current.click()}>استرجاع نسخة</button>
            <input type="file" accept=".json" ref={fileRef} style={{display:'none'}} onChange={imp}/>
          </div></div></div>
      <div className="card"><div className="card-h"><h3>حماية البيانات المشتركة</h3></div><div style={{padding:16}}>الاسترجاع يضيف السجلات الناقصة فقط. لإلغاء مشروع استخدم إجراء المشروع؛ لا يوجد مسح جماعي من هذه الشاشة.</div></div>

    </div></div>;
}

/* ============ التطبيق ============ */
const NAV=[{g:'التشغيل اليومي'},
 {id:'today',l:'يومي',ic:'◈'},{id:'records',l:'سجل العملاء',ic:'▤'},{id:'archive',l:'الأرشيف',ic:'⛃'},{id:'clients',l:'العملاء',ic:'◎',p:'clients'},{id:'tasks',l:'المهام',ic:'✓'},{id:'timer',l:'أوقات العمل',ic:'⏱',cloud:true},
 {g:'القرار'},{id:'dash',l:'لوحة التحكم',ic:'◆',p:'dash'},{id:'reports',l:'التقارير',ic:'◇',p:'reports'},
 {g:'الإعداد'},{id:'groups',l:'ربط الجروبات',ic:'✆',p:'groups'},{id:'users',l:'المستخدمون',ic:'◍',owner:true},
 {id:'audit',l:'سجل التغييرات',ic:'⟲'},{id:'lookups',l:'القوائم',ic:'≡',p:'lookups'},{id:'data',l:'البيانات والنسخ',ic:'⇪',p:'data'}];
const TITLES={today:['يومي','المتأخر · اليوم · التسليمات · المتابعة'],
 records:['سجل العملاء','كل الاسكتشات والمشاريع في مكان واحد'],clients:['العملاء','عميل واحد وكل اسكتشاته'],
 archive:['الأرشيف','السجلات اللي حالتها Done'],
 tasks:['المهام','مهام المهندسين ومواعيد تسليمها'],
 dash:['لوحة التحكم','صورة الشغل دلوقتي'],
 users:['المستخدمون والصلاحيات','مين يشوف إيه ومين يعمل إيه'],reports:['التقارير','الشغل بيتحوّل فين وبيضيع فين'],
 groups:['ربط الجروبات','اربط كل عميل بجروب الواتساب بتاعه مرة واحدة'],
 audit:['سجل التغييرات','كل خانة اتغيّرت — مين ومتى وإيه كانت قبل كده'],
 lookups:['القوائم','قيم كل الاختيارات'],data:['البيانات والنسخ','تصدير واسترجاع'],
 timer:['أوقات العمل','كل مهندس اشتغل قد إيه وعلى أنهي عميل']};

/* ================= تتبّع وقت العمل (عدّاد CRM) =================
   ساعة الخادم هي المرجع، وجلسة واحدة شغّالة لكل مستخدم بحدّ أقصى 12 ساعة.
   العدّاد معزول تمامًا عن مسار حفظ السجلات (nitaq_crm_apply_v2) فلا يتعارض أبدًا مع تعديلات العملاء. */
const CRM_TIMER_KINDS=['عمل','اتصال','زيارة','عمل مكتبي','متابعة'];
const crmDur=sec=>{sec=Math.max(0,Math.floor(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;const p=n=>String(n).padStart(2,'0');return (h?h+':':'')+(h?p(m):String(m))+':'+p(s);};
const crmHours=sec=>(Math.max(0,sec||0)/3600).toFixed(2);
const crmTimerErr=e=>{const m=((e&&(e.message||e.hint))||'')+'';
 if(/No running timer/.test(m))return 'مفيش عدّاد شغّال';
 if(/Lead access denied/.test(m))return 'مش مصرّح لك بتتبّع السجل ده';
 if(/Lead not found/.test(m))return 'السجل مش موجود';
 if(/CRM access denied|Authentication/.test(m))return 'الدخول غير مصرّح';
 if(/exceed the cap/.test(m))return 'المدة أطول من الحد المسموح (12 ساعة)';
 if(/future/.test(m))return 'الوقت لا يصح أن يكون في المستقبل';
 if(/Invalid times|Invalid timer|Note too long/.test(m))return 'بيانات غير صحيحة';
 return 'تعذّرت العملية — جرّب تاني';};

// Shared timer state (current running session, elapsed, start/stop). Server clock is authoritative.
function useCrmTimer(sb){
 const [cur,setCur]=useState(undefined);            // undefined=loading · null=none · object=running
 const skewRef=useRef(0);                           // server_now − client_now (ms)
 const [,setTick]=useState(0);
 const liveRef=useRef(true), sbRef=useRef(sb); sbRef.current=sb;
 useEffect(()=>()=>{liveRef.current=false;},[]);
 // mk builds the request so the RPC name literal stays inside .rpc('...') for the deployment contract scanner.
 const call=mk=>{const client=sbRef.current;if(!client)return Promise.reject(new Error('no cloud'));
   return mk(client).then(({data,error})=>{if(error)throw error;return data;});};
 const reload=()=>call(c=>c.rpc('nitaq_crm_timer_current_v1',{})).then(d=>{if(!liveRef.current)return;
     if(d&&d.server_now)skewRef.current=new Date(d.server_now).getTime()-Date.now();setCur(d||null);})
   .catch(()=>{if(liveRef.current)setCur(null);});
 useEffect(()=>{reload();},[sb]);
 useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1000);
   const r=setInterval(()=>{if(!document.hidden)reload();},60000);
   return()=>{clearInterval(t);clearInterval(r);};},[sb]);
 const elapsed=cur?Math.max(0,(Date.now()+skewRef.current-new Date(cur.started_at).getTime())/1000):0;
 const start=(leadId,kind)=>call(c=>c.rpc('nitaq_crm_timer_start_v1',{p_lead:leadId,p_kind:kind||'عمل',p_note:null})).then(d=>{skewRef.current=0;setCur(d);return d;});
 const stop=()=>call(c=>c.rpc('nitaq_crm_timer_stop_v1',{p_id:null})).then(()=>{setCur(null);});
 return {cur,elapsed,start,stop,reload,call};
}

// Floating banner (portal) visible across every view while a session runs.
function CrmTimerBanner({timer,go}){
 const l=timer.cur; if(!l)return null;
 return ReactDOM.createPortal(
  <div style={{position:'fixed',insetInlineStart:16,bottom:16,zIndex:60,display:'flex',alignItems:'center',gap:10,
     background:'#1a7f37',color:'#fff',borderRadius:12,padding:'10px 14px',boxShadow:'0 6px 24px rgba(0,0,0,.25)'}}>
    <span style={{fontSize:18}}>⏱</span>
    <div style={{lineHeight:1.25}}>
      <div style={{fontWeight:700,fontVariantNumeric:'tabular-nums',fontSize:16,direction:'ltr',textAlign:'right'}}>{crmDur(timer.elapsed)}</div>
      <div style={{fontSize:11,opacity:.9}}>{(l.client_name||l.lead_name||'سجل')+' · '+(l.kind||'عمل')}</div>
    </div>
    <button onClick={()=>go('timer')} style={{background:'rgba(255,255,255,.18)',color:'#fff',border:0,borderRadius:8,padding:'6px 10px',cursor:'pointer',font:'inherit'}}>فتح</button>
    <button onClick={()=>timer.stop().catch(()=>{})} style={{background:'#fff',color:'#1a7f37',border:0,borderRadius:8,padding:'6px 10px',cursor:'pointer',fontWeight:700,font:'inherit'}}>إيقاف</button>
  </div>, document.body);
}

// Full timer screen: start controls, live session, and the per-engineer × client/lead report.
function CrmTimerPanel({timer,me,db,toast}){
 const [leadId,setLeadId]=useState('');
 const [kind,setKind]=useState('عمل');
 const [report,setReport]=useState(null);
 const [busy,setBusy]=useState(false);
 const [from,setFrom]=useState(''),[to,setTo]=useState('');
 const liveRef=useRef(true);
 useEffect(()=>()=>{liveRef.current=false;},[]);

 const leads=(db.leads||[]).filter(l=>me&&isMine(me,l)).map(l=>({l,label:(((db.clients||[]).find(c=>c.id===l.clientId)||{}).name||'—')+' · '+(l.projectNo?'مشروع '+l.projectNo:'اسكتش '+l.sketchNo)})).sort((a,b)=>a.label.localeCompare(b.label,'ar'));

 const loadReport=()=>{setBusy(true);
   timer.call(c=>c.rpc('nitaq_crm_time_report_v1',{p_lead:null,p_from:from||null,p_to:to||null}))
     .then(d=>{if(liveRef.current)setReport(d);}).catch(e=>toast(crmTimerErr(e)))
     .then(()=>{if(liveRef.current)setBusy(false);});};
 useEffect(()=>{loadReport();},[]);

 const doStart=()=>{ if(!leadId)return toast('اختر السجل الأول');
   timer.start(leadId,kind).then(()=>toast('بدأ العدّاد')).catch(e=>toast(crmTimerErr(e))); };
 const doStop=()=>timer.stop().then(()=>{toast('اتوقف العدّاد');loadReport();}).catch(e=>toast(crmTimerErr(e)));
 const del=id=>{ if(!window.confirm('حذف هذه الجلسة نهائيًا؟'))return;
   timer.call(c=>c.rpc('nitaq_crm_timer_delete_v1',{p_id:id})).then(()=>{toast('اتحذفت');loadReport();}).catch(e=>toast(crmTimerErr(e))); };
 const pad=n=>String(n).padStart(2,'0');
 const localStr=d=>{d=new Date(d);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
 const adjust=r=>{
   const s=window.prompt('بداية الجلسة (YYYY-MM-DD HH:MM)',localStr(r.started_at)); if(s===null)return;
   const en=window.prompt('نهاية الجلسة (YYYY-MM-DD HH:MM)',localStr(r.ended_at||Date.now())); if(en===null)return;
   const ps=new Date(s.replace(' ','T')),pe=new Date(en.replace(' ','T'));
   if(isNaN(ps.getTime())||isNaN(pe.getTime()))return toast('صيغة وقت غير صحيحة');
   timer.call(c=>c.rpc('nitaq_crm_timer_adjust_v1',{p_id:r.id,p_started:ps.toISOString(),p_ended:pe.toISOString(),p_note:null}))
     .then(()=>{toast('اتعدّلت');loadReport();}).catch(e=>toast(crmTimerErr(e)));
 };
 const totals=report?report.totals:[];
 const seeAll=!!(report&&report.see_all);
 const grand=totals.reduce((a,t)=>a+Number(t.seconds||0),0);
 const running=timer.cur;
 const exportCsv=()=>{
   const head=(seeAll?['المهندس']:[]).concat(['العميل','المشروع','النوع','جلسات','ساعات']);
   const rows=totals.map(t=>(seeAll?[t.engineer_name]:[]).concat([t.client_name||'',t.lead_name||'',t.kind,t.sessions,crmHours(t.seconds)]));
   const csv='﻿'+[head].concat(rows).map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='اوقات-العمل.csv';a.click();URL.revokeObjectURL(url);
 };

 return <>
   <div className="card" style={{marginBottom:14}}><div style={{padding:16}}>
     {running
      ? <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <span className="num" style={{fontSize:24,fontVariantNumeric:'tabular-nums'}}>{crmDur(timer.elapsed)}</span>
          <span>شغّال على <b>{running.client_name||running.lead_name||'سجل'}</b> · {running.kind}</span>
          <span className="grow"/>
          <button className="btn" onClick={doStop}>■ إيقاف العدّاد</button>
        </div>
      : <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
          <label>السجل (العميل / المشروع)<br/>
            <select className="in" value={leadId} onChange={e=>setLeadId(e.target.value)} style={{minWidth:260}}>
              <option value="">— اختر —</option>
              {leads.map(x=><option key={x.l.id} value={x.l.id}>{x.label}</option>)}
            </select></label>
          <label>نوع العمل<br/>
            <select className="in" value={kind} onChange={e=>setKind(e.target.value)}>
              {CRM_TIMER_KINDS.map(k=><option key={k} value={k}>{k}</option>)}
            </select></label>
          <button className="btn gold" onClick={doStart}>▶ ابدأ العمل</button>
        </div>}
   </div></div>

   <div className="card"><div style={{padding:16}}>
     <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
       <h3 style={{margin:0}}>{seeAll?'أوقات كل المهندسين':'أوقاتي'}</h3><span className="grow"/>
       <label style={{fontSize:12}}>من <input className="in" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
       <label style={{fontSize:12}}>إلى <input className="in" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
       <button className="btn ghost sm" onClick={loadReport} disabled={busy}>تحديث</button>
       <button className="btn ghost sm" onClick={exportCsv} disabled={!totals.length}>CSV</button>
     </div>
     <div className="scroll"><table><thead><tr>
       {seeAll&&<th>المهندس</th>}<th>العميل / المشروع</th><th>النوع</th><th>جلسات</th><th>ساعات</th>
     </tr></thead><tbody>
       {totals.length?totals.map((t,i)=><tr key={i}>
         {seeAll&&<td>{t.engineer_name}</td>}
         <td>{(t.client_name||'—')+(t.lead_name&&t.lead_name!==t.client_name?' · '+t.lead_name:'')}</td>
         <td>{t.kind}{t.running&&<span className="pill"> شغّال</span>}</td>
         <td className="num">{t.sessions}</td>
         <td className="num">{crmHours(t.seconds)}</td>
       </tr>):<tr><td colSpan={seeAll?5:4} className="empty">مفيش أوقات مسجّلة بعد</td></tr>}
     </tbody>{totals.length?<tfoot><tr>
       <td colSpan={seeAll?4:3}><b>الإجمالي</b></td><td className="num"><b>{crmHours(grand)} ساعة</b></td>
     </tr></tfoot>:null}</table></div>
   </div></div>

   {report&&report.recent&&report.recent.length>0&&<div className="card" style={{marginTop:14}}><div style={{padding:16}}>
     <h3 style={{marginTop:0}}>آخر الجلسات</h3>
     <div className="scroll"><table><thead><tr>
       {seeAll&&<th>المهندس</th>}<th>العميل / المشروع</th><th>النوع</th><th>البداية</th><th>المدة</th><th></th>
     </tr></thead><tbody>
       {report.recent.slice(0,80).map(r=><tr key={r.id}>
         {seeAll&&<td>{r.engineer_name}</td>}
         <td>{(r.client_name||'—')+(r.lead_name&&r.lead_name!==r.client_name?' · '+r.lead_name:'')}</td>
         <td>{r.kind}{r.auto_closed&&<span className="rsmall"> (أُغلق تلقائيًا)</span>}</td>
         <td className="rsmall">{new Date(r.started_at).toLocaleString('ar-EG')}</td>
         <td className="num">{crmDur(r.seconds)}</td>
         <td style={{whiteSpace:'nowrap'}}>
           <button className="btn ghost sm" onClick={()=>adjust(r)}>تعديل</button>
           <button className="btn ghost sm" onClick={()=>del(r.id)}>حذف</button>
         </td>
       </tr>)}
     </tbody></table></div>
   </div></div>}
 </>;
}

function App(){
  /* ============ حالة الربط السحابي ============
     status: idle → connecting → (auth | ready | local | error) */
  const [cloud,setCloud]=useState({status:'idle',sb:null,profile:null,session:null,err:''});
  const [sbCfg,setSbCfg]=useState(()=>loadSbConfig());
  /* آخر نسخة اتبعتت للسحابة من كل سجل — بنقارن بيها قبل أي كتابة جديدة */
  const cloudSyncedRef=useRef(new Map());
  const usersSyncedRef=useRef(new Map());
  const settingsSyncedRef=useRef('');
  const idsRef=useRef({clients:new Set(),leads:new Set(),inter:new Set(),audit:new Set()});
  const pendingRef=useRef(new Map()),pendingActorRef=useRef(null),flushBusyRef=useRef(false),batchRef=useRef(null),syncBlockedRef=useRef(false);
  const journalRef=useRef(null),journalOpenRef=useRef(null);
  const openCrmJournal=async actor=>{
    if(journalRef.current?.actor===actor)return;
    if(journalOpenRef.current?.actor===actor)return journalOpenRef.current.promise;
    if(pendingRef.current.size&&pendingActorRef.current!==actor)throw Error('ادخل بالحساب الذي لديه التعديلات المعلقة');
    journalRef.current?.release();journalRef.current=null;
    const promise=NitaqCrmJournal.open(localStorage,sbCfg.url,actor,navigator.locks).then(journal=>{if(journalOpenRef.current?.promise!==promise){journal.release();throw Error('تغيرت جلسة الحفظ؛ أعد الاتصال بالحساب.');}journalRef.current=journal;});
    journalOpenRef.current={actor,promise};
    try{await promise;}finally{if(journalOpenRef.current?.promise===promise)journalOpenRef.current=null;}
  };
  const writeCrmJournal=(queue=pendingRef.current,batch=batchRef.current,actor=pendingActorRef.current)=>{
    if(!actor||journalRef.current?.actor!==actor)throw Error('سجل الحفظ غير جاهز؛ انتظر اتصال الحساب.');
    journalRef.current.write(queue,batch);
  };
  const reloadTmr=useRef(null);
  const hadDrop=useRef(false);

  /* قراءة محلية احتياطية — بتتستخدم بس لو السحابة مش متاحة (سكريبت محجوب مثلاً) */
  const boot=useRef(null);
  if(!boot.current) boot.current=store.load();
  const [db,setDb]=useState(()=>boot.current.db||seed());
  const [meId,setMeId]=useState(()=>{const d=boot.current.db;return (d&&d.ui&&d.ui.me)||null});
  const [view,setView]=useState('today');
  const timer=useCrmTimer(cloud.status==='ready'?cloud.sb:null);
  const [drawer,setDrawer]=useState(null),[call,setCall]=useState(null);
  const [msg,setMsg]=useState(null);
  /* 'saved' | 'saving' | 'fail'  ·  fail = أسماء الشرائح اللي فشلت */
  const [sv,setSv]=useState({state:'saved',fail:[]});
  const undoRef=useRef([]);
  const [undoN,setUndoN]=useState(0);
  const [pDlg,setPDlg]=useState(false),[pCfg,setPCfg]=useState(null),[pRec,setPRec]=useState(null),[pCli,setPCli]=useState(null);
  /* الحفظ مؤجّل 600 م.ث بعد آخر تعديل — مش مع كل ضغطة.
     ولازم flush عند إخفاء الصفحة، وإلا التأجيل نفسه بيفتح نافذة فقدان جديدة. */
  const dbRef=useRef(db); dbRef.current=db;
  const cloudRef=useRef(cloud); cloudRef.current=cloud;
  const tmr=useRef(null);
  const first=useRef(true);

  /* بتجيب كل صفوف الجدول على دفعات — عشان أمر select('*') لوحده بيتوقف عند حد أقصى
     (1000 صف افتراضياً في Supabase) ومش بيرجّع خطأ لو فيه صفوف زيادة. */
  const fetchAllPages=async(sb,table,page)=>{
    const PAGE=Math.min(page||500,500),out=[],seen=new Set();let after=null,total=null;
    for(let n=0;n<2000;n++){
      let q=sb.from(table).select('*',total===null?{count:'exact'}:undefined).order('id',{ascending:true}).limit(PAGE);
      if(after!==null)q=q.gt('id',after);
      const {data,error,count}=await q;if(error)return {error};
      if(total===null){if(!Number.isSafeInteger(count)||count<0)return {error:Error('تعذر تأكيد عدد السجلات')};total=count;}
      for(const row of data||[]){if(!row.id||seen.has(row.id))return {error:Error('قراءة غير متسقة؛ أعد المحاولة')};seen.add(row.id);out.push(row);}
      if(out.length===total)return {data:out};
      if(!data?.length||out.length>total)return {error:Error('تغيرت السجلات أثناء التحميل؛ أعد القراءة')};
      after=data.at(-1).id;
    }
    return {error:Error('عدد صفحات أكبر من المسموح')};
  };

  /* تجميع بروفايلات + سجلات السحابة في db واحد، وتحديث مراجع المزامنة */
  const cloudBootstrap=async(sb)=>{
    const capability=await sb.rpc('nitaq_crm_capabilities_v2');
    if(capability.error||capability.data?.version!==2)return {ok:false,error:{message:'قاعدة CRM تحتاج تحديث الحفظ الآمن؛ لم نغيّر بياناتك'}};

    const [pr,rr]=await Promise.all([
      fetchAllPages(sb,'nitaq_crm_profiles'),
      fetchAllPages(sb,'nitaq_crm_records')
    ]);
    if(pr.error||rr.error) return {ok:false,error:pr.error||rr.error};
    const profiles=pr.data||[], records=rr.data||[];
    const syncedMap=new Map();
    records.forEach(r=>{ if(r.entity!=='settings') syncedMap.set(r.entity+':'+r.id, JSON.stringify(r.data)) });
    const uMap=new Map();
    profiles.forEach(p=>uMap.set(p.id, JSON.stringify({name:p.name,role:p.role,perms:p.perms,active:p.active})));
    const db=cloudRowsToDb(records, profiles);
    return {ok:true, db, profiles, syncedMap, uMap,settingsDoc:records.find(r=>r.entity==='settings'&&r.id==='settings')?.data||null};
  };

  const applyCloudBoot=(boot, keepUi,restoreActor=null)=>{
    if(pendingRef.current.size)return;
    const recovery=restoreActor?journalRef.current.read():null;
    cloudSyncedRef.current=boot.syncedMap;
    usersSyncedRef.current=boot.uMap;
    settingsSyncedRef.current=boot.settingsDoc?JSON.stringify(boot.settingsDoc):'';
    idsRef.current={
      clients:new Set(boot.db.clients.map(x=>x.id)),
      leads:new Set(boot.db.leads.map(x=>x.id)),
      inter:new Set(boot.db.inter.map(x=>x.id)),
      audit:new Set(boot.db.audit.map(x=>x.aid))
    };
    let recovered=boot.db;
    if(recovery?.items.length){
      recovered=NitaqCrmJournal.overlay(boot.db,recovery.items);
      pendingRef.current=new Map(recovery.items.map(item=>[item.entity+':'+item.id,item]));
      pendingActorRef.current=restoreActor;batchRef.current=recovery.batch;
      setSv({state:'saving',fail:[],message:'تم استرجاع تعديلات غير مؤكدة من الجهاز؛ جارٍ تأكيد حفظها'});
    }
    dbRef.current={...recovered,ui:keepUi?(dbRef.current.ui||{}):{}};setDb(dbRef.current);
  };

  const findMyProfile=(profiles, userId)=>(profiles||[]).find(p=>p.auth_user_id===userId)||null;

  /* تحديث سطر واحد بس محلياً لما حد تاني يعدّل حاجة — بدل ما نعيد تحميل الجدول كله.
     ده اللي بيوفّر البيانات المنقولة وبيخلّي الأداء ثابت مهما كبر حجم البيانات. */
  const applyRecordChange=(payload)=>{
    const {eventType,new:nr,old:or}=payload;
    const rowId=nr?.id||or?.id;
    if([...pendingRef.current.values()].some(item=>item.id===rowId))return;

    if(eventType==='DELETE'){
      const id=or&&or.id; if(!id) return;
      ['clients','leads','inter','audit','tasks'].forEach(k=>{ if(idsRef.current[k]) idsRef.current[k].delete(id) });
      cloudSyncedRef.current.delete('client:'+id);
      cloudSyncedRef.current.delete('lead:'+id);
      cloudSyncedRef.current.delete('inter:'+id);
      cloudSyncedRef.current.delete('audit:'+id);
      setDb(d=>({...d,
        clients:d.clients.filter(x=>x.id!==id),
        leads:d.leads.filter(x=>x.id!==id),
        inter:d.inter.filter(x=>x.id!==id),
        audit:d.audit.filter(x=>x.aid!==id),tasks:(d.tasks||[]).filter(x=>x.id!==id)}));
      return;
    }
    if(!nr) return;
    const entity=nr.entity, data=nr.data;
    if(entity==='settings'){
      if(data){
        settingsSyncedRef.current=JSON.stringify(data);
        setDb(d=>({...d, lookups:data.lookups||d.lookups, projSeq:data.projSeq!=null?data.projSeq:d.projSeq,
          tasks:d.tasks||[]}));
      }
      return;
    }
    const key=ENT2KEY[entity]; if(!key||!data) return;
    const idField=entity==='audit'?'aid':'id';
    const rid=data[idField]; if(rid==null) return;
    cloudSyncedRef.current.set(entity+':'+rid, JSON.stringify(data));
    if(!idsRef.current[key]) idsRef.current[key]=new Set();
    idsRef.current[key].add(rid);
    setDb(d=>{
      const arr=d[key]||[];
      const idx=arr.findIndex(x=>x[idField]===rid);
      const next=idx>=0?arr.map((x,i)=>i===idx?data:x):[...arr,data];
      return {...d,[key]:next};
    });
  };
  const applyProfileChange=(payload)=>{
    if(pendingRef.current.has('profile:'+(payload.new?.id||payload.old?.id)))return;

    const {eventType,new:nr,old:or}=payload;
    if(eventType==='DELETE'){
      const id=or&&or.id; if(!id) return;
      usersSyncedRef.current.delete(id);
      setDb(d=>({...d, users:(d.users||[]).filter(u=>u.id!==id)}));
      return;
    }
    if(!nr) return;
    const u={id:nr.id,name:nr.name,email:nr.email||'',authId:nr.auth_user_id||'',
      role:nr.role||'engineer',perms:nr.perms||{...BASE_PERMS},active:nr.active!==false};
    usersSyncedRef.current.set(u.id, JSON.stringify({name:u.name,role:u.role,perms:u.perms,active:u.active}));
    setDb(d=>{
      const arr=d.users||[];
      const idx=arr.findIndex(x=>x.id===u.id);
      const next=idx>=0?arr.map((x,i)=>i===idx?u:x):[...arr,u];
      return {...d, users:next};
    });
    setCloud(c=>(c.profile&&c.profile.id===u.id)?{...c, profile:{...c.profile,...nr}}:c);
  };

  const handleAuthEvent=async(event,sess,sb)=>{
    try{
      if(event==='SIGNED_IN'&&sess){
        await openCrmJournal(sess.user.id);
        if(pendingRef.current.size){
          if(sess.user.id!==pendingActorRef.current){
            syncBlockedRef.current=true;setCloud(c=>({...c,status:'auth',err:'ادخل بالحساب الذي لديه التعديلات المعلقة'}));return;
          }
          syncBlockedRef.current=false;setCloud(c=>({...c,status:'ready',session:sess}));
          await cloudFlush();if(!pendingRef.current.size)scheduleReload(sb);return;
        }
        const boot=await cloudBootstrap(sb);
        if(!boot.ok){setCloud(c=>({...c,status:'error',err:String(boot.error?.message||boot.error)}));return;}
        applyCloudBoot(boot,false,sess.user.id);setCloud(c=>({...c,status:'ready',session:sess,profile:findMyProfile(boot.profiles,sess.user.id)}));
      }
      if(event==='SIGNED_OUT'){
        if(pendingRef.current.size){
          syncBlockedRef.current=true;setSv({state:'fail',fail:['السحابة'],message:'انتهت الجلسة؛ سجّل الدخول بنفس الحساب لإكمال الحفظ'});
          setCloud(c=>({...c,status:'auth',session:null}));return;
        }
        journalRef.current?.release();journalRef.current=null;journalOpenRef.current=null;
        cloudSyncedRef.current=new Map();usersSyncedRef.current=new Map();settingsSyncedRef.current='';setDb(seed());
        setCloud(c=>({...c,status:'auth',session:null,profile:null}));
      }
    }catch(error){setCloud(c=>({...c,status:'auth',err:error.message}));}
  };

  const scheduleReload=(sb)=>{
    clearTimeout(reloadTmr.current);
    reloadTmr.current=setTimeout(async()=>{
      if(pendingRef.current.size)return;
      const boot=await cloudBootstrap(sb);
      if(!boot.ok) return;
      applyCloudBoot(boot, true);
      const {data:{user}}=await sb.auth.getUser();
      setCloud(c=>({...c, profile:findMyProfile(boot.profiles, user&&user.id)}));
    },700);
  };

  /* الاتصال بالسحابة + تسجيل الدخول + الاشتراك اللحظي — مرة واحدة عند الإقلاع */
  useEffect(()=>{
    let cancelled=false, channel=null, authSub=null;
    (async()=>{
      const sb=getSb(sbCfg);
      if(!sb){ setCloud(c=>({...c,status:'local'})); return; }
      setCloud(c=>({...c,status:'connecting',sb}));
      const {data:{session}}=await sb.auth.getSession();
      if(cancelled) return;
      if(!session){ setCloud(c=>({...c,status:'auth',sb})); }
      else{
        try{await openCrmJournal(session.user.id);}catch(error){setCloud(c=>({...c,status:'error',sb,err:error.message}));return;}
        let boot=await cloudBootstrap(sb);
        /* لحظة تسجيل حساب جديد — التريجر بيعمل البروفايل، ممكن ياخد لحظة */
        for(let i=0;i<4&&boot.ok&&!findMyProfile(boot.profiles,session.user.id);i++){
          await new Promise(r=>setTimeout(r,500));
          boot=await cloudBootstrap(sb);
        }
        if(cancelled) return;
        if(!boot.ok){ setCloud(c=>({...c,status:'error',sb,err:String((boot.error&&boot.error.message)||boot.error)})); }
        else{
          try{applyCloudBoot(boot, false,session.user.id);}catch(error){setCloud(c=>({...c,status:'error',sb,err:error.message}));return;}
          setCloud(c=>({...c,status:'ready',sb,session,profile:findMyProfile(boot.profiles,session.user.id)}));
        }
      }
      channel=sb.channel('nitaq_crm_live')
        .on('postgres_changes',{event:'*',schema:'public',table:'nitaq_crm_records'},payload=>applyRecordChange(payload))
        .on('postgres_changes',{event:'*',schema:'public',table:'nitaq_crm_profiles'},payload=>applyProfileChange(payload))
        .subscribe(status=>{
          if(status==='SUBSCRIBED'){
            /* لو الاتصال كان اتقطع وبيرجع دلوقتي، نعمل تحميل كامل مرة واحدة تعويضي
               عشان أي تغيير حصل وقت الانقطاع ميضيعش — بعدها نرجع للتحديث الجزئي العادي */
            if(hadDrop.current){ hadDrop.current=false; scheduleReload(sb); }
          }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
            hadDrop.current=true;
          }
        });
      const sub=sb.auth.onAuthStateChange((event,sess)=>{
        // Do not await Supabase calls while the Auth callback holds its internal lock.
        setTimeout(()=>{void handleAuthEvent(event,sess,sb);},0);
      });
      authSub=sub&&sub.data&&sub.data.subscription;
    })();
    return ()=>{cancelled=true; clearTimeout(reloadTmr.current);
      if(channel&&cloudRef.current.sb) cloudRef.current.sb.removeChannel(channel);
      if(authSub) authSub.unsubscribe();journalRef.current?.release();journalRef.current=null;journalOpenRef.current=null;};
  },[]);

  const cloudFlush=async()=>{
    if(flushBusyRef.current||syncBlockedRef.current)return;
    const sb=cloudRef.current.sb;if(!sb)return;
    flushBusyRef.current=true;
    try{
      while(pendingRef.current.size){
        if(!batchRef.current)batchRef.current={id:crypto.randomUUID(),items:[...pendingRef.current.values()].slice(0,100)};
        writeCrmJournal();
        const batch=batchRef.current;
        await crmApplyBatch(sb,batch.items,batch.id,false,pendingActorRef.current);
        for(const item of batch.items){
          const key=item.entity+':'+item.id;
          if(item.entity==='profile')usersSyncedRef.current.set(item.id,JSON.stringify({name:item.after.name,role:item.after.role,perms:item.after.perms,active:item.after.active}));
          else if(item.entity==='settings')settingsSyncedRef.current=JSON.stringify(item.after);
          else if(item.after)cloudSyncedRef.current.set(key,JSON.stringify(item.after));else cloudSyncedRef.current.delete(key);
          const current=pendingRef.current.get(key);
          if(current?.revision===item.revision)pendingRef.current.delete(key);
          else if(current)pendingRef.current.set(key,{...current,before:item.after});
        }
        batchRef.current=null;
        writeCrmJournal();
      }
      pendingActorRef.current=null;setSv({state:'saved',fail:[]});
    }catch(error){
      if(error.definitive){batchRef.current=null;try{writeCrmJournal();}catch(storageError){error=storageError;}}
      setSv({state:'fail',fail:['السحابة'],message:error.message});
      // Retain the same request UUID on a lost reply; server receipts make retry safe.
    }finally{flushBusyRef.current=false;}
  };


  const downloadDraft=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(dbRef.current,null,2)],{type:'application/json'}));a.download='NITAQ_CRM_unsaved_'+todayISO()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const refreshAfterConflict=async()=>{
    downloadDraft();if(!confirm('تم تنزيل نسخة من تعديلاتك. تجاهل التعديلات غير المحفوظة واقرأ النسخة الحالية؟'))return;
    const boot=await cloudBootstrap(cloudRef.current.sb);if(!boot.ok)return toast('تعذرت القراءة؛ ما زالت تعديلاتك موجودة');
    writeCrmJournal(new Map(),null);
    pendingRef.current.clear();pendingActorRef.current=null;batchRef.current=null;syncBlockedRef.current=false;undoRef.current=[];setUndoN(0);applyCloudBoot(boot,true);setSv({state:'saved',fail:[]});
  };
  const flush=(force)=>{
    clearTimeout(tmr.current); tmr.current=null;
    if(cloudRef.current.status==='ready'){ cloudFlush(); return {ok:[],fail:[]}; }
    const r=store.save(dbRef.current,force);
    setSv(s=>{
      const st=r.fail.length?'fail':'saved', fl=r.fail;
      if(s.state===st&&s.fail.length===fl.length&&s.fail.every((x,i)=>x===fl[i])) return s;
      return {state:st,fail:fl};
    });
    return r;
  };

  useEffect(()=>{
    if(first.current){
      first.current=false;
      /* ترحيل من المفتاح القديم أو إصلاح مفتاح تالف — كتابة فورية مرة واحدة (وضع محلي بس) */
      if(boot.current&&boot.current.needSave&&cloud.status!=='ready') flush(true);
      return;
    }
    /* نفس المرجع = React بيلغي إعادة الرسم — فمفيش رندر زيادة مع كل تعديل */
    setSv(s=>s.state==='saving'?s:{state:'saving',fail:s.fail});
    clearTimeout(tmr.current);
    tmr.current=setTimeout(()=>flush(false),600);
    return ()=>clearTimeout(tmr.current);
  },[db]);

  useEffect(()=>{
    const onHide=()=>{ if(tmr.current) flush(false); };
    const protectClose=e=>{if(pendingRef.current.size){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protectClose);
    const onVis=()=>{ if(document.visibilityState==='hidden') onHide(); };
    window.addEventListener('pagehide',onHide);
    document.addEventListener('visibilitychange',onVis);
    return ()=>{window.removeEventListener('beforeunload',protectClose);window.removeEventListener('pagehide',onHide);
      document.removeEventListener('visibilitychange',onVis)};
  },[]);
  /* شبكة أمان — وضع محلي بس: لو البيانات فضلت بلا مستخدمين، النظام بينشئ مالك تلقائياً.
     في وضع السحابة الهوية بتيجي من نظام الدخول نفسه، فمفيش داعي لها (ولا مسموح تقنياً). */
  useEffect(()=>{
    if(cloud.status==='ready'||cloud.status==='connecting'||cloud.status==='auth') return;
    const us=db.users||[];
    if(!us.length||!us.some(u=>u.active!==false&&u.role==='owner')){
      const keep=us.filter(u=>u.id!=='u1');
      setDb({...db,users:[{id:'u1',name:'سيد',role:'owner',pin:'',perms:{},active:true},...keep]});
    }
  },[db.users,cloud.status]);
  const toast=(t,undoable)=>{const o={t,u:!!undoable,k:Date.now()};setMsg(o);
    setTimeout(()=>setMsg(m=>m&&m.k===o.k?null:m),undoable?6000:2400)};

  /* كل تعديل بيعدّي من هنا: بيتسجّل في مكدّس التراجع وفي سجل التغييرات */
  const baselineFor=change=>{
    if(change.entity==='profile')return change.before;
    if(change.entity==='settings')return settingsSyncedRef.current?JSON.parse(settingsSyncedRef.current):null;
    const raw=cloudSyncedRef.current.get(change.entity+':'+change.id);return raw?JSON.parse(raw):null;
  };
  const commit=(next,label,silent,noUndo=false)=>{
    const current=dbRef.current;
    if(cloudRef.current.status!=='ready'&&cloudRef.current.status!=='local'){toast('انتظر اتصال الحساب قبل التعديل');return false;}
    try{
      const edits=NitaqCrmSafety.delta(current,next).filter(c=>c.entity!=='audit');
      const changes=diffDb(current,next);
      const now=new Date().toISOString();
      const rows=changes.map(c=>({...c,aid:uid(),at:now,byId:me?.id||'',label:label||''}));
      next={...next,audit:[...(current.audit||[]),...rows]};
      if(cloudRef.current.status==='ready'){
        const actor=cloudRef.current.profile?.auth_user_id||cloudRef.current.session?.user?.id;
        if(!actor||pendingActorRef.current&&pendingActorRef.current!==actor)throw Error('تغير الحساب؛ أكد الحفظ بالحساب الأصلي');
        const planned=new Map(pendingRef.current);
        const all=[...edits,...rows.map(row=>({key:'audit',entity:'audit',id:row.aid,before:null,after:row}))];
        NitaqCrmSafety.enqueue(planned,all,baselineFor,new Set((batchRef.current?.items||[]).map(c=>c.entity+':'+c.id)));
        writeCrmJournal(planned,batchRef.current,actor);
        pendingRef.current=planned;pendingActorRef.current=actor;
      }
      if(edits.length&&!noUndo){undoRef.current=[...undoRef.current,{changes:edits,label}].slice(-UNDO_MAX);setUndoN(undoRef.current.length);}
      dbRef.current=next;setDb(next);
      if(!silent&&edits.length)toast(label||'جارٍ الحفظ',!noUndo);
      return true;
    }catch(error){toast(error.message);return false;}
  };
  const setDbC=(u,label,silent)=>commit(typeof u==='function'?u(dbRef.current):u,label,silent);
  const undo=()=>{
    const last=undoRef.current.at(-1);if(!last)return toast('لا يوجد تعديل للتراجع');
    try{
      const next=NitaqCrmSafety.inverse(dbRef.current,last.changes);
      if(commit(next,'تراجع عن: '+last.label,false,true)){undoRef.current.pop();setUndoN(undoRef.current.length);}
    }catch(error){toast(error.message);}
  };


  /* استرجاع قيمة واحدة من السجل */
  const revert=e=>{
    const key=e.t==='lead'?'leads':e.t==='client'?'clients':'users';
    commit({...db,[key]:db[key].map(x=>{
      if(x.id!==e.rid) return x;
      if(JSON.stringify(x[e.f])!==JSON.stringify(e.to))throw Error('الحقل تغير بعد هذه العملية؛ راجع القيمة الحالية أولًا');
      const n={...x,[e.f]:e.from};
      /* الاسترجاع تعديل زي أي تعديل — لازم يتختم في «آخر تعديل».
         وتاريخ الإنشاء ومَن أنشأ بيفضلوا ثابتين مهما حصل. */
      if(key==='clients'){
        n.createdAt=x.createdAt; n.createdBy=x.createdBy;
        n.updatedAt=todayISO(); n.updatedBy=me.id;
      }
      return n;
    })},'استرجاع '+(FLD[e.f]||e.f));
  };
  useEffect(()=>{
    const h=ev=>{if((ev.ctrlKey||ev.metaKey)&&(ev.key==='z'||ev.key==='Z')){
      const tag=(ev.target&&ev.target.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA') return;   /* سيب تراجع الكتابة للمتصفح */
      ev.preventDefault(); undo();}};
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  });
  /* الورق يفضل موجود لحد ما المتصفح يخلّص الطباعة فعلاً.
     في كروم الموبايل المعاينة بتفتح متأخرة — لو مسحناه بدري بتطلع صفحة فاضية. */
  useEffect(()=>{
    if(!pCfg) return;
    const clear=()=>setPCfg(null);
    window.addEventListener('afterprint',clear);
    const t=setTimeout(()=>{try{window.print()}catch(e){}},300);
    return ()=>{clearTimeout(t);window.removeEventListener('afterprint',clear)};
  },[pCfg]);

  const inCloud=cloud.status==='ready';
  const me=inCloud
    ? (db.users||[]).find(u=>u.id===(cloud.profile&&cloud.profile.id))||null
    : (db.users||[]).find(u=>u.id===meId&&u.active!==false)||null;
  useEffect(()=>{
    if(!inCloud||me?.role!=='owner')return;
    let cancelled=false,busy=false;
    const actor=cloud.profile?.auth_user_id||cloud.session?.user?.id;
    const sync=async()=>{
      if(cancelled||busy||document.hidden||window.frameElement?.closest('[hidden]')||pendingRef.current.size||drawer)return;
      const snapshot=dbRef.current,ids=snapshot.leads.filter(l=>l.accountingId).map(l=>l.accountingId);
      if(!ids.length)return;
      busy=true;
      try{
        const client=getCrmAccountingClient(),identity=await client.auth.getUser();
        if(identity.error||!identity.data?.user?.id)return;
        const rows=await readLinkedAccountingMasters(client,identity.data.user.id,ids);
        const currentActor=cloudRef.current.profile?.auth_user_id||cloudRef.current.session?.user?.id;
        if(cancelled||actor!==currentActor||cloudRef.current.status!=='ready'||dbRef.current!==snapshot||pendingRef.current.size)return;
        const result=reconcileAccountingMaster(snapshot,rows);
        if(result.changed)commit(result.db,'تحديث بيانات المالك والأرض من الحسابات',true,true);
        if(result.issues.length)toast('تحتاج مطابقة الحسابات مراجعة لـ '+result.issues.length+' سجل؛ لم تُدمج بيانات العملاء المختلفة');
      }catch(error){if(!cancelled)toast(error.message);}
      finally{busy=false;}
    };
    const onMessage=e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='nitaq-section-active'&&e.data.section==='crm')void sync();};
    const timer=setInterval(sync,60000);void sync();
    window.addEventListener('nitaq-accounting-connected',sync);window.addEventListener('focus',sync);window.addEventListener('message',onMessage);
    return ()=>{cancelled=true;clearInterval(timer);window.removeEventListener('nitaq-accounting-connected',sync);window.removeEventListener('focus',sync);window.removeEventListener('message',onMessage);};
  },[inCloud,me?.id,me?.role,drawer,cloud.session?.user?.id]);
  const myLeads=useMemo(()=>me?db.leads.filter(l=>isMine(me,l)):[],[db.leads,me]);
  const scoped={...db,leads:myLeads};
  const pick=u=>{setMeId(u.id);setDb({...db,ui:{...(db.ui||{}),me:u.id}});setView('today')};
  const logout=async()=>{
    if(pendingRef.current.size)return toast('انتظر تأكيد الحفظ أو نزّل تعديلاتك قبل الخروج');
    if(inCloud&&cloud.sb){ await cloud.sb.auth.signOut(); return; }
    setMeId(null);setDb({...db,ui:{...(db.ui||{}),me:null}});
  };
  const invite=async(name,email)=>{
    if(!inCloud||!cloud.sb) return {ok:false};
    return cloudInviteProfile(cloud.sb, name, email);
  };
  /* بيدمج بروفايل قديم (من غير حساب دخول، بيانات جهاز قديمة أو دعوة معلقة)
     في حساب حقيقي بالفعل — سجلات البروفايل القديم كلها بترجع تفضل ليه. */
  const mergeProfile=async(legacyId, realUser)=>{
    if(!inCloud||!cloud.sb||!realUser.authId) return {ok:false};
    const r=await mergeLegacyProfile(cloud.sb, legacyId, {id:realUser.id, auth_user_id:realUser.authId});
    if(r.ok) scheduleReload(cloud.sb);
    return r;
  };

  const fus=useMemo(()=>myLeads.map(followUp),[myLeads]);
  const late=fus.filter(f=>f.k==='late'||f.k==='none').length;
  const tod=fus.filter(f=>f.k==='today').length;
  const noGrp=db.leads.filter(l=>!isGroup(l.waGroup)).length;
  const deliv=myLeads.filter(l=>l.deliverDate&&l.workst!=='Done'&&l.workst!=='جاهز'&&diffDays(todayISO(),l.deliverDate)>=-7).length;
  /* مهامي المستحقة = مهام مسندة ليّا، مش منجزة، موعدها النهاردة أو فات */
  const myTasks=useMemo(()=>me?(db.tasks||[]).filter(t=>t.workst!=='Done'&&(me.role==='owner'||t.engineerId===me.id)):[],[db.tasks,me]);
  const myTasksDue=myTasks.filter(t=>t.deliverDate&&diffDays(todayISO(),t.deliverDate)>=0).length;

  const nextSketch=()=>String(Math.max(4000,...db.leads.map(l=>parseInt(String(l.sketchNo||0),10)||0))+1);
  const blank=c=>({clientId:c?c.id:null,sketchNo:nextSketch(),projectNo:'',desc:'',mainType:'',subType:'',
    grade:'active',required:'تواصل',workst:'مطلوب',lossReason:'',ownerId:me.id,engineerId:me.id,
    emirate:'الشارقة',area:'',
    nextDate:addDays(todayISO(),2),lastDate:todayISO(),deliverDate:'',notes:'',waGroup:'',createdAt:todayISO(),gradeLog:[]});

  const save=(L,C)=>{
    let clients=[...db.clients],cid=C.id;
    const {emirate,area,...cClean}=C;   /* الإمارة والمنطقة بقوا على الاسكتش مش العميل */
    const cc={...cClean,phone:normPhone(C.phone),phoneRaw:C.phone};
    /* حقول التتبّع: الإنشاء ما بيتغيّرش أبداً، والتعديل بيتحدّث مع كل حفظ */
    const nowD=todayISO();
    if(cid)clients=clients.map(x=>x.id===cid
      ?{...x,...cc,createdAt:x.createdAt,createdBy:x.createdBy,updatedAt:nowD,updatedBy:me.id}:x);
    else{cid=uid();clients.push({...cc,id:cid,
      createdAt:nowD,createdBy:me.id,updatedAt:nowD,updatedBy:me.id})}
    let lead={...L,clientId:cid,waGroup:normGroup(L.waGroup)};
    const old=db.leads.find(x=>x.id===lead.id);
    /* رقم المشروع = توقيع → الدرجة تبقى «مشروع» تلقائياً */
    if(String(lead.projectNo||'').trim()&&lead.grade!=='proj'&&lead.grade!=='dead') lead.grade='proj';
    /* مفيش ترقيم تلقائي — «مشروع» من غير رقم مسموحة لحد ما ييجي رقم الـERP */
    if(lead.grade==='proj') lead.prevProj='';
    /* خرج من «مشروع» → الرقم يترفع ويتحفظ لصاحبه */
    if(lead.grade!=='proj'&&String(lead.projectNo||'').trim()){
      lead.prevProj=lead.projectNo; lead.projectNo='';
    }
    let nseq=Math.max(db.projSeq||0,parseInt(String(lead.projectNo||'0'),10)||0);
    /* لو الرقم القديم اترفع في الحفظة دي، نديله فرصة يرجع للمخزون لو مفيش حد استخدم بعده */
    if(old&&String(old.projectNo||'').trim()&&!String(lead.projectNo||'').trim())
      nseq=releaseProjectSeq({...db,projSeq:nseq},lead.id,old.projectNo);
    const log=[...(lead.gradeLog||[])];
    if(!old||old.grade!==lead.grade) log.push({g:lead.grade,date:todayISO()});
    lead.gradeLog=log.length?log:[{g:lead.grade,date:lead.createdAt||todayISO()}];
    const leads=lead.id?db.leads.map(x=>x.id===lead.id?lead:x):[...db.leads,{...lead,id:uid()}];
    commit({...db,clients,leads,projSeq:nseq},lead.id?'حفظ سجل':'إضافة سجل جديد');setDrawer(null);
  };
  /* تعديل مباشر من الجدول — بيحافظ على نفس قواعد الحفظ */
  const patchLead=(id,p)=>{
    const cur=db.leads.find(x=>x.id===id)||{};
    let note='تعديل '+(FLD[Object.keys(p)[0]]||'سجل'), seq=db.projSeq||0;
    /* الرقم بيتكتب يدوياً من الـERP — مفيش أي توليد تلقائي */
    /* أ) كتابة رقم = توقيع  ·  ب) الخروج من «مشروع» = رفع الرقم */
    const leavingProj = p.grade && p.grade!=='proj' && cur.grade==='proj' && String(cur.projectNo||'').trim();
    const clearProj  = p.projectNo!==undefined && !String(p.projectNo).trim()
                       && String(cur.projectNo||'').trim();
    const newNum = p.projectNo!==undefined && String(p.projectNo).trim();
    /* منع التكرار — خط دفاع تاني بعد التحقق في الجدول */
    if(newNum){
      const clash=db.leads.find(x=>x.id!==id&&String(x.projectNo||'').trim()===String(p.projectNo).trim());
      if(clash){ toast('رقم المشروع '+String(p.projectNo).trim()+' مستخدم في سجل تاني'); return; }
      note='رقم المشروع '+String(p.projectNo).trim()+' — الجدية بقت «مشروع»';
      seq=Math.max(seq,parseInt(String(p.projectNo),10)||0);
    }
    if(leavingProj){ note='اترفع رقم المشروع '+cur.projectNo;
      seq=releaseProjectSeq(db,id,cur.projectNo); }
    if(clearProj){   note='رجع اسكتش — رقم المشروع '+cur.projectNo+' اترفع';
      seq=releaseProjectSeq(db,id,cur.projectNo); }
    setDbC(d=>({...d,projSeq:seq,leads:d.leads.map(x=>{
      if(x.id!==id)return x;
      const n={...x,...p, ...(p.waGroup!==undefined?{waGroup:normGroup(p.waGroup)}:{})};
      if(p.projectNo!==undefined&&String(p.projectNo).trim()&&n.grade!=='proj'&&n.grade!=='dead') n.grade='proj';
      if(leavingProj){ n.prevProj=x.projectNo; n.projectNo=''; }
      if(clearProj){   n.prevProj=x.projectNo; n.projectNo=''; if(n.grade==='proj') n.grade='imp'; }
      /* اختيار رقم موجود = توقيع، والرقم المحفوظ القديم مالوش لازمة */
      if(p.projectNo!==undefined&&String(p.projectNo).trim()) n.prevProj='';
      if(n.grade!==x.grade){
        n.gradeLog=[...(x.gradeLog||[]),{g:n.grade,date:todayISO()}];
        if(!gradeOf(n.grade).live) n.nextDate='';
        if(n.grade!=='dead') n.lossReason='';
      }
      return n;})}),note);
  };
  const patchClient=(id,p)=>setDbC(d=>({...d,clients:d.clients.map(x=>x.id===id
    ?{...x,...p,
       ...(p.phone!==undefined?{phone:normPhone(p.phone),phoneRaw:p.phone}:{}),
       createdAt:x.createdAt,createdBy:x.createdBy,      /* ثابتين مهما حصل */
       updatedAt:todayISO(),updatedBy:me.id}:x)}),'تعديل '+(FLD[Object.keys(p)[0]]||'بيانات العميل'));

  /* تفضيل الأعمدة الظاهرة — بيتحفظ مع البيانات */
  const cols=(db.ui&&db.ui.cols&&db.ui.cols.length)?db.ui.cols:DEFAULT_COLS;
  /* فلاتر "سجل العملاء" — متعمّدين نخليها هنا في App مش جوه Records نفسها،
     عشان لما تروح لتاب تاني (زي العملاء) وترجع، الفلاتر تفضل زي ما سيبتها
     بالظبط بدل ما تترجع فاضية (Records بيتشال من الشاشة تماماً وقت التبديل). */
  const [recF,setRecF]=useState({q:'',fg:[],fo:[],fe:[],fr:[],ff:[],ft:[],fw:[],sort:'follow',page:1,per:50});
  const [archF,setArchF]=useState({q:'',fg:[],fo:[],fe:[],fr:[],ff:[],ft:[],fw:[],sort:'follow',page:1,per:50});
  const setCols=c=>setDb(d=>({...d,ui:{...(d.ui||{}),cols:c}}));

  const del=L=>{if(!can(me,'del'))return toast('مش مسموحلك تحذف — اطلب الصلاحية من المالك');
    if(!confirm('تمسح السجل ده؟'))return;
    commit({...db,leads:db.leads.filter(x=>x.id!==L.id),inter:db.inter.filter(i=>i.leadId!==L.id)},'حذف سجل');
    setDrawer(null)};
  /* «تم» — بيقفل المهمة ويحدّد الموعد الجاي حسب درجة الجدية */
  const done=(L,isDeliv)=>{
    const T=todayISO();
    if(isDeliv){
      commit({...db,leads:db.leads.map(x=>x.id===L.id?{...x,workst:'جاهز'}:x),
        inter:[...db.inter,{id:uid(),leadId:L.id,date:T,channel:'اجتماع مكتب',
        outcome:'تم الرد',note:'تم التسليم',byId:me.id}]},'تم التسليم');
      return;
    }
    const gap=NEXTGAP[L.grade]||14;
    commit({...db,
      inter:[...db.inter,{id:uid(),leadId:L.id,date:T,channel:'اتصال',outcome:'تم الرد',
        note:'تم — من شاشة يومي',byId:me.id}],
      leads:db.leads.map(x=>x.id===L.id?{...x,lastDate:T,nextDate:addDays(T,gap),snoozed:0}:x)},
      'تم — الموعد الجاي بعد '+gap+' يوم');
  };
  /* «ترحيل» — بيأجّل وبيعدّ كام مرة اتأجّل */
  const snooze=(L,n)=>{
    commit({...db,leads:db.leads.map(x=>x.id===L.id
      ?{...x,nextDate:addDays(todayISO(),n),snoozed:(x.snoozed||0)+1}:x)},'ترحيل '+n+' يوم');
  };

  /* ===== مهام المهندسين — مستقلة عن سجلات الجدول ===== */
  const addTask=t=>{
    const rec={id:uid(),title:t.title||'',desc:t.desc||'',engineerId:t.engineerId||'',
      deliverDate:t.deliverDate||'',workst:'',doneAt:'',
      createdAt:todayISO(),createdBy:(me?me.id:'')};
    commit({...db,tasks:[rec,...(db.tasks||[])]},'إضافة مهمة');
  };
  const patchTask=(id,p)=>commit({...db,tasks:(db.tasks||[]).map(x=>x.id===id?{...x,...p}:x)},'تعديل مهمة');
  const delTask=id=>commit({...db,tasks:(db.tasks||[]).filter(x=>x.id!==id)},'حذف مهمة');
  const taskDone=t=>commit({...db,tasks:(db.tasks||[]).map(x=>x.id===t.id
    ?{...x,workst:'Done',doneAt:todayISO()}:x)},'تم تسليم المهمة');
  const taskReopen=t=>commit({...db,tasks:(db.tasks||[]).map(x=>x.id===t.id
    ?{...x,workst:'',doneAt:''}:x)},'إعادة فتح مهمة');

  const submitCall=(L,f)=>{
    const inter=[...db.inter,{id:uid(),leadId:L.id,date:f.date,channel:f.channel,outcome:f.outcome,note:f.note,byId:f.byId}];
    const leads=db.leads.map(x=>{
      if(x.id!==L.id)return x;
      const log=[...(x.gradeLog||[])];
      if(x.grade!==f.grade) log.push({g:f.grade,date:f.date});
      const pn=(f.grade!=='proj'&&x.grade==='proj')?'':x.projectNo;
      const pv=(f.grade==='proj')?'':((f.grade!=='proj'&&x.grade==='proj')?x.projectNo:x.prevProj);
      return {...x,lastDate:f.date,nextDate:gradeOf(f.grade).live?f.next:'',grade:f.grade,required:f.required,
        projectNo:pn,prevProj:pv,lossReason:f.lossReason,notes:f.note,gradeLog:log};
    });
    let sq=Math.max(db.projSeq||0,...leads.map(l=>parseInt(String(l.projectNo||'0'),10)||0));
    if(L.grade==='proj'&&String(L.projectNo||'').trim()&&f.grade!=='proj')
      sq=releaseProjectSeq({...db,projSeq:sq},L.id,L.projectNo);
    commit({...db,inter,leads,projSeq:sq},'تسجيل تواصل');setCall(null);setDrawer(null);
  };

  if(cloud.status==='idle'||cloud.status==='connecting') return <CloudSplash text="جاري الاتصال بالسحابة…"/>;
  if(cloud.status==='auth') return <><CloudAuth sb={cloud.sb}/>{cloud.err&&<p role="alert">{cloud.err}</p>}</>;
  if(cloud.status==='error') return <CloudError err={cloud.err}
    onRetry={()=>window.location.reload()}/>;
  if(cloud.status==='local'&&!me) return <Login db={db} onPick={pick}/>;
  if(inCloud&&!me) return <CloudSplash text="جاري تجهيز حسابك…"
    hint="لو الشاشة دي فضلت زي ما هي، اطلب من المالك يعمل لك دعوة بنفس الإيميل من شاشة (المستخدمون)."/>;

  const allow=n=>n.owner?me.role==='owner':n.cloud?inCloud:(n.p?can(me,n.p):true);
  const nav=NAV.filter(n=>n.g||allow(n));
  if(!nav.some(n=>n.id===view)) { if(view!=='today') setTimeout(()=>setView('today'),0); }

  const badKeys=(boot.current&&boot.current.bad)||[];
  const [t1,t2]=TITLES[view]||TITLES.today;
  return <>
    <aside className="side">
      <div className="brand">
        <img src={NITAQ_LOGO} alt="نطاق" className="blogo"/>
        <p>الاستشارات الهندسية · الشارقة</p>
      </div>
      <nav className="nav">{nav.map((n,i)=>n.g?<b key={i}>{n.g}</b>
        :<a href={'#'+n.id} key={n.id} className={view===n.id?'on':''} onClick={e=>{e.preventDefault();setView(n.id)}}>
          <span className="ic">{n.ic}</span>{n.l}
          {n.id==='today'&&late>0&&<span className="pill">{late}</span>}
          {n.id==='today'&&!late&&(tod+deliv)>0&&<span className="pill q">{tod+deliv}</span>}
          {n.id==='groups'&&noGrp>0&&<span className="pill q">{noGrp}</span>}
          {n.id==='tasks'&&myTasksDue>0&&<span className="pill">{myTasksDue}</span>}</a>)}</nav>
      <div className="sfoot"><span className="vchip">v7.4</span> نظام متابعة العملاء · 29 يوليو 2026<br/>SHARJAH–UAE · <span className="num">+971 56 816 6402</span></div>
    </aside>
    <div className="main">
      <header className="top">
        <div><h2>{t1}</h2><div className="sub">{t2}</div></div>
        <span className="grow"/>
        {inCloud&&<span className="svchip" style={{background:'var(--green-soft,#eafbea)',color:'var(--green,#1a7f37)'}}
            title="الجهاز متصل بالسحابة — التعديلات بتوصل لباقي المستخدمين لحظياً">☁ سحابي</span>}
        <span className={'svchip '+sv.state} title={sv.state==='fail'
            ? 'فشل حفظ: '+(inCloud?'السحابة':sv.message||sv.fail.map(k=>SLICE_AR[k]||k).join(' · '))
            : sv.state==='saving' ? 'الحفظ بعد لحظة' : inCloud?'كل التعديلات محفوظة ومتشاركة':'كل التعديلات محفوظة على الجهاز'}>
          {sv.state==='saved'?'محفوظ':sv.state==='saving'?'جارٍ الحفظ…':'فشل الحفظ'}
        </span>
        <button className="btn ghost sm" onClick={undo} disabled={!undoN}
          style={!undoN?{opacity:.4}:{}} title="تراجع عن آخر تعديل — Ctrl+Z">
          ↶ تراجع{undoN?' ('+undoN+')':''}</button>
        <button className="btn ghost sm" onClick={()=>setView('audit')} title="سجل التغييرات">⟲</button>
        <button className="btn ghost sm" onClick={logout} title={inCloud?'تسجيل خروج':'تبديل المستخدم'}>
          {me.name} · {me.role==='owner'?'مالك':'مهندس'}{inCloud?' · خروج':''}</button>
        <button className="btn gold" onClick={()=>setDrawer(blank())}>+ عميل جديد</button></header>
      {sv.state==='fail'&&<div className="savefail">
        <b>{inCloud?"لم يتأكد الحفظ السحابي؛ احتفظ بالصفحة وصدّر تعديلاتك":"تعذر الحفظ المحلي؛ صدّر نسخة قبل الإغلاق"}</b>
        <span>اللي فشل: {sv.fail.map(k=>SLICE_AR[k]).join(' · ')}
          <button className="btn sm" onClick={()=>cloudFlush()}>إعادة تأكيد الحفظ</button><button className="btn sm" onClick={downloadDraft}>تنزيل تعديلاتك</button><button className="btn sm" onClick={refreshAfterConflict}>قراءة النسخة الحالية</button> · البيانات كلها لسه في الذاكرة لحد ما تقفل الصفحة</span>
      </div>}
      {view==='today'&&<Daily db={db} me={me} open={setDrawer} logCall={setCall} done={done} snooze={snooze} go={setView} onPrint={()=>setPDlg(true)} taskDone={taskDone}/>}
      {view==='records'&&<Records db={scoped} me={me} open={setDrawer} add={()=>setDrawer(blank())} logCall={setCall} patchLead={patchLead} patchClient={patchClient} cols={cols} setCols={setCols} onPrint={p=>setPRec(p)} toast={toast} recF={recF} setRecF={setRecF} done={done}/>}
      {view==='archive'&&<Records db={scoped} me={me} open={setDrawer} add={()=>setDrawer(blank())} logCall={setCall} patchLead={patchLead} patchClient={patchClient} cols={cols} setCols={setCols} onPrint={p=>setPRec(p)} toast={toast} recF={archF} setRecF={setArchF} archived done={done}/>}
      {view==='clients'&&<Clients db={scoped} open={setDrawer} addFor={c=>setDrawer(blank(c))} onPrint={p=>setPCli(p)}/>}
      {view==='tasks'&&<Tasks db={db} me={me} addTask={addTask} patchTask={patchTask} delTask={delTask} taskDone={taskDone} taskReopen={taskReopen} toast={toast}/>}
      {view==='timer'&&inCloud&&<CrmTimerPanel timer={timer} me={me} db={db} toast={toast}/>}
      {view==='dash'&&<Dashboard db={scoped} all={db} me={me} go={setView}/>}
      {view==='reports'&&<Reports db={scoped}/>}
      {view==='audit'&&<>{inCloud&&me.role==='owner'&&<ServerAudit sb={cloud.sb} users={db.users}/>}<Audit db={db} me={me} revert={revert} open={setDrawer}/></>}
      {view==='users'&&<Users db={db} setDb={(u,l)=>setDbC(u,l||'تعديل مستخدم')} me={me} toast={toast} inCloud={inCloud} invite={invite} mergeProfile={mergeProfile}/>}
      {view==='groups'&&<Groups db={db} patchLead={patchLead} toast={toast}/>}
      {view==='lookups'&&<Lookups db={db} setDb={d=>setDbC(d,'تعديل القوائم')} toast={toast}/>}
      {view==='data'&&<Data db={db} setDb={(d,l)=>setDbC(d,l||'استبدال البيانات')} toast={toast}
        mode={sv.state==='saved'?(inCloud?'محفوظ على السحابة':'محفوظ على الجهاز'):sv.state==='saving'?'جارٍ الحفظ…':'🔴 فشل الحفظ — '+(inCloud?'السحابة':sv.fail.map(k=>SLICE_AR[k]).join(' · '))}
        badKeys={badKeys} flush={()=>flush(true)}
        inCloud={inCloud} sbCfg={sbCfg} setSbCfg={c=>{saveSbConfig(c);setSbCfg(c);}} cloudSb={cloud.sb}/>}
    </div>
    {inCloud&&<CrmTimerBanner timer={timer} go={setView}/>}
    {drawer&&<LeadDrawer db={db} me={me} lead={drawer} close={()=>setDrawer(null)} save={save} del={del} logCall={setCall} revert={revert}/>}
    {call&&<CallModal db={db} lead={call} close={()=>setCall(null)} submit={submitCall}/>}
    {pDlg&&<PrintDialog db={db} me={me} close={()=>setPDlg(false)}
       run={c=>{setPDlg(false);setPCfg({...c,kind:'daily',n:Date.now()})}}/>}
    {pRec&&<PrintRecDialog payload={pRec} close={()=>setPRec(null)}
       run={o=>{const p={...pRec,...o,kind:'records',by:me.name,n:Date.now()};setPRec(null);setPCfg(p)}}/>}
    <PrintSheets db={db} cfg={pCfg&&pCfg.kind==='daily'?pCfg:null}/>
    {pCli&&<PrintCliDialog payload={pCli} close={()=>setPCli(null)}
       run={o=>{const x={...pCli,...o,kind:'clients',by:me.name,n:Date.now()};setPCli(null);setPCfg(x)}}/>}
    <PrintRecords db={db} cfg={pCfg}/>
    <PrintClients db={db} cfg={pCfg}/>
    {msg&&<div className="toast">{msg.t}
      {msg.u&&<button className="tundo" onClick={undo}>تراجع</button>}</div>}
  </>;
}

/* ============ اختيار المستخدم عند الفتح ============ */
/* ============ شاشات الربط السحابي ============ */
