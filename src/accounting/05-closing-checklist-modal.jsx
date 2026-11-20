function ClosingChecklistModal({project, data, mutate, onClose}){
  const pays = data.payments.filter(i=>i.projectId===project.id);
  const outstanding = pays.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
  const contractors = (data.contracts||[]).filter(c=>c.projectId===project.id && (c.category==='مقاول رئيسي' || c.category==='مقاول باطن'));
  const commUninvoiced = contractors.reduce((s,c)=>{
    const cm = contractCommission(c);
    const inv = data.payments.filter(i=>i.contractId===c.id).reduce((x,i)=>x+billedOf(i),0);
    return s + Math.max(0, cm - inv);
  }, 0);
  const feesUnrecovered = data.govFees.filter(g=>g.projectId===project.id && !isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const feesUnpaid = data.govFees.filter(g=>g.projectId===project.id && !isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus!=='مدفوع').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const stages = project.timeline||{};
  const handoverDone = stages.handover && stages.handover.status==='مكتملة';
  const supervisionContract = (data.contracts||[]).find(c=>c.projectId===project.id && isConsultancy(c) && (c.type==='إشراف'||isComboContract(c)));
  const supDone = supervisionContract ? data.payments.filter(i=>i.contractId===supervisionContract.id && i.phase==='إشراف').length : 0;
  const supTotal = supervisionContract ? (supervisionContract.supervisionMonths||0) : 0;
  const supIncomplete = supervisionContract && supDone < supTotal;
  const openApprovals = APPROVAL_ITEMS.filter(name=>{
    const a = (project.approvals||{})[name];
    return a && a.submitDate && !a.done;
  });

  const items = [
    {ok: outstanding<1, label:'كل الدفعات محصّلة بالكامل', detail: outstanding<1 ? '✓ لا مستحقات' : 'يتبقى '+money(outstanding)+' غير محصّل', critical:true},
    {ok: commUninvoiced<1, label:'عمولات المقاولين مفوترة', detail: commUninvoiced<1 ? '✓ كل العمولات مفوترة أو لا توجد' : 'يتبقى '+money(commUninvoiced)+' عمولة غير مفوترة', critical:true},
    {ok: feesUnrecovered<1, label:'الأمانات الحكومية مستردة من المالك', detail: feesUnrecovered<1 ? '✓ لا أمانات معلقة' : 'يتبقى '+money(feesUnrecovered)+' لم تُسترد', critical:true},
    {ok: feesUnpaid<1, label:'كل رسوم الدوائر مسددة', detail: feesUnpaid<1 ? '✓ كل الرسوم مسددة' : 'يتبقى '+money(feesUnpaid)+' غير مسدد', critical:false},
    {ok: openApprovals.length===0, label:'لا اعتمادات معلقة عند الدوائر', detail: openApprovals.length===0 ? '✓ لا اعتمادات معلقة' : openApprovals.length+' اعتماد ما زال قيد المتابعة: '+openApprovals.join('، '), critical:false},
    {ok: !supIncomplete, label:'دفعات الإشراف مكتملة', detail: !supIncomplete ? '✓ لا يوجد إشراف ناقص' : 'أُصدر '+supDone+' من '+supTotal+' دفعة إشراف', critical:false},
    {ok: handoverDone, label:'مرحلة التسليم مكتملة في Timeline', detail: handoverDone ? '✓ مكتملة' : 'حدّث مرحلة التسليم في تبويب "نظرة عامة"', critical:false},
  ];
  const criticalOpen = items.filter(x=>x.critical && !x.ok).length;
  const totalOpen = items.filter(x=>!x.ok).length;
  const canClose = criticalOpen === 0;

  const close = ()=>{
    if(!canClose){ alert('لا يمكن الإقفال — يوجد '+criticalOpen+' بند مالي حرج مفتوح'); return; }
    if(totalOpen>0 && !confirm('يوجد '+totalOpen+' بند غير حرج مفتوح. إقفال المشروع رغم ذلك؟')) return;
    mutate('projects').update(project.id, {status:'منتهٍ', closedAt:todayISO()});
    alert('تم إقفال المشروع بنجاح');
    onClose();
  };

  // فسخ العقد: إنهاء المشروع لأن المالك أنهى العقد قبل اكتماله — الدفعات غير المحصّلة يجب أن تكون ملغاة أولاً
  // فسخ العقد: يفتح شاشة التسوية المحاسبية الكاملة
  const [showTerm, setShowTerm] = useState(false);

  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:640}}>
        <div className="modal-head">
          <h3>قائمة تحقق إقفال المشروع — {project.projectNo} {project.name}</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:16}}>راجع البنود التالية قبل تحويل المشروع إلى "منتهٍ" — البنود المالية الحرجة يجب إغلاقها.</p>
          {items.map((it,i)=>(
            <div key={i} style={{display:'flex', gap:12, padding:'10px 12px', borderInlineStart:'3px solid '+(it.ok?'var(--teal)':it.critical?'var(--rust)':'var(--brass)'), background:it.ok?'#F4FAF8':it.critical?'#FDF4F1':'#FEF9F0', marginBottom:8, borderRadius:4}}>
              <span style={{fontSize:16, flexShrink:0}}>{it.ok?'✓':it.critical?'✕':'!'}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:700}}>{it.label} {it.critical && !it.ok && <span className="badge bad" style={{marginInlineStart:6, fontSize:9}}>حرج</span>}</div>
                <div style={{fontSize:11.5, color:'var(--ink-soft)', marginTop:2}}>{it.detail}</div>
              </div>
            </div>
          ))}
          <div style={{padding:12, background:'var(--paper)', borderRadius:4, marginTop:14, fontSize:12.5}}>
            <b>الحالة:</b> {canClose ? <span style={{color:'var(--teal)'}}>✓ جاهز للإقفال</span> : <span style={{color:'var(--rust)'}}>يوجد {criticalOpen} بند حرج مفتوح</span>}
          </div>
        </div>
        <div className="modal-foot" style={{flexWrap:'wrap', gap:8}}>
          <button className="btn outline" onClick={onClose}>إغلاق النافذة</button>
          <button className="btn outline" onClick={()=>setShowTerm(true)}
            style={{borderColor:'var(--rust)', color:'var(--rust)'}}
            title="أنهى المالك العقد قبل اكتماله — تسوية محاسبية وإقفال كـ مفسوخ">
            فسخ العقد وتسوية
          </button>
          <button className="btn brass" disabled={!canClose} onClick={close}
            style={!canClose?{opacity:.4, cursor:'not-allowed'}:{}}>
            إقفال المشروع نهائياً
          </button>
        </div>
      </div>
      {showTerm && <TerminationModal project={project} data={data} mutate={mutate} onClose={()=>{ setShowTerm(false); onClose(); }} />}
    </div>
  );
}

/* ================= جدول الدفعات + تسجيل التحصيل ================= */
function InstallmentScheduleModal({contract, data, mutate, onClose}){
  const total = contract.type==='إشراف' ? 0
    : isComboContract(contract) ? (contract.designValue||0) : (contract.value||0);
  const invoiced = (data.payments||[]).filter(i=>!isArchived(i) && i.status!=='ملغاة' && i.contractId===contract.id && i.phase==='تصميم').reduce((s,i)=>s+(i.amount||0),0);
  const remaining = Math.max(0, total - invoiced);
  const [rows, setRows] = useState([
    {pct:50, amount:Math.round(remaining*0.5), dueDate:todayISO(), label:'الدفعة الأولى — توقيع العقد 50%'},
    {pct:30, amount:Math.round(remaining*0.3), dueDate:todayISO(), label:'الدفعة الثانية — مخططات ابتدائية 30%'},
    {pct:20, amount:Math.round(remaining*0.2), dueDate:todayISO(), label:'الدفعة الثالثة — اعتماد نهائي 20%'},
  ]);
  const [mode, setMode] = useState('pct');
  const updateRow = (i, patch)=>{
    setRows(rs=> rs.map((r,idx)=>{
      if(idx!==i) return r;
      const nr = {...r, ...patch};
      if(patch.pct!==undefined && remaining>0) nr.amount = Math.round(remaining*(patch.pct||0)/100);
      if(patch.amount!==undefined && remaining>0) nr.pct = Math.round((patch.amount||0)/remaining*100);
      return nr;
    }));
  };
  const addRow = ()=> setRows(rs=>[...rs, {pct:0, amount:0, dueDate:todayISO(), label:'دفعة إضافية'}]);
  const delRow = (i)=> setRows(rs=> rs.filter((_,idx)=>idx!==i));
  const sumPct = rows.reduce((s,r)=>s+(r.pct||0),0);
  const sumAmt = rows.reduce((s,r)=>s+(r.amount||0),0);
  const generate = ()=>{
    if(rows.length===0){ alert('أضف دفعة واحدة على الأقل'); return; }
    if(!confirm('سيتم إنشاء '+rows.length+' دفعة معلقة بإجمالي '+money(sumAmt)+'. متابعة؟')) return;
    rows.forEach(r=>{
      mutate('payments').add({id:uid(), projectId:contract.projectId, contractId:contract.id,
        phase:'تصميم', label:r.label, amount:r.amount||0,
        date:todayISO(), dueDate:r.dueDate, status:'معلقة', _ts:Date.now()});
    });
    alert('تم إنشاء الجدول');
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:720}}>
        <div className="modal-head">
          <h3>جدول دفعات العقد — المتبقي {money(remaining)} من إجمالي {money(total)}</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {invoiced>0 && (
            <p style={{fontSize:11.5, color:'var(--ink-faint)', marginBottom:12}}>* مفوتر بالفعل من هذا العقد: {money(invoiced)} — الجدول أدناه للمتبقي فقط.</p>
          )}
          <div style={{display:'flex', gap:6, marginBottom:12}}>
            <button className={"btn small "+(mode==='pct'?'brass':'outline')} onClick={()=>setMode('pct')}>بالنسبة %</button>
            <button className={"btn small "+(mode==='amt'?'brass':'outline')} onClick={()=>setMode('amt')}>بالمبلغ</button>
            <span style={{marginInlineStart:'auto', fontSize:12, color:'var(--ink-faint)'}}>مجموع: {sumPct}% · {money(sumAmt)}</span>
          </div>
          <table>
            <thead><tr><th>#</th><th>{mode==='pct'?'النسبة %':'المبلغ'}</th><th>الوصف</th><th>تاريخ الاستحقاق</th><th></th></tr></thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i}>
                  <td>{i+1}</td>
                  <td>{mode==='pct'
                    ? <input type="number" value={r.pct||''} onChange={e=>updateRow(i,{pct:+e.target.value})} style={{width:70}} />
                    : <input type="number" value={r.amount||''} onChange={e=>updateRow(i,{amount:+e.target.value})} style={{width:110}} />}</td>
                  <td><input value={r.label} onChange={e=>updateRow(i,{label:e.target.value})} style={{width:'100%'}} /></td>
                  <td><input type="date" value={r.dueDate} onChange={e=>updateRow(i,{dueDate:e.target.value})} /></td>
                  <td><button className="btn ghost small" style={{color:'var(--rust)'}} onClick={()=>delRow(i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn outline small" style={{marginTop:10}} onClick={addRow}>+ إضافة سطر</button>
          {Math.abs(sumPct-100)>1 && mode==='pct' && <p style={{fontSize:11.5, color:'var(--rust)', marginTop:8}}>⚠ مجموع النسب {sumPct}% — تأكد أنه 100%</p>}
        </div>
        <div className="modal-foot">
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" onClick={generate}>إنشاء الجدول ({rows.length} دفعة)</button>
        </div>
      </div>
    </div>
  );
}

function SettlePaymentModal({payment, mutate, onClose}){
  const rnd = (x)=> Math.round((parseFloat(x)||0)*100)/100;
  const remainingNet = remainderOf(payment);
  const remainingGross = rnd(remainingNet * grossFactor(payment));
  const [grossAmount, setGrossAmount] = useState(remainingGross);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('تحويل بنكي');
  const [account, setAccount] = useState('البنك');
  const [refNo, setRefNo] = useState('');
  const pickMethod = (mNew)=>{ setMethod(mNew); setAccount(mNew==='نقداً' ? 'الخزينة' : 'البنك'); };
  const netAmount = rnd((grossAmount||0) / grossFactor(payment));
  const save = ()=>{
    if(!grossAmount || grossAmount<=0){ alert('أدخل مبلغاً صحيحاً'); return; }
    if(netAmount > remainingNet+1){ alert('المبلغ أكبر من المتبقي ('+money(remainingGross)+' شامل الضريبة)'); return; }
    const full = Math.abs(netAmount - remainingNet) < 1;
    const patch = full
      ? {status:'مدفوعة', paidDate:date, method, account, refNo, collectedAmount:0}
      : {status:'مدفوعة جزئياً', paidDate:date, method, account, refNo, collectedAmount:(payment.collectedAmount||0)+netAmount};
    if(mutate('payments').update(payment.id, patch)===false)return;
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:460}}>
        <div className="modal-head">
          <h3>تسجيل تحصيل دفعة</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:14}}>
            إجمالي الدفعة (شامل الضريبة): <b>{money((payment.amount||0)*grossFactor(payment))}</b><br/>
            المتبقي: <b style={{color:'var(--rust)'}}>{money(remainingGross)}</b>
          </p>
          <div className="field" style={{marginBottom:12}}>
            <label>المبلغ المستلم فعلياً (شامل الضريبة) *</label>
            <input type="number" value={grossAmount} onChange={e=>setGrossAmount(+e.target.value)} />
            <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:3}}>= {money(netAmount)} قبل الضريبة</div>
          </div>
          <div className="field" style={{marginBottom:12}}>
            <label>تاريخ الاستلام *</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="field" style={{marginBottom:12}}>
            <label>طريقة الدفع *</label>
            <select value={method} onChange={e=>pickMethod(e.target.value)}>
              <option>نقداً</option><option>شيك</option><option>تحويل بنكي</option><option>بطاقة</option>
            </select>
          </div>
          <div className="field" style={{marginBottom:12}}>
            <label>الحساب المستلِم *</label>
            <select value={account} onChange={e=>setAccount(e.target.value)}>
              <option>البنك</option><option>الخزينة</option>
            </select>
            <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:3}}>يُحدَّد تلقائياً من طريقة الدفع — عدّله يدوياً لو لزم</div>
          </div>
          {method!=='نقداً' && (
            <div className="field" style={{marginBottom:12}}>
              <label>رقم الشيك / مرجع التحويل أو العملية</label>
              <input value={refNo} onChange={e=>setRefNo(e.target.value)} />
            </div>
          )}
          <div style={{padding:10, background:'var(--paper)', borderRadius:4, fontSize:12}}>
            <span style={{color:'var(--ink-soft)'}}>الحالة بعد التسجيل: </span>
            <b style={{color: Math.abs(netAmount-remainingNet)<1 ? 'var(--teal)' : 'var(--brass)'}}>
              {Math.abs(netAmount-remainingNet)<1 ? 'مدفوعة بالكامل ✓' : 'مدفوعة جزئياً — يتبقى '+money(remainingGross-grossAmount)}
            </b>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" onClick={save}>تسجيل التحصيل</button>
        </div>
      </div>
    </div>
  );
}

function BulkSettleModal({data, mutate, presetProject, onClose}){
  const [pid, setPid] = useState(presetProject||'');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('تحويل بنكي');
  const [account, setAccount] = useState('البنك');
  const [refNo, setRefNo] = useState('');
  const [alloc, setAlloc] = useState({});
  const pickMethod = (mNew)=>{ setMethod(mNew); setAccount(mNew==='نقداً' ? 'الخزينة' : 'البنك'); };
  const rows = useMemo(()=> data.payments
    .filter(i=>!isArchived(i) && i.projectId===pid && remainderOf(i)>0)
    .sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||'')), [data.payments, pid]);
  const remGross = (i)=> remainderOf(i)*grossFactor(i);
  const autoFill = ()=>{
    let left = parseFloat(total)||0; const a={};
    rows.forEach(i=>{ const r=remGross(i); const x=Math.min(left, r); if(x>0.01){ a[i.id]=Math.round(x*100)/100; left-=x; } });
    setAlloc(a);
  };
  const sumAlloc = rows.reduce((s,i)=>s+(parseFloat(alloc[i.id])||0),0);
  const totalNum = parseFloat(total)||0;
  const apply = ()=>{
    const lines = rows.filter(i=>(parseFloat(alloc[i.id])||0)>0);
    if(lines.length===0){ alert('أدخل مبالغ التوزيع أو استخدم "توزيع تلقائياً"'); return; }
    for(const i of lines){
      if((parseFloat(alloc[i.id])||0) > remGross(i)+0.5){ alert('المبلغ الموزع على "'+(i.label||i.phase)+'" أكبر من المتبقي عليها'); return; }
    }
    const prepared=lines.map(i=>{
      const net=Math.round(((parseFloat(alloc[i.id])||0)/grossFactor(i))*100)/100;
      const full=net>=remainderOf(i)-0.5;
      const patch=full?{status:'مدفوعة',paidDate:date,method,account,refNo,collectedAmount:0}:{status:'مدفوعة جزئياً',paidDate:date,method,account,refNo,collectedAmount:(i.collectedAmount||0)+net};
      return {i,patch,check:paymentControl(i,{...i,...patch})};
    });
    for(const line of prepared){if(line.check.error||line.check.correction){alert(line.check.error||'إحدى الدفعات تحتاج تصحيحًا فرديًا بسبب مسجل قبل التحصيل المجمّع. لم نغيّر أي دفعة.');return;}}
    if(!confirm('تسجيل تحصيل إجمالي '+money(sumAlloc)+' موزعًا على '+lines.length+' دفعة؟'))return;
    let saved=0;
    for(const line of prepared){if(mutate('payments').update(line.i.id,line.patch)===false){alert('توقف التحصيل المجمّع بعد حفظ '+saved+' طلب. راجع العمليات قبل إعادة المحاولة.');return;}saved++;}
    alert('تم حفظ طلبات التحصيل المجمّع للمزامنة على '+saved+' دفعة');
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:680}}>
        <div className="modal-head">
          <h3>تحصيل مجمّع — تحويل واحد يغطي عدة دفعات</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!presetProject && (
            <div className="field" style={{marginBottom:12}}>
              <label>المشروع *</label>
              <select value={pid} onChange={e=>{ setPid(e.target.value); setAlloc({}); }}>
                <option value="">اختر...</option>
                {data.projects.filter(p=>!isArchived(p)).map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
              </select>
            </div>
          )}
          {pid && rows.length===0 && <p style={{fontSize:12.5, color:'var(--teal)'}}>✓ لا توجد دفعات معلقة على هذا المشروع.</p>}
          {pid && rows.length>0 && (
            <React.Fragment>
              <div style={{display:'flex', gap:8, alignItems:'flex-end', marginBottom:12, flexWrap:'wrap'}}>
                <div className="field" style={{flex:1, minWidth:160}}>
                  <label>المبلغ المستلم (شامل الضريبة) *</label>
                  <input type="number" value={total} onChange={e=>setTotal(e.target.value)} placeholder="مثال: 50000" />
                </div>
                <button className="btn outline small" onClick={autoFill} style={{marginBottom:2}}>توزيع تلقائياً (الأقدم أولاً)</button>
              </div>
              <table>
                <thead><tr><th>الدفعة</th><th>الاستحقاق</th><th>المتبقي (شامل)</th><th>التوزيع</th></tr></thead>
                <tbody>
                  {rows.map(i=>(
                    <tr key={i.id}>
                      <td style={{fontSize:12}}>{i.phase==='إشراف' ? 'إشراف '+(i.month?fmtMonth(i.month):'') : (i.label||i.phase)}</td>
                      <td style={{fontSize:11.5}}>{i.dueDate||'—'}</td>
                      <td>{money(remGross(i))}</td>
                      <td><input type="number" value={alloc[i.id]===undefined?'':alloc[i.id]} style={{width:110}}
                        onChange={e=>setAlloc(a=>({...a, [i.id]:e.target.value}))} /></td>
                    </tr>
                  ))}
                  <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}>
                    <td colSpan={3}>مجموع الموزع</td>
                    <td style={{color: Math.abs(sumAlloc-totalNum)<1||!totalNum ? 'var(--teal)' : 'var(--rust)'}}>{money(sumAlloc)}{totalNum>0 && Math.abs(sumAlloc-totalNum)>=1 ? ' ≠ '+money(totalNum) : ''}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{display:'flex', gap:10, marginTop:14, flexWrap:'wrap'}}>
                <div className="field" style={{flex:1, minWidth:130}}>
                  <label>تاريخ الاستلام *</label>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
                </div>
                <div className="field" style={{flex:1, minWidth:130}}>
                  <label>طريقة الدفع *</label>
                  <select value={method} onChange={e=>pickMethod(e.target.value)}>
                    <option>نقداً</option><option>شيك</option><option>تحويل بنكي</option><option>بطاقة</option>
                  </select>
                </div>
                <div className="field" style={{flex:1, minWidth:120}}>
                  <label>الحساب المستلِم *</label>
                  <select value={account} onChange={e=>setAccount(e.target.value)}>
                    <option>البنك</option><option>الخزينة</option>
                  </select>
                </div>
                <div className="field" style={{flex:1.4, minWidth:150}}>
                  <label>مرجع التحويل / الشيك</label>
                  <input value={refNo} onChange={e=>setRefNo(e.target.value)} />
                </div>
              </div>
            </React.Fragment>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" onClick={apply} disabled={!pid||rows.length===0}>تسجيل التحصيل المجمّع</button>
        </div>
      </div>
    </div>
  );
}

/* ================= ملف المشروع (Project-Centric Hub) ================= */
function ProjectProfile({project, data, configs, mutate, onBack, role}){
  const [tab, setTab] = useState('overview');
  const p = data.projects.find(x=>x.id===project.id) || project;
  const upd = (patch)=> mutate('projects').update(p.id, patch);
  const mC = mutate('contracts');

  const [stageModal, setStageModal] = useState(null);
  const [apvModal, setApvModal] = useState(null);

  const toggleApproval = (name)=>{
    const cur = (p.approvals||{})[name] || {done:false};
    upd({approvals:{...(p.approvals||{}), [name]:{...cur, done:!cur.done, date: !cur.done ? todayISO() : ''}}});
  };

  const STAGE_FIELDS = [
    {name:'status', label:'حالة المرحلة', type:'select', options:STAGE_STATUSES.map(s=>({value:s,label:s})), required:true},
    {name:'progress', label:'نسبة الإنجاز %', type:'number'},
    {name:'startDate', label:'تاريخ البدء', type:'date'},
    {name:'targetDays', label:'المدة المستهدفة (أيام)', type:'number'},
    {name:'responsibleId', label:'الموظف المسؤول', type:'select', allowAddNew:true, addNewPrompt:'اسم المهندس/الموظف المسؤول:', hint:'مش لاقي الاسم؟ اختر "➕ إضافة تصنيف جديد..." من آخر القائمة واكتب الاسم مباشرة — من غير ما تحتاج تضيفه كموظف رسمي في قسم الموظفين الأول',
      options:(d)=>(d.employees&&d.employees.length ? d.employees.map(e=>({value:e.id,label:e.name})) : (d.staffDir||[]).map(s=>({value:s.empId,label:s.name})))},
    {name:'notes', label:'ملاحظات', type:'textarea'},
    {name:'attachRef', label:'مرجع المرفقات', hint:'أسماء الملفات داخل مجلد المشروع — الملفات نفسها تُحفظ في المجلد لا داخل النظام'},
  ];
  const APV_FIELDS = [
    {name:'done', label:'حالة الاعتماد', type:'select', options:[{value:'معتمد',label:'معتمد'},{value:'غير معتمد',label:'قيد الاعتماد / لم يُقدَّم'}], required:true},
    {name:'submitDate', label:'تاريخ آخر تقديم للدائرة', type:'date'},
    {name:'targetDays', label:'المدة المتوقعة للاعتماد (أيام)', type:'number'},
    {name:'submissionNo', label:'رقم مرة التقديم', type:'number', hint:'كم مرة تم تقديم هذا الاعتماد؟ 1 = تقديم أول، 2 = بعد ملاحظات، ...'},
    {name:'lastRemarks', label:'ملاحظات الدائرة على آخر تقديم', type:'textarea', hint:'يظهر هنا سبب الرد لسهولة المتابعة'},
    {name:'responsibleId', label:'الموظف المسؤول', type:'select', allowAddNew:true, addNewPrompt:'اسم المهندس/الموظف المسؤول:', hint:'مش لاقي الاسم؟ اختر "➕ إضافة تصنيف جديد..." من آخر القائمة واكتب الاسم مباشرة',
      options:(d)=>(d.employees&&d.employees.length ? d.employees.map(e=>({value:e.id,label:e.name})) : (d.staffDir||[]).map(s=>({value:s.empId,label:s.name})))},
    {name:'notes', label:'ملاحظات عامة', type:'textarea'},
  ];
  const empNameOf = (id)=> id ? ((data.employees.find(e=>e.id===id)||{}).name || ((data.staffDir||[]).find(s=>s.empId===id)||{}).name || id) : '';
  const stageOverdue = (s)=> s && s.status==='جارية' && s.startDate && s.targetDays && daysSince(s.startDate) > s.targetDays;
  const apvOverdue = (a)=> a && !a.done && a.submitDate && a.targetDays && daysSince(a.submitDate) > a.targetDays;

  const cons = (data.contracts||[]).filter(c=>!isArchived(c) && c.projectId===p.id);
  const consultancy = cons.filter(c=>c.status!=='ملغى' && !isArchived(c) && (isConsultancy(c)));
  const contractors = cons.filter(c=>c.category==='مقاول رئيسي' || c.category==='مقاول باطن');
  const consValue = consultancy.reduce((s,c)=> s + contractTotalOf(c), 0);
  const pays = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id);
  const billed = pays.reduce((s,i)=>s+billedOf(i),0);
  const collected = pays.reduce((s,i)=>s+collectedOf(i)*grossFactor(i),0);
  const remainingContract = Math.max(0, consValue - billed);
  const duePays = pays.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
  const fees = data.govFees.filter(g=>!isArchived(g) && g.projectId===p.id);
  const feesTotal = fees.reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const feesOut = fees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const costs = data.projectCosts.filter(e=>!isArchived(e) && e.projectId===p.id).reduce((s,e)=>s+(e.amount||0),0);
  const timeCost = projectTimeCost(data, p.id);           // تكلفة وقت المهندسين
  const timeHours = projectTimeHours(data, p.id);
  const totalCost = costs + timeCost;                     // التكلفة الحقيقية = مباشرة + وقت
  const folderName = p.folderName || ((p.projectNo||'')+' - '+(p.name||''));
  const folderPath = ((data.settings&&data.settings.projectsRoot)||'D:\\Projects')+'\\'+folderName;
  const openFolder = ()=>{
    let u = folderPath.replace(/\\/g,'/');
    if(u.startsWith('//')) u = 'file:'+'///'+u;
    else u = 'file:///'+u;
    const w = window.open(u, '_blank');
    if(!w) alert('المتصفح منع الفتح المباشر — استخدم زر نسخ المسار والصقه في الـ Explorer');
  };

  const copyPath = ()=>{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(folderPath).then(()=>alert('تم نسخ المسار — الصقه في شريط عنوان الـ Explorer:\n'+folderPath));
    } else { prompt('انسخ المسار:', folderPath); }
  };

  const projDecisions = (data.decisions||[]).filter(x=>x.projectId===p.id);
  const TABS = [
    {key:'overview', label:'نظرة عامة و Timeline'},
    {key:'activity', label:'نشاط المشروع ('+projDecisions.length+')'},
    {key:'contracts', label:'العقود ('+cons.length+')'},
    {key:'payments', label:'الدفعات ('+pays.length+')'},
    {key:'govFees', label:'الرسوم الحكومية ('+fees.length+')'},
    {key:'finance', label:'الملف المالي'},
    {key:'statement', label:'كشف الحساب'},
    {key:'folder', label:'مجلد المشروع'},
  ];

  /* --- بناء الـ Activity Feed الموحّد --- */
  const [waOpen, setWaOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [closingOpen, setClosingOpen] = useState(false);
  const [cnView, setCnView] = useState(null); // عرض إشعار دائن (فسخ عقد)
  const [decModal, setDecModal] = useState(null); // 'decision' | 'meeting'
  const mD = mutate('decisions');
  const feed = [];
  projDecisions.forEach(x=> feed.push({date:x.date, tag:x.category, cls:x.category==='اعتماد المالك'?'ok':x.category==='مهمة'?'soon':'neutral', text:x.description + (x.responsible?' — '+x.responsible:''), src:x.source||'يدوي'}));
  pays.forEach(i=>{
    if(i.invoiceNo){ const cancelled = isArchived(i)||i.status==='ملغاة'; feed.push({date:i.date, tag:cancelled?'فاتورة ملغاة':'فاتورة', cls:cancelled?'bad':'gray', text:'إصدار الفاتورة '+i.invoiceNo+' بقيمة '+money(i.amount*grossFactor(i))+(cancelled?' — ملغاة'+((i.archiveReason||i.cancelReason)?' ('+(i.archiveReason||i.cancelReason)+')':''):''), src:'مالية'}); }
    if(i.receiptNo && (i.status==='مدفوعة'||i.status==='مدفوعة جزئياً')) feed.push({date:i.paidDate||i.date, tag:'سند قبض', cls:'ok', text:'استلام دفعة — سند '+i.receiptNo+' ('+money(collectedOf(i)*grossFactor(i))+')', src:'مالية'});
  });
  fees.forEach(g=> feed.push({date:g.date, tag:'رسوم حكومية', cls:'gray', text:g.department+' — '+g.description+' ('+money(g.amount)+')', src:'أمانات'}));
  cons.forEach(c=> feed.push({date:c.date, tag:'عقد', cls:'neutral', text:'عقد '+(c.category||'خدمات استشارية')+(c.contractor?' — '+c.contractor:'')+': '+(c.description||''), src:'عقود'}));
  TIMELINE_STAGES.forEach(st=>{
    const s = (p.timeline||{})[st.key];
    if(s && s.status==='مكتملة' && s.date) feed.push({date:s.date, tag:'مرحلة', cls:'ok', text:'اكتمال مرحلة "'+st.label+'"', src:'Timeline'});
  });
  APPROVAL_ITEMS.forEach(name=>{
    const a = (p.approvals||{})[name];
    if(a && a.done && a.date) feed.push({date:a.date, tag:'اعتماد', cls:'ok', text:'اعتماد '+name, src:'اعتمادات'});
  });
  feed.sort((a,b)=> (b.date||'').localeCompare(a.date||''));

  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn outline" onClick={onBack}>← كل المشاريع</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:'Cairo', fontWeight:900, fontSize:17, color:'var(--ink)'}}>
            <span style={{color:'var(--brass)'}}>{p.projectNo}</span> — {p.name}
          </div>
          <div style={{fontSize:11.5, color:'var(--ink-faint)'}}>{p.owner} · {(p.emirate||'')+(p.area?' — '+p.area:'')} · {p.projectType||''}</div>
        </div>
        {p.status==='جارٍ' && <button className="btn outline" onClick={()=>setClosingOpen(true)}>قائمة إقفال المشروع</button>}
        {p.status==='مفسوخ' && p.creditNote && (
          <button className="btn outline" style={{borderColor:'var(--rust)', color:'var(--rust)'}}
            title="إعادة طباعة إشعار الدائن (فسخ عقد)"
            onClick={()=>{
              const cn=p.creditNote;
              setCnView({ project:p, refundNet:cn.refundNet, refundVat:cn.refundVat, refundGross:cn.refundGross,
                reason:(p.terminationReason||'فسخ عقد'), date:cn.date||p.closedAt||todayISO(), cnNo:cn.cnNo });
            }}>🧾 إشعار الدائن</button>
        )}
        <span className={"badge "+(p.status==='جارٍ'?'neutral':p.status==='منتهٍ'?'ok':'bad')}>{p.status}</span>
      </div>
      {cnView && <CreditNoteDoc cn={cnView} onClose={()=>setCnView(null)} />}

      <div className="tabs no-print">
        {TABS.map(t=>(
          <div key={t.key} className={"tab "+(tab===t.key?'active':'')} onClick={()=>setTab(t.key)}>{t.label}</div>
        ))}
      </div>

      {tab==='overview' && (
        <div>
          {p.quickNotes && (
            <div className="card" style={{marginBottom:18, borderInlineStart:'4px solid var(--brass)', background:'#FEF9F0'}}>
              <div style={{fontSize:11, fontWeight:800, color:'var(--brass)', marginBottom:6, letterSpacing:1}}>📌 ملاحظات سريعة</div>
              <div style={{fontSize:13.5, lineHeight:1.7, whiteSpace:'pre-wrap'}}>{p.quickNotes}</div>
            </div>
          )}
          <div className="card" style={{marginBottom:18}}>
            <div className="section-title"><h3>Timeline المشروع — انقر أي مرحلة لفتح ملفها الكامل (الحالة، المسؤول، المدة، الملاحظات)</h3><div className="rule"></div></div>
            <div className="tl">
              {TIMELINE_STAGES.map(st=>{
                const s = (p.timeline||{})[st.key] || {status:'لم تبدأ'};
                const cls = s.status==='مكتملة'?'done':s.status==='جارية'?'active':'';
                const late = stageOverdue(s);
                return (
                  <div key={st.key} className={"tl-step "+cls} onClick={()=>setStageModal(st.key)} title={'ملف المرحلة — '+s.status}>
                    <div className="tl-dot" style={late?{borderColor:'var(--rust)', background:'var(--rust)'}:{}}>{s.status==='مكتملة'?'✓':s.status==='جارية'?'●':''}</div>
                    <div className="tl-label">{st.label}</div>
                    <div className="tl-date">
                      {late ? <span style={{color:'var(--rust)', fontWeight:800}}>متأخرة {daysSince(s.startDate)-s.targetDays} يوم</span>
                        : s.status==='مكتملة'&&s.date ? s.date
                        : s.status==='جارية' ? ((s.progress?s.progress+'%':'جارية')+(s.responsibleId?' · '+empNameOf(s.responsibleId).split(' ')[1]||'':'')) : ''}
                    </div>
                    {s.status==='جارية' && s.progress>0 && <div className="progress" style={{width:56, margin:'4px auto 0'}}><div style={{width:Math.min(100,s.progress)+'%'}}></div></div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{marginBottom:18}}>
            <div className="section-title"><h3>الاعتمادات الحكومية — انقر للتحديد</h3><div className="rule"></div></div>
            <div className="apv">
              {APPROVAL_ITEMS.map(name=>{
                const a = (p.approvals||{})[name] || {done:false};
                return (
                  <div key={name} className={"apv-item "+(a.done?'on':'')} onClick={()=>toggleApproval(name)}
                    style={apvOverdue(a)?{borderColor:'var(--rust)'}:{}}>
                    <span className="bx">{a.done?'✓':''}</span>
                    <span>{name}</span>
                    <span className="dt">
                      {a.done && a.date ? a.date
                        : apvOverdue(a) ? <b style={{color:'var(--rust)'}}>متأخر {daysSince(a.submitDate)-a.targetDays} يوم</b>
                        : a.submitDate ? ('تقديم '+(a.submissionNo||1)+' — منذ '+daysSince(a.submitDate)+' يوم') : ''}
                      {(a.submissionNo||0)>1 && !a.done && <span className="badge soon" style={{marginInlineStart:6, fontSize:9}}>مرة {a.submissionNo}</span>}
                    </span>
                    <span onClick={(e)=>{e.stopPropagation(); setApvModal(name);}}
                      style={{marginInlineStart:6, color:'var(--brass)', fontWeight:900, padding:'0 4px'}} title="ملف الاعتماد">⋯</span>
                  </div>
                );
              })}
            </div>
            <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12, marginBottom:0}}>* بدون قيود على ترتيب التنفيذ — رسوم كل دائرة تُسجل في قسم الرسوم الحكومية وتظهر تلقائياً في الملف المالي وكشف الحساب.</p>
          </div>

          <div className="card">
            <div className="section-title"><h3>بيانات المشروع</h3><div className="rule"></div></div>
            <div className="info-grid">
              <div className="doc-line"><span className="lbl">رقم المشروع</span><span className="val">{p.projectNo}</span></div>
              <div className="doc-line"><span className="lbl">المالك</span><span className="val">{p.owner||'—'}</span></div>
              <div className="doc-line"><span className="lbl">الجهة المالكة</span><span className="val">{p.owningEntity||'—'}</span></div>
              {(p.additionalOwners||[]).filter(o=>o.name).length>0 && (
                <div className="doc-line"><span className="lbl">ملاك إضافيون</span><span className="val">{(p.additionalOwners||[]).filter(o=>o.name).map(o=>o.name+(o.entity?' ('+o.entity+')':'')).join(' — ')}</span></div>
              )}
              <div className="doc-line"><span className="lbl">نوع الأرض</span><span className="val">{p.landType||'—'}</span></div>
              <div className="doc-line"><span className="lbl">الرقم الحكومي</span><span className="val">{p.plotNumber||'—'}</span></div>
              {p.landType==='ملك' && <div className="doc-line"><span className="lbl">رقم الأرض (ملك)</span><span className="val">{p.ownershipNumber||'—'}</span></div>}
              <div className="doc-line"><span className="lbl">الإمارة — المنطقة</span><span className="val">{(p.emirate||'—')+(p.area?' — '+p.area:'')}</span></div>
              <div className="doc-line"><span className="lbl">نوع المشروع</span><span className="val">{p.projectType||'—'}</span></div>
              <div className="doc-line"><span className="lbl">المهندس المسؤول</span><span className="val">{p.engineer||'—'}</span></div>
              <div className="doc-line"><span className="lbl">تاريخ الفتح</span><span className="val">{p.startDate||'—'}</span></div>
            </div>
          </div>
        </div>
      )}

      {stageModal && (
        <FormModal
          title={'ملف مرحلة: '+(TIMELINE_STAGES.find(s=>s.key===stageModal)||{}).label}
          fields={STAGE_FIELDS}
          initial={(p.timeline||{})[stageModal] || {status:'لم تبدأ', progress:0}}
          data={data}
          onCancel={()=>setStageModal(null)}
          onSave={(vals)=>{
            const prev = (p.timeline||{})[stageModal] || {};
            const rec = {...prev, ...vals};
            if(rec.status==='مكتملة'){ rec.date = rec.date || todayISO(); rec.progress = 100; }
            if(rec.status==='جارية' && !rec.startDate) rec.startDate = todayISO();
            upd({timeline:{...(p.timeline||{}), [stageModal]:rec}});
            setStageModal(null);
          }}
        />
      )}
      {apvModal && (
        <FormModal
          title={'ملف اعتماد: '+apvModal}
          fields={APV_FIELDS}
          initial={(()=>{ const a=(p.approvals||{})[apvModal]||{}; return {...a, done: a.done?'معتمد':'غير معتمد'}; })()}
          data={data}
          onCancel={()=>setApvModal(null)}
          onSave={(vals)=>{
            const prev = (p.approvals||{})[apvModal] || {};
            const done = vals.done==='معتمد';
            upd({approvals:{...(p.approvals||{}), [apvModal]:{...prev, ...vals, done, date: done ? (prev.date||todayISO()) : ''}}});
            setApvModal(null);
          }}
        />
      )}

      {tab==='activity' && (
        <div>
          <div className="toolbar no-print">
            <div className="section-title" style={{marginBottom:0, flex:1}}><h3>سجل نشاط المشروع — كل الأحداث في تسلسل واحد</h3><div className="rule"></div></div>
            <button className="btn outline" onClick={()=>setDecModal('meeting')}>ملخص اجتماع</button>
            <button className="btn outline" onClick={()=>setDecModal('decision')}>+ قرار جديد</button>
            <button className="btn brass" onClick={()=>setWaOpen(true)}>استيراد محادثة واتساب</button>
          </div>
          <div className="card">
            {feed.length===0 && <p style={{fontSize:13, color:'var(--ink-faint)'}}>لا يوجد نشاط مسجل بعد — ابدأ باستيراد محادثة واتساب أو تسجيل قرار.</p>}
            {feed.map((f,i)=>{
              const showDate = i===0 || feed[i-1].date!==f.date;
              return (
                <div key={i}>
                  {showDate && <div style={{fontFamily:'Cairo', fontWeight:800, fontSize:12.5, color:'var(--brass)', margin:(i===0?'0':'18px')+' 0 8px', display:'flex', alignItems:'center', gap:10}}>{f.date}<span style={{flex:1, borderTop:'1px dashed var(--line-strong)'}}></span></div>}
                  <div style={{display:'flex', gap:10, alignItems:'flex-start', padding:'7px 0 7px 0', borderRight:'2px solid var(--line)', paddingRight:14, marginRight:4}}>
                    <span className={"badge "+f.cls} style={{flexShrink:0}}>{f.tag}</span>
                    <span style={{fontSize:13, flex:1}}>{f.text}</span>
                    <span style={{fontSize:10, color:'var(--ink-faint)', flexShrink:0}}>{f.src}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12}}>* القرارات المستوردة من واتساب لا تدخل السجل إلا بعد اعتمادك لكل قرار على حدة. تعديل أو حذف القرارات من قسم "القرارات والوقائع".</p>
        </div>
      )}

      {waOpen && <WaImport project={p} data={data} onApprove={(d)=>mD.add(d)} onClose={()=>setWaOpen(false)} />}
      {scheduleFor && <InstallmentScheduleModal contract={scheduleFor} data={data} mutate={mutate} onClose={()=>setScheduleFor(null)} />}
      {closingOpen && <ClosingChecklistModal project={p} data={data} mutate={mutate} onClose={()=>setClosingOpen(false)} />}
      {decModal && (
        <FormModal
          title={decModal==='meeting' ? 'ملخص اجتماع — مشروع '+p.projectNo : 'قرار جديد — مشروع '+p.projectNo}
          fields={configs.decisions.fields.filter(f=>f.name!=='projectId')}
          initial={decModal==='meeting'
            ? {date:todayISO(), category:'ملخص اجتماع', status:'منفذ', source:'اجتماع'}
            : {date:todayISO(), category:'اعتماد المالك', status:'مفتوح', source:'يدوي'}}
          data={data}
          onCancel={()=>setDecModal(null)}
          onSave={(vals)=>{ mD.add({...vals, projectId:p.id, id:uid(), _ts:Date.now()}); setDecModal(null); }}
        />
      )}

      {tab==='contracts' && (
        <EntityView config={{...configs.contracts, defaults:{...configs.contracts.defaults, projectId:p.id}}}
          records={cons} data={data}
          onAdd={mC.add} onUpdate={mC.update} onDelete={mC.del}
          rowActions={(row)=>{
            const designTotal = row.type==='إشراف' ? 0 : (isComboContract(row) ? (row.designValue||0) : (row.value||0));
            const designInvoiced = data.payments.filter(i=>!isArchived(i) && i.status!=='ملغاة' && i.contractId===row.id && i.phase==='تصميم').reduce((s,i)=>s+(i.amount||0),0);
            const canSchedule = isConsultancy(row) && row.type!=='إشراف' && row.status==='سارٍ' && designTotal>0 && designInvoiced < designTotal*0.999;
            const cm = contractCommission(row);
            const invoiced = data.payments.filter(i=>i.contractId===row.id).reduce((s,i)=>s+billedOf(i),0);
            const canCommission = cm>0 && invoiced<cm*0.999 && row.status==='سارٍ';
            return (
              <React.Fragment>
                {canSchedule && (
                  <button className="btn ghost small" title="إنشاء جدول دفعات" style={{color:'var(--teal)'}}
                    onClick={()=>setScheduleFor(row)}>📋 جدول</button>
                )}
                {canCommission && (
                  <button className="btn ghost small" title="توليد دفعة العمولة" style={{color:'var(--brass)'}}
                    onClick={()=>{
                  if(!confirm('إصدار دفعة عمولة بقيمة '+money(cm-invoiced)+' عن عقد '+(row.contractor||row.subType||row.category)+'؟')) return;
                  const due = new Date(); due.setDate(due.getDate()+10);
                  mutate('payments').add({id:uid(), projectId:p.id, contractId:row.id, phase:'أخرى',
                    label:'عمولة الاستشاري — عقد '+(row.subType?row.subType+' ':'')+(row.contractor||''),
                    amount:cm-invoiced, taxable:'خاضعة', date:todayISO(), dueDate:due.toISOString().slice(0,10), status:'معلقة', _ts:Date.now()});
                  alert('تم إنشاء دفعة العمولة — تجدها في تبويب الدفعات');
                }}>+ عمولة</button>
                )}
              </React.Fragment>
            );
          }} />
      )}

      {tab==='payments' && <PaymentsView data={data} configs={configs} mutate={mutate} lockedProject={p.id} role={role} />}
      {tab==='govFees' && <GovFeesView data={data} configs={configs} mutate={mutate} lockedProject={p.id} />}

      {tab==='finance' && (
        <div>
          <div className="grid grid-4" style={{marginBottom:18}}>
            <div className="card"><div className="kpi-label">قيمة العقود الاستشارية</div><div className="kpi-value" style={{fontSize:19}}>{money(consValue)}</div><div className="kpi-note">{consultancy.length} عقد استشاري · {contractors.length} عقد مقاولين</div></div>
            <div className="card"><div className="kpi-label">المحصّل (شامل الضريبة)</div><div className="kpi-value" style={{fontSize:19, color:'var(--teal)'}}>{money(collected)}</div><div className="kpi-note">مفوتر: {money(billed)} قبل الضريبة</div></div>
            <div className="card"><div className="kpi-label">مستحق غير محصّل</div><div className="kpi-value" style={{fontSize:19, color:duePays>0?'var(--rust)':'var(--teal)'}}>{money(duePays)}</div><div className="kpi-note">من الفواتير الصادرة</div></div>
            <div className="card"><div className="kpi-label">متبقٍ لم يُفوتر من العقود</div><div className="kpi-value" style={{fontSize:19}}>{money(remainingContract)}</div><div className="kpi-note">قبل الضريبة</div></div>
          </div>
          {(()=>{
            const billed = pays.reduce((s,i)=>s+billedOf(i),0);
            const collectRatio = billed>0 ? (pays.reduce((s,i)=>s+collectedOf(i),0)/billed*100) : 100;
            const margin = billed>0 ? ((billed-totalCost)/billed*100) : null;
            const budUse = (p.budgetAmount||0)>0 ? (costs/p.budgetAmount*100) : null;
            let score = 0;
            if(collectRatio>=80) score++; if(margin===null||margin>=30) score++;
            if(duePays+feesOut < billed*0.25 || billed===0) score++;
            if(budUse===null||budUse<=100) score++;
            const health = score>=4 ? ['ممتاز','ok'] : score===3 ? ['جيد','neutral'] : score===2 ? ['تحذير','soon'] : ['حرج','bad'];
            return (
              <div className="card" style={{marginBottom:18, display:'flex', gap:24, alignItems:'center', flexWrap:'wrap'}}>
                <div>
                  <div className="kpi-label">الصحة المالية للمشروع</div>
                  <div style={{marginTop:6}}><span className={"badge "+health[1]} style={{fontSize:14, padding:'6px 16px'}}>{health[0]}</span></div>
                </div>
                <div style={{fontSize:12, color:'var(--ink-soft)'}}>نسبة التحصيل: <b>{collectRatio.toFixed(0)}%</b></div>
                {margin!==null && <div style={{fontSize:12, color:'var(--ink-soft)'}}>هامش الربح: <b style={{color:margin<20?'var(--rust)':'var(--teal)'}}>{margin.toFixed(0)}%</b></div>}
                {budUse!==null && (
                  <div style={{flex:1, minWidth:200}}>
                    <div style={{fontSize:11.5, color:'var(--ink-soft)', marginBottom:4}}>استهلاك الميزانية: <b style={{color:budUse>100?'var(--rust)':'var(--ink)'}}>{budUse.toFixed(0)}%</b> ({money(costs)} من {money(p.budgetAmount)})</div>
                    <div className="progress" style={{width:'100%'}}><div style={{width:Math.min(100,budUse)+'%', background:budUse>100?'var(--rust)':budUse>80?'var(--amber, #B8860B)':'var(--teal)'}}></div></div>
                    {budUse>100 && <div style={{fontSize:11, color:'var(--rust)', fontWeight:700, marginTop:3}}>⚠ تجاوزت التكاليف الميزانية المحددة</div>}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', marginBottom:18}}>
            <div className="card"><div className="kpi-label">عمولات متوقعة من عقود المقاولين</div>
              <div className="kpi-value" style={{fontSize:18, color:'var(--brass)'}}>{money(contractors.reduce((s,c)=>s+contractCommission(c),0))}</div>
              <div className="kpi-note">تتحول لدخل عند توليد دفعتها من تبويب العقود — قيم عقود المقاولين نفسها خارج الإيرادات والضريبة</div></div>
            <div className="card"><div className="kpi-label">الرسوم الحكومية (أمانات)</div><div className="kpi-value" style={{fontSize:18}}>{money(feesTotal)}</div><div className="kpi-note" style={{color:feesOut>0?'var(--rust)':'var(--ink-faint)'}}>{feesOut>0 ? 'منها '+money(feesOut)+' لم تُسترد من المالك' : 'مسوّاة بالكامل'}</div></div>
            <div className="card"><div className="kpi-label">تكاليف المشروع المباشرة</div><div className="kpi-value" style={{fontSize:18}}>{money(costs)}</div><div className="kpi-note">طباعة، مواصلات، فحوصات...</div></div>
            <div className="card"><div className="kpi-label">تكلفة وقت المهندسين</div><div className="kpi-value" style={{fontSize:18, color:'var(--rust)'}}>{money(timeCost)}</div><div className="kpi-note">{timeHours} ساعة مسجّلة × تكلفة ساعة كل مهندس</div></div>
            {(p.estHours||0)>0 && (()=>{
              const est = Number(p.estHours)||0;
              const pct = est>0 ? (timeHours/est*100) : 0;
              const over = timeHours > est;
              return (
                <div className="card"><div className="kpi-label">الساعات: فعلي مقابل مقدّر</div>
                  <div className="kpi-value" style={{fontSize:18, color:over?'var(--rust)':'var(--teal)'}}>{Math.round(timeHours*10)/10} / {est} ساعة</div>
                  <div className="progress" style={{width:'100%', marginTop:4}}><div style={{width:Math.min(100,pct)+'%', background:over?'var(--rust)':pct>80?'var(--amber,#B8860B)':'var(--teal)'}}></div></div>
                  <div className="kpi-note" style={{color:over?'var(--rust)':'var(--ink-faint)'}}>{over?('⚠ تجاوز التقدير بـ '+Math.round(timeHours-est)+' ساعة — راجع التسعير'):(pct.toFixed(0)+'% من التقدير')}</div>
                </div>
              );
            })()}
            <div className="card"><div className="kpi-label">الربح الحقيقي (تراكمي)</div><div className="kpi-value" style={{fontSize:18, color:(billed-totalCost)>=0?'var(--teal)':'var(--rust)'}}>{money(billed-totalCost)}</div><div className="kpi-note">المفوتر − (التكاليف المباشرة + تكلفة الوقت)</div></div>
          </div>
          <div className="card" style={{padding:0}}>
            <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>الإجمالي شامل الضريبة</th><th>الحالة</th><th>فاتورة / سند</th></tr></thead>
              <tbody>
                {pays.length===0 && <tr className="empty-row"><td colSpan={6}>لا توجد دفعات — تُضاف من قسم الدفعات الاستشارية</td></tr>}
                {[...pays].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(i=>(
                  <tr key={i.id}>
                    <td>{i.date}</td>
                    <td><span className={"badge "+(i.phase==='إشراف'?'neutral':i.phase==='أخرى'?'soon':'gray')}>{i.phase}</span></td>
                    <td>{i.phase==='إشراف' ? ('إشراف '+(i.month?fmtMonth(i.month):'')) : (i.label||'—')}</td>
                    <td><b>{money(i.amount*grossFactor(i))}</b></td>
                    <td><span className={"badge "+(i.status==='مدفوعة'?'ok':i.status==='مدفوعة جزئياً'?'neutral':i.status==='متأخرة'?'bad':'soon')}>{i.status}</span></td>
                    <td style={{fontSize:11}}>{i.invoiceNo||'—'}{i.receiptNo?' / '+i.receiptNo:''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab==='statement' && <StatementView data={data} fixedPid={p.id} />}

      {tab==='folder' && (
        <div className="card">
          <div className="section-title"><h3>مجلد مستندات المشروع</h3><div className="rule"></div></div>
          <p style={{fontSize:13, color:'var(--ink-soft)'}}>المستندات لا تُخزن داخل النظام — تُحفظ في مجلد المشروع على الجهاز:</p>
          <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginTop:8}}>
            <code style={{background:'var(--paper)', border:'1px solid var(--line-strong)', borderRadius:4, padding:'10px 16px', fontSize:15, fontWeight:700, direction:'ltr'}}>{folderPath}</code>
            <button className="btn brass" onClick={copyPath}>نسخ المسار</button>
            <button className="btn outline" onClick={openFolder}>محاولة فتح المجلد</button>
          </div>
          <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:14}}>* اسم المجلد الافتراضي: "رقم المشروع - اسمه" وقابل للتخصيص من بيانات المشروع. زر الفتح المباشر يعمل غالباً إذا كان النظام مفتوحاً كملف محلي — وإن منعه المتصفح فانسخ المسار والصقه في الـ Explorer.</p>
        </div>
      )}
    </div>
  );
}

/* ================= Projects View (قائمة + ملف المشروع) ================= */
const recentGet = ()=>{ try{ return JSON.parse(localStorage.getItem('nitaq-recent')||'[]'); }catch(e){ return []; } };
const recentPush = (id)=>{ try{ const r = [id, ...recentGet().filter(x=>x!==id)].slice(0,6); localStorage.setItem('nitaq-recent', JSON.stringify(r)); }catch(e){} };

function ProjectsView({data, configs, mutate, jumpId, onJumpDone, role}){
  const [selected, setSelected] = useState(null);
  const [stFilter, setStFilter] = useState('');
  const m = mutate('projects');
  useEffect(()=>{ if(jumpId){ setSelected(jumpId); recentPush(jumpId); onJumpDone && onJumpDone(); } }, [jumpId]);
  const open = (id)=>{ recentPush(id); setSelected(id); };
  const sel = selected ? data.projects.find(p=>p.id===selected) : null;
  if(sel) return <ProjectProfile project={sel} data={data} configs={configs} mutate={mutate} onBack={()=>setSelected(null)} role={role} />;
  const recents = recentGet().map(id=>data.projects.find(p=>p.id===id)).filter(Boolean).filter(p=>!isArchived(p));
  const byStatus = stFilter ? data.projects.filter(p=>p.status===stFilter) : data.projects;
  const sortedRecords = [...byStatus].sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0));
  const updateProject = (id, vals)=>{
    const prev = data.projects.find(p=>p.id===id) || {};
    let patch = {...vals};
    if(vals.status==='منتهٍ' && !prev.archived){
      patch.archived = true; patch.autoArchivedOnFinish = true;
    } else if(vals.status!=='منتهٍ' && prev.archived && prev.autoArchivedOnFinish){
      patch.archived = false; patch.autoArchivedOnFinish = false;
    }
    m.update(id, patch);
  };
  const addProject = (rec)=> m.add(rec.status==='منتهٍ' ? {...rec, archived:true, autoArchivedOnFinish:true} : rec);
  return (
    <div>
      {recents.length>0 && (
        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14}}>
          <span style={{fontSize:11, fontWeight:800, color:'var(--ink-faint)', letterSpacing:.5}}>آخر المشاريع:</span>
          {recents.map(p=>(
            <button key={p.id} className="btn outline small" onClick={()=>open(p.id)}>
              {p.pinned?'⭐ ':''}{(p.projectNo?p.projectNo+' — ':'')+p.name}
            </button>
          ))}
        </div>
      )}
      <EntityView config={configs.projects} records={sortedRecords} data={data}
        onAdd={addProject} onUpdate={updateProject} onDelete={m.del}
        onRowClick={(row)=>open(row.id)}
        headExtra={
          <select value={stFilter} onChange={e=>setStFilter(e.target.value)}
            style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
            <option value="">كل الحالات</option>
            <option value="جارٍ">جارٍ فقط</option>
            <option value="منتهٍ">منتهٍ فقط</option>
            <option value="متوقف">متوقف فقط</option>
          </select>
        }
        rowActions={(row)=>(
          <React.Fragment>
            <button className="btn ghost small" title={row.pinned?'إزالة التثبيت':'تثبيت كمفضل (يظهر أول القائمة)'}
              style={{color:row.pinned?'var(--brass)':'var(--ink-faint)'}}
              onClick={()=>m.update(row.id, {pinned:!row.pinned})}>{row.pinned?'⭐':'☆'}</button>
            <button className="btn ghost small" title="فتح ملف المشروع" style={{color:'var(--brass)'}} onClick={()=>open(row.id)}><I.compass/></button>
          </React.Fragment>
        )}
      />
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* اضغط على أي مشروع لفتح ملفه الكامل: Timeline، الاعتمادات، العقود، الملف المالي، كشف الحساب، ومجلد المستندات. استخدم خانة البحث بالرقم أو الاسم أو المالك أو رقم القطعة. * أي مشروع تُغيّر حالته إلى "منتهٍ" ينتقل تلقائياً إلى الأرشيف ولا يظهر في القائمة الرئيسية — يمكن استعراضه عبر زر "مؤرشف" أعلى الجدول، أو تُعاد حالته لغير "منتهٍ" لإرجاعه تلقائياً.</p>
    </div>
  );
}

/* ================= Settings View ================= */
function SbConfigForm(){
  const cfg = getSbConfig() || {url:'', key:''};
  const [url, setUrl] = useState(cfg.url||'');
  const [key, setKey] = useState(cfg.key||'');
  const isDefault = cfg.url===DEFAULT_SB_CONFIG.url && cfg.key===DEFAULT_SB_CONFIG.key;
  const save = ()=>{
    if(url && key){ setSbConfig({url:url.trim(), key:key.trim()}); alert('تم الحفظ — سيُعاد تحميل النظام للاتصال بالسحابة'); window.location.reload(); }
    else if(!url && !key){ setSbConfig({disabled:true}); alert('تم إلغاء الربط السحابي على هذا الجهاز — سيعمل النظام محلياً بدون مزامنة'); window.location.reload(); }
    else alert('أدخل الرابط والمفتاح معاً، أو اتركهما فارغين لإلغاء الربط على هذا الجهاز فقط');
  };
  return (
    <div>
      {isDefault && (
        <p style={{fontSize:12, color:'var(--teal)', marginBottom:12}}>✓ متصل تلقائياً بإعداد الشركة الافتراضي — لا داعي لتغيير أي شيء هنا إلا لو تستخدم مشروع Supabase مختلف.</p>
      )}
      <div className="field" style={{marginBottom:12}}>
        <label>Project URL</label>
        <input value={url} onChange={e=>setUrl(e.target.value)} style={{direction:'ltr'}} placeholder="https://xxxx.supabase.co" />
      </div>
      <div className="field" style={{marginBottom:12}}>
        <label>Anon Public Key</label>
        <input value={key} onChange={e=>setKey(e.target.value)} style={{direction:'ltr'}} placeholder="eyJ..." />
      </div>
      <button className="btn brass" onClick={save}>حفظ والاتصال</button>
      <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12}}>الخطوات: supabase.com ← مشروع جديد (مجاني) ← SQL Editor ← تشغيل ملف nitaq-supabase-schema.sql ← ثم انسخ من Settings ← API: الـ URL والـ anon key وضعهما هنا. أول حساب يسجل يصبح المالك.</p>
    </div>
  );
}


function SettingsView({data, setSettings}){
  const [s, setS] = useState(Object.assign({projectsRoot:'D:\\Projects', bankName:'', iban:'', accountName:''}, data.settings||{}));
  const set = (k,v)=> setS(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="card" style={{maxWidth:640, marginBottom:18}}>
        <div className="section-title"><h3>إعدادات النظام</h3><div className="rule"></div></div>
        <div className="field" style={{marginBottom:14}}>
          <label>المسار الرئيسي لمجلدات المشاريع</label>
          <input value={s.projectsRoot} onChange={e=>set('projectsRoot', e.target.value)} style={{direction:'ltr'}} />
          <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:4}}>يدعم مسارات الشبكة مثل \\SERVER\Projects — مجلد كل مشروع = هذا المسار + "رقم المشروع - اسمه"</div>
        </div>
        <div className="section-title" style={{marginTop:22}}><h3>بيانات الحساب البنكي (تظهر على الفاتورة الضريبية)</h3><div className="rule"></div></div>
        <div className="field" style={{marginBottom:14}}>
          <label>اسم البنك</label>
          <input value={s.bankName} onChange={e=>set('bankName', e.target.value)} />
        </div>
        <div className="field" style={{marginBottom:14}}>
          <label>IBAN</label>
          <input value={s.iban} onChange={e=>set('iban', e.target.value)} style={{direction:'ltr'}} placeholder="AE.." />
        </div>
        <div className="field" style={{marginBottom:14}}>
          <label>اسم صاحب الحساب</label>
          <input value={s.accountName} onChange={e=>set('accountName', e.target.value)} />
        </div>
        <button className="btn brass" onClick={()=>{ setSettings(s); alert('تم حفظ الإعدادات'); }}>حفظ الإعدادات</button>
      </div>
      <div className="card" style={{maxWidth:640, marginBottom:18}}>
        <div className="section-title"><h3>الربط السحابي (Supabase) — للعمل الجماعي على أجهزة متعددة</h3><div className="rule"></div></div>
        <SbConfigForm />
      </div>
      <div className="card" style={{maxWidth:640}}>
        <div className="section-title"><h3>بيانات الشركة الثابتة (من شهادة التسجيل الضريبي)</h3><div className="rule"></div></div>
        <div className="info-grid">
          <div className="doc-line"><span className="lbl">الاسم القانوني</span><span className="val">{COMPANY.nameAr}</span></div>
          <div className="doc-line"><span className="lbl">TRN</span><span className="val">{COMPANY.trn}</span></div>
          <div className="doc-line"><span className="lbl">رقم الرخصة</span><span className="val">{COMPANY.license}</span></div>
          <div className="doc-line"><span className="lbl">الهاتف</span><span className="val">{COMPANY.phone2} / {COMPANY.phone}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ================= تصدير Excel شامل ================= */
const loadXlsxLib = ()=> new Promise((resolve, reject)=>{
  if(window.XLSX) return resolve(window.XLSX);
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = ()=> resolve(window.XLSX);
  s.onerror = ()=> reject(new Error('تعذر تحميل مكتبة Excel — تحقق من اتصال الإنترنت'));
  document.head.appendChild(s);
});

const EXTRA_FIELD_AR = {id:'المعرف (تقني)', archived:'مؤرشف', archiveReason:'سبب الأرشفة/الإلغاء', archivedAt:'تاريخ الأرشفة',
  invoiceNo:'رقم الفاتورة', receiptNo:'رقم السند', collectedAmount:'المحصّل جزئياً (صافي)', paidDate:'تاريخ السداد',
  method:'طريقة الدفع', refNo:'المرجع', pinned:'مثبت كمفضل', closedAt:'تاريخ الإقفال', projectNo:'رقم المشروع',
  timeline:'مراحل Timeline', approvals:'الاعتمادات'};

async function exportExcelBackup(data, configs){
  const XLSX = await loadXlsxLib();
  const wb = XLSX.utils.book_new();
  wb.Workbook = {Views:[{RTL:true}]};
  const projName = (id)=>{ const p=data.projects.find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : ''; };
  const contractName = (id)=>{ const c=(data.contracts||[]).find(x=>x.id===id); return c ? (c.type||c.category||'عقد')+(c.contractor?' — '+c.contractor:'') : ''; };
  const empName = (id)=> id ? ((data.employees.find(e=>e.id===id)||{}).name || ((data.staffDir||[]).find(s=>s.empId===id)||{}).name || id) : '';
  const fmt = (k, v)=>{
    if(v===undefined || v===null || v==='') return '';
    if(k==='projectId') return projName(v);
    if(k==='contractId') return contractName(v);
    if(k==='employeeId' || k==='responsibleId' || k==='assignedTo') return empName(v) || v;
    if(v===true) return 'نعم';
    if(v===false) return 'لا';
    if(typeof v==='object') return JSON.stringify(v).slice(0, 500);
    return v;
  };
  const SHEETS = [['projects','المشاريع'],['contracts','العقود'],['payments','الدفعات'],['govFees','الرسوم الحكومية'],
    ['officeExpenses','مصروفات المكتب'],['projectCosts','تكاليف المشاريع'],['treasury','الخزينة'],
    ['employees','الموظفون'],['overtime','الأوفرتايم'],['advances','السلف'],['cars','السيارات'],['decisions','القرارات والوقائع'],
    ['otherIncome','الإيرادات الأخرى'],['recurringBills','الفواتير المتكررة'],['leaves','الإجازات'],['timesheets','ساعات العمل']];
  SHEETS.forEach(([key, name])=>{
    const recs = data[key]||[];
    const cfg = configs[key];
    const fieldOrder = cfg ? cfg.fields.map(f=>f.name) : [];
    const labels = {};
    if(cfg) cfg.fields.forEach(f=>{ labels[f.name] = f.label; });
    const extras = [];
    recs.forEach(r=> Object.keys(r).forEach(k=>{
      if(k!=='_ts' && k!=='docSnapshot' && k!=='id' && !fieldOrder.includes(k) && !extras.includes(k)) extras.push(k);
    }));
    const cols = [...fieldOrder, ...extras, 'id'];
    const rows = recs.map(r=>{
      const o = {};
      cols.forEach(k=>{ o[labels[k] || EXTRA_FIELD_AR[k] || k] = fmt(k, r[k]); });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{'لا بيانات':''}]);
    ws['!cols'] = cols.map(()=>({wch:18}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const attRows = [];
  Object.entries(data.attendance||{}).forEach(([empId, map])=>{
    Object.entries(map||{}).forEach(([dt, st])=> attRows.push({'الموظف':empName(empId)||empId, 'التاريخ':dt, 'الحالة':st}));
  });
  attRows.sort((a,b)=> (a['التاريخ']||'').localeCompare(b['التاريخ']||''));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attRows.length?attRows:[{'لا بيانات':''}]), 'الحضور');
  const audRows = [...(data.auditLog||[])].sort((a,b)=>(b._ts||0)-(a._ts||0)).map(r=>({'الوقت':r.at, 'المستخدم':r.user, 'العملية':r.action, 'القسم':ENTITY_AR[r.entity]||r.entity, 'التفاصيل':r.summary}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(audRows.length?audRows:[{'لا بيانات':''}]), 'سجل التدقيق');
  const setRows = Object.entries(data.settings||{}).map(([k,v])=>({'الإعداد':k, 'القيمة':String(v||'')}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(setRows.length?setRows:[{'لا بيانات':''}]), 'الإعدادات');
  XLSX.writeFile(wb, 'NITAQ-ERP-Backup-'+todayISO()+'.xlsx');
}

/* ===== تصدير قائمة مصروفات المكتب (شيت مطابقة للمحاسب) ===== */
