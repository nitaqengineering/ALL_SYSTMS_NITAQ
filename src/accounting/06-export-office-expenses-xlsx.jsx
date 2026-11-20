async function exportOfficeExpensesXlsx(rows, meta){
  const XLSX = await loadXlsxLib();
  const wb = XLSX.utils.book_new();
  wb.Workbook = {Views:[{RTL:true}]};
  const payDetails = (r)=>{
    if(r.account==='شيك') return 'شيك '+(r.chequeNo||'—')+' — استحقاق '+(r.chequeDueDate||'—');
    if(r.account==='البنك') return [r.bankName, r.bankRef].filter(Boolean).join(' — ');
    return '';
  };
  const header = ['التاريخ','التصنيف','المورّد','رقم فاتورة المورّد','البيان','الحساب','اسم البنك','حالة السداد',
    'المبلغ قبل الضريبة','ض.ق.م 5%','المبلغ شامل الضريبة','دين علينا (شامل الضريبة)','تفاصيل الدفع'];
  const body = rows.map(r=>{
    const net = r.amount||0;
    const gross = expGross(r);
    const vat = Math.round((gross-net)*100)/100;
    return [ r.date||'', r.category||'', r.vendor||'', r.vendorInvoiceNo||'', r.note||'', r.account||'', r.bankName||'', r.payStatus||'',
      net, vat, gross, expDebt(r), payDetails(r) ];
  });
  const sum = (i)=> Math.round(body.reduce((s,row)=> s+(typeof row[i]==='number'?row[i]:0),0)*100)/100;
  const totals = ['الإجمالي','','','','','','','', sum(8), sum(9), sum(10), sum(11), ''];
  const ws = XLSX.utils.aoa_to_sheet([header, ...body, [], totals]);
  ws['!cols'] = [{wch:12},{wch:16},{wch:16},{wch:16},{wch:32},{wch:9},{wch:14},{wch:12},{wch:15},{wch:11},{wch:17},{wch:18},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, 'مصروفات المكتب');
  const tag = (meta && meta.banks && meta.banks.length) ? '-'+meta.banks.join('_').replace(/\s+/g,'') : (meta && meta.filtered ? '-filtered' : '');
  XLSX.writeFile(wb, 'NITAQ-Office-Expenses-'+todayISO()+tag+'.xlsx');
}

/* ===== تصدير الإيرادات (نظرة عامة) — يحترم فلتر الفترة ===== */
async function exportRevenueXlsx({data, pays, inc, fromD, toD, payDate, summary}){
  const XLSX = await loadXlsxLib();
  const wb = XLSX.utils.book_new();
  wb.Workbook = {Views:[{RTL:true}]};
  const r2 = (n)=> Math.round((n||0)*100)/100;
  const projName = (id)=>{ const p=(data.projects||[]).find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : '—'; };
  const period = (fromD||toD) ? ((fromD||'البداية')+' ← '+(toD||'اليوم')) : 'كل الفترات';

  // 1) الملخص
  const sm = [
    ['ملخص الإيرادات — نطاق للاستشارات الهندسية'],
    ['الفترة', period],
    ['تاريخ التصدير', todayISO()],
    [],
    ['البند','القيمة (د.إ)'],
    ['إجمالي الإيرادات (صافي قبل الضريبة)', r2(summary.totalNet)],
    ['إجمالي الإيرادات (شامل الضريبة)', r2(summary.totalGross)],
    ['منها ضريبة القيمة المضافة', r2(summary.totalVat)],
    ['إيرادات المشاريع — مفوتر (صافي)', r2(summary.projBilled)],
    ['الإيرادات الأخرى (صافي)', r2(summary.otherNet)],
    ['محصّل من المشاريع (شامل الضريبة)', r2(summary.projCollected)],
    ['مستحق غير محصّل (شامل الضريبة)', r2(summary.projDue)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sm);
  ws1['!cols'] = [{wch:38},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws1, 'ملخص');

  // 2) دفعات المشاريع
  const h2 = ['التاريخ المعتمد في الفلتر','تاريخ الإصدار','تاريخ الاستلام','المشروع','المرحلة','وصف الدفعة','رقم الفاتورة','الحالة',
    'المبلغ قبل الضريبة','ض.ق.م','المبلغ شامل الضريبة','المحصّل (شامل الضريبة)','المتبقّي (شامل الضريبة)'];
  const b2 = [...pays].sort((a,b)=>payDate(a).localeCompare(payDate(b))).map(i=>{
    const net = billedOf(i), gf = grossFactor(i);
    return [payDate(i), i.date||'', i.paidDate||'', projName(i.projectId), i.phase||'', i.label||'', i.invoiceNo||'', i.status||'',
      r2(net), r2(net*(gf-1)), r2(net*gf), r2(collectedOf(i)*gf), r2(remainderOf(i)*gf)];
  });
  const sum2 = (k)=> r2(b2.reduce((s,row)=>s+(row[k]||0),0));
  const t2 = ['الإجمالي','','','','','','','', sum2(8), sum2(9), sum2(10), sum2(11), sum2(12)];
  const ws2 = XLSX.utils.aoa_to_sheet(b2.length ? [h2, ...b2, [], t2] : [h2, ['لا توجد دفعات في الفترة']]);
  ws2['!cols'] = [{wch:14},{wch:12},{wch:12},{wch:30},{wch:12},{wch:28},{wch:14},{wch:14},{wch:15},{wch:11},{wch:17},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws2, 'دفعات المشاريع');

  // 3) الإيرادات الأخرى
  const h3 = ['التاريخ','التصنيف','البيان','الجهة الدافعة','الحساب','المبلغ قبل الضريبة','ض.ق.م','المبلغ شامل الضريبة'];
  const b3 = [...inc].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(r=>
    [r.date||'', r.category||'', r.note||'', r.payer||'', r.account||'', r2(r.amount), r2(incVat(r)), r2(incGross(r))]);
  const sum3 = (k)=> r2(b3.reduce((s,row)=>s+(row[k]||0),0));
  const t3 = ['الإجمالي','','','','', sum3(5), sum3(6), sum3(7)];
  const ws3 = XLSX.utils.aoa_to_sheet(b3.length ? [h3, ...b3, [], t3] : [h3, ['لا توجد إيرادات أخرى في الفترة']]);
  ws3['!cols'] = [{wch:12},{wch:20},{wch:32},{wch:20},{wch:10},{wch:16},{wch:11},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws3, 'الإيرادات الأخرى');

  const tag = (fromD||toD) ? '-'+(fromD||'start')+'_to_'+(toD||'today') : '-all';
  XLSX.writeFile(wb, 'NITAQ-Revenue'+tag+'.xlsx');
}

/* ================= البحث الشامل ================= */
function GlobalSearch({data, go, jumpToProject, navAllowed}){
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const query = q.trim().toLowerCase();
  const results = useMemo(()=>{
    if(query.length<2) return [];
    const out = [];
    const pn = (id)=>{ const p=data.projects.find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : ''; };
    data.projects.forEach(p=>{
      if(out.length>=14) return;
      const t = ((p.projectNo||'')+' '+(p.name||'')+' '+(p.owner||'')+' '+(p.plotNumber||'')+' '+(p.ownershipNumber||'')+' '+((p.additionalOwners||[]).map(o=>o.name||'').join(' '))).toLowerCase();
      if(t.includes(query)) out.push({kind:'مشروع', cls:'ok', text:(p.projectNo?p.projectNo+' — ':'')+p.name+(p.owner?' · '+p.owner:''), act:()=>jumpToProject(p.id)});
    });
    if(navAllowed('payments')) data.payments.forEach(i=>{
      if(out.length>=14) return;
      const t = ((i.label||'')+' '+(i.invoiceNo||'')+' '+(i.receiptNo||'')+' '+(i.refNo||'')).toLowerCase();
      if(t.includes(query)) out.push({kind:'دفعة', cls:'neutral', text:(i.invoiceNo||i.receiptNo||i.label||i.phase)+' · '+money(i.amount||0)+' · '+pn(i.projectId), act:()=>go('payments')});
    });
    (data.contracts||[]).forEach(c=>{
      if(out.length>=14) return;
      const t = ((c.type||'')+' '+(c.category||'')+' '+(c.description||'')+' '+(c.contractor||'')).toLowerCase();
      if(t.includes(query)) out.push({kind:'عقد', cls:'gray', text:(c.type||c.category||'عقد')+' · '+(c.contractor||c.description||'')+' · '+pn(c.projectId), act:()=>go('contracts')});
    });
    (data.decisions||[]).forEach(dc=>{
      if(out.length>=14) return;
      const t = ((dc.title||'')+' '+(dc.description||'')).toLowerCase();
      if(t.includes(query)) out.push({kind:'قرار', cls:'soon', text:(dc.title||'قرار')+' · '+pn(dc.projectId), act:()=>go('decisions')});
    });
    return out.slice(0,14);
  }, [query, data]);
  return (
    <div style={{position:'relative', minWidth:200, flex:'0 1 300px'}}>
      <input className="searchbox" style={{width:'100%'}} placeholder="🔍 بحث شامل: مشروع، فاتورة، عقد..."
        value={q}
        onChange={e=>{ setQ(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false), 200)} />
      {open && query.length>=2 && (
        <div style={{position:'absolute', top:'110%', insetInlineStart:0, insetInlineEnd:0, background:'#fff', border:'1px solid var(--line-strong)', borderRadius:6, boxShadow:'0 8px 28px rgba(13,27,62,.14)', zIndex:80, maxHeight:340, overflowY:'auto'}}>
          {results.length===0 && <div style={{padding:'12px 14px', fontSize:12.5, color:'var(--ink-faint)'}}>لا نتائج</div>}
          {results.map((r,i)=>(
            <div key={i} onMouseDown={()=>{ r.act(); setQ(''); setOpen(false); }}
              style={{padding:'9px 13px', fontSize:12.5, cursor:'pointer', borderBottom:'1px solid var(--line)', display:'flex', gap:8, alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--paper)'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <span className={"badge "+r.cls} style={{flexShrink:0}}>{r.kind}</span>
              <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= سجل التدقيق ================= */
function AuditView({data}){
  const [q, setQ] = useState('');
  const [actFilter, setActFilter] = useState('');
  const [open, setOpen] = useState({});
  const rows = useMemo(()=> [...(data.auditLog||[])].sort((a,b)=>(b._ts||0)-(a._ts||0)), [data.auditLog]);
  const query = q.trim().toLowerCase();
  const filtered = rows.filter(r=>{
    if(actFilter && r.action!==actFilter) return false;
    if(!query) return true;
    return ((r.user||'')+' '+(r.action||'')+' '+(ENTITY_AR[r.entity]||r.entity||'')+' '+(r.summary||'')).toLowerCase().includes(query);
  }).slice(0, 300);
  const ACT_CLS = {'إنشاء':'ok','تعديل':'neutral','أرشفة / إلغاء':'bad','استرجاع من الأرشيف':'soon','إصدار مستند':'gray','حذف نهائي':'bad'};
  const actions = [...new Set(rows.map(r=>r.action))];
  return (
    <div>
      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>سجل العمليات — {rows.length} عملية مسجلة</h3><div className="rule"></div></div>
        <input className="searchbox" placeholder="بحث بالمستخدم أو الوصف..." value={q} onChange={e=>setQ(e.target.value)} />
        <select value={actFilter} onChange={e=>setActFilter(e.target.value)}
          style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
          <option value="">كل العمليات</option>
          {actions.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="card" style={{padding:0}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th style={{width:28}}></th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>التفاصيل</th></tr></thead>
          <tbody>
            {filtered.length===0 && <tr className="empty-row"><td colSpan={6}>{query||actFilter ? 'لا نتائج مطابقة' : 'لا عمليات مسجلة بعد — يبدأ التسجيل تلقائياً من الآن'}</td></tr>}
            {filtered.map(r=>{
              const hasDetail = Array.isArray(r.changes) && r.changes.length>0;
              return (
              <React.Fragment key={r.id}>
                <tr style={hasDetail?{cursor:'pointer'}:{}} onClick={hasDetail?()=>setOpen(o=>({...o,[r.id]:!o[r.id]})):undefined}>
                  <td style={{textAlign:'center', color:'var(--brass)', fontWeight:800}}>{hasDetail?(open[r.id]?'▾':'▸'):''}</td>
                  <td style={{whiteSpace:'nowrap', fontSize:11.5}}>{r.at}</td>
                  <td style={{fontWeight:700}}>{r.user}</td>
                  <td><span className={"badge "+(ACT_CLS[r.action]||'gray')}>{r.action}</span></td>
                  <td>{ENTITY_AR[r.entity]||r.entity}</td>
                  <td style={{fontSize:12, maxWidth:420}}>{r.summary||'—'}</td>
                </tr>
                {hasDetail && open[r.id] && (
                  <tr style={{background:'rgba(19,42,70,.02)'}}>
                    <td></td>
                    <td colSpan={5} style={{padding:'4px 10px 12px'}}>
                      <table style={{width:'100%', fontSize:11.5}}>
                        <thead><tr><th style={{width:'34%'}}>الحقل</th><th style={{width:'33%'}}>قبل</th><th style={{width:'33%'}}>بعد</th></tr></thead>
                        <tbody>
                          {r.changes.map((c,i)=>(
                            <tr key={i}>
                              <td style={{fontWeight:700}}>{c.field}</td>
                              <td style={{color:'var(--ink-faint)'}}>{c.before}</td>
                              <td style={{color:'var(--ink)', fontWeight:600}}>{c.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );})}
          </tbody>
        </table>
        </div>
      </div>
      <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12}}>* السجل غير قابل للتعديل أو الحذف — يعرض آخر 300 عملية، والبحث يشمل الكل. اضغط أي صف عليه سهم (▸) لعرض <b>كل القيم قبل وبعد التعديل</b> بالتفصيل. سجلات ما قبل تفعيل هذه الميزة تعرض الملخص فقط دون تفاصيل قبل/بعد.</p>
    </div>
  );
}

/* ================= مركز القيادة المالية ================= */
function buildFccItems(data){
  const items = [];
  const nowYM = currentYM();
  const projOf = (id)=> data.projects.find(p=>p.id===id) || {};
  const pLabel = (p)=> (p.projectNo?p.projectNo+' — ':'')+(p.name||'');

  data.payments.forEach(i=>{
    if(!isArchived(i) && i.projectId && !i.contractId && (i.phase==='تصميم'||i.phase==='إشراف')){
      const p0 = projOf(i.projectId);
      items.push({key:'noc-'+i.id, pr:'med', cat:'فواتير', dot:'🟣', date:i.date,
        text:'دفعة بلا عقد مرتبط — '+pLabel(p0)+' — '+(i.label||i.phase)+' ('+money(i.amount||0)+') — افتحها بزر التعديل واربطها بعقدها',
        actions:[{label:'فتح الدفعات', go:'payments'}]});
    }
    if(remainderOf(i)<=0) return;
    const dd = daysUntil(i.dueDate);
    const p = projOf(i.projectId);
    if(dd!==null && dd<0){
      items.push({key:'ovd-'+i.id, pr:'high', cat:'تحصيلات', dot:'🔴', date:i.dueDate,
        text:'دفعة متأخرة '+Math.abs(dd)+' يوم — '+pLabel(p)+' — متبقٍ '+money(remainderOf(i)*grossFactor(i)),
        actions:[{label:'فتح الدفعات', go:'payments'}]});
    } else if(dd!==null && dd<=7){
      items.push({key:'due-'+i.id, pr:'low', cat:'تحصيلات', dot:'🟢', date:i.dueDate,
        text:'دفعة تستحق خلال '+dd+' يوم — '+pLabel(p)+' ('+money(remainderOf(i)*grossFactor(i))+')',
        actions:[{label:'فتح الدفعات', go:'payments'}]});
    }
  });

  (data.contracts||[]).forEach(c=>{
    if(isArchived(c)) return;
    const p = projOf(c.projectId);
    if(contractHasSupervision(c) && c.status==='سارٍ' && isConsultancy(c) && p.status==='جارٍ' && projectReadyForSupervision(p)){
      const done = data.payments.filter(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف').length;
      if(done < (c.supervisionMonths||0) && !data.payments.some(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف' && i.month===nowYM)){
        items.push({key:'sup-'+c.id+'-'+nowYM, pr:'high', cat:'فواتير', dot:'🔴', date:todayISO(),
          text:'مطلوب إصدار دفعة إشراف '+fmtMonth(nowYM)+' — '+pLabel(p)+' ('+money(c.supervisionMonthly)+')',
          actions:[{label:'⚡ توليد الآن', gen:'supervision', contractId:c.id}]});
      }
    }
    const cm = contractCommission(c);
    if(cm>0){
      const invoiced = data.payments.filter(i=>i.contractId===c.id).reduce((s,i)=>s+billedOf(i),0);
      if(invoiced < cm*0.999){
        items.push({key:'comm-'+c.id, pr:'med', cat:'عقود', dot:'🟡', date:c.date,
          text:'عمولة غير مفوترة '+money(cm-invoiced)+' — عقد '+(c.subType?c.subType+' ':'')+(c.contractor||'')+' — '+pLabel(p),
          actions:[{label:'⚡ توليد دفعة العمولة', gen:'commission', contractId:c.id}]});
      }
    }
    if(isConsultancy(c) && c.type!=='إشراف' && c.status!=='ملغى' && !isArchived(c)){
      const target = isComboContract(c) ? (c.designValue||0) : (c.value||0);
      const billed = data.payments.filter(i=>i.contractId===c.id && i.phase!=='إشراف').reduce((s,i)=>s+billedOf(i),0);
      const stg = (p.timeline||{});
      const designDone = (stg.design&&stg.design.status==='مكتملة');
      if(designDone && billed < target*0.999 && target>0){
        items.push({key:'des-'+c.id, pr:'med', cat:'عقود', dot:'🟣', date:todayISO(),
          text:'التصميم مكتمل ومتبقٍ '+money(target-billed)+' غير مفوتر من عقد — '+pLabel(p),
          actions:[{label:'فتح المشروع', go:'projects'}]});
      }
    }
  });

  data.projects.forEach(p=>{
    const feesOut = data.govFees.filter(g=>g.projectId===p.id && !isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    if(feesOut>0) items.push({key:'gov-'+p.id, pr:'high', cat:'رسوم حكومية', dot:'⚫', date:todayISO(),
      text:'أمانات '+money(feesOut)+' مدفوعة من خزينتك ولم تُسترد — '+pLabel(p),
      actions:[{label:'فتح الرسوم', go:'govFees'}]});

    const costs = data.projectCosts.filter(e=>!isArchived(e) && e.projectId===p.id).reduce((s,e)=>s+(e.amount||0),0);
    if((p.budgetAmount||0)>0 && costs > p.budgetAmount){
      items.push({key:'bud-'+p.id, pr:'med', cat:'الميزانية', dot:'🔵', date:todayISO(),
        text:'تجاوز الميزانية بـ '+Math.round((costs/p.budgetAmount-1)*100)+'% — '+pLabel(p)+' (التكاليف '+money(costs)+' من '+money(p.budgetAmount)+')',
        actions:[{label:'فتح المشروع', go:'projects'}]});
    }
    const billedP = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id).reduce((s,i)=>s+billedOf(i),0);
    if(p.status==='جارٍ' && billedP>10000){
      const margin = (billedP-costs-projectTimeCost(data, p.id))/billedP*100;
      if(margin<20) items.push({key:'mrg-'+p.id, pr:'med', cat:'الربحية', dot:'🟠', date:todayISO(),
        text:'هامش الربح الحقيقي انخفض إلى '+margin.toFixed(0)+'% — '+pLabel(p),
        actions:[{label:'فتح التحليلات', go:'analytics'}]});
    }
  });

  data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus!=='مدفوع').forEach(g=>{
    const p = projOf(g.projectId);
    items.push({key:'govp-'+g.id, pr:'med', cat:'رسوم حكومية', dot:'🟠', date:g.date,
      text:'رسم '+g.department+' غير مسدد للدائرة ('+money(g.amount)+') — '+pLabel(p),
      actions:[{label:'فتح الرسوم', go:'govFees'}]});
  });

  listQuarters().forEach(q=>{
    if(quarterEndDate(q) < todayISO()){
      const dd = daysUntil(quarterDueDate(q));
      if(dd!==null && dd<=30) items.push({key:'vat-'+q, pr:'high', cat:'الضريبة', dot:'🔴', date:quarterDueDate(q),
        text:'إقرار ض.ق.م عن '+quarterLabel(q)+' — '+(dd<0?('متأخر '+Math.abs(dd)+' يوم'):('متبقٍ '+dd+' يوم')),
        actions:[{label:'فتح الضريبة', go:'vat'}]});
    }
  });

  const prOrder = {high:0, med:1, low:2};
  items.sort((a,b)=> prOrder[a.pr]-prOrder[b.pr] || (a.date||'').localeCompare(b.date||''));
  return items;
}

function FccView({data, mutate, go, setFcc}){
  const [prFilter, setPrFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const st = data.fccState || {};
  const all = buildFccItems(data);
  const visible = all.filter(it=>{
    const s = st[it.key];
    if(s && s.done) return false;
    if(s && s.snoozeUntil && s.snoozeUntil >= todayISO()) return false;
    if(prFilter && it.pr!==prFilter) return false;
    if(catFilter && it.cat!==catFilter) return false;
    return true;
  });
  const hiddenCount = all.length - all.filter(it=>{ const s=st[it.key]; return !(s&&(s.done||(s.snoozeUntil&&s.snoozeUntil>=todayISO()))); }).length;
  const cats = [...new Set(all.map(i=>i.cat))];
  const PR_AR = {high:'عاجل', med:'متوسط', low:'قريباً'};
  const PR_CLS = {high:'bad', med:'soon', low:'ok'};

  const mark = (key, patch)=> setFcc({...st, [key]:{...(st[key]||{}), ...patch}});
  const runGen = (it, act)=>{
    const c = (data.contracts||[]).find(x=>x.id===act.contractId);
    if(!c) return;
    const due = new Date(); due.setDate(due.getDate()+10);
    if(act.gen==='supervision'){
      if(data.payments.some(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف' && i.month===currentYM())){
        alert('دفعة إشراف هذا الشهر مولّدة بالفعل لهذا العقد'); return;
      }
      mutate('payments').add({id:uid(), projectId:c.projectId, contractId:c.id, phase:'إشراف', month:currentYM(),
        amount:c.supervisionMonthly, date:todayISO(), dueDate:due.toISOString().slice(0,10), status:'معلقة', _ts:Date.now()});
      alert('تم توليد دفعة الإشراف — تجدها في الدفعات');
    } else if(act.gen==='commission'){
      const cm = contractCommission(c);
      const invoiced = data.payments.filter(i=>i.contractId===c.id).reduce((s,i)=>s+billedOf(i),0);
      mutate('payments').add({id:uid(), projectId:c.projectId, contractId:c.id, phase:'أخرى',
        label:'عمولة الاستشاري — عقد '+(c.subType?c.subType+' ':'')+(c.contractor||''),
        amount:cm-invoiced, taxable:'خاضعة', date:todayISO(), dueDate:due.toISOString().slice(0,10), status:'معلقة', _ts:Date.now()});
      alert('تم توليد دفعة العمولة');
    }
  };

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">إجراءات عاجلة</div><div className="kpi-value" style={{color:'var(--rust)'}}>{visible.filter(i=>i.pr==='high').length}</div><div className="kpi-note">تحتاج تصرفاً اليوم</div></div>
        <div className="card"><div className="kpi-label">متوسطة الأولوية</div><div className="kpi-value" style={{color:'var(--amber, #B8860B)'}}>{visible.filter(i=>i.pr==='med').length}</div><div className="kpi-note">هذا الأسبوع</div></div>
        <div className="card"><div className="kpi-label">قادمة</div><div className="kpi-value" style={{color:'var(--teal)'}}>{visible.filter(i=>i.pr==='low').length}</div><div className="kpi-note">للمتابعة</div></div>
        <div className="card"><div className="kpi-label">منجزة / مؤجلة</div><div className="kpi-value">{hiddenCount}</div><div className="kpi-note">مخفاة من القائمة</div></div>
      </div>

      <div className="toolbar" style={{flexWrap:'wrap'}}>
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>ما الذي يحتاج تصرفاً؟</h3><div className="rule"></div></div>
        <select value={prFilter} onChange={e=>setPrFilter(e.target.value)}
          style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
          <option value="">كل الأولويات</option>
          <option value="high">عاجل</option><option value="med">متوسط</option><option value="low">قريباً</option>
        </select>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
          <option value="">كل التصنيفات</option>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {visible.length===0 && <p style={{fontSize:13.5, color:'var(--teal)', margin:0, fontWeight:700}}>✓ لا توجد إجراءات مالية معلقة — كل شيء تحت السيطرة.</p>}
        {visible.map(it=>(
          <div key={it.key} style={{display:'flex', gap:10, alignItems:'flex-start', padding:'12px 0', borderBottom:'1px solid var(--line)', flexWrap:'wrap'}}>
            <span style={{fontSize:15, flexShrink:0}}>{it.dot}</span>
            <div style={{flex:1, minWidth:220}}>
              <div style={{fontSize:13.5}}>{it.text}</div>
              <div style={{fontSize:10.5, color:'var(--ink-faint)', marginTop:3}}>
                <span className={"badge "+PR_CLS[it.pr]} style={{marginInlineEnd:6}}>{PR_AR[it.pr]}</span>
                <span className="badge gray">{it.cat}</span>
              </div>
            </div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
              {it.actions.map((a,i)=> a.gen
                ? <button key={i} className="btn small brass" onClick={()=>runGen(it, a)}>{a.label}</button>
                : <button key={i} className="btn small outline" onClick={()=>go(a.go)}>{a.label}</button>
              )}
              <button className="btn ghost small" title="تأجيل 3 أيام" onClick={()=>{ const d=new Date(); d.setDate(d.getDate()+3); mark(it.key,{snoozeUntil:d.toISOString().slice(0,10)}); }}>⏰ تأجيل</button>
              <button className="btn ghost small" title="تم" style={{color:'var(--teal)'}} onClick={()=>mark(it.key,{done:true, at:todayISO()})}>✓ تم</button>
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12}}>* القائمة تتولد تلقائياً من بيانات النظام وتتحدث لحظياً — البنود المنجزة فعلياً (كسداد دفعة) تختفي وحدها، وزر "تم" لإخفاء ما عالجته خارج النظام. "تأجيل" يخفي البند 3 أيام.</p>
    </div>
  );
}

/* ================= التحليلات الذكية ================= */
function AnalyticsView({data}){
  const [lang, setLang] = useState('ar');

  /* --- ربحية المشاريع بالهوامش (شاملة تكلفة وقت المهندسين) --- */
  const margins = data.projects.map(p=>{
    const billed = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id).reduce((s,i)=>s+billedOf(i),0);
    const directCosts = data.projectCosts.filter(e=>!isArchived(e) && e.projectId===p.id).reduce((s,e)=>s+(e.amount||0),0);
    const timeCost = projectTimeCost(data, p.id);
    const costs = directCosts + timeCost;
    const margin = billed>0 ? (billed-costs)/billed*100 : null;
    return {...p, billed, costs, directCosts, timeCost, profit:billed-costs, margin};
  }).filter(r=>r.billed>0).sort((a,b)=>(a.margin??100)-(b.margin??100));

  /* --- توقع التدفق النقدي 3 أشهر --- */
  const {bank, cash} = computeCashFlows(data);
  const startBal = bank+cash;
  const now = new Date();
  const next3 = [1,2,3].map(k=>{ const d=new Date(now.getFullYear(), now.getMonth()+k, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); });
  const avgOver = (arr, months)=>{
    const sums = months.map(m=> arr.filter(e=>monthKey(e.date)===m).reduce((s,e)=>s+e.amount,0));
    return sums.reduce((s,v)=>s+v,0)/months.length;
  };
  const prev3 = [1,2,3].map(k=>{ const d=new Date(now.getFullYear(), now.getMonth()-k, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); });
  const avgOffice = avgOver(officeExpNoPayroll(data), prev3)*1.05;   // الرواتب تُضاف منفصلة (payrollNow)
  const avgProjCosts = avgOver(data.projectCosts.filter(e=>!isArchived(e)), prev3)*1.05;
  const payrollNow = computePayroll(data, currentYM()).totalNet;
  let running = startBal;
  const forecast = next3.map(m=>{
    const scheduled = data.payments.filter(i=> remainderOf(i)>0 && monthKey(i.dueDate)===m).reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
    const supervision = (data.contracts||[]).filter(c=> contractHasSupervision(c) && c.status==='سارٍ' && isConsultancy(c))
      .filter(c=>{
        const proj = data.projects.find(p=>p.id===c.projectId);
        if(!proj || proj.status!=='جارٍ' || !projectReadyForSupervision(proj)) return false;
        const done = data.payments.filter(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف').length;
        return done < (c.supervisionMonths||0) && !data.payments.some(i=>i.contractId===c.id && i.month===m);
      }).reduce((s,c)=>s+(c.supervisionMonthly||0)*1.05,0);
    const inflow = scheduled + supervision;
    const outflow = avgOffice + avgProjCosts + payrollNow;
    running += inflow - outflow;
    return {m, inflow, outflow, net:inflow-outflow, balance:running};
  });

  /* --- مصروفات غير طبيعية --- */
  const nowYM = currentYM();
  const catTotals = (arr, m)=>{
    const t={}; arr.filter(e=>monthKey(e.date)===m).forEach(e=>{ t[e.category]=(t[e.category]||0)+e.amount; }); return t;
  };
  const anomalies = [];
  [['مصروفات المكتب', data.officeExpenses],['تكاليف المشاريع', data.projectCosts]].forEach(([label, arr])=>{
    const cur = catTotals(arr, nowYM);
    Object.entries(cur).forEach(([cat, amt])=>{
      const avg = prev3.reduce((s,m)=> s + (catTotals(arr,m)[cat]||0), 0)/3;
      if(amt>500 && avg>0 && amt > avg*1.5){
        anomalies.push({label, cat, amt, avg, pct: Math.round((amt/avg-1)*100)});
      } else if(amt>2000 && avg===0){
        anomalies.push({label, cat, amt, avg:0, pct:null});
      }
    });
  });

  /* --- اقتراحات الفوترة --- */
  const suggestions = [];
  (data.contracts||[]).filter(c=> contractHasSupervision(c) && c.status==='سارٍ' && isConsultancy(c)).forEach(c=>{
    const proj = data.projects.find(p=>p.id===c.projectId);
    if(!proj || proj.status!=='جارٍ' || !projectReadyForSupervision(proj)) return;
    const done = data.payments.filter(i=>!isArchived(i) && i.contractId===c.id && i.phase==='إشراف').length;
    if(done < (c.supervisionMonths||0) && !data.payments.some(i=>i.contractId===c.id && i.month===nowYM)){
      suggestions.push('إصدار فاتورة إشراف '+fmtMonth(nowYM)+' لمشروع '+(proj.projectNo||'')+' '+proj.name+' ('+money(c.supervisionMonthly)+') — زر التوليد في قسم الدفعات');
    }
  });
  (data.contracts||[]).filter(c=> c.status!=='ملغى' && !isArchived(c) && isConsultancy(c) && c.type!=='إشراف').map(c=> isComboContract(c) ? {...c, value:(c.designValue||0)} : c).forEach(c=>{
    const proj = data.projects.find(p=>p.id===c.projectId);
    if(!proj) return;
    const billed = data.payments.filter(i=>i.contractId===c.id).reduce((s,i)=>s+billedOf(i),0);
    const stg = (proj.timeline||{});
    const designDone = (stg.design&&stg.design.status==='مكتملة') || (stg.detailed&&stg.detailed.status==='مكتملة');
    if(designDone && billed < (c.value||0)*0.999){
      suggestions.push('مشروع '+(proj.projectNo||'')+' '+proj.name+': مرحلة التصميم مكتملة والمفوتر '+money(billed)+' من '+money(c.value)+' — متبقٍ '+money((c.value||0)-billed)+' يُنصح بفوترته');
    }
  });

  /* --- التقرير الشهري ثنائي اللغة --- */
  const ymNow = currentYM();
  const rev = data.payments.filter(i=>monthKey(i.date)===ymNow).reduce((s,i)=>s+billedOf(i),0);
  const offM = officeExpNoPayroll(data).filter(e=>monthKey(e.date)===ymNow).reduce((s,e)=>s+(e.amount||0),0);   // الرواتب منفصلة (payrollNow)
  const pcM = data.projectCosts.filter(e=>!isArchived(e) && monthKey(e.date)===ymNow).reduce((s,e)=>s+(e.amount||0),0);
  const netM = rev - offM - pcM - payrollNow;
  const recv = data.projects.reduce((s,p)=> s + data.payments.filter(i=>!isArchived(i) && i.projectId===p.id).reduce((x,i)=>x+remainderOf(i)*grossFactor(i),0), 0);
  const amanat = data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
  const T = lang==='ar' ? {
    rpt:'التقرير الشهري — الإدارة المالية', period:'الفترة', rev:'الإيرادات الاستشارية المفوترة', off:'مصروفات المكتب', pc:'تكاليف المشاريع المباشرة',
    pay:'صافي الرواتب', net:'صافي الشهر (تقديري)', liq:'السيولة الحالية (بنك + خزينة)', recv:'مستحقات لدى العملاء', amn:'أمانات لم تُسترد',
    proj:'المشاريع الجارية', print:'طباعة التقرير', sw:'English'
  } : {
    rpt:'Monthly Report — Financial Management', period:'Period', rev:'Billed Consultancy Revenue', off:'Office Expenses', pc:'Direct Project Costs',
    pay:'Net Payroll', net:'Month Net (Estimate)', liq:'Current Liquidity (Bank + Cash)', recv:'Client Receivables', amn:'Unrecovered Deposits',
    proj:'Active Projects', print:'Print Report', sw:'العربية'
  };

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">أدنى هامش ربح</div><div className="kpi-value" style={{fontSize:19, color:(margins[0]&&margins[0].margin<20)?'var(--rust)':'var(--teal)'}}>{margins[0]&&margins[0].margin!==null?margins[0].margin.toFixed(0)+'%':'—'}</div><div className="kpi-note">{margins[0]?margins[0].name:''}</div></div>
        <div className="card"><div className="kpi-label">الرصيد المتوقع بعد 3 أشهر</div><div className="kpi-value" style={{fontSize:19, color:forecast[2]&&forecast[2].balance>=0?'var(--teal)':'var(--rust)'}}>{forecast[2]?money(forecast[2].balance):'—'}</div><div className="kpi-note">من {money(startBal)} حالياً</div></div>
        <div className="card"><div className="kpi-label">مصروفات غير طبيعية</div><div className="kpi-value" style={{fontSize:19, color:anomalies.length?'var(--rust)':'var(--teal)'}}>{anomalies.length}</div><div className="kpi-note">هذا الشهر مقابل متوسط 3 أشهر</div></div>
        <div className="card"><div className="kpi-label">اقتراحات فوترة</div><div className="kpi-value" style={{fontSize:19, color:'var(--brass)'}}>{suggestions.length}</div><div className="kpi-note">فرص تحصيل جاهزة</div></div>
      </div>

      {(()=>{
        const consCons = (data.contracts||[]).filter(c=> c.status!=='ملغى' && !isArchived(c) && isConsultancy(c));
        const contracted = consCons.reduce((s,c)=>s+contractTotalOf(c),0)
          + (data.contracts||[]).filter(c=>c.category&&c.category!=='خدمات استشارية').reduce((s,c)=>s+contractCommission(c),0);
        const invoiced = data.payments.reduce((s,i)=>s+billedOf(i),0);
        const uninvoiced = Math.max(0, contracted - invoiced);
        const collected = data.payments.reduce((s,i)=>s+collectedOf(i)*grossFactor(i),0);
        const outstanding = data.payments.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
        const horizon = (days)=>{
          const lim = new Date(); lim.setDate(lim.getDate()+days);
          const limS = lim.toISOString().slice(0,10);
          return data.payments.filter(i=>remainderOf(i)>0 && i.dueDate && i.dueDate<=limS).reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
        };
        return (
          <div>
            <div className="section-title"><h3 style={{fontSize:13.5}}>خط الإيرادات — من التعاقد إلى التحصيل</h3><div className="rule"></div></div>
            <div className="grid grid-4" style={{marginBottom:10}}>
              <div className="card"><div className="kpi-label">إجمالي المتعاقد عليه</div><div className="kpi-value" style={{fontSize:18}}>{money(contracted)}</div><div className="kpi-note">عقود استشارية + عمولات المقاولين</div></div>
              <div className="card"><div className="kpi-label">المفوتر / غير المفوتر</div><div className="kpi-value" style={{fontSize:18}}>{money(invoiced)}</div><div className="kpi-note" style={{color:uninvoiced>0?'var(--rust)':'var(--ink-faint)'}}>متبقٍ بلا فوترة: {money(uninvoiced)}</div></div>
              <div className="card"><div className="kpi-label">المحصّل (شامل الضريبة)</div><div className="kpi-value" style={{fontSize:18, color:'var(--teal)'}}>{money(collected)}</div><div className="kpi-note">مستحق غير محصّل: {money(outstanding)}</div></div>
              <div className="card"><div className="kpi-label">تحصيلات متوقعة</div><div className="kpi-value" style={{fontSize:15}}>{money(horizon(30))}</div><div className="kpi-note">خلال 30 يوم · 60: {money(horizon(60))} · 90: {money(horizon(90))}</div></div>
            </div>
            {(()=>{
              const done = data.payments.filter(i=>!isArchived(i) && i.paidDate && i.date && collectedOf(i)>0);
              const dso = done.length ? Math.round(done.reduce((s,i)=>{
                const d = (new Date(i.paidDate) - new Date(i.date))/86400000;
                return s + Math.max(0, d);
              },0)/done.length) : null;
              const outs = data.payments.filter(i=>remainderOf(i)>0 && i.dueDate);
              let wSum=0, wTot=0;
              outs.forEach(i=>{
                const age = Math.max(0, -(daysUntil(i.dueDate)||0));
                const w = remainderOf(i)*grossFactor(i);
                wSum += age*w; wTot += w;
              });
              const arAge = wTot>0 ? Math.round(wSum/wTot) : null;
              return (
                <p style={{fontSize:11.5, color:'var(--ink-faint)', marginBottom:22}}>
                  * قيم عقود المقاولين نفسها خارج هذا الخط بالكامل — تدخل عمولاتها فقط.
                  {dso!==null && <span> · <b style={{color:'var(--ink-soft)'}}>متوسط أيام التحصيل (DSO): {dso} يوم</b> من تاريخ الفاتورة للاستلام</span>}
                  {arAge!==null && <span> · <b style={{color: arAge>30 ? 'var(--rust)' : 'var(--ink-soft)'}}>متوسط تأخر الذمم القائمة: {arAge} يوم</b> (مرجّح بالمبالغ)</span>}
                </p>
              );
            })()}
          </div>
        );
      })()}

      <div className="section-title"><h3 style={{fontSize:13.5}}>هوامش ربح المشاريع (الأقل أولاً)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:22}}>
        <table>
          <thead><tr><th>المشروع</th><th>المفوتر</th><th>تكاليف مباشرة</th><th>تكلفة الوقت</th><th>الربح الحقيقي</th><th>الهامش</th></tr></thead>
          <tbody>
            {margins.length===0 && <tr className="empty-row"><td colSpan={6}>لا بيانات كافية</td></tr>}
            {margins.map(r=>(
              <tr key={r.id}>
                <td>{(r.projectNo?r.projectNo+' — ':'')+r.name}</td>
                <td>{money(r.billed)}</td>
                <td>{money(r.directCosts)}</td>
                <td style={{color:r.timeCost>0?'var(--rust)':'var(--ink-faint)'}}>{money(r.timeCost)}</td>
                <td style={{color:r.profit>=0?'var(--teal)':'var(--rust)', fontWeight:700}}>{money(r.profit)}</td>
                <td>{r.margin!==null ? <span className={"badge "+(r.margin<20?'bad':r.margin<40?'soon':'ok')}>{r.margin.toFixed(0)}%</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>توقع التدفق النقدي — الأشهر الثلاثة القادمة</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:8}}>
        <table>
          <thead><tr><th>الشهر</th><th>وارد متوقع</th><th>صادر متوقع</th><th>الصافي</th><th>الرصيد التراكمي</th></tr></thead>
          <tbody>
            {forecast.map(f=>(
              <tr key={f.m}>
                <td>{fmtMonth(f.m)}</td>
                <td style={{color:'var(--teal)'}}>{money(f.inflow)}</td>
                <td style={{color:'var(--rust)'}}>{money(f.outflow)}</td>
                <td style={{fontWeight:700, color:f.net>=0?'var(--teal)':'var(--rust)'}}>{money(f.net)}</td>
                <td style={{fontWeight:800, color:f.balance>=0?'var(--ink)':'var(--rust)'}}>{money(f.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{fontSize:11.5, color:'var(--ink-faint)', marginBottom:22}}>* الوارد = الدفعات المستحقة حسب تواريخها + دفعات الإشراف الشهرية للعقود السارية. الصادر = متوسط مصروفات آخر 3 أشهر + رواتب الشهر الحالي. توقع استرشادي وليس التزاماً.</p>

      <div className="grid grid-2" style={{marginBottom:22}}>
        <div className="card">
          <div className="section-title"><h3>مصروفات غير طبيعية هذا الشهر</h3><div className="rule"></div></div>
          {anomalies.length===0 && <p style={{fontSize:12.5, color:'var(--ink-faint)'}}>لا توجد مصروفات شاذة — الإنفاق ضمن النمط المعتاد.</p>}
          {anomalies.map((a,i)=>(
            <div className="alert-item" key={i}>
              <span>{a.label} — {a.cat}: {money(a.amt)} {a.pct!==null ? '(أعلى من المتوسط بـ '+a.pct+'%)' : '(بند جديد غير معتاد)'}</span>
              <span className="badge bad">راجِع</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="section-title"><h3>اقتراحات إصدار الفواتير</h3><div className="rule"></div></div>
          {suggestions.length===0 && <p style={{fontSize:12.5, color:'var(--ink-faint)'}}>لا توجد اقتراحات حالياً — الفوترة مواكبة للإنجاز.</p>}
          {suggestions.map((s,i)=>(
            <div className="alert-item" key={i}>
              <span>{s}</span>
              <span className="badge soon">فوترة</span>
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3 style={{fontSize:13.5}}>{T.rpt}</h3><div className="rule"></div></div>
        <button className="btn outline no-print" onClick={()=>setLang(lang==='ar'?'en':'ar')}>{T.sw}</button>
        <button className="btn brass no-print" onClick={()=>window.print()}><I.print/> {T.print}</button>
      </div>
      <div className="doc" dir={lang==='ar'?'rtl':'ltr'}>
        <div className="doc-head">
          <div className="doc-brand">
            <img src={NITAQ_LOGO} alt="نطاق" style={{height:56}} />
            <div>
              <h1>{lang==='ar'?COMPANY.nameAr:COMPANY.nameEn}</h1>
              <p>TRN: {COMPANY.trn}</p>
            </div>
          </div>
          <div className="doc-type">
            <div className="t">{T.rpt}</div>
            <div className="n">{T.period}: {fmtMonth(ymNow)} · {todayISO()}</div>
          </div>
        </div>
        <div className="doc-body">
          <table>
            <tbody>
              <tr><td>{T.rev}</td><td style={{textAlign:'left'}}>{money(rev)}</td></tr>
              <tr><td>{T.off}</td><td style={{textAlign:'left'}}>−{money(offM)}</td></tr>
              <tr><td>{T.pc}</td><td style={{textAlign:'left'}}>−{money(pcM)}</td></tr>
              <tr><td>{T.pay}</td><td style={{textAlign:'left'}}>−{money(payrollNow)}</td></tr>
              <tr style={{fontWeight:800}}><td>{T.net}</td><td style={{textAlign:'left', color:netM>=0?'var(--teal)':'var(--rust)'}}>{money(netM)}</td></tr>
              <tr><td>{T.liq}</td><td style={{textAlign:'left'}}>{money(startBal)}</td></tr>
              <tr><td>{T.recv}</td><td style={{textAlign:'left'}}>{money(recv)}</td></tr>
              <tr><td>{T.amn}</td><td style={{textAlign:'left'}}>{money(amanat)}</td></tr>
              <tr><td>{T.proj}</td><td style={{textAlign:'left'}}>{data.projects.filter(p=>p.status==='جارٍ').length}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="doc-foot">
          <span>SHARJAH · UAE | {COMPANY.phone2} | {COMPANY.phone} | {COMPANY.email}</span>
          <span className="tag">{COMPANY.tagline}</span>
        </div>
      </div>
    </div>
  );
}

/* ================= Project Revenue View (إيرادات المشاريع) ================= */
/* ================= صفحة الإيرادات الموحّدة (ملخّص + تبويبات) ================= */
function RevenueHub({data, configs, mutate}){
  const [tab, setTab] = useState('overview');   // overview | projects | other

  // ===== فلتر الفترة (نظرة عامة فقط) — نفس منطق تبويب إيرادات المشاريع =====
  const [fromD, setFromD] = useState('');
  const [toD, setToD] = useState('');
  const inRange = (d)=> (!fromD || (d||'') >= fromD) && (!toD || (d||'') <= toD);
  const anyPeriod = !!(fromD || toD);
  const setPreset = (k)=>{
    const t = todayISO(); const y = t.slice(0,4); const m = parseInt(t.slice(5,7),10);
    const pad = (n)=> String(n).padStart(2,'0');
    const lastDay = (yy,mm)=> pad(new Date(parseInt(yy,10), mm, 0).getDate());
    if(k==='all'){ setFromD(''); setToD(''); }
    else if(k==='month'){ setFromD(y+'-'+pad(m)+'-01'); setToD(y+'-'+pad(m)+'-'+lastDay(y,m)); }
    else if(k==='quarter'){ const q0=Math.floor((m-1)/3)*3+1, q1=q0+2; setFromD(y+'-'+pad(q0)+'-01'); setToD(y+'-'+pad(q1)+'-'+lastDay(y,q1)); }
    else if(k==='year'){ setFromD(y+'-01-01'); setToD(y+'-12-31'); }
  };
  const isCollectedPay = (i)=> i.status==='مدفوعة' || i.status==='مدفوعة جزئياً';
  // المحصّلة تُفلتر بتاريخ التحصيل الفعلي؛ المعلّقة بتاريخ الإصدار
  const payDate = (i)=> (isCollectedPay(i) ? (i.paidDate || i.date) : i.date) || '';

  // إيرادات المشاريع الاستشارية
  const pays = (data.payments||[]).filter(i=>!isArchived(i) && i.status!=='ملغاة' && inRange(payDate(i)));
  const projBilled = pays.reduce((s,i)=>s+billedOf(i),0);                       // مفوتر (صافي)
  const projCollected = pays.reduce((s,i)=>s+collectedOf(i)*grossFactor(i),0);  // محصّل (شامل الضريبة)
  const projDue = pays.reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);        // مستحق غير محصّل (شامل)
  // الإيرادات الأخرى
  const inc = (data.otherIncome||[]).filter(r=>!isArchived(r) && inRange(r.date));
  const otherNet = inc.reduce((s,r)=>s+(r.amount||0),0);          // صافي
  const otherGross = inc.reduce((s,r)=>s+incGross(r),0);          // شامل الضريبة (محصّل فعلاً عادةً)
  // الإجمالي الكلي (صافي قبل الضريبة لمقارنة متجانسة)
  const totalNet = projBilled + otherNet;
  // الإجمالي شامل الضريبة (المفوتر من المشاريع + الإيرادات الأخرى، كلٌّ حسب خضوعه)
  const projBilledGross = pays.reduce((s,i)=>s+billedOf(i)*grossFactor(i),0);
  const totalGross = projBilledGross + otherGross;
  const totalVat = totalGross - totalNet;
  const pctProj = totalNet>0 ? Math.round(projBilled/totalNet*100) : 0;
  const pctOther = totalNet>0 ? Math.round(otherNet/totalNet*100) : 0;

  const tabBtn = (v,label)=>(
    <button onClick={()=>setTab(v)} style={{padding:'8px 16px', fontSize:13, fontWeight:700, border:'none', borderBottom:'2.5px solid '+(tab===v?'var(--brass)':'transparent'), background:'transparent', color:tab===v?'var(--ink)':'var(--ink-soft)', cursor:'pointer', fontFamily:'inherit'}}>{label}</button>
  );

  return (
    <div>
      <div className="section-title no-print"><h3>الإيرادات</h3><div className="rule"></div></div>

      {/* شريط التبويبات */}
      <div className="no-print" style={{display:'flex', gap:4, borderBottom:'1px solid var(--line)', marginBottom:16}}>
        {tabBtn('overview','نظرة عامة')}
        {tabBtn('projects','إيرادات المشاريع')}
        {tabBtn('other','الإيرادات الأخرى')}
      </div>

      {tab==='overview' && (
        <div>
          {/* شريط فلتر الفترة */}
          <div className="card no-print" style={{marginBottom:14, display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, padding:'12px 14px'}}>
            <span style={{fontSize:13, fontWeight:800, color:'var(--ink)'}}>📅 الفترة:</span>
            {[['month','الشهر ده'],['quarter','الربع ده'],['year','السنة دي'],['all','الكل']].map(([k,l])=>(
              <button key={k} className="btn outline" style={{padding:'5px 12px', fontSize:12}} onClick={()=>setPreset(k)}>{l}</button>
            ))}
            <span style={{fontSize:12, color:'var(--ink-soft)', marginInlineStart:6}}>من</span>
            <input type="date" value={fromD} onChange={e=>setFromD(e.target.value)} style={{padding:'5px 8px', fontSize:12, fontFamily:'inherit', border:'1px solid var(--line-strong)', borderRadius:6}} />
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
            <input type="date" value={toD} onChange={e=>setToD(e.target.value)} style={{padding:'5px 8px', fontSize:12, fontFamily:'inherit', border:'1px solid var(--line-strong)', borderRadius:6}} />
            {anyPeriod && <span style={{fontSize:12, color:'var(--brass)', fontWeight:700}}>معروض: {fromD||'البداية'} ← {toD||'اليوم'}</span>}
            <button className="btn" style={{padding:'6px 14px', fontSize:12.5, marginInlineStart:'auto'}}
              onClick={async ()=>{ try{ await exportRevenueXlsx({data, pays, inc, fromD, toD, payDate,
                summary:{totalNet, totalGross, totalVat, projBilled, otherNet, projCollected, projDue}}); }catch(e){ alert('تعذّر التصدير: '+e.message); } }}>
              ⬇ تصدير Excel{anyPeriod?' (الفترة المختارة)':' (الكل)'}
            </button>
          </div>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', marginBottom:16}}>
            <div className="card"><div className="kpi-label">إجمالي الإيرادات (صافي){anyPeriod?' (مفلتر)':''}</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(totalNet)}</div><div className="kpi-note">المشاريع + الأخرى — قبل الضريبة</div></div>
            <div className="card"><div className="kpi-label">إجمالي الإيرادات (شامل الضريبة){anyPeriod?' (مفلتر)':''}</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(totalGross)}</div><div className="kpi-note">منها ضريبة: {money(totalVat)}</div></div>
            <div className="card"><div className="kpi-label">إيرادات المشاريع (مفوتر)</div><div className="kpi-value" style={{color:'var(--ink)'}}>{money(projBilled)}</div><div className="kpi-note">{pctProj}% من الإجمالي</div></div>
            <div className="card"><div className="kpi-label">الإيرادات الأخرى</div><div className="kpi-value" style={{color:'var(--ink)'}}>{money(otherNet)}</div><div className="kpi-note">{pctOther}% من الإجمالي</div></div>
            <div className="card"><div className="kpi-label">محصّل من المشاريع</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(projCollected)}</div><div className="kpi-note" style={{color:projDue>0?'var(--rust)':'var(--ink-faint)'}}>مستحق غير محصّل: {money(projDue)}</div></div>
          </div>

          {/* رسم نسبة أنواع الإيراد */}
          {totalNet===0 && anyPeriod && (
            <div className="card" style={{marginBottom:16, fontSize:13, color:'var(--ink-soft)'}}>لا توجد إيرادات في الفترة المختارة.</div>
          )}
          {totalNet>0 && (
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:13, fontWeight:800, color:'var(--ink)', marginBottom:12}}>📊 توزيع الإيرادات حسب النوع</div>
              {[
                {label:'إيرادات المشاريع الاستشارية', val:projBilled, pct:pctProj, col:'var(--brass)'},
                {label:'الإيرادات الأخرى (غير تشغيلية)', val:otherNet, pct:pctOther, col:'var(--teal)'},
              ].map(r=>(
                <div key={r.label} style={{marginBottom:12}}>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:4}}>
                    <span style={{color:'var(--ink)'}}>{r.label}</span>
                    <span style={{color:'var(--ink-soft)'}}><b>{money(r.val)}</b> · {r.pct}%</span>
                  </div>
                  <div style={{height:10, background:'var(--line)', borderRadius:6, overflow:'hidden'}}>
                    <div style={{height:'100%', width:r.pct+'%', background:r.col, borderRadius:6}}></div>
                  </div>
                </div>
              ))}
              <div style={{display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:800, paddingTop:10, marginTop:4, borderTop:'1.5px solid var(--line-strong)'}}>
                <span>الإجمالي الكلي (صافي)</span><span style={{color:'var(--teal)'}}>{money(totalNet)}</span>
              </div>
            </div>
          )}

          <p style={{fontSize:12, color:'var(--ink-faint)'}}>* الإيرادات مفصولة في العرض (تشغيلي من المشاريع / غير تشغيلي أخرى) للحفاظ على وضوح ربحية النشاط الأساسي، ومجمّعة في الإجمالي الكلي وفي الإقرار الضريبي — وهو المعيار المحاسبي المتّبع. فلتر الفترة: الدفعات المحصّلة بتاريخ استلامها، والدفعات غير المحصّلة بتاريخ إصدارها، والإيرادات الأخرى بتاريخ البند — نفس منطق تبويب «إيرادات المشاريع». اضغطي التبويبات بالأعلى للتفصيل الكامل.</p>
        </div>
      )}

      {tab==='projects' && <ProjectRevenueView data={data} />}
      {tab==='other' && <OtherIncomeView data={data} configs={configs} mutate={mutate} />}
    </div>
  );
}

function ProjectRevenueView({data}){
  const [pid, setPid] = useState('');
  const [phase, setPhase] = useState('');        // تصميم / إشراف / أخرى
  const [status, setStatus] = useState('');      // محصّل / معلّق
  const [acct, setAcct] = useState('');          // البنك / الخزينة
  const [fromD, setFromD] = useState('');
  const [toD, setToD] = useState('');
  const [expanded, setExpanded] = useState({});

  const acctOf = (i)=> i.account || 'البنك';     // الدفعات القديمة تُعتبر بنك
  const isCollected = (i)=> i.status==='مدفوعة' || i.status==='مدفوعة جزئياً';

  const phaseLabel = (p)=> p==='إشراف' ? 'إشراف' : p==='أخرى' ? 'رسوم أخرى' : 'تصميم واعتماد';

  // الإيراد = الدفعات الاستشارية فقط (المقاولون والأمانات مستبعدون تماماً)، والملغى مستبعد
  const rows = useMemo(()=>{
    return (data.payments||[]).filter(i=>{
      if(isArchived(i)) return false;
      if(i.status==='ملغاة') return false;   // الدفعة الملغاة (شيك مرتجع / فسخ عقد) مستبعدة من الإيرادات والضريبة
      if(pid && i.projectId!==pid) return false;
      if(phase && i.phase!==phase) return false;
      if(status==='collected' && !isCollected(i)) return false;
      if(status==='pending' && isCollected(i)) return false;
      if(acct && acctOf(i)!==acct) return false;
      // المحصّلة تُفلتر بتاريخ التحصيل الفعلي؛ المعلّقة بتاريخ الإصدار حتى لا تختفي من المتبقّي
      const d = (isCollected(i) ? (i.paidDate || i.date) : i.date) || '';
      if(fromD && d < fromD) return false;
      if(toD && d > toD) return false;
      return true;
    });
  }, [data.payments, pid, phase, status, acct, fromD, toD]);

  // تجميع حسب المشروع
  const groups = useMemo(()=>{
    const map = {};
    rows.forEach(i=>{
      const k = i.projectId||'—';
      if(!map[k]) map[k] = {pid:k, items:[], invoiced:0, collected:0, remaining:0, vat:0};
      const g = map[k];
      const net = i.amount||0;
      g.items.push(i);
      g.invoiced  += net;
      g.collected += collectedOf(i);
      g.remaining += remainderOf(i);
      g.vat       += net * vatRateOf(i);
    });
    const proj = (id)=> (data.projects||[]).find(p=>p.id===id);
    return Object.values(map).map(g=>{
      const p = proj(g.pid) || {};
      return {...g, projectNo:p.projectNo||'', name:p.name||'—', owner:p.owner||'—', emirate:p.emirate||''};
    }).sort((a,b)=> (a.projectNo||0)-(b.projectNo||0));
  }, [rows, data.projects]);

  const tot = useMemo(()=> groups.reduce((s,g)=>({
    invoiced:s.invoiced+g.invoiced, collected:s.collected+g.collected, remaining:s.remaining+g.remaining, vat:s.vat+g.vat, count:s.count+g.items.length
  }), {invoiced:0, collected:0, remaining:0, vat:0, count:0}), [groups]);

  const bankCollected = useMemo(()=> rows.filter(i=>acctOf(i)==='البنك').reduce((s,i)=>s+collectedOf(i),0), [rows]);
  const cashCollected = useMemo(()=> rows.filter(i=>acctOf(i)==='الخزينة').reduce((s,i)=>s+collectedOf(i),0), [rows]);

  const toggle = (k)=> setExpanded(e=>({...e, [k]:!e[k]}));
  const reset = ()=>{ setPid(''); setPhase(''); setStatus(''); setAcct(''); setFromD(''); setToD(''); };

  const anyFilter = pid||phase||status||acct||fromD||toD;
  const filterDesc = [
    pid ? 'مشروع: '+((data.projects.find(p=>p.id===pid)||{}).name||'') : '',
    phase ? 'النوع: '+phaseLabel(phase) : '',
    status==='collected' ? 'المحصّل فقط' : status==='pending' ? 'المعلّق فقط' : '',
    acct ? 'الحساب: '+acct : '',
    (fromD||toD) ? ('الفترة: '+(fromD||'البداية')+' ← '+(toD||'الآن')) : '',
  ].filter(Boolean).join(' · ') || 'كل الإيرادات';

  const selEl = {border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'};

  return (
    <div>
      {/* شريط الأدوات والفلاتر */}
      <div className="toolbar no-print" style={{flexWrap:'wrap', gap:10}}>
        <div className="section-title" style={{marginBottom:0, flex:'1 1 100%'}}><h3>إيرادات المشاريع</h3><div className="rule"></div></div>
        <select value={pid} onChange={e=>setPid(e.target.value)} style={selEl}>
          <option value="">كل المشاريع</option>
          {data.projects.map(p=><option key={p.id} value={p.id}>{(p.projectNo?p.projectNo+' — ':'')+p.name}</option>)}
        </select>
        <select value={phase} onChange={e=>setPhase(e.target.value)} style={selEl}>
          <option value="">كل الأنواع</option>
          <option value="تصميم">تصميم واعتماد</option>
          <option value="إشراف">إشراف</option>
          <option value="أخرى">رسوم أخرى</option>
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)} style={selEl}>
          <option value="">كل الحالات</option>
          <option value="collected">المحصّل</option>
          <option value="pending">المعلّق / المتأخر</option>
        </select>
        <select value={acct} onChange={e=>setAcct(e.target.value)} style={selEl}>
          <option value="">كل الحسابات</option>
          <option value="البنك">البنك</option>
          <option value="الخزينة">الخزينة</option>
        </select>
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
        <input type="date" value={fromD} onChange={e=>setFromD(e.target.value)} style={selEl} />
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
        <input type="date" value={toD} onChange={e=>setToD(e.target.value)} style={selEl} />
        {anyFilter && <button className="btn ghost small" onClick={reset}>مسح الفلاتر</button>}
        <button className="btn outline" onClick={()=>window.print()}><I.print/> طباعة</button>
      </div>

      {/* ترويسة الطباعة فقط */}
      <div className="print-only" style={{display:'none'}}>
        <div className="doc-head" style={{marginBottom:16}}>
          <div className="doc-brand">
            <img src={NITAQ_LOGO} alt="نطاق" style={{height:56}} />
            <div><h1>نطاق للاستشارات الهندسية</h1><p>NITAQ ENGINEERING CONSULTANTS · {COMPANY.trn}</p></div>
          </div>
          <div className="doc-type"><div className="t">تقرير إيرادات المشاريع</div><div className="n">صادر بتاريخ {todayISO()}</div></div>
        </div>
        <p style={{fontSize:12, margin:'0 0 12px'}}>نطاق التقرير: {filterDesc}</p>
      </div>

      {/* بطاقات الإجماليات */}
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card">
          <div className="kpi-label">إجمالي المفوتر (صافي)</div>
          <div className="kpi-value" style={{fontSize:19}}>{money(tot.invoiced)}</div>
          <div className="kpi-note">{tot.count} دفعة · {groups.length} مشروع</div>
        </div>
        <div className="card">
          <div className="kpi-label">إجمالي المحصّل (صافي)</div>
          <div className="kpi-value" style={{fontSize:19, color:'var(--teal)'}}>{money(tot.collected)}</div>
          <div className="kpi-note">بنك {money(bankCollected)} · خزينة {money(cashCollected)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">المتبقّي (صافي)</div>
          <div className="kpi-value" style={{fontSize:19, color:tot.remaining>0?'var(--rust)':'var(--teal)'}}>{money(tot.remaining)}</div>
          <div className="kpi-note">قيد التحصيل</div>
        </div>
        <div className="card">
          <div className="kpi-label">ضريبة المخرجات على المفوتر</div>
          <div className="kpi-value" style={{fontSize:19, color:'var(--blue)'}}>{money(tot.vat)}</div>
          <div className="kpi-note">5% على الدفعات الخاضعة</div>
        </div>
      </div>

      {/* الجدول المُجمّع القابل للتفصيل */}
      <div className="card" style={{padding:0}}>
        <div className="rev-scroll" style={{overflowX:'auto'}}>
        <table className="rev-table">
          <thead><tr>
            <th style={{width:32}}></th><th>المشروع</th><th>المالك</th><th>عدد الدفعات</th>
            <th>المفوتر (صافي)</th><th>المحصّل (صافي)</th><th>المتبقّي (صافي)</th><th>ض.ق.م</th>
          </tr></thead>
          <tbody>
            {groups.length===0 && <tr className="empty-row"><td colSpan={8}>لا توجد إيرادات مطابقة للفلاتر المختارة</td></tr>}
            {groups.map(g=>(
              <React.Fragment key={g.pid}>
                <tr style={{cursor:'pointer'}} onClick={()=>toggle(g.pid)}>
                  <td style={{textAlign:'center', color:'var(--brass)', fontWeight:800}}>{expanded[g.pid]?'▾':'▸'}</td>
                  <td><b>{(g.projectNo?g.projectNo+' — ':'')+g.name}</b></td>
                  <td>{g.owner}</td>
                  <td>{g.items.length}</td>
                  <td>{money(g.invoiced)}</td>
                  <td style={{color:'var(--teal)', fontWeight:700}}>{money(g.collected)}</td>
                  <td style={{color:g.remaining>0?'var(--rust)':'var(--teal)', fontWeight:700}}>{money(g.remaining)}</td>
                  <td>{money(g.vat)}</td>
                </tr>
                {expanded[g.pid] && g.items.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(i=>(
                  <tr key={i.id} style={{background:'rgba(19,42,70,.02)', fontSize:12}}>
                    <td></td>
                    <td>
                      <span className={"badge "+(i.phase==='إشراف'?'neutral':i.phase==='أخرى'?'soon':'gray')}>{phaseLabel(i.phase)}</span>
                      <span style={{marginInlineStart:6}}>{i.phase==='إشراف' ? (i.month?fmtMonth(i.month):'') : (i.label||'')}</span>
                    </td>
                    <td>{i.date}</td>
                    <td>
                      {isCollected(i)
                        ? <span className="badge ok">{i.status==='مدفوعة جزئياً'?'محصّل جزئياً':'محصّل'}</span>
                        : <span className={"badge "+(i.status==='متأخرة'?'bad':'soon')}>{i.status}</span>}
                    </td>
                    <td>{money(i.amount||0)}</td>
                    <td style={{color:'var(--teal)'}}>{money(collectedOf(i))}</td>
                    <td style={{color:remainderOf(i)>0?'var(--rust)':'var(--teal)'}}>{money(remainderOf(i))}</td>
                    <td>{isCollected(i) ? <span className="badge gray">{acctOf(i)}</span> : '—'}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          {groups.length>0 && (
            <tfoot>
              <tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}>
                <td></td><td>الإجمالي</td><td></td><td>{tot.count}</td>
                <td>{money(tot.invoiced)}</td>
                <td style={{color:'var(--teal)'}}>{money(tot.collected)}</td>
                <td style={{color:tot.remaining>0?'var(--rust)':'var(--teal)'}}>{money(tot.remaining)}</td>
                <td>{money(tot.vat)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* الإيراد هنا = الدفعات الاستشارية فقط (تصميم/إشراف/رسوم أخرى). عقود المقاولين والرسوم الحكومية (الأمانات) لا تُحتسب ضمن الإيرادات. الدفعات الملغاة مستبعدة. "المحصّل" هو ما دخل فعلاً موزّعاً على البنك/الخزينة — والدفعات القديمة قبل إضافة حقل الحساب تُعتبر بنكاً افتراضياً. فلتر الفترة يعتمد على <b>تاريخ التحصيل</b> للدفعات المحصّلة، وعلى <b>تاريخ الإصدار</b> للدفعات المعلّقة حتى تبقى ظاهرة في المتبقّي. المبالغ صافية قبل الضريبة ما لم يُذكر غير ذلك. اضغط أي مشروع لعرض دفعاته.</p>
    </div>
  );
}

/* ================= Reports View ================= */
function ReportsView({data}){
  const [fromYm, setFromYm] = useState(currentYM());
  const [toYm, setToYm] = useState(currentYM());
  const inRange = (d)=>{ const k=monthKey(d); return k>=fromYm && k<=toYm; };
  const monthsInRange = (()=>{
    const arr=[]; let [y,m]=fromYm.split('-').map(Number);
    const [ty,tm]=toYm.split('-').map(Number);
    let guard=0;
    while((y<ty || (y===ty && m<=tm)) && guard<120){ arr.push(y+'-'+String(m).padStart(2,'0')); m++; if(m>12){m=1;y++;} guard++; }
    return arr;
  })();
  const payIn = data.payments.filter(i=>inRange(i.date));
  const designRev = payIn.filter(p=>p.phase==='تصميم').reduce((s,i)=>s+billedOf(i),0);
  const supervRev = payIn.filter(p=>p.phase==='إشراف').reduce((s,i)=>s+billedOf(i),0);
  const otherRev = payIn.filter(p=>p.phase==='أخرى').reduce((s,i)=>s+billedOf(i),0);
  const otherIncomeM = (data.otherIncome||[]).filter(r=>!isArchived(r) && inRange(r.date)).reduce((s,r)=>s+(r.amount||0),0);
  const projCostsM = data.projectCosts.filter(e=>!isArchived(e) && inRange(e.date)).reduce((s,e)=>s+(e.amount||0),0);
  const officeM = officeExpNoPayroll(data).filter(e=>inRange(e.date)).reduce((s,e)=>s+(e.amount||0),0);   // بدون قيود الرواتب (تُحتسب في payrollCost) وبدون المؤرشف
  const payrollCost = monthsInRange.reduce((s,m)=>s+computePayroll(data,m).totalCost,0);
  const gross = designRev + supervRev + otherRev + otherIncomeM - projCostsM;
  const net = gross - officeM - payrollCost;
  const rangeLabel = fromYm===toYm ? fmtMonth(fromYm) : ('من '+fmtMonth(fromYm)+' إلى '+fmtMonth(toYm));

  const projRows = useMemo(()=> data.projects.map(p=>{
    const dPaid = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id && i.phase==='تصميم').reduce((s,i)=>s+billedOf(i),0);
    const sPaid = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id && i.phase==='إشراف').reduce((s,i)=>s+billedOf(i),0);
    const oPaid = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id && i.phase==='أخرى').reduce((s,i)=>s+billedOf(i),0);
    const sCount = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id && i.phase==='إشراف').length;
    const spent = data.projectCosts.filter(e=>!isArchived(e) && e.projectId===p.id).reduce((s,e)=>s+(e.amount||0),0);
    const cons = (data.contracts||[]).filter(c=>c.projectId===p.id && c.status!=='ملغى' && !isArchived(c) && (isConsultancy(c)));
    const contract = cons.length>0
      ? cons.reduce((s,c)=> s + contractTotalOf(c), 0)
      : (p.designFee||0) + (p.supervisionMonthly||0)*(p.supervisionMonths||0);
    const supMonths = cons.filter(c=>contractHasSupervision(c)).reduce((s,c)=>s+(c.supervisionMonths||0),0) || (p.supervisionMonths||0);
    return {...p, dPaid, sPaid, oPaid, sCount, spent, contract, supMonths, profit:dPaid+sPaid+oPaid-spent};
  }), [data.projects, data.payments, data.projectCosts, data.contracts]);

  const govRows = data.projects.map(p=>{
    const fees = data.govFees.filter(g=>g.projectId===p.id);
    const total = fees.reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    const paid = fees.filter(g=>g.paidStatus==='مدفوع').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    const reimb = fees.filter(g=>g.reimburseStatus==='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    const outst = fees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    return {...p, total, paid, reimb, outst, count:fees.length};
  }).filter(r=>r.count>0);

  return (
    <div>
      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}><h3>التقارير المالية</h3><div className="rule"></div></div>
        <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
          <input type="month" value={fromYm} onChange={e=>setFromYm(e.target.value)} />
          <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
          <input type="month" value={toYm} onChange={e=>setToYm(e.target.value)} />
          <button className="btn outline no-print" onClick={()=>window.print()}><I.print/> طباعة</button>
        </div>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>قائمة الدخل — {rangeLabel}</h3><div className="rule"></div></div>
      <div className="card" style={{marginBottom:24}}>
        <table>
          <tbody>
            <tr><td>إيرادات التصميم واعتماد المخططات</td><td style={{textAlign:'left'}}>{money(designRev)}</td></tr>
            <tr><td>إيرادات الإشراف الشهري</td><td style={{textAlign:'left'}}>{money(supervRev)}</td></tr>
            <tr><td>إيرادات رسوم أخرى (فحوصات وخدمات خارجية)</td><td style={{textAlign:'left'}}>{money(otherRev)}</td></tr>
            <tr><td>إيرادات أخرى غير تشغيلية (بيع أصول، إيجار فرعي، عمولات…)</td><td style={{textAlign:'left'}}>{money(otherIncomeM)}</td></tr>
            <tr><td>تكاليف المشاريع المباشرة</td><td style={{textAlign:'left'}}>−{money(projCostsM)}</td></tr>
            <tr style={{fontWeight:700}}><td>مجمل الربح</td><td style={{textAlign:'left'}}>{money(gross)}</td></tr>
            <tr><td>مصروفات المكتب العمومية</td><td style={{textAlign:'left'}}>−{money(officeM)}</td></tr>
            <tr><td>تكلفة الرواتب للفترة (قبل استقطاع السلف — وفق كشف الرواتب)</td><td style={{textAlign:'left'}}>−{money(payrollCost)}</td></tr>
            <tr style={{fontWeight:800, fontSize:15}}><td>صافي الربح / الخسارة</td><td style={{textAlign:'left', color:net>=0?'var(--teal)':'var(--rust)'}}>{money(net)}</td></tr>
          </tbody>
        </table>
        <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:10, marginBottom:0}}>* الرسوم الحكومية أمانات لا تظهر ضمن الإيرادات أو المصروفات.</p>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>ربحية المشاريع (تراكمي)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:24}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>المشروع</th><th>قيمة العقد</th><th>محصّل التصميم</th><th>محصّل الإشراف</th><th>رسوم أخرى</th><th>تقدم الإشراف</th><th>تكاليف مباشرة</th><th>الربح</th></tr></thead>
          <tbody>
            {projRows.map(p=>(
              <tr key={p.id}>
                <td>{(p.projectNo?p.projectNo+' — ':'')+p.name}</td>
                <td>{money(p.contract)}</td>
                <td>{money(p.dPaid)}</td>
                <td>{money(p.sPaid)}</td>
                <td>{money(p.oPaid)}</td>
                <td>{p.supMonths>0 ? (
                  <span>
                    {p.sCount} من {p.supMonths} شهر
                    <div className="progress" style={{width:70}}><div style={{width:Math.min(100,(p.sCount/p.supMonths)*100)+'%'}}></div></div>
                  </span>
                ) : '—'}</td>
                <td>{money(p.spent)}</td>
                <td style={{color:p.profit>=0?'var(--teal)':'var(--rust)', fontWeight:700}}>{money(p.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>الرسوم الحكومية حسب المشروع (أمانات)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>المشروع</th><th>إجمالي الرسوم</th><th>مدفوع للدوائر</th><th>مسترد من العميل</th><th>معلق الاسترداد</th></tr></thead>
          <tbody>
            {govRows.length===0 && <tr className="empty-row"><td colSpan={5}>لا توجد رسوم حكومية مسجلة</td></tr>}
            {govRows.map(r=>(
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{money(r.total)}</td>
                <td>{money(r.paid)}</td>
                <td>{money(r.reimb)}</td>
                <td style={{color:r.outst>0?'var(--rust)':'var(--teal)', fontWeight:700}}>{money(r.outst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Payroll View ================= */
