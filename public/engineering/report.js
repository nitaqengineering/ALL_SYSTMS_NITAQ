/* ================= تقرير حالة المشروع للمالك =================
   تقرير احترافي مبسّط يُرسله مدير المشروع لمالك كل مشروع. فرونت-إند بالكامل:
   يُبنى من بيانات المشروع المحمّلة بالفعل ولا يلمس القاعدة أو السحابة.
   مخرجان: صفحة A4 ببراند نطاق (طباعة/حفظ PDF) + نص واتساب جاهز للنسخ. */
(function(){
 const STATUS_AR={REQ:'قيد العمل',READY:'جاهز للتقديم',SUB:'تم التقديم للجهة',COM:'عليه ملاحظات',OK:'معتمد','N/A':'لا يلزم',HOLD:'موقوف بطلب المالك',DONE:'مكتمل'};
 const STATUS_ICON={REQ:'🔸',READY:'📋',SUB:'📤',COM:'⚠️',OK:'✅','N/A':'➖',HOLD:'⏸️',DONE:'✅'};
 const STATUS_CLASS={REQ:'s-work',READY:'s-work',SUB:'s-sub',COM:'s-com',OK:'s-ok','N/A':'s-na',HOLD:'s-hold',DONE:'s-ok'};
 const logoURL=()=>{try{return new URL('../NITAQ-Logo-gold.svg',location.href).href;}catch(e){return '../NITAQ-Logo-gold.svg';}};

 // Aggregate a client-facing status for a group of internal stages (worst/least-advanced wins sensibly).
 function groupStatus(p,ks){
   const sts=ks.filter(k=>!(k==='gas'&&p.service==='FEWA')).map(k=>p.stages[k].status);
   if(!sts.length)return 'N/A';
   if(sts.every(s=>['OK','N/A'].includes(s)))return 'OK';
   if(sts.some(s=>s==='COM'))return 'COM';
   if(sts.some(s=>s==='SUB'))return 'SUB';
   if(sts.some(s=>s==='READY'))return 'READY';
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
   const rows=[
     {label:'التصميم',st:p.stages.design.status},
     {label:'التخطيط والتقديم',st:p.stages.planning.status},
     {label:'تنسيق ومطابقة المخططات',st:p.stages.coordination.status},
     {label:'اعتمادات جهات الخدمات',st:groupStatus(p,['electric','water','gas','telecom','civil'])},
     {label:'اعتماد البلدية',st:groupStatus(p,['munArch','munStruct','munSanitary'])},
   ];
   return {p,percent,permitLabel,currentPhase,nextStep,rows,date:today()};
 }

 const CSS=`
 .nreport{--navy:#132a46;--gold:#a9824f;--line:#e4e7ec;--soft:#f7f8fa;--ink:#1d2733;--muted:#6a7684;
   background:#fff;color:var(--ink);font-family:inherit;max-width:820px;margin:0 auto;border:1px solid var(--line);
   border-radius:10px;overflow:hidden;direction:rtl}
 .nreport *{box-sizing:border-box}
 .nreport .hd{display:flex;align-items:center;gap:14px;padding:18px 22px;background:var(--navy);color:#fff}
 .nreport .hd img{height:42px;width:auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
 .nreport .hd .t{flex:1}
 .nreport .hd h2{margin:0;font-size:20px;letter-spacing:.3px}
 .nreport .hd .s{font-size:12px;opacity:.82;margin-top:2px}
 .nreport .hd .d{font-size:12px;opacity:.9;text-align:left;white-space:nowrap}
 .nreport .idbox{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-bottom:1px solid var(--line)}
 .nreport .idbox div{background:#fff;padding:9px 14px}
 .nreport .idbox span{display:block;font-size:10.5px;color:var(--muted);margin-bottom:2px}
 .nreport .idbox b{font-size:13px;font-weight:700}
 .nreport .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 22px}
 .nreport .kpi{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center}
 .nreport .kpi .big{font-size:26px;font-weight:800;color:var(--navy);line-height:1.1}
 .nreport .kpi .lab{font-size:11px;color:var(--muted);margin-bottom:5px}
 .nreport .kpi .val{font-size:13px;font-weight:700;color:var(--ink);line-height:1.3}
 .nreport .barwrap{padding:0 22px 6px}
 .nreport .bar{height:12px;background:var(--soft);border:1px solid var(--line);border-radius:999px;overflow:hidden}
 .nreport .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#c6a66f)}
 .nreport .next{margin:4px 22px 14px;padding:11px 14px;background:#fff7ec;border:1px solid #efd9b5;border-radius:8px;font-size:13px}
 .nreport .next b{color:var(--gold)}
 .nreport h3{margin:6px 22px 8px;font-size:14px;color:var(--navy)}
 .nreport table{width:calc(100% - 44px);margin:0 22px 16px;border-collapse:collapse;font-size:13px}
 .nreport th,.nreport td{border:1px solid var(--line);padding:8px 10px;text-align:right}
 .nreport th{background:var(--soft);color:var(--muted);font-size:11px;font-weight:700}
 .nreport td .st{font-weight:700}
 .nreport .s-ok{color:#1a7f37}.nreport .s-sub{color:#1f6feb}.nreport .s-com{color:#b26a00}
 .nreport .s-work{color:#6a7684}.nreport .s-hold{color:#9a3412}.nreport .s-na{color:#9aa4b0}
 .nreport .ft{padding:12px 22px;border-top:1px solid var(--line);background:var(--soft);font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .nreport .ft b{color:var(--navy)}
 `;

 function body(m){
   const p=m.p;
   const id=s=>esc(String(s==null?'':s));
   const stageRows=m.rows.map(r=>`<tr><td>${id(r.label)}</td><td><span class="st ${STATUS_CLASS[r.st]||'s-work'}">${STATUS_ICON[r.st]||'•'} ${id(STATUS_AR[r.st]||r.st)}</span></td></tr>`).join('');
   return `<div class="nreport"><style>${CSS}</style>
   <div class="hd"><img src="${logoURL()}" alt="نطاق"><div class="t"><h2>تقرير حالة المشروع</h2><div class="s">نطاق للاستشارات الهندسية — إدارة ومتابعة المشاريع</div></div><div class="d">بتاريخ<br><b>${id(m.date)}</b></div></div>
   <div class="idbox">
     <div><span>المالك</span><b>${id(p.name)||'—'}</b></div>
     <div><span>رقم المشروع</span><b>${id(p.id)}${p.sketch?(' · اسكتش '+id(p.sketch)):''}</b></div>
     <div><span>الموقع</span><b>${id(p.location)||'—'}</b></div>
     <div><span>وصف المشروع</span><b>${id(p.desc)||'—'}</b></div>
     <div><span>جهة الخدمات</span><b>${id(p.service)||'—'}</b></div>
     <div><span>البلدية</span><b>${id(p.municipality)||'—'}</b></div>
   </div>
   <div class="kpis">
     <div class="kpi"><div class="lab">نسبة الإنجاز</div><div class="big">${m.percent}%</div></div>
     <div class="kpi"><div class="lab">المرحلة الحالية</div><div class="val">${id(m.currentPhase)}</div></div>
     <div class="kpi"><div class="lab">إجازة البناء</div><div class="val">${id(m.permitLabel)}</div></div>
     <div class="kpi"><div class="lab">عقد المقاول</div><div class="val">${p.contract?'موقّع':'غير موقّع'}</div></div>
   </div>
   <div class="barwrap"><div class="bar"><i style="width:${m.percent}%"></i></div></div>
   <div class="next">➡️ <b>الخطوة القادمة:</b> ${id(m.nextStep)}</div>
   <h3>حالة المراحل الرئيسية</h3>
   <table><thead><tr><th>المرحلة</th><th>الحالة</th></tr></thead><tbody>${stageRows}</tbody></table>
   <div class="ft"><span><b>نطاق للاستشارات الهندسية</b> · الشارقة — الإمارات</span><span>📞 ‎+971 56 816 6402</span></div>
   </div>`;
 }

 function whatsapp(m){
   const p=m.p;
   const L=[
     '*تحديث حالة المشروع — نطاق للاستشارات الهندسية*','',
     'المالك: '+(p.name||'—'),
     'المشروع: '+((p.desc||'—')+(p.location?(' · '+p.location):'')),
     'رقم المشروع: '+p.id+(p.sketch?(' · اسكتش '+p.sketch):''),'',
     '📊 نسبة الإنجاز: '+m.percent+'%',
     '📍 المرحلة الحالية: '+m.currentPhase,
     '🏛️ إجازة البناء: '+m.permitLabel,
     '➡️ الخطوة القادمة: '+m.nextStep,'',
     '*حالة المراحل:*',
     ...m.rows.map(r=>(STATUS_ICON[r.st]||'•')+' '+r.label+': '+(STATUS_AR[r.st]||r.st)),'',
     '📅 بتاريخ: '+m.date,
     'نطاق للاستشارات الهندسية · الشارقة · ‎+971 56 816 6402',
   ];
   return L.join('\n');
 }

 function printReport(m){
   const w=window.open('','_blank','width=860,height=1040');
   if(!w){toast('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة ثم جرّب تاني');return;}
   const doc=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
   <title>تقرير حالة المشروع ${esc(m.p.id)} — ${esc(m.p.name||'')}</title>
   <style>@page{size:A4;margin:12mm}body{margin:0;background:#eef1f4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:16px}
   .toolbar{max-width:820px;margin:0 auto 12px;text-align:center}
   .toolbar button{font:inherit;cursor:pointer;background:#132a46;color:#fff;border:0;border-radius:8px;padding:9px 18px;font-weight:700}
   @media print{.toolbar{display:none}body{background:#fff;padding:0}.nreport{border:none !important;border-radius:0 !important;max-width:100% !important}}</style>
   </head><body><div class="toolbar"><button onclick="window.print()">🖨 طباعة / حفظ PDF</button></div>${body(m)}
   <script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);});<\/script>
   </body></html>`;
   w.document.open();w.document.write(doc);w.document.close();
 }

 // Entry point called from the project-actions select (app.js).
 function openOwnerReport(id){
   const p=(typeof projects!=='undefined'?projects:[]).find(x=>x.id===id);
   if(!p){if(typeof toast==='function')toast('المشروع غير موجود');return;}
   const m=model(p);
   const wa=whatsapp(m);
   const html=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
       <button type="button" class="btn primary" id="orPrint">🖨 طباعة / حفظ PDF</button>
       <button type="button" class="btn" id="orCopy">📋 نسخ نص واتساب</button>
     </div>
     ${body(m)}
     <label for="orWa" style="display:block;margin:16px 0 6px;font-weight:700">نص واتساب جاهز للنسخ والإرسال</label>
     <textarea id="orWa" readonly rows="16" style="width:100%;font-family:inherit;font-size:13px;line-height:1.7;direction:rtl;padding:10px;border:1px solid #e4e7ec;border-radius:8px">${esc(wa)}</textarea>`;
   show('تقرير حالة المشروع للمالك',p.name+' · '+p.id,html,'documentHub',p.id);
   const pb=document.querySelector('#orPrint');if(pb)pb.onclick=()=>printReport(m);
   const cb=document.querySelector('#orCopy');if(cb)cb.onclick=()=>{
     const done=()=>{if(typeof toast==='function')toast('اتنسخ نص الواتساب');};
     if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(wa).then(done).catch(()=>{fallbackCopy();});}
     else fallbackCopy();
     function fallbackCopy(){const t=document.querySelector('#orWa');if(t){t.focus();t.select();try{document.execCommand('copy');done();}catch(e){}}}
   };
 }

 window.openOwnerReport=openOwnerReport;
})();
