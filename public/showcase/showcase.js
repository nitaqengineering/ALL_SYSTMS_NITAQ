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
      facts: 'بيانات المشروع', rooms: 'الفراغات', scenes: 'مشاهد جاهزة', finishes: 'اقتراح الخامات', ceiling: 'تصميم السقف والإضاءة', scene: 'مشهد', outside: 'خارجي', near: 'قرب', total: 'مجموع الفراغات',
      built: 'المساحة المبنية م²', plot: 'مساحة الأرض م²', beds: 'غرف نوم', baths: 'حمامات',
      floors: 'طوابق', ft: 'قدم²', m: 'م²', cta: 'تواصل مع نطاق',
      hint: 'اسحب للدوران · العجلة للتقريب · اضغط على فراغ للتركيز',
      walkHint: 'اسحب للنظر حولك · اضغط على الحلقة الذهبية في الأرض للانتقال إليها', inRoom: 'أنت في', eyeH: 'ارتفاع النظر', lens: 'العدسة', pace: 'سرعة المشي', bob: 'حركة طبيعية للرأس', ao: 'ظلال واقعية (جودة عالية)', mUnit: 'م', mm: 'مم', ms: 'م/ث',
      foot: 'المجسّم للتوضيح فقط. المساحات والأبعاد المعتمدة هي الواردة في المخططات الموقّعة.' },
    en: { k: 'Interactive viewing', sample: 'Sample model', night: 'Night', day: 'Day', lang: 'ع',
      rotate: 'Rotate', walk: 'Walk', doll: 'Dollhouse', plan: 'Floor plan', walls: 'Full walls', reset: 'Reset', furn: 'Furniture',
      loading: 'Loading model…',
      facts: 'Project facts', rooms: 'Spaces', scenes: 'Ready views', finishes: 'Finish options', ceiling: 'Ceiling and lighting', scene: 'View', outside: 'Outside', near: 'near', total: 'Spaces total',
      built: 'Built-up m²', plot: 'Plot m²', beds: 'Bedrooms', baths: 'Bathrooms',
      floors: 'Floors', ft: 'ft²', m: 'm²', cta: 'Contact NITAQ',
      hint: 'Drag to rotate · scroll to zoom · click a space to focus',
      walkHint: 'Drag to look around · click the gold ring on the floor to go there', inRoom: 'You are in', eyeH: 'Eye height', lens: 'Lens', pace: 'Walking speed', bob: 'Natural head motion', ao: 'Realistic shadows (high quality)', mUnit: 'm', mm: 'mm', ms: 'm/s',
      foot: 'Model is illustrative. Approved areas and dimensions are those on the signed drawings.' }
  };
  var FLOOR = { living: 0xC8A57A, dining: 0xC8A57A, majlis: 0xB9905F, bedroom: 0xD2B48C,
    kitchen: 0xD9D6CF, wet: 0xBFC7CF, hall: 0xE3DED3, service: 0xCFCAC0, terrace: 0x9A8F80 };
  var CUT = 1.35, SQFT = 10.7639;

  // Open on the lowest level that has rooms (the ground floor, not a basement).
  var firstRooms = D.levels.findIndex(function (l) { return l.rooms.length; });
  var S = { lang: 'ar', night: false, level: Math.max(firstRooms, 0), full: false, furn: true, walk: false, finish: 'classic', ceil: 'spots', eye: 1.6, lens: 24, pace: 1.4, bob: true, ao: !(window.matchMedia && matchMedia('(pointer: coarse)').matches), auto: false, sel: null, hover: null };
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
  if (D.mesh) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82; }
  // Section plane: everything above it is cut away, like a Revit plan cut / section box top.
  renderer.localClippingEnabled = true;
  var cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  var meshGroups = {}, noteLbls = [], edgeQueue = [];
  // Exported surface groups that make up the building (walk mode collides with these):
  // arch = everything else built; wall/ext = interior/facade wall faces; floor/pave = interior
  // floor/open paving tops; ceil = slab and roof undersides.
  var ARCH = ['arch', 'wall', 'ext', 'floor', 'pave', 'ceil']; // 'arch' and 'furn' groups once the Revit geometry has loaded
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);

  var hemi = new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 0.85); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1dc, 0.75);
  sun.position.set(SIZE * 0.6, SIZE * 1.3, SIZE * 0.5); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 2;
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
  var downAt = 0;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = [e.clientX, e.clientY]; moved = 0; downAt = Date.now();
    if (S.walk) W.target = null; // pressing always stops a glide in progress
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId];
    if (!p) { if (S.walk) aimRing(e); else pick(e); return; }
    var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && !S.walk) goal.r = clampR(goal.r * pinch / d); pinch = d; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (S.walk) { W.yaw -= dx * 0.003; W.pitch = Math.max(-1.2, Math.min(1.2, W.pitch - dy * 0.003)); return; } // eased in stepWalk
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
    if (S.walk) { if (Date.now() - downAt < 350) walkTo(e); return; } // a press held to look is not a click
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
    hemi.color.set(S.night ? 0x7f93c9 : 0xffffff); lamps.visible = S.night && !MESH;
    if (MESH) {
      scene.environment = S.night ? ENV.night : ENV.day; paintSky();
      hemi.intensity = S.night ? 0.08 : 0.22; sun.intensity = S.night ? 0.03 : 1.25;
      if (meshReady) applyCeiling();
    }
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
    D.levels.forEach(function (l) { // lowest floor first, in reading order
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
    if (typeof renderFinishes === 'function' && meshReady) renderFinishes();
    var views = D.views || [], sl = $('scenes');
    $('scenesSec').hidden = !views.length; $('kScenes').textContent = T('scenes'); sl.innerHTML = '';
    views.forEach(function (v, i) {
      var li = document.createElement('li'), a = document.createElement('b'), sp = document.createElement('span');
      var lv = D.levels[sceneLevel(v)];
      a.style.fontWeight = 400; a.textContent = T('scene') + ' ' + (i + 1) + ' · ' + sceneName(v);
      sp.textContent = nm(lv);
      li.appendChild(a); li.appendChild(sp);
      li.onclick = function () { goScene(v); };
      sl.appendChild(li);
    });
    // Plan text notes (spaces with no Revit room): name-only labels, not clickable.
    noteLbls = (L.notes || []).map(function (n) {
      var d = document.createElement('div');
      d.className = 'lbl note'; d.textContent = nm(n); lb.appendChild(d);
      return { el: d, x: n.x, y: n.y };
    });
    syncDock(); paint(); renderWalkCtl();
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
  // Eye height and pace come from the walk controls (S.eye, S.pace); 1.4 m/s is an adult's
  // indoor walking pace, Shift doubles it. A stride is ~0.7 m: one head bob per step.
  var EYE = 1.6, CHEST = 1.2, RADIUS = 0.3, MAX_STEP = 0.35, STRIDE = 0.7;
  var W = { pos: new THREE.Vector3(), eye: new THREE.Vector3(), target: null, yaw: 0, pitch: 0.05, floor: 0, keys: {}, joy: [0, 0], turn: 0, glide: 0,
    vel: new THREE.Vector3(), vy: 0, vp: 0.05, phase: 0, amp: 0, bobY: 0, bobX: 0 };
  var hit = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3(), org = new THREE.Vector3();
  var solids = [], backs = [];
  function colliders() {
    solids = []; backs = [];
    // Real geometry: the arch group (furniture does not block). Sample model: walls and floors.
    var roots = MESH ? ARCH.map(function (k) { return meshGroups[k]; }) : levelGroups.map(function (g) { return g.full; }).concat(levelGroups.map(function (g) { return g.G.children[0]; }));
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
  /* Ambient occlusion (SSAO) in walk mode on capable screens: soft contact shadows where
     furniture meets the floor, in corners and under shelves. Off in the dollhouse (its section
     cut is not seen by the AO pass) and on phones, and switchable in the walk controls. */
  var composer = null, ssao = null;
  function useAO() {
    if (!S.walk || !S.ao || !MESH || !THREE.SSAOPass) return false;
    if (!composer) {
      composer = new THREE.EffectComposer(renderer);
      ssao = new THREE.SSAOPass(scene, camera, 2, 2);
      ssao.kernelRadius = 0.35; ssao.minDistance = 0.00005; ssao.maxDistance = 0.003;
      // the model carries no vertex normals (flat-shaded from faces): the AO normal pass must too
      ssao.normalMaterial.flatShading = true; ssao.normalMaterial.needsUpdate = true;
      composer.addPass(ssao);
      composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
      sizeAO();
    }
    return true;
  }
  function sizeAO() {
    if (!composer) return;
    var w = stage.clientWidth, h = stage.clientHeight, r = renderer.getPixelRatio();
    composer.setPixelRatio(r); composer.setSize(w, h);
  }
  function applyLens() {
    camera.far = S.walk ? 160 : 500; // a tighter depth range in walk mode keeps the AO precise
    if (S.walk) { camera.filmGauge = 36; camera.setFocalLength(S.lens); } else { camera.fov = 32; camera.updateProjectionMatrix(); }
  }
  // Walk controls: eye height, lens, pace and head motion.
  function renderWalkCtl() {
    var box = $('walkctl'); box.innerHTML = '';
    [['eye', T('eyeH'), 1.0, 1.9, 0.05, T('mUnit'), 2], ['lens', T('lens'), 14, 50, 1, T('mm'), 0], ['pace', T('pace'), 0.6, 2.4, 0.1, T('ms'), 1]].forEach(function (c) {
      var row = document.createElement('label'), name = document.createElement('span'), val = document.createElement('b'), inp = document.createElement('input');
      inp.type = 'range'; inp.min = c[2]; inp.max = c[3]; inp.step = c[4]; inp.value = S[c[0]];
      function show() { val.textContent = (+S[c[0]]).toFixed(c[6]) + ' ' + c[5]; }
      inp.oninput = function () {
        S[c[0]] = +inp.value; show();
        if (c[0] === 'eye') EYE = S.eye;
        if (c[0] === 'lens') applyLens();
      };
      name.textContent = c[1]; show();
      row.appendChild(name); row.appendChild(val); row.appendChild(inp); box.appendChild(row);
    });
    [['bob', T('bob')], ['ao', T('ao')]].forEach(function (o) {
      var lab = document.createElement('label'), cb = document.createElement('input');
      lab.className = 'chk'; cb.type = 'checkbox'; cb.checked = S[o[0]];
      cb.onchange = function () { S[o[0]] = cb.checked; };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + o[1])); box.appendChild(lab);
    });
  }
  function setWalk(on) {
    if (on && MESH && !meshGroups.arch) return; // geometry still loading
    S.walk = on; S.auto = false; lastRoom = null;
    camera.near = on ? 0.05 : 0.1; applyLens();
    applyLevel();
    if (on) {
      $('bDoll').classList.remove('on'); $('bPlan').classList.remove('on');
      colliders();
      var p = startPoint(); placeWalker(p.x, p.z);
      W.yaw = -cam.th; W.pitch = 0.05; W.keys = {}; W.vy = W.yaw; W.vp = W.pitch; W.vel.set(0, 0, 0);
    } else {
      ring.visible = false;
    }
    syncDock();
  }
  // Revit perspective views: the level is the highest one at least 1 m below the camera.
  function sceneLevel(v) {
    var li = 0;
    D.levels.forEach(function (L, i) { if (L.elevation <= v.eye[2] - 1) li = i; });
    return li;
  }
  // Scene label: the space it stands in; else, inside the house, the nearest named space; else outside.
  function sceneName(v) {
    var L = D.levels[sceneLevel(v)], x = v.eye[0], y = v.eye[1], n = nameAt(L, x, y);
    if (n) return n;
    var inside = (L.slabs || []).some(function (sl) { return inPoly(x, y, sl.poly); });
    if (!inside) return T('outside');
    var best = Infinity, name = '';
    L.rooms.map(function (r) { return { x: r._c[0], y: r._c[1], o: r }; })
      .concat((L.notes || []).map(function (n) { return { x: n.x, y: n.y, o: n }; }))
      .forEach(function (c) { var d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y); if (d < best) { best = d; name = nm(c.o); } });
    return name ? T('near') + ' ' + name : T('outside');
  }
  function goScene(v) {
    if (MESH && !meshGroups.arch) return;
    var li = sceneLevel(v);
    if (li !== S.level) { S.level = li; S.sel = null; renderUI(); }
    if (!S.walk) setWalk(true);
    applyLevel();
    var w = P(v.eye[0], v.eye[1]);
    W.floor = v.eye[2] - EYE; W.target = null;
    W.pos.set(w.x, W.floor, w.z); W.eye.set(w.x, v.eye[2], w.z);
    W.yaw = Math.atan2(v.dir[0], v.dir[1]);
    W.pitch = -Math.asin(Math.max(-1, Math.min(1, v.dir[2])));
    W.vy = W.yaw; W.vp = W.pitch; W.vel.set(0, 0, 0);
    lastRoom = null;
  }
  // Gold ring under the pointer: where a click would take the walker (floors only).
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40), new THREE.MeshBasicMaterial({ color: 0xC9A25D, transparent: true, opacity: 0.9, depthTest: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 10; ring.visible = false; scene.add(ring);
  function floorHit(e) {
    var b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    hit.setFromCamera(ndc, camera); hit.near = 0; hit.far = 60;
    return hit.intersectObjects(solids, false).filter(function (h) { return !isGlass(h.object); })[0];
  }
  function aimRing(e) {
    var f = floorHit(e);
    ring.visible = !!(f && f.face && f.face.normal.y > 0.6 && f.point.y < W.floor + 1.2);
    if (ring.visible) ring.position.set(f.point.x, f.point.y + 0.02, f.point.z);
  }
  function walkTo(e) {
    var f = floorHit(e);
    if (!f || !f.face) return;
    if (f.face.normal.y > 0.6 && f.point.y < W.floor + 1.2) W.target = f.point.clone();
    else { // tapped a wall: walk up to just in front of it
      tmp.copy(f.point).sub(W.pos); tmp.y = 0;
      var d = tmp.length(); if (d < 0.6) return;
      W.target = W.pos.clone().addScaledVector(tmp.normalize(), d - 0.5);
    }
    if (W.target) { tmp.copy(W.target).sub(W.pos); tmp.y = 0; W.glide = tmp.length() / 2.2; } // far spots: there in ~2 s
  }
  var move = new THREE.Vector3(), dir = new THREE.Vector3();
  function stepWalk(dt) {
    var fwd = (W.keys.w || W.keys.arrowup ? 1 : 0) - (W.keys.s || W.keys.arrowdown ? 1 : 0) + W.joy[1];
    var side = (W.keys.d ? 1 : 0) - (W.keys.a ? 1 : 0) + W.joy[0];
    W.yaw += ((W.keys.arrowright ? 1 : 0) - (W.keys.arrowleft ? 1 : 0) + W.turn) * dt * 1.2;
    // Desired velocity: keys at walking pace, or toward a clicked spot, slowing on arrival.
    move.set(0, 0, 0);
    if (fwd || side) {
      W.target = null;
      var sy = Math.sin(W.yaw), cy = Math.cos(W.yaw);
      move.set(sy * fwd + cy * side, 0, -cy * fwd + sy * side);
      if (move.length() > 1) move.normalize();
      move.multiplyScalar(S.pace * (W.keys.shift ? 2 : 1));
    } else if (W.target) {
      move.copy(W.target).sub(W.pos); move.y = 0;
      var d = move.length();
      if (d < 0.04 && W.vel.length() < 0.15) { W.target = null; move.set(0, 0, 0); }
      else move.multiplyScalar(Math.min(Math.max(S.pace, W.glide), d * 2.2) / Math.max(d, 1e-6)); // ease out
    }
    // Ease velocity toward it: a person speeds up and slows down over ~0.3 s, not instantly.
    W.vel.lerp(move, 1 - Math.exp(-dt * 7));
    move.copy(W.vel).multiplyScalar(dt);
    var len = move.length();
    if (len > 1e-5) {
      dir.copy(move).divideScalar(len);
      var wall = blockedAt(org.set(W.pos.x, W.floor + CHEST, W.pos.z), dir, len + RADIUS);
      if (wall < len + RADIUS) { len = Math.max(0, wall - RADIUS); W.target = null; W.vel.set(0, 0, 0); }
      var nx = W.pos.x + dir.x * len, nz = W.pos.z + dir.z * len;
      var f = floorAt(nx, nz, W.floor + MAX_STEP + 0.05);
      if (f == null || f - W.floor <= MAX_STEP) { // no step too high; a drop or a gap is fine
        W.pos.x = nx; W.pos.z = nz;
        if (f != null && W.floor - f < 1.5) W.floor = f;
      } else W.target = null;
    }
    W.pos.y = W.floor;
    // Head: one bob per step and a slight sway every two, scaled by speed and faded in/out.
    var speed = W.vel.length();
    W.amp += ((S.bob ? Math.min(1, speed / 1.4) : 0) - W.amp) * Math.min(1, dt * 5);
    W.phase += speed / STRIDE * Math.PI * dt;
    W.bobY = 0.022 * W.amp * Math.sin(2 * W.phase); W.bobX = 0.012 * W.amp * Math.sin(W.phase);
    W.eye.lerp(tmp.set(W.pos.x, W.floor + EYE, W.pos.z), Math.min(1, dt * 10)); // smooths stairs too
    // Look: the head turns toward where the pointer drags it, eased.
    var k = 1 - Math.exp(-dt * 14);
    W.vy += (W.yaw - W.vy) * k; W.vp += (W.pitch - W.vp) * k;
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
    mapFit = { k: k * dpr, ox: (size - (x1 - x0) * k) / 2 * dpr, oy: (size - (y1 - y0) * k) / 2 * dpr, x0: x0, y1: y1, dpr: dpr, size: size };
    mapLevel = S.level;
    planImg = MESH && meshReady ? renderPlan() : null;
  }
  // Top-down orthographic render of this level cut at plan height (walls in navy poché,
  // furniture, stairs, doors), the same section the dollhouse uses, so it is the floor's plan.
  var planR = null, planImg = null;
  function renderPlan() {
    var px = map.width, L = D.levels[S.level], floorY = L.elevation + (L._slabTop || 0);
    if (!planR) {
      planR = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      planR.localClippingEnabled = true; planR.outputEncoding = THREE.sRGBEncoding;
    }
    planR.setPixelRatio(1); planR.setSize(px, px, false);
    var a = fromMap(0, 0), b = fromMap(mapFit.size, mapFit.size);
    var cam = new THREE.OrthographicCamera(a[0] - CX, b[0] - CX, a[1] - CY, b[1] - CY, 0.1, 30 + CUT + 0.6);
    cam.position.set(0, floorY + 30, 0); cam.up.set(0, 0, -1); cam.lookAt(0, floorY, 0);
    var keep = cutPlane.constant, hi = hemi.intensity, si = sun.intensity, lv = lamps.visible;
    cutPlane.constant = floorY + CUT; hemi.intensity = 0.95; sun.intensity = 0.5; lamps.visible = false;
    planR.render(scene, cam);
    cutPlane.constant = keep; hemi.intensity = hi; sun.intensity = si; lamps.visible = lv;
    var img = document.createElement('canvas'); img.width = img.height = px;
    img.getContext('2d').drawImage(planR.domElement, 0, 0);
    return img;
  }
  function toMap(x, y) { return [mapFit.ox + (x - mapFit.x0) * mapFit.k, mapFit.oy + (mapFit.y1 - y) * mapFit.k]; }
  function fromMap(px, py) { return [(px * mapFit.dpr - mapFit.ox) / mapFit.k + mapFit.x0, mapFit.y1 - (py * mapFit.dpr - mapFit.oy) / mapFit.k]; }
  function drawMap() {
    if (mapLevel !== S.level || !mapFit) fitMap();
    var L = D.levels[S.level], c = mctx;
    c.clearRect(0, 0, map.width, map.height);
    function path(poly) { c.beginPath(); poly.forEach(function (q, i) { var m = toMap(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](m[0], m[1]); }); c.closePath(); }
    c.lineWidth = mapFit.dpr;
    if (planImg) c.drawImage(planImg, 0, 0);
    else {
      (L.slabs || []).forEach(function (sl) { path(sl.poly); c.fillStyle = 'rgba(238,237,234,.92)'; c.fill(); c.strokeStyle = '#6E7787'; c.stroke(); });
      L.rooms.forEach(function (r) { path(r.poly); c.strokeStyle = 'rgba(110,119,135,.7)'; c.stroke(); });
    }
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
  function nameAt(L, x, y) {
    var r = L.rooms.filter(function (r) { return inPoly(x, y, r.poly); })[0], name = '';
    if (r) return nm(r);
    var best = 16;
    (L.notes || []).forEach(function (n) { var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y); if (d < best) { best = d; name = nm(n); } });
    return name;
  }
  function showRoom() {
    var name = nameAt(D.levels[S.level], W.pos.x + CX, -W.pos.z + CY);
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
  if (/[?&]debug(&|$)/.test(location.search)) window.__walk = { W: W, blockedAt: blockedAt, floorAt: floorAt, solids: function () { return solids; }, doors: function () { return leafPivots; }, place: function (x, z) { return placeWalker(x, z); }, interior: function () { return { spots: spots, cove: coveGroup.children.map(function (c) { return c.count; }), finish: finishMeshes.map(function (f) { return f.kind; }) }; } };
  window.addEventListener('keydown', function (e) {
    if (!S.walk || /input|textarea/i.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { mode(false); return; }
    W.keys[k] = true; W.keys.shift = e.shiftKey;
    if (/^arrow/.test(k)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { W.keys[e.key.toLowerCase()] = false; W.keys.shift = e.shiftKey; });
  window.addEventListener('blur', function () { W.keys = {}; });

  /* ---------- loop ---------- */
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; applyLens(); sizeAO();
    // key plan sits just above the bottom bar, however many rows the bar wraps to
    var dock = document.querySelector('.dock'); if (dock) map.style.bottom = $('walkctl').style.bottom = (dock.offsetHeight + (w < 860 ? 20 : 32)) + 'px';
    var fit = SIZE * 2.4 * Math.max(1, 1.15 / camera.aspect);
    if (Math.abs(goal.r - HOME.r) < 0.01) goal.r = fit;
    HOME.r = fit;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
  var v = new THREE.Vector3();
  var clock = new THREE.Clock();
  function frame() {
    var dt = Math.min(clock.getDelta(), 0.1);
    swingDoors(dt); nightLights(performance.now());
    if (S.walk) {
      stepWalk(dt);
      camera.position.set(W.eye.x + Math.cos(W.vy) * W.bobX, W.eye.y + W.bobY, W.eye.z + Math.sin(W.vy) * W.bobX);
      camera.rotation.set(-W.vp, -W.vy, 0, 'YXZ');
    } else {
      if (S.auto) goal.th += 0.0035;
      var k = 0.12;
      cam.th += (goal.th - cam.th) * k; cam.ph += (goal.ph - cam.ph) * k; cam.r += (goal.r - cam.r) * k; cam.t.lerp(goal.t, k);
      var sp = Math.sin(cam.ph);
      camera.position.set(cam.t.x + cam.r * sp * Math.sin(cam.th), cam.t.y + cam.r * Math.cos(cam.ph), cam.t.z + cam.r * sp * Math.cos(cam.th));
      camera.lookAt(cam.t);
    }
    if (sky) sky.visible = S.walk;
    if (useAO()) composer.render(); else renderer.render(scene, camera);
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
        var parent = b.grp === 'leaf' ? pivotFor(grp, b.door, b.hinge) : grp;
        var glass = b.opacity < 1;
        if (b.grp === 'floor') addUV(g); // floor finishes are textures laid in plan
        // Glass: one reflective tinted material (Revit glass colours are often saturated cyan).
        var smooth = false;
        if (b.grp === 'furn' && !glass) { // rugs split off; the rest smooth-shaded
          var fp = furnParts(g);
          if (fp.rug) {
            var rm = new THREE.Mesh(fp.rug, makeMaterial(finish('rug', new THREE.Color(b.color), {}), false));
            rm.receiveShadow = true; parent.add(rm);
          }
          if (fp.wet) {
            var wc = new THREE.Color(b.color), whsl = {}; wc.getHSL(whsl);
            var wp = whsl.l > 0.6 && whsl.s < 0.3 ? finish('porcelain', wc, whsl) : proposal(b);
            var wm = new THREE.Mesh(fp.wet, makeMaterial(wp, true));
            wm.castShadow = wm.receiveShadow = true; parent.add(wm); parent.add(new THREE.Mesh(fp.wet, cap));
          }
          if (!fp.main) return;
          g = fp.main; smooth = true;
        }
        var m = new THREE.Mesh(g, glass ? glassMat : lookMaterial(b, smooth));
        m.castShadow = !glass; m.receiveShadow = !glass; parent.add(m);
        if (!glass) parent.add(new THREE.Mesh(g, cap));
        if (!glass && FINISH_KIND[b.grp]) finishMeshes.push({ m: m, kind: FINISH_KIND[b.grp], color: b.color });
        if (!glass && ARCH.indexOf(b.grp) >= 0) edgeQueue.push({ g: g, grp: parent });
      });
      scene.add(root); applyLevel(); note.hidden = true;
      setupInterior(root);
      meshReady = true; mapLevel = -1; renderUI(); applyFinish();
      // Outline edges (like Revit's "shaded with edges"), built after the first frame is on screen.
      var edgeMat = new THREE.LineBasicMaterial({ color: 0x101725, transparent: true, opacity: 0.45, clippingPlanes: [cutPlane] });
      setTimeout(function () {
        edgeQueue.forEach(function (e) { e.grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(e.g, 30), edgeMat)); });
        edgeQueue = [];
      }, 50);
    }).catch(function () { note.textContent = 'تعذّر تحميل المجسّم'; });
  }
  /* ---------- doors ----------
     Each leaf turns about its hinge (the centre of the door's plan swing arc in Revit) by the
     arc's angle, in the arc's direction, when the walker comes within 2 m. */
  var meshReady = false, leafPivots = [], leafByKey = {};
  function pivotFor(grp, d, h) {
    var key = d + ':' + h;
    if (leafByKey[key]) return leafByKey[key].inner;
    var hg = MESH.doors[d][h];
    var lx = (hg[0] * 1000 - MESH.origin[0]) / MESH.step, lz = (-hg[1] * 1000 - MESH.origin[2]) / MESH.step;
    var pivot = new THREE.Group(), inner = new THREE.Group();
    pivot.position.set(lx, 0, lz); inner.position.set(-lx, 0, -lz); pivot.add(inner); grp.add(pivot);
    var rec = { pivot: pivot, inner: inner, x: hg[0], y: hg[1], sign: hg[2], ang: hg[3], t: 0 };
    leafByKey[key] = rec; leafPivots.push(rec);
    return inner;
  }
  function swingDoors(dt) {
    if (!leafPivots.length) return;
    var x = W.pos.x + CX, y = -W.pos.z + CY;
    leafPivots.forEach(function (d) {
      var want = S.walk && (d.x - x) * (d.x - x) + (d.y - y) * (d.y - y) < 4 ? 1 : 0;
      if (Math.abs(want - d.t) < 0.001) return;
      d.t += (want - d.t) * Math.min(1, dt * 4);
      d.pivot.rotation.y = d.t * d.sign * d.ang;
    });
  }

  /* ---------- finish schemes ----------
     Proposed finishes for interior walls, ceilings and floors (the facade and outdoor paving
     keep their Revit materials). Floor finishes are generated textures laid in plan, at real
     tile and plank sizes; walls and ceilings are paint colours. */
  var FINISH_KIND = { wall: 'wall', ceil: 'ceil', floor: 'floor' };
  var finishMeshes = [];
  function addUV(g) {
    var p = g.attributes.position.array, n = p.length / 3, uv = new Float32Array(n * 2), k = MESH.step / 1000;
    for (var i = 0; i < n; i++) { uv[i * 2] = p[i * 3] * k + MESH.origin[0] / 1000; uv[i * 2 + 1] = p[i * 3 + 2] * k + MESH.origin[2] / 1000; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function texture(draw, metres) {
    var c = document.createElement('canvas'); c.width = c.height = 1024;
    draw(c.getContext('2d'), 1024, rng(7));
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  // Large-format slabs with grey veining: 4 slabs of 120 x 120 cm per texture.
  function marble(c, n, r) {
    c.fillStyle = '#F3F1EC'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 26; i++) {
      c.strokeStyle = 'rgba(105,105,112,' + (0.14 + r() * 0.26) + ')'; c.lineWidth = 0.8 + r() * 3;
      c.beginPath(); var x = r() * n, y = r() * n; c.moveTo(x, y);
      for (var j = 0; j < 5; j++) { x += (r() - 0.3) * 260; y += (r() - 0.5) * 200; c.quadraticCurveTo(x - 60, y + 40, x, y); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(140,135,130,.8)'; c.lineWidth = 2.5;
    for (var g = 0; g <= n; g += n / 2) { c.beginPath(); c.moveTo(g, 0); c.lineTo(g, n); c.moveTo(0, g); c.lineTo(n, g); c.stroke(); }
  }
  // Light oak planks 20 x 120 cm, staggered: texture covers 2.4 m.
  function oak(c, n, r) {
    var pw = n / 12, pl = n / 2;
    for (var row = 0; row < 12; row++) {
      var off = (row % 3) * pl / 3;
      for (var x = -pl; x < n + pl; x += pl) {
        var h = 30 + r() * 8, l = 62 + r() * 10;
        c.fillStyle = 'hsl(' + h + ',38%,' + l + '%)'; c.fillRect(x + off, row * pw, pl - 2, pw - 2);
        c.strokeStyle = 'rgba(90,60,30,.10)';
        for (var k = 0; k < 6; k++) { var yy = row * pw + r() * pw; c.beginPath(); c.moveTo(x + off, yy); c.bezierCurveTo(x + off + pl * .3, yy + 3, x + off + pl * .7, yy - 3, x + off + pl, yy); c.stroke(); }
      }
    }
  }
  // Light grey porcelain, 120 x 120 cm: texture covers 2.4 m.
  function porcelain(c, n, r) {
    c.fillStyle = '#DAD7D1'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 9000; i++) { c.fillStyle = 'rgba(' + (r() > .5 ? '255,255,255' : '120,115,110') + ',.05)'; c.fillRect(r() * n, r() * n, 2, 2); }
    c.strokeStyle = 'rgba(150,145,140,.7)'; c.lineWidth = 2;
    for (var g = 0; g <= n; g += n / 2) { c.beginPath(); c.moveTo(g, 0); c.lineTo(g, n); c.moveTo(0, g); c.lineTo(n, g); c.stroke(); }
  }
  var SCHEMES = [
    { id: 'revit', ar: 'كما في الموديل', en: 'As modelled', arD: 'خامات Revit الحالية', enD: 'The current Revit materials' },
    { id: 'classic', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.12 }, ar: 'كلاسيك فاخر', en: 'Classic luxury', floor: [marble, 2.4], wall: '#EFE9DF', ceil: '#FBFAF7', sw: ['#F3F1EC', '#EFE9DF', '#C9A25D'],
      arD: 'أرضيات رخام أبيض بعروق رمادية 120×120 مصقول · دهان عاجي دافئ · أسقف جبس بيضاء · الحمامات والمطبخ: بورسلين 60×60 وسيراميك جدران 30×60', enD: 'Polished white veined marble 120×120 · warm ivory paint · white gypsum ceilings · wet areas and kitchen: porcelain 60×60, ceramic wall tiles 30×60' },
    { id: 'warm', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.45 }, ar: 'مودرن دافئ', en: 'Warm modern', floor: [oak, 2.4], wall: '#DCD5CA', ceil: '#FAF8F4', sw: ['#C9A57A', '#DCD5CA', '#FAF8F4'],
      arD: 'باركيه بلوط فاتح 20×120 · دهان بيج رمادي (Greige) · سقف أبيض مكسور', enD: 'Light oak planks 20×120 · greige paint · off-white ceilings' },
    { id: 'calm', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.35 }, ar: 'هادئ محايد', en: 'Calm neutral', floor: [porcelain, 2.4], wall: '#ECEAE6', ceil: '#FFFFFF', sw: ['#DAD7D1', '#ECEAE6', '#6E7787'],
      arD: 'بورسلين رمادي فاتح مطفي 120×120 · دهان أبيض دافئ · سقف أبيض', enD: 'Matte light-grey porcelain 120×120 · warm white paint · white ceilings' }
  ];
  var texCache = {};
  var ROUGH = { wall: 0.92, ceil: 0.95, floor: 0.6, zoneFloor: 0.32, zoneWall: 0.18 };
  // Wet areas: matte porcelain 60 x 60 on the floor, glossy ceramic 30 x 60 on the walls.
  function porcelainSmall(c, n, r) {
    c.fillStyle = '#CFCBC4'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 6000; i++) { c.fillStyle = 'rgba(' + (r() > .5 ? '255,255,255' : '110,105,100') + ',.05)'; c.fillRect(r() * n, r() * n, 2, 2); }
    c.strokeStyle = 'rgba(140,135,130,.85)'; c.lineWidth = 3;
    for (var g = 0; g <= n; g += n / 2) { c.beginPath(); c.moveTo(g, 0); c.lineTo(g, n); c.moveTo(0, g); c.lineTo(n, g); c.stroke(); }
  }
  function ceramic(c, n, r) {
    c.fillStyle = '#F4F3F0'; c.fillRect(0, 0, n, n);
    c.strokeStyle = 'rgba(175,170,165,.9)'; c.lineWidth = 3;
    for (var y = 0; y <= n; y += n / 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(n, y); c.stroke(); }
    for (var row = 0; row < 4; row++) for (var x = (row % 2) * n / 4; x <= n; x += n / 2) {
      c.beginPath(); c.moveTo(x, row * n / 4); c.lineTo(x, (row + 1) * n / 4); c.stroke();
    }
  }
  function applyFinish() {
    var sc = SCHEMES.filter(function (x) { return x.id === S.finish; })[0] || SCHEMES[0];
    finishMeshes.forEach(function (f) {
      var mat = f.m.material, v = sc[f.kind];
      if (!v) { mat.color.set(f.color); mat.map = null; }
      else if (typeof v === 'string') { mat.color.set(v); mat.map = null; }
      else {
        var key = v[0].name + v[1];
        texCache[key] = texCache[key] || texture(v[0], v[1]);
        mat.color.set('#ffffff'); mat.map = texCache[key];
      }
      mat.roughness = v ? ((sc.rough || {})[f.kind] || ROUGH[f.kind] || 0.85) : 0.85;
      mat.needsUpdate = true;
    });
    var fins = $('fins');
    [].forEach.call(fins.children, function (b) { b.classList.toggle('on', b.dataset.id === sc.id); });
    $('finNote').textContent = S.lang === 'ar' ? sc.arD : sc.enD;
    dressFurniture(sc.id);
  }
  function renderFinishes() {
    var fins = $('fins'), has = finishMeshes.length > 0;
    $('finSec').hidden = !has; $('kFin').textContent = T('finishes');
    if (!has) return;
    fins.innerHTML = '';
    SCHEMES.forEach(function (sc) {
      var b = document.createElement('button'), sw = document.createElement('span');
      b.className = 'fin'; b.dataset.id = sc.id; sw.className = 'sw';
      (sc.sw || ['#d6d2ca', '#fcfcfc', '#808080']).forEach(function (c) { var i = document.createElement('i'); i.style.background = c; sw.appendChild(i); });
      b.appendChild(sw); b.appendChild(document.createTextNode(S.lang === 'ar' ? sc.ar : sc.en));
      b.onclick = function () { S.finish = sc.id; applyFinish(); };
      fins.appendChild(b);
    });
    applyFinish();
    renderCeilings();
  }

  /* ---------- interior: reflections, zoned finishes, ceiling designs, night lighting ----------
     Everything here is derived from the exported geometry, so it works for any villa:
     - reflections: an image-based environment (sky, horizon, ground) lights every material and
       shows in the glass and in polished floors;
     - zones: floors inside wet/kitchen/service rooms and the walls around wet rooms get their
       own finishes (porcelain floor, ceramic wall tiles) whichever scheme is chosen;
     - ceilings: downlights on a 1.5 m grid wherever a ceiling is overhead, and a gypsum cove
       (shelf + hidden LED glow) along the top of every interior wall that meets a ceiling;
     - night: the downlights nearest the visitor become real lights. */
  function envFrom(top, mid, bottom) {
    var es = new THREE.Scene(), geo = new THREE.SphereGeometry(50, 32, 16), col = [];
    var cTop = new THREE.Color(top), cMid = new THREE.Color(mid), cBot = new THREE.Color(bottom), c = new THREE.Color();
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 50;
      if (y > 0) c.copy(cMid).lerp(cTop, Math.pow(y, 0.6)); else c.copy(cMid).lerp(cBot, Math.min(1, -y * 3));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    var pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(es, 0.02).texture;
    pm.dispose(); return tex;
  }
  var ENV = MESH ? { day: envFrom(0xBFD3E6, 0xF3EEE6, 0x9C968B), night: envFrom(0x0B1424, 0x1C2433, 0x0A0D14) } : null;
  // Glass: nearly clear when seen straight on, more reflective toward grazing angles (Fresnel),
  // reflecting the sky environment; a faint green-blue body tint like float glass.
  var glassMat = MESH ? new THREE.MeshStandardMaterial({
    color: 0xC9DCDF, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 1, envMapIntensity: 2.2, flatShading: true,
    depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [cutPlane] }) : null;
  if (glassMat) {
    glassMat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', [
        'float glassF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);',
        'gl_FragColor = vec4( outgoingLight, mix(0.12, 0.8, glassF) );'].join('\n'));
    };
    glassMat.customProgramCacheKey = function () { return 'fresnel-glass'; };
  }
  // Sky dome seen through the windows in walk mode (day or night), and a ground beyond the site.
  var sky = null;
  if (MESH) {
    var skyGeo = new THREE.SphereGeometry(140, 32, 16), skyCol = [], sp = skyGeo.attributes.position;
    for (var si = 0; si < sp.count; si++) skyCol.push(0, 0, 0);
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
    sky = new THREE.Group();
    sky.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false })));
    // a ring, so it never cuts through a basement under the house
    var groundM = new THREE.Mesh(new THREE.RingGeometry(SIZE * 0.9, 140, 64), new THREE.MeshStandardMaterial({ color: 0xD3C9B8, roughness: 1 }));
    groundM.rotation.x = -Math.PI / 2; groundM.position.y = -0.05; groundM.receiveShadow = true; sky.add(groundM);
    sky.visible = false; scene.add(sky);
  }
  function paintSky() {
    if (!sky) return;
    var g = sky.children[0].geometry, pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
    var top = new THREE.Color(S.night ? 0x060B16 : 0x7FAED6), hor = new THREE.Color(S.night ? 0x1B2436 : 0xE8EEF2), bot = new THREE.Color(S.night ? 0x05070B : 0xC9C1B3);
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 140;
      if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.55)); else c.copy(hor).lerp(bot, Math.min(1, -y * 4));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    sky.children[1].material.color.set(S.night ? 0x2A2C30 : 0xD3C9B8);
  }

  // Wet areas, kitchens and service rooms (from Revit rooms) get practical finishes in every scheme.
  var ZONE_FLOOR = { wet: 1, kitchen: 1, service: 1 }, ZONE_WALL = { wet: 1 };
  function levelAt(y) {
    var li = 0;
    D.levels.forEach(function (L, i) { if (L.elevation + (L._slabTop || 0) - 0.3 <= y) li = i; });
    return D.levels[li];
  }
  function roomAt(wx, wy, wz, types) {
    var L = levelAt(wy), x = wx + CX, y = -wz + CY;
    return L.rooms.filter(function (r) { return types[r.type] && inPoly(x, y, r.poly); })[0];
  }
  function splitZones() {
    var va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    finishMeshes.slice().forEach(function (f) {
      if (f.kind !== 'floor' && f.kind !== 'wall') return;
      var g = f.m.geometry, idx = g.index.array, pos = g.attributes.position, mw = f.m.matrixWorld;
      var keep = [], zone = [], types = f.kind === 'floor' ? ZONE_FLOOR : ZONE_WALL;
      for (var t = 0; t < idx.length; t += 3) {
        va.fromBufferAttribute(pos, idx[t]).applyMatrix4(mw); vb.fromBufferAttribute(pos, idx[t + 1]).applyMatrix4(mw); vc.fromBufferAttribute(pos, idx[t + 2]).applyMatrix4(mw);
        var cx = (va.x + vb.x + vc.x) / 3, cy = (va.y + vb.y + vc.y) / 3, cz = (va.z + vb.z + vc.z) / 3;
        if (f.kind === 'wall') { // a wall face belongs to the room it faces: probe 15 cm in front of it
          n.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)).normalize();
          cx += n.x * 0.15; cz += n.z * 0.15;
        }
        (roomAt(cx, cy, cz, types) ? zone : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (!zone.length) return;
      g.setIndex(keep);
      var zg = new THREE.BufferGeometry();
      zg.setAttribute('position', pos); zg.setIndex(zone);
      if (f.kind === 'wall') { zg = zg.toNonIndexed(); boxUV(zg, f.m); } else zg.setAttribute('uv', g.attributes.uv);
      var zm = new THREE.Mesh(zg, f.m.material.clone());
      zm.castShadow = zm.receiveShadow = true; f.m.parent.add(zm);
      f.m.parent.add(new THREE.Mesh(zg, f.m.parent.children.filter(function (o) { return o.material && o.material.side === THREE.BackSide; })[0].material));
      edgeQueue.push({ g: zg, grp: f.m.parent });
      finishMeshes.push({ m: zm, kind: f.kind === 'floor' ? 'zoneFloor' : 'zoneWall', color: f.color });
    });
  }
  // Wall tiles need UVs: per triangle, along the wall and up it, in metres.
  function boxUV(g, mesh) {
    var p = g.attributes.position, uv = new Float32Array(p.count * 2), k = MESH.step / 1000, o = MESH.origin;
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    for (var t = 0; t < p.count; t += 3) {
      a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
      n.crossVectors(e.subVectors(b, a), c.clone().sub(a));
      var alongX = Math.abs(n.z) > Math.abs(n.x);
      for (var i = 0; i < 3; i++) {
        var v = [a, b, c][i];
        uv[(t + i) * 2] = (alongX ? v.x * k + o[0] / 1000 : v.z * k + o[2] / 1000);
        uv[(t + i) * 2 + 1] = v.y * k + o[1] / 1000;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // Ceiling fixtures and cove, built once after the model loads.
  var ceilGroup = new THREE.Group(), spots = [], spotMesh = null, coveGroup = new THREE.Group();
  ceilGroup.add(coveGroup); scene.add(ceilGroup);
  var ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xFFD9A8, emissiveIntensity: 0.4, clippingPlanes: [cutPlane] });
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xFFC98A, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [cutPlane] });
  var shelfMat = new THREE.MeshStandardMaterial({ color: 0xFAF8F4, roughness: 0.9, clippingPlanes: [cutPlane] });
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = 4; c.height = 128;
    var x = c.getContext('2d'), gr = x.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  }
  function buildCeilings() {
    var ceils = [];
    if (meshGroups.ceil) meshGroups.ceil.traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) ceils.push(o); });
    if (!ceils.length) return;
    var cr = new THREE.Raycaster(), upV = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3();
    function ceilingAbove(x, y, z) {
      cr.set(o.set(x, y, z), upV); cr.near = 0; cr.far = 4.6;
      var h = cr.intersectObjects(ceils, false)[0];
      return h ? h.point.y : null;
    }
    // Downlights: a 1.5 m grid over each level, wherever a ceiling is 2.3-4.6 m above the floor.
    D.levels.forEach(function (L, li) {
      if (!L.rooms.length && !(L.notes || []).length) return;
      var fy = L.elevation + (L._slabTop || 0), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      (L.slabs || []).forEach(function (s) { s.poly.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }); });
      for (var x = x0 + 0.75; x < x1; x += 1.5) {
        for (var y = y0 + 0.75; y < y1; y += 1.5) {
          var w = P(x, y), cy = ceilingAbove(w.x, fy + 1.6, w.z);
          if (cy != null && cy - fy > 2.3) spots.push({ p: new THREE.Vector3(w.x, cy - 0.012, w.z), level: li });
        }
      }
    });
    if (spots.length) {
      spotMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 16), ledMat, spots.length);
      var m = new THREE.Matrix4();
      spots.forEach(function (s, i) { spotMesh.setMatrixAt(i, m.makeTranslation(s.p.x, s.p.y, s.p.z)); });
      ceilGroup.add(spotMesh);
    }
    // Cove: along the top edge of each interior wall face that meets a ceiling.
    var segs = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    (meshGroups.wall ? [meshGroups.wall] : []).forEach(function (grp) {
      grp.traverse(function (mesh) {
        if (!mesh.isMesh || mesh.material.side === THREE.BackSide) return;
        var g = mesh.geometry, idx = g.index ? g.index.array : null, pos = g.attributes.position, cnt = idx ? idx.length : pos.count;
        for (var t = 0; t < cnt; t += 3) {
          var vs = [0, 1, 2].map(function (i) { return new THREE.Vector3().fromBufferAttribute(pos, idx ? idx[t + i] : t + i).applyMatrix4(mesh.matrixWorld); });
          n.crossVectors(e.subVectors(vs[1], vs[0]), c.subVectors(vs[2], vs[0])); n.y = 0;
          if (n.lengthSq() < 1e-8) continue;
          n.normalize();
          var ymax = Math.max(vs[0].y, vs[1].y, vs[2].y), top = vs.filter(function (v) { return ymax - v.y < 0.004; });
          if (top.length !== 2 || top[0].distanceTo(top[1]) < 0.5) continue;
          var L = levelAt(ymax - 2.3), fy = L.elevation + (L._slabTop || 0);
          if (ymax - fy < 2.3) continue;
          var mid = a.addVectors(top[0], top[1]).multiplyScalar(0.5);
          var cy = ceilingAbove(mid.x + n.x * 0.3, fy + 1.6, mid.z + n.z * 0.3);
          if (cy == null || cy - fy < 2.3 || Math.abs(cy - ymax) > 0.6) continue;
          segs.push({ a: top[0].clone(), b: top[1].clone(), n: n.clone(), y: cy });
        }
      });
    });
    if (!segs.length) return;
    var shelf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shelfMat, segs.length);
    var led = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ledMat, segs.length);
    var glowM = glowMat.clone(); glowM.map = glowTexture(); glowMat = glowM;
    var glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowM, segs.length);
    var M = new THREE.Matrix4(), R = new THREE.Matrix4(), Rx = new THREE.Matrix4().makeRotationX(Math.PI / 2), Sm = new THREE.Matrix4(), q = new THREE.Vector3();
    segs.forEach(function (s, i) {
      var len = s.a.distanceTo(s.b), d = e.subVectors(s.b, s.a).normalize(), th = Math.atan2(-d.z, d.x);
      if (s.n.x * -d.z + s.n.z * d.x < 0) th += Math.PI; // so the shelf's depth and the glow point into the room
      var mid = q.addVectors(s.a, s.b).multiplyScalar(0.5);
      R.makeRotationY(th);
      function put(mesh, along, depth, height, off, y, flat) {
        Sm.makeScale(along, flat ? depth : height, flat ? 1 : depth);
        M.makeTranslation(mid.x + s.n.x * off, y, mid.z + s.n.z * off).multiply(R);
        if (flat) M.multiply(Rx);
        mesh.setMatrixAt(i, M.multiply(Sm));
      }
      put(shelf, len, 0.3, 0.05, 0.15, s.y - 0.3);
      put(led, len, 0.02, 0.012, 0.28, s.y - 0.27);
      put(glow, len, 0.7, 0, 0.35, s.y - 0.006, true);
    });
    coveGroup.add(shelf, led, glow);
  }
  // Night: the downlights nearest the visitor light the space (a few real lights, reused).
  var pool = [];
  for (var pi = 0; pi < 8; pi++) { var pl = new THREE.PointLight(0xFFD2A0, 0, 7, 2); pool.push(pl); scene.add(pl); }
  var lastPick = 0;
  function nightLights(now) {
    var on = MESH && S.night && spots.length;
    if (!on) { pool.forEach(function (l) { l.intensity = 0; }); return; }
    if (now - lastPick < 250) return;
    lastPick = now;
    var focus = S.walk ? W.eye : cam.t, li = S.level;
    spots.filter(function (s) { return s.level === li; })
      .sort(function (p, q) { return p.p.distanceToSquared(focus) - q.p.distanceToSquared(focus); })
      .slice(0, pool.length)
      .forEach(function (s, i) { pool[i].position.set(s.p.x, s.p.y - 0.15, s.p.z); pool[i].intensity = S.walk ? 1.3 : 0.9; });
  }
  var CEILS = [
    { id: 'spots', ar: 'سبوتات', en: 'Downlights', arD: 'سقف جبس مستوي وسبوتات LED دافئة 3000K كل 1.5 م', enD: 'Flat gypsum ceiling, warm 3000K LED downlights every 1.5 m' },
    { id: 'cove', ar: 'جبس بإنارة مخفية', en: 'Gypsum cove', arD: 'رف جبس على محيط الفراغ بإضاءة LED مخفية تنعكس على السقف، مع السبوتات', enD: 'Gypsum cove around each space with hidden LED washing the ceiling, plus downlights' },
    { id: 'flat', ar: 'كما في الموديل', en: 'As modelled', arD: 'سقف بلا تجهيزات إضاءة', enD: 'Ceiling without light fittings' }
  ];
  function applyCeiling() {
    var sc = CEILS.filter(function (c) { return c.id === S.ceil; })[0] || CEILS[0];
    if (spotMesh) spotMesh.visible = sc.id !== 'flat';
    coveGroup.visible = sc.id === 'cove';
    ledMat.emissiveIntensity = S.night ? 2.2 : 0.5;
    glowMat.opacity = S.night ? 0.9 : 0.22;
    [].forEach.call($('ceils').children, function (b) { b.classList.toggle('on', b.dataset.id === sc.id); });
    $('ceilNote').textContent = S.lang === 'ar' ? sc.arD : sc.enD;
  }
  function renderCeilings() {
    var box = $('ceils'); $('kCeil').textContent = T('ceiling');
    box.innerHTML = '';
    CEILS.forEach(function (c) {
      var b = document.createElement('button'); b.className = 'fin'; b.dataset.id = c.id;
      b.textContent = S.lang === 'ar' ? c.ar : c.en;
      b.onclick = function () { S.ceil = c.id; applyCeiling(); };
      box.appendChild(b);
    });
    applyCeiling();
  }
  function setupInterior(root) {
    root.updateMatrixWorld(true);
    splitZones();
    setTimeout(function () { buildCeilings(); applyCeiling(); }, 80);
  }

  /* ---------- proposed materials ----------
     Revit families carry flat shading colours (a yellow "teak", a cyan "stone", saturated
     fabric blues). Instead of copying them, each furniture colour is read as the material it
     most likely is (wood, fabric, foliage, stone, metal, porcelain...) and given a realistic
     finish: a natural colour in that family, a generated texture at a real-world scale laid in
     world space (the mesh has no UVs), and a fitting roughness. Material names from the export,
     when present, sharpen the guess. Walls and slabs keep their colours (finish schemes apply). */
  var PROPOSE = { furn: 1, door: 1, leaf: 1 }, procTex = {};
  function lookOf(b) { return b.look != null && MESH.looks ? MESH.looks[b.look] : null; }
  function nameKind(l) {
    var t = l ? ((l.cls || '') + ' ' + (l.schema || '') + ' ' + (l.name || '')).toLowerCase() : '';
    if (/metal|steel|chrome|alumin|acciaio|allumin|brass|iron/.test(t)) return 'metal';
    if (/wood|teak|oak|walnut|birch|pine|abete|pioppo|legno|hardwood|veneer/.test(t)) return 'wood';
    if (/carpet|rug|tappeto/.test(t)) return 'rug';
    if (/fabric|textile|tessuto|linen|lino|cotton|velvet|leather|cuscino|cushion/.test(t)) return 'fabric';
    if (/leaf|vegetation|plant|ficus|grass/.test(t)) return 'foliage';
    if (/stone|marble|granite|concrete|terrazzo/.test(t)) return 'stone';
    if (/porcelain|ceramic|toilet|basin/.test(t)) return 'porcelain';
    return '';
  }
  // Colour → most likely material, by hue/saturation/lightness.
  function colourKind(hsl) {
    var h = hsl.h * 360, s = hsl.s, l = hsl.l;
    if (l < 0.1) return 'black';
    if (s > 0.2 && h >= 70 && h <= 160) return 'foliage';
    if (s > 0.22 && h >= 15 && h < 55 && l < 0.75) return 'wood';
    if (s > 0.25 && h >= 160 && h < 200 && l > 0.35) return 'stone'; // Revit's cyan "Stone"
    if (s > 0.3) return 'accent';
    if (l > 0.62) return 'fabric'; // white/light upholstery; sanitary ware is picked out by room (furnParts)
    if (l > 0.3) return s < 0.06 ? 'metal' : 'fabric';
    return 'charcoal';
  }
  function finish(kind, c, hsl) {
    var out = { kind: kind, color: c.clone(), rough: 0.85, metal: 0, tex: null, scale: 1 };
    switch (kind) {
      case 'wood': // light oak / teak-walnut / dark walnut by lightness
        out.color.set(hsl.l > 0.6 ? '#C9A67C' : hsl.l > 0.33 ? '#8A5A36' : '#4A3222'); out.rough = 0.5; out.tex = 'wood'; out.scale = 0.8; break;
      case 'foliage':
        out.color.setHSL(0.22 + (hsl.h - 0.22) * 0.4, Math.min(hsl.s, 0.45), Math.min(Math.max(hsl.l * 0.8, 0.18), 0.36)); out.rough = 0.6; break;
      case 'stone': out.color.set('#CFC6B8'); out.rough = 0.4; out.tex = 'stone'; out.scale = 0.5; break;
      case 'black': out.color.set('#161616'); out.rough = 0.35; out.metal = 0.25; break;
      case 'metal': out.color.set('#B8BABC'); out.rough = 0.3; out.metal = 0.9; break;
      case 'porcelain': out.color.set('#F4F2EE'); out.rough = 0.3; break;
      case 'fabric': // linen / boucle in the same light family
        out.color.setHSL(hsl.h, Math.min(hsl.s, 0.12), Math.min(Math.max(hsl.l, 0.55), 0.88)); out.rough = 0.95; out.tex = 'fabric'; out.scale = 0.18; break;
      case 'charcoal': out.color.set(hsl.l < 0.2 ? '#2B2B2D' : '#4A4947'); out.rough = 0.95; out.tex = 'fabric'; out.scale = 0.18; break;
      case 'accent': // saturated upholstery reads better as a muted velvet of the same hue
        out.color.setHSL(hsl.h, Math.min(hsl.s * 0.55, 0.45), Math.min(Math.max(hsl.l, 0.22), 0.45)); out.rough = 0.85; out.tex = 'fabric'; out.scale = 0.18; break;
      case 'rug': out.color.set('#E2D9CB'); out.rough = 1; out.tex = 'rug'; out.scale = 1.2; break;
    }
    return out;
  }
  function proposal(b) {
    var c = new THREE.Color(b.color), hsl = {}; c.getHSL(hsl);
    var out = finish(nameKind(lookOf(b)) || colourKind(hsl), c, hsl);
    out.hsl = hsl; return out;
  }
  // Generated textures: light, near-neutral, so the proposed colour tints them.
  function grain(c, n, r) {
    c.fillStyle = '#efe7dc'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 220; i++) { // long fibres with slow waves, some darker growth rings
      var y = r() * n, dark = r() < 0.25; c.strokeStyle = 'rgba(60,40,25,' + (dark ? 0.18 + r() * 0.12 : 0.04 + r() * 0.08) + ')';
      c.lineWidth = dark ? 1.5 + r() * 2.5 : 0.6 + r() * 1.2; c.beginPath(); c.moveTo(0, y);
      for (var x = 0; x <= n; x += 32) c.lineTo(x, y + Math.sin(x / 140 + i * 0.7) * 9 + Math.sin(x / 37 + i) * 1.5);
      c.stroke();
    }
    for (var k = 0; k < 3; k++) { // a few knots
      var kx = r() * n, ky = r() * n; c.strokeStyle = 'rgba(60,40,25,.22)';
      for (var j = 1; j < 6; j++) { c.beginPath(); c.ellipse(kx, ky, j * 5, j * 2, 0, 0, Math.PI * 2); c.stroke(); }
    }
  }
  function weave(c, n, r) {
    c.fillStyle = '#f2eee8'; c.fillRect(0, 0, n, n);
    for (var y = 0; y < n; y += 3) { c.fillStyle = 'rgba(0,0,0,' + (0.03 + r() * 0.04) + ')'; c.fillRect(0, y, n, 1.5); }
    for (var x = 0; x < n; x += 3) { c.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.03) + ')'; c.fillRect(x, 0, 1.5, n); }
    for (var i = 0; i < 9000; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',.06)'; c.fillRect(r() * n, r() * n, 2, 2); } // slub
  }
  function speckle(c, n, r) { // honed travertine / terrazzo
    c.fillStyle = '#eeeae3'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 2600; i++) {
      var g = 120 + r() * 100 | 0; c.fillStyle = 'rgba(' + g + ',' + (g - 8) + ',' + (g - 18) + ',' + (0.15 + r() * 0.35) + ')';
      c.beginPath(); c.arc(r() * n, r() * n, 0.8 + r() * 3, 0, Math.PI * 2); c.fill();
    }
    for (var k = 0; k < 18; k++) { c.fillStyle = 'rgba(170,160,145,.12)'; c.fillRect(0, r() * n, n, 2 + r() * 6); } // travertine banding
  }
  function wool(c, n, r) { // hand-tufted rug: soft field with a quiet lattice
    c.fillStyle = '#f1ece3'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 26000; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',.05)'; c.fillRect(r() * n, r() * n, 2.5, 2.5); }
    c.strokeStyle = 'rgba(110,100,85,.18)'; c.lineWidth = 6;
    for (var d = -n; d < n * 2; d += n / 4) {
      c.beginPath(); c.moveTo(d, 0); c.lineTo(d + n, n); c.stroke();
      c.beginPath(); c.moveTo(d + n, 0); c.lineTo(d, n); c.stroke();
    }
  }
  function procFor(kind) {
    if (!procTex[kind]) {
      var c = document.createElement('canvas'); c.width = c.height = 512;
      ({ wood: grain, fabric: weave, stone: speckle, rug: wool })[kind](c.getContext('2d'), 512, rng({ wood: 11, fabric: 13, stone: 17, rug: 19 }[kind]));
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      procTex[kind] = t;
    }
    return procTex[kind];
  }
  // World-space texture projection blended by the face's normal (works without UVs).
  function triplanar(mat, tex, sx, sy) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.triMap = { value: tex }; sh.uniforms.triScale = { value: new THREE.Vector2(1 / sx, 1 / sy) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nuniform sampler2D triMap;\nuniform vec2 triScale;')
        .replace('#include <map_fragment>', [
          'vec3 triN = abs(normalize(cross(dFdx(vTriPos), dFdy(vTriPos))));',
          'vec3 triW = pow(triN, vec3(4.0)); triW /= (triW.x + triW.y + triW.z);',
          'vec4 triT = texture2D(triMap, vTriPos.zy * triScale) * triW.x + texture2D(triMap, vTriPos.xz * triScale) * triW.y + texture2D(triMap, vTriPos.xy * triScale) * triW.z;',
          'diffuseColor *= sRGBToLinear(triT);'].join('\n'));
    };
    mat.customProgramCacheKey = function () { return 'triplanar'; };
    mat.extensions = { derivatives: true };
    return mat;
  }
  function makeMaterial(p, smooth) {
    var mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.rough, metalness: p.metal, flatShading: !smooth,
      envMapIntensity: p.metal ? 1 : 0.7, side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
    furnMats.push({ mat: mat, p: p });
    return p.tex ? triplanar(mat, procFor(p.tex), p.scale, p.scale) : mat;
  }
  /* Interior palettes: with a finish scheme chosen, the furniture is dressed to match it rather
     than keeping a mix of Revit colours. Each proposed kind maps to a slot of the palette, the
     original lightness choosing between light/dark variants, so bedding stays lighter than a
     headboard and cushions stay darker than a sofa. 'revit' keeps the per-piece proposal. */
  var furnMats = [];
  var PALETTES = {
    classic: { woodL: '#B08A64', woodD: '#5A3A26', fabL: '#EFE8DC', fabM: '#CDBFA8', fabD: '#6B5A4A', accent: '#7A5C3A', metal: '#B8955A', rug: '#E7DCC8' },
    warm: { woodL: '#C29B72', woodD: '#7A5235', fabL: '#ECE4D6', fabM: '#C9B79C', fabD: '#7B5E4B', accent: '#B5654A', metal: '#2A2A2A', metalRough: 0.45, rug: '#D9C7AE' },
    calm: { woodL: '#B3A898', woodD: '#4A4440', fabL: '#E9E7E3', fabM: '#B9B6B0', fabD: '#55565A', accent: '#22324A', metal: '#B8BABC', rug: '#CDCAC4' }
  };
  function paletteFor(p, pal) {
    var l = p.hsl && p.hsl.l != null ? p.hsl.l : 0.5;
    switch (p.kind) {
      case 'wood': return { color: l > 0.45 ? pal.woodL : pal.woodD };
      case 'fabric': return { color: l > 0.82 ? pal.fabL : pal.fabM };
      case 'charcoal': return { color: pal.fabD };
      case 'accent': return { color: pal.accent };
      case 'metal': return { color: pal.metal, rough: pal.metalRough || 0.3 };
      case 'rug': return { color: pal.rug };
    }
    return null;
  }
  function dressFurniture(scheme) {
    var pal = PALETTES[scheme];
    furnMats.forEach(function (f) {
      var v = pal ? paletteFor(f.p, pal) : null;
      f.mat.color.set(v ? v.color : f.p.color);
      f.mat.roughness = v && v.rough != null ? v.rough : f.p.rough;
    });
  }
  function lookMaterial(b, smooth) {
    if (!PROPOSE[b.grp]) return new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85, flatShading: true, envMapIntensity: 0.75,
      side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
    return makeMaterial(proposal(b), smooth);
  }

  /* Furniture geometry: rugs (thin horizontal pieces lying on a floor) are split off and dressed
     as wool; the rest gets smooth shading with a 35-degree crease, so cushions, chairs and plants
     read as soft forms while box edges stay crisp. */
  var COS_CREASE = Math.cos(35 * Math.PI / 180), WET = { wet: 1 };
  function furnParts(g) {
    var p = g.attributes.position.array, idx = g.index.array, k = MESH.step / 1000, oy = MESH.origin[1] / 1000;
    var floors = D.levels.map(function (L) { return L.elevation + (L._slabTop || 0); });
    function onFloor(y) { for (var i = 0; i < floors.length; i++) if (y >= floors[i] - 0.01 && y <= floors[i] + 0.04) return true; return false; }
    var keep = [], rug = [], wet = [], ox = MESH.origin[0] / 1000, oz = MESH.origin[2] / 1000;
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (onFloor(p[a * 3 + 1] * k + oy) && onFloor(p[b * 3 + 1] * k + oy) && onFloor(p[c * 3 + 1] * k + oy)) { rug.push(a, b, c); continue; }
      // pieces standing in bathrooms/WCs are sanitary ware: porcelain, not fabric
      var cx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3 * k + ox, cy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3 * k + oy, cz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3 * k + oz;
      (roomAt(cx - CX, cy, cz + CY, WET) ? wet : keep).push(a, b, c);
    }
    var rugGeo = null;
    if (rug.length >= 6) { rugGeo = new THREE.BufferGeometry(); rugGeo.setAttribute('position', g.attributes.position); rugGeo.setIndex(rug); }
    return { main: keep.length ? creased(p, keep) : null, rug: rugGeo, wet: wet.length ? creased(p, wet) : null };
  }
  function creased(p, idx) {
    var F = idx.length / 3, nv = p.length / 3, fn = new Float32Array(F * 3);
    for (var f = 0; f < F; f++) {
      var a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      fn[f * 3] = uy * vz - uz * vy; fn[f * 3 + 1] = uz * vx - ux * vz; fn[f * 3 + 2] = ux * vy - uy * vx; // area-weighted
    }
    var start = new Uint32Array(nv + 1), list = new Uint32Array(idx.length);
    for (var i = 0; i < idx.length; i++) start[idx[i] + 1]++;
    for (i = 0; i < nv; i++) start[i + 1] += start[i];
    var fill = start.slice(0, nv);
    for (i = 0; i < idx.length; i++) list[fill[idx[i]]++] = (i / 3) | 0;
    var pos = new Int16Array(idx.length * 3), nrm = new Float32Array(idx.length * 3);
    for (f = 0; f < F; f++) {
      var fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
      for (var corner = 0; corner < 3; corner++) {
        var v = idx[f * 3 + corner], sx = 0, sy = 0, sz = 0;
        for (var j = start[v]; j < start[v + 1]; j++) {
          var g2 = list[j], gx = fn[g2 * 3], gy = fn[g2 * 3 + 1], gz = fn[g2 * 3 + 2];
          if ((fx * gx + fy * gy + fz * gz) / (fl * (Math.hypot(gx, gy, gz) || 1)) >= COS_CREASE) { sx += gx; sy += gy; sz += gz; }
        }
        var sl = Math.hypot(sx, sy, sz) || 1, o = (f * 3 + corner) * 3;
        pos[o] = p[v * 3]; pos[o + 1] = p[v * 3 + 1]; pos[o + 2] = p[v * 3 + 2];
        nrm[o] = sx / sl; nrm[o + 1] = sy / sl; nrm[o + 2] = sz / sl;
      }
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    return out;
  }

  if (MESH) loadMesh();

  home(); cam.t.copy(goal.t);
  applyLevel(); applyNight(); renderUI(); resize(); frame();
})();
