/* ================= تقرير حالة المشروع للمالك (عربي/إنجليزي) =================
   يفتح في تاب جديدة عبر Blob URL: التقرير قابل للمراجعة والتعديل، بلغتين (عربي/إنجليزي)،
   وبه حالة المخططات + الاعتمادات من الدوائر الحكومية + حالة المناقصات. ومنه يُصدَّر PDF أو
   يُرسَل كرسالة واتساب. فرونت-إند بالكامل من بيانات المشروع المحمّلة؛ لا يلمس القاعدة أو السحابة. */
(function(){
 const STATUS={REQ:{ar:'قيد العمل',en:'In progress',c:'s-work'},READY:{ar:'جاهز للتقديم',en:'Ready to submit',c:'s-work'},
   SUB:{ar:'تم التقديم',en:'Submitted',c:'s-sub'},COM:{ar:'عليه ملاحظات',en:'Returned with comments',c:'s-com'},
   OK:{ar:'معتمد',en:'Approved',c:'s-ok'},'N/A':{ar:'لا يلزم',en:'N/A',c:'s-na'},
   HOLD:{ar:'موقوف بطلب المالك',en:'On hold (owner request)',c:'s-hold'},DONE:{ar:'مكتمل',en:'Completed',c:'s-ok'}};
 const ICON={REQ:'🔸',READY:'📋',SUB:'📤',COM:'⚠️',OK:'✅','N/A':'➖',HOLD:'⏸️',DONE:'✅'};
 const TENDER={REQ:{ar:'في انتظار استلام عروض الأسعار',en:'Awaiting quotations'},
   READY:{ar:'جاهز للتقديم إلى المناقصة',en:'Ready to submit to tender'},
   SUB:{ar:'تم التقديم إلى المناقصة',en:'Submitted to tender'},
   COM:{ar:'دراسة عروض الأسعار',en:'Studying quotations'},
   OK:{ar:'تم الترسية / اعتماد المقاول',en:'Awarded / contractor approved'},
   HOLD:{ar:'موقوف',en:'On hold'},DONE:{ar:'مكتمل',en:'Completed'},'N/A':{ar:'لا يلزم',en:'N/A'}};
 const EN_TITLE={design:'Architectural design',planning:'Planning',coordination:'Drawings coordination',electric:'Electricity',water:'Water',gas:'Gas',telecom:'Telecom',civil:'Civil Defence',struct:'Structural',sanitary:'Sanitary',munArch:'Municipal (Architectural)',munStruct:'Municipal (Structural)',munSanitary:'Municipal (Sanitary)',tender:'Tender'};
 const T={
   title:{ar:'تقرير حالة المشروع',en:'Project Status Report'},
   subtitle:{ar:'نطاق للاستشارات الهندسية — إدارة ومتابعة المشاريع',en:'NITAQ Engineering Consultancy — Project Management'},
   date:{ar:'بتاريخ',en:'Date'},owner:{ar:'المالك',en:'Owner'},projectNo:{ar:'رقم المشروع',en:'Project No.'},
   sketch:{ar:'اسكتش',en:'Sketch'},location:{ar:'الموقع',en:'Location'},desc:{ar:'وصف المشروع',en:'Description'},
   service:{ar:'جهة الخدمات',en:'Utility Authority'},municipality:{ar:'البلدية',en:'Municipality'},
   pct:{ar:'نسبة الإنجاز',en:'Completion'},phase:{ar:'المرحلة الحالية',en:'Current Phase'},
   permit:{ar:'إجازة البناء',en:'Building Permit'},contract:{ar:'عقد المقاول',en:'Contractor Agreement'},
   signed:{ar:'موقّع',en:'Signed'},unsigned:{ar:'غير موقّع',en:'Not signed'},
   next:{ar:'الخطوة القادمة',en:'Next Step'},
   secDraw:{ar:'حالة المخططات',en:'Drawings Status'},
   secApp:{ar:'الاعتمادات من الدوائر الحكومية',en:'Government Approvals'},
   secTen:{ar:'حالة المناقصات',en:'Tender Status'},
   cItem:{ar:'البند',en:'Item'},cStatus:{ar:'الحالة',en:'Status'},cDate:{ar:'التاريخ',en:'Date'},cNote:{ar:'ملاحظات',en:'Notes'},
   tStatus:{ar:'حالة المناقصة',en:'Tender status'},tType:{ar:'نوع التعاقد',en:'Contract type'},
   tContractor:{ar:'المقاول',en:'Contractor'},tOffers:{ar:'العروض / ملاحظات',en:'Offers / notes'},
   main:{ar:'مقاول رئيسي',en:'Main contractor'},sub:{ar:'مقاول باطن',en:'Subcontractor'},
   footer:{ar:'نطاق للاستشارات الهندسية · الشارقة — الإمارات',en:'NITAQ Engineering Consultancy · Sharjah — UAE'},
   waTitle:{ar:'تحديث حالة المشروع — نطاق للاستشارات الهندسية',en:'Project Status Update — NITAQ Engineering Consultancy'},
   waProject:{ar:'المشروع',en:'Project'},
 };
 const ROW={
   des:{ar:'المخطط المعماري',en:'Architectural drawings'},
   str:{ar:'المخطط الإنشائي',en:'Structural drawings'},
   san:{ar:'المخطط الصحي',en:'Sanitary drawings'},
   coord:{ar:'تنسيق ومطابقة المخططات',en:'Drawings coordination'},
   plan:{ar:'التخطيط والمساحة',en:'Planning & Survey'},
   civ:{ar:'الدفاع المدني',en:'Civil Defence'},
   tel:{ar:'الاتصالات',en:'Telecom'},
 };
 const logoURL=()=>{try{return new URL('../NITAQ-Logo-gold.svg',location.href).href;}catch(e){return '../NITAQ-Logo-gold.svg';}};

 function groupStatus(p,ks){
   const sts=ks.filter(k=>!(k==='gas'&&p.service==='FEWA')).map(k=>p.stages[k]?p.stages[k].status:'N/A');
   if(!sts.length)return 'N/A';
   if(sts.every(s=>['OK','N/A'].includes(s)))return 'OK';
   if(sts.some(s=>s==='COM'))return 'COM';
   if(sts.some(s=>s==='SUB'))return 'SUB';
   if(sts.some(s=>s==='READY'))return 'READY';
   if(sts.every(s=>s==='HOLD'))return 'HOLD';
   return 'REQ';
 }
 const stStat=(p,ks)=>ks.length>1?groupStatus(p,ks):p.stages[ks[0]].status;
 const pctOf=(p,ks)=>{const a=ks.filter(k=>!(k==='gas'&&p.service==='FEWA'));const d=a.filter(k=>['OK','N/A','DONE'].includes(p.stages[k].status)).length;return a.length?Math.round(d/a.length*100):0;};
 const PHASE={design:{ar:'التصميم',en:'Design'},approvals:{ar:'الاعتمادات',en:'Approvals'},permit:{ar:'إجازة البناء',en:'Permit'},tender:{ar:'المناقصة',en:'Tender'},construction:{ar:'التنفيذ',en:'Construction'}};
 // Macro project journey: each phase is done / current / upcoming.
 function phases(p){
   const allOK=ks=>ks.filter(k=>!(k==='gas'&&p.service==='FEWA')).every(k=>['OK','N/A','DONE'].includes(p.stages[k].status));
   const order=[
     {key:'design',done:allOK(['design','struct','sanitary','coordination'])},
     {key:'approvals',done:allOK(['planning','civil','electric','water','gas','telecom','munArch','munStruct','munSanitary'])},
     {key:'permit',done:permit(p)==='صدرت'},
     {key:'tender',done:['OK','N/A','DONE'].includes(p.stages.tender.status)},
     {key:'construction',done:false},
   ];
   let currentSet=false;
   return order.map(o=>{let state;if(o.done)state='done';else if(!currentSet){state='current';currentSet=true;}else state='upcoming';return {key:o.key,state};});
 }

 function derive(p,lang){
   const pm=permit(p);
   let permitLabel;
   if(p.stages.design.status==='HOLD')permitLabel=lang==='en'?'On hold (owner request)':'موقوف بطلب المالك';
   else if(pm==='صدرت')permitLabel=(lang==='en'?'Issued':'صادرة')+(p.permitIssue&&p.permitIssue.number?(' · '+(lang==='en'?'No. ':'رقم ')+p.permitIssue.number):'');
   else{const map={'بانتظار المتطلبات':'Pending requirements','جاهز للإصدار':'Ready to issue','تم التقديم':'Submitted','جاهز':'Ready'};permitLabel=lang==='en'?(map[pm]||pm):pm;}
   const title=k=>lang==='en'?(EN_TITLE[k]||k):columnTitle(k);
   const applicable=keys.filter(k=>!(k==='gas'&&p.service==='FEWA'));
   let currentPhase,nextStep;
   if(p.stages.design.status==='DONE'){currentPhase=lang==='en'?'Completed':'مكتمل';nextStep=lang==='en'?'All project stages are complete':'اكتملت جميع مراحل المشروع';}
   else if(p.stages.design.status==='HOLD'){currentPhase=lang==='en'?'On hold (owner request)':'موقوف بطلب المالك';nextStep=lang==='en'?'Project paused at the owner’s request — awaiting approval to proceed':'المشروع موقوف مؤقتًا بطلب المالك — في انتظار موافقتكم على المتابعة';}
   else if(pm==='صدرت'){currentPhase=lang==='en'?'Construction & supervision':'التنفيذ والإشراف';nextStep=lang==='en'?'Site supervision after permit issuance':'الإشراف على تنفيذ المشروع بعد صدور الإجازة';}
   else{
     const miss=(typeof missing==='function')?missing(p):[];
     if(!((typeof ready==='function')&&ready(p))&&miss.length){currentPhase=lang==='en'?'Completing permit requirements':'استكمال متطلبات إجازة البناء';nextStep=(lang==='en'?'Complete: ':'استكمال: ')+miss.join(lang==='en'?', ':'، ');}
     else{
       const open=applicable.find(k=>!['OK','N/A','DONE','HOLD'].includes(p.stages[k].status));
       if(open){currentPhase=title(open);nextStep=title(open)+' — '+(STATUS[p.stages[open].status]?STATUS[p.stages[open].status][lang]:'');}
       else{currentPhase=lang==='en'?'Ready to issue building permit':'جاهز لإصدار إجازة البناء';nextStep=lang==='en'?'Proceed with permit issuance':'استكمال إجراءات إصدار إجازة البناء';}
     }
   }
   return {permitLabel,currentPhase,nextStep};
 }

 function model(p){
   const applicable=keys.filter(k=>!(k==='gas'&&p.service==='FEWA'));
   const doneN=applicable.filter(k=>['OK','N/A','DONE'].includes(p.stages[k].status)).length;
   const percent=applicable.length?Math.round(doneN/applicable.length*100):0;
   const meta=ks=>{const a=ks.filter(k=>!(k==='gas'&&p.service==='FEWA'));
     if(a.length===1)return {date:p.stages[a[0]].date||'',note:p.stages[a[0]].note||''};
     const dates=a.map(k=>p.stages[k].date).filter(Boolean).sort();
     const notes=a.map(k=>p.stages[k].note).filter(Boolean);
     return {date:dates.length?dates[dates.length-1]:'',note:notes.join(' · ')};};
   const row=(label,ks)=>{const mt=meta(ks);return {label,st:stStat(p,ks),date:mt.date,note:mt.note};};
   const drawings=[row(ROW.des,['design']),row(ROW.str,['struct']),row(ROW.san,['sanitary']),
     row({ar:'مخطط الخدمات (كهرباء/مياه)',en:'Services drawings (MEP)'},['electric','water','gas']),
     row({ar:'مخطط الاتصالات',en:'Telecom drawings'},['telecom']),
     row({ar:'مخطط الدفاع المدني',en:'Civil Defence drawings'},['civil'])];
   const approvals=[
     row(ROW.plan,['planning']),row(ROW.civ,['civil']),
     row({ar:'الخدمات ('+(p.service||'—')+')',en:'Utilities ('+(p.service||'—')+')'},['electric','water','gas']),
     row(ROW.tel,['telecom']),
     row({ar:'البلدية ('+(p.municipality||'—')+')',en:'Municipality ('+(p.municipality||'—')+')'},['munArch','munStruct','munSanitary']),
   ];
   const tStatus=p.stages.tender?p.stages.tender.status:'N/A';
   const tender={show:tStatus!=='N/A',status:tStatus,contractor:(p.tender&&p.tender.contractor)||'',offers:(p.tender&&p.tender.offers)||''};
   const secPct={draw:pctOf(p,['design','struct','sanitary','electric','water','gas','telecom','civil']),
     app:pctOf(p,['planning','civil','electric','water','gas','telecom','munArch','munStruct','munSanitary']),
     tender:['OK','N/A','DONE'].includes(tStatus)?100:(['SUB','COM','READY'].includes(tStatus)?50:0)};
   return {p,percent,drawings,approvals,tender,secPct,phases:phases(p),date:today(),ar:derive(p,'ar'),en:derive(p,'en')};
 }

 const CSS=`
 *{box-sizing:border-box}
 body{margin:0;background:#eef1f4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1d2733;padding:18px}
 .toolbar{max-width:820px;margin:0 auto 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:10px 12px;position:sticky;top:10px;z-index:5;box-shadow:0 2px 10px rgba(0,0,0,.05);direction:rtl}
 .toolbar button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:9px 14px;font-weight:700;background:#132a46;color:#fff}
 .toolbar button.gold{background:#a9824f}
 .toolbar button.ghost{background:#eef1f4;color:#132a46;border:1px solid #d7dce2}
 .toolbar .tip{font-size:12px;color:#6a7684;margin-inline-start:auto}
 #flash{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1a7f37;color:#fff;padding:9px 16px;border-radius:8px;opacity:0;transition:opacity .25s;z-index:20;font-weight:700}
 .nreport{--navy:#132a46;--gold:#a9824f;--line:#e4e7ec;--soft:#f7f8fa;--ink:#1d2733;--muted:#6a7684;
   background:#fff;color:var(--ink);max-width:820px;margin:0 auto;border:1px solid var(--line);border-radius:10px;overflow:hidden}
 .nreport.hidden{display:none}
 .nreport[dir=ltr] th,.nreport[dir=ltr] td,.nreport[dir=ltr] .idbox div{text-align:left}
 .nreport .hd{display:flex;align-items:center;gap:14px;padding:18px 22px;background:var(--navy);color:#fff}
 .nreport .hd img{height:42px;width:auto}
 .nreport .hd .t{flex:1}.nreport .hd h2{margin:0;font-size:20px}
 .nreport .hd .s{font-size:12px;opacity:.82;margin-top:2px}
 .nreport .hd .d{font-size:12px;opacity:.9;white-space:nowrap}
 .nreport .idbox{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-bottom:1px solid var(--line)}
 .nreport .idbox div{background:#fff;padding:9px 14px;text-align:right}
 .nreport .idbox span{display:block;font-size:10.5px;color:var(--muted);margin-bottom:2px}
 .nreport .idbox b{font-size:13px;font-weight:700;display:inline-block;min-width:20px}
 .nreport .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:16px 22px}
 .nreport .kpi{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center}
 .nreport .kpi .big{font-size:26px;font-weight:800;color:var(--navy);line-height:1.1}
 .nreport .kpi .lab{font-size:11px;color:var(--muted);margin-bottom:5px}
 .nreport .kpi .val{font-size:13px;font-weight:700;line-height:1.3}
 .nreport .barwrap{padding:0 22px 6px}
 .nreport .bar{height:12px;background:var(--soft);border:1px solid var(--line);border-radius:999px;overflow:hidden}
 .nreport .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#c6a66f)}
 .nreport.hide-pct .pct-kpi,.nreport.hide-pct .barwrap{display:none}
 .nreport.hide-draw [data-sec=draw],.nreport.hide-app [data-sec=app],.nreport.hide-tender [data-sec=tender]{display:none}
 .toolbar .toggles{display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;border-top:1px solid #eef1f4;margin-top:4px;padding-top:8px}
 .toolbar .toggles .lbl{font-size:12px;color:#6a7684;font-weight:700}
 .toolbar .chip{font:inherit;cursor:pointer;border:1px solid #cdd3da;border-radius:999px;padding:5px 12px;font-weight:700;font-size:12.5px;background:#132a46;color:#fff}
 .toolbar .chip.off{background:#fff;color:#9aa4b0;text-decoration:line-through}
 .nreport .next{margin:4px 22px 14px;padding:11px 14px;background:#fff7ec;border:1px solid #efd9b5;border-radius:8px;font-size:13px}
 .nreport .next b{color:var(--gold)}
 .nreport h3{margin:16px 22px 12px;font-size:16px;color:var(--navy);text-align:center;font-weight:800;position:relative;padding-bottom:9px}
 .nreport h3::after{content:'';position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:56px;height:3px;background:var(--gold);border-radius:2px}
 .nreport table{width:calc(100% - 44px);margin:0 22px 16px;border-collapse:collapse;font-size:13px;table-layout:fixed}
 .nreport .cbnd{width:34%}.nreport .cstat{width:22%}.nreport .cdate{width:18%}.nreport .cnote{width:26%}
 .nreport .tbnd{width:40%}
 .nreport.hide-date .cdate{display:none}.nreport.hide-note .cnote{display:none}
 .nreport th,.nreport td{border:1px solid var(--line);padding:8px 10px;text-align:right;overflow-wrap:break-word}
 .nreport td.rdate{font-size:12px;color:var(--muted);direction:ltr;text-align:center}
 .nreport td.rnote{font-size:12px;color:var(--ink)}
 .nreport th{background:var(--soft);color:var(--muted);font-size:11px;font-weight:700}
 .nreport td.rl{font-weight:600}
 .nreport .pill{display:inline-block;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid transparent;white-space:nowrap}
 .nreport .pill.s-ok{background:#e6f4ea;color:#1a7f37;border-color:#bfe3c9}
 .nreport .pill.s-sub{background:#e8f0fe;color:#1f6feb;border-color:#c6dafc}
 .nreport .pill.s-com{background:#fdf0e3;color:#b26a00;border-color:#f3d9b5}
 .nreport .pill.s-work{background:#eef1f4;color:#4b5563;border-color:#dde2e8}
 .nreport .pill.s-hold{background:#fde8e3;color:#9a3412;border-color:#f3c7ba}
 .nreport .pill.s-na{background:#f2f4f6;color:#8a95a1;border-color:#e2e6ea}
 .nreport .stsel{font:inherit;font-weight:700;font-size:12px;border:1px solid transparent;border-radius:999px;padding:3px 26px 3px 10px;cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%239aa4b0' stroke-width='1.5'/></svg>");background-repeat:no-repeat;background-position:left 9px center;max-width:100%}
 .nreport .stsel.s-ok{background-color:#e6f4ea;color:#1a7f37;border-color:#bfe3c9}
 .nreport .stsel.s-sub{background-color:#e8f0fe;color:#1f6feb;border-color:#c6dafc}
 .nreport .stsel.s-com{background-color:#fdf0e3;color:#b26a00;border-color:#f3d9b5}
 .nreport .stsel.s-work{background-color:#eef1f4;color:#4b5563;border-color:#dde2e8}
 .nreport .stsel.s-hold{background-color:#fde8e3;color:#9a3412;border-color:#f3c7ba}
 .nreport .stsel.s-na{background-color:#f2f4f6;color:#8a95a1;border-color:#e2e6ea}
 .nreport .selplain{font:inherit;font-weight:600;font-size:12.5px;border:1px solid #dde2e8;border-radius:7px;padding:3px 10px;cursor:pointer;background:#fff;max-width:100%}
 .toolbar .legendbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;width:100%;border-top:1px solid #eef1f4;margin-top:4px;padding-top:8px}
 .toolbar .legendbar .klbl{font-size:12px;color:#6a7684;font-weight:700}
 .toolbar .legendbar .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid transparent}
 .toolbar .legendbar .s-ok{background:#e6f4ea;color:#1a7f37;border-color:#bfe3c9}
 .toolbar .legendbar .s-sub{background:#e8f0fe;color:#1f6feb;border-color:#c6dafc}
 .toolbar .legendbar .s-com{background:#fdf0e3;color:#b26a00;border-color:#f3d9b5}
 .toolbar .legendbar .s-work{background:#eef1f4;color:#4b5563;border-color:#dde2e8}
 .toolbar .legendbar .s-hold{background:#fde8e3;color:#9a3412;border-color:#f3c7ba}
 .toolbar .legendbar .s-na{background:#f2f4f6;color:#8a95a1;border-color:#e2e6ea}
 .nreport .exec{margin:14px 22px 6px;padding:12px 15px;background:#f3f6fb;border:1px solid #e1e8f2;border-radius:8px;font-size:13.5px;line-height:1.7;text-align:center;color:var(--ink)}
 .nreport .exec b{color:var(--navy)}
 .nreport .timeline{display:flex;gap:0;padding:10px 22px 4px;overflow:hidden}
 .nreport .step{flex:1;text-align:center;position:relative;font-size:11px;color:var(--muted)}
 .nreport .step .dot{width:22px;height:22px;border-radius:50%;background:#e4e7ec;color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 5px;font-size:11px;font-weight:800;position:relative;z-index:2}
 .nreport .step::before{content:'';position:absolute;top:11px;right:50%;width:100%;height:3px;background:#e4e7ec;z-index:1}
 .nreport[dir=ltr] .step::before{right:auto;left:50%}
 .nreport .step:first-child::before{display:none}
 .nreport .step.done .dot{background:var(--gold)}
 .nreport .step.done::before{background:var(--gold)}
 .nreport .step.current .dot{background:var(--navy);box-shadow:0 0 0 4px rgba(19,42,70,.15)}
 .nreport .step.current{color:var(--navy);font-weight:800}
 .nreport .legend{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;padding:4px 22px 10px}
 .nreport .legend .pill{font-size:10.5px;padding:2px 9px}
 .nreport .secpct{font-size:12px;font-weight:800;color:var(--gold);margin-inline-start:6px}
 .nreport.hide-pct .pct-only{display:none}
 .nreport .donutwrap{display:flex;justify-content:center;align-items:center}
 .nreport .donut{width:76px;height:76px}
 .nreport .donut .track{fill:none;stroke:#eef1f4;stroke-width:3.4}
 .nreport .donut .prog{fill:none;stroke:var(--gold);stroke-width:3.4;stroke-linecap:round}
 .nreport .donut text{fill:var(--navy);font-size:9px;font-weight:800;text-anchor:middle}
 .nreport .ft{padding:12px 22px;border-top:1px solid var(--line);background:var(--soft);font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .nreport .ft b{color:var(--navy)}
 [contenteditable]{outline:none;border-radius:4px}
 [contenteditable]:hover{box-shadow:inset 0 0 0 1px #d9c08a}
 [contenteditable]:focus{box-shadow:inset 0 0 0 2px #a9824f;background:#fffaf0}
 .wabox{max-width:820px;margin:16px auto 0;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:14px;direction:rtl}
 .wabox label{display:block;font-weight:700;margin-bottom:6px}
 .wabox textarea{width:100%;min-height:280px;font:inherit;font-size:13px;line-height:1.7;padding:10px;border:1px solid #e4e7ec;border-radius:8px}
 @media print{
   @page{size:A4;margin:7mm}
   html,body{background:#fff;padding:0;margin:0}
   .toolbar,.wabox,#flash,.no-print{display:none !important}
   [contenteditable]:hover,[contenteditable]:focus{box-shadow:none !important;background:transparent !important}
   .nreport{border:none;border-radius:0;max-width:100%;font-size:11px;break-inside:avoid}
   .nreport .sec,.nreport table,.nreport tr,.nreport thead{break-inside:avoid}
   .nreport .hd{padding:8px 14px}
   .nreport .hd img{height:30px}
   .nreport .hd h2{font-size:15px}
   .nreport .hd .s{font-size:10px}
   .nreport .idbox div{padding:3px 10px}
   .nreport .idbox span{font-size:9px;margin-bottom:1px}
   .nreport .idbox b{font-size:11px}
   .nreport .exec{margin:6px 14px 3px;padding:5px 11px;font-size:10.5px;line-height:1.45}
   .nreport .timeline{padding:4px 14px 1px}
   .nreport .step{font-size:9px}
   .nreport .step .dot{width:16px;height:16px;margin-bottom:3px;font-size:9px}
   .nreport .step::before{top:8px;height:2px}
   .nreport .kpis{padding:6px 14px;gap:7px}
   .nreport .kpi{padding:5px}
   .nreport .kpi .lab{font-size:9px;margin-bottom:2px}
   .nreport .kpi .val{font-size:11px}
   .nreport .donut{width:48px;height:48px}
   .nreport .next{margin:2px 14px 6px;padding:5px 11px;font-size:10.5px}
   .nreport h3{margin:8px 14px 4px;font-size:12.5px;padding-bottom:5px}
   .nreport h3::after{width:46px;height:2px}
   .nreport .secpct{font-size:11px}
   .nreport table{margin:0 14px 6px;font-size:10px}
   .nreport th,.nreport td{padding:3px 7px}
   .nreport th{font-size:9.5px}
   .nreport .pill{font-size:9.5px;padding:1px 7px}
   .nreport .stsel{font-size:9.5px;padding:1px 18px 1px 7px}
   .nreport td.rdate,.nreport td.rnote{font-size:9.5px}
   .nreport .ft{padding:7px 14px;font-size:9.5px}
 }`;

 function reportBody(m,lang){
   const p=m.p,id=s=>esc(String(s==null?'':s)),ed=' contenteditable="true" spellcheck="false"';
   const dir=lang==='en'?'ltr':'rtl';
   const d=m[lang];
   const descVal=lang==='en'?(p.descEn||p.desc):p.desc;
   const SORD=['OK','SUB','COM','REQ','READY','HOLD','N/A','DONE'];
   const sopt=(c,cur)=>`<option value="${c}"${c===cur?' selected':''}>${ICON[c]} ${id(STATUS[c][lang])}</option>`;
   const ssel=cur=>`<select class="stsel ${(STATUS[cur]||{}).c||'s-work'}" onchange="stChange(this)">${SORD.map(c=>sopt(c,cur)).join('')}</select>`;
   const rowsOf=arr=>arr.map(r=>`<tr data-row><td class="rl cbnd">${id(r.label[lang])}</td><td class="rs cstat">${ssel(r.st)}</td><td class="rdate cdate"${ed}>${id(r.date)||'—'}</td><td class="rnote cnote"${ed}>${id(r.note)||'—'}</td></tr>`).join('');
   const TORD=['REQ','COM','READY','SUB','OK','HOLD','DONE','N/A'];
   const topt=(c,cur)=>`<option value="${c}"${c===cur?' selected':''}>${id((TENDER[c]||{})[lang]||c)}</option>`;
   const tsel=cur=>`<select class="stsel ${(STATUS[cur]||{}).c||'s-work'}" onchange="stChange(this)">${TORD.map(c=>topt(c,cur)).join('')}</select>`;
   const ctypeSel=`<select class="selplain" onchange="syncWA()"><option value="main" selected>${id(T.main[lang])}</option><option value="sub">${id(T.sub[lang])}</option></select>`;
   const secp=pc=>` <span class="secpct pct-only">${pc}%</span>`;
   const sec=(key,secKey,pc,rows)=>`<div class="sec" data-sec="${secKey}" data-title="${id(T[key][lang])}"><h3>${id(T[key][lang])}${secp(pc)}</h3><table><thead><tr><th class="cbnd">${id(T.cItem[lang])}</th><th class="cstat">${id(T.cStatus[lang])}</th><th class="cdate">${id(T.cDate[lang])}</th><th class="cnote">${id(T.cNote[lang])}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
   let tender='';
   if(m.tender.show){
     tender=`<div class="sec" data-sec="tender" data-title="${id(T.secTen[lang])}"><h3>${id(T.secTen[lang])}${secp(m.secPct.tender)}</h3><table><tbody>`+
       `<tr data-row><td class="rl tbnd">${id(T.tStatus[lang])}</td><td class="rs">${tsel(m.tender.status)}</td></tr>`+
       `<tr data-row><td class="rl tbnd">${id(T.tType[lang])}</td><td class="rs">${ctypeSel}</td></tr>`+
       `<tr data-row><td class="rl tbnd">${id(T.tContractor[lang])}</td><td class="rs"${ed}>${id(m.tender.contractor)||'—'}</td></tr>`+
       `<tr data-row><td class="rl tbnd">${id(T.tOffers[lang])}</td><td class="rs"${ed}>${id(m.tender.offers)||'—'}</td></tr>`+
       `</tbody></table></div>`;
   }
   const donut=`<div class="donutwrap"><svg class="donut" viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15.915"/><circle class="prog" cx="18" cy="18" r="15.915" stroke-dasharray="${m.percent} ${100-m.percent}" stroke-dashoffset="25"/><text x="18" y="21" data-f="pct">${m.percent}%</text></svg></div>`;
   const timeline=`<div class="timeline">${m.phases.map(ph=>`<div class="step ${ph.state}"><div class="dot">${ph.state==='done'?'✓':''}</div>${id(PHASE[ph.key][lang])}</div>`).join('')}</div>`;
   const summary=lang==='en'
     ? `Your project is currently in the “<b>${id(d.currentPhase)}</b>” phase<span class="pct-only"> at <b>${m.percent}%</b> completion</span>. Next step: ${id(d.nextStep)}.`
     : `مشروعكم حاليًا في مرحلة «<b>${id(d.currentPhase)}</b>»<span class="pct-only"> بنسبة إنجاز <b>${m.percent}%</b></span>. الخطوة القادمة: ${id(d.nextStep)}.`;
   return `<div class="nreport${lang==='en'?' hidden':''}" id="report-${lang}" data-lang="${lang}" dir="${dir}">
     <div class="hd"><img src="${logoURL()}" alt="NITAQ"><div class="t"><h2>${id(T.title[lang])}</h2><div class="s">${id(T.subtitle[lang])}</div></div><div class="d">${id(T.date[lang])}<br><b data-f="date"${ed}>${id(m.date)}</b></div></div>
     <div class="idbox">
       <div><span>${id(T.owner[lang])}</span><b data-f="owner"${ed}>${id(p.name)||'—'}</b></div>
       <div><span>${id(T.projectNo[lang])}</span><b data-f="projectNo"${ed}>${id(p.id)}${p.sketch?(' · '+id(T.sketch[lang])+' '+id(p.sketch)):''}</b></div>
       <div><span>${id(T.location[lang])}</span><b data-f="location"${ed}>${id(p.location)||'—'}</b></div>
       <div><span>${id(T.desc[lang])}</span><b data-f="desc"${ed}>${id(descVal)||'—'}</b></div>
       <div><span>${id(T.service[lang])}</span><b${ed}>${id(p.service)||'—'}</b></div>
       <div><span>${id(T.municipality[lang])}</span><b${ed}>${id(p.municipality)||'—'}</b></div>
     </div>
     <div class="exec"${ed}>${summary}</div>
     ${timeline}
     <div class="kpis">
       <div class="kpi pct-kpi"><div class="lab">${id(T.pct[lang])}</div>${donut}</div>
       <div class="kpi"><div class="lab">${id(T.phase[lang])}</div><div class="val" data-f="phase"${ed}>${id(d.currentPhase)}</div></div>
       <div class="kpi"><div class="lab">${id(T.permit[lang])}</div><div class="val" data-f="permit"${ed}>${id(d.permitLabel)}</div></div>
       <div class="kpi"><div class="lab">${id(T.contract[lang])}</div><div class="val" data-f="contract"${ed}>${id(p.contract?T.signed[lang]:T.unsigned[lang])}</div></div>
     </div>
     <div class="next">➡️ <b>${id(T.next[lang])}:</b> <span data-f="next"${ed}>${id(d.nextStep)}</span></div>
     ${sec('secDraw','draw',m.secPct.draw,rowsOf(m.drawings))}
     ${sec('secApp','app',m.secPct.app,rowsOf(m.approvals))}
     ${tender}
     <div class="ft"><span><b>${id(T.footer[lang])}</b></span><span>📞 ‎+971 56 629 9449 · +971 54 524 6000 · ✉ INFO@NITAQ.AE</span></div>
   </div>`;
 }

 function reportDoc(m){
   const title=esc(T.title.ar.replace(/\s+/g,' '))+' '+esc(m.p.id)+' — '+esc(m.p.name||'');
   const WA=JSON.stringify({ar:{title:T.waTitle.ar,owner:T.owner.ar,project:T.waProject.ar,no:T.projectNo.ar,pct:T.pct.ar,phase:T.phase.ar,permit:T.permit.ar,contract:T.contract.ar,next:T.next.ar,date:T.date.ar,footer:T.footer.ar},en:{title:T.waTitle.en,owner:T.owner.en,project:T.waProject.en,no:T.projectNo.en,pct:T.pct.en,phase:T.phase.en,permit:T.permit.en,contract:T.contract.en,next:T.next.en,date:T.date.en,footer:T.footer.en}});
   const legData=l=>['OK','SUB','COM','REQ','HOLD','N/A'].map(k=>({c:STATUS[k].c,t:STATUS[k][l]}));
   const LEG=JSON.stringify({ar:legData('ar'),en:legData('en')});
   return `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body>
   <div id="flash"></div>
   <div class="toolbar no-print">
     <button class="gold" onclick="exportPDF()">🖨 تصدير PDF</button>
     <button onclick="openWA()">📱 إرسال واتساب</button>
     <button class="ghost" onclick="copyWA()">📋 نسخ النص</button>
     <button class="ghost" onclick="syncWA()">↻ تحديث النص من التقرير</button>
     <button class="ghost" id="langBtn" onclick="toggleLang()">English</button>
     <span class="tip">راجع وعدّل أي نص داخل التقرير قبل التصدير.</span>
     <span class="toggles"><span class="lbl">إظهار / إخفاء الجداول:</span>
       <button class="chip" onclick="toggleSection(this,'draw')">المخططات</button>
       <button class="chip" onclick="toggleSection(this,'app')">الاعتمادات</button>
       <button class="chip" onclick="toggleSection(this,'tender')">المناقصات</button>
       <button class="chip" onclick="toggleSection(this,'pct')">نسبة الإنجاز</button>
       <button class="chip" onclick="toggleSection(this,'date')">التاريخ</button>
       <button class="chip" onclick="toggleSection(this,'note')">ملاحظات</button>
     </span>
     <span class="legendbar" id="legendbar"></span>
   </div>
   ${reportBody(m,'ar')}
   ${reportBody(m,'en')}
   <div class="wabox no-print"><label for="wa">نص واتساب جاهز للنسخ والإرسال (يتبع لغة التقرير؛ حدّثه بزرّ «تحديث النص»)</label><textarea id="wa"></textarea></div>
   <script>
   var WAL=${WA};var LEG=${LEG};
   var CLS={OK:'s-ok',DONE:'s-ok',SUB:'s-sub',COM:'s-com',REQ:'s-work',READY:'s-work',HOLD:'s-hold','N/A':'s-na'};
   function active(){return document.querySelector('.nreport:not(.hidden)');}
   function lang(){var a=active();return a?a.getAttribute('data-lang'):'ar';}
   function stChange(sel){sel.className='stsel '+(CLS[sel.value]||'s-work');syncWA();}
   function renderLegend(){var g=lang(),el=document.getElementById('legendbar');if(!el)return;
     el.innerHTML='<span class="klbl">'+(g==='en'?'Legend:':'مفتاح الألوان:')+'</span>'+LEG[g].map(function(x){return '<span class="pill '+x.c+'">'+x.t+'</span>';}).join('');}
   function val(f){var a=active();var e=a&&a.querySelector('[data-f="'+f+'"]');return e?e.textContent.trim():'';}
   function pctShown(){var a=active();return a&&!a.classList.contains('hide-pct');}
   function syncWA(){
     var g=lang(),w=WAL[g],L=['*'+w.title+'*',''];
     L.push(w.owner+': '+val('owner'));
     L.push(w.project+': '+val('desc')+' · '+val('location'));
     L.push(w.no+': '+val('projectNo'));
     L.push('');
     if(pctShown())L.push('📊 '+w.pct+': '+val('pct'));
     L.push('📍 '+w.phase+': '+val('phase'));
     L.push('🏛️ '+w.permit+': '+val('permit'));
     L.push('🧾 '+w.contract+': '+val('contract'));
     L.push('➡️ '+w.next+': '+val('next'));
     L.push('');
     active().querySelectorAll('.sec').forEach(function(s){
       if(active().classList.contains('hide-'+s.getAttribute('data-sec')))return;
       L.push('*'+s.getAttribute('data-title')+':*');
       s.querySelectorAll('[data-row]').forEach(function(tr){
         var rs=tr.querySelector('.rs'),sel=rs.querySelector('select');
         var v=sel?sel.options[sel.selectedIndex].text.trim():rs.textContent.trim();
         var line='• '+tr.querySelector('.rl').textContent.trim()+': '+v;
         var a=active(),dc=tr.querySelector('.rdate'),nc=tr.querySelector('.rnote');
         if(dc&&!a.classList.contains('hide-date')){var dv=dc.textContent.trim();if(dv&&dv!=='—')line+=' · 📅 '+dv;}
         if(nc&&!a.classList.contains('hide-note')){var nv=nc.textContent.trim();if(nv&&nv!=='—')line+=' · 📝 '+nv;}
         L.push(line);
       });
       L.push('');
     });
     L.push('📅 '+w.date+': '+val('date'));
     L.push(w.footer+' · ‎+971 56 629 9449 · +971 54 524 6000 · INFO@NITAQ.AE');
     document.getElementById('wa').value=L.join('\\n');
     return document.getElementById('wa').value;
   }
   function copyWA(){var t=document.getElementById('wa');t.focus();t.select();
     var done=function(){flash('تم نسخ النص');};
     try{document.execCommand('copy');done();}catch(e){if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(done);}}
   function openWA(){window.open('https://wa.me/?text='+encodeURIComponent(document.getElementById('wa').value),'_blank');}
   function exportPDF(){window.print();}
   function toggleLang(){
     document.querySelectorAll('.nreport').forEach(function(r){r.classList.toggle('hidden');});
     var g=lang();
     document.getElementById('langBtn').textContent=g==='ar'?'English':'عربي';
     document.documentElement.setAttribute('lang',g);
     renderLegend();syncWA();
   }
   function toggleSection(btn,key){var cls='hide-'+key;
     document.querySelectorAll('.nreport').forEach(function(r){r.classList.toggle(cls);});
     btn.classList.toggle('off',active().classList.contains(cls));syncWA();}
   function flash(msg){var f=document.getElementById('flash');f.textContent=msg;f.style.opacity=1;setTimeout(function(){f.style.opacity=0;},1500);}
   window.addEventListener('load',function(){renderLegend();syncWA();});
   <\/script>
   </body></html>`;
 }

 function openOwnerReport(id){
   const p=(typeof projects!=='undefined'?projects:[]).find(x=>x.id===id);
   if(!p){if(typeof toast==='function')toast('المشروع غير موجود');return;}
   const html=reportDoc(model(p));
   let url=null;
   try{url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));}catch(e){url=null;}
   const w=window.open(url||'','_blank');
   if(!w){if(url)try{URL.revokeObjectURL(url);}catch(e){}if(typeof toast==='function')toast('المتصفح منع فتح تاب جديدة — اسمح بالنوافذ المنبثقة ثم جرّب تاني');return;}
   if(!url){try{w.document.open();w.document.write(html);w.document.close();}catch(e){}}
   else setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(e){}},120000);
 }

 window.openOwnerReport=openOwnerReport;
})();
