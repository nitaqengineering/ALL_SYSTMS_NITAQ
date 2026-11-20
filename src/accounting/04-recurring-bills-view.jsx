function RecurringBillsView({data, configs, mutate}){
  const m = mutate('recurringBills');
  const mExp = mutate('officeExpenses');
  const dueSoon = data.recurringBills.filter(b=>!isArchived(b) && b.active!=='متوقف').map(b=>({b, d:daysUntil(b.nextDueDate)})).filter(x=>x.d!==null && x.d<=(x.b.reminderDays||5)).sort((a,b)=>a.d-b.d);

  const markPaid = (bill)=>{
    if(!confirm('تسجيل سداد "'+bill.provider+'" بمبلغ '+money(bill.amount)+'؟\nهيتسجل مصروف مكتب جديد تلقائياً، وهيتحدث تاريخ الاستحقاق القادم لـ '+advanceDate(bill.nextDueDate, bill.frequency)+'.')) return;
    mExp.add({id:uid(), _ts:Date.now(), date:todayISO(), category:bill.category, amount:bill.amount, vatable:'غير خاضع', payStatus:'مدفوع', account:bill.account, note:'سداد دوري — '+bill.provider});
    m.update(bill.id, {nextDueDate: advanceDate(bill.nextDueDate, bill.frequency)});
  };

  return (
    <div>
      {dueSoon.length>0 && (
        <div className="card" style={{marginBottom:14, borderInlineStart:'4px solid var(--rust)'}}>
          <p style={{fontSize:13, fontWeight:800, marginBottom:8}}>⏰ فواتير قريبة الاستحقاق أو متأخرة:</p>
          {dueSoon.map(({b,d})=>(
            <div key={b.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderTop:'1px solid var(--line)', fontSize:12.5}}>
              <span>{b.provider} ({b.category}) — {money(b.amount)} — {d<0?('متأخرة '+Math.abs(d)+' يوم'):(d===0?'مستحقة اليوم':('خلال '+d+' يوم'))} ({b.nextDueDate})</span>
              <button className="btn brass" style={{padding:'4px 12px', fontSize:11.5}} onClick={()=>markPaid(b)}>✓ تم السداد</button>
            </div>
          ))}
        </div>
      )}
      <EntityView config={configs.recurringBills} records={data.recurringBills} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del}
        rowActions={(row)=> row.active!=='متوقف' && (
          <button className="btn ghost small" title="تسجيل سداد هذه الفاتورة" style={{color:'var(--teal)'}} onClick={()=>markPaid(row)}>✓</button>
        )}
      />
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* عند الضغط على "تم السداد"، يُسجَّل مصروف مكتب تلقائياً بنفس المبلغ والتصنيف، ويتقدّم تاريخ الاستحقاق القادم حسب دورية الفاتورة (شهري/ربع سنوي/نصف سنوي/سنوي). عدّل المبلغ من الفاتورة نفسها إذا اختلف عن المعتاد قبل الضغط على السداد.</p>
    </div>
  );
}

/* ================= قائمة عامة بفلتر مشروع ================= */
function ProjectFilteredList({entity, data, configs, mutate}){
  const [pid, setPid] = useState('');
  const m = mutate(entity);
  const records = pid ? (data[entity]||[]).filter(r=>r.projectId===pid) : (data[entity]||[]);
  return (
    <EntityView config={configs[entity]} records={records} data={data}
      onAdd={m.add} onUpdate={m.update} onDelete={m.del}
      headExtra={
        <select value={pid} onChange={e=>setPid(e.target.value)}
          style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
          <option value="">كل المشاريع</option>
          {data.projects.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
        </select>
      }
    />
  );
}

/* ================= Payments View (مع شريط ملخص وفلتر وسندات قبض) ================= */
function PaymentsView({data, configs, mutate, lockedProject, role}){
  const [filterProjState, setFilterProj] = useState('');
  const [settleFor, setSettleFor] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const filterProj = lockedProject || filterProjState;
  const [receiptFor, setReceiptFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [demandFor, setDemandFor] = useState(null);
  const [cnFor, setCnFor] = useState(null);   // إشعار دائن (شيك مرتجع)
  const m = mutate('payments');
  const records = filterProj ? data.payments.filter(p=>p.projectId===filterProj) : data.payments;

  if(receiptFor){
    const pay = data.payments.find(p=>p.id===receiptFor);
    if(pay){
      const proj = data.projects.find(p=>p.id===pay.projectId);
      return <ReceiptDoc payment={pay} project={proj} onBack={()=>setReceiptFor(null)} />;
    }
  }
  if(invoiceFor){
    const pay = data.payments.find(p=>p.id===invoiceFor);
    if(pay){
      const proj = data.projects.find(p=>p.id===pay.projectId);
      const refreshInvoice = ()=>{
        if(!proj) return;
        m.update(pay.id, {docSnapshot:{owner:proj.owner||'', ownerTrn:proj.ownerTrn||'', additionalOwners:proj.additionalOwners||[], projectName:proj.name||'', plotNumber:proj.plotNumber||'', projectNo:proj.projectNo||'', issuedAt:(pay.docSnapshot&&pay.docSnapshot.issuedAt)||todayISO()}});
      };
      return <InvoiceDoc payment={pay} project={proj} settings={data.settings} onBack={()=>setInvoiceFor(null)} onRefresh={refreshInvoice} />;
    }
  }
  if(demandFor){
    const pay = data.payments.find(p=>p.id===demandFor);
    if(pay){
      const proj = data.projects.find(p=>p.id===pay.projectId);
      return <DemandDoc payment={pay} project={proj} onBack={()=>setDemandFor(null)} />;
    }
  }

  if(cnFor) return <CreditNoteDoc cn={cnFor} onClose={()=>setCnFor(null)} />;

  const generateSupervision = () => {
    const ym = currentYM();
    const targets = (data.contracts||[]).filter(c=>{
      if(!contractHasSupervision(c) || c.status!=='سارٍ' || (c.category && c.category!=='خدمات استشارية')) return false;
      const proj = data.projects.find(p=>p.id===c.projectId);
      if(!proj || proj.status!=='جارٍ' || !projectReadyForSupervision(proj)) return false;
      const done = data.payments.filter(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف').length;
      if(done >= (c.supervisionMonths||0)) return false;
      return !data.payments.some(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف' && i.month===ym);
    });
    if(targets.length===0){ alert('لا توجد دفعات إشراف مطلوب توليدها لشهر '+fmtMonth(ym)); return; }
    const due = new Date(); due.setDate(due.getDate()+10);
    targets.forEach(c=>{
      m.add({id:uid(), projectId:c.projectId, contractId:c.id, phase:'إشراف', month:ym, amount:c.supervisionMonthly,
        date:todayISO(), dueDate:due.toISOString().slice(0,10), status:'معلقة', _ts:Date.now()});
    });
    alert('تم توليد '+targets.length+' دفعة إشراف لشهر '+fmtMonth(ym)+' بحالة معلقة');
  };

  const docSeq = (row, field, prefix) => {
    const proj = data.projects.find(p=>p.id===row.projectId);
    const pno = proj ? proj.projectNo : 0;
    const pre = prefix+'-'+pno+'-';
    const maxNo = data.payments.reduce((mx,p)=>{
      if(!(p[field]||'').startsWith(pre)) return mx;
      return Math.max(mx, parseInt((p[field]||'').slice(pre.length))||0);
    }, 0);
    return pre + String(maxNo+1).padStart(3,'0');
  };
  const takeSnapshot = (row)=>{
    if(row.docSnapshot) return {};
    const proj = data.projects.find(p=>p.id===row.projectId) || {};
    return {docSnapshot:{owner:proj.owner||'', ownerTrn:proj.ownerTrn||'', additionalOwners:proj.additionalOwners||[], projectName:proj.name||'', plotNumber:proj.plotNumber||'', projectNo:proj.projectNo||'', issuedAt:todayISO()}};
  };
  const openReceipt = (row) => {
    if(!row.receiptNo) m.update(row.id, {receiptNo: docSeq(row, 'receiptNo', 'RCP'), ...takeSnapshot(row)});
    setReceiptFor(row.id);
  };
  const openInvoice = (row) => {
    if(!row.invoiceNo) m.update(row.id, {invoiceNo: docSeq(row, 'invoiceNo', 'INV'), ...takeSnapshot(row)});
    setInvoiceFor(row.id);
  };
  const openDemand = (row) => {
    if(!row.demandNo) m.update(row.id, {demandNo: docSeq(row, 'demandNo', 'DMD'), ...takeSnapshot(row)});
    setDemandFor(row.id);
  };

  // ===== شيك مرتجع (حالة نادرة): عكس القبض + إشعار دائن لإبطال الضريبة + إلغاء الدفعة =====
  const bouncedCheque = (row) => {
    const net = row.amount||0;
    const rate = vatRateOf(row);
    const vat = net*rate;
    const gross = net*(1+rate);
    const proj = data.projects.find(p=>p.id===row.projectId) || {};
    const msg = 'تأكيد: شيك الدفعة ارتدّ (رجع بدون رصيد).\n\nهيتم تلقائياً:\n'
      + '• عكس القبض — '+money(gross)+' يخرج من رصيد '+(row.account||'البنك')+' تلقائياً (الفلوس ماجتش فعلاً)\n'
      + '• إشعار دائن لإبطال الفاتورة '+(row.invoiceNo||'')+' واسترداد الضريبة '+money(vat)+' من الهيئة\n'
      + '• تحويل الدفعة إلى "ملغاة — شيك مرتجع"\n\nمتابعة؟';
    if(!confirm(msg)) return;
    const refNote = row.refNo ? ' (شيك رقم '+row.refNo+')' : '';
    const cnNo = 'CN-'+(proj.projectNo||'')+'-'+(row.invoiceNo||todayISO().replace(/-/g,''));
    // ملاحظة: لا نضيف حركة خزينة صرف — لأن تحويل الدفعة إلى "ملغاة" يجعل collectedOf=0،
    // فيختفي قبضها تلقائياً من رصيد الحساب (عكس القبض ذاتي). إضافة صرف هنا كانت ستخصم المبلغ مرتين.
    // تحويل الدفعة إلى ملغاة (net يصير 0 فلا تُحتسب ذمة ولا إيراد) + حفظ رقم الإشعار لإعادة الطباعة
    m.update(row.id, {status:'ملغاة', cancelReason:'شيك مرتجع — ارتدّ شيك الفاتورة '+(row.invoiceNo||'')+refNote+'. عُكس القبض وأُبطلت الفاتورة بإشعار دائن.',
      bouncedCheque:true, bouncedDate:todayISO(), creditNoteNo:cnNo, lastCorrectionReason:'شيك مرتجع — عكس قبض وإبطال فاتورة', lastCorrectionAt:new Date().toISOString()});
    // 3) إشعار دائن بكامل قيمة الفاتورة (يبطّل أثر ضريبة المخرجات)
    setCnFor({ project:proj, refundNet:net, refundVat:vat, refundGross:gross, reason:'إبطال الفاتورة '+(row.invoiceNo||'')+' — شيك مرتجع'+refNote, date:todayISO(), cnNo, origInvoice:row.invoiceNo });
  };

  // إعادة فتح/طباعة إشعار الدائن لدفعة ملغاة بشيك مرتجع (في أي وقت)
  const reopenCreditNote = (row) => {
    const net = row.amount||0;
    const rate = vatRateOf(row);
    const vat = net*rate;
    const gross = net*(1+rate);
    const proj = data.projects.find(p=>p.id===row.projectId) || {};
    const refNote = row.refNo ? ' (شيك رقم '+row.refNo+')' : '';
    const cnNo = row.creditNoteNo || ('CN-'+(proj.projectNo||'')+'-'+(row.invoiceNo||''));
    setCnFor({ project:proj, refundNet:net, refundVat:vat, refundGross:gross, reason:'إبطال الفاتورة '+(row.invoiceNo||'')+' — شيك مرتجع'+refNote, date:row.bouncedDate||todayISO(), cnNo, origInvoice:row.invoiceNo });
  };

  const designTotal = records.filter(p=>p.phase==='تصميم').reduce((s,p)=>s+billedOf(p),0);
  const supervTotal = records.filter(p=>p.phase==='إشراف').reduce((s,p)=>s+billedOf(p),0);
  const otherTotal = records.filter(p=>p.phase==='أخرى').reduce((s,p)=>s+billedOf(p),0);
  const unpaid = records.reduce((s,p)=>s+remainderOf(p)*grossFactor(p),0);

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card">
          <div className="kpi-label">دفعات التصميم والاعتماد</div>
          <div className="kpi-value" style={{fontSize:19}}>{money(designTotal)}</div>
          <div className="kpi-note">المرحلة الأولى — قبل الضريبة</div>
        </div>
        <div className="card">
          <div className="kpi-label">دفعات الإشراف الشهري</div>
          <div className="kpi-value" style={{fontSize:19}}>{money(supervTotal)}</div>
          <div className="kpi-note">المرحلة الثانية — قبل الضريبة</div>
        </div>
        <div className="card">
          <div className="kpi-label">رسوم أخرى خاضعة للضريبة</div>
          <div className="kpi-value" style={{fontSize:19}}>{money(otherTotal)}</div>
          <div className="kpi-note">فحوصات وخدمات خارجية</div>
        </div>
        <div className="card">
          <div className="kpi-label">مستحقات غير محصلة</div>
          <div className="kpi-value" style={{fontSize:19, color:unpaid>0?'var(--rust)':'var(--teal)'}}>{money(unpaid)}</div>
          <div className="kpi-note">شاملة الضريبة — معلقة أو متأخرة</div>
        </div>
      </div>
      {settleFor && <SettlePaymentModal payment={settleFor} mutate={mutate} onClose={()=>setSettleFor(null)} />}
      {bulkOpen && <BulkSettleModal data={data} mutate={mutate} presetProject={lockedProject||filterProj||''} onClose={()=>setBulkOpen(false)} />}
      <EntityView config={lockedProject ? {...configs.payments, defaults:{...configs.payments.defaults, projectId:lockedProject}} : configs.payments} records={records} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del} role={role}
        rowActions={(row)=>(
          <React.Fragment>
            <button className="btn ghost small" title="فاتورة ضريبية" onClick={()=>openInvoice(row)}><I.docfile/></button>
            {row.status!=='مدفوعة' && !isArchived(row) && remainderOf(row)>0 && (
              <button className="btn ghost small" title="مطالبة بدفعة (للإرسال للمالك)" style={{color:'var(--brass)'}} onClick={()=>openDemand(row)}>📄</button>
            )}
            {row.status!=='مدفوعة' && row.status!=='ملغاة' && !isArchived(row) && (
              <button className="btn ghost small" title="تسجيل تحصيل" style={{color:'var(--teal)'}} onClick={()=>setSettleFor(row)}>💰</button>
            )}
            {(row.status==='مدفوعة'||row.status==='مدفوعة جزئياً') && (
              <button className="btn ghost small" title="سند قبض" onClick={()=>openReceipt(row)}><I.print/></button>
            )}
            {row.status==='مدفوعة' && row.method==='شيك' && !isArchived(row) && (
              <button className="btn ghost small" title="شيك مرتجع — عكس القبض وإبطال الفاتورة بإشعار دائن" style={{color:'var(--rust)'}} onClick={()=>bouncedCheque(row)}>⟲</button>
            )}
            {row.bouncedCheque && (
              <button className="btn ghost small" title="إعادة طباعة إشعار الدائن (شيك مرتجع)" style={{color:'var(--rust)'}} onClick={()=>reopenCreditNote(row)}>🧾</button>
            )}

          </React.Fragment>
        )}
        headExtra={
          <React.Fragment>
            <button className="btn outline" onClick={generateSupervision}>توليد دفعات إشراف {fmtMonth(currentYM())}</button>
            <button className="btn outline" onClick={()=>setBulkOpen(true)}>💰 تحصيل مجمّع</button>
            {lockedProject ? null : <select value={filterProj} onChange={e=>setFilterProj(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
              <option value="">كل المشاريع</option>
              {data.projects.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
            </select>}
          </React.Fragment>
        }
      />
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* بجوار كل دفعة: زر الفاتورة الضريبية (لأي دفعة)، وزر 📄 المطالبة بدفعة (للدفعات المستحقة غير المحصّلة — تُطبع بنفس تصميم سند القبض لإرسالها للمالك)، وزر سند القبض (للدفعات المدفوعة فقط). الترقيم تسلسلي تلقائي ومنفصل لكل نوع (RCP / INV / DMD).</p>
    </div>
  );
}

/* ================= Gov Fees View (أمانات خارج الإيرادات والضريبة) ================= */
function GovFeesView({data, configs, mutate, lockedProject}){
  const [filterProjState, setFilterProj] = useState('');
  const filterProj = lockedProject || filterProjState;
  const m = mutate('govFees');
  const records = filterProj ? data.govFees.filter(g=>g.projectId===filterProj) : data.govFees;

  const total = records.reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const paidToDept = records.filter(g=>g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const reimbursed = records.filter(g=>g.reimburseStatus==='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const outstanding = records.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">إجمالي الرسوم</div><div className="kpi-value" style={{fontSize:20}}>{money(total)}</div><div className="kpi-note">{records.length} بند</div></div>
        <div className="card"><div className="kpi-label">مدفوع للدوائر</div><div className="kpi-value" style={{fontSize:20, color:'var(--blue)'}}>{money(paidToDept)}</div><div className="kpi-note">من خزينة المكتب</div></div>
        <div className="card"><div className="kpi-label">مسترد من العملاء</div><div className="kpi-value" style={{fontSize:20, color:'var(--teal)'}}>{money(reimbursed)}</div><div className="kpi-note">تمت تسويته</div></div>
        <div className="card"><div className="kpi-label">معلق الاسترداد</div><div className="kpi-value" style={{fontSize:20, color:outstanding>0?'var(--rust)':'var(--teal)'}}>{money(outstanding)}</div><div className="kpi-note">مدفوع للدائرة ولم يُسترد من العميل</div></div>
      </div>
      <EntityView config={lockedProject ? {...configs.govFees, defaults:{...configs.govFees.defaults, projectId:lockedProject}} : configs.govFees} records={records} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del}
        headExtra={ lockedProject ? null : (
          <select value={filterProj} onChange={e=>setFilterProj(e.target.value)}
            style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
            <option value="">كل المشاريع</option>
            {data.projects.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
          </select>
        )}
      />
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* الرسوم الحكومية أمانات تُدفع نيابة عن العميل — لا تدخل ضمن إيرادات المكتب ولا تخضع لضريبة القيمة المضافة، وتظهر في تقرير مستقل.</p>
    </div>
  );
}

/* ================= Attendance View ================= */
const ATT_STATES = [null,'present','absent','leave','late'];
const ATT_MARK = {present:'ح', absent:'غ', leave:'إ', late:'ت'};
function AttendanceView({data, setAttendance}){
  const [ym, setYm] = useState(currentYM());
  const [year, month] = ym.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({length:daysInMonth}, (_,i)=>i+1);

  const cycle = (empId, day) => {
    const dateStr = ym+'-'+String(day).padStart(2,'0');
    const cur = (data.attendance[empId]||{})[dateStr] || null;
    const idx = ATT_STATES.indexOf(cur);
    const next = ATT_STATES[(idx+1)%ATT_STATES.length];
    setAttendance(empId, dateStr, next);
  };

  return (
    <div>
      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}>
          <h3>الحضور والانصراف</h3>
          <div className="rule"></div>
        </div>
        <input type="month" value={ym} onChange={e=>setYm(e.target.value)} />
      </div>
      <div className="card" style={{padding:16}}>
        <p style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:14}}>انقر على أي خلية للتبديل بين: حاضر ← غائب ← إجازة ← متأخر ← فارغ</p>
        <div className="att-grid">
          <table className="att-table">
            <thead>
              <tr>
                <th className="att-name-col">الموظف</th>
                {days.map(d=>(<th key={d} style={{minWidth:26}}>{d}</th>))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map(emp=>(
                <tr key={emp.id}>
                  <td className="att-name-col">{emp.name}</td>
                  {days.map(d=>{
                    const dateStr = ym+'-'+String(d).padStart(2,'0');
                    const st = (data.attendance[emp.id]||{})[dateStr] || null;
                    return (
                      <td key={d} className={"att-cell "+(st||'empty')} onClick={()=>cycle(emp.id,d)}>
                        {st ? ATT_MARK[st] : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          <span><i style={{background:'var(--teal-soft)'}}></i> حاضر</span>
          <span><i style={{background:'var(--rust-soft)'}}></i> غائب</span>
          <span><i style={{background:'var(--blue-soft)'}}></i> إجازة</span>
          <span><i style={{background:'var(--amber-soft)'}}></i> متأخر</span>
        </div>
      </div>
    </div>
  );
}

/* ================= VAT View (ربع سنوي وفق شهادة الهيئة) ================= */
function VatView({data}){
  const projName = (id)=>{ const p=(data.projects||[]).find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : '—'; };
  const quarters = listQuarters();
  const [qk, setQk] = useState(quarters[quarters.length-1]);
  const [fProj, setFProj] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [q, setQ] = useState('');
  const qLower = q.trim().toLowerCase();
  const months = quarterMonths(qk);

  // فلتر مشترك يطبّق على الدفعات والمصروفات معاً
  const inWindow = (dateStr)=>{
    const d = dateStr||'';
    if(!months.includes(monthKey(d))) return false;      // ضمن الربع المختار
    if(fMonth && monthKey(d)!==fMonth) return false;      // شهر محدّد داخل الربع
    if(fFrom && d < fFrom) return false;                  // مدى مخصّص
    if(fTo && d > fTo) return false;
    return true;
  };

  const payIn = data.payments.filter(i=>{
    if(!inWindow(i.date)) return false;
    if(fProj && i.projectId!==fProj) return false;
    if(qLower){
      const hay = ((i.label||'')+' '+projName(i.projectId)+' '+(i.phase||'')).toLowerCase();
      if(!hay.includes(qLower)) return false;
    }
    return true;
  });
  const expIn = [...data.officeExpenses.map(e=>({...e,_src:'مكتب'})), ...data.projectCosts.map(e=>({...e,_src:'مشروع'}))].filter(e=>{
    if(!inWindow(e.date)) return false;
    if(fProj && e.projectId!==fProj) return false;         // المصروفات المرتبطة بالمشروع؛ مصروفات المكتب تُستبعد عند اختيار مشروع
    if(qLower){
      const hay = ((e.category||'')+' '+(e.note||'')+' '+(e._src||'')).toLowerCase();
      if(!hay.includes(qLower)) return false;
    }
    return true;
  });
  // الإيرادات الأخرى الخاضعة للضريبة (تدخل نافذة التاريخ؛ وتُستبعد عند اختيار مشروع لأنها غير مرتبطة بمشروع)
  const incIn = (data.otherIncome||[]).filter(r=>{
    if(!inWindow(r.date)) return false;
    if(fProj) return false;
    if(qLower){ const hay = ((r.category||'')+' '+(r.note||'')+' '+(r.payer||'')).toLowerCase(); if(!hay.includes(qLower)) return false; }
    return true;
  });
  // الدفعة الملغاة (شيك مرتجع / فسخ عقد) تُستثنى من ضريبة المخرجات — عُكس أثرها بإشعار دائن
  const outputVat = payIn.reduce((s,i)=>s+((isArchived(i)||i.status==='ملغاة')?0:i.amount*vatRateOf(i)),0)
    + incIn.reduce((s,r)=>s+(isArchived(r)?0:incVat(r)),0);
  const inputVat = expIn.reduce((s,e)=>s+(isArchived(e)?0:(e.amount||0)*expVatRate(e)),0);
  const net = outputVat - inputVat;
  const due = quarterDueDate(qk);
  const dd = daysUntil(due);
  const ended = quarterEndDate(qk) < todayISO();
  const anyF = fProj||fMonth||fFrom||fTo||q;
  const resetF = ()=>{ setFProj(''); setFMonth(''); setFFrom(''); setFTo(''); setQ(''); };
  // أشهر الربع للقائمة المنسدلة
  const monthOpts = months.slice().sort();
  const selEl = {border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'};

  // تفاصيل ضريبة المخرجات (الدفعات الخاضعة فقط — تُستثنى الملغاة لأن أثرها عُكس بإشعار دائن)
  const outRows = [
    ...payIn.filter(i=>!isArchived(i) && i.status!=='ملغاة' && vatRateOf(i)>0)
      .map(i=>({ date:i.date, proj:projName(i.projectId),
        label: i.phase==='إشراف' ? ('إشراف '+(i.month?fmtMonth(i.month):'')) : (i.label||'دفعة'),
        net:i.amount||0, vat:(i.amount||0)*0.05 })),
    ...incIn.filter(r=>!isArchived(r) && incVatRate(r)>0)
      .map(r=>({ date:r.date, proj:'إيراد آخر', label:(r.category||'إيراد آخر')+(r.payer?' — '+r.payer:''), net:r.amount||0, vat:incVat(r) })),
  ].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  // تفاصيل ضريبة المدخلات (المصروفات الخاضعة فقط)
  const inRows = expIn.filter(e=>!isArchived(e) && expVatRate(e)>0)
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''))
    .map(e=>({ date:e.date, src:e._src, cat:e.category||'—', note:e.note||'',
      net:e.amount||0, vat:(e.amount||0)*0.05 }));

  return (
    <div>
      <div className="toolbar no-print" style={{flexWrap:'wrap', gap:10}}>
        <div className="section-title" style={{marginBottom:0, flex:'1 1 100%'}}><h3>ضريبة القيمة المضافة — فترات ربع سنوية</h3><div className="rule"></div></div>
        <select value={qk} onChange={e=>{setQk(e.target.value); setFMonth('');}} style={selEl}>
          {quarters.map(q=><option key={q} value={q}>{quarterLabel(q)}</option>)}
        </select>
        <select value={fProj} onChange={e=>setFProj(e.target.value)} style={selEl}>
          <option value="">كل المشاريع</option>
          {data.projects.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
        </select>
        <select value={fMonth} onChange={e=>setFMonth(e.target.value)} style={selEl}>
          <option value="">كل أشهر الربع</option>
          {monthOpts.map(mm=><option key={mm} value={mm}>{fmtMonth(mm)}</option>)}
        </select>
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
        <input type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)} style={selEl} />
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
        <input type="date" value={fTo} onChange={e=>setFTo(e.target.value)} style={selEl} />
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث في البيان / المورد" style={{...selEl, minWidth:170}} />
        {anyF && <button className="btn ghost small" onClick={resetF}>مسح الفلاتر</button>}
        <button className="btn outline" onClick={()=>window.print()}><I.print/> طباعة</button>
      </div>

      <div className="print-only" style={{display:'none'}}>
        <div className="doc-head" style={{marginBottom:16}}>
          <div className="doc-brand">
            <img src={NITAQ_LOGO} alt="نطاق" style={{height:56}} />
            <div><h1>نطاق للاستشارات الهندسية</h1><p>NITAQ ENGINEERING CONSULTANTS · TRN: {COMPANY.trn}</p></div>
          </div>
          <div className="doc-type"><div className="t">تقرير ضريبة القيمة المضافة</div><div className="n">{quarterLabel(qk)} · صادر {todayISO()}</div></div>
        </div>
        {anyF && <p style={{fontSize:12, margin:'0 0 12px'}}>نطاق التقرير: {[fProj?'مشروع: '+projName(fProj):'', fMonth?'شهر: '+fmtMonth(fMonth):'', (fFrom||fTo)?('الفترة: '+(fFrom||'البداية')+' ← '+(fTo||'النهاية')):'', q?('بحث: '+q):''].filter(Boolean).join(' · ')}</p>}
      </div>

      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card">
          <div className="kpi-label">ضريبة المخرجات</div>
          <div className="kpi-value" style={{fontSize:19, color:'var(--teal)'}}>{money(outputVat)}</div>
          <div className="kpi-note">{outRows.length} دفعة خاضعة خلال الفترة</div>
        </div>
        <div className="card">
          <div className="kpi-label">ضريبة المدخلات</div>
          <div className="kpi-value" style={{fontSize:19, color:'var(--blue)'}}>{money(inputVat)}</div>
          <div className="kpi-note">{inRows.length} مصروف خاضع — بشرط فاتورة ضريبية سارية</div>
        </div>
        <div className="card">
          <div className="kpi-label">صافي الضريبة</div>
          <div className="kpi-value" style={{fontSize:19, color:net>=0?'var(--rust)':'var(--teal)'}}>{money(Math.abs(net))}</div>
          <div className="kpi-note">{net>=0 ? 'مستحقة للهيئة' : 'مستردة لصالح الشركة'}</div>
        </div>
        <div className="card">
          <div className="kpi-label">استحقاق الإقرار</div>
          <div className="kpi-value" style={{fontSize:19}}>{due}</div>
          <div className="kpi-note">
            {ended
              ? (dd!==null && dd<0 ? <span className="badge bad">تجاوز الاستحقاق بـ {Math.abs(dd)} يوم</span> : <span className={"badge "+(dd<=15?'soon':'ok')}>متبقي {dd} يوم للتقديم</span>)
              : <span className="badge gray">الفترة لم تنتهِ بعد</span>}
          </div>
        </div>
      </div>

      {/* تفاصيل ضريبة المخرجات */}
      <div className="section-title"><h3 style={{fontSize:13.5}}>تفاصيل ضريبة المخرجات — من أين جاءت؟ (الدفعات الاستشارية الخاضعة)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:22}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>التاريخ</th><th>المشروع</th><th>البيان</th><th>المبلغ الصافي</th><th>الضريبة (5%)</th></tr></thead>
          <tbody>
            {outRows.length===0 && <tr className="empty-row"><td colSpan={5}>لا دفعات خاضعة في هذه الفترة</td></tr>}
            {outRows.map((r,i)=>(
              <tr key={i}><td>{r.date}</td><td>{r.proj}</td><td>{r.label}</td><td>{money(r.net)}</td><td style={{color:'var(--teal)', fontWeight:700}}>{money(r.vat)}</td></tr>
            ))}
          </tbody>
          {outRows.length>0 && <tfoot><tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}><td colSpan={3}>إجمالي ضريبة المخرجات</td><td>{money(outRows.reduce((s,r)=>s+r.net,0))}</td><td style={{color:'var(--teal)'}}>{money(outputVat)}</td></tr></tfoot>}
        </table>
        </div>
      </div>

      {/* تفاصيل ضريبة المدخلات */}
      <div className="section-title"><h3 style={{fontSize:13.5}}>تفاصيل ضريبة المدخلات — القابلة للاسترداد (المصروفات الخاضعة بفاتورة ضريبية)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:22}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>التاريخ</th><th>النوع</th><th>التصنيف</th><th>المورد / البيان</th><th>المبلغ الصافي</th><th>الضريبة (5%)</th></tr></thead>
          <tbody>
            {inRows.length===0 && <tr className="empty-row"><td colSpan={6}>لا مصروفات خاضعة في هذه الفترة</td></tr>}
            {inRows.map((r,i)=>(
              <tr key={i}><td>{r.date}</td><td><span className="badge gray">{r.src}</span></td><td>{r.cat}</td><td style={{fontSize:12}}>{r.note||'—'}</td><td>{money(r.net)}</td><td style={{color:'var(--blue)', fontWeight:700}}>{money(r.vat)}</td></tr>
            ))}
          </tbody>
          {inRows.length>0 && <tfoot><tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}><td colSpan={4}>إجمالي ضريبة المدخلات</td><td>{money(inRows.reduce((s,r)=>s+r.net,0))}</td><td style={{color:'var(--blue)'}}>{money(inputVat)}</td></tr></tfoot>}
        </table>
        </div>
      </div>

      {/* الصافي */}
      <div className="card" style={{background:net>=0?'var(--rust-soft)':'var(--teal-soft)', borderColor:net>=0?'var(--rust)':'var(--teal)', marginBottom:18}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
          <div>
            <div className="kpi-label">صافي الضريبة المستحقة = المخرجات − المدخلات</div>
            <div style={{fontSize:12, color:'var(--ink-soft)'}}>{money(outputVat)} − {money(inputVat)}</div>
          </div>
          <div style={{fontSize:22, fontWeight:800, color:net>=0?'var(--rust)':'var(--teal)'}}>
            {money(Math.abs(net))} <span style={{fontSize:13, fontWeight:600}}>{net>=0?'مستحقة للهيئة':'مستردة لكم'}</span>
          </div>
        </div>
      </div>

      <p style={{fontSize:12, color:'var(--ink-faint)'}}>* الفترات الضريبية ربع سنوية وفق شهادة التسجيل الرسمية (TRN: {COMPANY.trn}) — تاريخ التسجيل الفعلي {COMPANY.vatRegDate}، وأول فترة إقرار {quarterLabel(quarterOfYM(COMPANY.vatRegDate.slice(0,7)))} مستحقة في {quarterDueDate(quarterOfYM(COMPANY.vatRegDate.slice(0,7)))}. الضريبة تُحسب على تاريخ إصدار الدفعة/المصروف (أساس الاستحقاق). ضريبة المدخلات لا تُسترد إلا بفاتورة ضريبية سارية باسم المكتب. الرسوم الحكومية (الأمانات) مستثناة بالكامل. يُنصح بمراجعة محاسب مختص قبل التقديم عبر بوابة الهيئة الاتحادية للضرائب.</p>
    </div>
  );
}

/* ================= Statement View (كشف حساب مشروع) ================= */
function StatementView({data, fixedPid}){
  const [pidState, setPid] = useState((data.projects[0]||{}).id || '');
  const [lang, setLang] = useState('ar');
  const [stType, setStType] = useState('full');      // full | gov | pays — نوع الكشف
  const [hideOwnerCol, setHideOwnerCol] = useState(false);  // إخفاء عمود "من المالك" للنسخة اللي تروح للمالك
  const [showSummary, setShowSummary] = useState(true);     // إظهار/إخفاء جزء الخلاصة
  const pid = fixedPid || pidState;
  const p = data.projects.find(x=>x.id===pid);

  if(!p) return (
    <div className="card"><p style={{fontSize:13, color:'var(--ink-faint)', margin:0}}>أضف مشروعاً أولاً من قسم المشاريع والعقود لعرض كشف الحساب.</p></div>
  );

  const pays = data.payments.filter(i=>!isArchived(i) && i.projectId===pid).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const fees = data.govFees.filter(g=>!isArchived(g) && g.projectId===pid).sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  const stCons = (data.contracts||[]).filter(c=>c.projectId===pid && c.status!=='ملغى' && !isArchived(c) && (isConsultancy(c)));
  const contract = stCons.length>0
    ? stCons.reduce((s,c)=> s + contractTotalOf(c), 0)
    : (p.designFee||0) + (p.supervisionMonthly||0)*(p.supervisionMonths||0);
  const billed = pays.reduce((s,i)=>s+billedOf(i),0);
  const collected = pays.reduce((s,i)=>s+collectedOf(i)*grossFactor(i),0);
  const duePays = pays.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
  const billedVat = pays.reduce((s,i)=>s+billedVatOf(i),0);
  const feesTotal = fees.reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const feesOutstanding = fees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const totalDue = duePays + feesOutstanding;
  // المتبقّي من قيمة العقد = قيمة العقد شاملة الضريبة − المحصّل فعلاً (العقود الاستشارية خاضعة للضريبة)
  const contractGross = contract * 1.05;
  const contractRemaining = Math.max(0, contractGross - collected);
  const ownerBalance = contractRemaining + feesOutstanding;   // الصندوق الأخير

  const isEn = lang==='en';
  const payLabel = (i)=> i.phase==='إشراف'
    ? ((isEn?'Supervision Fee — ':'أتعاب إشراف — ')+(i.month?(isEn?fmtMonthEn(i.month):fmtMonth(i.month)):''))
    : (i.label||'');
  const ST = { // ترجمة نصوص الحالة الثابتة فقط — النصوص الحرة (وصف الدفعة، ملاحظات الرسوم) تبقى كما أُدخلت
    'مدفوعة':'Paid', 'مدفوعة جزئياً':'Partially Paid', 'معلقة':'Pending', 'متأخرة':'Overdue',
    'مدفوع':'Paid', 'غير مدفوع':'Unpaid',
    'مسترد':'Reimbursed', 'غير مسترد':'Not Reimbursed',
    'المكتب':'Office', 'المالك مباشرة':'Owner (Direct)', 'لا ينطبق':'N/A',
    'ملك':'Freehold', 'منحة':'Grant', 'معفاة':'Exempt',
    // ترجمة الدوائر الحكومية الشائعة
    'دائرة التخطيط والمساحة':'Planning & Survey Dept.',
    'بلدية الشارقة':'Sharjah Municipality',
    'الدفاع المدني':'Civil Defence',
    'هيئة كهرباء ومياه الشارقة':'SEWA',
    'سيوا':'SEWA',
    'دائرة الأشغال العامة':'Public Works Dept.',
    'هيئة الكهرباء والمياه':'Electricity & Water Authority',
    'المرور':'Traffic Dept.',
    'الأراضي والأملاك':'Land & Properties Dept.',
    'أخرى':'Other',
  };
  const tr = (s)=> isEn ? (ST[s]||s) : s;
  const T = isEn ? {
    title:'Project Statement of Account', print:'Print Statement', docType:'Statement of Account', issuedOn:'Issued on',
    projectNo:'Project No.', projectName:'Project Name', owner:'Owner', landType:'Land Type', govNo:'Government Plot No.',
    ownNo:'Ownership No. (Freehold)', startDate:'Project Start Date', contractValue:'Contract Value',
    sec1:'1 — Consultancy Payments', thDate:'Issue Date', thDesc:'Description', thNet:'Before VAT', thVat:'VAT 5%',
    thTotal:'Total', thPaidDate:'Receipt Date', thStatus:'Status', noPays:'No payments recorded', total:'Total',
    sec2:'2 — Government Fees',
    thDate2:'Date', thDept:'Department', thDetail:'Details', thAmount:'Amount', thReceipt:'Receipt No.', thPaidBy:'Paid By',
    thDeptStatus:'Dept. Settlement', thOwnerStatus:'Owner Reimbursement', noFees:'No government fees recorded',
    summary:'Summary', totalCollected:'Total Collected (VAT incl.)', duePaysL:'Outstanding Consultancy Payments (VAT incl.)',
    feesOutL:'Government Fees Paid on Owner\'s Behalf, Not Yet Reimbursed', totalDueL:'Remaining Contract Balance (VAT incl.)',
    contractGrossL:'Total Contract Value (VAT incl.)', contractRemL:'Remaining from Contract Value',
    signOffice:'For '+COMPANY.nameEn, signOwner:'Reviewed — Owner',
    footNote:'This statement reflects records as of its issue date and does not constitute a discharge of liability',
  } : {
    title:'كشف حساب مشروع', print:'طباعة الكشف', docType:'كشف حساب', issuedOn:'صادر بتاريخ',
    projectNo:'رقم المشروع', projectName:'اسم المشروع', owner:'المالك', landType:'نوع الأرض', govNo:'الرقم الحكومي',
    ownNo:'رقم الأرض (ملك)', startDate:'تاريخ فتح المشروع', contractValue:'قيمة العقد',
    sec1:'أولاً — الدفعات الاستشارية', thDate:'تاريخ الإصدار', thDesc:'البيان', thNet:'قبل الضريبة', thVat:'ض.ق.م 5%',
    thTotal:'الإجمالي', thPaidDate:'تاريخ الاستلام', thStatus:'الحالة', noPays:'لا توجد دفعات مسجلة', total:'الإجمالي',
    sec2:'ثانياً — الرسوم الحكومية',
    thDate2:'التاريخ', thDept:'الدائرة', thDetail:'التفصيل', thAmount:'المبلغ', thReceipt:'الإيصال', thPaidBy:'السداد',
    thDeptStatus:'للدائرة', thOwnerStatus:'من المالك', noFees:'لا توجد رسوم حكومية مسجلة',
    summary:'الخلاصة', totalCollected:'إجمالي المحصّل (شامل الضريبة)', duePaysL:'دفعات استشارية مستحقة غير مسددة (شاملة الضريبة)',
    feesOutL:'رسوم حكومية مدفوعة نيابة عن المالك ولم تُسترد', totalDueL:'المتبقّي من قيمة العقد (شامل الضريبة)',
    contractGrossL:'إجمالي قيمة العقد (شامل الضريبة)', contractRemL:'المتبقّي من قيمة العقد',
    signOffice:'عن نطاق للاستشارات الهندسية', signOwner:'اطّلع عليه — المالك',
    footNote:'هذا الكشف يعكس السجلات حتى تاريخ إصداره ولا يُعد إبراء ذمة',
  };

  return (
    <div>
      <div className="toolbar no-print">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>{T.title}</h3><div className="rule"></div></div>
        {!fixedPid && (
          <select value={pid} onChange={e=>setPid(e.target.value)}
            style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
            {data.projects.map(pr=><option key={pr.id} value={pr.id}>{(pr.projectNo?pr.projectNo+' — ':'')+pr.name}</option>)}
          </select>
        )}
        <div style={{display:'flex', border:'1px solid var(--line-strong)', borderRadius:4, overflow:'hidden'}}>
          {[['full', isEn?'Full':'عام'],['gov', isEn?'Gov. Fees':'دوائر حكومية'],['pays', isEn?'Payments':'دفعات المشروع']].map(([v,l])=>(
            <button key={v} onClick={()=>setStType(v)} style={{padding:'7px 12px', fontSize:12, border:'none', borderInlineStart: v!=='full'?'1px solid var(--line-strong)':'none', cursor:'pointer', background: stType===v?'var(--brass)':'#fff', color: stType===v?'#fff':'var(--ink)'}}>{l}</button>
          ))}
        </div>
        {stType!=='pays' && (
          <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-soft)', cursor:'pointer', border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', background:'#fff'}}>
            <input type="checkbox" checked={hideOwnerCol} onChange={e=>setHideOwnerCol(e.target.checked)} />
            {isEn?'Hide "Owner Reimbursement"':'إخفاء عمود «من المالك»'}
          </label>
        )}
        <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-soft)', cursor:'pointer', border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', background:'#fff'}}>
          <input type="checkbox" checked={showSummary} onChange={e=>setShowSummary(e.target.checked)} />
          {isEn?'Show Summary':'إظهار الخلاصة'}
        </label>
        <div style={{display:'flex', border:'1px solid var(--line-strong)', borderRadius:4, overflow:'hidden'}}>
          <button onClick={()=>setLang('ar')} style={{padding:'7px 14px', fontSize:12.5, border:'none', cursor:'pointer', background: lang==='ar'?'var(--ink)':'#fff', color: lang==='ar'?'#fff':'var(--ink)'}}>عربي</button>
          <button onClick={()=>setLang('en')} style={{padding:'7px 14px', fontSize:12.5, border:'none', cursor:'pointer', background: lang==='en'?'var(--ink)':'#fff', color: lang==='en'?'#fff':'var(--ink)'}}>English</button>
        </div>
        <button className="btn brass" onClick={()=>window.print()}><I.print/> {T.print}</button>
      </div>

      <div className="doc" dir={isEn?'ltr':'rtl'} style={isEn?{textAlign:'left'}:undefined}>
        <div className="doc-head">
          <div className="doc-brand">
            <img src={NITAQ_LOGO} alt="نطاق" style={{height:64}} />
            <div>
              <h1>{isEn ? COMPANY.nameEn : COMPANY.nameAr}</h1>
              <p>{isEn ? COMPANY.nameAr : (COMPANY.nameEn+' · رخصة رقم '+COMPANY.license)}</p>
              <p>{isEn?'TRN: ':'الرقم الضريبي TRN: '}{COMPANY.trn}</p>
            </div>
          </div>
          <div className="doc-type">
            <div className="t">{T.docType}</div>
            {stType==='gov' && <div className="n" style={{fontWeight:700}}>{isEn?'Government Fees Only':'الرسوم الحكومية فقط'}</div>}
            {stType==='pays' && <div className="n" style={{fontWeight:700}}>{isEn?'Consultancy Payments Only':'الدفعات الاستشارية فقط'}</div>}
            <div className="n">{T.issuedOn}: {todayISO()}</div>
          </div>
        </div>
        <div className="doc-body">
          <div className="doc-info-grid">
            <div className="doc-line"><span className="lbl">{T.projectNo}</span><span className="val">{p.projectNo||'—'}</span></div>
            <div className="doc-line"><span className="lbl">{T.projectName}</span><span className="val">{p.name}</span></div>
            <div className="doc-line"><span className="lbl">{T.owner}</span><span className="val">{ownersLine(p)||'—'}</span></div>
            <div className="doc-line"><span className="lbl">{T.landType}</span><span className="val">{tr(p.landType)||'—'}</span></div>
            <div className="doc-line"><span className="lbl">{T.govNo}</span><span className="val">{p.plotNumber||'—'}</span></div>
            {p.landType==='ملك' && <div className="doc-line"><span className="lbl">{T.ownNo}</span><span className="val">{p.ownershipNumber||'—'}</span></div>}
            <div className="doc-line"><span className="lbl">{T.startDate}</span><span className="val">{p.startDate||'—'}</span></div>
            <div className="doc-line"><span className="lbl">{T.contractValue}</span><span className="val">{money(contract)}</span></div>
          </div>

          {stType!=='gov' && <>
          <h4 className="sec">{stType==='pays' ? (isEn?'Consultancy Payments':'الدفعات الاستشارية') : T.sec1}</h4>
          <table>
            <thead><tr><th>{T.thDate}</th><th>{T.thDesc}</th><th>{T.thNet}</th><th>{T.thVat}</th><th>{T.thTotal}</th><th>{T.thPaidDate}</th><th>{T.thStatus}</th></tr></thead>
            <tbody>
              {pays.length===0 && <tr className="empty-row"><td colSpan={7}>{T.noPays}</td></tr>}
              {pays.map(i=>(
                <tr key={i.id}>
                  <td style={{whiteSpace:'nowrap'}}>{i.date}</td>
                  <td>{payLabel(i)}</td>
                  <td>{money(i.amount)}</td>
                  <td>{vatRateOf(i)===0 ? tr('معفاة') : money(i.amount*0.05)}</td>
                  <td><b>{money(i.amount*grossFactor(i))}</b></td>
                  <td>{(i.status==='مدفوعة'||i.status==='مدفوعة جزئياً') ? (i.paidDate||i.date) : '—'}</td>
                  <td><span className={"badge "+(i.status==='مدفوعة'?'ok':i.status==='مدفوعة جزئياً'?'neutral':i.status==='متأخرة'?'bad':'soon')}>{tr(i.status)}</span></td>
                </tr>
              ))}
              {pays.length>0 && (
                <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}>
                  <td colSpan={2}>{T.total}</td>
                  <td>{money(billed)}</td>
                  <td>{money(billedVat)}</td>
                  <td>{money(billed+billedVat)}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
          </>}

          {stType!=='pays' && <>
          <h4 className="sec">{stType==='gov' ? (isEn?'Government Fees':'الرسوم الحكومية') : T.sec2}{/* العام: ثانياً — الرسوم الحكومية ، الحكومي فقط: الرسوم الحكومية */}</h4>
          <table>
            <colgroup>{hideOwnerCol
              ? <><col style={{width:'10%'}}/><col style={{width:'16%'}}/><col style={{width:'31%'}}/><col style={{width:'11%'}}/><col style={{width:'9%'}}/><col style={{width:'11%'}}/><col style={{width:'12%'}}/></>
              : <><col style={{width:'9%'}}/><col style={{width:'14%'}}/><col style={{width:'26%'}}/><col style={{width:'10%'}}/><col style={{width:'8%'}}/><col style={{width:'10%'}}/><col style={{width:'11%'}}/><col style={{width:'12%'}}/></>}
            </colgroup>
            <thead><tr><th>{T.thDate2}</th><th>{T.thDept}</th><th>{T.thDetail}</th><th>{T.thAmount}</th><th>{T.thReceipt}</th><th>{T.thPaidBy}</th><th>{T.thDeptStatus}</th>{!hideOwnerCol && <th>{T.thOwnerStatus}</th>}</tr></thead>
            <tbody>
              {fees.length===0 && <tr className="empty-row"><td colSpan={hideOwnerCol?7:8}>{T.noFees}</td></tr>}
              {fees.map(g=>(
                <tr key={g.id}>
                  <td style={{whiteSpace:'nowrap'}}>{g.date}</td>
                  <td>{tr(g.department)}</td>
                  <td>{isEn ? (g.descriptionEn || g.description) : g.description}</td>
                  <td>{money(g.amount)}</td>
                  <td>{g.receiptNo||'—'}</td>
                  <td>{tr(g.payerType==='المالك مباشرة' ? 'المالك مباشرة' : 'المكتب')}</td>
                  <td><span className={"badge "+(g.paidStatus==='مدفوع'?'ok':'soon')}>{tr(g.paidStatus)}</span></td>
                  {!hideOwnerCol && <td>{g.payerType==='المالك مباشرة' ? <span className="badge gray">{tr('لا ينطبق')}</span> : <span className={"badge "+(g.reimburseStatus==='مسترد'?'ok':'bad')}>{tr(g.reimburseStatus)}</span>}</td>}
                </tr>
              ))}
              {fees.length>0 && (
                <tr style={{fontWeight:800, background:'rgba(19,42,70,.03)'}}>
                  <td colSpan={3}>{T.total}</td><td>{money(feesTotal)}</td><td colSpan={hideOwnerCol?3:4}></td>
                </tr>
              )}
            </tbody>
          </table>
          </>}

          {showSummary && <>
          <h4 className="sec">{T.summary}</h4>
          <table>
            <tbody>
              {stType!=='gov' && <>
                <tr><td>{T.contractGrossL}</td><td style={{textAlign: isEn?'right':'left'}}>{money(contractGross)}</td></tr>
                <tr><td>{T.totalCollected}</td><td style={{textAlign: isEn?'right':'left'}}>−{money(collected)}</td></tr>
                <tr style={{fontWeight:700}}><td>{T.contractRemL}</td><td style={{textAlign: isEn?'right':'left'}}>{money(contractRemaining)}</td></tr>
                <tr><td>{T.duePaysL}</td><td style={{textAlign: isEn?'right':'left'}}>{money(duePays)}</td></tr>
              </>}
              {stType!=='pays' && <tr><td>{T.feesOutL}</td><td style={{textAlign: isEn?'right':'left'}}>{money(feesOutstanding)}</td></tr>}
            </tbody>
          </table>
          {(()=>{
            // الصندوق الأخير يتكيّف مع نوع الكشف
            const boxVal = stType==='gov' ? feesOutstanding : (stType==='pays' ? contractRemaining : ownerBalance);
            const boxLbl = stType==='gov' ? T.feesOutL : (stType==='pays' ? T.contractRemL : T.totalDueL);
            return (
              <div className={"due-box"+(boxVal<=0?' ok':'')}>
                <span>{boxLbl}</span>
                <span>{money(boxVal)}{(!isEn && boxVal>0) ? ' — فقط '+tafqeet(boxVal) : ''}</span>
              </div>
            );
          })()}
          </>}
          <div className="doc-sign">
            <div>{T.signOffice}</div>
            <div>{T.signOwner}</div>
          </div>
        </div>
        <div className="doc-foot">
          <span>SHARJAH · UAE | {COMPANY.phone2} | {COMPANY.phone} | {COMPANY.email}</span>
          <span>{COMPANY.tagline} · {T.footNote}</span>
        </div>
      </div>
    </div>
  );
}

/* ================= WhatsApp Intelligence: تحليل محادثات المشروع ================= */
function parseWhatsAppTxt(txt){
  const lines = txt.split(/\r?\n/);
  const msgs = [];
  const re1 = /^\[?(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})[,\s]+(\d{1,2}:\d{2})(?::\d{2})?\s*(?:[صمAPMapm.\u200f\u200e ]*)\]?\s*[-–]?\s*([^:]+?):\s*(.*)$/;
  lines.forEach(line=>{
    const m = re1.exec(line);
    if(m){
      let [_, d, mo, y, time, sender, text] = m;
      if(y.length===2) y = '20'+y;
      const date = y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      msgs.push({date, sender:sender.trim(), text:(text||'').trim()});
    } else if(msgs.length && line.trim()){
      msgs[msgs.length-1].text += ' '+line.trim();
    }
  });
  return msgs;
}

const WA_NOISE = /^(صباح|مساء|شكرا|شكرًا|مشكور|تمام|اوك|أوك|ok|okay|تسلم|الله يعطيك|السلام عليكم|وعليكم السلام|هلا|أهلا|اهلا|👍|✅|هههه|جزاك)/i;
const WA_MEDIA = /(<Media omitted>|تم حذف هذه الرسالة|الوسائط|image omitted|video omitted|sticker omitted|null)/i;
const WA_RULES = [
  {re:/(اعتمد|تمت الموافقة|موافق|وافق المالك|approved|اعتماد نهائي)/i, cat:'اعتماد المالك'},
  {re:/(أمر تغيير|اعمال اضافية|أعمال إضافية|زيادة في|variation|بدل .* إلى|استبدال)/i, cat:'أمر تغيير (Variation)'},
  {re:/(تعديل|عدلوا|غيروا|نغير|revision|ريفيجن|تحديث المخطط)/i, cat:'تعديل تصميمي'},
  {re:/(اجتماع|موعد|زيارة الموقع|نلتقي|meeting|inspection|فحص يوم|معاينة)/i, cat:'اجتماع / موعد'},
  {re:/(البلدية|بلدية|دفاع مدني|سيوا|تخطيط ومساحة|الدائرة|رد الجهة|ملاحظات الجهة|إجازة البناء|رخصة)/i, cat:'ملاحظة دائرة حكومية'},
  {re:/(دفعة|فاتورة|تحويل|شيك|سداد|حوّل|المبلغ|payment|invoice|مستحق)/i, cat:'مالية'},
  {re:/(مشكلة|توقف|تأخير|تأخر|خطر|عيب|ملاحظة موقع|delay|issue|متوقف)/i, cat:'ملاحظة موقع / مخاطرة'},
  {re:/(مطلوب|برجاء|يرجى|لازم|قبل يوم|deadline|آخر موعد|أنجزوا|جهزوا)/i, cat:'مهمة'},
];
function heuristicExtract(msgs){
  const out = [];
  const seen = new Set();
  msgs.forEach(m=>{
    const t = m.text;
    if(!t || t.length<15) return;
    if(WA_NOISE.test(t) || WA_MEDIA.test(t)) return;
    for(const rule of WA_RULES){
      if(rule.re.test(t)){
        const key = (t.slice(0,60)).replace(/\s+/g,' ');
        if(seen.has(key)) return;
        seen.add(key);
        out.push({date:m.date, category:rule.cat, description:t.slice(0,300), responsible:m.sender});
        return;
      }
    }
  });
  return out;
}

async function aiExtractDecisions(msgs){
  const text = msgs.map(m=>m.date+' | '+m.sender+': '+m.text).join('\n').slice(-14000);
  const prompt = 'أنت محلل مشاريع هندسية. أمامك تصدير محادثة واتساب لمشروع. استخرج فقط القرارات والوقائع المهمة إدارياً (اعتمادات المالك، تعديلات تصميمية، أوامر تغيير، مهام، مواعيد اجتماعات ومعاينات، ملاحظات الدوائر الحكومية، نقاشات مالية، مخاطر). تجاهل التحيات والمجاملات والتكرار. أعد JSON فقط بدون أي نص آخر، مصفوفة عناصرها: {"date":"YYYY-MM-DD","category":"واحدة من: اعتماد المالك | تعديل تصميمي | أمر تغيير (Variation) | مهمة | اجتماع / موعد | ملاحظة دائرة حكومية | ملاحظة موقع / مخاطرة | مالية | أخرى","description":"ملخص موجز بالعربية","responsible":"اسم المرسل"}. الحد الأقصى 25 عنصراً.\n\nالمحادثة:\n'+text;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({model:'claude-sonnet-4-6', max_tokens:1000, messages:[{role:'user', content:prompt}]})
  });
  if(!res.ok) throw new Error('AI unavailable');
  const d = await res.json();
  const raw = (d.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('').replace(/```json|```/g,'').trim();
  const arr = JSON.parse(raw);
  if(!Array.isArray(arr)) throw new Error('bad format');
  return arr.filter(x=>x && x.description).map(x=>({
    date: x.date || todayISO(),
    category: DECISION_CATEGORIES.includes(x.category) ? x.category : 'أخرى',
    description: String(x.description).slice(0,300),
    responsible: x.responsible || '',
  }));
}

function WaImport({project, data, onApprove, onClose}){
  const [stage, setStage] = useState('pick'); // pick | working | review
  const [engine, setEngine] = useState('');
  const [items, setItems] = useState([]);
  const [decided, setDecided] = useState({}); // idx -> 'ok'|'no'
  const fileRef = useRef(null);

  const handleFile = async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    setStage('working');
    const txt = await f.text();
    const msgs = parseWhatsAppTxt(txt);
    if(msgs.length===0){ alert('لم يتم التعرف على صيغة الملف — تأكد أنه تصدير محادثة واتساب نصي (بدون وسائط)'); setStage('pick'); return; }
    let extracted = null;
    try{
      extracted = await aiExtractDecisions(msgs);
      setEngine('الذكاء الاصطناعي (Claude)');
    }catch(err){
      extracted = heuristicExtract(msgs);
      setEngine('المحرك الذكي المحلي (كلمات مفتاحية)');
    }
    if(!extracted || extracted.length===0){ alert('لم يُعثر على قرارات مهمة في المحادثة'); setStage('pick'); return; }
    setItems(extracted);
    setStage('review');
  };

  const decide = (idx, val)=>{
    setDecided(d=>({...d,[idx]:val}));
    if(val==='ok'){
      const it = items[idx];
      onApprove({id:uid(), projectId:project.id, date:it.date, category:it.category, description:it.description,
        responsible:it.responsible, status: it.category==='مهمة' ? 'مفتوح' : 'منفذ', source:'واتساب', _ts:Date.now()});
    }
  };
  const remaining = items.filter((_,i)=>!decided[i]).length;
  const approvedCount = Object.values(decided).filter(v=>v==='ok').length;

  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:680}}>
        <div className="modal-head">
          <h3>استيراد محادثة واتساب — مشروع {project.projectNo}</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{maxHeight:'62vh', overflowY:'auto'}}>
          {stage==='pick' && (
            <div style={{textAlign:'center', padding:'18px 0'}}>
              <p style={{fontSize:13, color:'var(--ink-soft)', marginBottom:6}}>من جروب المشروع في واتساب: <b>⋮ ← المزيد ← تصدير الدردشة ← بدون وسائط</b></p>
              <p style={{fontSize:12, color:'var(--ink-faint)', marginBottom:16}}>ثم ارفع ملف الـ TXT هنا. النظام سيستخرج القرارات المهمة فقط ويعرضها عليك — <b>لن يُضاف شيء للسجل إلا بموافقتك</b>.</p>
              <button className="btn brass" onClick={()=>fileRef.current && fileRef.current.click()}>اختيار ملف المحادثة (.txt)</button>
              <input ref={fileRef} type="file" accept=".txt,text/plain" style={{display:'none'}} onChange={handleFile} />
            </div>
          )}
          {stage==='working' && <p style={{textAlign:'center', padding:'30px 0', fontSize:13.5}}>جارٍ تحليل المحادثة واستخراج القرارات...</p>}
          {stage==='review' && (
            <div>
              <p style={{fontSize:12, color:'var(--ink-faint)', marginBottom:12}}>المحرك: {engine} · {items.length} قرار مقترح · اعتمدت {approvedCount} · متبقٍ {remaining}</p>
              {items.map((it, idx)=>(
                <div key={idx} style={{border:'1px solid var(--line)', borderRadius:5, padding:'10px 14px', marginBottom:10,
                  opacity: decided[idx]==='no' ? .35 : 1,
                  background: decided[idx]==='ok' ? 'var(--teal-soft)' : '#fff',
                  borderColor: decided[idx]==='ok' ? 'var(--teal)' : 'var(--line)'}}>
                  <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap'}}>
                    <span className="badge gray">{it.date}</span>
                    <span className="badge neutral">{it.category}</span>
                    {it.responsible && <span style={{fontSize:11, color:'var(--ink-faint)'}}>{it.responsible}</span>}
                    <span style={{marginInlineStart:'auto', display:'flex', gap:6}}>
                      {!decided[idx] && (
                        <React.Fragment>
                          <button className="btn small brass" onClick={()=>decide(idx,'ok')}>✓ اعتماد وإضافة</button>
                          <button className="btn small outline" onClick={()=>decide(idx,'no')}>✕ تجاهل</button>
                        </React.Fragment>
                      )}
                      {decided[idx]==='ok' && <span className="badge ok">أُضيف للسجل</span>}
                      {decided[idx]==='no' && <span className="badge gray">مُتجاهَل</span>}
                    </span>
                  </div>
                  <div style={{fontSize:13}}>{it.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span style={{fontSize:11.5, color:'var(--ink-faint)', marginInlineEnd:'auto'}}>الصور تبقى في واتساب أو مجلد المشروع — النظام يسجل القرار فقط</span>
          <button className="btn brass" onClick={onClose}>{stage==='review' ? 'إنهاء ('+approvedCount+' أُضيف)' : 'إغلاق'}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= تسوية فسخ العقد (محاسبياً + ضريبياً) ================= */
function TerminationModal({project, data, mutate, onClose}){
  const [cnData, setCnData] = useState(null);   // بيانات إشعار الدائن للعرض بعد التسوية
  const pays = data.payments.filter(i=>i.projectId===project.id && !isArchived(i));
  // المحصّل فعلاً (صافي قبل الضريبة + شامل)
  const collectedNet = pays.reduce((s,i)=>s+collectedOf(i),0);
  const collectedGross = pays.reduce((s,i)=>s+collectedOf(i)*grossFactor(i),0);
  // قيمة العقد الأصلية (صافي)
  const stCons = (data.contracts||[]).filter(c=>c.projectId===project.id && c.status!=='ملغى' && !isArchived(c) && isConsultancy(c));
  const contractNet = stCons.length>0 ? stCons.reduce((s,c)=>s+contractTotalOf(c),0) : ((project.designFee||0)+(project.supervisionMonthly||0)*(project.supervisionMonths||0));
  // الدفعات غير المحصّلة (هتتلغى بالفسخ)
  const openPays = pays.filter(i=>remainderOf(i)>0);
  const openTotal = openPays.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);

  const [earnedNet, setEarnedNet] = useState('');     // قيمة الشغل المُنجز فعلاً (صافي قبل الضريبة)
  const [reason, setReason] = useState('');
  const [refundAccount, setRefundAccount] = useState('البنك');

  const earned = parseFloat(earnedNet);
  const hasEarned = earnedNet!=='' && Number.isFinite(earned) && earned>=0;
  const diffNet = hasEarned ? (collectedNet - earned) : 0;   // موجب = حصّلنا زيادة (يُرد) ، سالب = حصّلنا أقل (مستحق باقٍ)
  const refundNet = Math.max(0, diffNet);
  const refundVat = refundNet*0.05;
  const refundGross = refundNet + refundVat;
  const stillDueNet = Math.max(0, -diffNet);
  const stillDueGross = stillDueNet*1.05;

  const canApply = hasEarned && reason.trim().length>=3 && earned<=contractNet+0.5;

  const apply = ()=>{
    if(!canApply){ alert('أكملي قيمة الشغل المُنجز (لا تتجاوز قيمة العقد) وسبب الفسخ.'); return; }
    const mp = mutate('payments');
    // 1) الدفعات غير المحصّلة بالكامل (معلقة/متأخرة) تُلغى بالكامل — سقطت بالفسخ.
    //    الدفعات الجزئية تبقى كما هي (المحصّل منها محسوب، والباقي يُعدّ ساقطاً ضمنياً لأنه لن يُطالَب به).
    openPays.filter(i=>i.status!=='مدفوعة جزئياً').forEach(i=>{
      mp.update(i.id, {status:'ملغاة', cancelReason:'سقطت بفسخ العقد — '+reason.trim()});
    });
    // 2) لو فيه مبلغ يُرد للمالك: حركة خزينة صادرة + إشعار دائن
    if(refundGross>0.5){
      mutate('treasury').add({id:uid(), _ts:Date.now(), type:'صرف', account:refundAccount, amount:refundGross, date:todayISO(),
        note:'إرجاع للمالك عند فسخ عقد المشروع '+(project.projectNo||'')+' — '+project.name+' (شامل ض.ق.م المستردة)'});
    }
    // 3) إقفال المشروع كـ"مفسوخ" مع بيانات التسوية الكاملة
    mutate('projects').update(project.id, {
      status:'مفسوخ', closedAt:todayISO(), terminationReason:reason.trim(),
      termination:{ date:todayISO(), contractNet, collectedNet, earnedNet:earned, refundNet, refundVat, refundGross, stillDueNet, reason:reason.trim() }
    });
    // 4) إشعار دائن لاسترداد الضريبة (لو فيه إرجاع) — يُعرض للطباعة
    if(refundGross>0.5){
      const cnNo = 'CN-'+(project.projectNo||'')+'-'+todayISO().replace(/-/g,'');
      // حفظ مرجع الإشعار على المشروع للتوثيق
      mutate('projects').update(project.id, {creditNote:{cnNo, refundNet, refundVat, refundGross, date:todayISO()}});
      setCnData({ project, refundNet, refundVat, refundGross, reason:reason.trim(), date:todayISO(), cnNo });
    } else {
      alert('تم فسخ العقد وتسويته وإقفال المشروع.');
      onClose();
    }
  };

  if(cnData) return <CreditNoteDoc cn={cnData} onClose={()=>{ setCnData(null); onClose(); }} />;

  const Row = ({label, val, color, bold})=>(
    <div style={{display:'flex', justifyContent:'space-between', padding:'7px 0', borderTop:'1px solid var(--line)', fontSize:12.5, fontWeight:bold?800:400, color:color||'var(--ink)'}}>
      <span>{label}</span><span>{money(val)}</span>
    </div>
  );

  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:640}}>
        <div className="modal-head">
          <h3>تسوية فسخ العقد — {project.projectNo} {project.name}</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:14}}>عند إنهاء المالك للعقد قبل اكتماله، نسوّي الحساب على أساس <b>قيمة الشغل المُنجز فعلاً</b>: الباقي غير المحصّل يسقط، وأي مبلغ محصّل زائد عن المنجز يُرد للمالك مع إشعار دائن لاسترداد الضريبة.</p>

          <div className="card" style={{marginBottom:14, background:'var(--paper)'}}>
            <Row label="قيمة العقد الأصلية (صافي)" val={contractNet} />
            <Row label="المحصّل فعلاً (صافي)" val={collectedNet} color="var(--teal)" />
            <Row label="دفعات غير محصّلة ستسقط بالفسخ (شامل الضريبة)" val={openTotal} color="var(--ink-soft)" />
          </div>

          <div className="field" style={{marginBottom:12}}>
            <label>قيمة الشغل المُنجز فعلاً حتى الفسخ (صافي قبل الضريبة) *</label>
            <input type="number" step="0.01" value={earnedNet} onChange={e=>setEarnedNet(e.target.value)}
              placeholder="مثال: قيمة مرحلة التصميم المكتملة" />
            <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:4}}>قدّري نسبة الإنجاز × قيمة العقد، أو أدخلي قيمة المراحل المكتملة فعلاً. لا تتجاوز قيمة العقد.</div>
          </div>

          {hasEarned && (
            <div className="card" style={{marginBottom:14, borderInlineStart:'4px solid '+(refundGross>0.5?'var(--rust)':(stillDueGross>0.5?'var(--brass)':'var(--teal)'))}}>
              {refundGross>0.5 && <>
                <div style={{fontSize:13, fontWeight:800, color:'var(--rust)', marginBottom:6}}>↩ يُرد للمالك (حصّلتِ أكثر من المنجز)</div>
                <Row label="الفرق (صافي)" val={refundNet} />
                <Row label="ض.ق.م المستردة (5%)" val={refundVat} />
                <Row label="إجمالي المبلغ المُرد" val={refundGross} color="var(--rust)" bold />
                <div className="field" style={{marginTop:10}}>
                  <label>يُرد من حساب</label>
                  <select value={refundAccount} onChange={e=>setRefundAccount(e.target.value)}>
                    <option value="البنك">البنك</option>
                    <option value="الخزينة">الخزينة (نقدي)</option>
                  </select>
                </div>
                <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:6}}>سيُسجَّل صرف من الخزينة + إشعار دائن (Credit Note) لاسترداد الضريبة من الهيئة.</div>
              </>}
              {stillDueGross>0.5 && <>
                <div style={{fontSize:13, fontWeight:800, color:'var(--brass)', marginBottom:6}}>⚠ مستحق باقٍ على المالك (المنجز أكثر من المحصّل)</div>
                <Row label="مستحق عن شغل منجز (صافي)" val={stillDueNet} />
                <Row label="شامل الضريبة" val={stillDueGross} color="var(--brass)" bold />
                <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:6}}>هذا مبلغ حقيقي مستحق عن عمل تم تنفيذه — يبقى كدفعة مستحقة ولا يسقط. سجّلي تحصيله لاحقاً قبل إقفال نهائي، أو أقفلي مع إبقائه ديناً موثّقاً.</div>
              </>}
              {refundGross<=0.5 && stillDueGross<=0.5 && (
                <div style={{fontSize:13, fontWeight:700, color:'var(--teal)'}}>✓ الحساب متوازن — المحصّل يساوي قيمة المنجز. الباقي يسقط بالفسخ ولا توجد تسويات.</div>
              )}
            </div>
          )}

          <div className="field">
            <label>سبب فسخ العقد (يُحفظ للتوثيق والتدقيق) *</label>
            <textarea rows="2" value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="مثال: أنهى المالك العقد في مرحلة التصميم قبل تنفيذ العمل الكامل" />
          </div>
        </div>
        <div className="modal-foot" style={{flexWrap:'wrap', gap:8}}>
          <button className="btn outline" onClick={onClose}>إلغاء</button>
          <button className="btn brass" disabled={!canApply} onClick={apply}
            style={!canApply?{opacity:.4, cursor:'not-allowed'}:{background:'var(--rust)', borderColor:'var(--rust)'}}>
            تسوية وفسخ العقد
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= قائمة تحقق إقفال المشروع ================= */
