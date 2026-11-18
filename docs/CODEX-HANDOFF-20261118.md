# تسليم Codex — كل المطلوب والناقص في المشروع (2026‑11‑18)

ملخص الحالة: فرع `feat/project-timer` ينشر على `main`. آخر commit = `45837f5`.
- ✅ `check` و`backup-selftest` و`Publish Pages` خضراء.
- 🔴 `Check package` لسه أحمر بسبب **بند واحد فقط**: `simulate:office-day` (التفاصيل في A1).
- حزمة واجهة Codex (حسابات/CRM/نوافذ/موبايل) **لسه في مجلد الشغل غير مدمجة** (لم تُرفع).
- **SQL 019 لم يُطبّق على الإنتاج بعد.**

ملاحظة تشغيل محلي للـ DB: `NITAQ_TEST_DATABASE_URL=postgresql://... NITAQ_TEST_ALLOW_DISPOSABLE=1 npm run check:database` و`npm run simulate:office-day` (على Postgres 17 معزول).

---

## A) إصلاح الـ CI (أولوية قصوى — تخلّي `Check package` أخضر)

**A1 — `simulate:office-day` فشل.**
- ظهر بعد ما SQL 019 صلّح `check:database` (قبل كده كان بيقف عند `check:database` فالـ office-day ما كانش بيوصل).
- `scripts/office-day-simulation.mjs` بيحمّل migrations **لحد 014 فقط** (سطر 29–33) → **مش متأثر** بـ 016/017/018/019 ولا بتغييرات الواجهة.
- آخر run أخضر كامل = `b7d3ae7` بتاريخ 2026‑11‑16؛ المحاكاة فيها **تواريخ ثابتة** (history `2026-10-..`، tasks `2026-11-12`) وassertions كتير → الفشل **شبه مؤكد تابع للتاريخ** (today = 2026‑11‑18).
- **المطلوب:** شغّل `npm run simulate:office-day` محليًا، اقرأ أول `AssertionError`، وثبّت السيناريو المعتمد على `today()` (استخدم تواريخ نسبية بدل الثابتة، أو عدّل العتبة). **لا تُضعِّف فحصًا؛ اجعل التاريخ ديناميكيًا.**
- معيار القبول: `Check package` أخضر بالكامل على آخر commit.

---

## B) إكمال حالات dwg / SUB COM (باجة حقيقية غير مكتملة)

**B1 — التقارير لا تعرف الحالات الجديدة.** `public/engineering/report.js` فيه خرائط `STATUS` (سطر ~6)، `ICON` (~10)، `CLS` (~364)، وترتيب `SORD`/`TORD` — كلها تعرف REQ/READY/SUB/COM/OK/N/A/HOLD/DONE **بدون `dwg` و`SUB COM`**. تقرير المالك هيعرضهم غير مترجمين/بدون لون/ترتيب غلط.
- أضف للخمس خرائط: `dwg` (ar: «جارٍ العمل على المخططات»، en: «Drafting»، أيقونة ✏️، class `s-work`) و`SUB COM` (ar: «إعادة تقديم الملاحظات»، en: «Resubmitted»، أيقونة 🔁، class `s-sub`).
- معيار القبول: تقرير مالك لمشروع فيه حالة dwg/SUB COM يطبع صح بالعربي والإنجليزي.

**B2 — اختبار end‑to‑end بعد تطبيق 019 على الإنتاج:** تأكد إن حفظ حالة dwg/SUB COM من الواجهة بينجح فعليًا (مش بيترفض من `save_v1`).

---

## C) إنزال حزمة الواجهة ونشرها (بعد الاختبار البصري)

**C1 — طبّق SQL 019 على الإنتاج.** `database/engineering/20261118_019_preserve_latest_submission.sql` على مشروع `kitsnfpgcrsxizzimgwx` فقط (**مش** CRM `hihjleshocaazanwyqdu`)، **بعد نسخة احتياطية قابلة للاستعادة**. الملف drift‑guarded (يوقف لو تعريف الدالة اختلف).

**C2 — اختبار بصري بعد الدخول** (الجزء اللي المراجعة التلقائية ما قدرتش تعمله). على **desktop + mobile** للهندسة والحسابات وCRM:
- القوائم القابلة للطي (accounting/CRM collapsible menu).
- النوافذ المتداخلة: focus trap، الإغلاق عبر المعالج الموجود، إعادة التركيز عند الإغلاق.
- الجداول وأحجام النصوص/أزرار الحالات.
- التنبيهات (كثافة تنبيه مجموعات WhatsApp في CRM).
- الطباعة (تقارير المالك على صفحات فعلية).

**C3 — ادمج باقي حزمة الواجهة في commit واندفعها** (الملفات غير المدمجة حاليًا):
`package.json` (يضيف `check-office-dialogs.mjs`) · `public/accounting/{app.js,index.html}` · `public/crm/{app.js,index.html}` · `public/engineering/index.html` · `public/engineering/tools-ui.css` · `src/accounting.jsx` · `src/crm.jsx` · `public/engineering/mobile-tools.js` · `public/office-dialogs.js` · `public/office-responsive.{css,js}` · `scripts/check-office-dialogs.mjs`.
بعد `git add`، شغّل `node scripts/update-manifest.mjs` ثم `git add FILE-MANIFEST.sha256`. `npm run check` لازم يعدّي.

**C4 — بعد النشر:** تأكد Actions كلها خضراء قبل فتح الرابط، واختبر بحساب **مدير + مهندس** من **جلستين** ثم `reload` للتأكد من بقاء الحالة.

---

## D) متبقّي مراجعة الـ UI (أولوية متوسطة/منخفضة)

**D1 — مساعدة/توثيق مدمج** لمعاني المراحل والحالات (تلميحات سياقية أو صفحة شرح مختصرة). المفتاح + التلميحات + مدير الحالات بيغطّوا جزء؛ الباقي onboarding للمهندس الجديد.
(التقرير الكامل: `docs/ui-review-engineering-2026-11-17.md`.)

---

## E) وحدة الإشراف (feature ناقصة)

**E1 — «جدول الإشراف» حاليًا placeholder** («تفاصيل الإشراف سنحددها في الخطوة القادمة»). محتاج تصميم + تنفيذ متابعة إشراف حقيقية بعد صدور إجازة البناء (حالات، مسؤول، زيارات/تقارير).

---

## F) صيانة / بنية تحتية

**F1 — `backup.yml`:** النسخ الاحتياطي اليومي (cron) **متوقّف**. أضف 5 أسرار للمستودع ثم فعّل الـ cron:
`NITAQ_BACKUP_ACCOUNTING_URL` · `NITAQ_BACKUP_CRM_URL` · `NITAQ_BACKUP_ACCOUNTING_SERVICE_KEY` · `NITAQ_BACKUP_CRM_SERVICE_KEY` · `NITAQ_BACKUP_PASSPHRASE` (≥20 حرف).

**F2 — Node 20 deprecation** في Actions (`checkout@v4`/`setup-node@v4` بيتنفّذوا على Node 24 إجباريًا). بسيط؛ راقبه أو حدّث نسخ الـ actions.

**F3 — `version-check.js`:** شريط «نسخة جديدة» بيظهر فقط لما `?v=` لسكربت يتغيّر. تعديل CSS‑only داخل `index.html` من غير bump لأي سكربت **مش هيبلّغ** الجلسات المفتوحة → اعمل bump لسكربت (أو build‑hash) مع أي نشر CSS‑only.

---

## G) متابعة تشغيلية

**G1 — OMAR onboarding:** إعادة إرسال رابط استعادة Supabase لما يرجع من الإجازة (كان ~2026‑11‑15، عدّى) — تأكد إتعمل ولا لسه.

---

## تم إنجازه النهاردة (لا تعيده)
إصلاح رسائل الخطأ (السبب+الحل) · شريط «نسخة جديدة» للكاش · نظام الحالات (REQ·dwg·SUB·COM·SUB COM·OK·N/A) + مديرها (القوائم ← حالات المراحل) + المفتاح الديناميكي · شاشة الدخول (كارت بالهوية) · تباين WCAG AA · كروت الموبايل للهندسة · أكورديون المجموعات · اختصارات `/` و`؟` · **إصلاح `check:database`** (SQL 019 — فحص التصريح بأحدث تقديم بالتاريخ بدل آخر عنصر، ردّ patch migration 011 اللي ألغته 016–018).
