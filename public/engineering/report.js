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
   cItem:{ar:'البند',en:'Item'},cStatus:{ar:'الحالة',en:'Status'},
   tStatus:{ar:'حالة المناقصة',en:'Tender status'},tType:{ar:'نوع التعاقد',en:'Contract type'},
   tContractor:{ar:'المقاول',en:'Contractor'},tOffers:{ar:'العروض / ملاحظات',en:'Offers / notes'},
   main:{ar:'مقاول رئيسي',en:'Main contractor'},
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
   const drawings=[
     {label:ROW.des,st:stStat(p,['design'])},
     {label:ROW.str,st:stStat(p,['struct'])},
     {label:ROW.san,st:stStat(p,['sanitary'])},
     {label:ROW.coord,st:stStat(p,['coordination'])},
   ];
   const approvals=[
     {label:ROW.plan,st:stStat(p,['planning'])},
     {label:ROW.civ,st:stStat(p,['civil'])},
     {label:{ar:'الخدمات ('+(p.service||'—')+')',en:'Utilities ('+(p.service||'—')+')'},st:stStat(p,['electric','water','gas'])},
     {label:ROW.tel,st:stStat(p,['telecom'])},
     {label:{ar:'البلدية ('+(p.municipality||'—')+')',en:'Municipality ('+(p.municipality||'—')+')'},st:stStat(p,['munArch','munStruct','munSanitary'])},
   ];
   const tStatus=p.stages.tender?p.stages.tender.status:'N/A';
   const tender={show:tStatus!=='N/A',status:tStatus,contractor:(p.tender&&p.tender.contractor)||'',offers:(p.tender&&p.tender.offers)||''};
   return {p,percent,drawings,approvals,tender,date:today(),ar:derive(p,'ar'),en:derive(p,'en')};
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
 .nreport table{width:calc(100% - 44px);margin:0 22px 16px;border-collapse:collapse;font-size:13px}
 .nreport th,.nreport td{border:1px solid var(--line);padding:8px 10px;text-align:right}
 .nreport th{background:var(--soft);color:var(--muted);font-size:11px;font-weight:700}
 .nreport td.rl{font-weight:600}
 .nreport .st{font-weight:700}
 .nreport .s-ok{color:#1a7f37}.nreport .s-sub{color:#1f6feb}.nreport .s-com{color:#b26a00}
 .nreport .s-work{color:#6a7684}.nreport .s-hold{color:#9a3412}.nreport .s-na{color:#9aa4b0}
 .nreport .ft{padding:12px 22px;border-top:1px solid var(--line);background:var(--soft);font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .nreport .ft b{color:var(--navy)}
 [contenteditable]{outline:none;border-radius:4px}
 [contenteditable]:hover{box-shadow:inset 0 0 0 1px #d9c08a}
 [contenteditable]:focus{box-shadow:inset 0 0 0 2px #a9824f;background:#fffaf0}
 .wabox{max-width:820px;margin:16px auto 0;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:14px;direction:rtl}
 .wabox label{display:block;font-weight:700;margin-bottom:6px}
 .wabox textarea{width:100%;min-height:280px;font:inherit;font-size:13px;line-height:1.7;padding:10px;border:1px solid #e4e7ec;border-radius:8px}
 @media print{body{background:#fff;padding:0}.toolbar,.wabox,#flash,.no-print{display:none !important}.nreport{border:none;border-radius:0;max-width:100%}[contenteditable]:hover,[contenteditable]:focus{box-shadow:none;background:transparent}@page{size:A4;margin:12mm}}`;

 function reportBody(m,lang){
   const p=m.p,id=s=>esc(String(s==null?'':s)),ed=' contenteditable="true" spellcheck="false"';
   const dir=lang==='en'?'ltr':'rtl';
   const d=m[lang];
   const descVal=lang==='en'?(p.descEn||p.desc):p.desc;
   const sline=r=>`<span class="st ${(STATUS[r.st]||{}).c||'s-work'}">${ICON[r.st]||'•'} ${id((STATUS[r.st]||{})[lang]||r.st)}</span>`;
   const rowsOf=arr=>arr.map(r=>`<tr data-row><td class="rl">${id(r.label[lang])}</td><td class="rs"${ed}>${sline(r)}</td></tr>`).join('');
   const sec=(key,secKey,rows)=>`<div class="sec" data-sec="${secKey}" data-title="${id(T[key][lang])}"><h3>${id(T[key][lang])}</h3><table><thead><tr><th>${id(T.cItem[lang])}</th><th>${id(T.cStatus[lang])}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
   let tender='';
   if(m.tender.show){
     const ph=(TENDER[m.tender.status]||{})[lang]||m.tender.status;
     tender=`<div class="sec" data-sec="tender" data-title="${id(T.secTen[lang])}"><h3>${id(T.secTen[lang])}</h3><table><tbody>`+
       `<tr data-row><td class="rl">${id(T.tStatus[lang])}</td><td class="rs"${ed}>${id(ph)}</td></tr>`+
       `<tr data-row><td class="rl">${id(T.tType[lang])}</td><td class="rs"${ed}>${id(T.main[lang])}</td></tr>`+
       `<tr data-row><td class="rl">${id(T.tContractor[lang])}</td><td class="rs"${ed}>${id(m.tender.contractor)||'—'}</td></tr>`+
       `<tr data-row><td class="rl">${id(T.tOffers[lang])}</td><td class="rs"${ed}>${id(m.tender.offers)||'—'}</td></tr>`+
       `</tbody></table></div>`;
   }
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
     <div class="kpis">
       <div class="kpi pct-kpi"><div class="lab">${id(T.pct[lang])}</div><div class="big" data-f="pct"${ed}>${m.percent}%</div></div>
       <div class="kpi"><div class="lab">${id(T.phase[lang])}</div><div class="val" data-f="phase"${ed}>${id(d.currentPhase)}</div></div>
       <div class="kpi"><div class="lab">${id(T.permit[lang])}</div><div class="val" data-f="permit"${ed}>${id(d.permitLabel)}</div></div>
       <div class="kpi"><div class="lab">${id(T.contract[lang])}</div><div class="val" data-f="contract"${ed}>${id(p.contract?T.signed[lang]:T.unsigned[lang])}</div></div>
     </div>
     <div class="barwrap"><div class="bar"><i style="width:${m.percent}%"></i></div></div>
     <div class="next">➡️ <b>${id(T.next[lang])}:</b> <span data-f="next"${ed}>${id(d.nextStep)}</span></div>
     ${sec('secDraw','draw',rowsOf(m.drawings))}
     ${sec('secApp','app',rowsOf(m.approvals))}
     ${tender}
     <div class="ft"><span><b>${id(T.footer[lang])}</b></span><span>📞 ‎+971 56 816 6402</span></div>
   </div>`;
 }

 function reportDoc(m){
   const title=esc(T.title.ar.replace(/\s+/g,' '))+' '+esc(m.p.id)+' — '+esc(m.p.name||'');
   const WA=JSON.stringify({ar:{title:T.waTitle.ar,owner:T.owner.ar,project:T.waProject.ar,no:T.projectNo.ar,pct:T.pct.ar,phase:T.phase.ar,permit:T.permit.ar,contract:T.contract.ar,next:T.next.ar,date:T.date.ar,footer:T.footer.ar},en:{title:T.waTitle.en,owner:T.owner.en,project:T.waProject.en,no:T.projectNo.en,pct:T.pct.en,phase:T.phase.en,permit:T.permit.en,contract:T.contract.en,next:T.next.en,date:T.date.en,footer:T.footer.en}});
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
     </span>
   </div>
   ${reportBody(m,'ar')}
   ${reportBody(m,'en')}
   <div class="wabox no-print"><label for="wa">نص واتساب جاهز للنسخ والإرسال (يتبع لغة التقرير؛ حدّثه بزرّ «تحديث النص»)</label><textarea id="wa"></textarea></div>
   <script>
   var WAL=${WA};
   function active(){return document.querySelector('.nreport:not(.hidden)');}
   function lang(){var a=active();return a?a.getAttribute('data-lang'):'ar';}
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
         L.push('• '+tr.querySelector('.rl').textContent.trim()+': '+tr.querySelector('.rs').textContent.trim());
       });
       L.push('');
     });
     L.push('📅 '+w.date+': '+val('date'));
     L.push(w.footer+' · ‎+971 56 816 6402');
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
     syncWA();
   }
   function toggleSection(btn,key){var cls='hide-'+key;
     document.querySelectorAll('.nreport').forEach(function(r){r.classList.toggle(cls);});
     btn.classList.toggle('off',active().classList.contains(cls));syncWA();}
   function flash(msg){var f=document.getElementById('flash');f.textContent=msg;f.style.opacity=1;setTimeout(function(){f.style.opacity=0;},1500);}
   window.addEventListener('load',syncWA);
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
