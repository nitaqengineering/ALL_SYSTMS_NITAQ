/* Stage-status administration + the colour/meaning legend.
 *
 * Statuses per stage = the built-in set + db.custom[stage] (free-form codes a
 * manager adds). Their colour and plain-language meaning live in db.statusMeta
 * ({ code: {label, color} }). statusMeta rides along in the shared settings blob
 * (workspaceSettings sends every non-project key, the server stores it wholesale
 * and spreads it back into db on load), so no migration is needed; writes are
 * manager-only like all other settings.
 */

// Status colour/meaning helpers (statusColorClass, statusMeaning) and the
// legend renderer (renderStatusLegend) live in app.js so the table never
// depends on this file loading. This file only adds the manager UI; if it
// fails to load, the rest of the portal still renders normally.

// ---- Manager ----------------------------------------------------------------

const statusMgrColours = [
  ['', 'بدون لون (رمادي)'],
  ['work', 'أزرق — جارٍ العمل'],
  ['egy', 'بنفسجي — مخططات مصر'],
  ['wait', 'ذهبي — بانتظار خطوة'],
  ['done', 'أخضر — منجز'],
  ['blocked', 'أحمر — متوقف / مغلق']
];
function statusMgrStages() { return keys.filter(k => !['design', 'coordination'].includes(k)); }
let statusMgrStage = 'planning';

function openStatusManager() {
  if (!managerPreview()) return;
  if (!statusMgrStages().includes(statusMgrStage)) statusMgrStage = statusMgrStages()[0];
  show('إدارة حالات المراحل',
    'أضف حالات جديدة أو احذفها، وحرّر معناها ولونها. أي تعديل يظهر فورًا في القوائم والجدول والمفتاح.',
    '<div id="statusMgr"></div>', 'documentHub');
  renderStatusManager();
}

function renderStatusManager() {
  const host = document.getElementById('statusMgr');
  if (!host) return;
  const k = statusMgrStage;
  const stageSelect = '<label for="statusMgrStageSel">المرحلة</label><select id="statusMgrStageSel">' +
    statusMgrStages().map(s => '<option value="' + esc(s) + '"' + (s === k ? ' selected' : '') + '>' + esc(columnTitle(s)) + '</option>').join('') +
    '</select>';
  const rows = states(k).map(code => {
    const isCustom = !standard.includes(code) && (db.custom?.[k] || []).includes(code);
    const used = projects.filter(p => p.stages?.[k]?.status === code).length;
    const colour = statusColorClass(code);
    return '<div class="statusrow">' +
      '<span class="badge ' + statusColorClass(code) + ' legend-swatch">' + esc(code) + '</span>' +
      '<input class="document-grid-input statusmeaning" data-code="' + esc(code) + '" value="' + esc(statusMeaning(code)) + '" placeholder="المعنى — يظهر في المفتاح والتلميح">' +
      '<select class="statuscolor" data-code="' + esc(code) + '" aria-label="لون حالة ' + esc(code) + '">' +
        statusMgrColours.map(([v, t]) => '<option value="' + v + '"' + (colour === v ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select>' +
      '<span class="sub statususe">مستخدمة في ' + used + '</span>' +
      (isCustom ? '<button type="button" class="btn xs statusdel" data-code="' + esc(code) + '">حذف</button>' : '<span class="sub statusfixed">أساسية</span>') +
      '</div>';
  }).join('');
  host.innerHTML = stageSelect +
    '<div class="status-add"><input id="statusNewCode" class="document-grid-input" placeholder="رمز حالة جديد (مثال: dwg)" maxlength="16"><button type="button" class="btn primary" id="statusAddBtn">إضافة</button></div>' +
    '<div class="statuslist">' + rows + '</div>' +
    '<p class="sub statusnote">الحذف بيشيل الحالة من القائمة بس — أي مشروع حالته كده دلوقتي بيفضل زي ما هو لحد ما تغيّره يدويًا.</p>';
}

function statusMgrAdd() {
  if (!managerPreview()) return;
  const k = statusMgrStage, input = document.getElementById('statusNewCode');
  const code = (input?.value || '').trim();
  if (!code) return;
  if (states(k).includes(code)) { toast('الحالة «' + code + '» موجودة بالفعل في هذه المرحلة'); return; }
  (db.custom ??= {});
  (db.custom[k] ??= []).push(code);
  persist();
  if (input) input.value = '';
  renderStatusManager();
  renderStatusLegend();
}

function statusMgrDelete(code) {
  if (!managerPreview()) return;
  const k = statusMgrStage, arr = db.custom?.[k] || [];
  if (standard.includes(code)||!arr.includes(code)) return;
  const used = projects.filter(p => p.stages?.[k]?.status === code).length;
  if (used && !confirm('الحالة «' + code + '» مستخدمة في ' + used + ' مشروع. تحذفها من القائمة؟ المشاريع دي هتفضل بحالتها الحالية.')) return;
  db.custom[k] = arr.filter(c => c !== code);
  persist();
  renderStatusManager();
  renderStatusLegend();
  render();
}

function statusMgrSetMeta(code, patch) {
  if (!managerPreview()) return;
  (db.statusMeta ??= {});
  const next = { ...(db.statusMeta[code] || {}), ...patch };
  if (!next.label) delete next.label;
  if (!next.color) delete next.color;
  if (Object.keys(next).length) db.statusMeta[code] = next; else delete db.statusMeta[code];
  persist();
  renderStatusLegend();
}

document.addEventListener('change', event => {
  const t = event.target;
  if (!t || !t.dataset) return;
  if (t.id === 'statusMgrStageSel') { statusMgrStage = t.value; renderStatusManager(); return; }
  if (t.classList.contains('statusmeaning')) { statusMgrSetMeta(t.dataset.code, { label: t.value.trim() }); return; }
  if (t.classList.contains('statuscolor')) { statusMgrSetMeta(t.dataset.code, { color: t.value }); renderStatusManager(); render(); return; }
});

document.addEventListener('click', event => {
  const b = event.target.closest?.('button');
  if (!b) return;
  if (b.id === 'statusAddBtn') { statusMgrAdd(); return; }
  if (b.classList.contains('statusdel')) { statusMgrDelete(b.dataset.code); return; }
});
