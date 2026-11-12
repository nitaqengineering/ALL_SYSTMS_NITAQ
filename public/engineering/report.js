/* ================= تقرير حالة المشروع للمالك =================
   يفتح في تاب جديدة: التقرير قابل للمراجعة والتعديل (كل النصوص editable)، ومنه
   يُصدَّر PDF أو يُرسَل كرسالة واتساب. فرونت-إند بالكامل: يُبنى من بيانات المشروع
   المحمّلة بالفعل ولا يلمس القاعدة أو السحابة. */
(function(){
 const STATUS_AR={REQ:'قيد العمل',READY:'جاهز للتقديم',SUB:'تم التقديم للجهة',COM:'عليه ملاحظات',OK:'معتمد','N/A':'لا يلزم',HOLD:'موقوف بطلب المالك',DONE:'مكتمل'};
 const STATUS_ICON={REQ:'🔸',READY:'📋',SUB:'📤',COM:'⚠️',OK:'✅','N/A':'➖',HOLD:'⏸️',DONE:'✅'};
 const STATUS_CLASS={REQ:'s-work',READY:'s-work',SUB:'s-sub',COM:'s-com',OK:'s-ok','N/A':'s-na',HOLD:'s-hold',DONE:'s-ok'};
 // خانة حالة المخططات: كل سطر مرتبط بمرحلة/مراحل في النظام.
 const DRAWINGS=[
   {label:'المخطط المعماري',keys:['design']},
   {label:'المخطط الإنشائي',keys:['struct']},
   {label:'المخطط الصحي',keys:['sanitary']},
   {label:'مخططات MEP (كهرباء/ميكانيكا/سباكة)',keys:['electric','water','gas']},
   {label:'الدفاع المدني',keys:['civil']},
   {label:'الاتصالات',keys:['telecom']},
 ];
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

 function model(p){
   const applicable=keys.filter(k=>!(k==='gas'&&p.service==='FEWA'));
   const doneN=applicable.filter(k=>['OK','N/A','DONE'].includes(p.stages[k].status)).length;
   const percent=applicable.length?Math.round(doneN/applicable.length*100):0;
   const pm=permit(p);
   let permitLabel;
   if(p.stages.design.status==='HOLD')permitLabel='موقوف بطلب المالك';
   else if(pm==='صدرت')permitLabel='صادرة'+(p.permitIssue&&p.permitIssue.number?(' · رقم '+p.permitIssue.number):'');
   else permitLabel=pm;
   let currentPhase,nextStep;
   if(p.stages.design.status==='DONE'){currentPhase='مكتمل';nextStep='اكتملت جميع مراحل المشروع';}
   else if(p.stages.design.status==='HOLD'){currentPhase='موقوف بطلب المالك';nextStep='المشروع موقوف مؤقتًا بطلب المالك — في انتظار موافقتكم على المتابعة';}
   else if(pm==='صدرت'){currentPhase='التنفيذ والإشراف';nextStep='الإشراف على تنفيذ المشروع بعد صدور الإجازة';}
   else{
     const miss=(typeof missing==='function')?missing(p):[];
     if(!((typeof ready==='function')&&ready(p))&&miss.length){currentPhase='استكمال متطلبات إجازة البناء';nextStep='استكمال: '+miss.join('، ');}
     else{
       const open=applicable.find(k=>!['OK','N/A','DONE','HOLD'].includes(p.stages[k].status));
       if(open){currentPhase=columnTitle(open);nextStep=columnTitle(open)+' — '+(STATUS_AR[p.stages[open].status]||'');}
       else{currentPhase='جاهز لإصدار إجازة البناء';nextStep='استكمال إجراءات إصدار إجازة البناء';}
     }
   }
   const drawings=DRAWINGS.map(d=>({label:d.label,st:d.keys.length>1?groupStatus(p,d.keys):p.stages[d.keys[0]].status}));
   return {p,percent,permitLabel,currentPhase,nextStep,drawings,date:today()};
 }

 const CSS=`
 *{box-sizing:border-box}
 body{margin:0;background:#eef1f4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1d2733;direction:rtl;padding:18px}
 .toolbar{max-width:820px;margin:0 auto 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:10px 12px;position:sticky;top:10px;z-index:5;box-shadow:0 2px 10px rgba(0,0,0,.05)}
 .toolbar button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:9px 14px;font-weight:700;background:#132a46;color:#fff}
 .toolbar button.gold{background:#a9824f}
 .toolbar button.ghost{background:#eef1f4;color:#132a46;border:1px solid #d7dce2}
 .toolbar .tip{font-size:12px;color:#6a7684;margin-inline-start:auto}
 #flash{position:fixed;inset-block-start:16px;inset-inline-start:50%;transform:translateX(50%);background:#1a7f37;color:#fff;padding:9px 16px;border-radius:8px;opacity:0;transition:opacity .25s;z-index:20;font-weight:700}
 .nreport{--navy:#132a46;--gold:#a9824f;--line:#e4e7ec;--soft:#f7f8fa;--ink:#1d2733;--muted:#6a7684;
   background:#fff;color:var(--ink);max-width:820px;margin:0 auto;border:1px solid var(--line);border-radius:10px;overflow:hidden}
 .nreport .hd{display:flex;align-items:center;gap:14px;padding:18px 22px;background:var(--navy);color:#fff}
 .nreport .hd img{height:42px;width:auto}
 .nreport .hd .t{flex:1}.nreport .hd h2{margin:0;font-size:20px}
 .nreport .hd .s{font-size:12px;opacity:.82;margin-top:2px}
 .nreport .hd .d{font-size:12px;opacity:.9;text-align:left;white-space:nowrap}
 .nreport .idbox{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-bottom:1px solid var(--line)}
 .nreport .idbox div{background:#fff;padding:9px 14px}
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
 .nreport .next{margin:4px 22px 14px;padding:11px 14px;background:#fff7ec;border:1px solid #efd9b5;border-radius:8px;font-size:13px}
 .nreport .next b{color:var(--gold)}
 .nreport h3{margin:6px 22px 8px;font-size:14px;color:var(--navy)}
 .nreport table{width:calc(100% - 44px);margin:0 22px 16px;border-collapse:collapse;font-size:13px}
 .nreport th,.nreport td{border:1px solid var(--line);padding:8px 10px;text-align:right}
 .nreport th{background:var(--soft);color:var(--muted);font-size:11px;font-weight:700}
 .nreport td.dl{font-weight:600}
 .nreport .st{font-weight:700}
 .nreport .s-ok{color:#1a7f37}.nreport .s-sub{color:#1f6feb}.nreport .s-com{color:#b26a00}
 .nreport .s-work{color:#6a7684}.nreport .s-hold{color:#9a3412}.nreport .s-na{color:#9aa4b0}
 .nreport .ft{padding:12px 22px;border-top:1px solid var(--line);background:var(--soft);font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .nreport .ft b{color:var(--navy)}
 [contenteditable]{outline:none;border-radius:4px}
 [contenteditable]:hover{box-shadow:inset 0 0 0 1px #d9c08a}
 [contenteditable]:focus{box-shadow:inset 0 0 0 2px #a9824f;background:#fffaf0}
 .wabox{max-width:820px;margin:16px auto 0;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:14px}
 .wabox label{display:block;font-weight:700;margin-bottom:6px}
 .wabox textarea{width:100%;min-height:260px;font:inherit;font-size:13px;line-height:1.7;direction:rtl;padding:10px;border:1px solid #e4e7ec;border-radius:8px}
 @media print{
   body{background:#fff;padding:0}
   .toolbar,.wabox,#flash,.no-print{display:none !important}
   .nreport{border:none;border-radius:0;max-width:100%}
   [contenteditable]:hover,[contenteditable]:focus{box-shadow:none;background:transparent}
   @page{size:A4;margin:12mm}
 }`;

 function reportBody(m){
   const p=m.p,id=s=>esc(String(s==null?'':s));
   const ed=' contenteditable="true" spellcheck="false"';
   const draws=m.drawings.map(d=>`<tr data-draw><td class="dl">${id(d.label)}</td><td class="ds"${ed}><span class="st ${STATUS_CLASS[d.st]||'s-work'}">${STATUS_ICON[d.st]||'•'} ${id(STATUS_AR[d.st]||d.st)}</span></td></tr>`).join('');
   return `<div class="nreport" id="report">
     <div class="hd"><img src="${logoURL()}" alt="نطاق"><div class="t"><h2>تقرير حالة المشروع</h2><div class="s">نطاق للاستشارات الهندسية — إدارة ومتابعة المشاريع</div></div><div class="d">بتاريخ<br><b id="rdate"${ed}>${id(m.date)}</b></div></div>
     <div class="idbox">
       <div><span>المالك</span><b data-f="owner"${ed}>${id(p.name)||'—'}</b></div>
       <div><span>رقم المشروع</span><b data-f="projectNo"${ed}>${id(p.id)}${p.sketch?(' · اسكتش '+id(p.sketch)):''}</b></div>
       <div><span>الموقع</span><b data-f="location"${ed}>${id(p.location)||'—'}</b></div>
       <div><span>وصف المشروع</span><b data-f="desc"${ed}>${id(p.desc)||'—'}</b></div>
       <div><span>جهة الخدمات</span><b${ed}>${id(p.service)||'—'}</b></div>
       <div><span>البلدية</span><b${ed}>${id(p.municipality)||'—'}</b></div>
     </div>
     <div class="kpis">
       <div class="kpi pct-kpi"><div class="lab">نسبة الإنجاز</div><div class="big" data-f="pct"${ed}>${m.percent}%</div></div>
       <div class="kpi"><div class="lab">المرحلة الحالية</div><div class="val" data-f="phase"${ed}>${id(m.currentPhase)}</div></div>
       <div class="kpi"><div class="lab">إجازة البناء</div><div class="val" data-f="permit"${ed}>${id(m.permitLabel)}</div></div>
       <div class="kpi"><div class="lab">عقد المقاول</div><div class="val" data-f="contract"${ed}>${p.contract?'موقّع':'غير موقّع'}</div></div>
     </div>
     <div class="barwrap"><div class="bar"><i style="width:${m.percent}%"></i></div></div>
     <div class="next">➡️ <b>الخطوة القادمة:</b> <span data-f="next"${ed}>${id(m.nextStep)}</span></div>
     <h3>حالة المخططات</h3>
     <table><thead><tr><th>المخطط</th><th>الحالة</th></tr></thead><tbody>${draws}</tbody></table>
     <div class="ft"><span><b>نطاق للاستشارات الهندسية</b> · الشارقة — الإمارات</span><span>📞 ‎+971 56 816 6402</span></div>
   </div>`;
 }

 function reportDoc(m){
   const title='تقرير حالة المشروع '+esc(m.p.id)+' — '+esc(m.p.name||'');
   return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body>
   <div id="flash"></div>
   <div class="toolbar no-print">
     <button class="gold" onclick="exportPDF()">🖨 تصدير PDF</button>
     <button onclick="openWA()">📱 إرسال واتساب</button>
     <button class="ghost" onclick="copyWA()">📋 نسخ نص الواتساب</button>
     <button class="ghost" onclick="syncWA()">↻ تحديث النص من التقرير</button>
     <button class="ghost" id="pctBtn" onclick="togglePct()">إخفاء نسبة الإنجاز</button>
     <span class="tip">راجع وعدّل أي نص داخل التقرير قبل التصدير.</span>
   </div>
   ${reportBody(m)}
   <div class="wabox no-print"><label for="wa">نص واتساب جاهز للنسخ والإرسال (يتحدّث من التقرير بزرّ «تحديث النص»)</label><textarea id="wa"></textarea></div>
   <script>
   function val(f){var e=document.querySelector('[data-f="'+f+'"]');return e?e.textContent.trim():'';}
   function pctShown(){return !document.getElementById('report').classList.contains('hide-pct');}
   function syncWA(){
     var L=['*تحديث حالة المشروع — نطاق للاستشارات الهندسية*',''];
     L.push('المالك: '+val('owner'));
     L.push('المشروع: '+val('desc')+' · '+val('location'));
     L.push('رقم المشروع: '+val('projectNo'));
     L.push('');
     if(pctShown())L.push('📊 نسبة الإنجاز: '+val('pct'));
     L.push('📍 المرحلة الحالية: '+val('phase'));
     L.push('🏛️ إجازة البناء: '+val('permit'));
     L.push('🧾 عقد المقاول: '+val('contract'));
     L.push('➡️ الخطوة القادمة: '+val('next'));
     L.push('');
     L.push('*حالة المخططات:*');
     document.querySelectorAll('[data-draw]').forEach(function(tr){
       L.push('• '+tr.querySelector('.dl').textContent.trim()+': '+tr.querySelector('.ds').textContent.trim());
     });
     L.push('');
     L.push('📅 بتاريخ: '+document.getElementById('rdate').textContent.trim());
     L.push('نطاق للاستشارات الهندسية · الشارقة · ‎+971 56 816 6402');
     document.getElementById('wa').value=L.join('\\n');
     return document.getElementById('wa').value;
   }
   function copyWA(){var t=document.getElementById('wa');t.focus();t.select();
     var done=function(){flash('تم نسخ نص الواتساب');};
     try{document.execCommand('copy');done();}catch(e){if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(done);}}
   function openWA(){window.open('https://wa.me/?text='+encodeURIComponent(document.getElementById('wa').value),'_blank');}
   function exportPDF(){window.print();}
   function togglePct(){var r=document.getElementById('report');var h=r.classList.toggle('hide-pct');
     document.getElementById('pctBtn').textContent=h?'إظهار نسبة الإنجاز':'إخفاء نسبة الإنجاز';syncWA();}
   function flash(msg){var f=document.getElementById('flash');f.textContent=msg;f.style.opacity=1;setTimeout(function(){f.style.opacity=0;},1500);}
   window.addEventListener('load',syncWA);
   <\/script>
   </body></html>`;
 }

 // Entry point from the project-actions select (app.js): opens the report in a new tab.
 // Uses a Blob URL so the tab is a fully-functional standalone document (scripts and buttons
 // run exactly as in a normal page), with a document.write fallback if Blob URLs are unavailable.
 function openOwnerReport(id){
   const p=(typeof projects!=='undefined'?projects:[]).find(x=>x.id===id);
   if(!p){if(typeof toast==='function')toast('المشروع غير موجود');return;}
   const html=reportDoc(model(p));
   let url=null;
   try{url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));}catch(e){url=null;}
   const w=window.open(url||'','_blank');
   if(!w){if(url)try{URL.revokeObjectURL(url);}catch(e){}if(typeof toast==='function')toast('المتصفح منع فتح تاب جديدة — اسمح بالنوافذ المنبثقة ثم جرّب تاني');return;}
   if(!url){ // Fallback for environments without Blob URL support.
     try{w.document.open();w.document.write(html);w.document.close();}catch(e){}
   }else{
     setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(e){}},120000);
   }
 }

 window.openOwnerReport=openOwnerReport;
})();
