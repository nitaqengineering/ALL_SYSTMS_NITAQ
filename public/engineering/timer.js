/* Project work stopwatch. Self-contained: all state lives in a separate time_logs table reached through
   dedicated RPCs, so starting/stopping a timer never touches the project-document save or its CAS.
   Depends on globals from app.js/shared-workspace.js: projects, titles, keys, esc, toast,
   loadAccountingCloudClient, sharedWorkspacePermissions, NITAQ_SHARED_ACTIVE. */
(function(){
  const stageTitles = typeof titles === 'object' ? titles : {};
  let current = null;            // the caller's running session, or null
  let serverOffsetMs = 0;        // server clock minus local clock, for an honest on-screen tick
  let capSeconds = 43200;
  let tickHandle = null, lastFetch = 0, busy = false;

  const escape = s => (typeof esc === 'function' ? esc(s) : String(s??''));
  const member = () => typeof sharedWorkspacePermissions === 'object' && sharedWorkspacePermissions;
  const isManager = () => member() && sharedWorkspacePermissions.manager === true;
  const active = () => window.NITAQ_SHARED_ACTIVE === true && !!member();
  const projById = id => (typeof projects !== 'undefined' ? projects : []).find(p => p.id === id);
  const projLabel = id => { const p = projById(id); return p ? (p.id + ' — ' + (p.name||'')) : id; };
  const stageLabel = k => stageTitles[k] || k;
  const note = msg => { if (typeof toast === 'function') toast(msg); };

  function fmt(seconds){
    seconds = Math.max(0, Math.round(seconds));
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  function hoursLabel(seconds){
    const h = Math.floor(seconds/3600), m = Math.round((seconds%3600)/60);
    return h ? (h+' س '+(m?m+' د':'')).trim() : (m+' د');
  }

  // Exposed as an rpc method so each call site names the RPC as a string literal; the deploy-gate
  // contract scanner only recognises a quoted name right after the dotted rpc call.
  const api = {
    async rpc(name, args){
      const client = await loadAccountingCloudClient();
      const result = await client.rpc(name, args||{});
      if (result.error){
        const map = { '42501':'ليست لديك صلاحية هذا الإجراء.', 'P0001':'لا يوجد عدّاد يعمل الآن.' };
        throw Error(map[result.error.code] || result.error.message || 'تعذّر تنفيذ العملية.');
      }
      return result.data;
    }
  };

  async function refresh(){
    if (!active()) { current = null; renderBanner(); return; }
    try {
      const data = await api.rpc('nitaq_engineering_timer_current_v1');
      if (data && data.server_now){ serverOffsetMs = Date.parse(data.server_now) - Date.now(); capSeconds = data.cap_seconds || capSeconds; }
      current = (data && data.id) ? data : null;
      lastFetch = Date.now();
    } catch (error) { /* keep the last known state on a transient read error */ }
    renderBanner();
  }

  function elapsedSeconds(row){
    const start = Date.parse(row.started_at);
    const nowServer = Date.now() + serverOffsetMs;
    return Math.min(capSeconds, Math.max(0, (nowServer - start)/1000));
  }

  // ---- floating banner ----
  function bannerEl(){
    let el = document.getElementById('nitaq-timer-banner');
    if (!el){
      el = document.createElement('div');
      el.id = 'nitaq-timer-banner';
      el.style.cssText = 'position:fixed;inset-inline-end:16px;bottom:16px;z-index:9000;background:#0f2a46;color:#fff;border:1px solid #b2893f;border-radius:10px;padding:10px 14px;box-shadow:0 6px 20px rgba(0,0,0,.3);font-size:13px;display:none;align-items:center;gap:12px;max-width:min(92vw,380px)';
      document.body.appendChild(el);
    }
    return el;
  }
  function renderBanner(){
    const el = bannerEl();
    if (!current){ el.style.display = 'none'; return; }
    const secs = elapsedSeconds(current);
    const capped = secs >= capSeconds;
    el.style.display = 'flex';
    el.innerHTML = '<span style="font-size:18px">⏱</span>'
      + '<div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escape(projLabel(current.project_id))+'</div>'
      + '<div style="color:#cdd8e4;font-size:11px">'+escape(stageLabel(current.stage_key))+'</div></div>'
      + '<div style="font-variant-numeric:tabular-nums;font-size:16px;font-weight:700'+(capped?';color:#f2b705':'')+'">'+fmt(secs)+'</div>'
      + '<button type="button" id="nitaq-timer-stop" style="background:#b2342f;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:700">إيقاف</button>';
    el.querySelector('#nitaq-timer-stop').onclick = () => stop();
  }

  function startTick(){
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      if (current) renderBanner();
      if (Date.now() - lastFetch > 60000) void refresh();   // reconcile with the server each minute
    }, 1000);
  }

  // ---- actions ----
  async function start(projectId, stageKey, noteText){
    if (busy) return; busy = true;
    try {
      if (!projById(projectId)) throw Error('المشروع غير موجود.');
      await api.rpc('nitaq_engineering_timer_start_v1', { p_project: projectId, p_stage: stageKey, p_note: noteText||null });
      await refresh();
      note('بدأ العدّاد على ' + projLabel(projectId));
      if (document.getElementById('nitaq-timer-dialog')?.open) renderPanel();
    } catch (error) { note(error.message); } finally { busy = false; }
  }
  async function stop(id){
    if (busy) return; busy = true;
    try {
      await api.rpc('nitaq_engineering_timer_stop_v1', { p_id: id ?? null });
      await refresh();
      note('تم إيقاف العدّاد.');
      if (document.getElementById('nitaq-timer-dialog')?.open) renderPanel();
    } catch (error) { note(error.message); } finally { busy = false; }
  }

  // ---- panel (start controls + report) ----
  function dialogEl(){
    let dlg = document.getElementById('nitaq-timer-dialog');
    if (!dlg){
      dlg = document.createElement('dialog');
      dlg.id = 'nitaq-timer-dialog';
      dlg.style.cssText = 'width:min(880px,95vw);max-height:90vh;border:0;border-radius:12px;padding:0;color:#12263a';
      dlg.innerHTML = '<div id="nitaq-timer-body" style="padding:18px"></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }
    return dlg;
  }

  let reportData = null, filterProject = '', filterFrom = '', filterTo = '';

  async function openPanel(preselectProject){
    const dlg = dialogEl();
    dlg.showModal();
    dlg.dataset.preselect = preselectProject || '';
    await refresh();
    await loadReport();
  }

  async function loadReport(){
    try { reportData = await api.rpc('nitaq_engineering_time_report_v1', { p_project: filterProject||null, p_from: filterFrom||null, p_to: filterTo||null }); }
    catch (error) { reportData = null; note(error.message); }
    renderPanel();
  }

  function renderPanel(){
    const dlg = document.getElementById('nitaq-timer-dialog');
    if (!dlg || !dlg.open) return;
    const body = dlg.querySelector('#nitaq-timer-body');
    const preselect = dlg.dataset.preselect || '';
    const projectOptions = (typeof projects !== 'undefined' ? projects : []).slice()
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .map(p => '<option value="'+escape(p.id)+'"'+(p.id===preselect?' selected':'')+'>'+escape(projLabel(p.id))+'</option>').join('');
    const stageOptions = Object.keys(stageTitles).map(k => '<option value="'+escape(k)+'">'+escape(stageLabel(k))+'</option>').join('');

    const running = current
      ? '<div style="background:#eaf3ff;border:1px solid #9cc0ef;border-radius:8px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px">'
        + '<span style="font-size:20px">⏱</span><div style="flex:1"><b>'+escape(projLabel(current.project_id))+'</b> · '+escape(stageLabel(current.stage_key))
        + '<div style="font-size:12px;color:#44607e">يعمل منذ '+escape(new Date(Date.parse(current.started_at)).toLocaleString('en-GB',{timeZone:'Asia/Dubai'}))+'</div></div>'
        + '<button type="button" class="btn" id="tp-stop" style="background:#b2342f;color:#fff">إيقاف العدّاد</button></div>'
      : '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px">'
        + '<label style="flex:2;min-width:180px">المشروع<select id="tp-project" style="width:100%">'+projectOptions+'</select></label>'
        + '<label style="flex:1;min-width:120px">القسم<select id="tp-stage" style="width:100%">'+stageOptions+'</select></label>'
        + '<label style="flex:2;min-width:160px">ملاحظة (اختياري)<input id="tp-note" maxlength="500" style="width:100%"></label>'
        + '<button type="button" class="btn primary" id="tp-start">▶ ابدأ العمل</button></div>';

    let report = '<p class="sub">جارٍ تحميل التقرير…</p>';
    if (reportData){
      const totals = reportData.totals || [], open = reportData.open || [], recent = reportData.recent || [];
      const byEngineer = {};
      for (const t of totals){ (byEngineer[t.engineer_name] ??= []).push(t); }
      const grand = {};
      report = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:10px 0">'
        + '<label>المشروع<select id="tp-filter-project" style="width:100%"><option value="">كل المشاريع</option>'
          + (typeof projects!=='undefined'?projects:[]).map(p=>'<option value="'+escape(p.id)+'"'+(p.id===filterProject?' selected':'')+'>'+escape(projLabel(p.id))+'</option>').join('')+'</select></label>'
        + '<label>من<input type="date" id="tp-filter-from" value="'+escape(filterFrom)+'"></label>'
        + '<label>إلى<input type="date" id="tp-filter-to" value="'+escape(filterTo)+'"></label>'
        + '<button type="button" class="btn" id="tp-filter-apply">تطبيق</button>'
        + '<button type="button" class="btn" id="tp-export">↓ تصدير CSV</button></div>';
      if (open.length){
        report += '<div style="background:#fff7e6;border:1px solid #f2c879;border-radius:8px;padding:10px;margin-bottom:10px"><b>جلسات مفتوحة ('+open.length+')</b>'
          + '<table style="width:100%;margin-top:6px"><tbody>'
          + open.map(o=>'<tr><td>'+escape(o.engineer_name)+'</td><td>'+escape(projLabel(o.project_id))+'</td><td>'+escape(stageLabel(o.stage_key))+'</td><td>'+fmt(o.seconds)+'</td>'
            + '<td style="text-align:end"><button type="button" class="btn xs" data-tp-close="'+o.id+'" data-start="'+escape(o.started_at)+'">إغلاق وتصحيح</button></td></tr>').join('')
          + '</tbody></table></div>';
      }
      report += '<table style="width:100%"><thead><tr><th style="text-align:start">المهندس</th><th style="text-align:start">المشروع</th><th style="text-align:start">القسم</th><th>الإجمالي</th><th>جلسات</th></tr></thead><tbody>';
      const names = Object.keys(byEngineer).sort();
      if (!names.length) report += '<tr><td colspan="5" style="text-align:center;color:#789">لا توجد أوقات مسجّلة ضمن النطاق</td></tr>';
      for (const name of names){
        let engTotal = 0;
        for (const t of byEngineer[name].sort((a,b)=>String(a.project_id).localeCompare(b.project_id))){
          engTotal += Number(t.seconds)||0; grand[name] = (grand[name]||0);
          report += '<tr><td>'+escape(name)+'</td><td>'+escape(projLabel(t.project_id))+'</td><td>'+escape(stageLabel(t.stage_key))
            + (t.running?' <span style="color:#1a7f37">●</span>':'')+'</td><td style="text-align:center;font-variant-numeric:tabular-nums">'+hoursLabel(t.seconds)+'</td><td style="text-align:center">'+t.sessions+'</td></tr>';
        }
        report += '<tr style="font-weight:700;background:#f3f6fb"><td colspan="3">إجمالي '+escape(name)+'</td><td style="text-align:center">'+hoursLabel(engTotal)+'</td><td></td></tr>';
      }
      report += '</tbody></table>';
      if (recent.length){
        report += '<details style="margin-top:12px"><summary>آخر الجلسات ('+recent.length+')</summary><table style="width:100%;margin-top:6px"><tbody>'
          + recent.map(r=>'<tr><td>'+escape(r.engineer_name)+'</td><td>'+escape(projLabel(r.project_id))+'</td><td>'+escape(stageLabel(r.stage_key))+'</td>'
            + '<td style="font-size:11px">'+escape(new Date(Date.parse(r.started_at)).toLocaleString('en-GB',{timeZone:'Asia/Dubai'}))+'</td>'
            + '<td>'+(r.ended_at?fmt(r.seconds):'<span style="color:#f0a202">مفتوحة</span>')+(r.auto_closed?' <span title="أُغلقت تلقائيًا عند الحد" style="color:#f0a202">⚠</span>':'')+'</td>'
            + '<td style="text-align:end"><button type="button" class="btn xs" data-tp-delete="'+r.id+'">حذف</button></td></tr>').join('')
          + '</tbody></table></details>';
      }
    }

    body.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<h3 style="margin:0">⏱ أوقات العمل على المشاريع</h3><button type="button" class="btn" id="tp-x">إغلاق</button></div>'
      + running + '<hr style="border:0;border-top:1px solid #e3e9f1;margin:12px 0">' + report;

    // wire
    body.querySelector('#tp-x').onclick = () => dlg.close();
    const stopBtn = body.querySelector('#tp-stop'); if (stopBtn) stopBtn.onclick = () => stop();
    const startBtn = body.querySelector('#tp-start');
    if (startBtn) startBtn.onclick = () => {
      const p = body.querySelector('#tp-project').value, s = body.querySelector('#tp-stage').value, n = body.querySelector('#tp-note').value;
      if (!p) return note('اختر المشروع');
      start(p, s, n);
    };
    const applyBtn = body.querySelector('#tp-filter-apply');
    if (applyBtn) applyBtn.onclick = () => { filterProject = body.querySelector('#tp-filter-project').value; filterFrom = body.querySelector('#tp-filter-from').value; filterTo = body.querySelector('#tp-filter-to').value; loadReport(); };
    const exportBtn = body.querySelector('#tp-export'); if (exportBtn) exportBtn.onclick = exportCsv;
    body.querySelectorAll('[data-tp-close]').forEach(b => b.onclick = () => adjustSession(Number(b.dataset.tpClose), b.dataset.start));
    body.querySelectorAll('[data-tp-delete]').forEach(b => b.onclick = () => deleteSession(Number(b.dataset.tpDelete)));
  }

  async function adjustSession(id, startIso){
    // Close an open session (or fix a wrong one) by entering the real end time; the server stamps the correction.
    const endStr = prompt('وقت انتهاء العمل الفعلي (YYYY-MM-DD HH:MM، بتوقيت دبي):', new Date(Date.now()+serverOffsetMs).toISOString().slice(0,16).replace('T',' '));
    if (endStr === null) return;
    const ended = new Date(endStr.replace(' ','T')+':00');
    if (isNaN(ended)) return note('صيغة وقت غير صحيحة');
    try { await api.rpc('nitaq_engineering_timer_adjust_v1', { p_id: id, p_started: startIso, p_ended: ended.toISOString(), p_note: null }); await refresh(); await loadReport(); note('تم تصحيح الجلسة'); }
    catch (error){ note(error.message); }
  }
  async function deleteSession(id){
    if (!confirm('حذف هذه الجلسة نهائيًا؟')) return;
    try { await api.rpc('nitaq_engineering_timer_delete_v1', { p_id: id }); await refresh(); await loadReport(); note('تم الحذف'); }
    catch (error){ note(error.message); }
  }
  function exportCsv(){
    if (!reportData) return;
    const rows = [['المهندس','المشروع','القسم','الثواني','الساعات','جلسات']];
    for (const t of reportData.totals||[]) rows.push([t.engineer_name, projLabel(t.project_id), stageLabel(t.stage_key), t.seconds, (t.seconds/3600).toFixed(2), t.sessions]);
    const csv = '﻿'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})), a = document.createElement('a');
    a.href = url; a.download = 'nitaq-time-'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  // ---- header button + boot ----
  function installButton(){
    const header = document.querySelector('header');
    if (!header || document.getElementById('nitaq-timer-open')) return;
    const btn = document.createElement('button');
    btn.id = 'nitaq-timer-open'; btn.type = 'button'; btn.className = 'btn'; btn.textContent = '⏱ أوقات العمل';
    btn.style.cssText = 'margin-inline-start:8px';
    btn.onclick = () => { if (!active()) return note('سجّل الدخول لمساحة المشاريع المشتركة أولًا.'); openPanel(); };
    header.appendChild(btn);
  }

  // Quick start/stop from a project row (app.js routes the "timer" action here).
  window.openTimerFor = function(projectId){
    if (!active()) return note('سجّل الدخول لمساحة المشاريع المشتركة أولًا.');
    if (current && current.project_id === projectId){ stop(); return; }
    openPanel(projectId);
  };

  function boot(){
    installButton();
    bannerEl();
    startTick();
    void refresh();
    window.addEventListener('focus', () => { if (active()) void refresh(); });
    window.addEventListener('nitaq-accounting-connected', () => void refresh());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
