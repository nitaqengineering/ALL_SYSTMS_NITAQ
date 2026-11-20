function payrollPaidForMonth(data, ym){
  return (data.officeExpenses||[]).some(e=>(e.kind==='رواتب'||e.kind===SALARY_PART_KIND) && e.month===ym)
      || (data.treasury||[]).some(t=>t.kind==='رواتب' && t.month===ym);
}
/* ==== صرف الرواتب على دفعات (للموظفين خارج WPS) ====
   الاستحقاق: صافي الشهر كاملاً مصروف على شهره (computePayroll) — والصرف: قيود مستقلة كلٌّ بتاريخه.
   - الصرف الجماعي kind='رواتب' (واحد لكل شهر — محروس على السيرفر بجدول nitaq_payroll_month_v1):
     الجديد يحمل lines=[{employeeId,amount}] لموظفي WPS فقط؛ القديم بلا lines = صرف كامل لكل الموظفين.
   - دفعة راتب فردية kind=SALARY_PART_KIND لموظف خارج WPS (employeeId + month) — تتكرر في نفس الشهر.
     حد المجموع ≤ الصافي محروس في الواجهة (authorizeBundle). */
const SALARY_PART_KIND = 'دفعة راتب';
// قيود صرف الرواتب داخل مصروفات المكتب — تُستبعد من قائمة الدخل لأن الرواتب تُحتسب من computePayroll (منعاً للخصم المزدوج)
const isSalaryExp = (e)=> e && (e.kind==='رواتب' || e.kind===SALARY_PART_KIND);
const officeExpNoPayroll = (data)=> (data.officeExpenses||[]).filter(e=>!isArchived(e) && !isSalaryExp(e));
const isWpsEmp = (emp)=> !emp || emp.payMode!=='خارج WPS';
function salaryPaymentsForEmp(data, empId, ym, net){
  const list = [];
  [...(data.officeExpenses||[]), ...(data.treasury||[])]
    .filter(x=>x.kind==='رواتب' && x.month===ym && !isArchived(x))
    .forEach(run=>{
      if(Array.isArray(run.lines)){
        run.lines.filter(l=>l && l.employeeId===empId).forEach(l=>list.push({date:run.date, amount:Number(l.amount)||0, account:run.account, via:'صرف الرواتب (WPS)'}));
      } else {
        list.push({date:run.date, amount:net, account:run.account, via:'صرف الرواتب', legacy:true});   // قيد قديم = صرف كامل للجميع
      }
    });
  (data.officeExpenses||[])
    .filter(e=>e.kind===SALARY_PART_KIND && e.month===ym && e.employeeId===empId && !isArchived(e))
    .forEach(e=>list.push({id:e.id, date:e.date, amount:Number(e.amount)||0, account:e.account, bankName:e.bankName, via:'دفعة راتب'}));
  return list.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
}
function salaryPaidForEmp(data, empId, ym, net){
  const list = salaryPaymentsForEmp(data, empId, ym, net);
  if(list.some(x=>x.legacy)) return net;
  return list.reduce((s,x)=>s+x.amount,0);
}
// قائمة الشهور المصروفة فعلاً من بداية السلفة حتى شهر معيّن، مرتّبة
function paidMonthsForAdvance(a, data, upToYM){
  const start = a.startMonth || monthKey(a.date);
  const set = new Set();
  // القسط يُعدّ مخصومًا فقط في شهر صُرف فيه راتب صاحب السلفة نفسه (لا راتب موظف آخر)
  const runCovers = (run)=> !Array.isArray(run.lines) || run.lines.some(l=>l && l.employeeId===a.employeeId);
  (data.officeExpenses||[]).forEach(e=>{
    if(isArchived(e) || !e.month) return;
    if(e.kind==='رواتب' ? runCovers(e) : (e.kind===SALARY_PART_KIND && e.employeeId===a.employeeId)) set.add(e.month);
  });
  (data.treasury||[]).forEach(t=>{ if(!isArchived(t) && t.kind==='رواتب' && t.month && runCovers(t)) set.add(t.month); });
  return [...set].filter(mm=> mm>=start && (!upToYM || mm<=upToYM)).sort();
}
// القسط المعروض في كشف شهر ym: يُحسب حسب ترتيب هذا الشهر بين (الشهور المصروفة فعلاً + شهر العرض الحالي)
// فيظهر القسط الصحيح عند عرض/صرف الشهر الحالي، ويبقى المتبقّي مرتبطاً بالصرف الفعلي للشهور السابقة
function installmentForMonth(a, ym, data){
  if(!a || a.type!=='سلفة' || a.mode!=='مقسّط') return 0;
  const total = Number(a.amount)||0;
  const monthly = Number(a.monthlyInstallment)||0;
  if(total<=0 || monthly<=0) return 0;
  const start = a.startMonth || monthKey(a.date);
  if(ym < start) return 0;                                   // قبل بداية الخطة
  // الشهور المصروفة فعلاً قبل هذا الشهر (حصراً) + هذا الشهر نفسه (المعروض/الجاري صرفه)
  const paidBefore = paidMonthsForAdvance(a, data, ym).filter(mm=>mm<ym);
  const order = paidBefore.length;                           // عدد الأقساط المخصومة فعلاً قبله
  const already = monthly*order;
  if(already >= total) return 0;                             // سُدّدت بالكامل قبل هذا الشهر
  return Math.min(monthly, total - already);                 // قسط هذا الشهر (آخر قسط قد يكون أصغر)
}
// المتبقّي = الإجمالي − مجموع الأقساط المخصومة في الشهور المصروفة فعلاً
function advanceRemaining(a, data){
  if(!a || a.type!=='سلفة' || a.mode!=='مقسّط') return 0;
  const total = Number(a.amount)||0;
  const paidMonths = paidMonthsForAdvance(a, data, null);
  const paid = Math.min(total, (Number(a.monthlyInstallment)||0)*paidMonths.length);
  return Math.max(0, total - paid);
}

/* ================= حساب الرواتب لشهر محدد (يُستخدم في الكشف والتقارير) ================= */
/* ==== سجل المرتب: كل شهر يتحسب بالمرتب اللي كان ساري فيه ====
   emp.salaryHistory = [{from:'YYYY-MM', baseSalary, grossSalary}] — بدون سجل = المرتب الحالي لكل الشهور (القديم). */
function salaryFor(emp, ym){
  const cur = {base:Number(emp&&emp.baseSalary)||0, gross:Number(emp&&emp.grossSalary)>0 ? Number(emp.grossSalary) : (Number(emp&&emp.baseSalary)||0)};
  const h = (emp && Array.isArray(emp.salaryHistory)) ? emp.salaryHistory : [];
  if(!h.length || !ym) return cur;
  const sorted = [...h].sort((a,b)=>(a.from||'').localeCompare(b.from||''));
  let hit = null; for(const x of sorted){ if((x.from||'') <= ym) hit = x; }
  if(!hit) hit = sorted[0];
  const base = Number(hit.baseSalary)||0;
  return {base, gross: Number(hit.grossSalary)>0 ? Number(hit.grossSalary) : base};
}
// يبني سجل المرتب عند تغيير المرتب: القديم يفضل للشهور قبل fromYM، والجديد من fromYM
function withSalaryChange(before, after, fromYM){
  const oldEntry = {from:'0000-00', baseSalary:Number(before.baseSalary)||0, grossSalary:Number(before.grossSalary)||0};
  let h = (Array.isArray(before.salaryHistory) && before.salaryHistory.length) ? [...before.salaryHistory] : [oldEntry];
  h = h.filter(x=>(x.from||'') < fromYM);
  if(!h.length) h = [oldEntry];
  h.push({from:fromYM, baseSalary:Number(after.baseSalary)||0, grossSalary:Number(after.grossSalary)||0});
  return h.sort((a,b)=>(a.from||'').localeCompare(b.from||''));
}
// الموظف داخل كشف شهر ym: من شهر تعيينه، وحتى شهر أرشفته (المؤرشف بلا تاريخ أرشفة يُستبعد)
function empActiveInMonth(emp, ym){
  if(!emp) return false;
  if(emp.hireDate && emp.hireDate.slice(0,7) > ym) return false;
  if(isArchived(emp)){ if(!emp.archivedAt) return false; if(emp.archivedAt.slice(0,7) < ym) return false; }
  return true;
}
// نسبة أول شهر: عدد الأيام من يوم التعيين حتى آخر الشهر ÷ أيام الشهر
function hireProration(emp, ym){
  if(!emp || !emp.hireDate || emp.hireDate.slice(0,7)!==ym) return {factor:1, days:null};
  const [y,m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const day = parseInt(emp.hireDate.slice(8,10),10) || 1;
  const days = Math.max(0, dim - day + 1);
  return {factor: days/dim, days, dim};
}
function computePayroll(data, ym){
  const rows = (data.employees||[]).filter(emp=>empActiveInMonth(emp, ym)).map(emp=>{
    const pr = hireProration(emp, ym);
    const attMap = data.attendance[emp.id] || {};
    const absentDays = Object.entries(attMap).filter(([d,s])=> d.startsWith(ym) && s==='absent').length;
    const sal = salaryFor(emp, ym);                         // المرتب الساري في هذا الشهر
    const fullGross = sal.gross;                            // القديم: الإجمالي = الأساسي
    const gross = Math.round(fullGross*pr.factor*100)/100;   // أول شهر بعدد الأيام الفعلية
    const dailyRate = sal.base/30;                          // خصم الغياب على الأساسي (وفق القانون)
    const absenceDeduction = absentDays*dailyRate;
    const ot = data.overtime.filter(o=>o.employeeId===emp.id && monthKey(o.date)===ym)
      .reduce((s,o)=>s+(o.hours||0)*(o.rate||0),0);
    // السلف: المقطوعة (والقديمة بلا mode) تُخصم كاملة في شهرها؛ المقسّطة تُخصم كقسط
    const empAdvances = data.advances.filter(a=>a.employeeId===emp.id && a.type==='سلفة');
    const advances = empAdvances
      .filter(a=> a.mode!=='مقسّط' && monthKey(a.date)===ym)
      .reduce((s,a)=>s+(Number(a.amount)||0),0);
    const installments = empAdvances
      .reduce((s,a)=>s+installmentForMonth(a, ym, data),0);
    const deductions = data.advances.filter(a=>a.employeeId===emp.id && a.type==='خصم' && monthKey(a.date)===ym)
      .reduce((s,a)=>s+(Number(a.amount)||0),0);
    const net = gross - absenceDeduction + ot - advances - deductions - installments;   // الصافي يبدأ من الإجمالي
    // تكلفة الراتب على المكتب: قبل استقطاع السلف وأقساطها (السلفة ذمة على الموظف وليست تخفيضًا للمصروف)
    const cost = gross - absenceDeduction + ot - deductions;
    return {emp, base:sal.base, gross, fullGross, prorateDays:pr.days, prorateDim:pr.dim, absentDays, absenceDeduction, ot, advances, installments, deductions, net, cost};
  });
  return {rows, totalNet: rows.reduce((s,r)=>s+r.net,0), totalCost: rows.reduce((s,r)=>s+r.cost,0)};
}

/* ================= تتبّع الوقت: تكلفة ساعة المهندس وتكلفة وقت المشروع ================= */
const WORK_HOURS_PER_DAY = 10;
// تكلفة الساعة = (الراتب الأساسي ÷ 30 يوم) ÷ 8 ساعات — الشهر 30 يوماً ثابتة
const hourlyRate = (emp, ym)=>{
  if(!emp) return 0;
  const base = ym ? salaryFor(emp, ym).base : (Number(emp.baseSalary)||0);
  return (base/30)/WORK_HOURS_PER_DAY;
};
const empById = (data, id)=> (data.employees||[]).find(e=>e.id===id);
// إجمالي تكلفة وقت المهندسين على مشروع معيّن (ساعات × تكلفة ساعة كل مهندس)
function projectTimeCost(data, pid){
  return (data.timesheets||[])
    .filter(t=> t.projectId===pid && !isArchived(t))
    .reduce((s,t)=> s + (Number(t.hours)||0) * hourlyRate(empById(data, t.employeeId), monthKey(t.date)), 0);
}
function projectTimeHours(data, pid){
  return (data.timesheets||[])
    .filter(t=> t.projectId===pid && !isArchived(t))
    .reduce((s,t)=> s + (Number(t.hours)||0), 0);
}

/* ================= رصيد الإجازات السنوي (30 يوماً وفق قانون العمل الإماراتي) ================= */
const ANNUAL_LEAVE = 30;
function computeLeaveBalance(data, empId, year){
  const y = year || String(new Date().getFullYear());
  const used = (data.leaves||[])
    .filter(l=>l.employeeId===empId && l.type==='سنوية' && (l.fromDate||'').startsWith(y))
    .reduce((s,l)=>s+(Number(l.days)||0),0);
  return {entitled:ANNUAL_LEAVE, used, remaining:ANNUAL_LEAVE-used};
}

/* ================= مكافأة نهاية الخدمة (تقديري وفق قانون العمل الإماراتي) ================= */
function computeGratuity(emp){
  if(!emp.hireDate) return {years:0, amount:0};
  const years = Math.max(0, (new Date() - new Date(emp.hireDate)) / (365.25*86400000));
  const daily = emp.baseSalary/30;
  let amount = 0;
  if(years < 1){ amount = 0; }
  else if(years <= 5){ amount = daily*21*years; }
  else { amount = daily*21*5 + daily*30*(years-5); }
  return {years, amount};
}

/* ================= حركات النقدية (خزينة + بنك) ================= */
function computeCashFlows(data){
  const flows = [];
  const projName = (id)=>{ const p=data.projects.find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : ''; };
  data.payments.forEach(p=>{
    const col = collectedOf(p);
    if(col<=0) return;
    const acc = p.account || (p.method==='نقداً' ? 'الخزينة' : 'البنك');
    const item = (p.phase==='إشراف' ? ('إشراف '+(p.month?fmtMonth(p.month):'')) : (p.label||'دفعة')) + (p.status==='مدفوعة جزئياً' ? ' (جزئية)' : '');
    flows.push({date:p.paidDate||p.date, desc:'قبض — '+projName(p.projectId)+' — '+item, inAmt:col*grossFactor(p), outAmt:0, account:acc, src:'دفعات استشارية'});
  });
  data.govFees.forEach(g=>{
    if(isArchived(g) || g.payerType==='المالك مباشرة') return;
    const acc = g.account||'البنك';
    if(g.paidStatus==='مدفوع') flows.push({date:g.date, desc:'رسوم حكومية — '+g.department+' — '+projName(g.projectId), inAmt:0, outAmt:g.amount, account:acc, src:'أمانات'});
    if(g.reimburseStatus==='مسترد') flows.push({date:g.date, desc:'استرداد رسوم من المالك — '+projName(g.projectId), inAmt:g.amount, outAmt:0, account:acc, src:'أمانات'});
  });
  // الشيك الصادر من حساب المكتب: يُخصم من البنك في تاريخ صرفه المتوقع؛ قبله يظهر «شيكات صادرة لم تُصرف»
  const today = todayISO();
  const chequeAcc = (e)=> (e.chequeDueDate && e.chequeDueDate > today) ? 'شيكات صادرة' : 'البنك';
  const chequeDate = (e)=> e.chequeDueDate || e.date;
  data.officeExpenses.forEach(e=>{
    if(e.payStatus==='معلق') return;                          // معلق لم يُدفع بعد
    if(isArchived(e)) return;
    if(isDebtExpense(e)){                                     // مدفوع من بنك غير WIO NITAQ → دين على المكتب، لا يُخصم من WIO
      flows.push({date:e.date, desc:'مصروف مكتب (تمويل خارجي) — '+e.category+(e.bankName?' — '+e.bankName:''), inAmt:0, outAmt:expGross(e), account:'دين على المكتب', src:'دين علينا'});
    } else {
      if(e.account==='شيك') flows.push({date:chequeDate(e), desc:'شيك صادر '+(e.chequeNo||'')+' — مصروف مكتب — '+e.category, inAmt:0, outAmt:expGross(e), account:chequeAcc(e), src:'مصروفات'});
      else flows.push({date:e.date, desc:'مصروف مكتب — '+e.category, inAmt:0, outAmt:expGross(e), account:e.account||'البنك', src:'مصروفات'});
    }
  });
  data.projectCosts.forEach(e=>{
    if(isArchived(e)) return;
    if(isDebtExpense(e)){
      flows.push({date:e.date, desc:'تكلفة مشروع (تمويل خارجي) — '+e.category+' — '+projName(e.projectId)+(e.bankName?' — '+e.bankName:''), inAmt:0, outAmt:expGross(e), account:'دين على المكتب', src:'دين علينا'});
    } else {
      if(e.account==='شيك') flows.push({date:chequeDate(e), desc:'شيك صادر '+(e.chequeNo||'')+' — تكلفة مشروع — '+e.category+' — '+projName(e.projectId), inAmt:0, outAmt:expGross(e), account:chequeAcc(e), src:'مصروفات'});
      else flows.push({date:e.date, desc:'تكلفة مشروع — '+e.category+' — '+projName(e.projectId), inAmt:0, outAmt:expGross(e), account:e.account||'البنك', src:'مصروفات'});
    }
  });
  data.treasury.forEach(t=>{
    if(isArchived(t)) return;
    if(t.type==='قبض') flows.push({date:t.date, desc:t.note||'قبض يدوي', inAmt:t.amount, outAmt:0, account:t.account, src:'يدوي'});
    else if(t.type==='صرف') flows.push({date:t.date, desc:t.note||'صرف يدوي', inAmt:0, outAmt:t.amount, account:t.account, src:'يدوي'});
    else if(t.type==='تحويل'){
      flows.push({date:t.date, desc:'تحويل إلى '+(t.toAccount||''), inAmt:0, outAmt:t.amount, account:t.account, src:'تحويل'});
      flows.push({date:t.date, desc:'تحويل من '+t.account, inAmt:t.amount, outAmt:0, account:t.toAccount||'البنك', src:'تحويل'});
    }
  });
  // السلف: صرف فعلي للموظف من الحساب المحدد (القديمة بلا حساب = الخزينة). الخصم من الراتب يقلّل قيد الرواتب لاحقاً.
  (data.advances||[]).forEach(a=>{
    if(isArchived(a) || a.type!=='سلفة' || !(Number(a.amount)>0)) return;
    const emp = (data.employees||[]).find(x=>x.id===a.employeeId);
    flows.push({date:a.date, desc:'سلفة موظف — '+(emp?emp.name:'')+(a.mode==='مقسّط'?' (مقسّطة)':''), inAmt:0, outAmt:Number(a.amount), account:a.account||'الخزينة', src:'سلف'});
  });
  (data.otherIncome||[]).forEach(r=>{
    if(isArchived(r)) return;
    flows.push({date:r.date, desc:'إيراد آخر — '+(r.category||'')+(r.payer?' — '+r.payer:''), inAmt:incGross(r), outAmt:0, account:r.account||'البنك', src:'إيرادات أخرى'});
  });
  flows.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const bal = (acc)=> flows.filter(f=>f.account===acc).reduce((s,f)=>s+f.inAmt-f.outAmt,0);
  return {flows, bank:bal('البنك'), cash:bal('الخزينة'), debt:bal('دين على المكتب'), pendingCheques:-bal('شيكات صادرة')};
}

/* ================= Treasury View (الخزينة والبنك) ================= */
/* ================= الإيرادات الأخرى (غير التشغيلية) ================= */
function OtherIncomeView({data, configs, mutate}){
  const [catFilter, setCatFilter] = useState('');
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const m = mutate('otherIncome');

  let records = (data.otherIncome||[]);
  if(catFilter) records = records.filter(r=>r.category===catFilter);
  if(dFrom) records = records.filter(r=>(r.date||'')>=dFrom);
  if(dTo) records = records.filter(r=>(r.date||'')<=dTo);

  const active = records.filter(r=>!isArchived(r));
  const totNet   = active.reduce((s,r)=>s+(r.amount||0),0);
  const totVat   = active.reduce((s,r)=>s+incVat(r),0);
  const totGross = active.reduce((s,r)=>s+incGross(r),0);
  const taxableNet = active.filter(r=>incVatRate(r)>0).reduce((s,r)=>s+(r.amount||0),0);
  const catOpts = [...new Set((data.otherIncome||[]).map(r=>(r.category||'').trim()).filter(Boolean))].sort();
  const anyFilter = catFilter||dFrom||dTo;

  return (
    <div>
      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', marginBottom:14}}>
        <div className="card"><div className="kpi-label">إجمالي الإيرادات الأخرى{anyFilter?' (مفلتر)':''}</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(totNet)}</div><div className="kpi-note">{active.length} بند — قبل الضريبة</div></div>
        <div className="card"><div className="kpi-label">شامل الضريبة</div><div className="kpi-value" style={{color:'var(--ink)'}}>{money(totGross)}</div><div className="kpi-note">ما دخل الحساب فعلاً</div></div>
        <div className="card"><div className="kpi-label">ضريبة المخرجات</div><div className="kpi-value" style={{color:'var(--brass)'}}>{money(totVat)}</div><div className="kpi-note">على البنود الخاضعة ({money(taxableNet)})</div></div>
      </div>
      <p style={{fontSize:12, color:'var(--ink-faint)', marginBottom:14}}>* الإيرادات الأخرى هي الدخل غير التشغيلي (بيع أصول، إيجار فرعي، عمولات، استرداد…) — تدخل رصيد الحساب المحدد وتُحتسب في الإيراد الكلي، وتخضع لضريبة المخرجات إن اختُيرت "خاضعة". تظهر منفصلة عن إيراد المشاريع للحفاظ على وضوح ربحية النشاط الأساسي.</p>
      <EntityView config={configs.otherIncome} records={records} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del}
        headExtra={
          <>
            {catOpts.length>0 && (
              <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
                style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
                <option value="">كل المصادر</option>
                {catOpts.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
            <input type="date" value={dFrom} onChange={e=>setDFrom(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', fontSize:12.5, background:'#fff'}} />
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
            <input type="date" value={dTo} onChange={e=>setDTo(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', fontSize:12.5, background:'#fff'}} />
            {anyFilter && <button className="btn outline" style={{padding:'5px 12px', fontSize:12}} onClick={()=>{setCatFilter('');setDFrom('');setDTo('');}}>مسح الفلاتر</button>}
          </>
        }
      />
    </div>
  );
}

function TreasuryView({data, configs, mutate}){
  const m = mutate('treasury');
  const {flows, bank, cash, debt, pendingCheques} = computeCashFlows(data);

  /* --- فلاتر الحركات --- */
  const [fAcct, setFAcct] = useState('');     // البنك / الخزينة
  const [fType, setFType] = useState('');     // وارد / صادر
  const [fSrc, setFSrc]  = useState('');      // مصدر الحركة
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo]   = useState('');
  const sources = useMemo(()=> [...new Set(flows.map(f=>f.src))], [flows]);

  const shown = useMemo(()=> flows.filter(f=>{
    if(fAcct && f.account!==fAcct) return false;
    if(fType==='in'  && !(f.inAmt>0)) return false;
    if(fType==='out' && !(f.outAmt>0)) return false;
    if(fSrc && f.src!==fSrc) return false;
    if(fFrom && (f.date||'') < fFrom) return false;
    if(fTo && (f.date||'') > fTo) return false;
    return true;
  }), [flows, fAcct, fType, fSrc, fFrom, fTo]);

  const shownIn  = shown.reduce((s,f)=>s+f.inAmt,0);
  const shownOut = shown.reduce((s,f)=>s+f.outAmt,0);
  const anyF = fAcct||fType||fSrc||fFrom||fTo;
  const resetF = ()=>{ setFAcct(''); setFType(''); setFSrc(''); setFFrom(''); setFTo(''); };

  /* --- مطابقة رصيد البنك --- */
  const [recAcct, setRecAcct] = useState('البنك');
  const [recDate, setRecDate] = useState(todayISO());
  const [recActual, setRecActual] = useState('');
  // رصيد النظام المحسوب للحساب المختار حتى تاريخ الكشف (شامله)
  const sysBalAt = useMemo(()=>{
    return flows.filter(f=> f.account===recAcct && (f.date||'') <= recDate)
                .reduce((s,f)=>s+f.inAmt-f.outAmt, 0);
  }, [flows, recAcct, recDate]);
  const actualNum = parseFloat(recActual);
  const hasActual = recActual!=='' && !isNaN(actualNum);
  const diff = hasActual ? (actualNum - sysBalAt) : 0;
  const matched = hasActual && Math.abs(diff) < 0.01;
  // حركات الحساب حوالين تاريخ الكشف للمراجعة (آخر 15 حتى التاريخ)
  const recFlows = useMemo(()=> flows
    .filter(f=> f.account===recAcct && (f.date||'') <= recDate)
    .slice(0, 15), [flows, recAcct, recDate]);

  const selEl = {border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'};

  return (
    <div>
      <div className="grid grid-4" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">رصيد البنك (WIO NITAQ)</div><div className="kpi-value" style={{color:bank>=0?'var(--ink)':'var(--rust)'}}>{money(bank)}</div><div className="kpi-note">محسوب من حركات الحساب فقط</div></div>
        <div className="card"><div className="kpi-label">رصيد الخزينة (نقدي)</div><div className="kpi-value" style={{color:cash>=0?'var(--ink)':'var(--rust)'}}>{money(cash)}</div><div className="kpi-note">الدفعات النقدية والمصروفات النثرية</div></div>
        <div className="card"><div className="kpi-label">إجمالي السيولة</div><div className="kpi-value" style={{color:'var(--brass)'}}>{money(bank+cash)}</div><div className="kpi-note">بنك + خزينة (لا يشمل الدين)</div></div>
        <div className="card"><div className="kpi-label">دين على المكتب</div><div className="kpi-value" style={{color:debt<0?'var(--rust)':'var(--ink)'}}>{money(Math.abs(debt))}</div><div className="kpi-note">مصروفات مموّلة من بنك غير WIO NITAQ</div></div>
      </div>
      {pendingCheques>0.009 && (
        <div className="card" style={{marginTop:-8, marginBottom:18, padding:'10px 14px', fontSize:13, borderInlineStart:'3px solid var(--brass)'}}>
          🧾 <b>شيكات صادرة لم تُصرف بعد: {money(pendingCheques)}</b> — ستُخصم من البنك في تواريخ صرفها المتوقعة. الرصيد المتاح فعلياً بعدها: <b>{money(bank - pendingCheques)}</b>
        </div>
      )}

      {/* --- مطابقة رصيد البنك --- */}
      <div className="section-title"><h3 style={{fontSize:13.5}}>مطابقة رصيد البنك — قارن رصيد النظام بكشف الحساب الفعلي</h3><div className="rule"></div></div>
      <div className="card" style={{marginBottom:24}}>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:14}}>
          <div className="field" style={{minWidth:130}}>
            <label>الحساب</label>
            <select value={recAcct} onChange={e=>setRecAcct(e.target.value)} style={selEl}>
              <option>البنك</option><option>الخزينة</option><option>دين على المكتب</option>
            </select>
          </div>
          <div className="field" style={{minWidth:150}}>
            <label>تاريخ كشف الحساب</label>
            <input type="date" value={recDate} onChange={e=>setRecDate(e.target.value)} style={selEl} />
          </div>
          <div className="field" style={{minWidth:170}}>
            <label>الرصيد الفعلي في الكشف (د.إ)</label>
            <input type="number" value={recActual} onChange={e=>setRecActual(e.target.value)} placeholder="اكتب الرصيد كما في البنك" style={selEl} />
          </div>
        </div>
        <div className="grid grid-3">
          <div className="card" style={{background:'var(--paper)'}}>
            <div className="kpi-label">رصيد النظام حتى {recDate}</div>
            <div className="kpi-value" style={{fontSize:18}}>{money(sysBalAt)}</div>
            <div className="kpi-note">محسوب من الحركات المسجّلة</div>
          </div>
          <div className="card" style={{background:'var(--paper)'}}>
            <div className="kpi-label">الرصيد الفعلي</div>
            <div className="kpi-value" style={{fontSize:18}}>{hasActual?money(actualNum):'—'}</div>
            <div className="kpi-note">من كشف الحساب البنكي</div>
          </div>
          <div className="card" style={{background: !hasActual?'var(--paper)':matched?'var(--teal-soft)':'var(--rust-soft)', borderColor: !hasActual?'var(--line)':matched?'var(--teal)':'var(--rust)'}}>
            <div className="kpi-label">الفرق</div>
            <div className="kpi-value" style={{fontSize:18, color: !hasActual?'var(--ink-faint)':matched?'var(--teal)':'var(--rust)'}}>
              {hasActual ? (matched ? 'مطابق ✓' : money(Math.abs(diff))) : '—'}
            </div>
            <div className="kpi-note">{hasActual && !matched ? (diff>0 ? 'البنك أعلى — حركة وارد ناقصة في النظام' : 'البنك أقل — حركة صادر ناقصة في النظام') : 'النظام = الكشف'}</div>
          </div>
        </div>
        {hasActual && !matched && (
          <div style={{marginTop:14}}>
            <p style={{fontSize:12.5, color:'var(--ink-soft)', marginBottom:8}}>
              راجع آخر حركات {recAcct} حتى {recDate} لاكتشاف المفقود — ثم سجّل الحركة الناقصة من "إضافة حركة" أدناه، وسيختفي الفرق تلقائياً:
            </p>
            <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>التاريخ</th><th>البيان</th><th>المصدر</th><th>وارد</th><th>صادر</th></tr></thead>
              <tbody>
                {recFlows.length===0 && <tr className="empty-row"><td colSpan={5}>لا حركات على هذا الحساب حتى التاريخ</td></tr>}
                {recFlows.map((f,i)=>(
                  <tr key={i}>
                    <td>{f.date}</td><td style={{fontSize:12}}>{f.desc}</td>
                    <td><span className="badge gray">{f.src}</span></td>
                    <td style={{color:'var(--teal)'}}>{f.inAmt?money(f.inAmt):''}</td>
                    <td style={{color:'var(--rust)'}}>{f.outAmt?money(f.outAmt):''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
        <p style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:12, marginBottom:0}}>* هذه أداة مقارنة واكتشاف فقط — لا تعدّل أي رصيد تلقائياً. أي تصحيح يتم بتسجيل حركة يدوية أدناه ليبقى له أثر واضح.</p>
      </div>

      {/* --- جدول الحركات مع الفلاتر --- */}
      <div className="section-title"><h3 style={{fontSize:13.5}}>الحركات (تلقائي من الدفعات والرسوم والمصروفات + الحركات اليدوية)</h3><div className="rule"></div></div>
      <div className="toolbar" style={{flexWrap:'wrap', gap:10}}>
        <select value={fAcct} onChange={e=>setFAcct(e.target.value)} style={selEl}>
          <option value="">كل الحسابات</option><option value="البنك">البنك</option><option value="الخزينة">الخزينة</option><option value="دين على المكتب">دين على المكتب</option>
        </select>
        <select value={fType} onChange={e=>setFType(e.target.value)} style={selEl}>
          <option value="">وارد وصادر</option><option value="in">وارد فقط</option><option value="out">صادر فقط</option>
        </select>
        <select value={fSrc} onChange={e=>setFSrc(e.target.value)} style={selEl}>
          <option value="">كل المصادر</option>
          {sources.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
        <input type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)} style={selEl} />
        <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
        <input type="date" value={fTo} onChange={e=>setFTo(e.target.value)} style={selEl} />
        {anyF && <button className="btn ghost small" onClick={resetF}>مسح الفلاتر</button>}
      </div>
      <div className="card" style={{padding:0, marginBottom:24}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>التاريخ</th><th>البيان</th><th>المصدر</th><th>الحساب</th><th>وارد</th><th>صادر</th></tr></thead>
          <tbody>
            {shown.length===0 && <tr className="empty-row"><td colSpan={6}>لا توجد حركات مطابقة</td></tr>}
            {shown.slice(0,100).map((f,i)=>(
              <tr key={i}>
                <td>{f.date}</td>
                <td>{f.desc}</td>
                <td><span className="badge gray">{f.src}</span></td>
                <td>{f.account}</td>
                <td style={{color:'var(--teal)'}}>{f.inAmt?money(f.inAmt):''}</td>
                <td style={{color:'var(--rust)'}}>{f.outAmt?money(f.outAmt):''}</td>
              </tr>
            ))}
          </tbody>
          {shown.length>0 && (
            <tfoot>
              <tr style={{fontWeight:800, background:'rgba(19,42,70,.04)'}}>
                <td colSpan={4}>الإجمالي المعروض ({shown.length} حركة{shown.length>100?' — يُعرض أول 100':''})</td>
                <td style={{color:'var(--teal)'}}>{money(shownIn)}</td>
                <td style={{color:'var(--rust)'}}>{money(shownOut)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      <EntityView config={configs.treasury} records={data.treasury} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del} />
      <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:14}}>* المقبوضات تشمل الضريبة (5%) لأنها ما يدخل الحساب فعلياً، والمصروفات تُخصم شاملة الضريبة كذلك. الرسوم الحكومية تُخصم من الحساب المحدد عند سدادها للدائرة وتُعاد إليه عند استردادها من المالك.</p>
    </div>
  );
}

/* ================= Dues View (الذمم — مدينون ودائنون) ================= */
function DuesView({data}){
  const receivables = data.projects.map(p=>{
    const duePays = data.payments.filter(i=>!isArchived(i) && i.projectId===p.id).reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
    const feesOut = data.govFees.filter(g=>g.projectId===p.id && !isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+(isArchived(g)?0:g.amount),0);
    return {...p, duePays, feesOut, total:duePays+feesOut};
  }).filter(r=>r.total>0).sort((a,b)=>b.total-a.total);
  const totalRecv = receivables.reduce((s,r)=>s+r.total,0);

  const unpaidFees = data.govFees.filter(g=>!isArchived(g) && g.payerType!=='المالك مباشرة' && g.paidStatus!=='مدفوع');
  const feesByDept = {};
  unpaidFees.forEach(g=>{ feesByDept[g.department] = (feesByDept[g.department]||0) + g.amount; });

  const quarters = listQuarters();
  const doneQuarters = quarters.filter(q=> quarterEndDate(q) < todayISO());
  const lastQ = doneQuarters[doneQuarters.length-1];
  let vatDue = 0;
  if(lastQ){
    const ms = quarterMonths(lastQ);
    const outV = data.payments.filter(i=>!isArchived(i) && i.status!=='ملغاة' && ms.includes(monthKey(i.date))).reduce((s,i)=>s+billedVatOf(i),0)
      + (data.otherIncome||[]).filter(r=>!isArchived(r) && ms.includes(monthKey(r.date))).reduce((s,r)=>s+incVat(r),0);
    const inV = [...data.officeExpenses, ...data.projectCosts].filter(e=>!isArchived(e) && ms.includes(monthKey(e.date))).reduce((s,e)=>s+(e.amount||0)*expVatRate(e),0);   // نفس حساب الإقرار الضريبي
    vatDue = outV - inV;
  }
  const totalPay = Object.values(feesByDept).reduce((s,v)=>s+v,0) + Math.max(0,vatDue);

  return (
    <div>
      <div className="grid grid-3" style={{marginBottom:18}}>
        <div className="card"><div className="kpi-label">مدينون — مستحق لك</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(totalRecv)}</div><div className="kpi-note">دفعات غير محصلة + أمانات لم تُسترد</div></div>
        <div className="card"><div className="kpi-label">دائنون — مستحق عليك</div><div className="kpi-value" style={{color:'var(--rust)'}}>{money(totalPay)}</div><div className="kpi-note">رسوم للدوائر + ضريبة مستحقة</div></div>
        <div className="card"><div className="kpi-label">صافي المركز</div><div className="kpi-value" style={{color:(totalRecv-totalPay)>=0?'var(--teal)':'var(--rust)'}}>{money(totalRecv-totalPay)}</div><div className="kpi-note">مدينون − دائنون</div></div>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>أعمار الذمم المدينة — حسب تاريخ الاستحقاق</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:24}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>المالك</th><th>المشروع</th><th>البند</th><th>المبلغ المتبقي</th><th>الاستحقاق</th><th>العمر</th></tr></thead>
          <tbody>
            {(()=>{
              const rows = data.payments.filter(i=>remainderOf(i)>0 && i.dueDate).map(i=>{
                const p = data.projects.find(x=>x.id===i.projectId)||{};
                const age = -(daysUntil(i.dueDate)||0);
                const bucket = age<=0 ? 'لم يستحق بعد' : age<=30 ? '0-30 يوم' : age<=60 ? '31-60 يوم' : age<=90 ? '61-90 يوم' : 'أكثر من 90 يوم';
                const cls = age<=0 ? 'gray' : age<=30 ? 'ok' : age<=60 ? 'soon' : 'bad';
                return {i, p, age, bucket, cls};
              }).sort((a,b)=>b.age-a.age);
              if(rows.length===0) return <tr className="empty-row"><td colSpan={6}>لا توجد ذمم مستحقة</td></tr>;
              return rows.map(({i,p,age,bucket,cls})=>(
                <tr key={i.id}>
                  <td>{p.owner||'—'}</td>
                  <td>{(p.projectNo?p.projectNo+' — ':'')+(p.name||'')}</td>
                  <td>{i.phase==='إشراف' ? ('إشراف '+(i.month?fmtMonth(i.month):'')) : (i.label||'—')}</td>
                  <td style={{fontWeight:700}}>{money(remainderOf(i)*grossFactor(i))}</td>
                  <td>{i.dueDate}</td>
                  <td><span className={"badge "+cls}>{bucket}{age>0?' ('+age+' يوم)':''}</span></td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
        </div>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>مدينون — من يدين لك (حسب المالك / المشروع)</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0, marginBottom:24}}>
        <table>
          <thead><tr><th>المشروع</th><th>المالك</th><th>دفعات مستحقة (شاملة الضريبة)</th><th>أمانات لم تُسترد</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {receivables.length===0 && <tr className="empty-row"><td colSpan={5}>لا توجد ذمم مدينة — كل المستحقات محصلة</td></tr>}
            {receivables.map(r=>(
              <tr key={r.id}>
                <td>{(r.projectNo?r.projectNo+' — ':'')+r.name}</td>
                <td>{r.owner||'—'}</td>
                <td>{money(r.duePays)}</td>
                <td>{money(r.feesOut)}</td>
                <td style={{fontWeight:800}}>{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title"><h3 style={{fontSize:13.5}}>دائنون — ما يستحق عليك</h3><div className="rule"></div></div>
      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>الجهة</th><th>البيان</th><th>المبلغ</th><th>الاستحقاق</th></tr></thead>
          <tbody>
            {Object.keys(feesByDept).length===0 && vatDue<=0 && <tr className="empty-row"><td colSpan={4}>لا توجد التزامات معلقة</td></tr>}
            {Object.entries(feesByDept).map(([dept,amt])=>(
              <tr key={dept}><td>{dept}</td><td>رسوم حكومية غير مسددة</td><td style={{fontWeight:700}}>{money(amt)}</td><td>—</td></tr>
            ))}
            {lastQ && vatDue>0 && (
              <tr><td>الهيئة الاتحادية للضرائب</td><td>إقرار ض.ق.م — فترة {quarterLabel(lastQ)}</td><td style={{fontWeight:700}}>{money(vatDue)}</td><td>{quarterDueDate(lastQ)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Receipt Doc (إيصال استلام دفعة — النموذج الرسمي) ================= */
function Chk({on, ar, en}){
  return (
    <span className="rcpt-check">
      <span className="box">{on ? '✓' : ''}</span>
      <span>{ar}</span><span className="en">{en}</span>
    </span>
  );
}
function ReceiptDoc({payment, project, onBack}){
  if(payment.docSnapshot){
    const s = payment.docSnapshot;
    project = {...(project||{}), name:s.projectName, owner:s.owner, ownerTrn:s.ownerTrn, additionalOwners:s.additionalOwners||[], plotNumber:s.plotNumber, projectNo:s.projectNo};
  }
  const base = collectedOf(payment);
  const rate = vatRateOf(payment);
  const vat = base*rate;
  const total = base*(1+rate);
  const remaining = remainderOf(payment)*(1+rate);
  const instLabel = payment.phase==='إشراف' ? ('إشراف '+(payment.month?fmtMonth(payment.month):'')) : (payment.label||'');
  const projLine = project ? (project.name + (project.plotNumber ? ' — قطعة رقم '+project.plotNumber : '') + (project.projectNo ? ' · مشروع '+project.projectNo : '')) : '—';

  const Copy = ()=>(
    <div className="rcpt rcpt-a5" style={isArchived(payment)?{opacity:.75}:{}}>
      <div className="rcpt-band">
        <div className="rcpt-logo">
          <img src={NITAQ_LOGO} alt="نطاق NITAQ" style={{height:74, display:'block'}} />
        </div>
        <div className="rcpt-cotitle">
          <div className="ar">نطاق للاستشارات الهندسية</div>
          <div className="en">NITAQ <b>◆</b> ENGINEERING CONSULTANTS</div>
        </div>
      </div>
      <div className="rcpt-gold"></div>
      <div className="rcpt-body">
        <div className="rcpt-wm"><img src={NITAQ_LOGO} alt="" style={{width:340, opacity:.05, filter:'invert(1) brightness(0.2)'}} /></div>

        <div className="rcpt-titlerow">
          <div className="rcpt-meta">
            <div className="row"><span className="lbl">رقم الإيصال</span><span className="val">{payment.receiptNo||'—'}</span><span className="en">Receipt No.</span></div>
            <div className="row"><span className="lbl">التاريخ</span><span className="val">{payment.paidDate||payment.date}</span><span className="en">Date</span></div>
          </div>
          <div className="rcpt-title">
            <div className="ar">إيصال استلام دفعة</div>
            <div className="en">PAYMENT RECEIPT</div>
            <div className="orn">— ◇ —</div>
          </div>
        </div>

        <div className="rcpt-line">
          <span className="lbl">استلمنا من السيّد / السادة</span>
          <span className="val">{project ? (ownersLine(project)||'—') : '—'}</span>
          <span className="en">Received From</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">المشروع — رقم القطعة</span>
          <span className="val">{projLine}</span>
          <span className="en">Project — Plot No.</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">المرحلة / Stage</span>
          <Chk on={payment.phase==='تصميم'} ar="تصميم" en="Design" />
          <Chk on={payment.phase==='إشراف'} ar="إشراف" en="Supervision" />
          <Chk on={payment.phase==='أخرى'} ar="أخرى" en="Other" />
          <span className="lbl" style={{marginInlineStart:18}}>رقم الدفعة</span>
          <span className="val">{instLabel}</span>
          <span className="en">Inst. No.</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">طريقة الدفع / Method</span>
          <Chk on={payment.method==='نقداً'} ar="نقداً" en="Cash" />
          <Chk on={payment.method==='شيك'} ar="شيك" en="Cheque" />
          <Chk on={payment.method==='تحويل بنكي'} ar="تحويل" en="Transfer" />
          <Chk on={payment.method==='بطاقة'} ar="بطاقة" en="Card" />
          <span className="lbl" style={{marginInlineStart:18}}>رقم الشيك / التحويل</span>
          <span className="val">{payment.refNo||'—'}</span>
          <span className="en">Cheque / Ref. No.</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">ملاحظات</span>
          <span className="val" style={{fontWeight:600}}>{payment.note||''}</span>
          <span className="en">Notes</span>
        </div>

        <div className="rcpt-bottom">
          <div className="rcpt-stamp">
            <div>
              <div className="t">ختم وتوقيع المستلم</div>
              <div className="en">Received by · Stamp &amp; Signature</div>
            </div>
            <div className="co">NITAQ ENGINEERING CONSULTANCY</div>
          </div>
          <div className="rcpt-amount">
            <div className="hd"><span>المبلغ المستلم</span><span className="en">Amount Received</span></div>
            <div className="amt">
              <span className="cur">AED</span>
              <span className="num">{fmt(total)}</span>
            </div>
            <div className="words">فقط {tafqeet(total)}</div>
            {payment.status==='مدفوعة جزئياً' && <div className="vatline" style={{color:'var(--rust)', fontWeight:700}}>دفعة جزئية — المتبقي على هذه الدفعة: {money(remaining)}</div>}
          </div>
        </div>
      </div>
      <div className="rcpt-foot">
        <span>SHARJAH · UAE &nbsp;|&nbsp; {COMPANY.phone2} &nbsp;|&nbsp; {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</span>
        <span className="tag">{COMPANY.tagline}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn outline" onClick={onBack}>← رجوع للدفعات</button>
        <button className="btn brass" onClick={()=>window.print()}><I.print/> طباعة الإيصال (نسختين A4)</button>
      </div>
      {isArchived(payment) && (
        <div className="no-print" style={{background:'var(--rust)', color:'#fff', padding:'10px 18px', borderRadius:4, marginBottom:12, fontWeight:800, fontSize:13}}>
          ⚠ هذا السند ملغى{payment.archiveReason ? ' — السبب: '+payment.archiveReason : ''} — لا يُعتد به مالياً
        </div>
      )}
      <div className="rcpt-pair">
        <Copy />
        <div className="rcpt-cutline"><span>✂ خط القص — Cut Here</span></div>
        <Copy />
      </div>
    </div>
  );
}

/* ================= Demand Doc (مطالبة بدفعة مستحقة — نفس تصميم سند القبض) ================= */
function DemandDoc({payment, project, onBack}){
  if(payment.docSnapshot){
    const s = payment.docSnapshot;
    project = {...(project||{}), name:s.projectName, owner:s.owner, ownerTrn:s.ownerTrn, additionalOwners:s.additionalOwners||[], plotNumber:s.plotNumber, projectNo:s.projectNo};
  }
  const base = remainderOf(payment);          // المتبقي غير المحصّل (صافي)
  const rate = vatRateOf(payment);
  const vat = base*rate;
  const total = base*(1+rate);                // المستحق شامل الضريبة
  const overdue = payment.dueDate ? daysSince(payment.dueDate) : null;
  const isLate = overdue!==null && overdue>0;
  const instLabel = payment.phase==='إشراف' ? ('إشراف '+(payment.month?fmtMonth(payment.month):'')) : (payment.label||'');
  const projLine = project ? (project.name + (project.plotNumber ? ' — قطعة رقم '+project.plotNumber : '') + (project.projectNo ? ' · مشروع '+project.projectNo : '')) : '—';

  const Copy = ()=>(
    <div className="rcpt rcpt-a5">
      <div className="rcpt-band">
        <div className="rcpt-logo">
          <img src={NITAQ_LOGO} alt="نطاق NITAQ" style={{height:74, display:'block'}} />
        </div>
        <div className="rcpt-cotitle">
          <div className="ar">نطاق للاستشارات الهندسية</div>
          <div className="en">NITAQ <b>◆</b> ENGINEERING CONSULTANTS</div>
        </div>
      </div>
      <div className="rcpt-gold"></div>
      <div className="rcpt-body">
        <div className="rcpt-wm"><img src={NITAQ_LOGO} alt="" style={{width:340, opacity:.05, filter:'invert(1) brightness(0.2)'}} /></div>

        <div className="rcpt-titlerow">
          <div className="rcpt-meta">
            <div className="row"><span className="lbl">رقم المطالبة</span><span className="val">{payment.demandNo||'—'}</span><span className="en">Demand No.</span></div>
            <div className="row"><span className="lbl">التاريخ</span><span className="val">{todayISO()}</span><span className="en">Date</span></div>
            <div className="row"><span className="lbl">تاريخ الاستحقاق</span><span className="val" style={isLate?{color:'var(--rust)', fontWeight:800}:{}}>{payment.dueDate||'—'}</span><span className="en">Due Date</span></div>
          </div>
          <div className="rcpt-title">
            <div className="ar">مطالبة بدفعة مستحقة</div>
            <div className="en">PAYMENT DEMAND</div>
            <div className="orn">— ◇ —</div>
          </div>
        </div>

        <div className="rcpt-line">
          <span className="lbl">إلى السيّد / السادة</span>
          <span className="val">{project ? (ownersLine(project)||'—') : '—'}</span>
          <span className="en">To</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">المشروع — رقم القطعة</span>
          <span className="val">{projLine}</span>
          <span className="en">Project — Plot No.</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">المرحلة / Stage</span>
          <Chk on={payment.phase==='تصميم'} ar="تصميم" en="Design" />
          <Chk on={payment.phase==='إشراف'} ar="إشراف" en="Supervision" />
          <Chk on={payment.phase==='أخرى'} ar="أخرى" en="Other" />
          <span className="lbl" style={{marginInlineStart:18}}>بيان الدفعة</span>
          <span className="val">{instLabel}</span>
          <span className="en">Description</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">تفصيل المبلغ</span>
          <span className="val" style={{fontWeight:600}}>
            Base {fmt(base)} AED{rate>0 ? ' + VAT (5%) '+fmt(vat)+' AED' : ' (Zero-rated)'}
          </span>
          <span className="en">Breakdown</span>
        </div>

        <div className="rcpt-line">
          <span className="lbl">ملاحظات</span>
          <span className="val" style={{fontWeight:600}}>{payment.note||''}</span>
          <span className="en">Notes</span>
        </div>

        <div className="rcpt-bottom">
          <div className="rcpt-stamp">
            <div>
              <div className="t">ختم وتوقيع المكتب</div>
              <div className="en">Issued by · Stamp &amp; Signature</div>
            </div>
            <div className="co">NITAQ ENGINEERING CONSULTANCY</div>
          </div>
          <div className="rcpt-amount">
            <div className="hd"><span>المبلغ المستحق</span><span className="en">Amount Due</span></div>
            <div className="amt">
              <span className="cur">AED</span>
              <span className="num">{fmt(total)}</span>
            </div>
            <div className="words">فقط {tafqeet(total)}</div>
            {isLate
              ? <div className="vatline" style={{color:'var(--rust)', fontWeight:800}}>⚠ متأخرة {overdue} يوم عن تاريخ الاستحقاق — يرجى السداد</div>
              : payment.dueDate && <div className="vatline">يرجى السداد قبل تاريخ الاستحقاق {payment.dueDate}</div>}
          </div>
        </div>
      </div>
      <div className="rcpt-foot">
        <span>SHARJAH · UAE &nbsp;|&nbsp; {COMPANY.phone2} &nbsp;|&nbsp; {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</span>
        <span className="tag">{COMPANY.tagline}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn outline" onClick={onBack}>← رجوع للدفعات</button>
        <button className="btn brass" onClick={()=>window.print()}><I.print/> طباعة المطالبة (نسختين A4)</button>
      </div>
      <div className="no-print" style={{background:'var(--brass-soft)', color:'var(--ink)', padding:'10px 18px', borderRadius:4, marginBottom:12, fontSize:12.5, borderInlineStart:'4px solid var(--brass)'}}>
        مطالبة بدفعة مستحقة — مستند غير محاسبي للتذكير بالسداد، لا يُغني عن الفاتورة الضريبية ولا يُعتد به كسند قبض.
      </div>
      <div className="rcpt-pair">
        <Copy />
        <div className="rcpt-cutline"><span>✂ خط القص — Cut Here</span></div>
        <Copy />
      </div>
    </div>
  );
}

/* ================= Invoice Doc (فاتورة ضريبية — FTA compliant) ================= */
function InvoiceDoc({payment, project, settings, onBack, onRefresh}){
  if(payment.docSnapshot){
    const s = payment.docSnapshot;
    project = {...(project||{}), name:s.projectName, owner:s.owner, ownerTrn:s.ownerTrn, additionalOwners:s.additionalOwners||[], plotNumber:s.plotNumber, projectNo:s.projectNo};
  }
  const rate = vatRateOf(payment);
  const net = payment.amount||0;
  const vat = net*rate;
  const total = net*(1+rate);
  const item = payment.phase==='إشراف'
    ? ('أتعاب الإشراف الهندسي — '+(payment.month?fmtMonth(payment.month):''))
    : payment.phase==='أخرى'
    ? (payment.label||'خدمات استشارية أخرى')
    : ('أتعاب التصميم واعتماد المخططات — '+(payment.label||''));
  const paid = payment.status==='مدفوعة';
  const partial = payment.status==='مدفوعة جزئياً';

  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn outline" onClick={onBack}>← رجوع للدفعات</button>
        {onRefresh && <button className="btn ghost" onClick={onRefresh} title="إعادة جلب اسم العميل والمشروع من بياناتهم الحالية">↻ تحديث البيانات</button>}
        <button className="btn brass" onClick={()=>window.print()}><I.print/> طباعة الفاتورة</button>
      </div>

      <div className="sinv" dir="ltr">
        {/* Header */}
        <div className="sinv-top">
          <div className="sinv-co" style={{textAlign:'left'}}>
            <div className="n">NITAQ ENGINEERING CONSULTANCY</div>
            <div className="ne">L.L.C. — SP</div>
            <div className="meta">
              TRN: {COMPANY.trn} &nbsp;·&nbsp; License {COMPANY.license}<br/>
              {COMPANY.address}<br/>
              {COMPANY.phone} &nbsp;·&nbsp; {COMPANY.email}
            </div>
          </div>
          <div className="sinv-logo"><img src={NITAQ_LOGO} alt="NITAQ" /></div>
        </div>

        {/* Title */}
        <div className="sinv-tag"><span className="en">TAX INVOICE</span></div>

        {/* Invoice & customer info */}
        <div className="sinv-info">
          <div>
            <div className="row"><span className="k">Invoice No.</span><span className="v">{payment.invoiceNo||'—'}</span></div>
            <div className="row"><span className="k">Issue Date</span><span className="v">{(payment.docSnapshot && payment.docSnapshot.issuedAt) || payment.date}</span></div>
            <div className="row"><span className="k">Supply Date</span><span className="v">{payment.date}</span></div>
            <div className="row"><span className="k">Due Date</span><span className="v">{payment.dueDate||'—'}</span></div>
          </div>
          <div>
            <div className="row"><span className="k">Customer</span><span className="v">{project ? (ownersLine(project)||'—') : '—'}</span></div>
            <div className="row"><span className="k">Customer TRN</span><span className="v">{(project && project.ownerTrn) || '—'}</span></div>
            <div className="row"><span className="k">Project</span><span className="v">{project ? (project.name||'—') : '—'}</span></div>
            <div className="row"><span className="k">Plot No.</span><span className="v">{(project && project.plotNumber) || '—'}</span></div>
          </div>
        </div>

        {/* Line items */}
        <table>
          <thead>
            <tr>
              <th style={{width:36}}>#</th>
              <th>Description</th>
              <th style={{width:120}}>Amount</th>
              <th style={{width:90}}>VAT 5%</th>
              <th style={{width:120}}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>{item}</td>
              <td>{fmt(net)}</td>
              <td>{rate>0?fmt(vat):'—'}</td>
              <td style={{fontWeight:700}}>{fmt(total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="sinv-tot">
          <div className="box">
            <div className="r"><span>Subtotal</span><span>AED {fmt(net)}</span></div>
            <div className="r"><span>Discount</span><span>AED 0.00</span></div>
            <div className="r"><span>VAT (5%)</span><span>AED {fmt(vat)}</span></div>
            <div className="r grand"><span>Total incl. VAT</span><span>AED {fmt(total)}</span></div>
          </div>
        </div>

        <div className="sinv-words">Amount in words: {tafqeetEn(total)}</div>

        {/* Payment status */}
        <div className="sinv-pay" style={{
          background: paid?'var(--teal-soft)':partial?'var(--brass-soft)':'var(--rust-soft)',
          color: paid?'var(--teal)':partial?'var(--ink)':'var(--rust)',
          border:'1px solid '+(paid?'var(--teal)':partial?'var(--brass)':'var(--rust)')
        }}>
          {paid ? '✓ Payment Status: Paid in Full'
            : partial ? ('Payment Status: Partially Paid — Balance AED '+fmt(remainderOf(payment)*grossFactor(payment)))
            : '⚠ Payment Status: Due — please pay before '+(payment.dueDate||'')}
        </div>

        {settings && settings.iban ? (
          <div className="sinv-words" style={{fontWeight:600, color:'var(--ink-soft)'}}>
            Bank Transfer: {(settings.bankName||'')} — IBAN: {settings.iban}{settings.accountName?(' — '+settings.accountName):''}
          </div>
        ) : null}

        <div className="sinv-spacer"></div>

        {/* Signatures */}
        <div className="sinv-sign">
          <div className="s">Issued by<br/>NITAQ</div>
          <div className="s">Company Stamp</div>
          <div className="s">Customer Signature</div>
        </div>

        <div className="sinv-foot">SHARJAH · UAE &nbsp;|&nbsp; {COMPANY.phone2} &nbsp;|&nbsp; {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</div>
      </div>
    </div>
  );
}

/* ================= إشعار دائن (Credit Note) لفسخ العقد واسترداد الضريبة ================= */
function CreditNoteDoc({cn, onClose}){
  const { project, refundNet, refundVat, refundGross, reason, date, cnNo, origInvoice } = cn;
  const [lang, setLang] = useState('ar');
  const isEn = lang==='en';
  const bounced = !!origInvoice;   // شيك مرتجع لو فيه فاتورة أصلية، غير كده فسخ عقد

  const T = isEn ? {
    close:'Close', print:'Print', title:'TAX CREDIT NOTE',
    cnNo:'Credit Note No.', issue:'Issue Date', reason:'Reason', ref:'Against Invoice',
    reasonVal: bounced ? 'Returned Cheque — Invoice Cancellation' : 'Contract Termination',
    customer:'Customer', trn:'Customer TRN', project:'Project',
    thDesc:'Description', thAmt:'Amount', thVat:'VAT 5%', thTotal:'Total',
    desc: bounced
      ? ('Cancellation of Tax Invoice '+(origInvoice||'')+' — the cheque was returned unpaid; the full invoice is credited and output VAT reversed.')
      : 'Refund on contract termination — reversal of amounts collected in excess of work performed.',
    subtotal:'Subtotal (credited)', vatReclaim:'VAT (5%) reclaimed', grand:'Total Credit incl. VAT',
    words:'Amount in words', wordsSuffix:'(credited to customer)',
    notice:'↩ This Tax Credit Note reverses output VAT previously declared. Retain for FTA records.',
    issuedBy:'Issued by', stamp:'Company Stamp', sign:'Customer Signature',
  } : {
    close:'إغلاق', print:'طباعة الإشعار', title:'إشعار دائن ضريبي',
    cnNo:'رقم الإشعار', issue:'تاريخ الإصدار', reason:'السبب', ref:'عن الفاتورة',
    reasonVal: bounced ? 'شيك مرتجع — إلغاء فاتورة' : 'فسخ عقد',
    customer:'العميل', trn:'الرقم الضريبي للعميل', project:'المشروع',
    thDesc:'البيان', thAmt:'المبلغ', thVat:'ض.ق.م 5%', thTotal:'الإجمالي',
    desc: bounced
      ? ('إلغاء الفاتورة الضريبية '+(origInvoice||'')+' — ارتدّ الشيك بدون رصيد؛ تُقيَّد كامل قيمة الفاتورة دائناً وتُعكس ضريبة المخرجات.')
      : 'إرجاع عند فسخ العقد — عكس المبالغ المحصّلة الزائدة عن قيمة العمل المُنجز.',
    subtotal:'الصافي (دائن)', vatReclaim:'ض.ق.م المستردة (5%)', grand:'إجمالي الدائن شامل الضريبة',
    words:'المبلغ كتابةً', wordsSuffix:'(تُقيَّد دائناً للعميل)',
    notice:'↩ هذا الإشعار الدائن يعكس ضريبة المخرجات المُعلنة سابقاً. يُحتفظ به لسجلات الهيئة الاتحادية للضرائب.',
    issuedBy:'صادر عن', stamp:'ختم الشركة', sign:'توقيع العميل',
  };

  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:860, width:'96%', maxHeight:'92vh', overflowY:'auto', padding:12, background:'var(--paper)', boxShadow:'0 20px 50px rgba(0,0,0,.25)'}}>
        <div className="toolbar no-print" style={{justifyContent:'flex-end', marginBottom:8, gap:8}}>
          <div style={{display:'flex', border:'1px solid var(--line-strong)', borderRadius:4, overflow:'hidden'}}>
            <button onClick={()=>setLang('ar')} style={{padding:'7px 14px', fontSize:12.5, border:'none', cursor:'pointer', background: lang==='ar'?'var(--ink)':'#fff', color: lang==='ar'?'#fff':'var(--ink)'}}>عربي</button>
            <button onClick={()=>setLang('en')} style={{padding:'7px 14px', fontSize:12.5, border:'none', cursor:'pointer', background: lang==='en'?'var(--ink)':'#fff', color: lang==='en'?'#fff':'var(--ink)'}}>English</button>
          </div>
          <button className="btn outline" onClick={onClose}>{T.close}</button>
          <button className="btn brass" onClick={()=>window.print()}><I.print/> {T.print}</button>
        </div>
        <div className="sinv" dir={isEn?'ltr':'rtl'} style={{minHeight:'auto'}}>
          <div className="sinv-top">
            <div className="sinv-co" style={{textAlign: isEn?'left':'right'}}>
              <div className="n">{isEn ? 'NITAQ ENGINEERING CONSULTANCY' : COMPANY.nameAr}</div>
              <div className="ne">{isEn ? 'L.L.C. — SP' : COMPANY.nameEn}</div>
              <div className="meta">
                TRN: {COMPANY.trn} &nbsp;·&nbsp; {isEn?'License':'رخصة'} {COMPANY.license}<br/>
                {COMPANY.address}<br/>
                {COMPANY.phone} &nbsp;·&nbsp; {COMPANY.email}
              </div>
            </div>
            <div className="sinv-logo"><img src={NITAQ_LOGO} alt="NITAQ" /></div>
          </div>

          <div className="sinv-tag"><span className="en" data-office-dialog-title>{T.title}</span></div>

          <div className="sinv-info">
            <div>
              <div className="row"><span className="k">{T.cnNo}</span><span className="v">{cnNo||'—'}</span></div>
              <div className="row"><span className="k">{T.issue}</span><span className="v">{date}</span></div>
              {origInvoice && <div className="row"><span className="k">{T.ref}</span><span className="v">{origInvoice}</span></div>}
              <div className="row"><span className="k">{T.reason}</span><span className="v">{T.reasonVal}</span></div>
            </div>
            <div>
              <div className="row"><span className="k">{T.customer}</span><span className="v">{ownersLine(project)||'—'}</span></div>
              <div className="row"><span className="k">{T.trn}</span><span className="v">{project.ownerTrn||'—'}</span></div>
              <div className="row"><span className="k">{T.project}</span><span className="v">{project.name||'—'}</span></div>
            </div>
          </div>

          <table style={{tableLayout:'fixed', width:'100%'}}>
            <thead>
              <tr>
                <th style={{width:30}}>#</th>
                <th>{T.thDesc}</th>
                <th style={{width:95}}>{T.thAmt}</th>
                <th style={{width:80}}>{T.thVat}</th>
                <th style={{width:100}}>{T.thTotal}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td style={{whiteSpace:'normal', wordBreak:'break-word', lineHeight:1.5}}>{T.desc}</td>
                <td>−{fmt(refundNet)}</td>
                <td>−{fmt(refundVat)}</td>
                <td style={{fontWeight:700}}>−{fmt(refundGross)}</td>
              </tr>
            </tbody>
          </table>

          <div className="sinv-tot">
            <div className="box">
              <div className="r"><span>{T.subtotal}</span><span>AED −{fmt(refundNet)}</span></div>
              <div className="r"><span>{T.vatReclaim}</span><span>AED −{fmt(refundVat)}</span></div>
              <div className="r grand"><span>{T.grand}</span><span>AED −{fmt(refundGross)}</span></div>
            </div>
          </div>

          <div className="sinv-words">{T.words}: {isEn?tafqeetEn(refundGross):tafqeet(refundGross)} {T.wordsSuffix}</div>

          <div className="sinv-pay" style={{background:'var(--rust-soft)', color:'var(--rust)', border:'1px solid var(--rust)'}}>
            {T.notice}
          </div>

          <div className="sinv-spacer"></div>
          <div className="sinv-sign">
            <div className="s">{T.issuedBy}<br/>NITAQ</div>
            <div className="s">{T.stamp}</div>
            <div className="s">{T.sign}</div>
          </div>
          <div className="sinv-foot">SHARJAH · UAE &nbsp;|&nbsp; {COMPANY.phone2} &nbsp;|&nbsp; {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</div>
        </div>
      </div>
    </div>
  );
}

/* ================= مصروفات المكتب بفلتر السداد والتاريخ ================= */
function OfficeExpensesView({data, configs, mutate, saveBudgets}){
  const [stFilter, setStFilter] = useState('');
  const [bankFilter, setBankFilter] = useState([]);   // اختيار متعدد للبنوك
  const [vendorFilter, setVendorFilter] = useState('');   // فلتر المورّد
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const m = mutate('officeExpenses');

  // قائمة البنوك المستخدمة فعلياً (تُبنى تلقائياً من البيانات)
  const bankOpts = [...new Set(data.officeExpenses.map(e=>(e.bankName||'').trim()).filter(Boolean))].sort();
  const vendorOpts = [...new Set(data.officeExpenses.map(e=>(e.vendor||'').trim()).filter(Boolean))].sort();
  const toggleBank = (b)=> setBankFilter(prev=> prev.includes(b) ? prev.filter(x=>x!==b) : [...prev, b]);
  const chipStyle = (on)=>({
    border:'1px solid '+(on?'var(--brass)':'var(--line-strong)'),
    background:on?'var(--brass)':'#fff', color:on?'#fff':'var(--ink-soft)',
    borderRadius:20, padding:'5px 13px', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit'
  });

  let records = stFilter
    ? data.officeExpenses.filter(e=> stFilter==='معلق' ? e.payStatus==='معلق' : e.payStatus!=='معلق')
    : data.officeExpenses;
  if(bankFilter.length) records = records.filter(e=> bankFilter.includes((e.bankName||'').trim()));
  if(vendorFilter) records = records.filter(e=> (e.vendor||'').trim()===vendorFilter);
  if(dFrom) records = records.filter(e=> (e.date||'') >= dFrom);
  if(dTo) records = records.filter(e=> (e.date||'') <= dTo);

  // الإجماليات تحترم الفلاتر المطبّقة (بدون المؤرشف) — شامل الضريبة (ما يخرج فعلاً من الحساب، مطابق للخزينة)
  const active = records.filter(e=>!isArchived(e));
  const totAll   = active.reduce((s,e)=>s+expGross(e),0);
  const totPaid  = active.filter(e=>e.payStatus!=='معلق').reduce((s,e)=>s+expGross(e),0);
  const totPend  = active.filter(e=>e.payStatus==='معلق').reduce((s,e)=>s+expGross(e),0);
  const totDebt  = active.reduce((s,e)=>s+expDebt(e),0);
  const totWio   = active.reduce((s,e)=>s+expOwnBank(e),0);
  const anyFilter = stFilter || bankFilter.length || vendorFilter || dFrom || dTo;

  // ===== تحليل بالتصنيف وأعلى الموردين (شامل الضريبة، يحترم الفلاتر) =====
  const [showBreakdown, setShowBreakdown] = useState(false);
  const byCat = {};
  active.forEach(e=>{ const k=e.category||'غير مصنّف'; byCat[k]=(byCat[k]||0)+expGross(e); });
  const catRows = Object.entries(byCat).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  const byVendor = {};
  active.forEach(e=>{ const v=(e.vendor||'').trim(); if(v) byVendor[v]=(byVendor[v]||0)+expGross(e); });
  const vendorRows = Object.entries(byVendor).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v).slice(0,6);
  const barColors = ['var(--brass)','var(--teal)','var(--ink)','var(--rust)','var(--ink-soft)','#8A6D3B','#6E8B3D','#B7BCAF'];
  const pct = (v)=> totAll>0 ? Math.round(v/totAll*100) : 0;

  // ===== الموازنة الشهرية لكل تصنيف (مستقلة عن الفلاتر — عن الشهر الجاري) =====
  const budgets = (data.settings && data.settings.budgets) || {};
  const curYM = todayISO().slice(0,7);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [draftBudgets, setDraftBudgets] = useState(budgets);
  const spentThisMonthByCat = {};
  data.officeExpenses.filter(e=>!isArchived(e) && (e.date||'').slice(0,7)===curYM)
    .forEach(e=>{ const k=e.category||'غير مصنّف'; spentThisMonthByCat[k]=(spentThisMonthByCat[k]||0)+expGross(e); });
  const budgetCats = [...new Set([...OFFICE_CATEGORIES, ...Object.keys(budgets)])];
  const budgetRows = budgetCats.map(c=>({cat:c, budget:Number(budgets[c])||0, spent:spentThisMonthByCat[c]||0}))
    .filter(r=>r.budget>0 || r.spent>0);
  const overBudget = budgetRows.filter(r=>r.budget>0 && r.spent>r.budget);
  const money0 = (n)=> money(n);

  return (
    <div>
      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', marginBottom:14}}>
        <div className="card"><div className="kpi-label">إجمالي المصروفات{anyFilter?' (مفلتر)':''}</div><div className="kpi-value" style={{color:'var(--ink)'}}>{money(totAll)}</div><div className="kpi-note">{active.length} مصروف — شامل الضريبة</div></div>
        <div className="card"><div className="kpi-label">مدفوع</div><div className="kpi-value" style={{color:'var(--teal)'}}>{money(totPaid)}</div><div className="kpi-note">اتخصم فعلاً</div></div>
        <div className="card"><div className="kpi-label">معلق</div><div className="kpi-value" style={{color:'var(--brass)'}}>{money(totPend)}</div><div className="kpi-note">لم يُسدد بعد</div></div>
        <div className="card"><div className="kpi-label">WIO NITAQ</div><div className="kpi-value" style={{color:'var(--ink)'}}>{money(totWio)}</div><div className="kpi-note">مدفوع من حساب المكتب</div></div>
        <div className="card"><div className="kpi-label">دين علينا</div><div className="kpi-value" style={{color:totDebt>0?'var(--rust)':'var(--ink)'}}>{money(totDebt)}</div><div className="kpi-note">مدفوع من بنوك غير WIO NITAQ</div></div>
      </div>

      {active.length>0 && (
        <div className="card" style={{marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer'}} onClick={()=>setShowBreakdown(x=>!x)}>
            <span style={{fontSize:13, fontWeight:800, color:'var(--ink)'}}>📊 تحليل المصروفات {anyFilter?'(حسب الفلتر الحالي)':''}</span>
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>{showBreakdown?'▲ إخفاء':'▼ عرض'}</span>
          </div>
          {showBreakdown && (
            <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20, marginTop:14}}>
              <div>
                <div style={{fontSize:12.5, fontWeight:800, color:'var(--ink-soft)', marginBottom:10}}>حسب التصنيف</div>
                {catRows.map((r,i)=>(
                  <div key={r.k} style={{marginBottom:9}}>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3}}>
                      <span style={{color:'var(--ink)'}}>{r.k}</span>
                      <span style={{color:'var(--ink-soft)'}}><b>{money(r.v)}</b> · {pct(r.v)}%</span>
                    </div>
                    <div style={{height:8, background:'var(--line)', borderRadius:5, overflow:'hidden'}}>
                      <div style={{height:'100%', width:pct(r.v)+'%', background:barColors[i%barColors.length], borderRadius:5}}></div>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:12.5, fontWeight:800, color:'var(--ink-soft)', marginBottom:10}}>أعلى الموردين</div>
                {vendorRows.length===0
                  ? <div style={{fontSize:12, color:'var(--ink-faint)', padding:'10px 0'}}>لا توجد مصروفات مُسندة لمورّد بعد — أضيفي المورّد في المصروف لرؤية التجميع هنا.</div>
                  : vendorRows.map((r,i)=>(
                    <div key={r.k} style={{marginBottom:9}}>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3}}>
                        <span style={{color:'var(--ink)'}}>{r.k}</span>
                        <span style={{color:'var(--ink-soft)'}}><b>{money(r.v)}</b> · {pct(r.v)}%</span>
                      </div>
                      <div style={{height:8, background:'var(--line)', borderRadius:5, overflow:'hidden'}}>
                        <div style={{height:'100%', width:pct(r.v)+'%', background:barColors[i%barColors.length], borderRadius:5}}></div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      {overBudget.length>0 && (
        <div className="card" style={{marginBottom:14, borderInlineStart:'4px solid var(--rust)', background:'#FBF2EF'}}>
          <p style={{fontSize:13, fontWeight:800, color:'var(--rust)', marginBottom:6}}>⚠️ تجاوز الموازنة هذا الشهر ({fmtMonth ? fmtMonth(curYM) : curYM}):</p>
          {overBudget.map(r=>(
            <div key={r.cat} style={{fontSize:12.5, padding:'3px 0'}}>
              <b>{r.cat}</b>: صُرف {money(r.spent)} من موازنة {money(r.budget)} — <span style={{color:'var(--rust)'}}>تجاوز بـ {money(r.spent-r.budget)}</span>
            </div>
          ))}
        </div>
      )}

      {saveBudgets && (
        <div className="card" style={{marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{fontSize:13, fontWeight:800, color:'var(--ink)'}}>🎯 الموازنة الشهرية {budgetRows.length>0?'— '+(fmtMonth?fmtMonth(curYM):curYM):''}</span>
            <button className="btn outline" style={{padding:'5px 12px', fontSize:12}} onClick={()=>{ setDraftBudgets(budgets); setBudgetOpen(x=>!x); }}>{budgetOpen?'إغلاق':'تعديل الموازنة'}</button>
          </div>
          {!budgetOpen && budgetRows.length>0 && (
            <div style={{marginTop:12}}>
              {budgetRows.map(r=>{
                const p = r.budget>0 ? Math.min(100, Math.round(r.spent/r.budget*100)) : 0;
                const over = r.budget>0 && r.spent>r.budget;
                const col = over?'var(--rust)':(p>=80?'var(--brass)':'var(--teal)');
                return (
                  <div key={r.cat} style={{marginBottom:10}}>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3}}>
                      <span style={{color:'var(--ink)'}}>{r.cat}</span>
                      <span style={{color:'var(--ink-soft)'}}>{money(r.spent)} / {r.budget>0?money(r.budget):'—'}{r.budget>0?' · '+p+'%':''}</span>
                    </div>
                    <div style={{height:9, background:'var(--line)', borderRadius:5, overflow:'hidden'}}>
                      <div style={{height:'100%', width:(r.budget>0?p:0)+'%', background:col, borderRadius:5}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!budgetOpen && budgetRows.length===0 && (
            <p style={{fontSize:12, color:'var(--ink-faint)', marginTop:10}}>لم تُحدَّد موازنة بعد. اضغطي "تعديل الموازنة" لوضع حد شهري لكل تصنيف — وسينبهك النظام عند التجاوز.</p>
          )}
          {budgetOpen && (
            <div style={{marginTop:12}}>
              <p style={{fontSize:12, color:'var(--ink-soft)', marginBottom:10}}>حدّدي المبلغ الشهري لكل تصنيف (اتركيه فارغاً أو صفراً لإلغاء الموازنة). القيم شاملة الضريبة (ما يخرج فعلاً من البنك).</p>
              <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10}}>
                {budgetCats.map(c=>(
                  <div key={c} style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontSize:12.5, flex:1, color:'var(--ink)'}}>{c}</span>
                    <input type="number" value={draftBudgets[c]??''} placeholder="0"
                      onChange={e=>setDraftBudgets(prev=>({...prev, [c]: e.target.value}))}
                      style={{width:100, border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 8px', fontSize:12.5, background:'#fff'}} />
                  </div>
                ))}
              </div>
              <div style={{display:'flex', gap:8, marginTop:14}}>
                <button className="btn brass" style={{padding:'7px 16px', fontSize:12.5}} onClick={()=>{
                  const clean={};
                  Object.entries(draftBudgets).forEach(([k,v])=>{ const n=Number(v); if(n>0) clean[k]=n; });
                  saveBudgets(clean); setBudgetOpen(false);
                }}>حفظ الموازنة</button>
                <button className="btn outline" style={{padding:'7px 16px', fontSize:12.5}} onClick={()=>setBudgetOpen(false)}>إلغاء</button>
              </div>
            </div>
          )}
        </div>
      )}

      {anyFilter && (
        <div className="card" style={{marginBottom:14, borderInlineStart:'4px solid var(--teal)', display:'flex', gap:10, alignItems:'center', justifyContent:'space-between', flexWrap:'wrap'}}>
          <span style={{fontSize:13}}>🔎 نتيجة الفلتر: <b>{active.length}</b> مصروف — الإجمالي <b>{money(totAll)}</b>{bankFilter.length?<> — بنوك: <b>{bankFilter.join('، ')}</b> — دين: <b style={{color:'var(--rust)'}}>{money(totDebt)}</b></>:null}</span>
          <button className="btn outline" style={{padding:'5px 12px', fontSize:12}} onClick={()=>{setStFilter('');setBankFilter([]);setVendorFilter('');setDFrom('');setDTo('');}}>مسح كل الفلاتر</button>
        </div>
      )}
      {bankOpts.length>0 && (
        <div className="card" style={{marginBottom:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{fontSize:12.5, fontWeight:800, color:'var(--ink-soft)'}}>🏦 فلترة بالبنوك (اختاري كذا مع بعض):</span>
          <button onClick={()=>setBankFilter([])} style={chipStyle(bankFilter.length===0)}>كل البنوك</button>
          {bankOpts.map(b=>(
            <button key={b} onClick={()=>toggleBank(b)} style={chipStyle(bankFilter.includes(b))}>{b}</button>
          ))}
          {bankFilter.length>0 && <span style={{fontSize:12, color:'var(--ink-faint)'}}>({bankFilter.length} مختار)</span>}
        </div>
      )}
      <EntityView config={configs.officeExpenses} records={records} data={data}
        onAdd={m.add} onUpdate={m.update} onDelete={m.del}
        headExtra={
          <>
            <button className="btn outline" title="تصدير المصروفات الظاهرة (بعد الفلترة) لملف Excel للمطابقة مع المحاسب"
              onClick={async ()=>{
                if(active.length===0){ alert('لا توجد مصروفات للتصدير — امسحي الفلاتر أو غيّريها'); return; }
                try{ await exportOfficeExpensesXlsx(active, {banks:bankFilter, filtered:!!anyFilter}); }
                catch(e){ alert(e.message||'تعذر التصدير'); }
              }}
              style={{border:'1px solid var(--line-strong)', padding:'7px 12px', fontSize:12.5}}>
              ⬇️ تصدير Excel
            </button>
            <select value={stFilter} onChange={e=>setStFilter(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
              <option value="">كل الحالات</option>
              <option value="معلق">معلق فقط</option>
              <option value="مدفوع">مدفوع فقط</option>
            </select>
            {vendorOpts.length>0 && (
              <select value={vendorFilter} onChange={e=>setVendorFilter(e.target.value)} title="فلترة بالمورّد"
                style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'7px 10px', fontSize:12.5, background:'#fff'}}>
                <option value="">كل الموردين</option>
                {vendorOpts.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            )}
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>من</span>
            <input type="date" value={dFrom} onChange={e=>setDFrom(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', fontSize:12.5, background:'#fff'}} />
            <span style={{fontSize:12, color:'var(--ink-soft)'}}>إلى</span>
            <input type="date" value={dTo} onChange={e=>setDTo(e.target.value)}
              style={{border:'1px solid var(--line-strong)', borderRadius:4, padding:'6px 10px', fontSize:12.5, background:'#fff'}} />
          </>
        }
      />
    </div>
  );
}

/* ================= الفواتير الدورية (اتصالات، إنترنت، سيوا...) ================= */
