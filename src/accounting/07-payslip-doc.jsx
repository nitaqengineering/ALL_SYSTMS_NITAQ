function PayslipDoc({row, ym, data, onBack}){
  const e = row.emp;
  const lb = computeLeaveBalance(data, e.id);
  const earnings = [
    {k:'إجمالي الراتب'+(row.prorateDays!=null?(' ('+row.prorateDays+' من '+row.prorateDim+' يوم — من '+fmt(row.fullGross)+')'):''), v:row.gross},
    {k:'الأوفرتايم', v:row.ot},
  ];
  const deductions = [
    {k:'خصم الغياب ('+row.absentDays+' يوم)', v:row.absenceDeduction},
    {k:'السلف (مقطوعة)', v:row.advances},
    {k:'قسط السلف المقسّطة', v:row.installments||0},
    {k:'الخصومات', v:row.deductions},
  ];
  const totalEarn = earnings.reduce((s,x)=>s+x.v,0);
  const totalDed = deductions.reduce((s,x)=>s+x.v,0);
  // حماية الأجور: الصافي يجب ألا يقل عن 85% من الراتب التعاقدي (الإجمالي)
  const contract = row.gross||0;
  const wpsThreshold = contract*0.85;
  const wpsPct = contract>0 ? (row.net/contract)*100 : 0;
  const wpsOk = contract>0 && row.net>=wpsThreshold;
  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn outline" onClick={onBack}>← رجوع للرواتب</button>
        <button className="btn brass" onClick={()=>window.print()}><I.print/> طباعة كشف الراتب</button>
      </div>
      <div className="sinv">
        <div className="sinv-top">
          <div className="sinv-co">
            <div className="n">{COMPANY.nameAr}</div>
            <div className="ne">NITAQ ENGINEERING CONSULTANCY</div>
            <div className="meta">TRN: {COMPANY.trn} &nbsp;·&nbsp; رخصة {COMPANY.license}<br/>{COMPANY.address}</div>
          </div>
          <div className="sinv-logo"><img src={NITAQ_LOGO} alt="NITAQ" /></div>
        </div>
        <div className="sinv-tag">كشف راتب — <span className="en">PAYSLIP</span> · {fmtMonth(ym)}</div>
        <div className="sinv-info">
          <div>
            <div className="row"><span className="k">الموظف</span><span className="v">{e.name}</span></div>
            <div className="row"><span className="k">الوظيفة</span><span className="v">{e.position||'—'}</span></div>
            <div className="row"><span className="k">الراتب الأساسي</span><span className="v">{fmt(row.base!=null?row.base:e.baseSalary)}</span></div>
            <div className="row"><span className="k">تاريخ التعيين</span><span className="v">{e.hireDate||'—'}</span></div>
          </div>
          <div>
            <div className="row"><span className="k">رقم الإقامة</span><span className="v">{e.iqamaNumber||'—'}</span></div>
            <div className="row"><span className="k">الآيبان</span><span className="v">{e.iban||'—'}</span></div>
            <div className="row"><span className="k">رصيد الإجازة السنوي</span><span className="v">{lb.remaining} / {lb.entitled} يوم</span></div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:0}}>
          <table>
            <thead><tr><th>الاستحقاقات</th><th style={{textAlign:'left'}}>د.إ</th></tr></thead>
            <tbody>
              {earnings.map((x,i)=><tr key={i}><td>{x.k}</td><td style={{textAlign:'left'}}>{fmt(x.v)}</td></tr>)}
              <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}><td>إجمالي الاستحقاقات</td><td style={{textAlign:'left'}}>{fmt(totalEarn)}</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>الاستقطاعات</th><th style={{textAlign:'left'}}>د.إ</th></tr></thead>
            <tbody>
              {deductions.map((x,i)=><tr key={i}><td>{x.k}</td><td style={{textAlign:'left'}}>{fmt(x.v)}</td></tr>)}
              <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}><td>إجمالي الاستقطاعات</td><td style={{textAlign:'left'}}>{fmt(totalDed)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="sinv-tot">
          <div className="box">
            <div className="r"><span>إجمالي الاستحقاقات</span><span>AED {fmt(totalEarn)}</span></div>
            <div className="r"><span>إجمالي الاستقطاعات</span><span>AED {fmt(totalDed)}</span></div>
            <div className="r grand"><span>صافي الراتب</span><span>AED {fmt(row.net)}</span></div>
          </div>
        </div>
        <div className="sinv-words">المبلغ كتابةً: فقط {tafqeet(row.net)}</div>
        {(()=>{ const pl = salaryPaymentsForEmp(data, e.id, ym, row.net); const paid = salaryPaidForEmp(data, e.id, ym, row.net); const rem = Math.max(0, row.net-paid);
          if(!pl.length) return null;
          return (
            <div style={{margin:'4px 26px 14px'}}>
              <table>
                <thead><tr><th>دفعات صرف الراتب</th><th>الحساب</th><th style={{textAlign:'left'}}>د.إ</th></tr></thead>
                <tbody>
                  {pl.map((x,i)=><tr key={i}><td>{x.date||'—'} — {x.via}</td><td>{x.account==='الخزينة'?'نقدي':(x.bankName||x.account||'—')}</td><td style={{textAlign:'left'}}>{fmt(x.amount)}</td></tr>)}
                  <tr style={{fontWeight:800}}><td colSpan={2}>المتبقّي من الصافي</td><td style={{textAlign:'left'}}>{fmt(rem)}</td></tr>
                </tbody>
              </table>
            </div>);
        })()}

        {contract>0 && (
          <div style={{margin:'4px 26px 14px', border:'1px solid '+(wpsOk?'var(--teal)':'var(--rust)'), borderRadius:6, overflow:'hidden'}}>
            <div style={{background:wpsOk?'var(--teal)':'var(--rust)', color:'#fff', fontWeight:800, fontSize:12, padding:'6px 10px', textAlign:'center'}}>
              حماية الأجور (WPS) — الحد الأدنى 85% من الراتب التعاقدي
            </div>
            <div style={{display:'flex', flexWrap:'wrap', fontSize:12}}>
              <div style={{flex:1, minWidth:110, padding:'7px 10px', borderInlineEnd:'1px solid var(--line)', textAlign:'center'}}>
                <div style={{fontSize:10, color:'var(--ink-soft)'}}>الراتب التعاقدي</div>
                <div style={{fontWeight:700}}>{fmt(contract)}</div>
              </div>
              <div style={{flex:1, minWidth:110, padding:'7px 10px', borderInlineEnd:'1px solid var(--line)', textAlign:'center'}}>
                <div style={{fontSize:10, color:'var(--ink-soft)'}}>الصافي المدفوع</div>
                <div style={{fontWeight:700}}>{fmt(row.net)}</div>
              </div>
              <div style={{flex:1, minWidth:80, padding:'7px 10px', borderInlineEnd:'1px solid var(--line)', textAlign:'center'}}>
                <div style={{fontSize:10, color:'var(--ink-soft)'}}>النسبة</div>
                <div style={{fontWeight:700, color:wpsOk?'var(--teal)':'var(--rust)'}}>{wpsPct.toFixed(1)}%</div>
              </div>
              <div style={{flex:1, minWidth:100, padding:'7px 10px', textAlign:'center', background:wpsOk?'var(--teal-soft)':'var(--rust-soft)'}}>
                <div style={{fontSize:10, color:'var(--ink-soft)'}}>الحالة</div>
                <div style={{fontWeight:800, color:wpsOk?'var(--teal)':'var(--rust)'}}>{wpsOk?'✔ مستوفٍ':'✖ غير مستوفٍ'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="sinv-spacer"></div>
        <div className="sinv-sign">
          <div className="s">توقيع الموظف</div>
          <div className="s">المحاسب</div>
          <div className="s">الإدارة · NITAQ</div>
        </div>
        <div className="sinv-foot">SHARJAH · UAE &nbsp;|&nbsp; {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</div>
      </div>
    </div>
  );
}

/* ================= تتبّع الوقت: تايمر حي + سجل الساعات ================= */
const TIMER_KEY = 'nitaq-active-timer';
const MAX_SESSION_HOURS = 10;           // حد أقصى للجلسة الواحدة
const timerGet = ()=>{ try{ return JSON.parse(localStorage.getItem(TIMER_KEY)||'null'); }catch(e){ return null; } };
const timerSet = (t)=>{ try{ if(t) localStorage.setItem(TIMER_KEY, JSON.stringify(t)); else localStorage.removeItem(TIMER_KEY); }catch(e){} };

function TimesheetsView({data, configs, mutate}){
  const m = mutate('timesheets');
  const mPay = mutate('payments');
  const [timer, setTimer] = useState(()=>timerGet());   // {employeeId, projectId, phase, startMs}
  const [now, setNow] = useState(Date.now());
  // فوترة بالساعة
  const [billProj, setBillProj] = useState('');
  const [clientRate, setClientRate] = useState('');
  // اختيارات بدء التايمر
  const [empId, setEmpId] = useState('');
  const [projId, setProjId] = useState('');
  const [phase, setPhase] = useState('تصميم');

  // عدّاد حي يتحدّث كل ثانية أثناء التشغيل
  useEffect(()=>{
    if(!timer) return;
    const iv = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(iv);
  }, [timer]);

  const emps = data.employees||[];
  const projs = (data.projects||[]).filter(p=>p.status==='جارٍ');
  // --- تقرير ساعات الفريق ---
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const [rProj, setRProj] = useState('');
  const rptRows = (data.timesheets||[]).filter(t=>{
    if(isArchived(t)) return false;
    const d = t.date||'';
    if(rFrom && d < rFrom) return false;
    if(rTo && d > rTo) return false;
    if(rProj && t.projectId!==rProj) return false;
    return true;
  });
  const hoursCostOf = (t)=>{ const e=(data.employees||[]).find(x=>x.id===t.employeeId); return (Number(t.hours)||0)*hourlyRate(e, monthKey(t.date)); };
  // تجميع حسب المهندس
  const byEmp = {};
  rptRows.forEach(t=>{
    const k=t.employeeId||'—'; if(!byEmp[k]) byEmp[k]={hours:0,cost:0,projs:new Set()};
    byEmp[k].hours+=Number(t.hours)||0; byEmp[k].cost+=hoursCostOf(t); if(t.projectId) byEmp[k].projs.add(t.projectId);
  });
  // تجميع حسب المشروع
  const byProj = {};
  rptRows.forEach(t=>{
    const k=t.projectId||'—'; if(!byProj[k]) byProj[k]={hours:0,cost:0,emps:new Set()};
    byProj[k].hours+=Number(t.hours)||0; byProj[k].cost+=hoursCostOf(t); if(t.employeeId) byProj[k].emps.add(t.employeeId);
  });
  const empRows = Object.entries(byEmp).map(([id,v])=>({id,name:(data.employees||[]).find(e=>e.id===id)?.name||'—',...v})).sort((a,b)=>b.hours-a.hours);
  const projRows = Object.entries(byProj).map(([id,v])=>{ const p=(data.projects||[]).find(x=>x.id===id); return {id,name:p?((p.projectNo?p.projectNo+' — ':'')+p.name):'—',...v}; }).sort((a,b)=>b.hours-a.hours);
  const totHours = rptRows.reduce((s,t)=>s+(Number(t.hours)||0),0);
  const totCost = rptRows.reduce((s,t)=>s+hoursCostOf(t),0);
  const anyRF = rFrom||rTo||rProj;

  const BASE_PHASES = ['تصميم','مخططات تفصيلية','إشراف','اعتمادات','أخرى'];
  const usedPhases = [...new Set((data.timesheets||[]).map(t=>t.phase).filter(Boolean))];
  const PHASES = [...BASE_PHASES, ...usedPhases.filter(p=>!BASE_PHASES.includes(p))];
  const pickPhase = (val)=>{
    if(val==='__add__'){
      const np = prompt('اسم المرحلة الجديدة:');
      if(np && np.trim()){ setPhase(np.trim()); }   // تُحفظ تلقائياً عند أول تسجيل وتظهر في القائمة بعدها
    } else setPhase(val);
  };
  const empName = (id)=>{ const e=emps.find(x=>x.id===id); return e?e.name:'—'; };
  const projName = (id)=>{ const p=(data.projects||[]).find(x=>x.id===id); return p?((p.projectNo?p.projectNo+' — ':'')+p.name):'—'; };

  const start = ()=>{
    if(!empId || !projId){ alert('اختر المهندس والمشروع أولاً'); return; }
    const t = {employeeId:empId, projectId:projId, phase, startMs:Date.now()};
    timerSet(t); setTimer(t); setNow(Date.now());
  };
  const cancel = ()=>{
    if(!confirm('إلغاء التايمر دون تسجيل أي ساعات؟')) return;
    timerSet(null); setTimer(null);
  };
  const stop = ()=>{
    if(!timer) return;
    const rawHours = (Date.now() - timer.startMs) / 3600000;
    let hours = Math.round(rawHours*100)/100;
    let flag = '';
    if(hours > MAX_SESSION_HOURS){
      hours = MAX_SESSION_HOURS;
      flag = ' — ⚠ تجاوزت الجلسة الحد (سُجّلت '+MAX_SESSION_HOURS+' ساعة، راجعها)';
      alert('الجلسة تجاوزت '+MAX_SESSION_HOURS+' ساعة — غالباً نُسي إيقاف التايمر.\nسيُسجَّل '+MAX_SESSION_HOURS+' ساعة فقط، عدّلها يدوياً إن لزم.');
    }
    if(hours < 0.02){ // أقل من دقيقة
      if(!confirm('المدة أقل من دقيقة. تسجيلها كـ '+hours.toFixed(2)+' ساعة؟')){ return; }
    }
    const task = prompt('وصف المهمة المنجزة (اختياري):', '') || '';
    m.add({id:uid(), employeeId:timer.employeeId, projectId:timer.projectId, phase:timer.phase,
      date:todayISO(), hours, task:(task+flag).trim(), _ts:Date.now(),
      source:'timer', startedAt:new Date(timer.startMs).toISOString(), endedAt:new Date().toISOString()});
    timerSet(null); setTimer(null);
  };

  // --- فوترة بالساعة: الساعات غير المفوترة × سعر ساعة العميل ---
  const unbilledRows = (data.timesheets||[]).filter(t=> t.projectId===billProj && !isArchived(t) && !t.billed);
  const unbilledHours = unbilledRows.reduce((s,t)=>s+(Number(t.hours)||0),0);
  const billAmount = unbilledHours * (parseFloat(clientRate)||0);
  const generateBill = ()=>{
    if(!billProj){ alert('اختر المشروع أولاً'); return; }
    if(!(parseFloat(clientRate)>0)){ alert('أدخل سعر الساعة للعميل'); return; }
    if(unbilledHours<=0){ alert('لا ساعات غير مفوترة على هذا المشروع'); return; }
    if(!confirm('توليد دفعة أتعاب بالساعة؟\n'+unbilledHours.toFixed(1)+' ساعة × '+money(parseFloat(clientRate))+' = '+money(billAmount)+' (قبل الضريبة)')) return;
    const due = new Date(); due.setDate(due.getDate()+15);
    mPay.add({id:uid(), projectId:billProj, phase:'أخرى',
      label:'أتعاب بالساعة — '+unbilledHours.toFixed(1)+' ساعة × '+money(parseFloat(clientRate)),
      amount:Math.round(billAmount*100)/100, taxable:'خاضعة', date:todayISO(),
      dueDate:due.toISOString().slice(0,10), status:'معلقة', _ts:Date.now()});
    // وسم الساعات بأنها مفوترة حتى لا تُحتسب مرتين
    unbilledRows.forEach(t=> m.update(t.id, {billed:true, billedAt:todayISO()}));
    alert('تم توليد الدفعة — تجدها في تبويب الدفعات. الساعات المفوترة لن تُحتسب مرة أخرى.');
    setClientRate('');
  };

  // عرض الوقت المنقضي ساعة:دقيقة:ثانية
  const elapsed = timer ? Math.max(0, now - timer.startMs) : 0;
  const hh = String(Math.floor(elapsed/3600000)).padStart(2,'0');
  const mm = String(Math.floor((elapsed%3600000)/60000)).padStart(2,'0');
  const ss = String(Math.floor((elapsed%60000)/1000)).padStart(2,'0');
  const over = elapsed/3600000 > MAX_SESSION_HOURS;

  const selEl = {border:'1px solid var(--line-strong)', borderRadius:4, padding:'8px 10px', fontSize:13, background:'#fff'};

  return (
    <div>
      {/* قسم التايمر الحي */}
      <div className="card" style={{marginBottom:18, border:'1px solid '+(timer?'var(--teal)':'var(--line)'), background:timer?'var(--teal-soft)':'#fff'}}>
        <div className="section-title"><h3 style={{fontSize:14}}>⏱ تايمر العمل الحي</h3><div className="rule"></div></div>
        {!timer ? (
          <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end'}}>
            <div className="field" style={{minWidth:160}}>
              <label>المهندس</label>
              <select value={empId} onChange={e=>setEmpId(e.target.value)} style={selEl}>
                <option value="">اختر...</option>
                {emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field" style={{minWidth:180}}>
              <label>المشروع</label>
              <select value={projId} onChange={e=>setProjId(e.target.value)} style={selEl}>
                <option value="">اختر...</option>
                {projs.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
              </select>
            </div>
            <div className="field" style={{minWidth:140}}>
              <label>المرحلة</label>
              <select value={phase} onChange={e=>pickPhase(e.target.value)} style={selEl}>
                {(PHASES.includes(phase)?PHASES:[phase,...PHASES]).map(p=><option key={p} value={p}>{p}</option>)}
                <option value="__add__">➕ إضافة مرحلة جديدة...</option>
              </select>
            </div>
            <button className="btn brass" style={{fontSize:14, padding:'9px 22px'}} onClick={start}>▶ بدء العمل</button>
          </div>
        ) : (
          <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'center'}}>
            <div>
              <div style={{fontSize:12, color:'var(--ink-soft)', marginBottom:4}}>
                {empName(timer.employeeId)} · {projName(timer.projectId)} · {timer.phase}
              </div>
              <div style={{fontSize:34, fontWeight:900, fontFamily:'monospace', color:over?'var(--rust)':'var(--teal)', letterSpacing:2}}>
                {hh}:{mm}:{ss}
              </div>
              {over && <div style={{fontSize:12, color:'var(--rust)', fontWeight:700}}>⚠ تجاوزت {MAX_SESSION_HOURS} ساعة — سيُسجَّل {MAX_SESSION_HOURS} فقط</div>}
            </div>
            <div style={{flex:1}}></div>
            <button className="btn" style={{background:'var(--rust)', color:'#fff', fontSize:15, padding:'11px 26px'}} onClick={stop}>⏹ إيقاف وتسجيل</button>
            <button className="btn ghost small" onClick={cancel}>إلغاء</button>
          </div>
        )}
        <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12, marginBottom:0}}>
          * التايمر يحفظ وقت البدء — لو أغلقت الصفحة وأعدت فتحها يكمل من حيث توقف. الساعات تُحسب من (وقت الإيقاف − وقت البدء)، بحد أقصى {MAX_SESSION_HOURS} ساعات للجلسة.
        </p>
      </div>

      {/* فوترة العميل بالساعة */}
      <div className="card" style={{marginBottom:18}}>
        <div className="section-title"><h3 style={{fontSize:13.5}}>فوترة العميل بالساعة (للعقود بالساعة)</h3><div className="rule"></div></div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end'}}>
          <div className="field" style={{minWidth:180}}>
            <label>المشروع</label>
            <select value={billProj} onChange={e=>setBillProj(e.target.value)} style={selEl}>
              <option value="">اختر...</option>
              {(data.projects||[]).map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{minWidth:150}}>
            <label>سعر الساعة للعميل (د.إ)</label>
            <input type="number" value={clientRate} onChange={e=>setClientRate(e.target.value)} placeholder="مثال: 150" style={selEl} />
          </div>
          {billProj && (
            <div style={{fontSize:12.5, color:'var(--ink-soft)', paddingBottom:8}}>
              ساعات غير مفوترة: <b>{Math.round(unbilledHours*10)/10}</b>
              {clientRate && <> · القيمة: <b style={{color:'var(--teal)'}}>{money(billAmount)}</b></>}
            </div>
          )}
          <button className="btn brass" onClick={generateBill}>توليد دفعة بالساعة</button>
        </div>
        <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:10, marginBottom:0}}>
          * يحسب الساعات غير المفوترة على المشروع × سعر الساعة، ويولّد دفعة أتعاب معلّقة في الدفعات. الساعات المفوترة تُوسَم فلا تُحتسب مرتين. للعقود بقيمة ثابتة لا تحتاج هذا القسم.
        </p>
      </div>

      {/* تقرير ساعات الفريق */}
      <div className="toolbar no-print" style={{flexWrap:'wrap', gap:10}}>
        <div className="section-title" style={{marginBottom:0, flex:'1 1 100%'}}><h3 style={{fontSize:13.5}}>تقرير ساعات الفريق على المشاريع</h3><div className="rule"></div></div>
        <select value={rProj} onChange={e=>setRProj(e.target.value)} style={selEl}>
          <option value="">كل المشاريع</option>
          {(data.projects||[]).map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
        </select>
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
        <input type="date" value={rFrom} onChange={e=>setRFrom(e.target.value)} style={selEl} />
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
        <input type="date" value={rTo} onChange={e=>setRTo(e.target.value)} style={selEl} />
        {anyRF && <button className="btn ghost small" onClick={()=>{setRFrom('');setRTo('');setRProj('');}}>مسح</button>}
        <button className="btn outline no-print" onClick={()=>window.print()}><I.print/> طباعة</button>
      </div>
      <div className="grid grid-3" style={{marginBottom:16}}>
        <div className="card"><div className="kpi-label">إجمالي الساعات</div><div className="kpi-value">{Math.round(totHours*10)/10} ساعة</div><div className="kpi-note">{rptRows.length} سجل</div></div>
        <div className="card"><div className="kpi-label">إجمالي تكلفة الوقت</div><div className="kpi-value" style={{color:'var(--rust)'}}>{money(totCost)}</div><div className="kpi-note">ساعات × تكلفة ساعة كل مهندس</div></div>
        <div className="card"><div className="kpi-label">مهندسون نشطون</div><div className="kpi-value">{empRows.length}</div><div className="kpi-note">على {projRows.length} مشروع</div></div>
      </div>

      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24}}>
        <div>
          <div className="section-title"><h3 style={{fontSize:13}}>حسب المهندس</h3><div className="rule"></div></div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>المهندس</th><th>الساعات</th><th>التكلفة</th><th>مشاريع</th></tr></thead>
              <tbody>
                {empRows.length===0 && <tr className="empty-row"><td colSpan={4}>لا ساعات في النطاق المحدد</td></tr>}
                {empRows.map(r=>(
                  <tr key={r.id}><td>{r.name}</td><td><b>{Math.round(r.hours*10)/10}</b></td><td style={{color:'var(--rust)'}}>{money(r.cost)}</td><td>{r.projs.size}</td></tr>
                ))}
              </tbody>
              {empRows.length>0 && <tfoot><tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}><td>الإجمالي</td><td>{Math.round(totHours*10)/10}</td><td style={{color:'var(--rust)'}}>{money(totCost)}</td><td></td></tr></tfoot>}
            </table>
          </div>
        </div>
        <div>
          <div className="section-title"><h3 style={{fontSize:13}}>حسب المشروع</h3><div className="rule"></div></div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>المشروع</th><th>الساعات</th><th>التكلفة</th><th>مهندسون</th></tr></thead>
              <tbody>
                {projRows.length===0 && <tr className="empty-row"><td colSpan={4}>لا ساعات في النطاق المحدد</td></tr>}
                {projRows.map(r=>(
                  <tr key={r.id}><td>{r.name}</td><td><b>{Math.round(r.hours*10)/10}</b></td><td style={{color:'var(--rust)'}}>{money(r.cost)}</td><td>{r.emps.size}</td></tr>
                ))}
              </tbody>
              {projRows.length>0 && <tfoot><tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}><td>الإجمالي</td><td>{Math.round(totHours*10)/10}</td><td style={{color:'var(--rust)'}}>{money(totCost)}</td><td></td></tr></tfoot>}
            </table>
          </div>
        </div>
      </div>

      {/* الجدول اليدوي المعتاد */}
      <div className="section-title"><h3 style={{fontSize:13.5}}>سجل الساعات (يمكن أيضاً الإدخال اليدوي)</h3><div className="rule"></div></div>
      <EntityView config={configs.timesheets} records={data.timesheets} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del} />
    </div>
  );
}

function DocAlertsView({data}){
  const [showAll, setShowAll] = useState(false);
  const items = [];
  (data.employees||[]).forEach(e=>{
    if(isArchived(e)) return;
    if(e.iqamaExpiry)    items.push({who:e.name, type:'الإقامة', date:e.iqamaExpiry, warn:WARN_IQAMA, d:daysUntil(e.iqamaExpiry)});
    if(e.passportExpiry) items.push({who:e.name, type:'جواز السفر', date:e.passportExpiry, warn:WARN_PASSPORT, d:daysUntil(e.passportExpiry)});
    if(e.workCardExpiry) items.push({who:e.name, type:'بطاقة العمل', date:e.workCardExpiry, warn:WARN_DEFAULT, d:daysUntil(e.workCardExpiry)});
  });
  (data.cars||[]).forEach(c=>{
    if(isArchived(c)) return;
    if(c.licenseExpiry) items.push({who:(c.model||'')+' · '+(c.plate||''), type:'رخصة السيارة', date:c.licenseExpiry, warn:WARN_DEFAULT, d:daysUntil(c.licenseExpiry)});
  });
  const active = items.filter(i=> i.d!==null && (showAll || i.d<=i.warn));
  active.sort((a,b)=> (a.d==null?9e9:a.d)-(b.d==null?9e9:b.d));
  const expired = active.filter(i=>i.d<0).length;
  const soon = active.filter(i=>i.d>=0 && i.d<=i.warn).length;

  return (
    <div>
      <div className="grid grid-3" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">منتهية بالفعل</div><div className="kpi-value" style={{color:'var(--rust)'}}>{expired}</div><div className="kpi-note">تحتاج تجديداً فورياً</div></div>
        <div className="card"><div className="kpi-label">قاربت على الانتهاء</div><div className="kpi-value" style={{color:'var(--brass)'}}>{soon}</div><div className="kpi-note">ضمن فترة التنبيه</div></div>
        <div className="card"><div className="kpi-label">إجمالي الوثائق المتابَعة</div><div className="kpi-value">{items.length}</div><div className="kpi-note">موظفين + سيارات</div></div>
      </div>
      <div className="toolbar no-print">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>الوثائق القريبة من الانتهاء</h3><div className="rule"></div></div>
        <button className="btn ghost small" onClick={()=>setShowAll(s=>!s)}>{showAll?'عرض التنبيهات فقط':'عرض كل الوثائق'}</button>
        <button className="btn outline no-print" onClick={()=>window.print()}><I.print/> طباعة</button>
      </div>
      <div className="card" style={{padding:0}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>الجهة</th><th>الوثيقة</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>المتبقّي</th></tr></thead>
          <tbody>
            {active.length===0 && <tr className="empty-row"><td colSpan={5}>لا توجد وثائق ضمن فترة التنبيه — كل شيء سارٍ ✓</td></tr>}
            {active.map((it,i)=>(
              <tr key={i}>
                <td><b>{it.who}</b></td>
                <td>{it.type}</td>
                <td>{it.date}</td>
                <td><span className={"badge "+expiryStatus(it.date, it.warn)}>{it.d<0?'منتهية':it.d<=it.warn?'قاربت':'سارية'}</span></td>
                <td style={{color:it.d<0?'var(--rust)':it.d<=it.warn?'var(--brass)':'var(--ink)', fontWeight:700}}>
                  {it.d<0?('منتهية منذ '+Math.abs(it.d)+' يوم'):(it.d+' يوم')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:12}}>* فترات التنبيه: جواز السفر قبل 7 شهور، الإقامة قبل شهر، بطاقة العمل ورخصة السيارة قبل 60 يوماً. مرتّبة حسب الأقرب انتهاءً.</p>
    </div>
  );
}

/* نافذة صرف رواتب WPS: تاريخ الصرف الفعلي + مراجعة الأسماء والمبالغ */
function WpsRunModal({ym, rows, total, outside, onClose, onSave}){
  const [date, setDate] = useState(todayISO());
  const [bankName, setBankName] = useState('WIO NITAQ');
  const [note, setNote] = useState('');
  const inp = {width:'100%', padding:'7px 9px', fontFamily:'inherit', fontSize:13, border:'1px solid var(--line-strong)', borderRadius:6};
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:520}}>
        <h3 style={{marginBottom:4}}>صرف رواتب {fmtMonth(ym)} — WPS</h3>
        <div style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:12}}>{rows.length} موظف · الإجمالي <b style={{color:'var(--brass)'}}>{money(total)}</b>{outside?(' · '+outside+' موظف خارج WPS غير مشمولين (يُصرف لهم من زر «صرف»)'):''}</div>
        <div style={{maxHeight:220, overflowY:'auto', border:'1px solid var(--line)', borderRadius:6, marginBottom:12}}>
          <table style={{fontSize:12.5}}>
            <thead><tr><th>الموظف</th><th style={{textAlign:'left'}}>الصافي</th></tr></thead>
            <tbody>
              {rows.map(r=><tr key={r.emp.id}><td>{r.emp.name}</td><td style={{textAlign:'left', whiteSpace:'nowrap'}}>{money(r.net)}</td></tr>)}
              <tr style={{fontWeight:800}}><td>الإجمالي</td><td style={{textAlign:'left', whiteSpace:'nowrap'}}>{money(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{display:'grid', gap:10}}>
          <label style={{fontSize:12.5}}>تاريخ الصرف الفعلي *<input type="date" style={inp} value={date} onChange={e=>setDate(e.target.value)} /></label>
          <label style={{fontSize:12.5}}>اسم البنك *<input style={inp} value={bankName} onChange={e=>setBankName(e.target.value)} /></label>
          <label style={{fontSize:12.5}}>ملاحظة إضافية<input style={inp} value={note} onChange={e=>setNote(e.target.value)} placeholder="اختياري" /></label>
          <div style={{fontSize:11.5, color:'var(--ink-faint)'}}>أسماء الموظفين ومبالغهم هتتكتب في ملاحظات قيد المصروف تلقائياً، والمبلغ هيتخصم من البنك بتاريخ الصرف ده.</div>
        </div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" disabled={!date || !bankName.trim()} onClick={()=>onSave({date, bankName:bankName.trim(), note:note.trim()})}>تأكيد الصرف</button>
        </div>
      </div>
    </div>
  );
}

/* نافذة دفعة راتب لموظف خارج WPS */
function SalaryPartModal({row, ym, data, onClose, onSave}){
  const [amount, setAmount] = useState(String(row.remaining));
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState('البنك');
  const [bankName, setBankName] = useState('WIO NITAQ');
  const [note, setNote] = useState('');
  const prev = salaryPaymentsForEmp(data, row.emp.id, ym, row.net);
  const amt = parseFloat(amount);
  const valid = amt>0 && amt<=row.remaining+0.01 && !!date && (account!=='البنك' || bankName.trim());
  const inp = {width:'100%', padding:'7px 9px', fontFamily:'inherit', fontSize:13, border:'1px solid var(--line-strong)', borderRadius:6};
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:460}}>
        <h3 style={{marginBottom:4}}>دفعة راتب — {row.emp.name}</h3>
        <div style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:12}}>{fmtMonth(ym)} · الصافي {money(row.net)} · المصروف {money(row.paid)} · <b style={{color:'var(--rust)'}}>المتبقّي {money(row.remaining)}</b></div>
        {prev.length>0 && (
          <div style={{fontSize:12, background:'var(--paper)', border:'1px solid var(--line)', borderRadius:6, padding:'6px 10px', marginBottom:12}}>
            {prev.map((x,i)=><div key={i}>• {x.date} — {money(x.amount)} ({x.account==='الخزينة'?'نقدي':(x.bankName||x.account||'')})</div>)}
          </div>
        )}
        <div style={{display:'grid', gap:10}}>
          <label style={{fontSize:12.5}}>المبلغ (د.إ) *<input type="number" style={inp} value={amount} onChange={e=>setAmount(e.target.value)} /></label>
          <label style={{fontSize:12.5}}>تاريخ الصرف *<input type="date" style={inp} value={date} onChange={e=>setDate(e.target.value)} /></label>
          <label style={{fontSize:12.5}}>من حساب *
            <select style={inp} value={account} onChange={e=>setAccount(e.target.value)}>
              <option value="البنك">البنك (تحويل)</option><option value="الخزينة">الخزينة (نقدي)</option>
            </select></label>
          {account==='البنك' && <label style={{fontSize:12.5}}>اسم البنك *<input style={inp} value={bankName} onChange={e=>setBankName(e.target.value)} /></label>}
          <label style={{fontSize:12.5}}>ملاحظة<input style={inp} value={note} onChange={e=>setNote(e.target.value)} /></label>
          {amt>row.remaining+0.01 && <div style={{color:'var(--rust)', fontSize:12}}>المبلغ أكبر من المتبقّي.</div>}
        </div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" disabled={!valid} onClick={()=>onSave({amount:Math.round(amt*100)/100, date, account, bankName:bankName.trim(), note:note.trim()})}>تسجيل الدفعة</button>
        </div>
      </div>
    </div>
  );
}

function PayrollView({data, mutate}){
  const [ym, setYm] = useState(currentYM());
  const [slipFor, setSlipFor] = useState(null);
  const [payFor, setPayFor] = useState(null);     // موظف خارج WPS: نافذة دفعة راتب
  const [wpsOpen, setWpsOpen] = useState(false);  // نافذة صرف رواتب WPS (تاريخ الصرف الفعلي)
  const {rows: baseRows, totalNet} = computePayroll(data, ym);
  // المصروف والمتبقّي لكل موظف عن هذا الشهر
  const rows = baseRows.map(r=>{
    const paid = salaryPaidForEmp(data, r.emp.id, ym, r.net);
    const remaining = Math.max(0, Math.round((r.net - paid)*100)/100);
    return {...r, wps:isWpsEmp(r.emp), paid, remaining};
  });
  const wpsRows = rows.filter(r=>r.wps);
  const totalPaid = rows.reduce((s,r)=>s+r.paid,0);
  const totalRemaining = rows.reduce((s,r)=>s+r.remaining,0);
  const mT = mutate('treasury');

  // كشف راتب فردي
  if(slipFor){
    const row = rows.find(r=>r.emp.id===slipFor);
    if(row) return <PayslipDoc row={row} ym={ym} data={data} onBack={()=>setSlipFor(null)} />;
  }

  // تصدير ملف WPS (نظام حماية الأجور) بصيغة CSV
  const exportWPS = ()=>{
    const header = ['Employee ID','Employee Name','IBAN','Salary Month','Basic','Gross','Overtime','Deductions','Net Salary'];
    // أرقام بلا فواصل آلاف ونصوص بين علامات اقتباس — حتى لا تنكسر أعمدة الملف
    const num = (n)=> (Math.round((Number(n)||0)*100)/100).toFixed(2);
    const cell = (v)=> '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const lines = wpsRows.map(r=>[
      cell(r.emp.id), cell(r.emp.name), cell(r.emp.iban||''), ym,
      num(r.base), num(r.gross), num(r.ot), num(r.absenceDeduction+r.advances+r.deductions+(r.installments||0)), num(r.net)
    ].join(','));
    const csv = '\uFEFF'+header.join(',')+'\n'+lines.join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='WPS_'+ym+'.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const mExp = mutate('officeExpenses');
  // يُبحث عن صرف الرواتب في المصروفات (الجديد) وفي الخزينة (سجلات قديمة) لضمان التوافق
  const paidExp = data.officeExpenses.find(e=>e.kind==='رواتب' && e.month===ym);
  const paidTreasury = data.treasury.find(t=>t.kind==='رواتب' && t.month===ym);
  const paidRec = paidExp || paidTreasury;
  // الصرف الجماعي: موظفو WPS فقط (قيد واحد للشهر) — موظفو «خارج WPS» يُصرف لهم بزر «صرف» على دفعات
  const wpsTotal = Math.round(wpsRows.reduce((s,r)=>s+r.net,0)*100)/100;
  const paySalaries = () => {
    if(paidRec){ alert('تم تسجيل صرف رواتب '+fmtMonth(ym)+' (WPS) مسبقاً'); return; }
    if(!wpsRows.length){ alert('لا يوجد موظفون عبر WPS — اصرفي لموظفي «خارج WPS» من زر «صرف» بجانب كل موظف.'); return; }
    setWpsOpen(true);
  };
  const confirmWpsRun = (f) => {
    const list = wpsRows.map(r=>r.emp.name+' '+fmt(Math.round(r.net*100)/100)).join(' · ');
    mExp.add({id:uid(), category:'رواتب', amount:wpsTotal, date:f.date, account:'البنك',
      bankName:f.bankName||'WIO NITAQ', vatable:'غير خاضع', payStatus:'مدفوع',
      note:'صرف رواتب '+fmtMonth(ym)+' — WPS ('+wpsRows.length+' موظف): '+list+' — الإجمالي '+fmt(wpsTotal)+(f.note?(' — '+f.note):''),
      kind:'رواتب', month:ym,
      lines:wpsRows.map(r=>({employeeId:r.emp.id, amount:Math.round(r.net*100)/100})), _ts:Date.now()});
    setWpsOpen(false);
  };
  const addSalaryPart = (row, f) => {
    mExp.add({id:uid(), category:'رواتب', amount:f.amount, date:f.date, account:f.account,
      bankName: f.account==='البنك' ? (f.bankName||'WIO NITAQ') : '', vatable:'غير خاضع', payStatus:'مدفوع',
      note:'دفعة راتب '+row.emp.name+' — '+fmtMonth(ym)+(f.note?(' — '+f.note):''),
      kind:SALARY_PART_KIND, month:ym, employeeId:row.emp.id, _ts:Date.now()});
    setPayFor(null);
  };

  const grats = data.employees.filter(e=>!isArchived(e)).map(e=>({e, ...computeGratuity(e)}));
  const gratTotal = grats.reduce((s,g)=>s+g.amount,0);

  return (
    <div>
      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>كشف الرواتب</h3><div className="rule"></div></div>
        <div style={{display:'flex', gap:10}}>
          <input type="month" value={ym} onChange={e=>setYm(e.target.value)} />
          <button className={"btn "+(paidRec?'outline':'brass')+" no-print"} onClick={paySalaries}>
            {paidRec ? '✓ رواتب WPS مصروفة' : 'تسجيل صرف الرواتب (WPS)'}
          </button>
          <button className="btn outline no-print" onClick={exportWPS} title="تصدير ملف حماية الأجور (CSV) للبنك">↓ ملف WPS</button>
          <button className="btn outline no-print" onClick={()=>window.print()}><I.print/> طباعة</button>
        </div>
      </div>
      <div className="card payroll-wrap" style={{padding:0, marginBottom:16, overflowX:'auto'}}>
        <style>{`.payroll-wrap table{font-size:12px; min-width:100%} .payroll-wrap th,.payroll-wrap td{padding:8px 7px; white-space:nowrap} .payroll-wrap td:first-child{white-space:normal; min-width:150px; max-width:220px} .payroll-wrap .badge{white-space:nowrap} @media print{.payroll-wrap{overflow:visible}}`}</style>
        <table>
          <thead>
            <tr>
              <th>الموظف</th><th>الأساسي</th><th>الإجمالي</th><th>أيام غياب</th><th>خصم الغياب</th>
              <th>الأوفرتايم</th><th>سلف</th><th>قسط السلف</th><th>خصومات</th><th>رصيد الإجازة</th><th>الصافي</th><th>المصروف</th><th>المتبقّي</th><th className="no-print">صرف</th><th className="no-print">كشف</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>{
              const lb = computeLeaveBalance(data, r.emp.id);
              return (
              <tr key={r.emp.id}>
                <td>{r.emp.name}{!r.wps && <div><span className="badge soon" style={{fontSize:10}}>خارج WPS</span></div>}{r.prorateDays!=null && <div style={{fontSize:10.5, color:'var(--brass)'}}>أول شهر: {r.prorateDays}/{r.prorateDim} يوم</div>}</td>
                <td>{money(r.base)}</td>
                <td>{money(r.gross)}</td>
                <td>{r.absentDays}</td>
                <td>−{money(r.absenceDeduction)}</td>
                <td>+{money(r.ot)}</td>
                <td>−{money(r.advances)}</td>
                <td>−{money(r.installments||0)}</td>
                <td>−{money(r.deductions)}</td>
                <td><span className={"badge "+(lb.remaining<=5?'soon':'ok')}>{lb.remaining}/{lb.entitled} يوم</span></td>
                <td style={{fontWeight:800}}>{money(r.net)}</td>
                <td style={{color:'var(--teal)'}}>{money(r.paid)}</td>
                <td>{r.net<=0 ? '—' : r.remaining<=0.009
                  ? <span className="badge ok">✓ مصروف</span>
                  : <span className={"badge "+(r.paid>0?'soon':'gray')}>{r.paid>0?'◐ ':''}{money(r.remaining)}</span>}</td>
                <td className="no-print">{!r.wps && r.remaining>0.009
                  ? <button className="btn brass small" onClick={()=>setPayFor(r.emp.id)}>صرف</button>
                  : <span style={{color:'var(--ink-faint)', fontSize:11}}>{r.wps?'مع WPS':''}</span>}</td>
                <td className="no-print"><button className="btn ghost small" onClick={()=>setSlipFor(r.emp.id)}>📄</button></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
      <div className="card grid grid-4" style={{padding:16, marginBottom:24}}>
        <div><div className="kpi-label">عدد الموظفين</div><div className="kpi-value" style={{fontSize:20}}>{rows.length}</div></div>
        <div><div className="kpi-label">إجمالي الرواتب الأساسية</div><div className="kpi-value" style={{fontSize:20}}>{money(rows.reduce((s,r)=>s+(r.base||0),0))}</div></div>
        <div><div className="kpi-label">إجمالي الأوفرتايم</div><div className="kpi-value" style={{fontSize:20}}>{money(rows.reduce((s,r)=>s+r.ot,0))}</div></div>
        <div><div className="kpi-label">إجمالي صافي الرواتب</div><div className="kpi-value" style={{fontSize:20, color:'var(--brass)'}}>{money(totalNet)}</div></div>
        <div><div className="kpi-label">المصروف فعلاً عن الشهر</div><div className="kpi-value" style={{fontSize:20, color:'var(--teal)'}}>{money(totalPaid)}</div></div>
        <div><div className="kpi-label">رواتب مستحقة لم تُصرف</div><div className="kpi-value" style={{fontSize:20, color:totalRemaining>0.009?'var(--rust)':'var(--ink)'}}>{money(totalRemaining)}</div></div>
      </div>
      {wpsOpen && <WpsRunModal ym={ym} rows={wpsRows} total={wpsTotal} outside={rows.length-wpsRows.length} onClose={()=>setWpsOpen(false)} onSave={confirmWpsRun} />}
      {payFor && (()=>{ const row = rows.find(r=>r.emp.id===payFor); return row ? <SalaryPartModal row={row} ym={ym} data={data} onClose={()=>setPayFor(null)} onSave={(f)=>addSalaryPart(row,f)} /> : null; })()}

      <div className="section-title"><h3 style={{fontSize:13.5}}>مخصص مكافأة نهاية الخدمة (تقديري — التزام متراكم)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>الموظف</th><th>تاريخ التعيين</th><th>مدة الخدمة</th><th>المكافأة المستحقة حتى اليوم</th></tr></thead>
          <tbody>
            {grats.map(g=>(
              <tr key={g.e.id}>
                <td>{g.e.name}</td>
                <td>{g.e.hireDate||'—'}</td>
                <td>{g.years.toFixed(1)} سنة</td>
                <td style={{fontWeight:700}}>{g.years<1 ? <span className="badge gray">أقل من سنة — لا تستحق</span> : money(g.amount)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}>
              <td colSpan={3}>إجمالي الالتزام المتراكم</td>
              <td>{money(gratTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:12}}>* حساب تقديري وفق قانون العمل الإماراتي: 21 يوماً من الراتب الأساسي عن كل سنة من أول 5 سنوات، و30 يوماً عمّا زاد. زر تسجيل صرف الرواتب يُنشئ حركة صرف واحدة لكل شهر لموظفي WPS. موظفو «خارج WPS» يُصرف لهم على دفعات بزر «صرف» — كل دفعة مصروف مستقل بتاريخها، ومجموعها لا يتجاوز الصافي. ملف WPS يشمل موظفي WPS فقط.</p>
    </div>
  );
}

/* ================= Dashboard ================= */
function Dashboard({data, go}){
  const totalRevenue = data.payments.reduce((s,i)=>s+billedOf(i),0);
  const totalExpenses = data.officeExpenses.filter(e=>!isArchived(e)).reduce((s,e)=>s+(e.amount||0),0) + data.projectCosts.filter(e=>!isArchived(e)).reduce((s,e)=>s+(e.amount||0),0);
  const govOutstanding = data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const activeProjects = data.projects.filter(p=>p.status==='جارٍ').length;

  const months = last6Months();
  const chartData = months.map(m=>({
    m,
    rev: data.payments.filter(i=>monthKey(i.date)===m).reduce((s,i)=>s+billedOf(i),0),
    exp: data.officeExpenses.filter(e=>!isArchived(e) && monthKey(e.date)===m).reduce((s,e)=>s+(e.amount||0),0)
       + data.projectCosts.filter(e=>!isArchived(e) && monthKey(e.date)===m).reduce((s,e)=>s+(e.amount||0),0),
  }));
  const maxVal = Math.max(1,...chartData.flatMap(d=>[d.rev,d.exp]));

  const nowYM = currentYM();
  const alerts = useMemo(()=>{
    const alerts = [];
    data.projects.filter(p=>p.status==='جارٍ' && (p.supervisionMonthly||0)>0).forEach(p=>{
    const has = data.payments.some(i=>i.projectId===p.id && i.phase==='إشراف' && i.month===nowYM);
    const done = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id && i.phase==='إشراف').length;
    if(!has && done < (p.supervisionMonths||0)){
      alerts.push({text:'دفعة إشراف '+fmtMonth(nowYM)+' لمشروع "'+p.name+'" لم تُسجل بعد', status:'soon', go:'payments'});
    }
  });
  data.payments.forEach(i=>{
    if(remainderOf(i)>0){
      const d = daysUntil(i.dueDate);
      if(d!==null && d<0) alerts.push({text:'دفعة متأخرة — '+((data.projects.find(p=>p.id===i.projectId)||{}).name||'')+' — متبقٍ '+money(remainderOf(i)*grossFactor(i))+' وتجاوزت الاستحقاق بـ '+Math.abs(d)+' يوم', status:'bad', go:'payments'});
    }
  });
  data.projects.filter(p=>p.status==='جارٍ').forEach(p=>{
    TIMELINE_STAGES.forEach(st=>{
      const s = (p.timeline||{})[st.key];
      if(s && s.status==='جارية' && s.startDate && s.targetDays && daysSince(s.startDate) > s.targetDays){
        const emp = (data.employees.find(e=>e.id===s.responsibleId)||{}).name || ((data.staffDir||[]).find(x=>x.empId===s.responsibleId)||{}).name || s.responsibleId;
        alerts.push({text:'مرحلة "'+st.label+'" — مشروع '+(p.projectNo||'')+' '+p.name+': تجاوزت المدة المستهدفة بـ '+(daysSince(s.startDate)-s.targetDays)+' يوم'+(emp?' (المسؤول: '+emp+')':''), status:'bad', go:'projects'});
      }
    });
    APPROVAL_ITEMS.forEach(name=>{
      const a = (p.approvals||{})[name];
      if(a && !a.done && a.submitDate && a.targetDays && daysSince(a.submitDate) > a.targetDays){
        const emp = (data.employees.find(e=>e.id===a.responsibleId)||{}).name || ((data.staffDir||[]).find(x=>x.empId===a.responsibleId)||{}).name || a.responsibleId;
        alerts.push({text:'اعتماد "'+name+'" — مشروع '+(p.projectNo||'')+': مقدَّم منذ '+daysSince(a.submitDate)+' يوم وتجاوز المتوقع بـ '+(daysSince(a.submitDate)-a.targetDays)+' يوم'+(emp?' (المسؤول: '+emp+')':''), status:'bad', go:'projects'});
      }
    });
    const billedP = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id).reduce((s,i)=>s+billedOf(i),0);
    const costsP = data.projectCosts.filter(e=>!isArchived(e) && e.projectId===p.id).reduce((s,e)=>s+(e.amount||0),0) + projectTimeCost(data, p.id);
    if(billedP>10000){
      const margin = (billedP-costsP)/billedP*100;
      if(margin<20) alerts.push({text:'هامش ربح مشروع '+(p.projectNo||'')+' '+p.name+' انخفض إلى '+margin.toFixed(0)+'% — راجع التكاليف ووقت الفريق', status:'soon', go:'analytics'});
    }
  });
  listQuarters().forEach(q=>{
    if(quarterEndDate(q) < todayISO()){
      const due = quarterDueDate(q);
      const dd = daysUntil(due);
      if(dd!==null && dd<=30) alerts.push({
        text:'إقرار ض.ق.م عن فترة '+quarterLabel(q)+' — '+(dd<0 ? ('تجاوز الاستحقاق بـ '+Math.abs(dd)+' يوم') : ('مستحق خلال '+dd+' يوم ('+due+')')),
        status: dd<0?'bad':'soon', go:'vat'});
    }
  });
  if(govOutstanding>0){
    alerts.push({text:'رسوم حكومية بقيمة '+money(govOutstanding)+' مدفوعة من خزينة المكتب ولم تُسترد من العملاء', status:'bad', go:'govFees'});
  }
  data.payments.filter(i=>!isArchived(i) && i.status!=='ملغاة' && i.method==='شيك' && i.chequeDueDate).forEach(i=>{
    const d = daysUntil(i.chequeDueDate);
    if(d!==null && d<=10){
      const p = data.projects.find(x=>x.id===i.projectId);
      alerts.push({text:'شيك مستلم من '+((p||{}).owner||(p||{}).name||'عميل')+' بقيمة '+money(i.amount*grossFactor(i))+' — '+(d<0?('تجاوز موعد صرفه بـ '+Math.abs(d)+' يوم'):('موعد صرفه المتوقع خلال '+d+' يوم ('+i.chequeDueDate+')')), status: d<0?'bad':'soon', go:'payments'});
    }
  });
  [...data.officeExpenses.map(e=>({...e, _src:'officeExpenses'})), ...data.projectCosts.map(e=>({...e, _src:'projectCosts'}))]
    .filter(e=>!isArchived(e) && e.account==='شيك' && e.chequeDueDate).forEach(e=>{
      const d = daysUntil(e.chequeDueDate);
      if(d!==null && d<=10){
        alerts.push({text:'شيك صادر رقم '+(e.chequeNo||'—')+' بقيمة '+money(e.amount)+' — '+(d<0?('تجاوز موعد صرفه بـ '+Math.abs(d)+' يوم'):('موعد صرفه المتوقع خلال '+d+' يوم ('+e.chequeDueDate+')')), status: d<0?'bad':'soon', go:e._src});
      }
    });
  // رواتب مستحقة لم تُصرف (موظفو خارج WPS) — الشهر السابق والحالي، متى بدأ صرف رواتب الشهر
  (()=>{
    const cur = currentYM(); const [cy,cm] = cur.split('-').map(Number);
    const prev = cm===1 ? (cy-1)+'-12' : cy+'-'+String(cm-1).padStart(2,'0');
    let tot = 0; const names = new Set();
    [prev, cur].forEach(m=>{
      if(!payrollPaidForMonth(data, m)) return;
      computePayroll(data, m).rows.filter(r=>!isWpsEmp(r.emp) && r.net>0).forEach(r=>{
        const rem = r.net - salaryPaidForEmp(data, r.emp.id, m, r.net);
        if(rem>0.009){ tot += rem; names.add(r.emp.name); }
      });
    });
    if(tot>0) alerts.push({text:'رواتب مستحقة لم تُصرف بقيمة '+money(tot)+' — '+[...names].join('، ')+' (خارج WPS)', status:'soon', go:'payroll'});
  })();
  const pendingExp = data.officeExpenses.filter(e=>!isArchived(e) && e.payStatus==='معلق');
  if(pendingExp.length>0){
    alerts.push({text:pendingExp.length+' مصروف مكتب معلق السداد بإجمالي '+money(pendingExp.reduce((s,e)=>s+expGross(e),0))+' — لم تُخصم من الخزينة بعد', status:'soon', go:'officeExpenses'});
  }
  data.recurringBills.filter(b=>!isArchived(b) && b.active!=='متوقف').forEach(b=>{
    const d = daysUntil(b.nextDueDate);
    if(d!==null && d<=(b.reminderDays||5)){
      alerts.push({text:'فاتورة "'+b.provider+'" ('+b.category+') بقيمة '+money(b.amount)+' — '+(d<0?('تجاوزت الاستحقاق بـ '+Math.abs(d)+' يوم'):(d===0?'مستحقة اليوم':('مستحقة خلال '+d+' يوم')))+' ('+b.nextDueDate+')', status: d<0?'bad':'soon', go:'recurringBills'});
    }
  });
  data.employees.filter(e=>!isArchived(e)).forEach(e=>{
    [['iqamaExpiry','إقامة'],['passportExpiry','جواز سفر'],['workCardExpiry','بطاقة عمل']].forEach(([field,label])=>{
      const d = daysUntil(e[field]);
      if(d!==null && d<=60) alerts.push({text:label+' '+e.name+' — '+expiryLabel(e[field]), status: d<0?'bad':'soon', go:'employees'});
    });
  });
    data.cars.forEach(c=>{
      const d = daysUntil(c.licenseExpiry);
      if(d!==null && d<=60) alerts.push({text:'رخصة سيارة '+c.model+' ('+c.plate+') — '+expiryLabel(c.licenseExpiry), status: d<0?'bad':'soon', go:'cars'});
    });
    return alerts;
  }, [data]);

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">الإيرادات الاستشارية <I.receipt style={{width:15,height:15,color:'var(--ink-faint)'}}/></div>
          <div className="kpi-value">{money(totalRevenue)}</div><div className="kpi-note">تصميم + إشراف · {data.payments.length} دفعة</div></div>
        <div className="card"><div className="kpi-label">إجمالي المصروفات <I.coin style={{width:15,height:15,color:'var(--ink-faint)'}}/></div>
          <div className="kpi-value">{money(totalExpenses)}</div><div className="kpi-note">مكتب + تكاليف مشاريع</div></div>
        <div className="card"><div className="kpi-label">أمانات معلقة الاسترداد <I.landmark style={{width:15,height:15,color:'var(--ink-faint)'}}/></div>
          <div className="kpi-value" style={{color:govOutstanding>0?'var(--rust)':'var(--ink)'}}>{money(govOutstanding)}</div><div className="kpi-note">رسوم حكومية لم يسددها العملاء</div></div>
        <div className="card"><div className="kpi-label">المشاريع الجارية <I.compass style={{width:15,height:15,color:'var(--ink-faint)'}}/></div>
          <div className="kpi-value">{activeProjects}</div><div className="kpi-note">من إجمالي {data.projects.length} مشروع</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-title"><h3>الإيرادات مقابل المصروفات — آخر 6 أشهر</h3><div className="rule"></div></div>
          <div className="bars">
            {chartData.map(d=>(
              <div className="bar-col" key={d.m}>
                <div className="bar-wrap">
                  <div className="bar rev" style={{height:(d.rev/maxVal*130)+'px'}} title={money(d.rev)}></div>
                  <div className="bar exp" style={{height:(d.exp/maxVal*130)+'px'}} title={money(d.exp)}></div>
                </div>
                <div className="bar-label">{monthNamesAr[parseInt(d.m.split('-')[1],10)-1]}</div>
                <div style={{fontSize:9.5, color:'var(--brass)', fontWeight:700, marginTop:2}}>{fmt(d.rev)}</div>
                <div style={{fontSize:9.5, color:'var(--ink-faint)', fontWeight:700}}>{fmt(d.exp)}</div>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i style={{background:'var(--brass)'}}></i> الإيرادات الاستشارية</span>
            <span><i style={{background:'var(--ink-faint)'}}></i> المصروفات</span>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:12, paddingTop:12, borderTop:'1px solid var(--line)', fontSize:12.5}}>
            <span>إجمالي الإيرادات (6 أشهر): <b style={{color:'var(--brass)'}}>{money(chartData.reduce((s,d)=>s+d.rev,0))}</b></span>
            <span>إجمالي المصروفات (6 أشهر): <b style={{color:'var(--ink-soft)'}}>{money(chartData.reduce((s,d)=>s+d.exp,0))}</b></span>
          </div>
        </div>

        <div className="card decisions-card" style={{alignSelf:'start'}}>
          <div className="section-title"><h3>أحدث قرارات المشاريع</h3><div className="rule"></div></div>
          {(data.decisions||[]).length===0 && <p style={{fontSize:12.5, color:'var(--ink-faint)'}}>لا قرارات مسجلة بعد — تُضاف من ملف المشروع أو باستيراد واتساب.</p>}
          {[...(data.decisions||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6).map(dc=>{
            const proj = data.projects.find(p=>p.id===dc.projectId)||{};
            const dd = daysSince(dc.date);
            const rel = dd===0?'اليوم':dd===1?'أمس':dd!==null?('منذ '+dd+' يوم'):'';
            return (
              <div className="alert-item" key={dc.id} onClick={()=>go('projects')} style={{cursor:'pointer'}}>
                <span><b style={{color:'var(--brass)'}}>{proj.projectNo||''}</b> {dc.description.slice(0,70)}{dc.description.length>70?'…':''}</span>
                <span style={{fontSize:10.5, color:'var(--ink-faint)', flexShrink:0}}>{rel}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-2" style={{marginTop:18}}>
        <div className="card">
          <div className="section-title"><h3>تنبيهات هامة</h3><div className="rule"></div><I.bell style={{width:16,height:16,color:'var(--brass)'}}/></div>
          {alerts.length===0 && <p style={{fontSize:13, color:'var(--ink-faint)'}}>لا توجد تنبيهات حالياً. كل شيء تحت السيطرة.</p>}
          {alerts.slice(0,8).map((a,idx)=>(
            <div className="alert-item" key={idx} onClick={()=>go(a.go)} style={{cursor:'pointer'}}>
              <span>{a.text}</span>
              <span className={"badge "+a.status}>{a.status==='bad'?'عاجل':'قريباً'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= شاشة الدخول ================= */
function LoginView({onLogin, sbRef}){
  const [mode, setMode] = useState('in'); // in | up
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async ()=>{
    if(!email || !pass){ setMsg('أدخل البريد وكلمة المرور'); return; }
    setBusy(true); setMsg('');
    try{
      if(false){
      } else {
        const {error} = await sbRef.current.auth.signInWithPassword({email, password:pass});
        if(error) throw error;
        onLogin();
      }
    }catch(e){ setMsg(e.message==='Invalid login credentials' ? 'بيانات الدخول غير صحيحة' : (e.message||'حدث خطأ')); }
    setBusy(false);
  };

  return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)'}}>
      <div style={{background:'#fff', borderRadius:8, padding:'34px 38px', width:380, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,.4)', borderTop:'4px solid var(--brass)'}}>
        <div style={{textAlign:'center', marginBottom:22}}>
          <img src={NITAQ_LOGO} alt="نطاق" style={{width:110, filter:'invert(1) brightness(0.15)'}} />
          <div style={{fontFamily:'Cairo', fontWeight:900, fontSize:15, color:'var(--ink)', marginTop:8}}>نظام نطاق ERP — النسخة السحابية</div>
        </div>
        {mode==='up' && (
          <div className="field" style={{marginBottom:12}}>
            <label>الاسم</label>
            <input value={name} onChange={e=>setName(e.target.value)} />
          </div>
        )}
        <div className="field" style={{marginBottom:12}}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{direction:'ltr'}} />
        </div>
        <div className="field" style={{marginBottom:16}}>
          <label>كلمة المرور</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} style={{direction:'ltr'}}
            onKeyDown={e=>{ if(e.key==='Enter') submit(); }} />
        </div>
        {msg && <p style={{fontSize:12, color:'var(--rust)', marginBottom:12}}>{msg}</p>}
        <button className="btn brass" style={{width:'100%', justifyContent:'center'}} disabled={busy} onClick={submit}>
          {busy ? '...' : (mode==='in' ? 'تسجيل الدخول' : 'إنشاء حساب')}
        </button>
        <p style={{fontSize:12,textAlign:"center",marginTop:14}}>حسابات معتمدة من الإدارة فقط؛ لا تُمنح صلاحيات الحسابات تلقائيًا.</p>
        <p style={{fontSize:10.5, textAlign:'center', marginTop:8, color:'var(--ink-faint)'}}>إتاحة الحسابات وتغيير الأدوار من الإدارة فقط؛ الدعوة الهندسية لا تمنح وصولًا للحسابات.</p>
      </div>
    </div>
  );
}

/* ================= إدارة المستخدمين والصلاحيات (للمالك) ================= */
function UsersView({sbRef, myId}){
  const [rows, setRows] = useState(null);
  const load = async ()=>{
    const {data, error} = await sbRef.current.from('nitaq_profiles').select('*').order('created_at');
    if(!error) setRows(data||[]);
  };
  useEffect(()=>{ load(); },[]);
  const setRole = async (user_id, role)=>{
    const {error} = await sbRef.current.from('nitaq_profiles').update({role}).eq('user_id', user_id);
    if(error) alert('تعذر التعديل: '+error.message); else load();
  };
  const ROLE_AR = {owner:'مالك — صلاحية كاملة', accountant:'محاسب — كل المالية', engineer:'مهندس — المشاريع والقرارات'};
  return (
    <div>
      <div className="card" style={{padding:0, maxWidth:760}}>
        <table>
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th></tr></thead>
          <tbody>
            {rows===null && <tr className="empty-row"><td colSpan={3}>جارٍ التحميل...</td></tr>}
            {rows && rows.length===0 && <tr className="empty-row"><td colSpan={3}>لا مستخدمين بعد</td></tr>}
            {rows && rows.map(r=>(
              <tr key={r.user_id}>
                <td>{r.name||'—'}{r.user_id===myId && <span className="badge neutral" style={{marginInlineStart:8}}>أنت</span>}</td>
                <td style={{direction:'ltr', textAlign:'right'}}>{r.email}</td>
                <td>
                  <select value={r.role} disabled={r.user_id===myId}
                    onChange={e=>setRole(r.user_id, e.target.value)}
                    style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', fontSize:12}}>
                    {Object.entries(ROLE_AR).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:12}}>* الصلاحيات مطبقة على مستوى قاعدة البيانات نفسها (RLS) — المهندس لا يمكنه قراءة البيانات المالية حتى تقنياً. ملاحظة: بيانات الموظفين (شاملة الرواتب الأساسية) مقروءة لكل الأدوار لأن الأسماء مطلوبة في ملفات المراحل — أخبرني إن أردت فصل الرواتب في جدول مستقل.</p>
    </div>
  );
}

/* ================= App ================= */
const VIEW_TITLES = {
  fcc:['مركز القيادة المالية','ماذا يجب أن يحدث اليوم؟ — قائمة إجراءات مولّدة تلقائياً من بيانات النظام'],
  dashboard:['لوحة التحكم','نظرة عامة على أداء المكتب المالي والإداري'],
  projects:['المشاريع','المشروع هو محور النظام — افتح ملف أي مشروع لإدارة كل تفاصيله'],
  contracts:['العقود','تصميم واعتماد · إشراف · تعديل مخططات · أعمال إضافية'],
  settings:['الإعدادات','مسار مجلدات المشاريع وبيانات الحساب البنكي والربط السحابي'],
  users:['المستخدمون والصلاحيات','مالك · محاسب · مهندس — الصلاحيات مطبقة على مستوى قاعدة البيانات'],
  audit:['سجل التدقيق','كل عملية إنشاء وتعديل وإلغاء وإصدار — بالمستخدم والوقت، غير قابل للتعديل'],
  payments:['الدفعات الاستشارية','دفعات مرحلة التصميم والاعتماد ودفعات الإشراف الشهري'],
  projectRevenue:['إيرادات المشاريع','الإيرادات الاستشارية المفوترة والمحصّلة لكل مشروع — بفلاتر النوع والحالة والحساب والفترة، قابلة للطباعة'],
  decisions:['القرارات والوقائع','السجل الرسمي لقرارات المشاريع — من واتساب والاجتماعات والموقع، بعد اعتمادها'],
  govFees:['الرسوم الحكومية','أمانات الدوائر: التخطيط والمساحة · سيوا · الاتصالات · الدفاع المدني · البلدية'],
  officeExpenses:['مصروفات المكتب','المصروفات العمومية والإدارية غير المرتبطة بمشروع'],
  projectCosts:['تكاليف المشاريع','التكاليف المباشرة المحمّلة على كل مشروع'],
  recurringBills:['الفواتير الدورية','اشتراكات وفواتير متكررة: اتصالات · إنترنت · كهرباء وماء (سيوا) · إيجار وغيرها — مع تنبيه قبل كل استحقاق'],
  treasury:['الخزينة والبنك','الأرصدة الفعلية وحركة النقدية — وارد وصادر'],
  dues:['الذمم — مدينون ودائنون','من يدين لك وما يستحق عليك في لحظة واحدة'],
  vat:['ضريبة القيمة المضافة','فترات ربع سنوية وفق شهادة التسجيل — TRN: '+COMPANY.trn],
  statement:['كشف حساب مشروع','كشف تفصيلي بالدفعات والأمانات يُعرض على المالك أو الاستشاري عند الطلب'],
  reports:['التقارير المالية','قائمة الدخل وربحية المشاريع وتقرير الأمانات'],
  analytics:['التحليلات الذكية','هوامش الربح · توقع التدفق النقدي · كشف الشواذ · اقتراحات الفوترة · التقرير الشهري AR/EN'],
  employees:['الموظفون','بيانات الموظفين والإقامات'],
  attendance:['الحضور والانصراف','تسجيل الحضور اليومي للموظفين'],
  leaves:['الإجازات','تسجيل إجازات الموظفين وتتبّع الرصيد السنوي'],
  timesheets:['تتبّع الوقت','ساعات عمل المهندسين على كل مشروع — تُحسب تكلفتها وتُحمّل على ربحية المشروع'],
  docAlerts:['تنبيهات الوثائق','كل وثائق الموظفين والسيارات القريبة من الانتهاء في مكان واحد'],
  overtime:['الأوفرتايم','تسجيل ساعات العمل الإضافية'],
  advances:['السلف والخصومات','متابعة سلف ومستحقات الموظفين'],
  payroll:['الرواتب','كشف رواتب الموظفين الشهري'],
  cars:['سيارات الشركة','متابعة سيارات الشركة ورخصها'],
};

function App(){
  const [data, setDataState] = useState(seedData());
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('dashboard');
  const saveTimer = useRef(null);
  const dataRef = useRef(data);
  const [persistStatus, setPersistStatus] = useState(NITAQ_PERSIST.status);
  const [syncState,setSyncState]=useState(NITAQ_SYNC.state);
  const syncAllowed=useRef(false);
  const bootstrapGeneration=useRef(0);
  const bootstrapTail=useRef(Promise.resolve());
  const authSubscription=useRef(null);
  const remoteDirty=useRef(false);
  useEffect(()=>NITAQ_SYNC.subscribe(setSyncState),[]);
  const hydrate=(next)=>{
    if(NITAQ_PERSIST.blocked)return false;
    try{NITAQ_PERSIST.validate(next);dataRef.current=next;NITAQ_PERSIST.changed(next);setDataState(next);return true;}
    catch(e){NITAQ_PERSIST.fail(e,'remote');return false;}
  };
  useEffect(()=>{const handle=e=>{if(syncAllowed.current)hydrate(recordsToData(e.detail));};window.addEventListener('nitaq-sync-snapshot',handle);return()=>window.removeEventListener('nitaq-sync-snapshot',handle);},[]);
  const persistQueue = useRef(Promise.resolve());
  const importBusy = useRef(false);
  useEffect(()=>NITAQ_PERSIST.subscribe(setPersistStatus),[]);
  const setData = (change)=>{
    if(NITAQ_PERSIST.blocked||(getSbConfig()&&!syncAllowed.current)) return false;
    try{
      const next=typeof change==='function'?change(dataRef.current):change;
      NITAQ_PERSIST.validate(next);
      if(next===dataRef.current)return true;
      dataRef.current=next;
      NITAQ_PERSIST.changed(next);
      setDataState(next);
      return true;
    }catch(e){NITAQ_PERSIST.fail(e,'data');return false;}
  };

  /* ---------- السحابة ---------- */
  const sbRef = useRef(null);
  const channelRef = useRef(null);
  const [cloud, setCloud] = useState({status: getSbConfig() ? 'init' : 'off', profile:null, msg:''});
  const [cloudEmpty, setCloudEmpty] = useState(false);
  const cloudReady = cloud.status==='ready';

  const applyRemote=(payload)=>{
    if(NITAQ_PERSIST.blocked)return;
    if(!NITAQ_SYNC.identity){remoteDirty.current=true;return;}
    try{NITAQ_SYNC.remote(payload);}catch(e){setCloud(c=>({...c,msg:'⚠ تعذر تحديث السجل؛ ستُعاد قراءة السحابة'}));remoteDirty.current=true;}
  };

  const runCloudBootstrap=async()=>{
    await NITAQ_PERSIST.localGate;if(NITAQ_PERSIST.blocked)return;
    const attempt=++bootstrapGeneration.current;syncAllowed.current=false;
    setCloud(c=>({...c,status:'loading',msg:''}));
    try{
      const sb=sbRef.current,cfg=getSbConfig();
      const userRes=await sb.auth.getUser();if(userRes.error)throw userRes.error;
      const user=userRes.data?.user;if(!user){setCloud({status:'login',profile:null,msg:''});return;}
      const profileResult=await sb.from('nitaq_profiles').select('*').eq('user_id',user.id).single();
      if(profileResult.error||!profileResult.data||!['owner','accountant','engineer'].includes(profileResult.data.role))throw Error('تعذر التحقق من ملف المستخدم وصلاحياته.');
      if(attempt!==bootstrapGeneration.current)return;
      if(channelRef.current)await sb.removeChannel(channelRef.current);
      const legacyKey='nitaq-sync:pre-client-upgrade:v1';
      const legacy=await NITAQ_PERSIST.readAux(legacyKey);
      if(legacy===null)await NITAQ_PERSIST.writeAux(legacyKey,JSON.stringify(dataRef.current));
      else NITAQ_PERSIST.validate(NITAQ_PERSIST.parse(legacy));
      remoteDirty.current=false;
      channelRef.current=sb.channel('nitaq-rec-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'nitaq_records'},applyRemote).subscribe();
      const rows=await NITAQ_SYNC.attach({client:createNitaqScopedTransport(sb,cfg,user.id),url:cfg.url,userId:user.id});
      if(attempt!==bootstrapGeneration.current)return;
      syncAllowed.current=true;hydrate(recordsToData(rows));
      setCloud({status:'ready',profile:profileResult.data,msg:'✓ تم التحقق من الاتصال'});
      setCloudEmpty(rows.length===0);setLoaded(true);
      if(profileResult.data.role==='engineer')setView('projects');
      if(remoteDirty.current){remoteDirty.current=false;await NITAQ_SYNC.refresh();}
      await NITAQ_SYNC.flush();
    }catch(e){if(attempt===bootstrapGeneration.current){syncAllowed.current=false;setCloud(c=>({...c,status:'error',msg:e.message||'تعذر تحميل السحابة كاملة'}));}}
  };
  const cloudBootstrap=()=>{const task=bootstrapTail.current.then(runCloudBootstrap);bootstrapTail.current=task.catch(()=>{});return task;};

  const connectCloud = async ()=>{
    await NITAQ_PERSIST.localGate;
    if(NITAQ_PERSIST.blocked) return;
    const cfg = getSbConfig();
    if(!cfg || !cfg.url || !cfg.key) return;
    setCloud(c=>({...c, status:'init', msg:''}));
    let lastErr = null;
    for(let attempt=0; attempt<3 && !window.supabase; attempt++){
      try{ await loadScript(SB_CDN); break; }
      catch(e){ lastErr = e; await new Promise(r=>setTimeout(r, 1200)); }
    }
    if(!window.supabase){
      setCloud(c=>({...c, status:'error', msg:'تعذر تحميل مكتبة السحابة — تحقق من الإنترنت أو اضغط إعادة المحاولة'}));
      return;
    }
    try{
      sbRef.current = window.supabase.createClient(cfg.url, cfg.key);
      const sessRes = await sbRef.current.auth.getSession();
      if(sessRes.data && sessRes.data.session) await cloudBootstrap();
      else setCloud(c=>({...c, status:'login'}));
      authSubscription.current?.unsubscribe?.();
      const authResult=sbRef.current.auth.onAuthStateChange((ev,session)=>{
        if(ev==='SIGNED_OUT'){++bootstrapGeneration.current;syncAllowed.current=false;setTimeout(()=>clearCloudSession().catch(e=>NITAQ_PERSIST.fail(e,'logout')),0);}
        else if(ev==='SIGNED_IN'&&session?.user?.id!==NITAQ_SYNC.identity?.userId){++bootstrapGeneration.current;syncAllowed.current=false;setCloud(c=>({...c,status:'loading'}));setTimeout(()=>cloudBootstrap(),0);}
      });
      authSubscription.current=authResult.data?.subscription;
    }catch(e){ setCloud(c=>({...c, status:'error', msg:'تعذر الاتصال بالسحابة — تحقق من الإنترنت أو اضغط إعادة المحاولة'})); }
  };

  useEffect(()=>{ connectCloud(); },[]);

  const cloudUpsert=(entity,rec)=>{
    if(NITAQ_PERSIST.blocked||!getSbConfig())return;
    if(!syncAllowed.current||!rec?.id){NITAQ_PERSIST.fail(Error('لم تجهز هوية المزامنة؛ نزّل نسخة إنقاذ.'),'sync');return;}
    try{NITAQ_SYNC.enqueue('upsert',String(rec.id),entity,rec).catch(()=>{});}catch(e){NITAQ_PERSIST.fail(e,'sync');}
  };
  const cloudDelete=(id)=>{
    if(NITAQ_PERSIST.blocked||!getSbConfig())return;
    const entity=NITAQ_SYNC.findEntity(id);
    if(!syncAllowed.current||!entity){NITAQ_PERSIST.fail(Error('تعذر تحديد سجل الحذف في السحابة؛ لم نرسل حذفًا غير مؤكد.'),'sync');return;}
    try{NITAQ_SYNC.enqueue('delete',String(id),entity,null).catch(()=>{});}catch(e){NITAQ_PERSIST.fail(e,'sync');}
  };
  const pushAllToCloud=()=>alert('رفع قاعدة محلية كاملة متوقف لحين مراجعة الاستيراد السحابي. لا تُرفع البيانات تلقائيًا لمجرد أن النتيجة فارغة.');
  const clearCloudSession=async()=>{
    ++bootstrapGeneration.current;syncAllowed.current=false;
    setCloud({status:'login',profile:null,msg:''});
    if(saveTimer.current)clearTimeout(saveTimer.current);
    const sb=sbRef.current;if(channelRef.current&&sb){await sb.removeChannel(channelRef.current);channelRef.current=null;}
    await NITAQ_SYNC.detach();await persistQueue.current;
    fileHandleRef.current=null;setFileLinked(false);
    const empty=recordsToData([]);hydrate(empty);
    await store.set('nitaq-data',JSON.stringify(empty));NITAQ_PERSIST.saved(NITAQ_PERSIST.revision);
  };
  const logout=async()=>{
    if(NITAQ_SYNC.state.pending&&!confirm('توجد عمليات لم تؤكدها السحابة. ستبقى محفوظة لهذا الحساب على هذا الجهاز. هل تريد تسجيل الخروج؟'))return;
    if(sbRef.current){const result=await sbRef.current.auth.signOut();if(result.error)alert(result.error.message);}
  };
  useEffect(()=>{
    const tick=()=>{if(syncAllowed.current&&!NITAQ_PERSIST.blocked){NITAQ_SYNC.flush().catch(e=>setCloud(c=>({...c,msg:e.message})));NITAQ_SYNC.refresh().catch(e=>setCloud(c=>({...c,msg:'⚠ تعذر تحديث السحابة؛ النسخة المعروضة محفوظة'})));}};
    window.addEventListener('online',tick);window.addEventListener('focus',tick);
    const timer=setInterval(tick,60000);
    return()=>{clearInterval(timer);window.removeEventListener('online',tick);window.removeEventListener('focus',tick);};
  },[]);
  const exportSyncQueue=()=>{
    const url=URL.createObjectURL(new Blob([NITAQ_SYNC.exportPending()],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='nitaq-pending-sync-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };

  const fileHandleRef = useRef(null);
  const [fileLinked, setFileLinked] = useState(false);
  const [saveState, setSaveState] = useState('');

  useEffect(()=>{
    (async()=>{
      try{
        const raw=await store.get('nitaq-data');
        const initial=raw===null?seedData():NITAQ_PERSIST.prepare(NITAQ_PERSIST.parse(raw));
        dataRef.current=initial;
        NITAQ_PERSIST.loaded(initial);
        setDataState(initial);
        setLoaded(true);
      }catch(e){NITAQ_PERSIST.fail(e,'read');}
      finally{NITAQ_PERSIST.finishLocal();}
    })();
  },[]);

  useEffect(()=>{
    if(!loaded||NITAQ_PERSIST.blocked)return;
    if(saveTimer.current)clearTimeout(saveTimer.current);
    const snapshot=data;
    const ticket=NITAQ_PERSIST.revision;
    saveTimer.current=setTimeout(()=>{
      persistQueue.current=persistQueue.current.then(async()=>{
        if(NITAQ_PERSIST.blocked)return;
        await store.set('nitaq-data',JSON.stringify(snapshot));
        if(fileHandleRef.current){
          const writable=await fileHandleRef.current.createWritable();
          await writable.write(JSON.stringify(snapshot,null,2));
          await writable.close();
          setSaveState('✓ محفوظ في الملف');
        }
        NITAQ_PERSIST.saved(ticket);
      }).catch(e=>{setSaveState('⚠ توقف الحفظ');NITAQ_PERSIST.fail(e,'save');});
    },500);
    return ()=>clearTimeout(saveTimer.current);
  },[data,loaded]);

  const replaceFromFile = async (prepared)=>{
    if(NITAQ_PERSIST.blocked||importBusy.current) return false;
    if(getSbConfig())throw Error('استبدال البيانات من ملف متوقف أثناء تفعيل Supabase لحماية النسخة المشتركة. الاسترجاع السحابي يتم بمسار منفصل؛ لم نغير بياناتك.');
    if(!confirm('سيتم استبدال البيانات المحلية بعد حفظ نسخة استرجاع تلقائية. عدد الملاحظات التاريخية: '+prepared.warnings.length+' (تُحفظ دون حذف). هل تريد المتابعة؟'))return false;
    importBusy.current=true;
    try{
      NITAQ_PERSIST.beginReplacement();
      if(saveTimer.current)clearTimeout(saveTimer.current);
      await persistQueue.current;
      const previous=JSON.parse(JSON.stringify(dataRef.current));
      await NITAQ_PERSIST.replaceStored(prepared.data,previous);
      dataRef.current=prepared.data;
      NITAQ_PERSIST.remember(prepared.data);
      setDataState(prepared.data);
      if(fileHandleRef.current){
        const writable=await fileHandleRef.current.createWritable();
        await writable.write(JSON.stringify(prepared.data,null,2));
        await writable.close();
      }
      NITAQ_PERSIST.finishReplacement(prepared.data);
      return true;
    }catch(e){NITAQ_PERSIST.fail(e,'import-failed');throw e;}
    finally{importBusy.current=false;}
  };

  const linkDataFile = async ()=>{
    if(NITAQ_PERSIST.blocked||importBusy.current) return;
    if(!window.showOpenFilePicker || !window.showSaveFilePicker){
      alert('ربط ملف بيانات متاح على Chrome وEdge على الكمبيوتر. استخدم النسخة الاحتياطية على الأجهزة الأخرى.');return;
    }
    const openExisting=confirm('موافق: استبدال البيانات المحلية من ملف موجود بعد حفظ نسخة استرجاع. إلغاء: إنشاء ملف حفظ جديد للبيانات الحالية.');
    try{
      let handle;
      if(openExisting){
        if(getSbConfig())throw Error('فتح ملف لاستبدال البيانات متوقف أثناء تفعيل Supabase. يمكنك إنشاء ملف حفظ جديد للبيانات الحالية.');
        const picked=await window.showOpenFilePicker({types:[{description:'Nitaq Data',accept:{'application/json':['.json']}}]});
        handle=picked[0];
        const file=await handle.getFile();
        if(file.size>NITAQ_PERSIST.maxImportBytes)throw Error('الملف أكبر من 20 ميجابايت.');
        const prepared=NITAQ_PERSIST.prepareImport(NITAQ_PERSIST.parse(await file.text()));
        if(!await replaceFromFile(prepared))return;
      }else{
        handle=await window.showSaveFilePicker({suggestedName:'nitaq-data.json',types:[{description:'Nitaq Data',accept:{'application/json':['.json']}}]});
      }
      if(NITAQ_PERSIST.blocked)return;
      if(handle.requestPermission&&await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('لم يتم منح صلاحية الكتابة؛ لم يتم ربط الملف.');
      fileHandleRef.current=handle;
      setFileLinked(true);
      NITAQ_PERSIST.changed(dataRef.current);
      const fileTicket=NITAQ_PERSIST.revision;
      persistQueue.current=persistQueue.current.then(async()=>{
        if(NITAQ_PERSIST.blocked)return;
        const snapshot=JSON.parse(JSON.stringify(dataRef.current));
        await store.set('nitaq-data',JSON.stringify(snapshot));
        const writable=await handle.createWritable();
        await writable.write(JSON.stringify(snapshot,null,2));await writable.close();
        NITAQ_PERSIST.saved(fileTicket);
        setSaveState('✓ تم حفظ البيانات الحالية في الملف المرتبط');
      }).catch(e=>NITAQ_PERSIST.fail(e,'file'));
      await persistQueue.current;
    }catch(e){if(e.name!=='AbortError')alert(e.message||'تعذر فتح الملف.');}
  };

  const configs = useMemo(()=>{const all=buildConfigs(data);for(const key of Object.keys(FINANCIAL_BUNDLE_RULES))if(all[key])all[key]={...all[key],entityKey:key};return all;}, [data]);

  // بناء قائمة القيم قبل/بعد كاملة (كل الحقول المتغيرة، بلا اقتصاص) للتوثيق الجنائي
  const AUDIT_SKIP = new Set(['_ts','docSnapshot','_financialCorrection']);
  const auditShort = (v)=>{
    if(v===undefined||v===null||v==='') return '—';
    if(typeof v==='object') return JSON.stringify(v).slice(0,120);
    return String(v).slice(0,120);
  };
  const buildChanges = (before, after)=>{
    const keys = new Set([...Object.keys(before||{}), ...Object.keys(after||{})]);
    const diffs = [];
    keys.forEach(k=>{
      if(AUDIT_SKIP.has(k)) return;
      const b=before?before[k]:undefined, a=after?after[k]:undefined;
      if(JSON.stringify(b)!==JSON.stringify(a)) diffs.push({field:k, before:auditShort(b), after:auditShort(a)});
    });
    return diffs;
  };
  const auditWrite = (action, entity, recordId, summary, changes)=>{
    if(NITAQ_PERSIST.blocked) return;
    if(entity==='auditLog') return;
    const rec = {
      id: uid(), _ts: Date.now(),
      at: new Date().toISOString().slice(0,16).replace('T',' '),
      user: (cloud.profile && cloud.profile.name) || 'مستخدم محلي',
      action, entity, recordId: String(recordId||''), summary: (summary||'').slice(0,300),
      changes: Array.isArray(changes) ? changes.slice(0,40) : undefined,
    };
    setData(d=>({...d, auditLog:[...(d.auditLog||[]), rec]}));
    cloudUpsert('auditLog', rec);
  };
  const describeRecord = (key, r)=>{
    if(!r) return '';
    const dd = dataRef.current;
    const projN = (id)=>{ const p=(dd.projects||[]).find(x=>x.id===id); return p?((p.projectNo?p.projectNo+' — ':'')+(p.name||'')):''; };
    const empN = (id)=>{ const e=(dd.employees||[]).find(x=>x.id===id); return e?e.name:((dd.staffDir||[]).find(s=>s.empId===id)||{}).name||''; };
    if(key==='payments') return (r.label || (r.phase==='إشراف'?'إشراف '+(r.month||''):r.phase) || '') + ' — ' + money(r.amount||0) + (r.projectId?' — '+projN(r.projectId):'');
    if(key==='projects') return (r.projectNo?r.projectNo+' — ':'')+(r.name||'');
    if(key==='contracts') return (r.type||r.category||'')+' — '+(r.description||'')+(r.projectId?' — '+projN(r.projectId):'');
    if(key==='govFees') return (r.department||'')+' — '+money(r.amount||0)+(r.projectId?' — '+projN(r.projectId):'');
    if(key==='officeExpenses') return (r.category||'مصروف')+(r.vendor?' — '+r.vendor:'')+' — '+money(r.amount||0)+(r.bankName?' — '+r.bankName:'')+(r.note?' — '+String(r.note).slice(0,40):'');
    if(key==='projectCosts') return (r.category||'تكلفة')+' — '+money(r.amount||0)+(r.projectId?' — '+projN(r.projectId):'');
    if(key==='treasury') return (r.type||r.kind||'حركة')+' — '+money(r.amount||0)+(r.account?' — '+r.account:'')+(r.note?' — '+String(r.note).slice(0,40):'');
    if(key==='otherIncome') return (r.category||'إيراد آخر')+' — '+money(r.amount||0)+(r.vatable==='خاضع'?' (خاضع)':' (معفى)')+(r.account?' — '+r.account:'');
    if(key==='employees') return (r.name||'')+(r.position?' — '+r.position:'')+(r.baseSalary?' — راتب '+money(r.baseSalary):'');
    if(key==='overtime') return (empN(r.employeeId)||'موظف')+' — '+(r.hours||0)+' ساعة'+(r.date?' — '+r.date:'');
    if(key==='advances') return (empN(r.employeeId)||'موظف')+' — '+(r.type||'')+' '+money(r.amount||0)+(r.mode==='مقسّط'?' (قسط '+money(r.monthlyInstallment||0)+')':'');
    if(key==='leaves') return (empN(r.employeeId)||'موظف')+' — '+(r.type||'')+' '+(r.days||0)+' يوم'+(r.fromDate?' من '+r.fromDate:'');
    if(key==='timesheets') return (empN(r.employeeId)||'مهندس')+' — '+(Number(r.hours)||0)+' ساعة'+(r.projectId?' على '+projN(r.projectId):'')+(r.phase?' ('+r.phase+')':'')+(r.task?' — '+String(r.task).slice(0,40):'');
    if(key==='cars') return (r.model||r.plate||'سيارة')+(r.plate&&r.model?' — '+r.plate:'');
    if(key==='recurringBills') return (r.provider||r.category||'فاتورة')+' — '+money(r.amount||0);
    if(key==='decisions') return (r.category||'قرار')+' — '+String(r.description||r.note||'').slice(0,50);
    return r.name || r.label || r.description || r.category || '';
  };
  const authorizeBundle=(key,before,after,kind='update')=>{
    const check=financialBundleControl(key,before,after,kind,dataRef.current);
    if(check.error){alert(check.error);return null;}
    if(!['owner','accountant'].includes(role)&&!(role==='engineer'&&check.engineerAllowed)){alert('هذا السجل المالي متاح للمالك والمحاسب؛ المهندس يسجل الرسوم غير المسددة فقط.');return null;}
    if(after?.kind==='رواتب'&&['officeExpenses','treasury'].includes(key)){
      if(after.amount<0||(key==='treasury'&&after.type!=='صرف')||(key==='officeExpenses'&&after.payStatus==='معلق')){alert('قيد صرف الرواتب يجب أن يكون صرفًا غير سالب، وليس قبضًا أو مبلغًا معلقًا.');return null;}
      if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(after.month||'')){alert('شهر الراتب مطلوب بصيغة صحيحة.');return null;}
      if([...(dataRef.current.officeExpenses||[]),...(dataRef.current.treasury||[])].some(x=>x.kind==='رواتب'&&x.month===after.month&&x.id!==after.id)){alert('يوجد صرف مسجل لهذا الشهر بالفعل؛ لا نكرر قيد الرواتب.');return null;}
    }
    if(after?.kind===SALARY_PART_KIND){
      if(key!=='officeExpenses'){alert('دفعة الراتب تُسجَّل كمصروف مكتب فقط.');return null;}
      if(!(typeof after.amount==='number'&&after.amount>0)||after.payStatus==='معلق'){alert('دفعة الراتب يجب أن تكون مبلغًا مدفوعًا أكبر من صفر.');return null;}
      if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(after.month||'')){alert('شهر الراتب مطلوب بصيغة صحيحة.');return null;}
      const cur=dataRef.current;const emp=(cur.employees||[]).find(e=>e.id===after.employeeId);
      if(!emp){alert('الموظف غير موجود.');return null;}
      if(isWpsEmp(emp)){alert('هذا الموظف مسجّل عبر WPS — يُصرف راتبه مع «صرف الرواتب». غيّري طريقة صرف راتبه من ملفه أولاً لو لزم.');return null;}
      if(!isArchived(after)){
        const row=computePayroll(cur,after.month).rows.find(r=>r.emp.id===emp.id);const net=row?row.net:0;
        const others=salaryPaymentsForEmp(cur,emp.id,after.month,net).filter(x=>x.id!==after.id);
        if(others.some(x=>x.legacy)){alert('رواتب هذا الشهر مسجّلة كصرف كامل بقيد قديم — لا يمكن إضافة دفعة.');return null;}
        const already=others.reduce((s,x)=>s+x.amount,0);
        if(already+after.amount>net+0.01){alert('المبلغ يتجاوز المتبقي من راتب '+emp.name+' ('+money(Math.max(0,net-already))+').');return null;}
      }
    }
    if(check.correction){
      if(role!=='owner'){alert('تصحيح البيانات المالية المسجلة متاح للمالك فقط بسبب جديد يسجل على الخادم.');return null;}
      const explicit=after.lastCorrectionAt&&after.lastCorrectionAt!==before?.lastCorrectionAt?after.lastCorrectionReason:(after.archived===true&&before?.archived!==true?after.archiveReason:null);
      const reason=typeof explicit==='string'&&explicit.trim()?explicit.trim():prompt('سبب تصحيح البيانات (3 إلى 500 حرف). هذا تصحيح إدخال موثق، وليس حذفًا لحركة فعلية أو رد أموال:');
      if(reason===null)return null;if(!reason||reason.trim().length<3||reason.trim().length>500){alert('أدخل سببًا واضحًا من 3 إلى 500 حرف.');return null;}
      return {...after,_financialCorrection:{id:uid(),kind:'data_correction',reason:reason.trim()},lastCorrectionReason:reason.trim(),lastCorrectionAt:new Date().toISOString()};
    }
    return after;
  };
  const mutate = (key) => ({
    add:(record)=>{
      if(FINANCIAL_BUNDLE_RULES[key]){record=authorizeBundle(key,null,record,'insert');if(!record)return false;}
      if(key==='payments'){const check=paymentControl(null,record);if(check.error){alert(check.error);return false;}}
      setData(d=>({...d, [key]:[...d[key], record]}));
      cloudUpsert(key, record);
      auditWrite('إنشاء', key, record.id, describeRecord(key, record), buildChanges(null, record));
    },
    update:(id, patch)=>{
      const cur = (dataRef.current[key]||[]).find(r=>r.id===id);
      let merged = cur ? {...cur, ...patch} : null;
      // تغيير المرتب: يُسأل عن شهر السريان ويُحفظ في سجل المرتب حتى لا تتغير الشهور القديمة
      if(key==='employees' && cur && merged && patch.salaryHistory===undefined){
        const changed = (Number(cur.baseSalary)||0)!==(Number(merged.baseSalary)||0) || (Number(cur.grossSalary)||0)!==(Number(merged.grossSalary)||0);
        if(changed){
          const ans = prompt('مرتب '+(cur.name||'الموظف')+' اتغيّر.\nمن أي شهر يبدأ المرتب الجديد؟ اكتبيه بالصيغة 2026-11\n(الشهور اللي قبله هتفضل بالمرتب القديم)', currentYM());
          if(ans===null) return false;
          const fromYM = ans.trim();
          if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(fromYM)){ alert('اكتبي الشهر بالصيغة 2026-11'); return false; }
          const paidAfter = [...new Set([...(dataRef.current.officeExpenses||[]),...(dataRef.current.treasury||[])].filter(x=>(x.kind==='رواتب'||x.kind===SALARY_PART_KIND) && (x.month||'')>=fromYM).map(x=>x.month))].sort();
          if(paidAfter.length && !confirm('تنبيه: رواتب '+paidAfter.map(fmtMonth).join('، ')+' مصروفة بالفعل بالمرتب القديم.\nتطبيق المرتب الجديد من '+fmtMonth(fromYM)+' هيغيّر كشف الشهور دي (وهيظهر فرق مستحق أو زيادة). متأكدة؟')) return false;
          merged = {...merged, salaryHistory: withSalaryChange(cur, merged, fromYM)};
        }
      }
      if(FINANCIAL_BUNDLE_RULES[key]){if(!cur)return false;merged=authorizeBundle(key,cur,merged);if(!merged)return false;patch=merged;}
      if(key==='payments'){
        if(!cur)return false;
        if(!['owner','accountant'].includes(role)){alert('حسابك لا يملك صلاحية تعديل الدفعات.');return false;}
        const check=paymentControl(cur,merged);
        if(check.error){alert(check.error);return false;}
        if(check.correction){
          if(role!=='owner'){alert('هذا التصحيح متاح للمالك فقط بسبب مسجل؛ التحصيل العادي متاح للمحاسب.');return false;}
          const supplied=(patch.lastCorrectionAt&&patch.lastCorrectionAt!==cur.lastCorrectionAt)?patch.lastCorrectionReason:(patch.archived===true?patch.archiveReason:null);
          const reason=typeof supplied==='string'&&supplied.trim()?supplied.trim():prompt('سبب تصحيح بيانات الدفعة (من 3 إلى 500 حرف). التصحيح يُسجل بالقيم قبل وبعد على الخادم. هذا المسار لا يمثل رد أموال فعليًا:');
          if(reason===null)return false;
          if(!reason||reason.trim().length<3||reason.trim().length>500){alert('أدخل سببًا واضحًا من 3 إلى 500 حرف.');return false;}
          if(check.newNet<check.oldNet&&!confirm('سيقل التحصيل المسجل من '+money(check.oldNet)+' إلى '+money(check.newNet)+' قبل الضريبة. أكّد أن هذا تصحيح إدخال، وليس رد أموال فعليًا. رد الأموال يحتاج حركة مالية مستقلة.'))return false;
          patch={...patch,lastCorrectionReason:reason.trim(),lastCorrectionAt:new Date().toISOString(),_financialCorrection:{id:uid(),kind:'data_correction',reason:reason.trim()}};
          merged={...cur,...patch};
        }
      }
      if(key==='contracts'&&cur?.archived===true&&merged&&merged.archived!==true&&merged.cancelled!==true){
        const problem=NITAQ_PERSIST.contractRestoreProblem(merged,dataRef.current);
        if(problem){alert(problem);return;}
      }
      setData(d=>({...d, [key]: d[key].map(r=> r.id===id ? {...r,...patch} : r)}));
      if(merged) cloudUpsert(key, merged);
      if(cur){
        let action = 'تعديل';
        if(patch.archived===true) action = 'أرشفة / إلغاء';
        else if(patch.archived===false) action = 'استرجاع من الأرشيف';
        else if((patch.invoiceNo && !cur.invoiceNo) || (patch.receiptNo && !cur.receiptNo)) action = 'إصدار مستند';
        const diffs = buildChanges(cur, merged);
        const summaryTxt = diffs.slice(0,4).map(d=> d.field+': '+d.before+' ← '+d.after).join(' · ');
        auditWrite(action, key, id, describeRecord(key, merged)+(summaryTxt?' | '+summaryTxt:''), diffs);
      }
    },
    del:(id)=>{
      if(FINANCIAL_BUNDLE_RULES[key]){alert(financialBundleControl(key,null,null,'delete').error);return false;}
      if(key==='payments'){alert(paymentControl(null,null,'delete').error);return false;}
      const cur = (dataRef.current[key]||[]).find(r=>r.id===id);
      setData(d=>({...d, [key]: d[key].filter(r=>r.id!==id)}));
      cloudDelete(id);
      auditWrite('حذف نهائي', key, id, describeRecord(key, cur), buildChanges(cur, null));
    },
  });

  const setAttendance = (empId, dateStr, status) => {
    if(NITAQ_PERSIST.blocked)return false;
    const oldMap={...((dataRef.current.attendance||{})[empId]||{})},map={...oldMap};
    if(status===null)delete map[dateStr];else map[dateStr]=status;
    const record=authorizeBundle('attendance',{map:oldMap},{id:'att-'+empId,empId,map});if(!record)return false;
    setData(d=>({...d,attendance:{...d.attendance,[empId]:map}}));cloudUpsert('attendance',record);
  };

  const importRef = useRef(null);
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nitaq-backup-'+todayISO()+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const importBackup = async (e)=>{
    const file=e.target.files&&e.target.files[0];e.target.value='';
    if(!file||NITAQ_PERSIST.blocked||importBusy.current)return;
    try{
      if(getSbConfig())throw Error('استبدال البيانات من ملف متوقف أثناء تفعيل Supabase لحماية بيانات المكتب المشتركة. لم يتم تغيير البيانات.');
      if(file.size>NITAQ_PERSIST.maxImportBytes)throw Error('الملف أكبر من 20 ميجابايت.');
      const prepared=NITAQ_PERSIST.prepareImport(NITAQ_PERSIST.parse(await file.text()));
      if(await replaceFromFile(prepared))alert('تم الاستبدال والحفظ محليًا. نسخة ما قبل الاستبدال متاحة للتنزيل. لم تُرفع بيانات إلى Supabase.');
    }catch(error){alert(error.message||'فشل الاستيراد؛ راجع تنبيه الحماية.');}
  };

  const [jumpProject, setJumpProject] = useState(null);
  const fccUrgent = useMemo(()=>{
    const st = data.fccState||{};
    return buildFccItems(data).filter(it=>{ const s=st[it.key]; return it.pr==='high' && !(s&&(s.done||(s.snoozeUntil&&s.snoozeUntil>=todayISO()))); }).length;
  }, [data]);
  const role = cloud.profile ? cloud.profile.role : (getSbConfig()?'engineer':'owner');
  const ROLE_AR = {owner:'مالك', accountant:'محاسب', engineer:'مهندس'};
  const navAllowed = (key)=>{
    if(role==='engineer') return ENGINEER_VIEWS.includes(key);
    if(role==='accountant') return key!=='users';
    return true;
  };

  const urgentCount = (key) => {
    if(key==='employees') return data.employees.filter(e=> ['iqamaExpiry','passportExpiry','workCardExpiry'].some(f=>{const dd=daysUntil(e[f]); return dd!==null && dd<=60;})).length;
    if(key==='cars') return data.cars.filter(c=>{const dd=daysUntil(c.licenseExpiry); return dd!==null && dd<=60;}).length;
    if(key==='govFees') return data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').length;
    if(key==='fcc') return fccUrgent;
    if(key==='dues') return data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus!=='مدفوع').length;
    if(key==='payments') return data.payments.filter(i=>{ if(remainderOf(i)<=0) return false; const dd=daysUntil(i.dueDate); return dd!==null && dd<0; }).length;
    return 0;
  };

  const renderView = () => {
    if(!navAllowed(view)) return <ProjectsView data={data} configs={configs} mutate={mutate} role={role} />;
    if(view==='syncQueue') return <div className="card" dir="rtl">
      <h3>العمليات غير المؤكدة من السحابة ({syncState.pending})</h3>
      <p>التعارضات لا تُستبدل تلقائيًا. نزّل القائمة وراجع بيانات السحابة قبل تصحيح العملية.</p>
      <button className="btn" onClick={exportSyncQueue}>تنزيل العمليات للمراجعة</button>
      <button className="btn" onClick={()=>NITAQ_SYNC.retry().catch(e=>NITAQ_PERSIST.fail(e,'sync'))}>إعادة المحاولة</button>
      {syncState.jobs.map(j=><div key={j.token} style={{borderBottom:'1px solid #ddd',padding:12}}><b>{({auditLog:'سجل التعديلات',staffDir:'دليل الموظفين',fccState:'المتابعة'}[j.entity]||NAV.flatMap(g=>g.items).find(x=>x.key===j.entity)?.label||'عملية محفوظة')} — {j.data?.name||j.data?.label||j.id}</b><p>{j.status==='blocked'?'تحتاج مراجعة':'بانتظار التأكيد'}: {j.kind==='delete'?'حذف':'حفظ'}</p><p>{j.error?(/NITAQ_CONFLICT/.test(j.error.message)?'السجل تغيّر على جهاز آخر. احتفظنا بتعديلك للمراجعة دون استبدال بيانات المكتب.':j.error.code==='42501'?'حسابك لا يملك صلاحية تنفيذ هذه العملية.':'تعذر تأكيد العملية. احتفظنا بها للمراجعة أو إعادة المحاولة.'):''}</p></div>)}
    </div>;
    if(view==='fcc') return <FccView data={data} mutate={mutate} go={setView} setFcc={(m)=>{ setData(d=>({...d, fccState:m})); cloudUpsert('fccState', {id:'fccState', map:m}); }} />;
    if(view==='dashboard') return <Dashboard data={data} go={setView} />;
    if(view==='projects') return <ProjectsView data={data} configs={configs} mutate={mutate} jumpId={jumpProject} onJumpDone={()=>setJumpProject(null)} role={role} />;
    if(view==='settings') return <SettingsView data={data} setSettings={(s)=>{ setData(d=>({...d, settings:s})); cloudUpsert('settings', {id:'settings', ...s}); auditWrite('تعديل', 'settings', 'settings', 'تحديث إعدادات النظام (المسار/البيانات البنكية)'); }} />;
    if(view==='audit') return <AuditView data={data} />;
    if(view==='users') return cloud.status==='ready' ? <UsersView sbRef={sbRef} myId={cloud.profile&&cloud.profile.user_id} /> : <div className="card"><p style={{fontSize:13, margin:0}}>إدارة المستخدمين متاحة في الوضع السحابي فقط — فعّل Supabase من الإعدادات.</p></div>;
    if(view==='payments') return <PaymentsView data={data} configs={configs} mutate={mutate} role={role} />;
    if(view==='projectRevenue') return <ProjectRevenueView data={data} />;
    if(view==='revenue') return <RevenueHub data={data} configs={configs} mutate={mutate} />;
    if(view==='contracts' || view==='decisions') return <ProjectFilteredList entity={view} data={data} configs={configs} mutate={mutate} />;
    if(view==='officeExpenses') return <OfficeExpensesView data={data} configs={configs} mutate={mutate}
      saveBudgets={(budgets)=>{ setData(d=>{ const s={...(d.settings||{}), budgets}; cloudUpsert('settings', {id:'settings', ...s}); return {...d, settings:s}; }); auditWrite('تعديل', 'settings', 'settings', 'تحديث الموازنة الشهرية للمصروفات'); }} />;
    if(view==='recurringBills') return <RecurringBillsView data={data} configs={configs} mutate={mutate} />;
    if(view==='govFees') return <GovFeesView data={data} configs={configs} mutate={mutate} />;
    if(view==='vat') return <VatView data={data} />;
    if(view==='statement') return <StatementView data={data} />;
    if(view==='reports') return <ReportsView data={data} />;
    if(view==='analytics') return <AnalyticsView data={data} />;
    if(view==='payroll') return <PayrollView data={data} mutate={mutate} />;
    if(view==='treasury') return <TreasuryView data={data} configs={configs} mutate={mutate} />;
    if(view==='otherIncome') return <OtherIncomeView data={data} configs={configs} mutate={mutate} />;
    if(view==='dues') return <DuesView data={data} />;
    if(view==='attendance') return <AttendanceView data={data} setAttendance={setAttendance} />;
    if(view==='docAlerts') return <DocAlertsView data={data} />;
    if(view==='timesheets') return <TimesheetsView data={data} configs={configs} mutate={mutate} />;
    if(configs[view]){
      const m = mutate(view);
      return <EntityView config={configs[view]} records={data[view]} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del} />;
    }
    return null;
  };

  const [title, subtitle] = VIEW_TITLES[view] || ['',''];

  if(!persistStatus.ready || persistStatus.locked) return (
    <div dir="rtl" style={{minHeight:'100vh',background:'#f5f2ec',padding:40,display:'grid',placeItems:'center'}}>
      <div role="alert" style={{maxWidth:650,background:'#fff',padding:28,border:'2px solid #9b4336',borderRadius:8}}>
        <h2>{persistStatus.kind==='import'?'جارٍ حفظ نسخة الاسترجاع':persistStatus.locked?'توقف التعديل لحماية البيانات':'جارٍ فحص البيانات'}</h2>
        <p>{persistStatus.message}</p>
        {persistStatus.locked && persistStatus.kind!=='import' && <>
          <p>نزّل نسخة الإنقاذ قبل إغلاق الصفحة. إذا تعذرت القراءة، يحتوي التنزيل على المحتوى التالف المتاح أو تقرير الخطأ؛ وليس نسخة كاملة من بيانات المكتب.</p>
          <button className="btn" onClick={NITAQ_PERSIST.rescue}>تنزيل نسخة إنقاذ</button>
          <button className="btn" onClick={exportSyncQueue}>تنزيل العمليات غير المتزامنة</button>
          <button className="btn" onClick={NITAQ_PERSIST.downloadPrevious}>تنزيل نسخة ما قبل الاستبدال</button>
          <button className="btn" style={{marginInlineStart:10}} onClick={()=>{if(confirm('هل حفظت نسخة الإنقاذ؟ إعادة الفتح تتخلص من التغييرات غير المحفوظة.'))window.location.reload();}}>إعادة فتح النظام</button>
        </>}
      </div>
    </div>
  );
  if(cloud.status==='error'&&getSbConfig()&&!syncAllowed.current) return <div dir="rtl" className="card" style={{margin:40}}><h2>لم نتمكن من فتح بيانات السحابة بأمان</h2><p>{cloud.msg}</p><button className="btn" onClick={connectCloud}>إعادة المحاولة</button></div>;
  if(cloud.status==='login') return <LoginView sbRef={sbRef} onLogin={cloudBootstrap} />;
  if(cloud.status==='init' || cloud.status==='loading') return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)', flexDirection:'column', gap:16}}>
      <img src={NITAQ_LOGO} alt="نطاق" style={{width:130}} />
      <div style={{color:'#C7D0DB', fontSize:13.5}}>جارٍ الاتصال بسحابة نطاق...</div>
    </div>
  );

  return (
    <div className="app">
      <div className="sidebar">
        <div className="brand" style={{textAlign:'center'}}>
          <img src={NITAQ_LOGO} alt="نطاق" style={{width:110, display:'block', margin:'0 auto 8px'}} />
          <p>الاستشارات الهندسية · الشارقة</p>
        </div>
        <nav className="nav">
          {NAV.map(group=>{
            const items = group.items.filter(item=>navAllowed(item.key));
            if(items.length===0) return null;
            return (
            <div key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {items.map(item=>{
                const Icon = item.icon;
                const count = urgentCount(item.key);
                return (
                  <button type="button" key={item.key} aria-current={view===item.key?'page':undefined} className={"nav-item "+(view===item.key?'active':'')} onClick={()=>setView(item.key)}>
                    <Icon/>
                    <span>{item.label}</span>
                    {count>0 && <span className="dot"></span>}
                  </button>
                );
              })}
            </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div role="status" style={{fontSize:11,color:persistStatus.pending?'#f0c36c':'#9FD8CC',marginBottom:8}}>{persistStatus.message}</div>
          {cloud.status==='ready' && (
            <div style={{border:'1px solid var(--teal)', borderRadius:4, padding:'7px 10px', marginBottom:8, fontSize:11, color:'#9FD8CC', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
              <span>☁ {cloud.profile ? (cloud.profile.name||'') : ''} ({ROLE_AR[role]||role})</span>
              <span style={{marginInlineStart:'auto', fontSize:9.5, color:'#7FA8A0'}}>{cloud.msg?.startsWith("⚠")?cloud.msg:(syncState.message||cloud.msg)}</span>
              <span onClick={logout} style={{cursor:'pointer', textDecoration:'underline', fontSize:10}}>خروج</span>
            </div>
          )}
          {cloud.status==='error' && (
            <div style={{border:'1px solid var(--rust)', borderRadius:4, padding:'7px 10px', marginBottom:8, fontSize:10.5, color:'#E8A79A'}}>
              ⚠ السحابة: {cloud.msg} — النظام يعمل محلياً
              <div style={{marginTop:6}}>
                <span onClick={connectCloud} style={{cursor:'pointer', textDecoration:'underline', fontWeight:700, color:'#fff'}}>↻ إعادة محاولة الاتصال</span>
              </div>
            </div>
          )}
          {cloud.status==='ready' && syncState.pending>0 && <button className="btn small" onClick={()=>setView('syncQueue')}>مراجعة {syncState.pending} عملية غير متزامنة ({syncState.blocked} تحتاج مراجعة)</button>}
          {cloud.status==='ready' && cloudEmpty && (
            <p style={{fontSize:11}}>لا توجد سجلات متاحة لهذا الحساب. لم نرفع أي بيانات محلية تلقائيًا.</p>
          )}
          <button className="btn ghost small" style={{width:'100%', border:'1px solid '+(fileLinked?'var(--teal)':'var(--brass)'), color:fileLinked?'var(--teal)':'#EDEFEA', marginBottom:6, justifyContent:'center'}} onClick={linkDataFile}>
            {fileLinked ? '✓ الحفظ التلقائي في ملف مفعّل' : '🔗 ربط ملف بيانات (حفظ تلقائي)'}
          </button>
          {saveState && <div style={{fontSize:10, color:'#8794A6', textAlign:'center', marginBottom:6}}>{saveState}</div>}
          {role==='owner' && (
            <React.Fragment>
              <div style={{display:'flex', gap:6, marginBottom:6}}>
                <button className="btn ghost small" style={{flex:1, border:'1px dashed var(--line-strong)'}} onClick={exportBackup}>⬇ نسخة احتياطية</button>
                <button className="btn ghost small" style={{flex:1, border:'1px dashed var(--line-strong)'}} onClick={()=>importRef.current && importRef.current.click()}>⬆ استيراد</button>
                <input ref={importRef} type="file" accept="application/json,.json" style={{display:'none'}} onChange={importBackup} />
                <button className="btn ghost small" onClick={NITAQ_PERSIST.downloadPrevious}>نسخة ما قبل الاستبدال</button>
              </div>
              <button className="btn ghost small" style={{width:'100%', border:'1px dashed var(--brass)', color:'#D9C08F', marginBottom:8, justifyContent:'center'}}
                onClick={async ()=>{ try{ await exportExcelBackup(dataRef.current, configs); }catch(e){ alert(e.message); } }}>
                📊 تصدير Excel شامل (كل الأقسام)
              </button>
            </React.Fragment>
          )}
          نظام داخلي · بياناتك محفوظة تلقائياً
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div>
            <h2>{title}</h2>
            <div className="sub">{subtitle}</div>
          </div>
          <div className="topbar-right" style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap'}}>
            <GlobalSearch data={data} go={setView} navAllowed={navAllowed}
              jumpToProject={(id)=>{ setJumpProject(id); setView('projects'); }} />
            <span className="topbar-date">{new Date().toLocaleDateString('ar-AE', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</span>
          </div>
        </div>
        <div className="content">
          {renderView()}
        </div>
      </div>
    </div>
  );
}
