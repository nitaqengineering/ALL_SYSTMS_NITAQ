/* NITAQ Showcase — interactive 3D project viewer.
   Reads window.NITAQ_SHOWCASE (see data/sample-villa.js for the shape). */
(function () {
  'use strict';
  var D = window.NITAQ_SHOWCASE;
  var $ = function (id) { return document.getElementById(id); };
  if (!D || !window.THREE) {
    $('stage').innerHTML = '<div class="err">تعذّر تحميل العرض ثلاثي الأبعاد.</div>';
    return;
  }

  var STR = {
    ar: { k: 'عرض تفاعلي', sample: 'نموذج تجريبي', night: 'ليل', day: 'نهار', lang: 'EN',
      rotate: 'دوران', doll: 'مجسّم', plan: 'مسقط', walls: 'جدران كاملة', reset: 'إعادة',
      facts: 'بيانات المشروع', rooms: 'الفراغات', total: 'مجموع الفراغات',
      built: 'المساحة المبنية م²', plot: 'مساحة الأرض م²', beds: 'غرف نوم', baths: 'حمامات',
      floors: 'طوابق', ft: 'قدم²', m: 'م²', cta: 'تواصل مع نطاق',
      hint: 'اسحب للدوران · العجلة للتقريب · اضغط على فراغ للتركيز',
      foot: 'المجسّم للتوضيح فقط. المساحات والأبعاد المعتمدة هي الواردة في المخططات الموقّعة.' },
    en: { k: 'Interactive viewing', sample: 'Sample model', night: 'Night', day: 'Day', lang: 'ع',
      rotate: 'Rotate', doll: 'Dollhouse', plan: 'Floor plan', walls: 'Full walls', reset: 'Reset',
      facts: 'Project facts', rooms: 'Spaces', total: 'Spaces total',
      built: 'Built-up m²', plot: 'Plot m²', beds: 'Bedrooms', baths: 'Bathrooms',
      floors: 'Floors', ft: 'ft²', m: 'm²', cta: 'Contact NITAQ',
      hint: 'Drag to rotate · scroll to zoom · click a space to focus',
      foot: 'Model is illustrative. Approved areas and dimensions are those on the signed drawings.' }
  };
  var FLOOR = { living: 0xC8A57A, dining: 0xC8A57A, majlis: 0xB9905F, bedroom: 0xD2B48C,
    kitchen: 0xD9D6CF, wet: 0xBFC7CF, hall: 0xE3DED3, service: 0xCFCAC0, terrace: 0x9A8F80 };
  var CUT = 1.35, SQFT = 10.7639;

  // Open on the lowest level that has rooms (the ground floor, not a basement).
  var firstRooms = D.levels.findIndex(function (l) { return l.rooms.length; });
  var S = { lang: 'ar', night: false, level: Math.max(firstRooms, 0), full: false, auto: false, sel: null, hover: null };
  var T = function (k) { return STR[S.lang][k]; };
  var nm = function (o) { return S.lang === 'ar' ? (o.nameAr || o.name) : (o.name || o.nameAr); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  /* ---------- geometry helpers ---------- */
  function polyInfo(p) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < p.length; i++) {
      var q = p[(i + 1) % p.length], f = p[i][0] * q[1] - q[0] * p[i][1];
      a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f;
    }
    a /= 2;
    if (Math.abs(a) < 1e-6) return { area: 0, c: p[0] };
    return { area: Math.abs(a), c: [cx / (6 * a), cy / (6 * a)] };
  }
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = 0;
  function grow(poly) {
    poly.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
  }
  D.levels.forEach(function (L) {
    L.rooms.forEach(function (r) {
      var pi = polyInfo(r.poly);
      r._c = pi.c; if (r.area == null) r.area = pi.area;
      grow(r.poly);
    });
    (L.slabs || []).forEach(function (s) { grow(s.poly); });
    minZ = Math.min(minZ, L.elevation - 0.4);
  });
  (D.site || []).forEach(function (L) { minZ = Math.min(minZ, L.elevation - 0.4); });
  var CX = (minX + maxX) / 2, CY = (minY + maxY) / 2;
  var SIZE = Math.max(maxX - minX, maxY - minY);
  var P = function (x, y, h) { return new THREE.Vector3(x - CX, h || 0, -(y - CY)); };

  /* ---------- scene ---------- */
  var stage = $('stage'), canvas = $('cv');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);

  var hemi = new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 0.85); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1dc, 0.75);
  sun.position.set(SIZE * 0.6, SIZE * 1.3, SIZE * 0.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = sc.bottom = -SIZE * 1.6; sc.right = sc.top = SIZE * 1.6; sc.far = SIZE * 5;
  sun.shadow.bias = -0.0005; scene.add(sun);
  var lamps = new THREE.Group(); lamps.visible = false; scene.add(lamps);

  var ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 8, SIZE * 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = minZ; ground.receiveShadow = true; scene.add(ground);

  var mWall = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  var mCap = new THREE.MeshStandardMaterial({ color: 0x101725, roughness: 0.8 });
  var mGlass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.35, roughness: 0.1 });
  var wallMatsCut = [mWall, mWall, mCap, mWall, mWall, mWall];

  function box(g, x0, x1, y0, y1, t, mat, shadow) {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.castShadow = shadow; m.receiveShadow = shadow; g.add(m);
  }
  /* Wall heights come from each wall (w.base / w.h, relative to its level) when the
     data has them; cutAt clips them for the dollhouse view. Opening sills are
     relative to the level, so they are shifted by the wall's base offset. */
  function buildWalls(L, cutAt) {
    var grp = new THREE.Group(), mat = cutAt ? wallMatsCut : mWall;
    (L.walls || []).forEach(function (w) {
      var dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy);
      if (len < 0.01) return;
      var base = w.base || 0, top = w.h || L.height;
      if (cutAt) top = Math.min(top, cutAt - base);
      if (top < 0.01) return;
      var t = Math.max(w.t || 0.2, 0.03), g = new THREE.Group();
      g.position.copy(P(w.a[0], w.a[1], L.elevation + base)); g.rotation.y = Math.atan2(dy, dx);
      if (w.glass) {
        box(g, 0, len, 0, top, 0.05, mGlass, false);
        box(g, 0, len, Math.max(top - 0.06, 0), top, 0.08, mCap, false);
        grp.add(g); return;
      }
      var ops = (w.openings || []).slice().sort(function (a, b) { return a.at - b.at; }), cur = -t / 2;
      ops.forEach(function (o) {
        var l = Math.max(o.at - o.w / 2, 0), r = Math.min(o.at + o.w / 2, len);
        var sill = Math.max((o.type === 'window' ? (o.sill || 0) : 0) - base, 0);
        var head = sill + (o.h || 2.2);
        box(g, cur, l, 0, top, t, mat, true);
        box(g, l, r, 0, Math.min(sill, top), t, mat, true);
        box(g, l, r, head, top, t, mat, true);
        if (o.type === 'window') box(g, l, r, sill, Math.min(head, top), 0.04, mGlass, false);
        cur = r;
      });
      box(g, cur, len + t / 2, 0, top, t, mat, true);
      grp.add(g);
    });
    return grp;
  }

  function shape(poly) {
    var sh = new THREE.Shape();
    poly.forEach(function (p, i) { sh[i ? 'lineTo' : 'moveTo'](p[0] - CX, p[1] - CY); });
    return sh;
  }
  var mSlab = new THREE.MeshStandardMaterial({ color: 0xE6E2D9, roughness: 0.9 });
  var mPave = new THREE.MeshStandardMaterial({ color: 0xCFC9BD, roughness: 0.95 });
  function buildSlabs(L, grp, isSite) {
    (L.slabs || []).forEach(function (s) {
      var d = Math.max(s.d || 0.2, 0.05), drop = isSite ? 0.04 : 0; // site paving sits just under the house floors
      var m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(s.poly), { depth: d, bevelEnabled: false }), isSite ? mPave : mSlab);
      m.rotation.x = -Math.PI / 2; m.position.y = L.elevation + (s.top || 0) - d - drop;
      m.receiveShadow = true; m.castShadow = true; grp.add(m);
    });
  }

  var site = new THREE.Group(); scene.add(site);
  (D.site || []).forEach(function (L) { buildSlabs(L, site, true); site.add(buildWalls(L, 0)); });

  var floorMeshes = [], levelGroups = [];
  D.levels.forEach(function (L, li) {
    var G = new THREE.Group(); scene.add(G);
    var floors = new THREE.Group(); G.add(floors);
    buildSlabs(L, floors);
    var slabTop = (L.slabs || []).reduce(function (m, s) { return Math.max(m, s.top || 0); }, 0);
    L.rooms.forEach(function (r) {
      var geo = new THREE.ExtrudeGeometry(shape(r.poly), { depth: 0.2, bevelEnabled: false });
      var mat = new THREE.MeshStandardMaterial({ color: FLOOR[r.type] || 0xDDD8CC, roughness: 0.75, emissive: 0xC9A25D, emissiveIntensity: 0 });
      var m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = L.elevation + slabTop + 0.02 - 0.2; m.receiveShadow = true;
      m.userData = { room: r, level: li }; r._mesh = m; floors.add(m); floorMeshes.push(m);
      var lamp = new THREE.PointLight(0xffc98a, 0.9, Math.max(6, Math.sqrt(r.area) * 2.2), 2);
      lamp.position.copy(P(r._c[0], r._c[1], L.elevation + 2.2)); lamp.userData.level = li; lamps.add(lamp);
    });
    var fur = new THREE.Group(); G.add(fur);
    (L.furniture || []).forEach(function (f) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), new THREE.MeshStandardMaterial({ color: f.c || '#EEEDEA', roughness: 0.8 }));
      m.position.copy(P(f.x + f.w / 2, f.y + f.d / 2, L.elevation + f.h / 2));
      m.castShadow = true; m.receiveShadow = true; fur.add(m);
    });
    var cut = buildWalls(L, CUT), full = buildWalls(L, 0);
    G.add(cut); G.add(full);
    levelGroups.push({ G: G, cut: cut, full: full });
  });

  /* ---------- camera / orbit ---------- */
  var HOME = { th: -0.65, ph: 0.82, r: SIZE * 2.9 };
  var cam = { th: HOME.th, ph: HOME.ph, r: HOME.r, t: new THREE.Vector3() };
  var goal = { th: HOME.th, ph: HOME.ph, r: HOME.r, t: new THREE.Vector3() };
  function levelY() { return D.levels[S.level].elevation; }
  function home(ph) { goal.th = HOME.th; goal.ph = ph == null ? HOME.ph : ph; goal.r = HOME.r; goal.t.set(0, levelY(), 0); }
  var ptrs = {}, pinch = 0, moved = 0;
  canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = [e.clientX, e.clientY]; moved = 0; });
  canvas.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId];
    if (!p) { pick(e); return; }
    var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) goal.r = clampR(goal.r * pinch / d); pinch = d; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey || e.buttons === 2) {
      var k = cam.r * 0.0012, right = new THREE.Vector3(Math.cos(cam.th), 0, -Math.sin(cam.th)), fwd = new THREE.Vector3(Math.sin(cam.th), 0, Math.cos(cam.th));
      goal.t.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
    } else {
      goal.th -= dx * 0.006; goal.ph = Math.min(1.45, Math.max(0.02, goal.ph - dy * 0.005));
      S.auto = false; syncDock();
    }
  });
  function up(e) { delete ptrs[e.pointerId]; pinch = 0; if (moved < 5 && e.type === 'pointerup') { pick(e); select(S.hover, true); } }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', function () { setHover(null); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function clampR(r) { return Math.min(SIZE * 7, Math.max(SIZE * 0.5, r)); }
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); goal.r = clampR(goal.r * (e.deltaY > 0 ? 1.1 : 0.9)); }, { passive: false });

  /* ---------- picking / selection ---------- */
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    var b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hit = ray.intersectObjects(floorMeshes.filter(function (m) { return m.userData.level === S.level; }))[0];
    setHover(hit ? hit.object.userData.room : null);
  }
  function paint() {
    D.levels.forEach(function (L) {
      L.rooms.forEach(function (r) {
        var on = r === S.sel || r === S.hover;
        r._mesh.material.emissiveIntensity = r === S.sel ? 0.55 : r === S.hover ? 0.3 : 0;
        if (r._lbl) r._lbl.classList.toggle('on', on);
        if (r._li) r._li.classList.toggle('on', r === S.sel);
      });
    });
  }
  function setHover(r) { if (S.hover !== r) { S.hover = r; paint(); } }
  function select(r, focus) {
    S.sel = r === S.sel ? null : r; paint();
    if (!focus) return;
    if (S.sel) {
      goal.t.copy(P(S.sel._c[0], S.sel._c[1], levelY()));
      goal.r = clampR(Math.max(Math.sqrt(S.sel.area) * 4.5, SIZE * 0.9));
    } else home(goal.ph);
  }

  /* ---------- UI ---------- */
  function syncDock() {
    $('bRotate').classList.toggle('on', S.auto);
    $('bWalls').classList.toggle('on', S.full);
  }
  function applyLevel() {
    levelGroups.forEach(function (g, i) {
      g.G.visible = i <= S.level;
      var cut = i === S.level && !S.full;
      g.cut.visible = cut; g.full.visible = !cut;
    });
    lamps.children.forEach(function (l) { l.visible = l.userData.level === S.level; });
    site.visible = levelY() >= -0.5; // site paving would cover a basement
    goal.t.y = levelY();
  }
  function applyNight() {
    $('app').classList.toggle('night', S.night);
    hemi.intensity = S.night ? 0.16 : 0.85; sun.intensity = S.night ? 0.05 : 0.75;
    hemi.color.set(S.night ? 0x7f93c9 : 0xffffff); lamps.visible = S.night;
  }
  function renderUI() {
    document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
    var p = D.project, L = D.levels[S.level];
    $('hdMeta').textContent = p.ref || '';
    $('tK').textContent = T('k'); $('tName').textContent = nm(p);
    $('tLoc').textContent = S.lang === 'ar' ? (p.locationAr || p.location || '') : (p.location || '');
    $('tSample').hidden = !D.sample; $('tSample').textContent = T('sample');
    $('btnNight').textContent = S.night ? T('day') : T('night'); $('btnLang').textContent = T('lang');
    ['Rotate', 'Doll', 'Plan', 'Walls', 'Reset'].forEach(function (k) { $('b' + k).textContent = T(k.toLowerCase()); });
    $('hint').textContent = T('hint'); $('kFacts').textContent = T('facts'); $('kRooms').textContent = T('rooms');
    $('cta').textContent = T('cta'); $('foot').textContent = T('foot'); $('totalK').textContent = T('total');

    var all = [].concat.apply([], D.levels.map(function (l) { return l.rooms; }));
    // Room areas only add up to the built-up area when every space is a Revit room.
    var built = p.builtUp || (D.partialRooms ? 0 : all.reduce(function (s, r) { return s + r.area; }, 0));
    var facts = [];
    if (built) facts.push([fmt(built), T('built')]);
    if (p.plotArea) facts.push([fmt(p.plotArea), T('plot')]);
    facts.push([all.filter(function (r) { return r.type === 'bedroom'; }).length, T('beds')],
      [all.filter(function (r) { return r.type === 'wet'; }).length, T('baths')]);
    if (facts.length % 2) facts.push([p.floors || D.levels.length, T('floors')]);
    $('facts').innerHTML = facts.map(function (f) { return '<div class="fact"><b>' + f[0] + '</b><span>' + f[1] + '</span></div>'; }).join('');

    var lv = $('levels'); lv.innerHTML = ''; lv.hidden = D.levels.length < 2;
    D.levels.slice().reverse().forEach(function (l) {
      var i = D.levels.indexOf(l), b = document.createElement('button');
      b.className = 'btn' + (i === S.level ? ' on' : ''); b.textContent = nm(l);
      b.onclick = function () { S.level = i; S.sel = null; applyLevel(); renderUI(); paint(); };
      lv.appendChild(b);
    });

    var ul = $('rooms'), lb = $('labels'); ul.innerHTML = ''; lb.innerHTML = '';
    D.levels.forEach(function (l) { l.rooms.forEach(function (r) { r._lbl = r._li = null; }); });
    var sum = 0;
    L.rooms.forEach(function (r) {
      sum += r.area;
      var li = document.createElement('li'), a = document.createElement('b'), s = document.createElement('span');
      a.style.fontWeight = 400; a.textContent = nm(r); s.textContent = r.area.toFixed(1) + ' ' + T('m');
      li.appendChild(a); li.appendChild(s);
      li.onclick = function () { select(r, true); };
      li.onmouseenter = function () { setHover(r); }; li.onmouseleave = function () { setHover(null); };
      ul.appendChild(li); r._li = li;
      var d = document.createElement('div'), sm = document.createElement('small');
      d.className = 'lbl'; d.textContent = nm(r); sm.textContent = r.area.toFixed(1) + ' ' + T('m'); d.appendChild(sm);
      lb.appendChild(d); r._lbl = d;
    });
    $('totalV').textContent = fmt(sum) + ' ' + T('m') + ' · ' + fmt(sum * SQFT) + ' ' + T('ft');
    $('totalK').parentNode.hidden = !L.rooms.length;
    syncDock(); paint();
  }
  function mode(plan) {
    $('bDoll').classList.toggle('on', !plan); $('bPlan').classList.toggle('on', plan);
    S.auto = false; S.sel = null; home(plan ? 0.02 : HOME.ph); if (plan) goal.th = 0; syncDock(); paint();
  }
  $('bDoll').onclick = function () { mode(false); };
  $('bPlan').onclick = function () { mode(true); };
  $('bReset').onclick = function () { S.full = false; applyLevel(); mode(false); };
  $('bRotate').onclick = function () { S.auto = !S.auto; syncDock(); };
  $('bWalls').onclick = function () { S.full = !S.full; applyLevel(); syncDock(); };
  $('btnNight').onclick = function () { S.night = !S.night; applyNight(); renderUI(); };
  $('btnLang').onclick = function () { S.lang = S.lang === 'ar' ? 'en' : 'ar'; renderUI(); };

  /* ---------- loop ---------- */
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    var fit = SIZE * 2.9 * Math.max(1, 1.15 / camera.aspect);
    if (Math.abs(goal.r - HOME.r) < 0.01) goal.r = fit;
    HOME.r = fit;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
  var v = new THREE.Vector3();
  function frame() {
    if (S.auto) goal.th += 0.0035;
    var k = 0.12;
    cam.th += (goal.th - cam.th) * k; cam.ph += (goal.ph - cam.ph) * k; cam.r += (goal.r - cam.r) * k; cam.t.lerp(goal.t, k);
    var sp = Math.sin(cam.ph);
    camera.position.set(cam.t.x + cam.r * sp * Math.sin(cam.th), cam.t.y + cam.r * Math.cos(cam.ph), cam.t.z + cam.r * sp * Math.cos(cam.th));
    camera.lookAt(cam.t);
    renderer.render(scene, camera);
    var w = stage.clientWidth, h = stage.clientHeight, L = D.levels[S.level];
    L.rooms.forEach(function (r) {
      if (!r._lbl) return;
      v.copy(P(r._c[0], r._c[1], L.elevation + 0.1)).project(camera);
      var ok = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      // Small rooms (baths, stores) only label on hover/selection so names don't pile up.
      var show = r.area >= 7 || r === S.sel || r === S.hover;
      r._lbl.style.opacity = ok && show ? 1 : 0;
      r._lbl.style.left = ((v.x + 1) / 2 * w) + 'px'; r._lbl.style.top = ((1 - v.y) / 2 * h) + 'px';
    });
    requestAnimationFrame(frame);
  }
  home(); cam.t.copy(goal.t);
  applyLevel(); applyNight(); renderUI(); resize(); frame();
})();
