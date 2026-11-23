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
      rotate: 'دوران', walk: 'تجوّل', doll: 'مجسّم', plan: 'مسقط', walls: 'جدران كاملة', reset: 'إعادة', furn: 'الفرش',
      loading: 'جاري تحميل المجسّم…',
      facts: 'بيانات المشروع', rooms: 'الفراغات', total: 'مجموع الفراغات',
      built: 'المساحة المبنية م²', plot: 'مساحة الأرض م²', beds: 'غرف نوم', baths: 'حمامات',
      floors: 'طوابق', ft: 'قدم²', m: 'م²', cta: 'تواصل مع نطاق',
      hint: 'اسحب للدوران · العجلة للتقريب · اضغط على فراغ للتركيز',
      walkHint: 'اسحب للنظر حولك · اضغط على الأرض للانتقال · W A S D أو عصا التحكم للمشي', inRoom: 'أنت في',
      foot: 'المجسّم للتوضيح فقط. المساحات والأبعاد المعتمدة هي الواردة في المخططات الموقّعة.' },
    en: { k: 'Interactive viewing', sample: 'Sample model', night: 'Night', day: 'Day', lang: 'ع',
      rotate: 'Rotate', walk: 'Walk', doll: 'Dollhouse', plan: 'Floor plan', walls: 'Full walls', reset: 'Reset', furn: 'Furniture',
      loading: 'Loading model…',
      facts: 'Project facts', rooms: 'Spaces', total: 'Spaces total',
      built: 'Built-up m²', plot: 'Plot m²', beds: 'Bedrooms', baths: 'Bathrooms',
      floors: 'Floors', ft: 'ft²', m: 'm²', cta: 'Contact NITAQ',
      hint: 'Drag to rotate · scroll to zoom · click a space to focus',
      walkHint: 'Drag to look around · tap the floor to move there · W A S D or the joystick to walk', inRoom: 'You are in',
      foot: 'Model is illustrative. Approved areas and dimensions are those on the signed drawings.' }
  };
  var FLOOR = { living: 0xC8A57A, dining: 0xC8A57A, majlis: 0xB9905F, bedroom: 0xD2B48C,
    kitchen: 0xD9D6CF, wet: 0xBFC7CF, hall: 0xE3DED3, service: 0xCFCAC0, terrace: 0x9A8F80 };
  var CUT = 1.35, SQFT = 10.7639;

  // Open on the lowest level that has rooms (the ground floor, not a basement).
  var firstRooms = D.levels.findIndex(function (l) { return l.rooms.length; });
  var S = { lang: 'ar', night: false, level: Math.max(firstRooms, 0), full: false, furn: true, walk: false, auto: false, sel: null, hover: null };
  var MESH = D.mesh; // real Revit geometry (see tools/revit/showcase_export_mesh.py)
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
  // Section plane: everything above it is cut away, like a Revit plan cut / section box top.
  renderer.localClippingEnabled = true;
  var cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  var meshGroups = {}, noteLbls = [], edgeQueue = []; // 'arch' and 'furn' groups once the Revit geometry has loaded
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
  if (!MESH) (D.site || []).forEach(function (L) { buildSlabs(L, site, true); site.add(buildWalls(L, 0)); });

  var floorMeshes = [], levelGroups = [];
  D.levels.forEach(function (L, li) {
    var G = new THREE.Group(); scene.add(G);
    var floors = new THREE.Group(); G.add(floors);
    if (!MESH) buildSlabs(L, floors);
    // The level's floor is its largest slab; smaller ones (planters, podiums, landings) can sit higher.
    var main = (L.slabs || []).reduce(function (m, s) { var a = polyInfo(s.poly).area; return a > m.a ? { a: a, top: s.top || 0 } : m; }, { a: 0, top: 0 });
    var slabTop = main.top;
    L.rooms.forEach(function (r) {
      var geo = new THREE.ExtrudeGeometry(shape(r.poly), { depth: 0.2, bevelEnabled: false });
      // With real geometry the room floor is only a highlight overlay (hover / selection).
      var mat = MESH
        ? new THREE.MeshBasicMaterial({ color: 0xC9A25D, transparent: true, opacity: 0, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: FLOOR[r.type] || 0xDDD8CC, roughness: 0.75, emissive: 0xC9A25D, emissiveIntensity: 0 });
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
    var cut = MESH ? new THREE.Group() : buildWalls(L, CUT), full = MESH ? new THREE.Group() : buildWalls(L, 0);
    L._slabTop = slabTop;
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
    if (!p) { if (!S.walk) pick(e); return; }
    var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && !S.walk) goal.r = clampR(goal.r * pinch / d); pinch = d; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (S.walk) { W.yaw -= dx * 0.004; W.pitch = Math.max(-1.2, Math.min(1.2, W.pitch - dy * 0.004)); return; }
    if (e.shiftKey || e.buttons === 2) {
      var k = cam.r * 0.0012, right = new THREE.Vector3(Math.cos(cam.th), 0, -Math.sin(cam.th)), fwd = new THREE.Vector3(Math.sin(cam.th), 0, Math.cos(cam.th));
      goal.t.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
    } else {
      goal.th -= dx * 0.006; goal.ph = Math.min(1.45, Math.max(0.02, goal.ph - dy * 0.005));
      S.auto = false; syncDock();
    }
  });
  function up(e) {
    delete ptrs[e.pointerId]; pinch = 0;
    if (moved >= 5 || e.type !== 'pointerup') return;
    if (S.walk) { walkTo(e); return; }
    pick(e); select(S.hover, true);
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', function () { setHover(null); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function clampR(r) { return Math.min(SIZE * 7, Math.max(SIZE * 0.5, r)); }
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); if (S.walk) return; goal.r = clampR(goal.r * (e.deltaY > 0 ? 1.1 : 0.9)); }, { passive: false });

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
        if (MESH) r._mesh.material.opacity = r === S.sel ? 0.45 : r === S.hover ? 0.25 : 0;
        else r._mesh.material.emissiveIntensity = r === S.sel ? 0.55 : r === S.hover ? 0.3 : 0;
        if (r._lbl) r._lbl.classList.toggle('on', on);
        if (r._li) r._li.classList.toggle('on', r === S.sel);
      });
    });
  }
  function setHover(r) { if (S.hover !== r) { S.hover = r; paint(); } }
  function select(r, focus) {
    S.sel = r === S.sel ? null : r; paint();
    if (!focus) return;
    if (S.walk) { if (S.sel) { placeWalker(P(S.sel._c[0], S.sel._c[1]).x, P(S.sel._c[0], S.sel._c[1]).z); } return; }
    if (S.sel) {
      goal.t.copy(P(S.sel._c[0], S.sel._c[1], levelY()));
      goal.r = clampR(Math.max(Math.sqrt(S.sel.area) * 4.5, SIZE * 0.9));
    } else home(goal.ph);
  }

  /* ---------- UI ---------- */
  function syncDock() {
    $('bRotate').classList.toggle('on', S.auto);
    $('bWalls').classList.toggle('on', S.full);
    $('bWalk').classList.toggle('on', S.walk);
    $('app').classList.toggle('walking', S.walk);
    $('hint').textContent = S.walk ? T('walkHint') : T('hint');
    $('bFurn').classList.toggle('on', S.furn); $('bFurn').hidden = !MESH;
  }
  function applyLevel() {
    levelGroups.forEach(function (g, i) {
      g.G.visible = S.walk || i <= S.level;
      var cut = i === S.level && !S.full && !S.walk;
      g.cut.visible = cut; g.full.visible = !cut;
    });
    lamps.children.forEach(function (l) { l.visible = l.userData.level === S.level; });
    site.visible = levelY() >= -0.5; // site paving would cover a basement
    // Cut at plan height on the current level; "full walls" cuts just under the next floor slab.
    var L = D.levels[S.level], next = D.levels[S.level + 1];
    cutPlane.constant = S.walk ? 1e6 : S.full ? (next ? next.elevation - 0.45 : 1e6) : L.elevation + (L._slabTop || 0) + CUT;
    if (meshGroups.furn) meshGroups.furn.visible = S.furn;
    goal.t.y = levelY();
  }
  function applyNight() {
    $('app').classList.toggle('night', S.night);
    hemi.intensity = S.night ? 0.16 : (MESH ? 0.6 : 0.85); sun.intensity = S.night ? 0.05 : (MESH ? 0.9 : 0.75);
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
    ['Rotate', 'Walk', 'Doll', 'Plan', 'Walls', 'Furn', 'Reset'].forEach(function (k) { $('b' + k).textContent = T(k.toLowerCase()); });
    $('kFacts').textContent = T('facts'); $('kRooms').textContent = T('rooms');
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
      b.onclick = function () { S.level = i; S.sel = null; applyLevel(); renderUI(); paint(); if (S.walk) placeWalker(W.pos.x, W.pos.z); };
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
    // Plan text notes (spaces with no Revit room): name-only labels, not clickable.
    noteLbls = (L.notes || []).map(function (n) {
      var d = document.createElement('div');
      d.className = 'lbl note'; d.textContent = nm(n); lb.appendChild(d);
      return { el: d, x: n.x, y: n.y };
    });
    syncDock(); paint();
  }
  function mode(plan) {
    if (S.walk) setWalk(false);
    $('bDoll').classList.toggle('on', !plan); $('bPlan').classList.toggle('on', plan);
    S.auto = false; S.sel = null; home(plan ? 0.02 : HOME.ph); if (plan) goal.th = 0; syncDock(); paint();
  }
  $('bDoll').onclick = function () { mode(false); };
  $('bPlan').onclick = function () { mode(true); };
  $('bReset').onclick = function () { S.full = false; applyLevel(); mode(false); };
  $('bRotate').onclick = function () { if (S.walk) setWalk(false); S.auto = !S.auto; syncDock(); };
  $('bWalk').onclick = function () { if (S.walk) mode(false); else setWalk(true); };
  $('bWalls').onclick = function () { S.full = !S.full; applyLevel(); syncDock(); };
  $('bFurn').onclick = function () { S.furn = !S.furn; applyLevel(); syncDock(); };
  $('btnNight').onclick = function () { S.night = !S.night; applyNight(); renderUI(); };
  $('btnLang').onclick = function () { S.lang = S.lang === 'ar' ? 'en' : 'ar'; renderUI(); };

  /* ---------- walk mode ----------
     First-person view at eye height. Drag to look, tap the floor to move there,
     WASD/arrows or the on-screen joystick to walk. Walls block; door leaves and glass
     (surfaces thinner than 8 cm) do not, so the walker passes through closed doors.
     The floor or stair tread under the walker sets its height, so stairs can be climbed. */
  var EYE = 1.6, CHEST = 1.2, RADIUS = 0.3, SPEED = 1.5, MAX_STEP = 0.35;
  var W = { pos: new THREE.Vector3(), eye: new THREE.Vector3(), target: null, yaw: 0, pitch: 0.05, floor: 0, keys: {}, joy: [0, 0] };
  var hit = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3(), org = new THREE.Vector3();
  var solids = [], backs = [];
  function colliders() {
    solids = []; backs = [];
    // Real geometry: the arch group (furniture does not block). Sample model: walls and floors.
    var roots = MESH ? [meshGroups.arch] : levelGroups.map(function (g) { return g.full; }).concat(levelGroups.map(function (g) { return g.G.children[0]; }));
    roots.forEach(function (r) {
      if (r) r.traverse(function (o) {
        if (!o.isMesh) return;
        if (o.material.side === THREE.BackSide) backs.push(o); else solids.push(o);
      });
    });
  }
  function isGlass(o) { return o.material.transparent; }
  // Distance to the first blocking surface along dir from p, or Infinity.
  function blockedAt(p, dir, far) {
    hit.set(p, dir); hit.near = 0; hit.far = far;
    var front = hit.intersectObjects(solids, false);
    for (var i = 0; i < front.length; i++) {
      var f = front[i];
      if (isGlass(f.object)) continue;
      if (backs.length) { // the navy back-face copies tell us where this surface ends
        hit.far = f.distance + 0.5;
        var back = hit.intersectObjects(backs, false).filter(function (b) { return b.distance > f.distance + 0.001; })[0];
        hit.far = far;
        if (back && back.distance - f.distance < 0.08) continue; // a door leaf or thin panel: pass through
      }
      return f.distance;
    }
    return Infinity;
  }
  // Height of the walkable surface under (x, z), searching down from `from`; null if none.
  function floorAt(x, z, from) {
    hit.set(org.set(x, from, z), down); hit.near = 0; hit.far = 6;
    var f = hit.intersectObjects(solids, false).filter(function (h) { return !isGlass(h.object) && h.face && h.face.normal.y > 0; })[0];
    return f ? f.point.y : null;
  }
  function levelFloor() { var L = D.levels[S.level]; return L.elevation + (L._slabTop || 0); }
  // Inside a wall or column: looking out, a back face (the navy copy) comes before any front face.
  var AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(function (d) { return new THREE.Vector3(d[0], 0, d[1]); });
  function insideSolid(x, y, z) {
    if (!backs.length) return false;
    var n = 0;
    AXES.forEach(function (d) {
      hit.set(org.set(x, y, z), d); hit.near = 0; hit.far = 3;
      var b = hit.intersectObjects(backs, false)[0], f = hit.intersectObjects(solids, false)[0];
      if (b && (!f || b.distance < f.distance)) n++;
    });
    return n >= 3;
  }
  function placeWalker(x, z) {
    var base = levelFloor();
    // Try the spot itself, then rings around it, so a jump never lands inside a wall.
    for (var r = 0; r <= 2.4; r += 0.3) {
      for (var a = 0; a < (r ? 12 : 1); a++) {
        var px = x + r * Math.cos(a * Math.PI / 6), pz = z + r * Math.sin(a * Math.PI / 6);
        var f = floorAt(px, pz, base + 0.6), fl = f != null && base - f < 1.2 ? f : base; // land on the floor, not on a ledge
        if (!insideSolid(px, fl + CHEST, pz)) {
          W.floor = fl; W.pos.set(px, fl, pz); W.target = null; W.eye.set(px, fl + EYE, pz);
          return true;
        }
      }
    }
    return false; // nowhere free nearby: stay where we are
  }
  function startPoint() {
    var L = D.levels[S.level];
    if (S.sel) return P(S.sel._c[0], S.sel._c[1]);
    var n = (L.notes || [])[0];
    if (n) return P(n.x, n.y);
    var big = L.rooms.slice().sort(function (a, b) { return b.area - a.area; })[0];
    return big ? P(big._c[0], big._c[1]) : new THREE.Vector3();
  }
  function setWalk(on) {
    if (on && MESH && !meshGroups.arch) return; // geometry still loading
    S.walk = on; S.auto = false; lastRoom = null;
    camera.fov = on ? 70 : 32; camera.near = on ? 0.05 : 0.1; camera.updateProjectionMatrix();
    applyLevel();
    if (on) {
      $('bDoll').classList.remove('on'); $('bPlan').classList.remove('on');
      colliders();
      var p = startPoint(); placeWalker(p.x, p.z);
      W.yaw = -cam.th; W.pitch = 0.05; W.keys = {};
    }
    syncDock();
  }
  function walkTo(e) {
    var b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    hit.setFromCamera(ndc, camera); hit.near = 0; hit.far = 60;
    var f = hit.intersectObjects(solids, false).filter(function (h) { return !isGlass(h.object); })[0];
    if (!f || !f.face) return;
    if (f.face.normal.y > 0.6 && f.point.y < W.floor + 1.2) W.target = f.point.clone();
    else { // tapped a wall: walk up to just in front of it
      tmp.copy(f.point).sub(W.pos); tmp.y = 0;
      var d = tmp.length(); if (d < 0.6) return;
      W.target = W.pos.clone().addScaledVector(tmp.normalize(), d - 0.5);
    }
  }
  var move = new THREE.Vector3(), dir = new THREE.Vector3();
  function stepWalk(dt) {
    var fwd = (W.keys.w || W.keys.arrowup ? 1 : 0) - (W.keys.s || W.keys.arrowdown ? 1 : 0) + W.joy[1];
    var side = (W.keys.d ? 1 : 0) - (W.keys.a ? 1 : 0) + W.joy[0];
    W.yaw += ((W.keys.arrowright ? 1 : 0) - (W.keys.arrowleft ? 1 : 0)) * dt * 1.6;
    move.set(0, 0, 0);
    if (fwd || side) {
      W.target = null;
      var sy = Math.sin(W.yaw), cy = Math.cos(W.yaw);
      move.set(sy * fwd + cy * side, 0, -cy * fwd + sy * side);
      if (move.length() > 1) move.normalize();
      move.multiplyScalar(SPEED * (W.keys.shift ? 2 : 1) * dt);
    } else if (W.target) {
      move.copy(W.target).sub(W.pos); move.y = 0;
      var d = move.length();
      if (d < 0.05) W.target = null;
      else move.multiplyScalar(Math.min(1, SPEED * 1.6 * dt / d));
    }
    var len = move.length();
    if (len > 1e-5) {
      dir.copy(move).divideScalar(len);
      var wall = blockedAt(org.set(W.pos.x, W.floor + CHEST, W.pos.z), dir, len + RADIUS);
      if (wall < len + RADIUS) { len = Math.max(0, wall - RADIUS); W.target = null; }
      var nx = W.pos.x + dir.x * len, nz = W.pos.z + dir.z * len;
      var f = floorAt(nx, nz, W.floor + MAX_STEP + 0.05);
      if (f == null || f - W.floor <= MAX_STEP) { // no step too high; a drop or a gap is fine
        W.pos.x = nx; W.pos.z = nz;
        if (f != null && W.floor - f < 1.5) W.floor = f;
      } else W.target = null;
    }
    W.pos.y = W.floor;
    W.eye.lerp(tmp.set(W.pos.x, W.floor + EYE, W.pos.z), Math.min(1, dt * 12));
    showRoom(); drawMap();
  }

  /* Mini-map: the level's slab outlines and rooms, north up, with the walker and its view.
     Tapping it moves the walker there. */
  var map = $('map'), mctx = map.getContext('2d'), mapFit = null, mapLevel = -1;
  function fitMap() {
    var L = D.levels[S.level], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (L.slabs || []).concat(L.rooms).forEach(function (o) {
      o.poly.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    });
    if (!isFinite(x0)) { x0 = minX; x1 = maxX; y0 = minY; y1 = maxY; }
    var size = map.clientWidth || 170, dpr = Math.min(window.devicePixelRatio || 1, 2), pad = 10;
    map.width = map.height = size * dpr;
    var k = (size - pad * 2) / Math.max(x1 - x0, y1 - y0, 1);
    mapFit = { k: k * dpr, ox: (size - (x1 - x0) * k) / 2 * dpr, oy: (size - (y1 - y0) * k) / 2 * dpr, x0: x0, y1: y1, dpr: dpr };
    mapLevel = S.level;
  }
  function toMap(x, y) { return [mapFit.ox + (x - mapFit.x0) * mapFit.k, mapFit.oy + (mapFit.y1 - y) * mapFit.k]; }
  function fromMap(px, py) { return [(px * mapFit.dpr - mapFit.ox) / mapFit.k + mapFit.x0, mapFit.y1 - (py * mapFit.dpr - mapFit.oy) / mapFit.k]; }
  function drawMap() {
    if (mapLevel !== S.level || !mapFit) fitMap();
    var L = D.levels[S.level], c = mctx;
    c.clearRect(0, 0, map.width, map.height);
    function path(poly) { c.beginPath(); poly.forEach(function (q, i) { var m = toMap(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](m[0], m[1]); }); c.closePath(); }
    c.lineWidth = mapFit.dpr;
    (L.slabs || []).forEach(function (sl) { path(sl.poly); c.fillStyle = 'rgba(238,237,234,.92)'; c.fill(); c.strokeStyle = '#6E7787'; c.stroke(); });
    L.rooms.forEach(function (r) { path(r.poly); c.strokeStyle = 'rgba(110,119,135,.7)'; c.stroke(); });
    var me = toMap(W.pos.x + CX, -W.pos.z + CY), a = Math.atan2(Math.cos(W.yaw), Math.sin(W.yaw)), r = 26 * mapFit.dpr;
    c.beginPath(); c.moveTo(me[0], me[1]); c.arc(me[0], me[1], r, -a - 0.6, -a + 0.6); c.closePath();
    c.fillStyle = 'rgba(201,162,93,.35)'; c.fill();
    c.beginPath(); c.arc(me[0], me[1], 4.5 * mapFit.dpr, 0, Math.PI * 2); c.fillStyle = '#C9A25D'; c.fill();
    c.strokeStyle = '#101725'; c.lineWidth = 1.5 * mapFit.dpr; c.stroke();
  }
  map.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    if (!mapFit) return;
    var b = map.getBoundingClientRect(), q = fromMap(e.clientX - b.left, e.clientY - b.top);
    var w = P(q[0], q[1]); placeWalker(w.x, w.z);
  });
  // Name of the space under the walker: a Revit room, else the nearest plan note within 4 m.
  var lastRoom = null;
  function showRoom() {
    var L = D.levels[S.level], x = W.pos.x + CX, y = -W.pos.z + CY, name = '';
    var r = L.rooms.filter(function (r) { return inPoly(x, y, r.poly); })[0];
    if (r) name = nm(r);
    else {
      var best = 16;
      (L.notes || []).forEach(function (n) { var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y); if (d < best) { best = d; name = nm(n); } });
    }
    if (name === lastRoom) return;
    lastRoom = name;
    $('here').hidden = !name; $('here').textContent = T('inRoom') + ': ' + name;
  }
  function inPoly(x, y, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++)
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    return c;
  }
  if (/[?&]debug(&|$)/.test(location.search)) window.__walk = { W: W, blockedAt: blockedAt, floorAt: floorAt, solids: function () { return solids; } };
  window.addEventListener('keydown', function (e) {
    if (!S.walk || /input|textarea/i.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { mode(false); return; }
    W.keys[k] = true; W.keys.shift = e.shiftKey;
    if (/^arrow/.test(k)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { W.keys[e.key.toLowerCase()] = false; W.keys.shift = e.shiftKey; });
  window.addEventListener('blur', function () { W.keys = {}; });
  // On-screen joystick (touch or mouse).
  (function () {
    var pad = $('joy'), knob = pad.firstElementChild, id = null;
    function set(e) {
      var b = pad.getBoundingClientRect(), r = b.width / 2;
      var x = (e.clientX - b.left - r) / r, y = (e.clientY - b.top - r) / r, d = Math.hypot(x, y);
      if (d > 1) { x /= d; y /= d; }
      W.joy = [x, -y];
      knob.style.transform = 'translate(' + (x * r * 0.55) + 'px,' + (y * r * 0.55) + 'px)';
    }
    pad.addEventListener('pointerdown', function (e) { id = e.pointerId; try { pad.setPointerCapture(id); } catch (err) { /* synthetic or ended pointer */ } set(e); e.stopPropagation(); });
    pad.addEventListener('pointermove', function (e) { if (e.pointerId === id) set(e); });
    function end(e) { if (e.pointerId !== id) return; id = null; W.joy = [0, 0]; knob.style.transform = ''; }
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  })();

  /* ---------- loop ---------- */
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    var fit = SIZE * 2.4 * Math.max(1, 1.15 / camera.aspect);
    if (Math.abs(goal.r - HOME.r) < 0.01) goal.r = fit;
    HOME.r = fit;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
  var v = new THREE.Vector3();
  var clock = new THREE.Clock();
  function frame() {
    var dt = Math.min(clock.getDelta(), 0.1);
    if (S.walk) {
      stepWalk(dt);
      camera.position.copy(W.eye);
      camera.rotation.set(-W.pitch, -W.yaw, 0, 'YXZ');
    } else {
      if (S.auto) goal.th += 0.0035;
      var k = 0.12;
      cam.th += (goal.th - cam.th) * k; cam.ph += (goal.ph - cam.ph) * k; cam.r += (goal.r - cam.r) * k; cam.t.lerp(goal.t, k);
      var sp = Math.sin(cam.ph);
      camera.position.set(cam.t.x + cam.r * sp * Math.sin(cam.th), cam.t.y + cam.r * Math.cos(cam.ph), cam.t.z + cam.r * sp * Math.cos(cam.th));
      camera.lookAt(cam.t);
    }
    renderer.render(scene, camera);
    $('labels').style.visibility = S.walk ? 'hidden' : '';
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
    noteLbls.forEach(function (n) {
      v.copy(P(n.x, n.y, L.elevation + (L._slabTop || 0) + 0.1)).project(camera);
      var ok = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      n.el.style.opacity = ok ? 1 : 0;
      n.el.style.left = ((v.x + 1) / 2 * w) + 'px'; n.el.style.top = ((1 - v.y) / 2 * h) + 'px';
    });
    requestAnimationFrame(frame);
  }
  /* ---------- real Revit geometry ---------- */
  // Each bucket is one material colour: Int16 positions (quantised, see showcase_build.mjs)
  // and Uint16/Uint32 triangle indices. Opaque buckets get a navy back-face pass, so walls
  // cut by the section plane read as solid navy poché instead of hollow shells.
  function loadMesh() {
    var note = $('loading'); note.hidden = false; note.textContent = T('loading');
    fetch(MESH.file).then(function (r) {
      if (!r.ok) throw new Error(r.status); return r.arrayBuffer();
    }).then(function (buf) {
      var root = new THREE.Group(), s = MESH.step / 1000, o = MESH.origin;
      root.scale.set(s, s, s); root.position.set(o[0] / 1000 - CX, o[1] / 1000, o[2] / 1000 + CY);
      var cap = new THREE.MeshBasicMaterial({ color: 0x101725, side: THREE.BackSide, clippingPlanes: [cutPlane] });
      MESH.buckets.forEach(function (b) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Int16Array(buf, b.pos, b.verts * 3), 3));
        g.setIndex(new THREE.BufferAttribute(b.wide ? new Uint32Array(buf, b.idx, b.count) : new Uint16Array(buf, b.idx, b.count), 1));
        var grp = meshGroups[b.grp] || (meshGroups[b.grp] = new THREE.Group());
        if (!grp.parent) root.add(grp);
        var glass = b.opacity < 1;
        var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
          // Revit glass materials are often saturated cyan; show glass as a soft blue-grey tint.
          color: glass ? 0x5E7484 : b.color, roughness: glass ? 0.1 : 0.85, flatShading: true,
          transparent: glass, opacity: glass ? 0.5 : 1, depthWrite: !glass,
          side: glass ? THREE.DoubleSide : THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true }));
        m.castShadow = !glass; m.receiveShadow = !glass; grp.add(m);
        if (!glass) grp.add(new THREE.Mesh(g, cap));
        if (!glass && b.grp === 'arch') edgeQueue.push({ g: g, grp: grp });
      });
      scene.add(root); applyLevel(); note.hidden = true;
      // Outline edges (like Revit's "shaded with edges"), built after the first frame is on screen.
      var edgeMat = new THREE.LineBasicMaterial({ color: 0x101725, transparent: true, opacity: 0.45, clippingPlanes: [cutPlane] });
      setTimeout(function () {
        edgeQueue.forEach(function (e) { e.grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(e.g, 30), edgeMat)); });
        edgeQueue = [];
      }, 50);
    }).catch(function () { note.textContent = 'تعذّر تحميل المجسّم'; });
  }
  if (MESH) loadMesh();

  home(); cam.t.copy(goal.t);
  applyLevel(); applyNight(); renderUI(); resize(); frame();
})();
