/* Stale-version detector.
 *
 * The portal ships as plain <script src="x.js?v=TAG"> files and GitHub Pages
 * caches index.html for a while, so a user can keep running an old build after
 * a deploy — which is how mismatched cached files produce "… is not defined".
 *
 * This watcher reads the ?v= tags the page ACTUALLY loaded (from its own DOM,
 * so the baseline is the running build, even when that came from cache), then
 * periodically fetches the live index.html and compares. If the server now
 * serves different script URLs, stylesheet URLs or inline head styles, we offer a
 * one-click refresh. Versioned external assets still require a ?v= bump when
 * their content changes; inline head CSS is compared directly.
 */
(function () {
  function versionsFrom(doc) {
    // Compare the asset identity as well as its token. Stylesheet-only and inline
    // head-style deployments must notify open sessions too. Ignore runtime UI styles.
    const scripts=[...doc.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')).filter(src=>/\.js\?v=/.test(src)).sort();
    const links=[...doc.querySelectorAll('head link[rel="stylesheet"][href]')].map(s=>s.getAttribute('href')).sort();
    const styles=[...doc.querySelectorAll('head style:not([data-nitaq-runtime])')].map(s=>s.textContent);
    return JSON.stringify({scripts,links,styles});
  }

  const running = versionsFrom(document);
  let notified = false;

  function showUpdateBar() {
    if (notified || document.getElementById('nitaq-update-bar')) return;
    notified = true;

    const style = document.createElement('style');
    style.setAttribute('data-nitaq-runtime','');
    style.textContent =
      '#nitaq-update-bar{position:fixed;inset-inline:0;bottom:0;z-index:9999;display:flex;' +
      'align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;' +
      'padding:11px 16px;background:#101725;color:#fff;font-size:13.5px;line-height:1.5;' +
      'box-shadow:0 -2px 14px rgba(16,23,37,.22);transform:translateY(100%);' +
      'transition:transform .28s ease}' +
      '#nitaq-update-bar.in{transform:translateY(0)}' +
      '#nitaq-update-bar .msg{font-weight:600}' +
      '#nitaq-update-bar .sub{color:#c9d2dd;font-weight:400}' +
      '#nitaq-update-bar button{font:inherit;cursor:pointer;border-radius:7px;padding:7px 15px;border:0}' +
      '#nitaq-update-bar .go{background:#C9A25D;color:#101725;font-weight:700}' +
      '#nitaq-update-bar .go:hover{background:#d8b26e}' +
      '#nitaq-update-bar .later{background:transparent;color:#c9d2dd;border:1px solid rgba(255,255,255,.28)}' +
      '#nitaq-update-bar .later:hover{color:#fff;border-color:rgba(255,255,255,.5)}' +
      '@media (prefers-reduced-motion:reduce){#nitaq-update-bar{transition:none}}';
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'nitaq-update-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML =
      '<span><span class="msg">صدرت نسخة جديدة من البرنامج.</span> ' +
      '<span class="sub">حدّث الصفحة لتفادي مشاكل العرض وتشتغل على آخر إصدار.</span></span>' +
      '<span style="display:flex;gap:8px">' +
      '<button type="button" class="go">تحديث الآن</button>' +
      '<button type="button" class="later">لاحقًا</button></span>';
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('in'));

    bar.querySelector('.go').addEventListener('click', () => location.reload());
    bar.querySelector('.later').addEventListener('click', () => {
      bar.classList.remove('in');
      setTimeout(() => bar.remove(), 300);
    });
  }

  async function check() {
    if (notified || document.hidden) return;
    try {
      const res = await fetch('index.html?__freshness=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const latest = versionsFrom(new DOMParser().parseFromString(await res.text(),'text/html'));
      if (latest && latest !== running) showUpdateBar();
    } catch (_) { /* offline or blocked — try again later */ }
  }

  // First check a little after load, then every 5 minutes, and whenever the tab
  // is brought back to the foreground (the moment a user is most likely stale).
  setTimeout(check, 45000);
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
