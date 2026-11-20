const STAGE_STATUSES = ['لم تبدأ','جارية','مكتملة'];
const APPROVAL_ITEMS = ['تخطيط ومساحة','كهرباء','مياه','غاز','اتصالات','دفاع مدني','بلدية','دائرة الإسكان (اختياري)','إجازة البناء'];
const EMIRATES = ['الشارقة','دبي','أبوظبي','عجمان','أم القيوين','رأس الخيمة','الفجيرة'];
const PROJECT_TYPES = ['فيلا سكنية','مبنى سكني','مبنى تجاري','مستودع','مجمع سكني','سكن عمال','مبنى إداري','أخرى'];
const CONTRACT_TYPES = ['تصميم واعتماد','إشراف','تصميم + اعتماد + إشراف (شامل)','تعديل مخططات','أعمال إضافية','أخرى'];
const DECISION_CATEGORIES = ['اعتماد المالك','تعديل تصميمي','أمر تغيير (Variation)','مهمة','اجتماع / موعد','ملاحظة دائرة حكومية','ملاحظة موقع / مخاطرة','مالية','ملخص اجتماع','أخرى'];
const DECISION_STATUSES = ['مفتوح','منفذ','مؤجل','ملغى'];
const CONTRACT_CATEGORIES = ['خدمات استشارية','مقاول رئيسي','مقاول باطن'];
const SUBCONTRACT_TYPES = ['مسابح','مصاعد','حجر','تكييف','ألمنيوم','كهرباء','سباكة','لاندسكيب','أخرى'];

/* ================= Constants ================= */
const GOV_DEPARTMENTS = [
  'دائرة التخطيط والمساحة',
  'هيئة كهرباء ومياه وغاز (سيوا)',
  'الاتصالات',
  'الدفاع المدني',
  'البلدية',
  'أخرى',
];
const OFFICE_CATEGORIES = ['إيجار','اتصالات وإنترنت','رخص وتجديدات حكومية','صيانة','قرطاسية ومكتبية','برامج واشتراكات','ضيافة','أخرى'];
const OTHER_INCOME_CATEGORIES = ['بيع أصول','إيجار فرعي','عمولة / استشارة سريعة','استرداد','فوائد بنكية','أخرى'];
const OFFICE_VENDORS = ['Etisalat','du','SEWA','Autodesk','Microsoft','Adobe'];
const PROJECT_COST_CATEGORIES = ['طباعة مخططات','مواصلات وزيارات موقع','فحوصات ومختبرات','استشاري خارجي / تعهيد','تصديقات ومعاملات','أخرى'];

/* ================= Seed Data ================= */
const seedData = () => ({"projects":[],"contracts":[],"decisions":[],"auditLog":[],"staffDir":[],"payments":[],"recurringBills":[],"govFees":[],"officeExpenses":[],"projectCosts":[],"treasury":[],"otherIncome":[],"employees":[],"overtime":[],"advances":[],"leaves":[],"timesheets":[],"cars":[],"attendance":{},"fccState":{},"settings":{"projectsRoot":"","bankName":"","iban":"","accountName":""}}); // Real office data is loaded from authenticated Supabase.

/* ================= Migration (from old data model) ================= */
function migrateData(parsed){
  const out = {...parsed};
  if(!Object.prototype.hasOwnProperty.call(parsed, 'recurringBills')) out.recurringBills = [];
  if(Array.isArray(parsed.projects)){
    out.projects = parsed.projects.map((p,idx)=>({
      designFee: p.designFee!==undefined ? p.designFee : (p.budget||0),
      supervisionMonthly: p.supervisionMonthly||0,
      supervisionMonths: p.supervisionMonths||0,
      owner: p.owner!==undefined ? p.owner : (p.client||''),
      plotNumber: p.plotNumber||'',
      landType: p.landType || (p.grantNumber ? 'منحة' : 'ملك'),
      ownershipNumber: p.ownershipNumber||'',
      projectNo: p.projectNo || (105+idx),
      emirate: p.emirate||'الشارقة',
      area: p.area||'',
      projectType: p.projectType||'',
      owningEntity: p.owningEntity||'',
      engineer: p.engineer||'',
      timeline: p.timeline||{},
      approvals: p.approvals||{},
      ...p,
    }));
  }
  if(Array.isArray(parsed.invoices) && !Array.isArray(parsed.payments)){
    out.payments = parsed.invoices.map(i=>({
      id:i.id, projectId:i.projectId, phase:'تصميم',
      label:'فاتورة سابقة رقم '+(i.number||'—'),
      amount:i.amount, date:i.date, dueDate:i.dueDate, status:i.status, _ts:i._ts||0,
    }));
  }
  if(Array.isArray(parsed.expenses) && !Array.isArray(parsed.officeExpenses) && !Array.isArray(parsed.projectCosts)){
    out.officeExpenses = parsed.expenses.filter(e=>!e.projectId).map(e=>({...e, category: OFFICE_CATEGORIES.includes(e.category)?e.category:'أخرى'}));
    out.projectCosts = parsed.expenses.filter(e=>e.projectId).map(e=>({...e, category: PROJECT_COST_CATEGORIES.includes(e.category)?e.category:'أخرى'}));
  }
  if(!Array.isArray(out.govFees)) out.govFees = [];
  if(!Array.isArray(out.treasury)) out.treasury = [];
  if(Array.isArray(out.contracts)) out.contracts = out.contracts.map(c=>({category:'خدمات استشارية', ...c}));
  if(!Array.isArray(out.contracts)){
    out.contracts = [];
    (out.projects||[]).forEach(p=>{
      if((p.designFee||0)>0) out.contracts.push({id:'mig-d-'+p.id, projectId:p.id, type:'تصميم واعتماد', description:'أتعاب التصميم واعتماد المخططات', value:p.designFee, date:p.startDate||todayISO(), status: p.status==='منتهٍ'?'منتهٍ':'سارٍ', _ts:1});
      if((p.supervisionMonthly||0)>0) out.contracts.push({id:'mig-s-'+p.id, projectId:p.id, type:'إشراف', description:'الإشراف الهندسي الشهري', supervisionMonthly:p.supervisionMonthly, supervisionMonths:p.supervisionMonths||0, value:(p.supervisionMonthly||0)*(p.supervisionMonths||0), date:p.startDate||todayISO(), status: p.status==='منتهٍ'?'منتهٍ':'سارٍ', _ts:2});
    });
    if(Array.isArray(out.payments)){
      out.payments = out.payments.map(pay=>{
        if(pay.contractId) return pay;
        if(pay.phase==='تصميم') return {...pay, contractId:'mig-d-'+pay.projectId};
        if(pay.phase==='إشراف') return {...pay, contractId:'mig-s-'+pay.projectId};
        return pay;
      });
    }
  }
  if(!Array.isArray(out.decisions)) out.decisions = [];
  if(!Array.isArray(out.auditLog)) out.auditLog = [];
  if(!Array.isArray(out.staffDir)) out.staffDir = [];
  if(typeof out.fccState !== 'object' || out.fccState===null || Array.isArray(out.fccState)) out.fccState = {};
  out.settings = Object.assign({projectsRoot:'D:\\Projects', bankName:'', iban:'', accountName:''}, out.settings||{});
  out.govFees = out.govFees.map(g=>({account:'البنك', ...g}));
  if(Array.isArray(out.officeExpenses)) out.officeExpenses = out.officeExpenses.map(e=>({account:'البنك', ...e}));
  if(Array.isArray(out.projectCosts)) out.projectCosts = out.projectCosts.map(e=>({account:'البنك', ...e}));
  if(!Array.isArray(out.leaves)) out.leaves = [];
  if(!Array.isArray(out.timesheets)) out.timesheets = [];
  if(!Array.isArray(out.otherIncome)) out.otherIncome = [];
  delete out.invoices; delete out.expenses;
  return out;
}

/* ================= Icons ================= */
const I = {
  dash:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="11" width="8" height="10" rx="1"/><rect x="3" y="14" width="8" height="7" rx="1"/></svg>),
  compass:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-6 2 2-6 6-2z"/></svg>),
  receipt:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>),
  landmark:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M3 9l9-5 9 5H3z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 18h18v2.5H3z"/></svg>),
  coin:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/></svg>),
  helmet:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M4 15a8 8 0 0 1 16 0"/><path d="M10 7.5V5h4v2.5"/><path d="M2.5 15h19v3h-19z"/></svg>),
  percent:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M18 6L6 18"/></svg>),
  chart:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M4 20V10M12 20V4M20 20v-7"/></svg>),
  users:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M15.8 14.7c2.3.3 4 2.1 4.7 5.3"/></svg>),
  calendar:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14l2 2 4-4"/></svg>),
  clock:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>),
  handCoin:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="7" r="3"/><path d="M4 21c1-4 3.5-6 8-6s7 2 8 6"/></svg>),
  wallet:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none"/></svg>),
  car:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M4 16l1.5-5.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 16"/><rect x="2.5" y="16" width="19" height="4" rx="1"/><circle cx="7" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>),
  safe:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16"/></svg>),
  scale:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M12 3v18M8 21h8"/><path d="M12 5l6 2-2.5 6a3.5 3.5 0 0 0 5 0L18 7M12 5L6 7l2.5 6a3.5 3.5 0 0 1-5 0L6 7"/></svg>),
  target:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>),
  spark:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/><path d="M19 15l.8 2.7L22.5 18.5l-2.7.8L19 22l-.8-2.7-2.7-.8 2.7-.8L19 15z"/></svg>),
  gear:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>),
  docfile:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M6 2h9l4 4v16H6V2z"/><path d="M15 2v4h4M9 12h6M9 16h6"/></svg>),
  plus:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}><path d="M12 5v14M5 12h14"/></svg>),
  edit:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M4 20l.9-3.6L16.5 5 19 7.5 7.4 19 4 20z"/></svg>),
  trash:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>),
  bell:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>),
  print:(p)=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg>),
};

/* ================= Nav config ================= */
const NAV = [
  {group:'نظرة عامة', items:[
    {key:'fcc', label:'مركز القيادة المالية', icon:I.target},
    {key:'dashboard', label:'لوحة التحكم', icon:I.dash},
  ]},
  {group:'المشاريع والإيرادات', items:[
    {key:'projects', label:'المشاريع (ملف المشروع)', icon:I.compass},
    {key:'contracts', label:'العقود', icon:I.docfile},
    {key:'payments', label:'الدفعات الاستشارية', icon:I.receipt},
    {key:'revenue', label:'الإيرادات', icon:I.chart},
    {key:'govFees', label:'الرسوم الحكومية', icon:I.landmark},
    {key:'decisions', label:'القرارات والوقائع', icon:I.bell},
  ]},
  {group:'المصروفات', items:[
    {key:'officeExpenses', label:'مصروفات المكتب', icon:I.coin},
    {key:'projectCosts', label:'تكاليف المشاريع', icon:I.helmet},
    {key:'recurringBills', label:'الفواتير الدورية', icon:I.bell},
  ]},
  {group:'الخزينة والذمم', items:[
    {key:'treasury', label:'الخزينة والبنك', icon:I.safe},
    {key:'dues', label:'الذمم — مدينون ودائنون', icon:I.scale},
  ]},
  {group:'الضريبة والتقارير', items:[
    {key:'vat', label:'ضريبة القيمة المضافة', icon:I.percent},
    {key:'statement', label:'كشف حساب مشروع', icon:I.docfile},
    {key:'reports', label:'التقارير المالية', icon:I.chart},
    {key:'analytics', label:'التحليلات الذكية', icon:I.spark},
  ]},
  {group:'الموارد البشرية', items:[
    {key:'employees', label:'الموظفون', icon:I.users},
    {key:'attendance', label:'الحضور والانصراف', icon:I.calendar},
    {key:'overtime', label:'الأوفرتايم', icon:I.clock},
    {key:'advances', label:'السلف والخصومات', icon:I.handCoin},
    {key:'leaves', label:'الإجازات', icon:I.calendar},
    {key:'timesheets', label:'تتبّع الوقت', icon:I.clock},
    {key:'payroll', label:'الرواتب', icon:I.wallet},
    {key:'docAlerts', label:'تنبيهات الوثائق', icon:I.bell},
  ]},
  {group:'الأصول والنظام', items:[
    {key:'cars', label:'سيارات الشركة', icon:I.car},
    {key:'settings', label:'الإعدادات', icon:I.gear},
    {key:'audit', label:'سجل التدقيق', icon:I.docfile},
    {key:'users', label:'المستخدمون والصلاحيات', icon:I.users},
  ]},
];

/* ================= بحث عام داخل الجداول ================= */
function rowSearchText(row, data){
  let s = Object.values(row).filter(v=> typeof v==='string' || typeof v==='number').join(' ');
  if(row.projectId){ const p = data.projects.find(x=>x.id===row.projectId); if(p) s += ' '+(p.projectNo||'')+' '+(p.name||'')+' '+(p.owner||'')+' '+(p.plotNumber||'')+' '+(p.ownershipNumber||'')+' '+((p.additionalOwners||[]).map(o=>o.name||'').join(' ')); }
  if(row.employeeId){ const e = data.employees.find(x=>x.id===row.employeeId); if(e) s += ' '+(e.name||''); }
  if(row.contractId){ const c = (data.contracts||[]).find(x=>x.id===row.contractId); if(c) s += ' '+(c.type||'')+' '+(c.description||''); }
  return String(s).toLowerCase();
}

/* ================= طبقة السحابة (Supabase) ================= */
const SB_CDN = ['../vendor/supabase-2.45.3.min.js'];
function loadScript(srcs){
  return new Promise((resolve, reject)=>{
    const tryNext = (i)=>{
      if(i>=srcs.length){ reject(new Error('cdn failed')); return; }
      const s = document.createElement('script');
      s.src = srcs[i];
      s.onload = ()=>resolve();
      s.onerror = ()=>tryNext(i+1);
      document.head.appendChild(s);
    };
    tryNext(0);
  });
}
// إعداد الربط السحابي الافتراضي للشركة — بحيث يتصل أي جهاز جديد تلقائياً من غير أي خطوة إضافية
const DEFAULT_SB_CONFIG = { url: 'https://kitsnfpgcrsxizzimgwx.supabase.co', key: 'sb_publishable_p3siT7m9YcUNnbRIjiCq0w_l-MVdplw' };
function getSbConfig(){
  try{
    const raw = JSON.parse(window.localStorage.getItem('nitaq-sb')||'null');
    if(raw && raw.disabled) return null; // المستخدم ألغى الربط يدوياً من هذا الجهاز تحديداً
    if(raw && raw.url && raw.key) return raw; // المستخدم حط إعداد مخصص خاص به
  }catch(e){}
  return DEFAULT_SB_CONFIG; // الإعداد الافتراضي للشركة
}
function setSbConfig(cfg){
  try{ window.localStorage.setItem('nitaq-sb', JSON.stringify(cfg)); }catch(e){}
}
const CLOUD_ENTITIES = ['projects','contracts','payments','govFees','officeExpenses','projectCosts','recurringBills','treasury','otherIncome','employees','overtime','advances','leaves','timesheets','cars','decisions','auditLog'];
const ENGINEER_VIEWS = ['projects','contracts','decisions','govFees','cars'];

function recordsToData(rows){
  const d = {projects:[],contracts:[],payments:[],govFees:[],officeExpenses:[],projectCosts:[],recurringBills:[],treasury:[],otherIncome:[],employees:[],overtime:[],advances:[],leaves:[],timesheets:[],cars:[],decisions:[],auditLog:[],staffDir:[],attendance:{},fccState:{},settings:{projectsRoot:'D:\\Projects', bankName:'', iban:'', accountName:''}};
  rows.forEach(r=>{
    if(r.entity==='settings'){ d.settings = {...d.settings, ...r.data}; return; }
    if(r.entity==='attendance'){ if(r.data && r.data.empId) d.attendance[r.data.empId] = r.data.map||{}; return; }
    if(r.entity==='fccState'){ d.fccState = (r.data && r.data.map)||{}; return; }
    if(r.entity==='staffDir'){ d.staffDir.push({id:r.id, ...r.data}); return; }
    if(CLOUD_ENTITIES.includes(r.entity)) d[r.entity].push(r.data);
  });
  return d;
}

/* ================= طبقة التخزين: تعمل داخل Claude وخارجه ================= */
/* NITAQ persistence safety, step 02. Production storage keys are unchanged. */
const NITAQ_PERSIST = (()=>{
  const arrays=['projects','contracts','payments','govFees','officeExpenses','projectCosts','recurringBills','treasury','otherIncome','employees','overtime','advances','leaves','timesheets','cars','decisions','auditLog','staffDir'];
  const objects=['attendance','fccState','settings'];
  const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  let known=false, baseline=null, rawRead=null, memory=null, revision=0, tail=Promise.resolve();
  let state={ready:false,locked:false,pending:false,kind:'loading',message:'جارٍ التحقق من البيانات المحفوظة…'};
  let resolveLocal;
  const localGate=new Promise(resolve=>{resolveLocal=resolve;});
  const listeners=new Set();
  function publish(p){state={...state,...p};for(const fn of listeners)fn({...state});}
  function fail(error,kind='save'){publish({locked:true,kind,message:(error&&error.message)||String(error)});}
  function parse(raw){
    if(typeof raw==='string'&&raw.length>20*1024*1024)throw Error('حجم محتوى البيانات أكبر من الحد المسموح.');
    if(typeof raw!=='string'||!raw.trim())throw Error('البيانات المحفوظة فارغة أو تالفة. لم يتم استبدالها.');
    return JSON.parse(raw,(key,value)=>{if(key==='__proto__'||key==='constructor'||key==='prototype')throw Error('مفتاح غير آمن في البيانات.');return value;});
  }
  function inactiveContractNumber(entity,row,field,value){
    if(entity!=='contracts'||!(value===''||value===null||value===undefined))return false;
    if(row.archived===true&&['designValue','supervisionMonthly','supervisionMonths','commissionPct','commissionAmount','value'].includes(field))return true;
    const consultancy=!row.category||row.category==='خدمات استشارية';
    const contractor=row.category==='مقاول رئيسي'||row.category==='مقاول باطن';
    const combo=(row.type||'').includes('شامل');
    if(field==='designValue')return !consultancy||!combo;
    if(field==='supervisionMonthly'||field==='supervisionMonths')return !consultancy||!(row.type==='إشراف'||combo);
    if(field==='commissionPct')return !(contractor&&row.commissionType==='نسبة %');
    if(field==='commissionAmount')return !(contractor&&row.commissionType==='مبلغ ثابت');
    if(field==='value')return consultancy&&(row.type==='إشراف'||combo);
    return false;
  }
  function contractRestoreProblem(row,data){
    const consultancy=!row.category||row.category==='خدمات استشارية';
    const combo=(row.type||'').includes('شامل');
    const fields=consultancy&&(row.type==='إشراف'||combo)?['supervisionMonthly','supervisionMonths']:['value'];
    if(consultancy&&combo)fields.push('designValue');
    if(!consultancy&&row.commissionType==='نسبة %')fields.push('commissionPct');
    if(!consultancy&&row.commissionType==='مبلغ ثابت')fields.push('commissionAmount');
    if(fields.some(key=>typeof row[key]!=='number'||!Number.isFinite(row[key])))return 'هذا العقد المؤرشف يحتوي قيمًا أو مددًا غير مكتملة. راجع بياناته وأكملها من المستندات قبل إعادة تفعيله.';
    if(!row.projectId||!(data.projects||[]).some(p=>String(p.id)===String(row.projectId)))return 'راجع ربط العقد بمشروع موجود قبل إعادة تفعيله.';
    return '';
  }
  function validate(d){
    if(!plain(d)||![...arrays,'invoices','expenses'].some(k=>Object.prototype.hasOwnProperty.call(d,k)))throw Error('المحتوى ليس بيانات نظام معروفة.');
    for(const key of [...arrays,'invoices','expenses']){
      if(!Object.prototype.hasOwnProperty.call(d,key))continue;
      if(!Array.isArray(d[key]))throw Error('قائمة '+key+' تالفة؛ لم يتم تفريغها.');
      const seen=new Set();
      for(const row of d[key]){
        if(!plain(row)||!((typeof row.id==='string'&&row.id.trim())||(typeof row.id==='number'&&Number.isSafeInteger(row.id))))throw Error('سجل أو معرف غير صالح في '+key);
        if(seen.has(String(row.id)))throw Error('معرف مكرر في '+key);seen.add(String(row.id));
      }
    }
    const numericFields=new Set(['amount','collectedAmount','baseSalary','grossSalary','hours','rate','value','designValue','designFee','supervisionMonthly','supervisionMonths','commissionPct','commissionAmount','budgetAmount','monthlyInstallment','days']);
    for(const entity of [...arrays,'invoices','expenses'])for(const row of d[entity]||[])for(const [field,value] of Object.entries(row))if(numericFields.has(field)&&!inactiveContractNumber(entity,row,field,value)&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('رقم تالف في '+entity+'/'+row.id+'/'+field);
    for(const key of objects)if(Object.prototype.hasOwnProperty.call(d,key)&&!plain(d[key]))throw Error('الحقل '+key+' تالف.');
    if(d.attendance)for(const map of Object.values(d.attendance))if(!plain(map))throw Error('خريطة الحضور تالفة.');
    return d;
  }
  function prepare(raw){
    validate(raw);
    const result=migrateData(JSON.parse(JSON.stringify(raw)));
    for(const key of arrays)if(!Object.prototype.hasOwnProperty.call(result,key))result[key]=[];
    for(const key of objects)if(!Object.prototype.hasOwnProperty.call(result,key))result[key]={};
    return validate(result);
  }
  // IndexedDB is the selected browser backend. Legacy localStorage is read only
  // until a write has committed and its exact content has been verified.
  let accountingDatabasePromise;
  function accountingDatabase(){
    if(!accountingDatabasePromise){
      accountingDatabasePromise=new Promise((resolve,reject)=>{
        const request=indexedDB.open('nitaq-accounting-persistence-v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('records');
        request.onerror=()=>reject(request.error||Error('تعذر فتح مخزن بيانات الحسابات.'));
        request.onblocked=()=>reject(Error('أغلق نوافذ الحسابات القديمة ثم أعد المحاولة.'));
        request.onsuccess=()=>{
          const database=request.result;
          database.onversionchange=()=>{database.close();accountingDatabasePromise=null;};
          resolve(database);
        };
      }).catch(error=>{accountingDatabasePromise=null;throw error;});
    }
    return accountingDatabasePromise;
  }
  async function accountingDatabaseGet(key){
    const database=await accountingDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction('records','readonly');
      const request=transaction.objectStore('records').get(key);
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onerror=()=>reject(transaction.error||request.error);
      transaction.onabort=()=>reject(transaction.error||Error('تعذرت قراءة بيانات الحسابات.'));
    });
  }
  async function rawGet(key){
    if(window.storage&&typeof window.storage.get==='function'){
      const result=await window.storage.get(key,false);
      if(result==null)return null;
      if(typeof result.value!=='string')throw Error('رد التخزين غير صالح.');
      return result.value;
    }
    const value=await accountingDatabaseGet(key);
    if(value!==undefined){
      if(typeof value!=='string')throw Error('بيانات التخزين غير صالحة.');
      return value;
    }
    return window.localStorage.getItem(key);
  }
  async function rawSet(key,text){
    if(window.storage&&typeof window.storage.get==='function'){
      if(typeof window.storage.set!=='function')throw Error('التخزين لا يسمح بالكتابة.');
      await window.storage.set(key,text,false);
      return;
    }
    const legacy=window.localStorage.getItem(key);
    const database=await accountingDatabase();
    await new Promise((resolve,reject)=>{
      const transaction=database.transaction('records','readwrite');
      const request=transaction.objectStore('records').put(text,key);
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error||request.error);
      transaction.onabort=()=>reject(transaction.error||Error('تعذر حفظ بيانات الحسابات.'));
    });
    if(await accountingDatabaseGet(key)!==text)throw Error('تعذر تأكيد حفظ الحسابات؛ النسخة القديمة محفوظة.');
    // Remove only a verified migrated key, leaving unrelated browser data intact.
    if(legacy!==null&&window.localStorage.getItem(key)===legacy){
      window.localStorage.removeItem(key);
    }
  }
  function serial(work){const result=tail.then(work);tail=result.catch(()=>{});return result;}
  async function verifyCurrent(){
    if(!known)throw Error('قراءة التخزين لم تكتمل؛ الحفظ ممنوع.');
    if(await rawGet('nitaq-data')!==baseline)throw Error('تغيرت البيانات من نافذة أخرى. نزّل نسخة إنقاذ ثم أعد فتح النظام.');
  }
  const store={
    async get(key){
      const raw=await rawGet(key);
      if(key==='nitaq-data'){
        rawRead=raw;
        if(raw!==null)validate(parse(raw));
        baseline=raw;known=true;
      }
      return raw;
    },
    set(key,text){return serial(async()=>{
      if(state.locked&&state.kind!=='import')throw Error('الحفظ متوقف لحماية البيانات.');
      validate(parse(text));
      if(key==='nitaq-data')await verifyCurrent();
      await rawSet(key,text);
      const actual=await rawGet(key);
      if(actual!==text)throw Error('تعذر تأكيد الحفظ بعد الكتابة. نزّل نسخة إنقاذ.');
      if(key==='nitaq-data'){baseline=text;rawRead=text;}
      return {ok:true};
    }).catch(e=>{fail(e);throw e;});}
  };
  async function health(){if(!state.ready||state.locked)return;try{await serial(verifyCurrent);}catch(e){fail(e,'conflict');}}
  function download(text,name,type){
    const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function rescue(){
    if(state.ready&&memory)return download(JSON.stringify(memory,null,2),'nitaq-rescue-'+Date.now()+'.json','application/json');
    if(rawRead!==null)return download(rawRead,'nitaq-unreadable-storage-'+Date.now()+'.txt','text/plain');
    return download(JSON.stringify({error:state.message,dataRead:false},null,2),'nitaq-storage-error-'+Date.now()+'.json','application/json');
  }
  const maxImportBytes=20*1024*1024;
  function prepareImport(raw){
    validate(raw);
    const required=['projects','employees','attendance'];
    for(const key of required)if(!Object.prototype.hasOwnProperty.call(raw,key))throw Error('الملف نسخة جزئية: الحقل '+key+' مفقود.');
    if(!Array.isArray(raw.payments)&&!Array.isArray(raw.invoices))throw Error('قائمة الدفعات مفقودة.');
    if(!(Array.isArray(raw.officeExpenses)&&Array.isArray(raw.projectCosts))&&!Array.isArray(raw.expenses))throw Error('قوائم المصروفات مفقودة.');
    const legacy=Array.isArray(raw.invoices)||Array.isArray(raw.expenses);
    if(!legacy)for(const key of [...arrays.filter(k=>!['recurringBills','otherIncome','timesheets'].includes(k)),...objects])if(!Object.prototype.hasOwnProperty.call(raw,key))throw Error('نسخة حديثة جزئية: '+key+' مفقود.');
    const d=prepare(raw),warnings=[];
    const numeric=new Set(['amount','collectedAmount','baseSalary','grossSalary','hours','rate','value','designValue','designFee','supervisionMonthly','supervisionMonths','commissionPct','commissionAmount','budgetAmount','monthlyInstallment','days']);
    const allIds=new Set();
    const validRef=v=>(typeof v==='string'&&v.trim())||(typeof v==='number'&&Number.isSafeInteger(v));
    const archived=r=>r.archived===true||r.cancelled===true;
    const lookup={};for(const key of arrays)lookup[key]=new Map(d[key].map(r=>[String(r.id),r]));
    function issue(entity,row,field,message){if(archived(row))warnings.push({entity,id:row.id,field,message});else throw Error(message+' ('+entity+'/'+row.id+')');}
    for(const entity of arrays)for(const row of d[entity]){
      const id=String(row.id);if(allIds.has(id))throw Error('معرف مستخدم في أكثر من قائمة: '+id);allIds.add(id);
      for(const [key,value] of Object.entries(row)){
        if(numeric.has(key)&&!inactiveContractNumber(entity,row,key,value)&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('رقم غير صالح في '+entity+'/'+id+'/'+key);
        if(['archived','cancelled'].includes(key)&&typeof value!=='boolean')throw Error('قيمة الأرشفة غير صالحة في '+entity+'/'+id);
        if(['timeline','approvals','docSnapshot'].includes(key)&&!plain(value))throw Error('حقل مركب غير صالح في '+entity+'/'+id+'/'+key);
      }
      if(['contracts','payments','govFees','projectCosts'].includes(entity)&&!validRef(row.projectId))issue(entity,row,'projectId','معرف المشروع مفقود');
      if(entity==='payments'&&['تصميم','إشراف'].includes(row.phase)&&!validRef(row.contractId))issue(entity,row,'contractId','عقد الدفعة مفقود');
      if(['overtime','advances','leaves'].includes(entity)&&!validRef(row.employeeId))issue(entity,row,'employeeId','معرف الموظف مفقود');
      for(const [field,target] of Object.entries({projectId:'projects',contractId:'contracts',employeeId:'employees'})){
        if(!Object.prototype.hasOwnProperty.call(row,field)||row[field]===''||row[field]===null)continue;
        if(!validRef(row[field])||!lookup[target].has(String(row[field])))issue(entity,row,field,'علاقة مفقودة: '+field);
      }
      if(['payments','govFees','officeExpenses','projectCosts','treasury','recurringBills','advances'].includes(entity)&&typeof row.amount!=='number')throw Error('مبلغ مفقود أو غير صالح: '+entity+'/'+id);
      if(entity==='payments'){
        if(typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount<0)throw Error('مبلغ دفعة غير صالح: '+id);
        if(row.collectedAmount!==undefined&&(row.collectedAmount<0||row.collectedAmount>row.amount))throw Error('التحصيل يتجاوز المبلغ أو سالب: '+id);
        const contract=lookup.contracts.get(String(row.contractId));
        if(contract&&String(contract.projectId)!==String(row.projectId))issue(entity,row,'contractId','العقد والدفعة يتبعان مشروعين مختلفين');
      }
    }
    for(const [empId,map] of Object.entries(d.attendance)){
      if(Object.values(map).some(v=>typeof v!=='string'))throw Error('قيمة حضور غير صالحة: '+empId);
      if(!lookup.employees.has(String(empId))&&!d.staffDir.some(r=>String(r.empId)===String(empId)))warnings.push({entity:'attendance',id:empId,message:'حضور تاريخي دون موظف في الدليل الحالي'});
    }
    return {data:d,warnings};
  }
  function beginReplacement(){
    if(!state.ready||state.locked)throw Error('النظام غير جاهز للاستبدال.');
    publish({locked:true,pending:true,kind:'import',message:'جارٍ حفظ نسخة ما قبل الاستبدال والتحقق منها…'});
  }
  function replaceStored(next,previous){return serial(async()=>{
    if(state.kind!=='import'||!state.locked)throw Error('لم تبدأ عملية استبدال آمنة.');
    validate(next);validate(previous);await verifyCurrent();
    const backupKey='nitaq-before-replace:'+Date.now()+':'+Math.random().toString(36).slice(2);
    const backupText=JSON.stringify(previous);
    await rawSet(backupKey,backupText);
    if(await rawGet(backupKey)!==backupText)throw Error('فشل التحقق من نسخة ما قبل الاستبدال؛ لم نستبدل البيانات.');
    await rawSet('nitaq-last-replace-backup',backupKey);
    if(await rawGet('nitaq-last-replace-backup')!==backupKey)throw Error('فشل حفظ مرجع نسخة الاسترجاع؛ لم نستبدل البيانات.');
    const text=JSON.stringify(next);
    await rawSet('nitaq-data',text);
    if(await rawGet('nitaq-data')!==text)throw Error('فشل تأكيد حفظ البيانات الجديدة. نسخة ما قبل الاستبدال محفوظة.');
    baseline=text;rawRead=text;memory=next;revision++;
    return {backupKey};
  }).catch(e=>{fail(e,'import-failed');throw e;});}
  function finishReplacement(next){memory=next;publish({locked:false,pending:false,kind:'saved',message:'✓ تم الاستبدال محليًا وحفظ نسخة الاسترجاع؛ لم تُرفع بيانات للسحابة'});}
  async function downloadPrevious(){
    try{
      const key=await rawGet('nitaq-last-replace-backup');
      if(!key)throw Error('لا توجد نسخة تلقائية سابقة للاستبدال على هذا الجهاز.');
      const raw=await rawGet(key);validate(parse(raw));
      download(raw,'nitaq-before-replace-'+Date.now()+'.json','application/json');
    }catch(e){alert(e.message||'تعذر قراءة نسخة الاسترجاع.');}
  }

  window.addEventListener('beforeunload',e=>{if(state.pending||(state.locked&&state.ready)){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(e.key==='nitaq-data'||e.key===null)health();});
  window.addEventListener('focus',health);
  return {
    readAux(key){if(!key.startsWith('nitaq-sync:'))throw Error('Invalid auxiliary key');return serial(()=>rawGet(key));},
    writeAux(key,text){if(!key.startsWith('nitaq-sync:'))throw Error('Invalid auxiliary key');return serial(async()=>{if(state.locked)throw Error('التخزين متوقف لحماية البيانات.');await rawSet(key,text);if(await rawGet(key)!==text)throw Error('تعذر تأكيد حفظ طابور المزامنة.');});},
    store,parse,validate,contractRestoreProblem,prepare,prepareImport,maxImportBytes,beginReplacement,replaceStored,finishReplacement,downloadPrevious,fail,rescue,localGate,health,
    get status(){return {...state};},get revision(){return revision;},
    get blocked(){return !state.ready||state.locked;},
    subscribe(fn){listeners.add(fn);fn({...state});return ()=>listeners.delete(fn);},
    finishLocal(){resolveLocal();},
    loaded(d){validate(d);memory=d;publish({ready:true,locked:false,pending:false,kind:'ready',message:'تمت قراءة البيانات بأمان'});},
    remember(d){memory=d;},
    changed(d){memory=d;revision++;publish({pending:true,kind:'saving',message:'تغييرات لم تُحفظ بعد…'});},
    saved(ticket){if(!state.locked)publish({pending:revision!==ticket,kind:revision===ticket?'saved':'saving',message:revision===ticket?'✓ تم الحفظ المحلي والتحقق منه':'تغييرات أحدث قيد الحفظ…'});}
  };
})();
const store = NITAQ_PERSIST.store;
/* NITAQ sync client v1. No credentials are written to the journal. */
function createNitaqSyncClient(io){
  const clone=x=>JSON.parse(JSON.stringify(x));
  const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  let session=null,generation=0,listeners=new Set();
  const emit=()=>{const s=stats();for(const f of listeners)f(s);};
  function stats(){const s=session;return {ready:!!s&&s.ready&&!s.stopped,fatal:!!s?.fatal,pending:s?.jobs.length||0,blocked:s?.jobs.filter(j=>j.status==='blocked').length||0,busy:!!s?.busy,volatile:!!s?.writes,message:s?.message||'',jobs:clone(s?.jobs||[])};}
  function current(s){return session===s&&!s.stopped;}
  function validRow(r){if(!r||typeof r.id!=='string'||!r.id||typeof r.entity!=='string'||!r.data||typeof r.data!=='object'||Array.isArray(r.data)||!r.updated_at)throw Error('سجل سحابي غير صالح.');if(r.data.id!==undefined&&String(r.data.id)!==r.id)throw Error('معرف السجل السحابي لا يطابق محتواه.');return r;}
  async function scan(client){
    const rows=[],seen=new Set();let last=null,total=null;
    for(let n=0;n<10000;n++){
      let q=client.from('nitaq_records').select('*',last===null?{count:'exact'}:undefined).order('id',{ascending:true}).limit(1000);
      if(last!==null)q=q.gt('id',last);
      const result=await q;if(result.error)throw result.error;
      if(!Array.isArray(result.data))throw Error('رد تحميل السحابة غير صالح.');
      if(total===null){if(!Number.isSafeInteger(result.count)||result.count<0)throw Error('تعذر تأكيد عدد السجلات السحابية.');total=result.count;}
      if(!result.data.length){if(rows.length!==total)throw Error('تغير عدد السجلات أثناء التحميل.');return rows;}
      for(const raw of result.data){const r=validRow(raw);if(seen.has(r.id))throw Error('سجل مكرر أثناء التحميل.');seen.add(r.id);rows.push(clone(r));}
      const next=rows[rows.length-1].id;if(next===last||rows.length>total)throw Error('تحميل سحابي غير متسق.');last=next;
      if(rows.length===total)return rows;
    }
    throw Error('تجاوز التحميل حد الصفحات المسموح.');
  }
  async function loadStable(client){let previous=null,lastError;
    for(let i=0;i<4;i++)try{const rows=await scan(client),signature=canon(rows);if(signature===previous)return rows;previous=signature;lastError=Error('البيانات تتغير أثناء التحميل؛ لم نعتمد نسخة جزئية.');}catch(e){previous=null;lastError=e;}
    throw lastError||Error('تعذر تأكيد اكتمال التحميل.');
  }
  function rowMap(rows){return new Map(rows.map(r=>[r.id,clone(r)]));}
  function overlay(s){const rows=new Map(s.base);for(const j of s.jobs){if(j.kind==='delete')rows.delete(j.id);else rows.set(j.id,{id:j.id,entity:j.entity,data:clone(j.data)});}return [...rows.values()];}
  function snapshot(s){if(current(s)&&s.ready&&io.onSnapshot)io.onSnapshot(overlay(s));}
  function journal(s){return JSON.stringify({version:1,url:s.url,userId:s.userId,jobs:s.jobs});}
  function fatal(s,error){s.fatal=true;s.message='توقف حفظ طابور المزامنة؛ نزّل نسخة إنقاذ.';emit();io.onFatal?.(error);}
  function persist(s){
    s.writes++;emit();const task=s.tail.then(async()=>{await io.write(s.key,journal(s));});
    s.tail=task.catch(e=>{fatal(s,e);}).finally(()=>{s.writes--;emit();});return task;
  }
  function validateJobs(doc,s){
    if(!doc||doc.version!==1||doc.url!==s.url||doc.userId!==s.userId||!Array.isArray(doc.jobs))throw Error('طابور المزامنة لا يطابق المستخدم أو المشروع.');
    const tokens=new Set();for(const j of doc.jobs){
      if(!j||!Object.prototype.hasOwnProperty.call(j,'expected')||typeof j.token!=='string'||!j.token||tokens.has(j.token)||typeof j.id!=='string'||!j.id||typeof j.entity!=='string'||!['upsert','delete'].includes(j.kind)||!['pending','blocked'].includes(j.status))throw Error('طابور المزامنة تالف؛ لم يتم تفريغه.');
      if(j.kind==='upsert'&&(!j.data||typeof j.data!=='object'||Array.isArray(j.data)||(j.data.id!==undefined&&String(j.data.id)!==j.id)))throw Error('بيانات عملية مزامنة تالفة.');
      if(j.expected?.after&&(!tokens.has(j.expected.after)||doc.jobs.find(p=>p.token===j.expected.after)?.id!==j.id))throw Error('اعتماد مفقود في طابور المزامنة.');
      if(j.expected&&!j.expected.after){validRow(j.expected);if(j.expected.id!==j.id||j.expected.entity!==j.entity)throw Error('نسخة أساس المزامنة غير متسقة.');}
      tokens.add(j.token);
    }
  }
  async function attach({client,url,userId}){
    if(session&&current(session)&&session.url===url&&session.userId===userId){session.client=client;return refresh();}
    await detach();const token=++generation;
    const s={client,url,userId,key:'nitaq-sync:outbox:'+encodeURIComponent(url)+':'+encodeURIComponent(userId),jobs:[],base:new Map(),mapVersion:0,ready:false,stopped:false,fatal:false,busy:false,writes:0,tail:Promise.resolve(),message:'جارٍ تحميل السحابة وطابور العمليات…',retryTimer:null,release:null};
    session=s;emit();
    try{
      s.release=await io.acquire(s.key);if(token!==generation||!current(s)){s.release();throw Error('تغيرت جلسة المستخدم.');}
      const caps=await client.rpc('nitaq_sync_capabilities_v1');if(caps.error)throw caps.error;
      if(caps.data?.protocol!==1||caps.data?.expected_mode!=='row_snapshot')throw Error('تأسيس المزامنة غير متوافق.');
      const raw=await io.read(s.key);if(raw!==null){const d=JSON.parse(raw);validateJobs(d,s);s.jobs=clone(d.jobs);}
      if(caps.data.financial_bundle!==1)throw Error('يلزم تركيب الحزمة المالية المجمعة على Supabase قبل فتح هذه النسخة.');
      if(caps.data.financial_controls!==1)throw Error('يلزم تركيب ضوابط الدفعات على Supabase قبل فتح هذه النسخة.');
      const rows=await loadStable(client);if(token!==generation||!current(s))throw Error('تغيرت جلسة المستخدم.');
      s.base=rowMap(rows);s.ready=true;s.message=s.jobs.length?'توجد عمليات محفوظة تنتظر المزامنة':'✓ تم تحميل السحابة والتحقق من اكتمالها';emit();snapshot(s);return overlay(s);
    }catch(e){if(current(s)){s.message=e.message||String(e);s.stopped=true;s.release?.();emit();}throw e;}
  }
  async function detach(){
    const s=session;++generation;if(!s)return;s.stopped=true;s.ready=false;io.cancel?.(s.retryTimer);emit();
    await s.tail;if(s.fatal){s.release?.();throw Error('تعذر حفظ الطابور؛ نزّل نسخة الإنقاذ والعمليات قبل تغيير الحساب.');}s.release?.();if(session===s)session=null;emit();
  }
  function enqueue(kind,id,entity,data){
    const s=session;if(!s||!current(s)||!s.ready||s.fatal)throw Error('لم تجهز هوية المزامنة؛ التعديل متوقف.');
    const prior=[...s.jobs].reverse().find(j=>j.id===String(id));
    const expected=prior?{after:prior.token}:(s.base.get(String(id))?clone(s.base.get(String(id))):null);
    const job={token:io.uid(),kind,id:String(id),entity,data:kind==='upsert'?clone(data):null,expected,status:'pending'};
    if(!job.id||typeof entity!=='string')throw Error('عملية مزامنة غير صالحة.');
    s.jobs.push(job);s.mapVersion++;s.message='جارٍ حفظ العملية قبل إرسالها…';emit();
    const task=persist(s);task.then(()=>flush()).catch(()=>{});return task;
  }
  function findEntity(id){const s=session;if(!s)return null;return [...s.jobs].reverse().find(j=>j.id===String(id))?.entity||s.base.get(String(id))?.entity||null;}
  function pending(id){return !!session?.jobs.some(j=>j.id===String(id));}
  function blockedError(e){return /NITAQ_(CONFLICT|BAD_|ID_|OPERATION_|DATA_|DELETE_|UPDATE_|INSERT_)/.test(e.message||'')||e.code==='42501'||e.code==='22023';}
  async function flush(){
    const s=session;if(!s||!current(s)||!s.ready||s.fatal||s.busy||io.canSend&&!io.canSend())return;
    io.cancel?.(s.retryTimer);s.retryTimer=null;s.busy=true;emit();
    try{
      await s.tail;
      while(current(s)&&!s.fatal&&(!io.canSend||io.canSend())){
        const job=s.jobs.find(j=>j.status==='pending'&&!j.expected?.after);if(!job)break;
        try{
          const response=await s.client.rpc('nitaq_sync_apply_v1',{p_operation_id:job.token,p_kind:job.kind,p_id:job.id,p_entity:job.entity,p_data:job.data,p_expected:job.expected});
          if(response.error)throw response.error;
          if(!current(s))break;
          const r=response.data;if(!r||r.ok!==true||r.operation_id!==job.token||r.id!==job.id||r.kind!==job.kind||r.entity!==job.entity)throw Error('تأكيد العملية من الخادم غير صالح.');
          if(job.kind==='upsert'){validRow(r.row);if(r.row.id!==job.id||r.row.entity!==job.entity)throw Error('تأكيد الخادم يخص سجلًا آخر.');s.base.set(job.id,clone(r.row));}else s.base.delete(job.id);
          s.mapVersion++;s.jobs=s.jobs.filter(j=>j.token!==job.token);
          for(const next of s.jobs)if(next.expected?.after===job.token)next.expected=job.kind==='upsert'?clone(r.row):null;
          await persist(s);snapshot(s);
        }catch(error){
          if(!current(s)||s.fatal)break;
          job.error={code:error.code||'',message:error.message||String(error)};
          if(blockedError(error)){job.status='blocked';s.message='تعديل متعارض أو مرفوض يحتاج مراجعة؛ لم نستبدل بيانات الخادم.';await persist(s);continue;}
          s.message='⚠ تعذر الاتصال؛ العمليات محفوظة وستُعاد المحاولة';emit();
          s.retryTimer=io.schedule?.(()=>flush(),15000);break;
        }
      }
    }finally{if(current(s)){s.busy=false;if(!s.jobs.length&&!s.fatal)s.message='✓ جميع العمليات مؤكدة من الخادم';else if(!s.fatal&&s.jobs.some(j=>j.status==='blocked'))s.message='⚠ توجد عمليات تحتاج مراجعة؛ لم نعلن اكتمال المزامنة';emit();}}
  }
  async function retry(){const s=session;if(!s||!current(s)||s.fatal)return;for(const j of s.jobs)if(j.status==='blocked'&&!/NITAQ_CONFLICT/.test(j.error?.message||'')){j.status='pending';delete j.error;}await persist(s);return flush();}
  async function refresh(){const s=session;if(!s||!current(s)||!s.ready)throw Error('المزامنة غير جاهزة.');const version=s.mapVersion;const rows=await loadStable(s.client);if(current(s)){if(version===s.mapVersion&&!s.busy){s.base=rowMap(rows);s.mapVersion++;snapshot(s);}emit();return overlay(s);}throw Error('تغيرت جلسة المستخدم.');}
  function remote(payload){
    const s=session;if(!s||!current(s)||!s.ready)return;
    const id=payload.eventType==='DELETE'?payload.old?.id:payload.new?.id;if(!id||pending(id))return;
    s.mapVersion++;if(payload.eventType==='DELETE')s.base.delete(String(id));else s.base.set(String(id),clone(validRow(payload.new)));
    snapshot(s);
  }
  return {attach,detach,enqueue,flush,retry,refresh,remote,pending,findEntity,loadStable,
    get state(){return stats();},get identity(){return session&&current(session)&&session.ready?{url:session.url,userId:session.userId}:null;},
    subscribe(f){listeners.add(f);f(stats());return()=>listeners.delete(f);},
    exportPending(){return session?journal(session):JSON.stringify({version:1,jobs:[]});}
  };
}

function createNitaqScopedTransport(rootClient,cfg,userId,request=fetch){
  async function send(route,method,body,query,countExact=false){
    const auth=await rootClient.auth.getSession();if(auth.error)throw auth.error;
    const session=auth.data?.session;
    if(!session?.access_token||session.user?.id!==userId)throw Object.assign(Error('تغير حساب المستخدم؛ لم نرسل العملية.'),{code:'42501'});
    const url=new URL(cfg.url.replace(/\/$/,'')+'/rest/v1/'+route);
    if(query)for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
    // Capture the token in this request; changing the browser session cannot replace it mid-request.
    const response=await request(url.toString(),{method,headers:{apikey:cfg.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(countExact?{Prefer:'count=exact'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();if(!response.ok)return {data:null,error:{code:data?.code||String(response.status),message:data?.message||'فشل طلب المزامنة'}};
    const range=response.headers.get('content-range'),total=range?.split('/').pop();
    return {data,error:null,count:total&&total!=='*'?Number(total):null};
  }
  return {
    rpc:(name,args)=>{if(!['nitaq_sync_apply_v1','nitaq_sync_capabilities_v1'].includes(name))throw Error('RPC غير مسموح.');return send('rpc/'+name,'POST',args||{});},
    from:table=>{
      if(table!=='nitaq_records')throw Error('جدول غير مسموح في عميل المزامنة.');
      const query={};let countExact=false;const builder={
        select(columns,opts){query.select=columns;countExact=opts?.count==='exact';return builder;},order(field,opts){query.order=field+(opts?.ascending===false?'.desc':'.asc');return builder;},
        limit(n){query.limit=n;return builder;},gt(field,value){query[field]='gt.'+value;return builder;},
        then(resolve,reject){return send(table,'GET',undefined,query,countExact).then(resolve,reject);}
      };return builder;
    }
  };
}

const NITAQ_SYNC=createNitaqSyncClient({
  read:key=>NITAQ_PERSIST.readAux(key),write:(key,text)=>NITAQ_PERSIST.writeAux(key,text),
  uid:()=>window.crypto?.randomUUID?window.crypto.randomUUID():uid(),
  canSend:()=>!NITAQ_PERSIST.blocked,
  schedule:(fn,ms)=>setTimeout(()=>Promise.resolve(fn()).catch(e=>NITAQ_PERSIST.fail(e,'sync')),ms),cancel:id=>clearTimeout(id),
  onFatal:e=>NITAQ_PERSIST.fail(e,'sync'),
  acquire:key=>new Promise((resolve,reject)=>{
    if(!window.navigator?.locks){reject(Error('المزامنة الآمنة تحتاج متصفحًا يدعم قفل التبويب. افتح النظام في Chrome أو Edge حديث عبر HTTPS أو محليًا.'));return;}
    window.navigator.locks.request(key,{ifAvailable:true},async lock=>{
      if(!lock){reject(Error('النظام مفتوح للمستخدم نفسه في تبويب آخر. أغلق التبويب الآخر ثم أعد المحاولة.'));return;}
      await new Promise(release=>resolve(release));
    }).catch(reject);
  }),
  onSnapshot:rows=>window.dispatchEvent(new CustomEvent('nitaq-sync-snapshot',{detail:rows}))
});
window.addEventListener('beforeunload',e=>{const q=NITAQ_SYNC.state;if(q.pending||q.volatile){e.preventDefault();e.returnValue='';}});

/* ================= Generic Modal Form (يدعم الحقول الشرطية) ================= */
function FormModal({title, fields, initial, onCancel, onSave, data, lockedFields=[], lockedNotice, graceNotice, adminOverrideNotice}){
  const [values, setValues] = useState(()=>{
    const v = {...initial};
    fields.forEach(f=>{ if(v[f.name]===undefined) v[f.name] = f.type==='ownerList' ? [] : ''; });
    fields.forEach(f=>{ if(f.type==='ownerList' && !Array.isArray(v[f.name])) v[f.name] = []; });
    fields.forEach(f=>{ if(f.initCompute && (v[f.name]===''||v[f.name]===undefined)) v[f.name] = f.initCompute(v); });
    return v;
  });
  const set = (name,val) => setValues(v=>{
    const nx = {...v, [name]:val};
    const f = fields.find(ff=>ff.name===name);
    if(f && f.sync){ Object.assign(nx, f.sync(nx)); }
    return nx;
  });
  const visible = fields.filter(f=> !f.showIf || f.showIf(values));
  const submit = (e) => {
    e.preventDefault();
    const clean = {...values};
    fields.forEach(f=>{
      if(f.ephemeral){ delete clean[f.name]; return; }
      if(lockedFields.includes(f.name)){ clean[f.name] = initial[f.name]; return; }
      if(f.showIf && !f.showIf(values)){ clean[f.name] = (f.type==='number' ? 0 : (f.type==='ownerList' ? [] : '')); return; }
      if(f.type==='number') clean[f.name] = parseFloat(clean[f.name])||0;
      if(f.type==='ownerList') clean[f.name] = (clean[f.name]||[]).filter(o=> (o.name||'').trim()!=='');
    });
    onSave(clean);
  };
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" onClick={onCancel}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {lockedNotice && <div style={{padding:'9px 12px', background:'#FEF9F0', borderInlineStart:'3px solid var(--brass)', fontSize:11.5, marginBottom:14, color:'var(--ink-soft)', lineHeight:1.7}}>{lockedNotice}</div>}
            {graceNotice && <div style={{padding:'9px 12px', background:'var(--teal-soft)', borderInlineStart:'3px solid var(--teal)', fontSize:11.5, marginBottom:14, color:'var(--ink)', lineHeight:1.7}}>⏳ {graceNotice}</div>}
            {adminOverrideNotice && <div style={{padding:'9px 12px', background:'var(--blue-soft)', borderInlineStart:'3px solid var(--blue)', fontSize:11.5, marginBottom:14, color:'var(--ink)', lineHeight:1.7}}>🛠 {adminOverrideNotice}</div>}
            {visible.map(f=>{
              const locked = lockedFields.includes(f.name);
              return (
              <div className="field" key={f.name}>
                <label htmlFor={f.type==='ownerList'||(f.type==='file'&&values[f.name])?undefined:'accounting-field-'+f.name}>{f.label}{(typeof f.required==='function' ? f.required(values) : f.required) && ' *'}{locked && <span style={{color:'var(--brass)', marginInlineStart:6, fontSize:10}}>🔒</span>}</label>
                {f.type==='select' ? (
                  <select id={'accounting-field-'+f.name} required={typeof f.required==='function' ? f.required(values) : f.required} disabled={locked} value={values[f.name]||''}
                    onChange={e=>{
                      if(f.allowAddNew && e.target.value==='__ADDNEW__'){
                        const n = prompt(f.addNewPrompt || 'اسم التصنيف الجديد:');
                        if(n===null) return;
                        const nn = n.trim();
                        if(!nn){ alert('التصنيف لا يمكن أن يكون فارغاً'); return; }
                        const opts = (typeof f.options==='function' ? f.options(data, values) : f.options);
                        if(opts.some(o=>String(o.value).trim()===nn)){ alert('هذا التصنيف موجود بالفعل — تم اختياره من القائمة'); }
                        set(f.name, nn); return;
                      }
                      set(f.name, e.target.value);
                    }} style={locked?{background:'#F2F0EA', cursor:'not-allowed'}:{}}>
                    <option value="">اختر...</option>
                    {(typeof f.options==='function' ? f.options(data, values) : f.options).map(o=>(
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    {f.allowAddNew && values[f.name] && !(typeof f.options==='function' ? f.options(data, values) : f.options).some(o=>o.value===values[f.name]) && (
                      <option value={values[f.name]}>{values[f.name]} (جديد)</option>
                    )}
                    {f.allowAddNew && <option value="__ADDNEW__">{f.addNewLabel || '➕ إضافة تصنيف جديد...'}</option>}
                  </select>
                ) : f.type==='textarea' ? (
                  <textarea id={'accounting-field-'+f.name} rows="3" disabled={locked} value={values[f.name]||''} onChange={e=>set(f.name,e.target.value)} style={locked?{background:'#F2F0EA', cursor:'not-allowed'}:{}} />
                ) : f.type==='ownerList' ? (
                  <div>
                    {(values[f.name]||[]).map((row,idx)=>(
                      <div key={idx} style={{display:'flex', gap:8, marginBottom:8, alignItems:'flex-start', flexWrap:'wrap'}}>
                        {(f.subFields||[]).map(sf=>(
                          <input key={sf.name} type="text" aria-label={sf.label} placeholder={sf.label} disabled={locked}
                            value={row[sf.name]||''}
                            style={{flex: sf.name==='name'?'1 1 160px':'1 1 120px', minWidth:110}}
                            onChange={e=>{
                              const arr = [...(values[f.name]||[])];
                              arr[idx] = {...arr[idx], [sf.name]:e.target.value};
                              set(f.name, arr);
                            }} />
                        ))}
                        {!locked && (
                          <button type="button" className="btn ghost small" title="حذف هذا المالك"
                            onClick={()=>{
                              const arr = (values[f.name]||[]).filter((_,i)=>i!==idx);
                              set(f.name, arr);
                            }}
                            style={{color:'var(--rust)', flex:'0 0 auto'}}>✕</button>
                        )}
                      </div>
                    ))}
                    {!locked && (
                      <button type="button" className="btn outline small"
                        onClick={()=>{
                          const arr = [...(values[f.name]||[]), {}];
                          set(f.name, arr);
                        }}>
                        <I.plus/> إضافة مالك
                      </button>
                    )}
                  </div>
                ) : f.type==='file' ? (
                  <div>
                    {values[f.name] ? (
                      <div style={{border:'1px solid var(--line-strong)', borderRadius:6, padding:8, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                        {String(values[f.name]).startsWith('data:image')
                          ? <img src={values[f.name]} alt="مرفق" style={{height:56, borderRadius:4, border:'1px solid var(--line)'}} />
                          : <span style={{fontSize:20}}>📄</span>}
                        <a href={values[f.name]} target="_blank" rel="noopener" download={values[f.name+'_name']||'فاتورة'} style={{fontSize:12, color:'var(--teal)', fontWeight:700}}>
                          {values[f.name+'_name'] || 'عرض / تنزيل المرفق'}
                        </a>
                        {!locked && <button type="button" className="btn ghost small" style={{color:'var(--rust)'}} onClick={()=>{ set(f.name,''); set(f.name+'_name',''); }}>✕ إزالة</button>}
                      </div>
                    ) : (
                      <input id={'accounting-field-'+f.name} type="file" accept="image/*,application/pdf" disabled={locked}
                        onChange={e=>{
                          const file = e.target.files && e.target.files[0];
                          if(!file) return;
                          if(file.size > 1024*1024){ alert('الملف أكبر من 1 ميجابايت. اختاري صورة أصغر أو اضغطيها أولاً.'); e.target.value=''; return; }
                          const reader = new FileReader();
                          reader.onload = ()=>{ set(f.name, reader.result); set(f.name+'_name', file.name); };
                          reader.readAsDataURL(file);
                        }} />
                    )}
                  </div>
                ) : (
                  <input id={'accounting-field-'+f.name} type={f.type||'text'} required={typeof f.required==='function' ? f.required(values) : f.required} disabled={locked} step={f.type==='number' ? '0.01' : undefined}
                    value={values[f.name]===undefined?'':values[f.name]} onChange={e=>set(f.name,e.target.value)} style={locked?{background:'#F2F0EA', cursor:'not-allowed'}:{}} />
                )}
                {f.hint && <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:4}}>{f.hint}</div>}
              </div>
            );})}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn outline" onClick={onCancel}>إلغاء</button>
            <button type="submit" className="btn brass">حفظ</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================= Generic Entity View ================= */
function EntityView({config, records, data, onAdd, onUpdate, onDelete, headExtra, rowActions, onRowClick, role}){
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const sorted = useMemo(()=> [...records].sort(config.sortFn || ((a,b)=> (b._ts||0)-(a._ts||0))), [records, config]);
  const query = q.trim().toLowerCase();
  const archivedCount = sorted.filter(r=>isArchived(r)).length;
  const activeRecords = showArchived ? sorted : sorted.filter(r=>!isArchived(r));
  const filtered = query ? activeRecords.filter(r=> rowSearchText(r, data).includes(query)) : activeRecords;

  return (
    <div>
      <div className="toolbar">
        <div className="section-title" style={{marginBottom:0, flex:1}}>
          <h3>{config.title}</h3>
          <div className="rule"></div>
        </div>
        <input className="searchbox" placeholder={'بحث في '+config.title+'...'} value={q} onChange={e=>setQ(e.target.value)} />
        {archivedCount>0 && (
          <button className="btn ghost small" onClick={()=>setShowArchived(!showArchived)} style={{color:showArchived?'var(--brass)':'var(--ink-faint)'}}>
            {showArchived ? '✓ عرض المؤرشف' : '📦 '+archivedCount+' مؤرشف'}
          </button>
        )}
        {headExtra}
        <button className="btn brass" onClick={()=>setModal({mode:'add'})}>
          <I.plus/> إضافة {config.singular}
        </button>
      </div>
      <div className="card" style={{padding:0}}>
        <div style={{overflowX:'auto'}}>
        <table>
          <thead>
            <tr>
              {config.columns.map(c=>(<th key={c.key}>{c.label}</th>))}
              <th style={{width:120}}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr className="empty-row"><td colSpan={config.columns.length+1}>{query ? 'لا نتائج مطابقة للبحث "'+q+'"' : 'لا توجد بيانات بعد — ابدأ بالإضافة'}</td></tr>
            )}
            {filtered.map(row=>(
              <tr key={row.id} onClick={onRowClick ? ()=>onRowClick(row) : undefined} style={{...(onRowClick?{cursor:'pointer'}:{}), ...(isArchived(row)?{opacity:0.5, background:'#F8F6F0'}:{})}}>
                {config.columns.map(c=>{
                  const val = c.render ? c.render(row,data) : row[c.key];
                  return c.truncate
                    ? <td key={c.key} className="cell-clip" title={typeof val==='string' ? val : (row[c.key]||'')}>{val}</td>
                    : <td key={c.key}>{val}</td>;
                })}
                <td onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',gap:4}}>
                    {rowActions && rowActions(row)}
                    <button className="btn ghost small" onClick={()=>setModal({mode:'edit', record:row})}><I.edit/></button>
                    {config.allowAdminOverride && role==='owner' && (
                      <button className="btn ghost small" title="تصحيح إداري (مالك فقط) — يفتح كل الحقول للتعديل لمرة واحدة ويُسجَّل في سجل التدقيق"
                        style={{color:'var(--blue)'}}
                        onClick={()=>{
                          const reason = prompt('سبب التصحيح الإداري — إلزامي (يُسجل باسمك في سجل التدقيق):');
                          if(reason===null) return;
                          if(!reason.trim()){ alert('لا يمكن فتح التصحيح الإداري بدون سبب مسجل'); return; }
                          setModal({mode:'adminEdit', record:row, reason:reason.trim()});
                        }}>🛠</button>
                    )}
                    {config.entityKey && protectedFromHardDelete(config.entityKey, row) ? (
                      isArchived(row) ? (
                        <button className="btn ghost small" title="مؤرشف — اضغط لإلغاء الأرشفة" style={{color:'var(--brass)'}}
                          onClick={()=>{ if(confirm('إلغاء أرشفة هذا السجل وإعادته للاستخدام؟')) onUpdate(row.id, {archived:false, cancelled:false, archiveReason:'', archivedAt:''}); }}>📁</button>
                      ) : (
                        <button className="btn ghost small" title="أرشفة / إلغاء (لا يمكن الحذف النهائي)" style={{color:'var(--rust)'}}
                          onClick={()=>{
                            if(config.archiveGuard){
                              const err = config.archiveGuard(row, data);
                              if(err){ alert(err); return; }
                            }
                            const reason = prompt('سبب الأرشفة/الإلغاء — إلزامي (يُسجل في سجل التدقيق):');
                            if(reason===null) return;
                            if(!reason.trim()){ alert('لا يمكن الأرشفة بدون سبب مسجل'); return; }
                            onUpdate(row.id, {archived:true, archiveReason:reason.trim(), archivedAt:todayISO()});
                          }}>📦</button>
                      )
                    ) : (
                      <button className="btn ghost small danger" onClick={()=>{ if(confirm('تأكيد الحذف؟')) onDelete(row.id); }}><I.trash/></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {config.footRow && filtered.length>0 && (
            <tfoot>{config.footRow(filtered, data)}</tfoot>
          )}
        </table>
        </div>
      </div>
      {modal && (
        <FormModal
          title={(modal.mode==='add' ? 'إضافة ' : modal.mode==='adminEdit' ? '🛠 تصحيح إداري — ' : 'تعديل ') + config.singular}
          fields={config.fields}
          initial={modal.record || config.defaults || {}}
          data={data}
          lockedFields={modal.mode==='edit' && config.lockedFor ? config.lockedFor(modal.record) : []}
          lockedNotice={modal.mode==='edit' && config.lockedFor && config.lockedFor(modal.record).length>0 ? config.lockedNotice : null}
          graceNotice={modal.mode==='edit' && config.graceNoticeFor ? config.graceNoticeFor(modal.record) : null}
          adminOverrideNotice={modal.mode==='adminEdit' ? 'هذا تعديل إداري كامل الصلاحية خارج القيود المعتادة (متاح للمالك فقط). كل الحقول مفتوحة، والتغييرات هتتسجل في سجل التدقيق مع السبب اللي كتبته.' : null}
          onCancel={()=>setModal(null)}
          onSave={(vals)=>{
            if(config.validate){
              const err = config.validate(vals, data, modal.mode, modal.record);
              if(err){ alert(err); return; }
            }
            if(modal.mode==='add') onAdd({...vals, id:uid(), _ts:Date.now()});
            else if(modal.mode==='adminEdit'){if(onUpdate(modal.record.id, {...vals, lastCorrectionReason:modal.reason, lastCorrectionAt:new Date().toISOString()})===false)return;}
            else if(onUpdate(modal.record.id, vals)===false)return;
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

/* ================= Entity Configs ================= */
function buildConfigs(data){
  const r2 = (x)=> Math.round((parseFloat(x)||0)*100)/100;
  const payF = (v)=> (v.taxable==='غير خاضعة') ? 1 : 1.05;
  const expF = (v)=> v.vatable==='غير خاضع' ? 1 : 1.05;
  const employeeOptions = (d)=> (d.employees&&d.employees.length ? d.employees.map(e=>({value:e.id,label:e.name})) : (d.staffDir||[]).map(s=>({value:s.empId,label:s.name})));
  const projectOptions = (d)=> d.projects.map(p=>({value:p.id, label:(p.projectNo?p.projectNo+' — ':'')+p.name}));
  const empName = (id,d)=> (d.employees.find(e=>e.id===id)||{}).name || '—';
  const projName = (id,d)=>{ const p=(d.projects||[]).find(x=>x.id===id); return p ? (p.projectNo?p.projectNo+' — ':'')+p.name : '—'; };
  const contractValue = (p,d)=>{
    const cons = (d.contracts||[]).filter(c=>c.projectId===p.id && c.status!=='ملغى' && !isArchived(c) && (isConsultancy(c)));
    if(cons.length>0) return cons.reduce((s,c)=> s + contractTotalOf(c), 0);
    return (p.designFee||0) + (p.supervisionMonthly||0)*(p.supervisionMonths||0);
  };
  const nextProjectNo = (d)=> Math.max(104, ...d.projects.map(p=>p.projectNo||0)) + 1;

  return {
    projects:{
      title:'المشاريع', singular:'مشروع', entityKey:'projects',
      archiveGuard:(row, d)=>{
        const out = d.payments.filter(i=>i.projectId===row.id).reduce((s,i)=>s+remainderOf(i)*grossFactor(i),0);
        const amanat = d.govFees.filter(g=>!isArchived(g) && g.projectId===row.id && g.payerType!=='المالك مباشرة' && g.paidStatus==='مدفوع' && g.reimburseStatus!=='مسترد').reduce((s,g)=>s+g.amount,0);
        const comm = (d.contracts||[]).filter(c=>!isArchived(c) && c.projectId===row.id && c.category && c.category!=='خدمات استشارية').reduce((s,c)=>{
          const cm = contractCommission(c);
          const inv = d.payments.filter(i=>i.contractId===c.id).reduce((x,i)=>x+billedOf(i),0);
          return s + Math.max(0, cm-inv);
        },0);
        const probs = [];
        if(out>1) probs.push('ذمم غير محصّلة: '+money(out));
        if(amanat>1) probs.push('أمانات لم تُسترد: '+money(amanat));
        if(comm>1) probs.push('عمولات غير مفوترة: '+money(comm));
        return probs.length ? 'لا يمكن أرشفة المشروع — بنود مالية مفتوحة:\n• '+probs.join('\n• ')+'\n\nاستخدم "قائمة إقفال المشروع" داخل ملف المشروع لمراجعتها.' : null;
      },
      fields:[
        {name:'projectNo', label:'رقم المشروع', type:'number', required:true, hint:'ترقيم تلقائي تسلسلي يبدأ من 105 — كل الفواتير والسندات ستحمل هذا الرقم'},
        {name:'name', label:'اسم المشروع', required:true},
        {name:'owner', label:'اسم المالك', required:true},
        {name:'owningEntity', label:'الجهة المالكة (إن وجدت)'},
        {name:'ownerTrn', label:'الرقم الضريبي للمالك (TRN) — اختياري', hint:'يظهر على الفاتورة الضريبية إذا كان المالك مسجلاً بالضريبة'},
        {name:'additionalOwners', label:'ملاك إضافيون (شركاء في الملكية) — اختياري', type:'ownerList',
          subFields:[{name:'name', label:'اسم المالك'}, {name:'entity', label:'الجهة (إن وجدت)'}, {name:'trn', label:'TRN — اختياري'}],
          hint:'المالك الأساسي يُكتب في الحقول أعلاه — استخدم "+ إضافة مالك" هنا لإضافة شركاء آخرين في ملكية المشروع'},
        {name:'landType', label:'نوع الأرض', type:'select', options:[{value:'ملك',label:'ملك'},{value:'منحة',label:'منحة'}], required:true, hint:'أرض الملك لها رقمان (حكومي + ملك) — أرض المنحة لها الرقم الحكومي فقط'},
        {name:'plotNumber', label:'الرقم الحكومي (اختياري)'},
        {name:'ownershipNumber', label:'رقم الأرض (ملك) — اختياري', showIf:v=>v.landType==='ملك'},
        {name:'emirate', label:'الإمارة', type:'select', options:EMIRATES.map(e=>({value:e,label:e})), required:true},
        {name:'area', label:'المنطقة'},
        {name:'projectType', label:'نوع المشروع', type:'select', allowAddNew:true,
          options:(d)=>{
            const used = [...new Set((d.projects||[]).map(p=>p.projectType).filter(Boolean))];
            const all = [...PROJECT_TYPES, ...used.filter(t=>!PROJECT_TYPES.includes(t))];
            return all.map(t=>({value:t,label:t}));
          }, required:true, hint:'لا تجد النوع؟ اختر "➕ إضافة تصنيف جديد" من آخر القائمة — وهيفضل متاح لباقي المشاريع بعد كده'},
        {name:'engineer', label:'المهندس المسؤول'},
        {name:'status', label:'حالة المشروع', type:'select', options:[{value:'جارٍ',label:'جارٍ'},{value:'منتهٍ',label:'منتهٍ (اكتمل العقد)'},{value:'مفسوخ',label:'مفسوخ (أنهى المالك العقد قبل اكتماله)'},{value:'متوقف',label:'متوقف'}], required:true},
        {name:'terminationReason', label:'سبب فسخ العقد', type:'textarea', showIf:v=>v.status==='مفسوخ', hint:'مثال: أنهى المالك العقد في مرحلة التصميم / توقف المشروع نهائياً من جهة المالك — يُحفظ للتوثيق'},
        {name:'startDate', label:'تاريخ فتح المشروع', type:'date', required:true},
        {name:'budgetAmount', label:'ميزانية التكاليف المباشرة (د.إ) — اختياري', type:'number', hint:'سقف تقديري لتكاليف المشروع المباشرة — النظام ينبهك عند تجاوزه'},
        {name:'estHours', label:'الساعات المقدّرة للمشروع — اختياري', type:'number', hint:'عدد الساعات المتوقع أن يستغرقها المشروع — يقارنها النظام بالساعات الفعلية لتحسين التسعير'},
        {name:'folderName', label:'اسم مجلد المشروع (اختياري)', hint:'الافتراضي: رقم المشروع - اسمه، مثال: 105 - Villa Ahmed'},
        {name:'quickNotes', label:'ملاحظات سريعة للفريق', type:'textarea', hint:'ملاحظات يومية سريعة تظهر أعلى ملف المشروع — للتذكيرات والتنبيهات الجارية'},
      ],
      columns:[
        {key:'projectNo', label:'رقم', render:r=><b style={{fontSize:14, color:'var(--brass)'}}>{r.projectNo}</b>},
        {key:'name', label:'اسم المشروع'},
        {key:'owner', label:'المالك', render:r=> <span>{r.owner||'—'}{(r.additionalOwners||[]).filter(o=>o.name).length>0 && <span className="badge neutral" style={{marginInlineStart:6, fontSize:9}}>+{(r.additionalOwners||[]).filter(o=>o.name).length}</span>}</span>},
        {key:'projectType', label:'النوع', render:r=>r.projectType||'—'},
        {key:'area', label:'المنطقة', render:r=> (r.emirate||'')+(r.area?' — '+r.area:'')},
        {key:'contract', label:'قيمة العقود', render:(r,d)=><b>{money(contractValue(r,d))}</b>},
        {key:'status', label:'الحالة', render:r=>{
          const cls = r.status==='جارٍ'?'neutral':r.status==='منتهٍ'?'ok':'bad';
          return <span className={"badge "+cls}>{r.status}</span>;
        }},
      ],
      defaults:{status:'جارٍ', startDate:todayISO(), emirate:'الشارقة', projectNo:nextProjectNo(data), landType:'ملك'},
    },
    contracts:{
      title:'عقود المشروع', singular:'عقد', entityKey:'contracts',
      archiveGuard:(row, d)=>{
        const open = d.payments.filter(i=>!isArchived(i) && i.contractId===row.id && remainderOf(i)>0);
        return open.length ? 'العقد له '+open.length+' دفعة نشطة غير محصّلة بالكامل — حصّلها أو ألغِها أولاً ثم ألغِ العقد.' : null;
      },
      fields:[
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'category', label:'فئة العقد', type:'select', options:CONTRACT_CATEGORIES.map(c=>({value:c,label:c})), required:true, hint:'عقود الخدمات الاستشارية هي إيراد المكتب — عقود المقاولين للمتابعة والإشراف فقط'},
        {name:'type', label:'نطاق الخدمات الاستشارية', type:'select', allowAddNew:true,
          options:(d)=>{
            const used = [...new Set((d.contracts||[]).map(c=>c.type).filter(Boolean))];
            return [...CONTRACT_TYPES, ...used.filter(t=>!CONTRACT_TYPES.includes(t))].map(t=>({value:t,label:t}));
          }, showIf:v=>v.category==='خدمات استشارية'||!v.category, required:true, hint:'لا تجد النطاق؟ اختر "➕ إضافة تصنيف جديد" من آخر القائمة. ملاحظة: الأنواع المضافة تُعامل كعقد بقيمة واحدة (خيارات التصميم/الإشراف/الشامل محجوزة للأنواع الأساسية)'},
        {name:'subType', label:'تخصص مقاول الباطن', type:'select', options:SUBCONTRACT_TYPES.map(t=>({value:t,label:t})), showIf:v=>v.category==='مقاول باطن', required:true},
        {name:'contractor', label:'اسم المقاول', showIf:v=>v.category==='مقاول رئيسي'||v.category==='مقاول باطن', required:true},
        {name:'commissionType', label:'عمولة الاستشاري من هذا العقد', type:'select', options:[{value:'بدون',label:'بدون عمولة'},{value:'نسبة %',label:'نسبة % من قيمة العقد'},{value:'مبلغ ثابت',label:'مبلغ ثابت'}], showIf:v=>v.category==='مقاول رئيسي'||v.category==='مقاول باطن', required:true, hint:'قيمة عقد المقاول لا تدخل إيرادات المكتب — العمولة فقط هي الدخل، وتتحول لدفعة استشارية بزر التوليد'},
        {name:'commissionPct', label:'نسبة العمولة %', type:'number', showIf:v=>(v.category==='مقاول رئيسي'||v.category==='مقاول باطن')&&v.commissionType==='نسبة %', required:true},
        {name:'commissionAmount', label:'قيمة العمولة (د.إ)', type:'number', showIf:v=>(v.category==='مقاول رئيسي'||v.category==='مقاول باطن')&&v.commissionType==='مبلغ ثابت', required:true},
        {name:'description', label:'وصف العقد', required:true},
        {name:'designValue', label:'قيمة التصميم والاعتماد (د.إ)', type:'number', showIf:v=>(v.category==='خدمات استشارية'||!v.category)&&(v.type||'').indexOf('شامل')>-1, required:true},
        {name:'supervisionMonthly', label:'قيمة الإشراف الشهري (د.إ)', type:'number', showIf:v=>(v.category==='خدمات استشارية'||!v.category)&&(v.type==='إشراف'||(v.type||'').indexOf('شامل')>-1), required:true},
        {name:'supervisionMonths', label:'مدة الإشراف (بالشهور)', type:'number', showIf:v=>(v.category==='خدمات استشارية'||!v.category)&&(v.type==='إشراف'||(v.type||'').indexOf('شامل')>-1), required:true},
        {name:'value', label:'قيمة العقد (د.إ)', type:'number', showIf:v=>!((v.category==='خدمات استشارية'||!v.category)&&(v.type==='إشراف'||(v.type||'').indexOf('شامل')>-1)), required:true},
        {name:'note', label:'ملاحظات للفريق', type:'textarea'},
        {name:'date', label:'تاريخ العقد', type:'date', required:true},
        {name:'status', label:'الحالة', type:'select', options:[{value:'سارٍ',label:'سارٍ'},{value:'منتهٍ',label:'منتهٍ'},{value:'ملغى',label:'ملغى'}], required:true},
      ],
      columns:[
        {key:'project', label:'المشروع', render:(r,d)=>projName(r.projectId,d)},
        {key:'category', label:'الفئة', render:r=>{
          const cat = r.category||'خدمات استشارية';
          return <span className={"badge "+(cat==='خدمات استشارية'?'neutral':cat==='مقاول رئيسي'?'soon':'gray')}>{cat}</span>;
        }},
        {key:'detail', label:'التفاصيل', render:r=>{
          const cat = r.category||'خدمات استشارية';
          if(cat==='خدمات استشارية'){
            if(r.type==='إشراف') return (r.type||'')+' — '+money(r.supervisionMonthly)+' × '+(r.supervisionMonths||0)+' شهر';
            if(isComboContract(r)) return 'شامل — تصميم '+money(r.designValue||0)+' + إشراف '+money(r.supervisionMonthly)+' × '+(r.supervisionMonths||0)+' شهر';
            return r.type||'';
          }
          return (cat==='مقاول باطن' ? (r.subType||'')+' — ' : '')+(r.contractor||'');
        }},
        {key:'description', label:'الوصف'},
        {key:'note', label:'ملاحظات', render:r=> r.note ? <span title={r.note} style={{fontSize:11.5}}>{r.note.slice(0,35)}{r.note.length>35?'…':''}</span> : '—'},
        {key:'value', label:'القيمة', render:r=><b>{money((r.category==='خدمات استشارية'||!r.category) ? contractTotalOf(r) : (r.value||0))}</b>},
        {key:'fin', label:'مفوتر / محصّل', render:(r,d)=>{
          if(r.category && r.category!=='خدمات استشارية') return '—';
          const total = contractTotalOf(r);
          if(total<=0) return '—';
          const inv = (d.payments||[]).filter(i=>i.contractId===r.id).reduce((s,i)=>s+billedOf(i),0);
          const col = (d.payments||[]).filter(i=>i.contractId===r.id).reduce((s,i)=>s+collectedOf(i),0);
          return (
            <span style={{fontSize:11.5}}>
              فُوتر {Math.round(inv/total*100)}% · حُصّل {Math.round(col/total*100)}%
              <div className="progress" style={{width:70, marginTop:3}}><div style={{width:Math.min(100, col/total*100)+'%'}}></div></div>
            </span>
          );
        }},
        {key:'commission', label:'عمولة الاستشاري', render:(r,d)=>{
          const cm = contractCommission(r);
          if(cm<=0) return '—';
          const invoiced = (d.payments||[]).filter(i=>i.contractId===r.id).reduce((s,i)=>s+billedOf(i),0);
          return <span>{money(cm)} {invoiced>=cm*0.999 ? <span className="badge ok">مفوترة</span> : invoiced>0 ? <span className="badge soon">جزئياً</span> : <span className="badge gray">لم تُفوتر</span>}</span>;
        }},
        {key:'date', label:'التاريخ'},
        {key:'status', label:'الحالة', render:r=><span className={"badge "+(r.status==='سارٍ'?'ok':r.status==='منتهٍ'?'gray':'bad')}>{r.status}</span>},
      ],
      defaults:{date:todayISO(), status:'سارٍ', category:'خدمات استشارية', type:'تصميم واعتماد', commissionType:'بدون'},
    },
    decisions:{
      title:'القرارات والوقائع', singular:'قرار',
      fields:[
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'category', label:'التصنيف', type:'select', options:DECISION_CATEGORIES.map(c=>({value:c,label:c})), required:true},
        {name:'description', label:'الوصف', type:'textarea', required:true},
        {name:'responsible', label:'المسؤول'},
        {name:'status', label:'الحالة', type:'select', options:DECISION_STATUSES.map(s=>({value:s,label:s})), required:true},
        {name:'estCost', label:'التكلفة التقديرية (د.إ)', type:'number', showIf:v=>v.category==='أمر تغيير (Variation)', hint:'اتركها صفراً إذا لم تُقدَّر بعد'},
        {name:'ref', label:'مرجع المرفق', hint:'مثال: الصورة في جروب واتساب بتاريخ كذا، أو مسار ملف في مجلد المشروع'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'project', label:'المشروع', render:(r,d)=>projName(r.projectId,d)},
        {key:'category', label:'التصنيف', render:r=><span className={"badge "+(r.category==='اعتماد المالك'?'ok':r.category==='مهمة'?'soon':(r.category||'').indexOf('تغيير')>-1?'bad':'gray')}>{r.category}</span>},
        {key:'description', label:'الوصف'},
        {key:'responsible', label:'المسؤول', render:r=>r.responsible||'—'},
        {key:'source', label:'المصدر', render:r=><span className="badge gray">{r.source||'يدوي'}</span>},
        {key:'status', label:'الحالة', render:r=><span className={"badge "+(r.status==='منفذ'?'ok':r.status==='مفتوح'?'soon':r.status==='ملغى'?'bad':'neutral')}>{r.status}</span>},
      ],
      defaults:{date:todayISO(), status:'مفتوح', category:'اعتماد المالك', source:'يدوي'},
    },
    payments:{
      title:'الدفعات الاستشارية', singular:'دفعة', entityKey:'payments',
      archiveGuard:(row)=>{
        const col = collectedOf(row);
        if(col>0) return 'لا يمكن أرشفة دفعة محصلة. تصحيح الإدخال يحتاج المالك وسببًا مسجلًا؛ رد الأموال الفعلي يحتاج حركة مالية مستقلة.';
        if(row.invoiceNo && row.date){
          const invQ = quarterOfYM(monthKey(row.date));
          const curQ = quarterOfYM(currentYM());
          if(invQ && curQ && invQ < curQ) return 'هذه الفاتورة تعود لفترة ضريبية سابقة ('+quarterLabel(invQ)+') غالباً قُدّم إقرارها للهيئة.\nإلغاؤها الآن يجعل أرقام النظام مخالفة للإقرار المقدَّم.\nالمسار المتوافق مع الهيئة: إشعار دائن ضريبي يُعكس في الفترة الحالية، أو إفصاح طوعي إن كان الفارق كبيراً — راجع مستشارك الضريبي.';
        }
        return null;
      },
      lockedFor:(r)=> (paymentIssued(r) || collectedOf(r)>0) ? ['projectId','contractId','phase','taxable','amount','label','month','date','dueDate'] : [],
      lockedNotice:'بيانات المستند أو التحصيل مقفلة. التصحيح متاح للمالك بسبب مسجل على الخادم، دون استثناء زمني.',
      allowAdminOverride:true,
      validate:(v, d, mode, record)=>{
        if(v.contractId && v.phase==='إشراف'){
          const dup = (d.payments||[]).find(p=> !isArchived(p) && p.contractId===v.contractId && p.phase==='إشراف' && p.month===v.month && p.id!==(record&&record.id));
          if(dup) return 'يوجد بالفعل دفعة إشراف مسجلة لنفس الشهر ('+fmtMonth(v.month)+') على هذا العقد — راجع قائمة الدفعات قبل الإضافة لتفادي الفوترة المزدوجة لنفس الشهر.';
        }
        if(v.contractId && v.phase==='تصميم'){
          const c = (d.contracts||[]).find(x=>x.id===v.contractId);
          if(c){
            const designTotal = c.type==='إشراف' ? 0 : (isComboContract(c) ? (c.designValue||0) : (c.value||0));
            if(designTotal>0){
              const already = (d.payments||[]).filter(p=> !isArchived(p) && p.status!=='ملغاة' && p.contractId===v.contractId && p.phase==='تصميم' && p.id!==(record&&record.id)).reduce((s,p)=>s+(p.amount||0),0);
              if(already + (v.amount||0) > designTotal*1.001){
                return 'مجموع دفعات التصميم على هذا العقد سيتجاوز قيمة التصميم في العقد ('+money(designTotal)+').\nالمُدخل من قبل: '+money(already)+' + هذه الدفعة: '+money(v.amount||0)+'.\nراجع القيم قبل الحفظ.';
              }
            }
          }
        }
        return null;
      },
      fields:[
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'contractId', label:'العقد', type:'select', options:(d,v)=> (d.contracts||[]).filter(c=> c.projectId===(v&&v.projectId) && isConsultancy(c)
            && (v.phase==='إشراف' ? contractHasSupervision(c) : v.phase==='تصميم' ? c.type!=='إشراف' : true)
          ).map(c=>({value:c.id, label:(c.type||'')+' — '+(c.description||'')})), showIf:v=>!!v.projectId, required:(v)=> v.phase==='تصميم'||v.phase==='إشراف', hint:'إلزامي لدفعات التصميم والإشراف — بدونه لا تُحسب نسب العقد (فُوتر/حُصّل) ولا يعمل توليد الإشراف بشكل سليم. القائمة مفلترة تلقائياً حسب نوع الدفعة المختار.'},
        {name:'phase', label:'نوع الدفعة', type:'select', options:[
          {value:'تصميم', label:'تصميم / اعتماد المخططات'},
          {value:'إشراف', label:'إشراف ميداني شهري'},
          {value:'أخرى', label:'رسوم أخرى خاضعة للضريبة (فحوصات، خدمات خارجية...)'},
        ], required:true, hint:'"تصميم" هو نفس الاختيار لكل أقساط التصميم (الأولى، الثانية...) — مش بيتغيّر حسب رقم القسط. الفرق بين الأقساط بيتحدد في خانة "وصف الدفعة" تحت.',
          sync:(v)=>({amountGross: v.amount==='' ? '' : r2((parseFloat(v.amount)||0) * payF(v))})},
        {name:'label', label:'وصف الدفعة', showIf:v=>v.phase!=='إشراف', required:(v)=>v.phase==='تصميم', hint:'هنا بتحدد رقم القسط بنفسك: اكتب مثلاً "الدفعة الأولى — توقيع العقد 50%" ثم في القسط التاني اكتب "الدفعة الثانية — الاعتماد النهائي 50%". نوع الدفعة (تصميم) بيفضل واحد، الفرق بيبان هنا بس.'},
        {name:'month', label:'شهر الإشراف', type:'month', showIf:v=>v.phase==='إشراف', required:true},
        {name:'taxable', label:'الخضوع لضريبة القيمة المضافة', type:'select', options:[{value:'خاضعة',label:'خاضعة للضريبة (5%)'},{value:'غير خاضعة',label:'غير خاضعة / معفاة'}], required:true, hint:'الافتراضي "خاضعة" لكل الدفعات. اختر "غير خاضعة" فقط لو الدفعة معفاة فعلياً — مثل مبالغ مدفوعة نيابة عن المالك بإيصال باسمه.',
          sync:(v)=>({amountGross: v.amount==='' ? '' : r2((parseFloat(v.amount)||0) * payF(v))})},
        {name:'amount', label:'المبلغ قبل الضريبة (د.إ)', type:'number', required:true,
          sync:(v)=>({amountGross: v.amount==='' ? '' : r2((parseFloat(v.amount)||0) * payF(v))})},
        {name:'amountGross', label:'المبلغ شامل الضريبة (د.إ)', type:'number', ephemeral:true,
          sync:(v)=>({amount: v.amountGross==='' ? '' : r2((parseFloat(v.amountGross)||0) / payF(v))}),
          initCompute:(v)=> (v.amount===''||v.amount===undefined) ? '' : r2((parseFloat(v.amount)||0) * payF(v)),
          hint:'اكتب المبلغ المتفق عليه شاملاً — يُحسب الصافي تلقائياً بالقسمة على 1.05 (وفق معادلة الهيئة). التعديل في أي من الخانتين يحدّث الأخرى'},
        {name:'date', label:'تاريخ الإصدار', type:'date', required:true},
        {name:'dueDate', label:'تاريخ الاستحقاق', type:'date', required:true},
        {name:'status', label:'حالة السداد', type:'select', options:[{value:'مدفوعة',label:'مدفوعة بالكامل'},{value:'مدفوعة جزئياً',label:'مدفوعة جزئياً'},{value:'معلقة',label:'معلقة'},{value:'متأخرة',label:'متأخرة'},{value:'ملغاة',label:'ملغاة (فسخ عقد — تسقط ولا تُحتسب)'}], required:true},
        {name:'cancelReason', label:'سبب الإلغاء', type:'textarea', showIf:v=>v.status==='ملغاة', required:true, hint:'مثال: فُسخ العقد من المالك قبل تنفيذ العمل / ارتجع الشيك ولم تُستحق الخدمة. يُحفظ للتوثيق والتدقيق'},
        {name:'collectedAmount', label:'المبلغ المحصّل قبل الضريبة (د.إ)', type:'number', showIf:v=>v.status==='مدفوعة جزئياً', required:true, hint:'الجزء الذي دفعه المالك فعلاً من قيمة الدفعة'},
        {name:'paidDate', label:'تاريخ استلام الدفعة', type:'date', showIf:v=>v.status==='مدفوعة'||v.status==='مدفوعة جزئياً', required:true},
        {name:'method', label:'طريقة الدفع', type:'select', options:[{value:'نقداً',label:'نقداً'},{value:'شيك',label:'شيك'},{value:'تحويل بنكي',label:'تحويل بنكي'},{value:'بطاقة',label:'بطاقة (دفع إلكتروني)'}], showIf:v=>v.status==='مدفوعة'||v.status==='مدفوعة جزئياً',
          sync:(v)=>({account: v.method==='نقداً' ? 'الخزينة' : 'البنك'})},
        {name:'account', label:'الحساب المستلِم', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], showIf:v=>v.status==='مدفوعة'||v.status==='مدفوعة جزئياً', required:true, hint:'يُحدَّد تلقائياً من طريقة الدفع (تحويل/شيك/بطاقة ← البنك، نقداً ← الخزينة) — ويمكن تعديله يدوياً. الدفعات القديمة تُعتبر "البنك" افتراضياً'},
        {name:'refNo', label:'رقم الشيك / مرجع التحويل أو العملية', showIf:v=>(v.status==='مدفوعة'||v.status==='مدفوعة جزئياً') && v.method && v.method!=='نقداً'},
        {name:'chequeDueDate', label:'تاريخ صرف الشيك المتوقع', type:'date', showIf:v=>(v.status==='مدفوعة'||v.status==='مدفوعة جزئياً') && v.method==='شيك', hint:'لو الشيك مؤجل ولسه ما اتصرفش من البنك — النظام هينبهك قبل تاريخه بـ10 أيام'},
        {name:'note', label:'ملاحظات (تظهر على الإيصال)'},
      ],
      columns:[
        {key:'project', label:'المشروع', render:r=>projName(r.projectId, data)},
        {key:'phase', label:'النوع', render:r=>(
          <span className={"badge "+(r.phase==='إشراف'?'neutral':r.phase==='أخرى'?'soon':'gray')}>{r.phase==='إشراف'?'إشراف':r.phase==='أخرى'?'رسوم أخرى':'تصميم واعتماد'}</span>
        )},
        {key:'label', label:'البند', render:r=> r.phase==='إشراف' ? ('إشراف '+(r.month?fmtMonth(r.month):'')) : (r.label||'—')},
        {key:'amount', label:'المبلغ', render:r=>money(r.amount)},
        {key:'vat', label:'ض.ق.م', render:r=> vatRateOf(r)===0 ? <span className="badge gray">معفاة</span> : money(r.amount*0.05)},
        {key:'total', label:'الإجمالي', render:r=><b>{money(r.amount*grossFactor(r))}</b>},
        {key:'dueDate', label:'الاستحقاق'},
        {key:'paidDate', label:'تاريخ الاستلام', render:r=> (r.status==='مدفوعة'||r.status==='مدفوعة جزئياً') ? (r.paidDate||r.date) : '—'},
        {key:'status', label:'الحالة', render:r=>{
          if(r.status==='مدفوعة جزئياً') return (
            <span>
              <span className="badge neutral">مدفوعة جزئياً</span>
              <div style={{fontSize:10.5, color:'var(--ink-faint)', marginTop:3}}>محصّل {money(collectedOf(r)*grossFactor(r))} · متبقٍ {money(remainderOf(r)*grossFactor(r))}</div>
            </span>
          );
          if(r.status==='ملغاة') return (
            <span>
              <span className="badge gray" style={{textDecoration:'line-through'}}>ملغاة</span>
              {r.cancelReason && <div style={{fontSize:10.5, color:'var(--ink-faint)', marginTop:3}} title={r.cancelReason}>فسخ عقد — {r.cancelReason.slice(0,30)}{r.cancelReason.length>30?'…':''}</div>}
            </span>
          );
          const cls = r.status==='مدفوعة'?'ok':r.status==='متأخرة'?'bad':'soon';
          return <span className={"badge "+cls}>{r.status}</span>;
        }},
      ],
      defaults:{date:todayISO(), dueDate:todayISO(), status:'معلقة', phase:'تصميم', taxable:'خاضعة'},
    },
    govFees:{
      title:'الرسوم الحكومية', singular:'رسم حكومي', entityKey:'govFees',
      archiveGuard:(row)=> (row.payerType!=='المالك مباشرة' && row.paidStatus==='مدفوع')
        ? 'هذا الرسم مدفوع من خزينة المكتب — إلغاؤه يُخفي الخصم من الخزينة رغم خروج المال فعلياً.\nإن كان القيد خاطئاً: عدّل حالة السداد إلى "غير مدفوع" أولاً ثم ألغِ.'
        : null,
      fields:[
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'department', label:'الدائرة الحكومية', type:'select', allowAddNew:true, addNewPrompt:'اسم الدائرة الحكومية الجديدة:',
          options:(d)=>{
            const used = [...new Set((d.govFees||[]).map(g=>g.department).filter(Boolean))];
            const all = [...GOV_DEPARTMENTS, ...used.filter(x=>!GOV_DEPARTMENTS.includes(x))];
            return all.map(x=>({value:x,label:x}));
          }, required:true, addNewLabel:'➕ إضافة دائرة جديدة...', hint:'لا تجد الدائرة؟ اختر "➕ إضافة دائرة جديدة" من آخر القائمة'},
        {name:'description', label:'تفصيل الرسم', required:true, hint:'مثال: رسوم اعتماد المخطط الهندسي / رسوم توصيل مؤقت'},
        {name:'descriptionEn', label:'تفصيل الرسم بالإنجليزي (اختياري)', hint:'يظهر في كشف الحساب الإنجليزي بدل العربي. اتركيه فارغاً لعرض النص العربي في كلتا اللغتين'},
        {name:'amount', label:'المبلغ (د.إ)', type:'number', required:true},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'receiptNo', label:'رقم الإيصال / المعاملة'},
        {name:'payerType', label:'طريقة السداد', type:'select', options:[{value:'المكتب',label:'من خزينة المكتب (أمانة تُسترد من المالك)'},{value:'المالك مباشرة',label:'دفع مباشر من المالك (رابط دفع / بوابة الدائرة)'}], required:true, hint:'الدفع المباشر من المالك لا يمس خزينة المكتب ولا يُنشئ أمانة — يُسجل للتوثيق فقط'},
        {name:'account', label:'الدفع من حساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], showIf:v=>v.payerType!=='المالك مباشرة', required:true, hint:'يُخصم من هذا الحساب عند السداد للدائرة، ويُعاد إليه عند الاسترداد من المالك'},
        {name:'paidStatus', label:'السداد للدائرة', type:'select', options:[{value:'مدفوع',label:'مدفوع للدائرة'},{value:'غير مدفوع',label:'غير مدفوع بعد'}], required:true},
        {name:'reimburseStatus', label:'الاسترداد من العميل', type:'select', options:[{value:'مسترد',label:'مسترد من العميل'},{value:'غير مسترد',label:'غير مسترد بعد'}], showIf:v=>v.payerType!=='المالك مباشرة', required:true},
        {name:'note', label:'ملاحظات للفريق', type:'textarea', hint:'مثال: رابط الدفع أُرسل للمالك بتاريخ كذا وبانتظار السداد'},
      ],
      columns:[
        {key:'project', label:'المشروع', render:r=>projName(r.projectId, data)},
        {key:'department', label:'الدائرة'},
        {key:'description', label:'التفصيل'},
        {key:'amount', label:'المبلغ', render:r=>money(r.amount)},
        {key:'receiptNo', label:'الإيصال', render:r=>r.receiptNo||'—'},
        {key:'payerType', label:'السداد', render:r=><span className={"badge "+(r.payerType==='المالك مباشرة'?'neutral':'gray')}>{r.payerType==='المالك مباشرة'?'المالك مباشرة':'المكتب (أمانة)'}</span>},
        {key:'paidStatus', label:'للدائرة', render:r=><span className={"badge "+(r.paidStatus==='مدفوع'?'ok':'soon')}>{r.paidStatus}</span>},
        {key:'reimburseStatus', label:'من العميل', render:r=> r.payerType==='المالك مباشرة' ? <span className="badge gray">لا ينطبق</span> : <span className={"badge "+(r.reimburseStatus==='مسترد'?'ok':'bad')}>{r.reimburseStatus}</span>},
        {key:'note', label:'ملاحظات', render:r=> r.note ? <span title={r.note} style={{fontSize:11.5}}>{r.note.slice(0,40)}{r.note.length>40?'…':''}</span> : '—'},
      ],
      defaults:{date:todayISO(), paidStatus:'غير مدفوع', reimburseStatus:'غير مسترد', account:'البنك', payerType:'المكتب'},
    },
    officeExpenses:{
      title:'مصروفات المكتب', singular:'مصروف مكتب',
      sortFn:(a,b)=> (b.date||'').localeCompare(a.date||''),
      fields:[
        {name:'category', label:'التصنيف', type:'select', allowAddNew:true,
          options:(d)=>{
            const used = [...new Set((d.officeExpenses||[]).map(e=>e.category).filter(Boolean))];
            const all = [...OFFICE_CATEGORIES, ...used.filter(c=>!OFFICE_CATEGORIES.includes(c))];
            return all.map(c=>({value:c,label:c}));
          }, required:true, hint:'لا تجد التصنيف؟ اختر "➕ إضافة تصنيف جديد" من آخر القائمة'},
        {name:'vendor', label:'المورّد (اختياري)', type:'select', allowAddNew:true,
          options:(d)=>{
            const used = [...new Set((d.officeExpenses||[]).map(e=>e.vendor).filter(Boolean))];
            const all = [...OFFICE_VENDORS, ...used.filter(v=>!OFFICE_VENDORS.includes(v))];
            return all.map(v=>({value:v,label:v}));
          }, hint:'الجهة اللي اتدفعلها (مثلاً Etisalat، SEWA، صاحب العقار) — يفيد لتجميع مصروفات كل مورّد وللتدقيق الضريبي. لا تجده؟ اختر "➕ إضافة مورّد جديد"'},
        {name:'vendorInvoiceNo', label:'رقم فاتورة المورّد (اختياري)', hint:'رقم الفاتورة الضريبية كما يظهر في فاتورة المورّد — مطلوب عند تدقيق الهيئة الاتحادية لضريبة المدخلات'},
        {name:'amount', label:'المبلغ قبل الضريبة (د.إ)', type:'number', required:true,
          sync:(v)=>({amountGross: v.amount==='' ? '' : r2((parseFloat(v.amount)||0) * expF(v))})},
        {name:'amountGross', label:'المبلغ شامل الضريبة (د.إ)', type:'number', ephemeral:true,
          sync:(v)=>({amount: v.amountGross==='' ? '' : r2((parseFloat(v.amountGross)||0) / expF(v))}),
          initCompute:(v)=> (v.amount===''||v.amount===undefined) ? '' : Math.round((parseFloat(v.amount)||0)*(v.vatable==='غير خاضع'?1:1.05)*100)/100,
          hint:'اكتب المبلغ كما في فاتورة المورد (شاملاً) — يُحسب الصافي تلقائياً'},
        {name:'payStatus', label:'حالة السداد', type:'select', options:[{value:'مدفوع',label:'مدفوع'},{value:'معلق',label:'معلق — لم يُسدد بعد'}], required:true, hint:'المصروف المعلق لا يُخصم من الخزينة حتى يتحول إلى مدفوع'},
        {name:'vatable', label:'خاضع لضريبة القيمة المضافة؟', type:'select', options:[{value:'خاضع',label:'خاضع 5% (لديك فاتورة ضريبية من المورد)'},{value:'غير خاضع',label:'غير خاضع / معفى / بدون فاتورة ضريبية'}], required:true, hint:'ضريبة المدخلات لا تُسترد إلا بفاتورة ضريبية سارية باسم المكتب — اختر "غير خاضع" إن لم توجد',
          sync:(v)=>({amountGross: v.amount==='' ? '' : r2((parseFloat(v.amount)||0) * expF(v))})},
        {name:'account', label:'الدفع من حساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'},{value:'شيك',label:'شيك صادر'}], required:true},
        {name:'bankName', label:'اسم البنك', showIf:v=>v.account==='البنك'||v.account==='شيك', hint:'اكتب WIO NITAQ لو الدفع من حساب المكتب — أي بنك تاني (زي ADCB) هيتحسب "دين علينا" تلقائياً. اكتب الاسم بنفس الصيغة في كل مرة عشان الفلتر والإجماليات تطلع صح'},
        {name:'bankRef', label:'الرقم المرجعي للعملية البنكية (اختياري)', showIf:v=>v.account==='البنك', hint:'رقم الحوالة / رقم العملية كما يظهر في كشف الحساب البنكي — يفيد عند المطابقة لاحقاً'},
        {name:'chequeNo', label:'رقم الشيك', showIf:v=>v.account==='شيك', required:true},
        {name:'chequeDueDate', label:'تاريخ صرف الشيك المتوقع', type:'date', showIf:v=>v.account==='شيك', required:true, hint:'التاريخ اللي المفروض المورد/الجهة يصرف فيه الشيك — النظام هينبهك قبله بـ10 أيام'},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'attachment', label:'صورة الفاتورة (اختياري)', type:'file', hint:'ارفعي صورة أو PDF للفاتورة الضريبية (أقل من 1 ميجا) — تُحفظ مع المصروف للتدقيق لاحقاً'},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'category', label:'التصنيف'},
        {key:'vendor', label:'المورّد', render:r=> r.vendor || <span style={{color:'var(--ink-faint)'}}>—</span>},
        {key:'amount', label:'قبل الضريبة', render:r=>money(r.amount)},
        {key:'vat', label:'الضريبة (5%)', render:r=> expVatRate(r)>0
          ? money((r.amount||0)*expVatRate(r))
          : <span style={{color:'var(--ink-faint)'}}>—</span>},
        {key:'gross', label:'شامل الضريبة', render:r=><b>{money(expGross(r))}</b>},
        {key:'debt', label:'دين علينا', render:r=> isDebtExpense(r)
          ? <b style={{color:'var(--rust)'}}>{money(expDebt(r))}</b>
          : <span style={{color:'var(--ink-faint)'}}>—</span>},
        {key:'payStatus', label:'السداد', render:r=> (r.payStatus==='معلق') ? <span className="badge soon">معلق</span> : <span className="badge ok">مدفوع</span>},
        {key:'account', label:'الحساب', render:r=> r.account||'—'},
        {key:'payDetails', label:'تفاصيل الدفع', truncate:true, render:r=>{
          if(r.account==='شيك') return 'شيك '+(r.chequeNo||'—')+' — استحقاق '+(r.chequeDueDate||'—');
          if(r.account==='البنك') return [r.bankName, r.bankRef].filter(Boolean).join(' — ') || '—';
          return '—';
        }},
        {key:'attachment', label:'فاتورة', render:r=> r.attachment
          ? <a href={safeAttachmentUrl(r.attachment)} target="_blank" rel="noopener" title={r.attachment_name||'عرض المرفق'} style={{textDecoration:'none', fontSize:16}}>📎</a>
          : <span style={{color:'var(--ink-faint)'}}>—</span>},
        {key:'note', label:'ملاحظات', truncate:true, render:r=>r.note||'—'},
      ],
      defaults:{date:todayISO(), account:'البنك', payStatus:'معلق', vatable:'خاضع'},
      footRow:(rows)=>{
        const totAmt = rows.reduce((s,e)=>s+(e.amount||0),0);
        const totVat = rows.reduce((s,e)=>s+(e.amount||0)*expVatRate(e),0);
        const totGross = rows.reduce((s,e)=>s+expGross(e),0);
        const totDebt = rows.reduce((s,e)=>s+expDebt(e),0);
        return (
          <tr style={{background:'#F4F1E8', borderTop:'2px solid var(--line-strong)', fontWeight:800}}>
            <td style={{fontWeight:800}}>الإجمالي</td>
            <td></td>
            <td></td>
            <td><b>{money(totAmt)}</b></td>
            <td><b>{money(totVat)}</b></td>
            <td><b>{money(totGross)}</b></td>
            <td><b style={{color:'var(--rust)'}}>{money(totDebt)}</b></td>
            <td colSpan={6}></td>
          </tr>
        );
      },
    },
    projectCosts:{
      title:'تكاليف المشاريع', singular:'تكلفة مشروع',
      fields:[
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'category', label:'التصنيف', type:'select', options:PROJECT_COST_CATEGORIES.map(c=>({value:c,label:c})), required:true},
        {name:'amount', label:'المبلغ قبل الضريبة (د.إ)', type:'number', required:true},
        {name:'vatable', label:'خاضع لضريبة القيمة المضافة؟', type:'select', options:[{value:'خاضع',label:'خاضع 5% (لديك فاتورة ضريبية)'},{value:'غير خاضع',label:'غير خاضع / معفى'}], required:true},
        {name:'account', label:'الدفع من حساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'},{value:'شيك',label:'شيك صادر'}], required:true},
        {name:'chequeNo', label:'رقم الشيك', showIf:v=>v.account==='شيك', required:true},
        {name:'chequeDueDate', label:'تاريخ صرف الشيك المتوقع', type:'date', showIf:v=>v.account==='شيك', required:true, hint:'التاريخ اللي المفروض المورد/المقاول يصرف فيه الشيك — النظام هينبهك قبله بـ10 أيام'},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'project', label:'المشروع', render:r=>projName(r.projectId, data)},
        {key:'category', label:'التصنيف'},
        {key:'amount', label:'المبلغ', render:r=>money(r.amount)},
        {key:'chequeDueDate', label:'استحقاق الشيك', render:r=> r.account==='شيك' ? ((r.chequeNo||'—')+' — '+(r.chequeDueDate||'—')) : '—'},
        {key:'note', label:'ملاحظات', truncate:true, render:r=>r.note||'—'},
      ],
      defaults:{date:todayISO(), account:'البنك', vatable:'خاضع'},
    },
    recurringBills:{
      title:'الفواتير الدورية', singular:'فاتورة دورية',
      fields:[
        {name:'provider', label:'اسم الجهة / الخدمة', required:true, hint:'مثال: اتصالات، دو، سيوا، مالك العقار (إيجار)...'},
        {name:'category', label:'نوع الخدمة', type:'select', allowAddNew:true,
          options:(d)=>{
            const base = ['اتصالات (هاتف/فاكس)','إنترنت','كهرباء وماء (سيوا)','إيجار المكتب','اشتراك برمجي','تأمين','أخرى'];
            const used = [...new Set((d.recurringBills||[]).map(b=>b.category).filter(Boolean))];
            return [...base, ...used.filter(c=>!base.includes(c))].map(c=>({value:c,label:c}));
          }, required:true},
        {name:'amount', label:'المبلغ المعتاد (د.إ)', type:'number', required:true, hint:'آخر مبلغ مدفوع أو المتوسط — يمكن تعديله لاحقاً عند كل سداد فعلي'},
        {name:'frequency', label:'دورية السداد', type:'select', options:[{value:'شهري',label:'شهري'},{value:'ربع سنوي',label:'ربع سنوي (كل 3 أشهر)'},{value:'نصف سنوي',label:'نصف سنوي (كل 6 أشهر)'},{value:'سنوي',label:'سنوي'}], required:true},
        {name:'nextDueDate', label:'تاريخ الاستحقاق القادم', type:'date', required:true},
        {name:'reminderDays', label:'التنبيه قبل الاستحقاق بكم يوم', type:'number', required:true},
        {name:'account', label:'تُسدد من حساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], required:true},
        {name:'active', label:'الحالة', type:'select', options:[{value:'نشط',label:'نشط — يُنبّه عند الاستحقاق'},{value:'متوقف',label:'متوقف مؤقتاً / أُلغي الاشتراك'}], required:true},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'provider', label:'الجهة / الخدمة'},
        {key:'category', label:'النوع'},
        {key:'amount', label:'المبلغ المعتاد', render:r=>money(r.amount)},
        {key:'frequency', label:'الدورية'},
        {key:'nextDueDate', label:'الاستحقاق القادم'},
        {key:'active', label:'الحالة', render:r=> r.active==='متوقف' ? <span className="badge gray">متوقف</span> : <span className="badge ok">نشط</span>},
      ],
      defaults:{nextDueDate:todayISO(), frequency:'شهري', reminderDays:5, account:'البنك', active:'نشط'},
    },
    treasury:{
      title:'حركات يدوية (رصيد افتتاحي، إيداع، سحب نثري، تحويل بين الحسابات)', singular:'حركة',
      fields:[
        {name:'type', label:'نوع الحركة', type:'select', options:[{value:'قبض',label:'قبض / إيداع'},{value:'صرف',label:'صرف / سحب'},{value:'تحويل',label:'تحويل بين الحسابات'}], required:true},
        {name:'account', label:'الحساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], required:true},
        {name:'toAccount', label:'تحويل إلى حساب', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], showIf:v=>v.type==='تحويل', required:true},
        {name:'amount', label:'المبلغ (د.إ)', type:'number', required:true},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'note', label:'البيان', required:true},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'type', label:'النوع', render:r=><span className={"badge "+(r.type==='قبض'?'ok':r.type==='صرف'?'bad':'neutral')}>{r.type}</span>},
        {key:'account', label:'الحساب', render:r=> r.type==='تحويل' ? (r.account+' ← '+(r.toAccount||'')) : r.account},
        {key:'amount', label:'المبلغ', render:r=>money(r.amount)},
        {key:'note', label:'البيان'},
      ],
      defaults:{date:todayISO(), type:'قبض', account:'البنك'},
    },
    otherIncome:{
      title:'الإيرادات الأخرى', singular:'إيراد آخر',
      sortFn:(a,b)=> (b.date||'').localeCompare(a.date||''),
      fields:[
        {name:'category', label:'مصدر الإيراد', type:'select', allowAddNew:true, addNewLabel:'➕ إضافة مصدر جديد...', addNewPrompt:'اسم مصدر الإيراد الجديد:',
          options:(d)=>{
            const used = [...new Set((d.otherIncome||[]).map(r=>r.category).filter(Boolean))];
            const all = [...OTHER_INCOME_CATEGORIES, ...used.filter(c=>!OTHER_INCOME_CATEGORIES.includes(c))];
            return all.map(c=>({value:c,label:c}));
          }, required:true, hint:'لا تجد المصدر؟ اختر "➕ إضافة مصدر جديد" من آخر القائمة'},
        {name:'amount', label:'المبلغ قبل الضريبة (د.إ)', type:'number', required:true},
        {name:'vatable', label:'خاضع لضريبة القيمة المضافة؟', type:'select', options:[{value:'خاضع',label:'خاضع 5%'},{value:'غير خاضع',label:'غير خاضع / معفى'}], required:true, hint:'بيع أصل مستعمل غالباً معفى؛ العمولة والاستشارة خاضعة. اختر حسب طبيعة الإيراد'},
        {name:'account', label:'الحساب المستلِم', type:'select', options:[{value:'البنك',label:'البنك'},{value:'الخزينة',label:'الخزينة (نقدي)'}], required:true, hint:'يُضاف إلى رصيد هذا الحساب'},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'payer', label:'الجهة الدافعة (اختياري)', hint:'مين دفع الإيراد ده — يفيد للتوثيق'},
        {name:'note', label:'البيان', type:'textarea'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'category', label:'المصدر'},
        {key:'amount', label:'قبل الضريبة', render:r=>money(r.amount)},
        {key:'vat', label:'الضريبة (5%)', render:r=> incVatRate(r)>0 ? money(incVat(r)) : <span style={{color:'var(--ink-faint)'}}>معفى</span>},
        {key:'gross', label:'شامل الضريبة', render:r=><b>{money(incGross(r))}</b>},
        {key:'account', label:'الحساب'},
        {key:'payer', label:'الجهة الدافعة', render:r=>r.payer||'—'},
        {key:'note', label:'البيان', truncate:true, render:r=>r.note||'—'},
      ],
      defaults:{date:todayISO(), account:'البنك', vatable:'غير خاضع'},
      footRow:(rows)=>{
        const totAmt = rows.reduce((s,r)=>s+(r.amount||0),0);
        const totVat = rows.reduce((s,r)=>s+incVat(r),0);
        const totGross = rows.reduce((s,r)=>s+incGross(r),0);
        return (
          <tr style={{background:'#F4F1E8', borderTop:'2px solid var(--line-strong)', fontWeight:800}}>
            <td style={{fontWeight:800}}>الإجمالي</td>
            <td></td>
            <td><b>{money(totAmt)}</b></td>
            <td><b>{money(totVat)}</b></td>
            <td><b>{money(totGross)}</b></td>
            <td colSpan={3}></td>
          </tr>
        );
      },
    },
    employees:{
      title:'الموظفون', singular:'موظف',
      fields:[
        {name:'name', label:'الاسم', required:true},
        {name:'position', label:'الوظيفة', required:true},
        {name:'baseSalary', label:'الراتب الأساسي (د.إ)', type:'number', required:true, hint:'يُحسب عليه خصم الغياب والأوفرتايم ومكافأة نهاية الخدمة'},
        {name:'grossSalary', label:'إجمالي الراتب (د.إ)', type:'number', hint:'الراتب الكامل شامل البدلات — يُحسب عليه الصافي وحماية الأجور. اتركه فارغاً ليساوي الأساسي'},
        {name:'hireDate', label:'تاريخ التعيين', type:'date', required:true},
        {name:'phone', label:'رقم الهاتف'},
        {name:'iban', label:'رقم الآيبان (للـ WPS)'},
        {name:'payMode', label:'طريقة صرف الراتب', type:'select', options:[{value:'WPS',label:'عبر WPS (حماية الأجور) — دفعة واحدة'},{value:'خارج WPS',label:'خارج WPS — على دفعات'}], hint:'الموظف خارج WPS لا يظهر في ملف WPS ويُصرف راتبه على دفعات من زر «صرف» في كشف الرواتب'},
        {name:'iqamaNumber', label:'رقم الإقامة'},
        {name:'iqamaExpiry', label:'تاريخ انتهاء الإقامة', type:'date'},
        {name:'passportExpiry', label:'تاريخ انتهاء جواز السفر', type:'date'},
        {name:'workCardExpiry', label:'تاريخ انتهاء بطاقة العمل', type:'date'},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'name', label:'الاسم'},
        {key:'position', label:'الوظيفة'},
        {key:'baseSalary', label:'الراتب', render:r=>money(r.baseSalary)},
        {key:'payMode', label:'صرف الراتب', render:r=> isWpsEmp(r) ? <span className="badge ok">WPS</span> : <span className="badge soon">خارج WPS</span>},
        {key:'iqamaNumber', label:'رقم الإقامة'},
        {key:'iqamaExpiry', label:'الإقامة', render:r=>(
          <span className={"badge "+expiryStatus(r.iqamaExpiry, WARN_IQAMA)}>{r.iqamaExpiry||'—'}</span>
        )},
        {key:'passportExpiry', label:'الجواز', render:r=> r.passportExpiry ? (
          <span className={"badge "+expiryStatus(r.passportExpiry, WARN_PASSPORT)}>{r.passportExpiry}</span>
        ) : '—'},
        {key:'workCardExpiry', label:'بطاقة العمل', render:r=> r.workCardExpiry ? (
          <span className={"badge "+expiryStatus(r.workCardExpiry, WARN_DEFAULT)}>{r.workCardExpiry}</span>
        ) : '—'},
      ],
      defaults:{hireDate:todayISO(), payMode:'WPS'},
    },
    overtime:{
      title:'الأوفرتايم', singular:'سجل أوفرتايم',
      fields:[
        {name:'employeeId', label:'الموظف', type:'select', options:employeeOptions, required:true},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'hours', label:'عدد الساعات', type:'number', required:true},
        {name:'rate', label:'أجر الساعة (د.إ)', type:'number', required:true},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'employee', label:'الموظف', render:r=>empName(r.employeeId,data)},
        {key:'hours', label:'الساعات'},
        {key:'rate', label:'أجر الساعة', render:r=>money(r.rate)},
        {key:'total', label:'الإجمالي', render:r=><b>{money((r.hours||0)*(r.rate||0))}</b>},
      ],
      defaults:{date:todayISO(), rate:30},
    },
    advances:{
      title:'السلف والخصومات', singular:'سلفة / خصم',
      fields:[
        {name:'employeeId', label:'الموظف', type:'select', options:employeeOptions, required:true},
        {name:'type', label:'النوع', type:'select', options:[{value:'سلفة',label:'سلفة'},{value:'خصم',label:'خصم'}], required:true},
        {name:'mode', label:'طريقة الخصم', type:'select', options:[{value:'مقطوع',label:'مقطوع (مرة واحدة)'},{value:'مقسّط',label:'مقسّط (على شهور)'}], showIf:v=>v.type==='سلفة', hint:'المقطوع يُخصم كامل في شهره — المقسّط يُخصم قسط شهري حتى السداد'},
        {name:'amount', label:'المبلغ الإجمالي (د.إ)', type:'number', required:true},
        {name:'monthlyInstallment', label:'القسط الشهري (د.إ)', type:'number', showIf:v=>v.type==='سلفة' && v.mode==='مقسّط', required:true, hint:'القيمة التي تُخصم كل شهر من الراتب'},
        {name:'startMonth', label:'يبدأ الخصم من شهر', type:'month', showIf:v=>v.type==='سلفة' && v.mode==='مقسّط', hint:'أول شهر يبدأ فيه الخصم — افتراضياً شهر التاريخ'},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'account', label:'صُرفت من حساب', type:'select', options:[{value:'الخزينة',label:'الخزينة (نقدي)'},{value:'البنك',label:'البنك'}], showIf:v=>v.type==='سلفة', required:true, hint:'السلفة تُخصم من هذا الحساب في تاريخها — ثم تُسترد بخصمها من الراتب'},
        {name:'note', label:'السبب / ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'employee', label:'الموظف', render:r=>empName(r.employeeId,data)},
        {key:'type', label:'النوع', render:r=><span className={"badge "+(r.type==='سلفة'?'neutral':'bad')}>{r.type}{r.type==='سلفة'&&r.mode==='مقسّط'?' مقسّطة':''}</span>},
        {key:'amount', label:'الإجمالي', render:r=>money(r.amount)},
        {key:'installment', label:'القسط/المتبقّي', render:r=>{
          if(r.type!=='سلفة'||r.mode!=='مقسّط') return '—';
          const rem = advanceRemaining(r, data);
          return <span>{money(r.monthlyInstallment||0)}/شهر · <b style={{color:rem>0?'var(--rust)':'var(--teal)'}}>متبقّي {money(rem)}</b></span>;
        }},
        {key:'note', label:'السبب'},
      ],
      defaults:{date:todayISO(), type:'سلفة', account:'الخزينة'},
    },
    leaves:{
      title:'الإجازات', singular:'إجازة',
      fields:[
        {name:'employeeId', label:'الموظف', type:'select', options:employeeOptions, required:true},
        {name:'type', label:'نوع الإجازة', type:'select', options:[{value:'سنوية',label:'سنوية'},{value:'مرضية',label:'مرضية'},{value:'بدون راتب',label:'بدون راتب'},{value:'طارئة',label:'طارئة'}], required:true},
        {name:'fromDate', label:'من تاريخ', type:'date', required:true},
        {name:'toDate', label:'إلى تاريخ', type:'date', required:true},
        {name:'days', label:'عدد الأيام', type:'number', required:true, hint:'أيام الإجازة الفعلية (أيام العمل)'},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'employee', label:'الموظف', render:r=>empName(r.employeeId,data)},
        {key:'type', label:'النوع', render:r=><span className={"badge "+(r.type==='سنوية'?'ok':r.type==='بدون راتب'?'bad':'neutral')}>{r.type}</span>},
        {key:'fromDate', label:'من'},
        {key:'toDate', label:'إلى'},
        {key:'days', label:'الأيام', render:r=><b>{r.days||0}</b>},
        {key:'note', label:'ملاحظات'},
      ],
      defaults:{fromDate:todayISO(), toDate:todayISO(), type:'سنوية'},
    },
    timesheets:{
      title:'تتبّع الوقت', singular:'ساعة عمل',
      sortFn:(a,b)=> (b.date||'').localeCompare(a.date||''),
      fields:[
        {name:'employeeId', label:'المهندس / الموظف', type:'select', options:employeeOptions, required:true},
        {name:'projectId', label:'المشروع', type:'select', options:projectOptions, required:true},
        {name:'phase', label:'المرحلة', type:'select', allowAddNew:true,
          options:(d)=>{
            const base = ['تصميم','مخططات تفصيلية','إشراف','اعتمادات','أخرى'];
            const used = [...new Set((d.timesheets||[]).map(t=>t.phase).filter(Boolean))];
            return [...base, ...used.filter(x=>!base.includes(x))].map(x=>({value:x,label:x}));
          }, required:true, hint:'لا تجد المرحلة؟ اختر "➕ إضافة تصنيف جديد" من آخر القائمة'},
        {name:'date', label:'التاريخ', type:'date', required:true},
        {name:'hours', label:'عدد الساعات', type:'number', required:true, hint:'ساعات العمل الفعلية على هذا المشروع في هذا اليوم'},
        {name:'task', label:'وصف المهمة', hint:'مثال: رسم مساقط الدور الأرضي، مراجعة ملاحظات البلدية...'},
      ],
      columns:[
        {key:'date', label:'التاريخ'},
        {key:'employee', label:'المهندس', render:r=>empName(r.employeeId,data)},
        {key:'project', label:'المشروع', render:r=>projName(r.projectId,data)},
        {key:'phase', label:'المرحلة', render:r=><span className="badge gray">{r.phase||'—'}</span>},
        {key:'hours', label:'الساعات', render:r=><b>{Number(r.hours)||0}</b>},
        {key:'cost', label:'التكلفة', render:(r,d)=>{
          const e = (d.employees||[]).find(x=>x.id===r.employeeId);
          return <span style={{color:'var(--rust)'}}>{money((Number(r.hours)||0)*hourlyRate(e, monthKey(r.date)))}</span>;
        }},
        {key:'billed', label:'الفوترة', render:r=> r.billed ? <span className="badge ok">مفوترة</span> : <span className="badge gray">—</span>},
        {key:'task', label:'المهمة', truncate:true, render:r=>r.task||'—'},
      ],
      defaults:{date:todayISO(), phase:'تصميم'},
      footRow:(rows, d)=>{
        const totH = rows.reduce((s,r)=>s+(Number(r.hours)||0),0);
        const totC = rows.reduce((s,r)=>{ const e=(d.employees||[]).find(x=>x.id===r.employeeId); return s+(Number(r.hours)||0)*hourlyRate(e, monthKey(r.date)); },0);
        return (
          <tr style={{background:'#F4F1E8', borderTop:'2px solid var(--line-strong)', fontWeight:800}}>
            <td colSpan={4}>الإجمالي</td>
            <td><b>{totH} ساعة</b></td>
            <td><b style={{color:'var(--rust)'}}>{money(totC)}</b></td>
            <td></td>
          </tr>
        );
      },
    },
    cars:{
      title:'سيارات الشركة', singular:'سيارة',
      fields:[
        {name:'model', label:'الموديل', required:true},
        {name:'plate', label:'رقم اللوحة', required:true},
        {name:'licenseExpiry', label:'تاريخ انتهاء الرخصة', type:'date', required:true},
        {name:'assignedTo', label:'مخصصة لـ (موظف)', type:'select', options:employeeOptions},
        {name:'note', label:'ملاحظات', type:'textarea'},
      ],
      columns:[
        {key:'model', label:'الموديل'},
        {key:'plate', label:'رقم اللوحة'},
        {key:'assignedTo', label:'مخصصة لـ', render:r=> r.assignedTo ? empName(r.assignedTo,data) : '—'},
        {key:'licenseExpiry', label:'انتهاء الرخصة', render:r=>(
          <span className={"badge "+expiryStatus(r.licenseExpiry)}>{r.licenseExpiry} · {expiryLabel(r.licenseExpiry)}</span>
        )},
      ],
      defaults:{licenseExpiry:todayISO()},
    },
  };
}

/* ================= أقساط السلف المقسّطة ================= */
// هل صُرفت رواتب هذا الشهر فعلاً؟ (صرف جماعي kind='رواتب' أو دفعة راتب لموظف خارج WPS)
