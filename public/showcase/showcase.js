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
      facts: 'بيانات المشروع', rooms: 'الفراغات', scenes: 'مشاهد جاهزة', finishes: 'اقتراح الخامات', doorWood: 'خشب الأبواب', realFurn: 'فرش واقعي بنفس توزيع الموديل', ceiling: 'تصميم السقف والإضاءة', scene: 'مشهد', outside: 'خارجي', near: 'قرب', total: 'مجموع الفراغات',
      built: 'المساحة المبنية م²', plot: 'مساحة الأرض م²', beds: 'غرف نوم', baths: 'حمامات',
      floors: 'طوابق', ft: 'قدم²', m: 'م²', cta: 'تواصل مع نطاق',
      hint: 'اسحب للدوران · العجلة للتقريب · اضغط على فراغ للتركيز',
      walkHint: 'اسحب للنظر حولك · اضغط على الحلقة الذهبية في الأرض للانتقال إليها', inRoom: 'أنت في', eyeH: 'ارتفاع النظر', lens: 'العدسة', pace: 'سرعة المشي', bob: 'حركة طبيعية للرأس', ao: 'ظلال واقعية (جودة عالية)', mUnit: 'م', mm: 'مم', ms: 'م/ث',
      foot: 'المجسّم للتوضيح فقط. المساحات والأبعاد المعتمدة هي الواردة في المخططات الموقّعة.' },
    en: { k: 'Interactive viewing', sample: 'Sample model', night: 'Night', day: 'Day', lang: 'ع',
      rotate: 'Rotate', walk: 'Walk', doll: 'Dollhouse', plan: 'Floor plan', walls: 'Full walls', reset: 'Reset', furn: 'Furniture',
      loading: 'Loading model…',
      facts: 'Project facts', rooms: 'Spaces', scenes: 'Ready views', finishes: 'Finish options', doorWood: 'Door wood', realFurn: 'Realistic furniture in the model layout', ceiling: 'Ceiling and lighting', scene: 'View', outside: 'Outside', near: 'near', total: 'Spaces total',
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
  var S = { lang: 'ar', night: false, level: Math.max(firstRooms, 0), full: false, furn: true, walk: false, finish: 'classic', ceil: 'spots', realFurn: true, doorWood: 'white', eye: 1.6, lens: 24, pace: 1.4, bob: true, ao: false, auto: false, sel: null, hover: null };
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
  var PR_MAX = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR_MAX);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun and the building do not move: redraw on change only
  var shadowDirty = true;
  function dirtyShadow() { shadowDirty = true; }
  if (D.mesh) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82; }
  // Section plane: everything above it is cut away, like a Revit plan cut / section box top.
  renderer.localClippingEnabled = true;
  var cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  var meshGroups = {}, noteLbls = [], edgeQueue = [], capMat = null;
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
  // Window light indoors: a soft directional light without shadows, from high and to one side.
  // Indoors the sun is blocked by the roof, so without it every surface gets the same even light
  // and furniture reads flat; with it each face of a piece is lit differently (form, depth), at no
  // cost and with no noise. Walk mode, daytime only.
  var keyLight = new THREE.DirectionalLight(0xFFF4E6, 0); keyLight.position.set(-0.55, 1, 0.35); scene.add(keyLight);
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
    if (capMat) capMat.visible = !S.walk;
    cutPlane.constant = S.walk ? 1e6 : S.full ? (next ? next.elevation - 0.45 : 1e6) : L.elevation + (L._slabTop || 0) + CUT;
    if (meshGroups.furn) meshGroups.furn.visible = S.furn;
    applyRealFurniture();
    goal.t.y = levelY();
    dirtyShadow();
  }
  // Sky light from the environment reaches every interior surface equally; in walk mode it is
  // turned down so light comes through the windows (sun, sky) and contrast returns.
  var envK = 1;
  function envScale(k) {
    if (k === envK) return; envK = k;
    scene.traverse(function (o) {
      if (!o.isMesh || !o.material || o.material === glassMat || !o.material.isMeshStandardMaterial) return;
      var m2 = o.material; if (m2.userData.env0 == null) m2.userData.env0 = m2.envMapIntensity;
      m2.envMapIntensity = m2.userData.env0 * k;
    });
  }
  var lastWalkL = null;
  function applyNight() {
    $('app').classList.toggle('night', S.night);
    hemi.intensity = S.night ? 0.16 : (MESH ? 0.6 : 0.85); sun.intensity = S.night ? 0.05 : (MESH ? 0.9 : 0.75);
    hemi.color.set(S.night ? 0x7f93c9 : 0xffffff); lamps.visible = S.night && !MESH;
    if (MESH) {
      scene.environment = S.night ? ENV.night : ENV.day; paintSky();
      hemi.intensity = S.night ? 0.08 : (S.walk ? 0.14 : 0.22);
      keyLight.intensity = S.walk && !S.night ? 0.75 : 0; sun.intensity = S.night ? 0.03 : (S.walk ? 1.9 : 1.25);
      if (S.walk && !S.night) { hemi.color.set(0xE6ECF2); hemi.groundColor.set(0xF2EADF); } // sky above, light bouncing up from the floors
      else hemi.groundColor.set(0xcfc8bb);
      renderer.toneMappingExposure = S.walk ? (S.night ? 1.0 : 0.84) : 0.82;
      envScale(S.walk ? 0.5 : 1);
      if (meshReady) { applyCeiling(); queueGlassEnv(); }
      lightCeilings();
      if (bedGlow) bedGlow.opacity = S.night ? 0.85 : 0.28;
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
  var composer = null, ssao = null, bloom = null, fxaa = null;
  // Final grade: a touch of warmth, contrast and saturation, and a soft vignette.
  var GRADE = {
    uniforms: { tDiffuse: { value: null }, vig: { value: 0.3 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: ['uniform sampler2D tDiffuse; uniform float vig; varying vec2 vUv;',
      'void main() { vec4 c = texture2D(tDiffuse, vUv); vec3 x = c.rgb * vec3(1.02, 1.0, 0.975);',
      'float l = dot(x, vec3(0.299, 0.587, 0.114)); x = mix(vec3(l), x, 1.1);',
      'x = mix(x, x * x * (3.0 - 2.0 * x), 0.32); vec2 d = vUv - 0.5; x *= 1.0 - vig * dot(d, d) * 1.5;',
      'gl_FragColor = vec4(clamp(x, 0.0, 1.0), c.a); }'].join('\n')
  };
  // Walk mode post-processing: full-resolution render, ambient occlusion computed at HALF
  // resolution from a normals+depth pass and multiplied over it (one extra scene draw, a quarter of
  // the shading cost of full-resolution SSAO), bloom at night, grade, gamma, FXAA. The AO switch
  // (on by default, turned off automatically on slow devices) removes the AO step.
  var compLite = null, compAO = null, aoHalf = null;
  var AO_MIX = {
    uniforms: { tDiffuse: { value: null }, tAO: { value: null }, strength: { value: 1.0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform float strength; varying vec2 vUv;\nvoid main() { vec4 c = texture2D(tDiffuse, vUv); float ao = texture2D(tAO, vUv).r; float oc = max(0.0, (1.0 - ao) - 0.12) / 0.88; gl_FragColor = vec4(c.rgb * (1.0 - oc * strength), c.a); }'
  };
  function halfAOPass() {
    var sa = new THREE.SSAOPass(scene, camera, 2, 2);
    sa.kernelRadius = 0.2; sa.minDistance = 0.0006; sa.maxDistance = 0.003; // ignore tiny depth steps: flat floors stay clean
    sa.normalMaterial.flatShading = true; sa.normalMaterial.needsUpdate = true;
    var dt = new THREE.DepthTexture(); dt.type = renderer.capabilities.isWebGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType; // 16-bit depth blotches flat floors
    sa.normalRenderTarget.depthTexture = dt; sa.ssaoMaterial.uniforms.tDepth.value = dt; // depth from the normals pass: no beauty pass
    var mix = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AO_MIX.uniforms), vertexShader: AO_MIX.vertexShader, fragmentShader: AO_MIX.fragmentShader });
    var FSQ = (THREE.Pass && THREE.Pass.FullScreenQuad) || THREE.FullScreenQuad, quad = new FSQ(mix);
    var pass = Object.assign(Object.create(THREE.Pass.prototype), { enabled: true, needsSwap: true, clear: false, renderToScreen: false });
    pass.render = function (r, writeBuffer, readBuffer) {
      var u = sa.ssaoMaterial.uniforms;
      u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
      u.cameraProjectionMatrix.value.copy(camera.projectionMatrix); u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      sa.renderOverride(r, sa.normalMaterial, sa.normalRenderTarget, 0x7777ff, 1.0);
      sa.renderPass(r, sa.ssaoMaterial, sa.ssaoRenderTarget);
      sa.renderPass(r, sa.blurMaterial, sa.blurRenderTarget);
      // a second blur (back into the ssao target) so the sampling noise cannot show as clouds
      mix.uniforms.tDiffuse.value = readBuffer.texture; mix.uniforms.tAO.value = sa.blurRenderTarget.texture;
      r.setRenderTarget(this.renderToScreen ? null : writeBuffer); quad.render(r);
    };
    pass.setSize = function (w, h) { sa.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2))); };
    pass.sa = sa;
    return pass;
  }
  function buildComposer(withAO) {
    var c = new THREE.EffectComposer(renderer);
    c.addPass(new THREE.RenderPass(scene, camera));
    if (withAO && THREE.SSAOPass && THREE.Pass && ((THREE.Pass && THREE.Pass.FullScreenQuad) || THREE.FullScreenQuad)) { aoHalf = halfAOPass(); c.addPass(aoHalf); }
    var bl = THREE.UnrealBloomPass ? new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.55, 0.88) : null;
    if (bl) c.addPass(bl);
    c.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    c.addPass(new THREE.ShaderPass(GRADE));
    var fx = THREE.FXAAShader ? new THREE.ShaderPass(THREE.FXAAShader) : null; if (fx) c.addPass(fx);
    c._bloom = bl; c._fxaa = fx;
    return c;
  }
  function useAO() {
    if (!S.walk || !MESH || !THREE.EffectComposer || !THREE.RenderPass) return false;
    if (S.ao) { if (!compAO) { compAO = buildComposer(true); composer = compAO; sizeAO(); } composer = compAO; }
    else { if (!compLite) { compLite = buildComposer(false); composer = compLite; sizeAO(); } composer = compLite; }
    bloom = composer._bloom; fxaa = composer._fxaa;
    if (bloom) bloom.enabled = S.night; // daytime bloom costs more than it adds
    return true;
  }
  function sizeAO() {
    if (!composer) return;
    var w = stage.clientWidth, h = stage.clientHeight, r = renderer.getPixelRatio();
    [compLite, compAO].forEach(function (c) { if (!c) return; c.setPixelRatio(r); c.setSize(w, h); if (c._fxaa) c._fxaa.material.uniforms.resolution.value.set(1 / (w * r), 1 / (h * r)); });
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
      cb.onchange = function () { S[o[0]] = cb.checked; if (o[0] === 'ao') aoAuto = false; };
      if (o[0] === 'ao') aoBox = cb;
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
  if (/[?&]debug(&|$)/.test(location.search)) window.__walk = { W: W, blockedAt: blockedAt, floorAt: floorAt, solids: function () { return solids; }, doors: function () { return leafPivots; }, place: function (x, z) { return placeWalker(x, z); }, scene: scene, groups: meshGroups, cx: CX, cy: CY, orbit: function (x, y, h, r, th, ph) { goal.t.copy(P(x, y, h)); goal.r = r; goal.th = th; goal.ph = ph; }, frame: function (eye, at) { if (S.walk !== lastWalkL && meshReady) { lastWalkL = S.walk; applyNight(); } if (sky) sky.visible = S.walk; mirrorGroup.visible = S.walk; renderer.setSize(1200, 800, false); camera.aspect = 1.5; applyLens(); sizeAO(); renderer.shadowMap.needsUpdate = true; camera.position.copy(eye); camera.lookAt(at); camera.updateMatrixWorld(); if (useAO()) composer.render(); else renderer.render(scene, camera); var url = renderer.domElement.toDataURL('image/jpeg', 0.85); resize(); return url; }, interior: function () { return { spots: spots, cove: coveGroup.children.map(function (c) { return c.count; }), finish: finishMeshes.map(function (f) { return f.kind; }) }; } };
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
  // Keep walking smooth and as good as the device allows. Every 3 s of walking: with frames
  // fast (median under 12 ms) ambient occlusion is tried; if frames then run slow (over 30 ms)
  // it is switched off for the visit; slower still lowers the render resolution one step.
  // Touching the AO switch hands the choice to the visitor.
  var perfT = 0, perfF = [], aoAuto = true, aoBlocked = false, aoBox = null;
  function perfWatch(dt) {
    if (!S.walk) { perfT = 0; perfF = []; return; }
    perfT += dt; perfF.push(dt);
    if (perfT < 3) return;
    perfF.sort(function (a, b) { return a - b; });
    var med = perfF[perfF.length >> 1], pr = renderer.getPixelRatio();
    if (aoAuto && S.ao && med > 0.03) { S.ao = false; aoBlocked = true; }
    else if (med > 0.045 && pr > 0.75) { renderer.setPixelRatio(Math.max(0.75, pr - 0.25)); resize(); }
    if (aoBox) aoBox.checked = S.ao;
    perfT = 0; perfF = [];
  }
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
    mirrorGroup.visible = S.walk;
    if (S.walk !== lastWalkL && meshReady) { lastWalkL = S.walk; applyNight(); }
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    if (S.walk) { // a mirror is rendered only when the visitor stands in front of it, the nearest one
      var near = null, nd = 3.2;
      mirrorGroup.children.forEach(function (m) {
        m.visible = false; var dx = camera.position.x - m.position.x, dz = camera.position.z - m.position.z, dy = camera.position.y - m.position.y;
        var dd = Math.sqrt(dx * dx + dy * dy + dz * dz), f = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
        if (dd < nd && f.x * dx + f.y * dy + f.z * dz > 0) { nd = dd; near = m; }
      });
      if (near) near.visible = true;
    }
    perfWatch(dt);
    if (useAO()) { if (bloom) bloom.strength = 0.75; composer.render(); } else renderer.render(scene, camera);
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
  /* Outline edges: only real corners, i.e. edges shared by exactly two faces that meet at more
     than `deg` degrees. THREE.EdgesGeometry also draws every edge with a single face, which in
     Revit meshes includes the diagonals of faces split around openings (their triangles do not
     share vertices across the split): those showed as stray diagonal lines on floors and walls
     near doors. Vertices are matched by their (integer) position, so split pieces still join. */
  function creaseEdges(g, deg) {
    var p = g.attributes.position.array, idx = g.index ? g.index.array : null, n = idx ? idx.length : p.length / 3;
    var ids = new Map(), vid = new Int32Array(p.length / 3), next = 0;
    for (var v = 0; v < p.length / 3; v++) {
      var key = p[v * 3] + ',' + p[v * 3 + 1] + ',' + p[v * 3 + 2], id = ids.get(key);
      if (id === undefined) { id = next++; ids.set(key, id); }
      vid[v] = id;
    }
    var fn = new Float32Array(n), edges = new Map(), cos = Math.cos(deg * Math.PI / 180), out = [];
    for (var t = 0; t < n; t += 3) {
      var a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
      var ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
      var wx = p[c * 3] - p[a * 3], wy = p[c * 3 + 1] - p[a * 3 + 1], wz = p[c * 3 + 2] - p[a * 3 + 2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
      fn[t] = nx / l; fn[t + 1] = ny / l; fn[t + 2] = nz / l;
      [[a, b], [b, c], [c, a]].forEach(function (e) {
        var i = vid[e[0]], j = vid[e[1]];
        if (i === j) return;
        var k = i < j ? i * 4194304 + j : j * 4194304 + i, rec = edges.get(k);
        if (!rec) edges.set(k, rec = { a: e[0], b: e[1], f: [] });
        rec.f.push(t);
      });
    }
    edges.forEach(function (e) {
      if (e.f.length !== 2) return;
      var f0 = e.f[0], f1 = e.f[1];
      if (fn[f0] * fn[f1] + fn[f0 + 1] * fn[f1 + 1] + fn[f0 + 2] * fn[f1 + 2] > cos) return;
      out.push(p[e.a * 3], p[e.a * 3 + 1], p[e.a * 3 + 2], p[e.b * 3], p[e.b * 3 + 1], p[e.b * 3 + 2]);
    });
    if (!out.length) return null;
    var eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return eg;
  }
  var veneerMat = null, venMeshes = [];
  function loadMesh() {
    var note = $('loading'); note.hidden = false; note.textContent = T('loading');
    fetch(MESH.file).then(function (r) {
      if (!r.ok) throw new Error(r.status); return r.arrayBuffer();
    }).then(function (buf) {
      var root = new THREE.Group(), s = MESH.step / 1000, o = MESH.origin;
      root.scale.set(s, s, s); root.position.set(o[0] / 1000 - CX, o[1] / 1000, o[2] / 1000 + CY);
      // Navy poché for cut walls. It must never win against a real surface at the same depth:
      // Revit models stack elements within a millimetre (a 10 cm "wet" floor 1 mm above the slab),
      // and their undersides showed through as navy triangles. Pushed back in depth, and only
      // drawn while a section cut is active (none in walk mode).
      var cap = new THREE.MeshBasicMaterial({ color: 0x101725, side: THREE.BackSide, clippingPlanes: [cutPlane],
        polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 });
      capMat = cap;
      MESH.buckets.forEach(function (b) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Int16Array(buf, b.pos, b.verts * 3), 3));
        g.setIndex(new THREE.BufferAttribute(b.wide ? new Uint32Array(buf, b.idx, b.count) : new Uint16Array(buf, b.idx, b.count), 1));
        var grp = meshGroups[b.grp] || (meshGroups[b.grp] = new THREE.Group());
        if (!grp.parent) root.add(grp);
        var parent = b.grp === 'leaf' ? pivotFor(grp, b.door, b.hinge) : grp;
        if (b.grp === 'furn' && b.elem != null) { collectTris(b.elem, g, root); parent = elemGroup(b.elem, grp); }
        var glass = b.opacity < 1;
        if (b.grp === 'floor') addUV(g); // floor finishes are textures laid in plan
        // Glass: one reflective tinted material (Revit glass colours are often saturated cyan).
        var smooth = false;
        if (b.grp === 'furn' && !glass) { // rugs split off; the rest smooth-shaded
          var fp = furnParts(g, proposal(b).kind === 'wood', b.elem == null);
          if (fp.kit) {
            var km = new THREE.Mesh(fp.kit, lookMaterial(b, true)), kc = new THREE.Mesh(fp.kit, cap);
            km.castShadow = km.receiveShadow = true; parent.add(km, kc); kitMeshes.push(km, kc);
          }
          if (fp.top) { // kitchen worktop: white quartz with a soft vein
            var tm = new THREE.Mesh(fp.top, makeMaterial({ kind: 'quartz', color: new THREE.Color('#F1EEE8'), rough: 0.14, metal: 0, tex: 'marble', scale: 0.9 }, true));
            tm.castShadow = tm.receiveShadow = true; parent.add(tm); parent.add(new THREE.Mesh(fp.top, cap));
          }
          if (fp.ven) { // walnut boards on white lacquer casework
            var vm = new THREE.Mesh(fp.ven, veneerMat || (veneerMat = makeMaterial({ kind: 'walnut', color: new THREE.Color('#FFFFFF'), rough: 0.4, metal: 0, tex: 'walnut', scale: 1.1 }, true)));
            vm.castShadow = vm.receiveShadow = true; parent.add(vm); venMeshes.push(vm); vm.userData.lacq = lookMaterial(b, true); parent.add(new THREE.Mesh(fp.ven, cap));
          }
          if (fp.rug) {
            var rm = new THREE.Mesh(fp.rug, makeMaterial(finish('rug', new THREE.Color(b.color), {}), false));
            rm.receiveShadow = true; rm.userData.rug = true; parent.add(rm);
          }
          if (fp.wet) {
            var wc = new THREE.Color(b.color), whsl = {}; wc.getHSL(whsl);
            var pk = proposal(b).kind, wp = pk === 'metal' ? { kind: 'chrome', color: new THREE.Color('#E9E9EA'), rough: 0.08, metal: 1, tex: null, scale: 1 }
              : pk === 'black' ? proposal(b) : { kind: 'china', color: new THREE.Color('#F7F6F3'), rough: 0.1, metal: 0, tex: null, scale: 1 };
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
      buildRealFurniture();
      dressDoors();
      meshReady = true; mapLevel = -1; renderUI(); applyFinish(); dirtyShadow();
      [meshGroups.leaf, doorDetail].forEach(function (g) { if (g) g.traverse(function (o) { if (o.isMesh) o.castShadow = false; }); }); // doors swing: no shadows to redraw
      // Outline edges (like Revit's "shaded with edges"), built after the first frame is on screen.
      var edgeMat = new THREE.LineBasicMaterial({ color: 0x101725, transparent: true, opacity: 0.45, clippingPlanes: [cutPlane] });
      setTimeout(function () {
        edgeQueue.forEach(function (e) { var eg = creaseEdges(e.g, 30); if (eg) e.grp.add(new THREE.LineSegments(eg, edgeMat)); });
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
    var rec = { pivot: pivot, inner: inner, x: hg[0], y: hg[1], sign: hg[2], ang: hg[3], t: 0, door: d };
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
  var finishMeshes = [], ceilMats = [];
  function lightCeilings() { (ceilMats || []).forEach(function (m) { m.emissive.set(0xffffff); m.emissiveIntensity = S.night ? 0.03 : 0.24; }); }
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
  // Natural marble veins: a slow random walk drawn twice, a wide soft halo and a fine line, with branches.
  function veins(c, n, r, cnt, rgb, k) {
    k = k || 1;
    for (var i = 0; i < cnt; i++) {
      var x = r() * n, y = r() * n, a = r() * Math.PI * 2, pts = [[x, y]];
      for (var s2 = 0; s2 < 70; s2++) { a += (r() - 0.5) * 0.32; x += Math.cos(a) * 12; y += Math.sin(a) * 12; pts.push([x, y]); }
      var br = []; if (r() < 0.6) { var b0 = pts[(r() * 60) | 0], ba = a + (r() - 0.5) * 2, bx = b0[0], by = b0[1]; br.push([bx, by]); for (s2 = 0; s2 < 25; s2++) { ba += (r() - 0.5) * 0.4; bx += Math.cos(ba) * 10; by += Math.sin(ba) * 10; br.push([bx, by]); } }
      [[7, 0.05 * k, 'blur(5px)'], [1.4, (0.16 + r() * 0.22) * k, 'blur(0.5px)']].forEach(function (st) {
        c.filter = st[2]; c.strokeStyle = 'rgba(' + rgb + ',' + st[1] + ')';
        [pts, br].forEach(function (line, li) {
          if (line.length < 2) return; c.lineWidth = st[0] * (li ? 0.5 : 0.6 + r() * 0.8); c.beginPath();
          line.forEach(function (q, j) { c[j ? 'lineTo' : 'moveTo'](q[0], q[1]); }); c.stroke();
        });
      });
    }
    c.filter = 'none';
  }
  function marble(c, n, r) {
    c.fillStyle = '#F3F1EC'; c.fillRect(0, 0, n, n);
    var cl = c.createRadialGradient(n * 0.3, n * 0.4, 0, n * 0.3, n * 0.4, n * 0.8); cl.addColorStop(0, 'rgba(255,255,255,.35)'); cl.addColorStop(1, 'rgba(225,222,215,.25)');
    c.fillStyle = cl; c.fillRect(0, 0, n, n); // soft cloudiness
    veins(c, n, r, 16, '110,110,118');
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

  /* Wet rooms and kitchens on the walls: a plan mask per level (red = wet room, tiled full
     height; green = kitchen, a backsplash band 0.9-1.55 m) read by the wall shader 15 cm in
     front of each wall pixel, so a wall face shared by a bathroom and a bedroom is tiled only on
     the bathroom's stretch. Tiles: 60 x 120 slabs per scheme. */
  var zoneU = null, wallTiles = {};
  function zoneUniforms() {
    if (zoneU) return zoneU;
    var N = 512, cv = document.createElement('canvas'); cv.width = N * 4; cv.height = N;
    var c = cv.getContext('2d'), x0 = minX - CX - 1, z0 = -(maxY - CY) - 1, span = Math.max(maxX - minX, maxY - minY) + 2, lv = [1e5, 1e5, 1e5, 1e5];
    c.fillStyle = '#000'; c.fillRect(0, 0, N * 4, N); c.globalCompositeOperation = 'lighter';
    D.levels.slice(0, 4).forEach(function (L, i) {
      lv[i] = L.elevation + (L._slabTop || 0);
      (L.slabs || []).forEach(function (sl) {
        c.fillStyle = '#0000ff'; c.beginPath();
        sl.poly.forEach(function (q, k) { var wx = q[0] - CX, wz = -(q[1] - CY); c[k ? 'lineTo' : 'moveTo']((wx - x0) / span * N + i * N, (wz - z0) / span * N); });
        c.closePath(); c.fill();
      });
      L.rooms.forEach(function (r) {
        var col = r.type === 'wet' ? '#ff0000' : r.type === 'kitchen' ? '#00ff00' : null; if (!col || !r.poly) return;
        c.fillStyle = col; c.beginPath();
        r.poly.forEach(function (q, k) { var wx = q[0] - CX, wz = -(q[1] - CY); c[k ? 'lineTo' : 'moveTo']((wx - x0) / span * N + i * N, (wz - z0) / span * N); });
        c.closePath(); c.fill();
      });
    });
    var t = new THREE.CanvasTexture(cv); t.flipY = false; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
    zoneU = { zoneMask: { value: t }, zoneTile: { value: wallTile(S.finish) }, zonePaint: { value: new THREE.Color('#E8E0D2').convertSRGBToLinear() }, extPl: { value: procFor('plaster') }, zoneLv: { value: new THREE.Vector4(lv[0], lv[1], lv[2], lv[3]) }, zoneB: { value: new THREE.Vector4(x0, z0, span, 0) } };
    return zoneU;
  }
  function wallTile(id) {
    var style = id === 'warm' ? 'warm' : id === 'calm' ? 'calm' : 'classic';
    if (!wallTiles[style]) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 1024;
      var c = cv.getContext('2d'), r = rng(style === 'warm' ? 53 : style === 'calm' ? 59 : 47), n = 1024;
      c.fillStyle = style === 'warm' ? '#E6DCCB' : style === 'calm' ? '#D9D7D3' : '#F4F2EE'; c.fillRect(0, 0, n, n);
      var i;
      if (style === 'classic') veins(c, n, r, 18, '110,110,118');
      else if (style === 'warm') for (i = 0; i < 46; i++) { c.fillStyle = 'rgba(180,160,130,' + (0.05 + r() * 0.08) + ')'; c.fillRect(0, r() * n, n, 1 + r() * 8); }
      for (i = 0; i < 14000; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0,.025' : '255,255,255,.05') + ')'; c.fillRect(r() * n, r() * n, 1.5, 1.5); }
      c.strokeStyle = 'rgba(160,155,148,.85)'; c.lineWidth = 2.5; // 60 wide x 120 high, 2 mm joints
      for (var gx = 0; gx <= n; gx += n / 4) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, n); c.stroke(); }
      for (var gy = 0; gy <= n; gy += n / 2) { c.beginPath(); c.moveTo(0, gy); c.lineTo(n, gy); c.stroke(); }
      var t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      wallTiles[style] = t;
    }
    return wallTiles[style];
  }

  /* Exterior walls drawn the other way round in Revit export their room-side face as facade.
     Their materials learn to tell: where the point 15-30 cm in front of the face stands over a
     floor slab of that level, the face is indoors and takes the wall paint (and the wet-room or
     kitchen tiles); outward faces keep the facade material. */
  var extDone = false;
  function extInterior() {
    if (extDone || !meshGroups.ext) return; extDone = true;
    var mats = [];
    meshGroups.ext.traverse(function (o) { if (o.isMesh && o.material !== glassMat && o.material.side !== THREE.BackSide && mats.indexOf(o.material) < 0) mats.push(o.material); });
    mats.forEach(function (mat) {
      var prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
      mat.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        var Z = zoneUniforms(); Object.keys(Z).forEach(function (k) { sh.uniforms[k] = Z[k]; });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vExtPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvExtPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', ['#include <common>', 'varying vec3 vExtPos;',
          'uniform sampler2D zoneMask; uniform sampler2D zoneTile; uniform sampler2D extPl; uniform vec4 zoneLv; uniform vec4 zoneB; uniform vec3 zonePaint;',
          'float extIn = 0.0; float extTile = 0.0;'].join('\n'))
          .replace('#include <color_fragment>', ['#include <color_fragment>',
            '{ vec3 zn = normalize(cross(dFdx(vExtPos), dFdy(vExtPos))); if (dot(zn, cameraPosition - vExtPos) < 0.0) zn = -zn;',
            '  if (abs(zn.y) < 0.5) {',
            '    float li = vExtPos.y < zoneLv.y - 0.3 ? 0.0 : vExtPos.y < zoneLv.z - 0.3 ? 1.0 : vExtPos.y < zoneLv.w - 0.3 ? 2.0 : 3.0;',
            '    float fy = li < 0.5 ? zoneLv.x : li < 1.5 ? zoneLv.y : li < 2.5 ? zoneLv.z : zoneLv.w;',
            '    vec2 zp = vExtPos.xz + zn.xz * 0.3, zq = vExtPos.xz + zn.xz * 0.15;',
            '    vec4 zm = texture2D(zoneMask, vec2(((zp.x - zoneB.x) / zoneB.z + li) * 0.25, (zp.y - zoneB.y) / zoneB.z));',
            '    vec4 zr = texture2D(zoneMask, vec2(((zq.x - zoneB.x) / zoneB.z + li) * 0.25, (zq.y - zoneB.y) / zoneB.z));',
            '    extIn = step(0.5, zm.b); float hy = vExtPos.y - fy;',
            '    extTile = extIn * max(step(0.5, zr.r), step(0.5, zr.g) * step(0.9, hy) * step(hy, 1.55));',
            '    vec3 tn = pow(abs(zn), vec3(4.0)); tn /= (tn.x + tn.y + tn.z);',
            '    vec4 pl = texture2D(extPl, vExtPos.zy / 1.6) * tn.x + texture2D(extPl, vExtPos.xz / 1.6) * tn.y + texture2D(extPl, vExtPos.xy / 1.6) * tn.z;',
            '    vec4 zt = texture2D(zoneTile, vExtPos.zy / 2.4) * tn.x + texture2D(zoneTile, vExtPos.xz / 2.4) * tn.y + texture2D(zoneTile, vExtPos.xy / 2.4) * tn.z;',
            '    diffuseColor.rgb = mix(diffuseColor.rgb, zonePaint * sRGBToLinear(pl).rgb, extIn);',
            '    diffuseColor.rgb = mix(diffuseColor.rgb, sRGBToLinear(zt).rgb, extTile);',
            '  } }'].join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, extIn); roughnessFactor = mix(roughnessFactor, 0.14, extTile);');
      };
      mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + 'extin'; };
      mat.extensions = { derivatives: true };
      mat.needsUpdate = true;
    });
  }
  var SCHEMES = [
    { id: 'revit', ar: 'كما في الموديل', en: 'As modelled', arD: 'خامات Revit الحالية', enD: 'The current Revit materials' },
    { id: 'classic', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.12 }, ar: 'كلاسيك فاخر', en: 'Classic luxury', floor: [marble, 2.4], wall: '#E8E0D2', ceil: '#FFFFFF', sw: ['#F3F1EC', '#E8E0D2', '#C9A25D'],
      arD: 'أرضيات رخام أبيض بعروق رمادية 120×120 مصقول · دهان أوف وايت دافئ مطفي · أسقف جبس بيضاء · الحمامات والمطبخ: بورسلين 60×60 وسيراميك جدران 30×60', enD: 'Polished white veined marble 120×120 · warm ivory paint · white gypsum ceilings · wet areas and kitchen: porcelain 60×60, ceramic wall tiles 30×60' },
    { id: 'warm', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.45 }, ar: 'مودرن دافئ', en: 'Warm modern', floor: [oak, 2.4], wall: '#DDD5C8', ceil: '#FFFFFF', sw: ['#C9A57A', '#DDD5C8', '#FFFFFF'],
      arD: 'باركيه بلوط فاتح 20×120 · دهان بيج رمادي (Greige) · سقف أبيض مكسور', enD: 'Light oak planks 20×120 · greige paint · off-white ceilings' },
    { id: 'calm', zoneFloor: [porcelainSmall, 1.2], zoneWall: [ceramic, 1.2], rough: { floor: 0.35 }, ar: 'هادئ محايد', en: 'Calm neutral', floor: [porcelain, 2.4], wall: '#E7E5E0', ceil: '#FFFFFF', sw: ['#DAD7D1', '#E7E5E0', '#6E7787'],
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
      else if (typeof v === 'string') {
        mat.color.set(v); mat.map = null;
        if (!mat.userData.surface && (f.kind === 'wall' || f.kind === 'ceil')) { // once: a quiet surface texture
          triplanar(mat, procFor(f.kind === 'wall' ? 'plaster' : 'gypsum'), 1.6, 1.6, f.kind === 'wall' ? 0.3 : 0.2, f.kind === 'wall');
          mat.flatShading = true; mat.userData.surface = true; mat.needsUpdate = true;
          if (f.kind === 'ceil') ceilMats.push(mat);
        }
      }
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
    applyTrim(sc); lightCeilings();
    if (MESH) { zoneUniforms().zoneTile.value = wallTile(sc.id); if (typeof sc.wall === 'string') zoneUniforms().zonePaint.value.set(sc.wall).convertSRGBToLinear(); extInterior(); }
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
    renderDoorWood();
    var old = fins.parentNode.querySelector('.realfurn'); if (old) old.remove();
    if (D.furniture && D.furniture.length) {
      var lab = document.createElement('label'), cb = document.createElement('input');
      lab.className = 'realfurn'; cb.type = 'checkbox'; cb.checked = S.realFurn;
      cb.onchange = function () { S.realFurn = cb.checked; applyRealFurniture(); };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + T('realFurn'))); fins.parentNode.insertBefore(lab, fins);
    }
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
    color: 0x14201D, metalness: 0.0, roughness: 0.02, transparent: true, opacity: 1, envMapIntensity: 2.2, flatShading: true,
    depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [cutPlane] }) : null;
  if (glassMat) {
    glassMat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', [
        'float glassF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);',
        // what passes through is dimmed and tinted a little; what is reflected is added on top
        'float glassA = mix(0.12, 0.85, glassF);',
        'gl_FragColor = vec4( min(outgoingLight / glassA, vec3(4.0)), glassA );'].join('\n'));
    };
    glassMat.customProgramCacheKey = function () { return 'fresnel-glass'; };
  }
  // The house reflected in its own glass: a cube map captured once in the main living space (again
  // when day turns to night), used only by the glass.
  var glassCube = null, glassCam = null, glassTimer = null;
  function captureGlassEnv() {
    if (!glassMat || !MESH || !meshReady) return;
    if (!glassCube) { glassCube = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); glassCam = new THREE.CubeCamera(0.1, 120, glassCube); scene.add(glassCam); }
    var L = D.levels[S.level] || D.levels[0], fy = L.elevation + (L._slabTop || 0), at = null;
    var n = (L.notes || []).filter(function (q) { return /living|majlis|family/i.test(q.name || ''); })[0];
    if (n) at = P(n.x, n.y); else { var big = L.rooms.slice().sort(function (a, b) { return b.area - a.area; })[0]; if (big) at = P(big._c[0], big._c[1]); }
    if (!at) return;
    glassCam.position.set(at.x, fy + 1.5, at.z);
    var gv = glassMat.visible, mv = mirrorGroup.visible, sv = sky ? sky.visible : false;
    glassMat.visible = false; mirrorGroup.visible = false; if (sky) sky.visible = true;
    glassCam.update(renderer, scene);
    glassMat.visible = gv; mirrorGroup.visible = mv; if (sky) sky.visible = sv;
    glassMat.envMap = glassCube.texture; glassMat.needsUpdate = true;
  }
  function queueGlassEnv() { clearTimeout(glassTimer); glassTimer = setTimeout(captureGlassEnv, 700); }
  // Sky dome seen through the windows in walk mode (day or night), and a ground beyond the site.
  var sky = null;
  if (MESH) {
    var skyGeo = new THREE.SphereGeometry(140, 32, 16), skyCol = [], sp = skyGeo.attributes.position;
    for (var si = 0; si < sp.count; si++) skyCol.push(0, 0, 0);
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
    sky = new THREE.Group();
    sky.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false })));
    // a ring, so it never cuts through a basement under the house
    var groundM = new THREE.Mesh(new THREE.RingGeometry(SIZE * 0.9, 140, 64), new THREE.MeshStandardMaterial({ color: 0x9BA488, roughness: 1 }));
    groundM.rotation.x = -Math.PI / 2; groundM.position.y = -0.05; groundM.receiveShadow = true; sky.add(groundM);
    sky.visible = false; scene.add(sky);
  }
  var skyTex = {};
  function skyPanorama(night) {
    var W = 2048, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), r = rng(night ? 5 : 3), hz = H * 0.5;
    var g = c.createLinearGradient(0, 0, 0, hz);
    if (night) { g.addColorStop(0, '#050913'); g.addColorStop(0.7, '#0E1628'); g.addColorStop(1, '#2A2C3A'); }
    else { g.addColorStop(0, '#3F7FC0'); g.addColorStop(0.55, '#8DB7DE'); g.addColorStop(1, '#DDE7EE'); }
    c.fillStyle = g; c.fillRect(0, 0, W, hz);
    if (night) { for (var i = 0; i < 900; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')'; c.fillRect(r() * W, r() * hz * 0.8, 1.2, 1.2); } }
    else for (var k = 0; k < 70; k++) { // soft cumulus banks, flatter toward the horizon
      var y = hz * (0.15 + r() * 0.7), sx = 60 + r() * 220, sy = sx * (0.18 + 0.25 * (1 - y / hz)), x = r() * W;
      for (var j = 0; j < 6; j++) {
        var px = x + (r() - 0.5) * sx * 1.6, py = y + (r() - 0.5) * sy, gr = c.createRadialGradient(px, py, 0, px, py, sx * 0.6);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + r() * 0.3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.save(); c.translate(px, py); c.scale(1, sy / sx); c.translate(-px, -py); c.beginPath(); c.arc(px, py, sx * 0.6, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    // distant skyline: low rooftops and palm / tree canopies, hazier with distance
    [[0.55, night ? '#1A2030' : '#B7C0C4', 18], [0.8, night ? '#141925' : '#98A49A', 26]].forEach(function (L) {
      c.fillStyle = L[1]; c.beginPath(); c.moveTo(0, hz);
      var blk = 0, bh = 0;
      for (var x = 0; x <= W; x += 6) {
        var h = L[2] * (0.4 + 0.6 * Math.abs(Math.sin(x / 37 + L[0] * 9) * Math.sin(x / 113 + L[0] * 3)));
        if (x >= blk) { blk = x + 40 + r() * 140; bh = r() < 0.45 ? L[2] * (0.5 + r() * 0.6) : 0; } // flat-roofed buildings
        c.lineTo(x, hz - Math.max(h, bh) * L[0] * 1.1);
      }
      c.lineTo(W, hz); c.closePath(); c.fill();
    });
    if (night) for (i = 0; i < 260; i++) { c.fillStyle = 'rgba(255,' + (190 + r() * 50 | 0) + ',120,' + (0.4 + r() * 0.5) + ')'; c.fillRect(r() * W, hz - r() * 26, 1.6, 1.6); }
    var gg = c.createLinearGradient(0, hz, 0, H); // ground beyond the site
    gg.addColorStop(0, night ? '#1B1D24' : '#A9B096'); gg.addColorStop(1, night ? '#08090C' : '#7E8770');
    c.fillStyle = gg; c.fillRect(0, hz, W, H - hz);
    var hzG = c.createLinearGradient(0, hz - 40, 0, hz + 10); hzG.addColorStop(0, 'rgba(255,255,255,0)'); hzG.addColorStop(1, night ? 'rgba(60,60,80,.35)' : 'rgba(240,240,236,.55)');
    c.fillStyle = hzG; c.fillRect(0, hz - 40, W, 50); // aerial haze on the horizon
    var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  }
  function paintSky() {
    if (!sky) return;
    var key = S.night ? 'n' : 'd'; if (!skyTex[key]) skyTex[key] = skyPanorama(S.night);
    var sm = sky.children[0].material; if (sm.map !== skyTex[key]) { sm.map = skyTex[key]; sm.needsUpdate = true; }
    sky.children[1].material.color.set(S.night ? 0x23262A : 0x9BA488);
  }

  // Wet areas, kitchens and service rooms (from Revit rooms) get practical finishes in every scheme.
  var ZONE_FLOOR = { wet: 1, kitchen: 1, service: 1 }, ZONE_WALL = { wet: 1 };
  function levelAt(y) {
    var li = 0;
    D.levels.forEach(function (L, i) { if (L.elevation + (L._slabTop || 0) - 0.3 <= y) li = i; });
    return D.levels[li];
  }
  function roomTypeAt(wx, wy, wz) {
    var L = levelAt(wy), x = wx + CX, y = -wz + CY, rm = L.rooms.filter(function (r) { return inPoly(x, y, r.poly); })[0];
    if (rm) return rm.type;
    // open areas often carry only a text label in Revit: take the nearest label within 7 m
    var best = null, bd = 49;
    (L.notes || []).forEach(function (n) { var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y); if (d < bd) { bd = d; best = n; } });
    var nm2 = best ? (best.name || '') + ' ' + (best.nameAr || '') : '';
    if (/majlis|مجلس/i.test(nm2)) return 'majlis';
    if (/bed|sitting|master|نوم|جلسة/i.test(nm2)) return 'bedroom';
    if (/living|family|game|lounge|معيشة|ألعاب/i.test(nm2)) return 'living';
    return '';
  }
  function roomAt(wx, wy, wz, types) {
    var L = levelAt(wy), x = wx + CX, y = -wz + CY;
    return L.rooms.filter(function (r) { return types[r.type] && inPoly(x, y, r.poly); })[0];
  }
  function splitZones() {
    var va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    finishMeshes.slice().forEach(function (f) {
      if (f.kind !== 'floor') return;
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
      zm.material.clippingPlanes = [cutPlane]; // clone() copies the plane: share the live one or the zone stays cut at load height
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
  /* Skirting: a 9 cm painted board along the bottom edge of each interior wall face that
     stands on a level's floor (door openings break the wall faces, so boards stop there). */

  /* ---------- walls and ceilings: architectural trim ----------
     From the exported wall faces (grouped by plane, so openings are known exactly):
     - classic scheme: panel mouldings (lower and upper panels with a chair rail) on the walls of
       living rooms, majlis, dining and bedrooms, and a cove cornice where walls meet ceilings;
     - contemporary schemes: a 15 mm shadow-gap reveal at the top of the walls instead;
     - 'as modelled': none. Trim is painted in the wall colour, a little glossier. */
  var trimGroup = new THREE.Group(), trimMat = new THREE.MeshStandardMaterial({ color: 0xEFE9DF, roughness: 0.5, clippingPlanes: [cutPlane] });
  var gapMat = new THREE.MeshStandardMaterial({ color: 0x2E2B28, roughness: 0.9, clippingPlanes: [cutPlane] }), trimParts = {};
  scene.add(trimGroup);
  function applyTrim(sc) {
    if (typeof sc.wall === 'string') trimMat.color.set(sc.wall).offsetHSL(0, 0, 0.02);
    if (trimParts.panels) trimParts.panels.visible = sc.id === 'classic';
    if (trimParts.cornice) trimParts.cornice.visible = sc.id === 'classic';
    if (trimParts.gap) trimParts.gap.visible = sc.id === 'warm' || sc.id === 'calm';
    if (trimParts.ceilFrame) trimParts.ceilFrame.visible = sc.id === 'classic';
  }
  var corniceGeo = null;
  function corniceGeometry() { // cavetto cornice: 115 x 115 mm, length 1 along x, out of the wall +z, top at y = 0
    if (corniceGeo) return corniceGeo;
    var sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0.115, 0); sh.lineTo(0.115, -0.012); sh.lineTo(0.1, -0.012);
    sh.absarc(0.1, -0.1, 0.088, Math.PI / 2, Math.PI, false);
    sh.lineTo(0.012, -0.115); sh.lineTo(0, -0.115); sh.closePath();
    var g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(-Math.PI / 2); g.translate(0.5, 0, 0); g.computeVertexNormals();
    return (corniceGeo = g);
  }
  function buildTrim() {
    if (!meshGroups.wall) return;
    var planes = {}, e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    meshGroups.wall.traverse(function (mesh) { // interior wall faces grouped by plane
      if (!mesh.isMesh || mesh.material.side === THREE.BackSide) return;
      var g = mesh.geometry, idx = g.index ? g.index.array : null, pos = g.attributes.position, cnt = idx ? idx.length : pos.count;
      for (var t = 0; t < cnt; t += 3) {
        var vs = [0, 1, 2].map(function (i) { return new THREE.Vector3().fromBufferAttribute(pos, idx ? idx[t + i] : t + i).applyMatrix4(mesh.matrixWorld); });
        n.crossVectors(e1.subVectors(vs[1], vs[0]), e2.subVectors(vs[2], vs[0]));
        var ar = n.length(); if (ar < 1e-6) continue; n.divideScalar(ar);
        if (Math.abs(n.y) > 0.05) continue;
        n.y = 0; n.normalize();
        var d = n.x * vs[0].x + n.z * vs[0].z, key = Math.round(Math.atan2(n.z, n.x) * 100) + '|' + Math.round(d * 50);
        var pl = planes[key] || (planes[key] = { n: n.clone(), d: d, tan: new THREE.Vector3(-n.z, 0, n.x), tris: [] });
        pl.tris.push(vs.map(function (v) { return [v.x * pl.tan.x + v.z * pl.tan.z, v.y]; }));
      }
    });
    function covered(pl, t, y) { // is (t, y) on a wall face of this plane (not in an opening)?
      for (var i = 0; i < pl.tris.length; i++) {
        var a = pl.tris[i][0], b = pl.tris[i][1], c = pl.tris[i][2];
        var d1 = (t - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]), d2 = (t - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]), d3 = (t - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
        var neg = d1 < -1e-7 || d2 < -1e-7 || d3 < -1e-7, pos = d1 > 1e-7 || d2 > 1e-7 || d3 > 1e-7;
        if (!(neg && pos)) return true;
      }
      return false;
    }
    function rectFree(pl, t0, t1, y0, y1) {
      for (var i = 0; i <= 4; i++) for (var j = 0; j <= 4; j++) if (!covered(pl, t0 + (t1 - t0) * (0.02 + 0.96 * i / 4), y0 + (y1 - y0) * (0.02 + 0.96 * j / 4))) return false;
      return true;
    }
    var ceils = []; if (meshGroups.ceil) meshGroups.ceil.traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) ceils.push(o); });
    var rc = new THREE.Raycaster(), upV = new THREE.Vector3(0, 1, 0);
    var bars = [], gaps = [], corn = [], ROOMS = { living: 1, majlis: 1, bedroom: 1, dining: 1 }, NOT = { wet: 1, service: 1 };
    function faces(pl, t, fy) { // the room in front of a point of the wall
      var x = pl.n.x * pl.d + pl.tan.x * t + pl.n.x * 0.35, z = pl.n.z * pl.d + pl.tan.z * t + pl.n.z * 0.35;
      return roomTypeAt(x, fy + 0.2, z);
    }
    Object.keys(planes).forEach(function (k) {
      var pl = planes[k], floors = {};
      // runs along the floor: bottom edges of the faces, per floor level
      pl.tris.forEach(function (tr) {
        var ymin = Math.min(tr[0][1], tr[1][1], tr[2][1]), low = tr.filter(function (v) { return v[1] - ymin < 0.004; });
        if (low.length !== 2) return;
        var L = levelAt(ymin + 0.05), fy = L.elevation + (L._slabTop || 0);
        if (Math.abs(ymin - fy) > 0.04) return;
        (floors[fy.toFixed(2)] = floors[fy.toFixed(2)] || []).push([Math.min(low[0][0], low[1][0]), Math.max(low[0][0], low[1][0])]);
      });
      Object.keys(floors).forEach(function (fk) {
        var fy = +fk, runs = floors[fk].sort(function (a, b) { return a[0] - b[0]; }), merged = [];
        runs.forEach(function (r) { var l = merged[merged.length - 1]; if (l && r[0] <= l[1] + 0.02) l[1] = Math.max(l[1], r[1]); else merged.push([r[0], r[1]]); });
        merged.forEach(function (r) {
          var len = r[1] - r[0]; if (len < 0.6) return;
          var tm = (r[0] + r[1]) / 2, mid = new THREE.Vector3(pl.n.x * pl.d + pl.tan.x * tm, fy, pl.n.z * pl.d + pl.tan.z * tm);
          var probe = mid.clone().addScaledVector(pl.n, 0.35), type = roomTypeAt(probe.x, fy + 0.2, probe.z);
          if (NOT[type]) return;
          rc.set(new THREE.Vector3(probe.x, fy + 1.6, probe.z), upV); rc.near = 0; rc.far = 6;
          var hit = rc.intersectObjects(ceils, false)[0], H = hit ? hit.point.y - fy : null;
          if (H != null && H > 2.2) {
            // cornice / shadow gap along the top of the run (where the wall really reaches the ceiling)
            var t = r[0];
            while (t < r[1] - 0.05) {
              var t2 = Math.min(r[1], t + 0.5);
              if (covered(pl, (t + t2) / 2, fy + H - 0.05) && !NOT[faces(pl, (t + t2) / 2, fy)]) corn.push({ pl: pl, t0: t, t1: t2, y: fy + H });
              t = t2;
            }
          }
          if (!ROOMS[type] || len < 1.2 || H == null || H < 2.4) return;
          // panel mouldings: lower panels, chair rail at 0.9 m, upper panels
          var top = Math.min(H - 0.35, 3.3), np = Math.max(1, Math.round((len - 0.3) / 1.05)), pw = (len - 0.3 - (np - 1) * 0.15) / np;
          if (pw < 0.45) return;
          for (var i = 0; i < np; i++) {
            var a = r[0] + 0.15 + i * (pw + 0.15), b2 = a + pw;
            [[0.2, 0.78], [1.02, top]].forEach(function (yy) {
              if (yy[1] - yy[0] < 0.3 || !ROOMS[faces(pl, (a + b2) / 2, fy)] || !rectFree(pl, a, b2, fy + yy[0], fy + yy[1])) return;
              bars.push({ pl: pl, t0: a, t1: b2, y0: fy + yy[0], y1: fy + yy[1] });
            });
          }
          for (var t3 = r[0]; t3 < r[1] - 0.05; t3 += 0.5) { // chair rail, broken at openings
            var t4 = Math.min(r[1], t3 + 0.5);
            if (covered(pl, (t3 + t4) / 2, fy + 0.9) && ROOMS[faces(pl, (t3 + t4) / 2, fy)]) gaps.push({ pl: pl, t0: t3, t1: t4, y: fy + 0.9, rail: true });
          }
        });
      });
    });
    var M = new THREE.Matrix4(), R = new THREE.Matrix4(), S3 = new THREE.Matrix4(), box = new THREE.BoxGeometry(1, 1, 1);
    function place(mesh, i, pl, t, y, along, h, dep, off) {
      var x = pl.n.x * pl.d + pl.tan.x * t + pl.n.x * off, z = pl.n.z * pl.d + pl.tan.z * t + pl.n.z * off;
      R.makeRotationY(Math.atan2(pl.n.x, pl.n.z)); // local z -> wall normal, local x -> along the wall
      mesh.setMatrixAt(i, M.makeTranslation(x, y, z).multiply(R).multiply(S3.makeScale(along, h, dep)));
    }
    // panel frames: a flat 30 mm band with a raised 14 mm bead on it
    bars.length = 0; gaps.length = 0; // wall panels and chair rails: not wanted
    var rails = gaps.filter(function (g) { return g.rail; }), nb = bars.length * 4 + rails.length;
    if (nb) {
      var flat = new THREE.InstancedMesh(box, trimMat, nb), bead = new THREE.InstancedMesh(box, trimMat, nb), k = 0;
      bars.forEach(function (b) {
        var w = b.t1 - b.t0, h = b.y1 - b.y0, tc = (b.t0 + b.t1) / 2, yc = (b.y0 + b.y1) / 2;
        [[tc, b.y0, w, 0.03], [tc, b.y1, w, 0.03], [b.t0, yc, 0.03, h], [b.t1, yc, 0.03, h]].forEach(function (q) {
          var horiz = q[3] === 0.03 && q[2] !== 0.03;
          place(flat, k, b.pl, q[0], q[1], horiz ? q[2] + 0.03 : 0.03, horiz ? 0.03 : q[3] + 0.03, 0.008, 0.004);
          place(bead, k, b.pl, q[0], q[1], horiz ? q[2] + 0.014 : 0.014, horiz ? 0.014 : q[3] + 0.014, 0.018, 0.009);
          k++;
        });
      });
      rails.forEach(function (g) {
        place(flat, k, g.pl, (g.t0 + g.t1) / 2, g.y, g.t1 - g.t0, 0.06, 0.012, 0.006);
        place(bead, k, g.pl, (g.t0 + g.t1) / 2, g.y + 0.01, g.t1 - g.t0, 0.025, 0.024, 0.012); k++;
      });
      [flat, bead].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; });
      trimParts.panels = new THREE.Group(); trimParts.panels.add(flat, bead); trimGroup.add(trimParts.panels);
    }
    if (corn.length) {
      var gm = new THREE.InstancedMesh(box, gapMat, corn.length); // the shadow-gap reveal only (no cornice)
      corn.forEach(function (c, i) { place(gm, i, c.pl, (c.t0 + c.t1) / 2, c.y - 0.008, c.t1 - c.t0 + 0.002, 0.016, 0.004, 0.0005); });
      trimParts.gap = gm; trimGroup.add(gm);
    }
    applyTrim(SCHEMES.filter(function (x) { return x.id === S.finish; })[0] || SCHEMES[0]);
  }

  /* Chandeliers over dining tables and the coffee tables of living rooms and majlis: tiered
     brass rings with a warm LED ring (round / square tables) or a linear brass bar (long dining
     tables), bigger in double-height spaces. In the classic scheme a double moulded frame on the
     ceiling surrounds them. At night the nearest ones become real lights. */
  var chandGroup = new THREE.Group(), chandSpots = [];
  scene.add(chandGroup);
  function buildChandeliers() {
    var ceils = []; if (meshGroups.ceil) meshGroups.ceil.traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) ceils.push(o); });
    if (!ceils.length) return;
    var rc = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), brass = M().metal, placed = [], frames = [];
    function ceilAt(x, y, z) { rc.set(new THREE.Vector3(x, y, z), up); rc.near = 0; rc.far = 7; var h = rc.intersectObjects(ceils, false)[0]; return h ? h.point.y : null; }
    function rod(C, x, y, z, top, r) { var h = top - y; if (h <= 0.01) return; var m = new THREE.Mesh(new THREE.CylinderGeometry(r || 0.0018, r || 0.0018, h, 6), brass); m.position.set(x, y + h / 2, z); C.add(m); }
    realGroup.children.forEach(function (G) {
      var k = G.userData.kind, room = G.userData.room, tb = G.userData.table;
      if (!tb || !(k === 'dining' || (k === 'table' && (room === 'living' || room === 'majlis')))) return;
      var r = tb.rect, du = r.u1 - r.u0, dv = r.v1 - r.v0, lo = Math.max(du, dv), sh = Math.min(du, dv);
      if (k === 'table' && lo < 0.7) return; // side tables: no
      G.updateMatrix && G.matrixAutoUpdate && G.updateMatrix();
      var base = G.matrix.elements[13], cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
      var w = new THREE.Vector3(cu, tb.topH, cv).applyMatrix4(G.matrix);
      if (placed.some(function (q) { return Math.hypot(q.x - w.x, q.z - w.z) < 1.6 && Math.abs(q.y - w.y) < 1; })) return;
      var cy = ceilAt(w.x, w.y + 0.1, w.z); if (cy == null) return;
      var H = cy - base; if (H < 2.5) return;
      placed.push(w.clone());
      var A = new THREE.Vector3(G.matrix.elements[0], 0, G.matrix.elements[2]).normalize(), Cv = new THREE.Vector3(G.matrix.elements[8], 0, G.matrix.elements[10]).normalize();
      var scl = H > 4.2 ? 1.5 : 1, bottom = base + (k === 'dining' ? tb.topH + 0.85 : Math.min(Math.max(2.25, H - 1.0), 3.3));
      bottom = Math.min(bottom, cy - 0.45);
      var C = new THREE.Group(); C.position.set(w.x, bottom, w.z); chandGroup.add(C);
      var top = cy - bottom, longDir = du >= dv ? A : Cv;
      if (k === 'dining' && lo / sh > 1.4) { // linear pendant along the table
        var L = Math.min(2.2, lo * 0.62); C.rotation.y = Math.atan2(-longDir.z, longDir.x);
        var bar = new THREE.Mesh(rboxGeo(L, 0.045, 0.075, 0.012), brass); bar.position.y = 0.025; C.add(bar);
        var dif = new THREE.Mesh(rboxGeo(L - 0.03, 0.01, 0.05, 0.004), ledMat); dif.position.y = -0.0; C.add(dif);
        [-1, 1].forEach(function (sg) { rod(C, sg * (L / 2 - 0.12), 0.05, 0, top); var cp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), brass); cp.position.set(sg * (L / 2 - 0.12), top - 0.01, 0); C.add(cp); });
      } else { // tiered rings
        var R = Math.min(0.7, Math.max(0.35, sh * 0.42)) * scl;
        [[R, 0], [R * 0.72, 0.17 * scl], [R * 0.46, 0.32 * scl]].forEach(function (t, ti) {
          var ring = new THREE.Mesh(new THREE.TorusGeometry(t[0], 0.014 * scl, 10, 72), brass); ring.rotation.x = Math.PI / 2; ring.position.y = t[1]; C.add(ring);
          var lit = new THREE.Mesh(new THREE.TorusGeometry(t[0] - 0.002, 0.009 * scl, 8, 72), ledMat); lit.rotation.x = Math.PI / 2; lit.position.y = t[1] - 0.013 * scl; C.add(lit);
          for (var i = 0; i < 3; i++) { var a = i * 2 * Math.PI / 3 + ti * 0.7; rod(C, Math.cos(a) * t[0], t[1] + 0.012, Math.sin(a) * t[0], top); }
        });
        var cp = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scl, 0.12 * scl, 0.025, 32), brass); cp.position.y = top - 0.012; C.add(cp);
      }
      C.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
      chandSpots.push({ p: new THREE.Vector3(w.x, bottom - 0.1, w.z), level: D.levels.indexOf(levelAt(base + 0.1)), chand: true });
      // classic ceiling frame: only where the ceiling is flat over the whole frame
      var fw = k === 'dining' ? du + 1.0 : Math.min(3.6, Math.max(2.4, du + 1.6)), fd = k === 'dining' ? dv + 1.0 : Math.min(3.6, Math.max(2.4, dv + 1.6));
      var flat = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(function (c) {
        var q = w.clone().addScaledVector(A, c[0] * fw / 2).addScaledVector(Cv, c[1] * fd / 2), y2 = ceilAt(q.x, w.y + 0.1, q.z);
        return y2 != null && Math.abs(y2 - cy) < 0.03;
      });
      var rad = Math.hypot(fw, fd) / 2, clash = frames.some(function (f) { return Math.abs(f.c.y - cy) < 0.1 && Math.hypot(f.c.x - w.x, f.c.z - w.z) < rad + Math.hypot(f.w, f.d) / 2 - 0.3; });
      if (flat && !clash) frames.push({ c: new THREE.Vector3(w.x, cy, w.z), A: A, Cv: Cv, w: fw, d: fd });
    });
    if (frames.length) {
      var box = new THREE.BoxGeometry(1, 1, 1), n = frames.length * 16, flatM = new THREE.InstancedMesh(box, trimMat, n), beadM = new THREE.InstancedMesh(box, trimMat, n);
      var Mx = new THREE.Matrix4(), Bs = new THREE.Matrix4(), Sx = new THREE.Matrix4(), i = 0, upV = new THREE.Vector3(0, 1, 0);
      frames.forEach(function (f) {
        Bs.makeBasis(f.A, upV, f.Cv);
        [0, 0.12].forEach(function (inset) {
          var fw2 = f.w - 2 * inset, fd2 = f.d - 2 * inset;
          [[0, -fd2 / 2, fw2, 0], [0, fd2 / 2, fw2, 0], [-fw2 / 2, 0, fd2, 1], [fw2 / 2, 0, fd2, 1]].forEach(function (b) {
            var pos = f.c.clone().addScaledVector(f.A, b[0]).addScaledVector(f.Cv, b[1]);
            [[flatM, 0.06, 0.008], [beadM, 0.025, 0.02]].forEach(function (pt) {
              var sx = b[3] ? pt[1] : b[2] + pt[1], sz = b[3] ? b[2] + pt[1] : pt[1];
              Mx.makeTranslation(pos.x, f.c.y - pt[2] / 2 - 0.001, pos.z).multiply(Bs).multiply(Sx.makeScale(sx, pt[2], sz));
              pt[0].setMatrixAt(i, Mx);
            });
            i++;
          });
        });
      });
      trimParts.ceilFrame = new THREE.Group(); trimParts.ceilFrame.add(flatM, beadM); trimGroup.add(trimParts.ceilFrame);
      trimParts.ceilFrame.visible = S.finish === 'classic';
    }
    applyCeiling();
  }

  /* Bathrooms: sanitary ware in glossy white vitreous china and fittings in chrome (split by room
     in furnParts), and real mirrors: a reflector over each mirror's glass, rendered only in walk
     mode. Kitchens: the worktop surfaces of the cabinets become white quartz (furnParts). */
  var mirrorGroup = new THREE.Group(), kitchenGroup = new THREE.Group();
  scene.add(mirrorGroup, kitchenGroup);
  function dressWetAndKitchen() { // mirrors: wall-hung glass in wet rooms (above 0.8 m) becomes a reflector
    if (!THREE.Reflector) return;
    var mWalls = []; ['wall', 'ext', 'arch'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.material !== glassMat && o.material.side !== THREE.BackSide) mWalls.push(o); }); });
    var planes = {}, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    scene.traverse(function (o) {
      if (!o.isMesh || o.material !== glassMat) return;
      o.updateMatrixWorld(true);
      var g = o.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, cnt = idx ? idx.length : pos.count;
      for (var t = 0; t < cnt; t += 3) {
        va.fromBufferAttribute(pos, idx ? idx[t] : t).applyMatrix4(o.matrixWorld); vb.fromBufferAttribute(pos, idx ? idx[t + 1] : t + 1).applyMatrix4(o.matrixWorld); vc.fromBufferAttribute(pos, idx ? idx[t + 2] : t + 2).applyMatrix4(o.matrixWorld);
        n.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); var ar = n.length(); if (ar < 1e-6) continue; n.divideScalar(ar);
        if (Math.abs(n.y) > 0.1) continue;
        var ymin = Math.min(va.y, vb.y, vc.y), L = levelAt(ymin + 0.1), fy = L.elevation + (L._slabTop || 0);
        if (ymin - fy < 0.8) continue;
        n.y = 0; n.normalize(); if (n.x < -1e-6 || (Math.abs(n.x) < 1e-6 && n.z < 0)) n.negate(); // one key for both faces
        var d = n.x * va.x + n.z * va.z, key = Math.round(Math.atan2(n.z, n.x) * 50) + '|' + Math.round(d * 20);
        var pl = planes[key] || (planes[key] = { n: n.clone(), d: d, t0: 1e9, t1: -1e9, y0: 1e9, y1: -1e9 });
        [va, vb, vc].forEach(function (v) { var tt = -pl.n.z * v.x + pl.n.x * v.z; pl.t0 = Math.min(pl.t0, tt); pl.t1 = Math.max(pl.t1, tt); pl.y0 = Math.min(pl.y0, v.y); pl.y1 = Math.max(pl.y1, v.y); });
      }
    });
    Object.keys(planes).forEach(function (k) {
      var pl = planes[k], w = pl.t1 - pl.t0, h = pl.y1 - pl.y0; if (w < 0.25 || h < 0.3 || w > 3 || h > 2) return;
      var tm = (pl.t0 + pl.t1) / 2, c = new THREE.Vector3(pl.n.x * pl.d - pl.n.z * tm, (pl.y0 + pl.y1) / 2, pl.n.z * pl.d + pl.n.x * tm), nrm = pl.n.clone();
      var front = roomTypeAt(c.x + nrm.x * 0.4, pl.y0, c.z + nrm.z * 0.4) === 'wet', back = roomTypeAt(c.x - nrm.x * 0.4, pl.y0, c.z - nrm.z * 0.4) === 'wet';
      if (!front && !back) return;
      if (!front) nrm.negate();
      // a mirror hangs on solid wall; a window's glass has the opening behind it
      var behind = new THREE.Raycaster(c.clone().addScaledVector(nrm, 0.02), nrm.clone().negate(), 0, 0.15);
      if (!behind.intersectObjects(mWalls, false).length) return;
      var pr = Math.min(1, 2 / Math.max(w, h));
      var mir = new THREE.Reflector(new THREE.PlaneGeometry(w - 0.01, h - 0.01), { color: 0xC9CBCC, clipBias: 0.003, textureWidth: Math.round(512 * w * pr), textureHeight: Math.round(512 * h * pr) });
      mir.position.copy(c).addScaledVector(nrm, 0.006); mir.lookAt(mir.position.clone().add(nrm));
      var ob = mir.onBeforeRender; mir.onBeforeRender = function (r, sc2) { if (sc2.overrideMaterial) return; ob.apply(this, arguments); };
      mirrorGroup.add(mir);
    });
  }

  /* Kitchens rebuilt in the manner of a modular flat-pack kitchen (60 cm modules): the modelled
     worktop surfaces give the runs, a modelled appliance top in a run marks the cooker, modelled
     tops above 1.55 m mark tall units (the fridge). Base units in white gloss lacquer with slim
     steel bar handles, a recessed plinth and a quartz worktop; a built-in oven under a black
     glass hob with a steel hood above; a sink under the window; wall units only where solid wall
     stands behind them (never over a window, the sink window or the hob); a steel French-door
     fridge. The modelled pieces are hidden once the rebuild succeeds. */

  /* Suspended ceilings: bathrooms and kitchens get a flat gypsum ceiling hung at 2.6 m / 2.7 m
     (where the slab is higher), as built; the downlights are then laid out on it. */
  function buildFalseCeilings() {
    if (!meshGroups.ceil) return;
    var ceils = []; meshGroups.ceil.traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) ceils.push(o); });
    var mat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.95, flatShading: true, clippingPlanes: [cutPlane] });
    triplanar(mat, procFor('gypsum'), 1.6, 1.6, 0.2); ceilMats.push(mat); lightCeilings();
    var rc = new THREE.Raycaster(), upV = new THREE.Vector3(0, 1, 0);
    D.levels.forEach(function (L) {
      var fy = L.elevation + (L._slabTop || 0);
      L.rooms.forEach(function (r) {
        var h = r.type === 'wet' ? 2.6 : r.type === 'kitchen' ? 2.7 : 0; if (!h || !r.poly || r.poly.length < 3) return;
        var cx = 0, cy = 0; r.poly.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= r.poly.length; cy /= r.poly.length;
        var w = P(cx, cy); rc.set(new THREE.Vector3(w.x, fy + 1.5, w.z), upV); rc.near = 0; rc.far = 6;
        var hit = rc.intersectObjects(ceils, false)[0]; if (!hit || hit.point.y - fy < h + 0.15) return;
        var shp = new THREE.Shape(r.poly.map(function (q) { return new THREE.Vector2(q[0] - CX, -(q[1] - CY)); }));
        var g = new THREE.ShapeGeometry(shp); g.rotateX(Math.PI / 2);
        var m = new THREE.Mesh(g, mat); m.position.y = fy + h; m.receiveShadow = true; meshGroups.ceil.add(m);
      });
    });
  }

  /* Curtains: every glazed opening at least 1.5 m tall in a living room, majlis, dining room or
     bedroom gets a pair of pleated linen drapes stacked at its sides, hung from just above the
     glass to the floor, 20 cm in front of the glass on the room side. */
  var curtainMat = null, pleatCache = {};
  function pleatGeo(w, h) {
    var key = w.toFixed(2) + '|' + h.toFixed(2); if (pleatCache[key]) return pleatCache[key];
    var g = new THREE.PlaneGeometry(w, h, Math.max(16, Math.round(w / 0.02)), 2), p = g.attributes.position, folds = Math.max(3, Math.round(w / 0.11));
    for (var i = 0; i < p.count; i++) { var x = p.getX(i), t = (x / w + 0.5) * folds * Math.PI * 2; p.setZ(i, 0.03 * Math.sin(t) + 0.008 * Math.sin(t * 2.3)); }
    g.computeVertexNormals(); return (pleatCache[key] = g);
  }
  function buildCurtains() {
    var ROOMS = { living: 1, majlis: 1, bedroom: 1, dining: 1 }, planes = {}, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    scene.traverse(function (o) {
      if (!o.isMesh || o.material !== glassMat) return;
      o.updateMatrixWorld(true);
      var g = o.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, cnt = idx ? idx.length : pos.count;
      for (var t = 0; t < cnt; t += 3) {
        va.fromBufferAttribute(pos, idx ? idx[t] : t).applyMatrix4(o.matrixWorld); vb.fromBufferAttribute(pos, idx ? idx[t + 1] : t + 1).applyMatrix4(o.matrixWorld); vc.fromBufferAttribute(pos, idx ? idx[t + 2] : t + 2).applyMatrix4(o.matrixWorld);
        n.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); var ar = n.length(); if (ar < 1e-6) continue; n.divideScalar(ar);
        if (Math.abs(n.y) > 0.1) continue;
        n.y = 0; n.normalize(); if (n.x < -1e-6 || (Math.abs(n.x) < 1e-6 && n.z < 0)) n.negate();
        var ymin = Math.min(va.y, vb.y, vc.y), L = levelAt(ymin + 0.1), li = D.levels.indexOf(L);
        var d = n.x * va.x + n.z * va.z, key = li + '|' + Math.round(Math.atan2(n.z, n.x) * 50) + '|' + Math.round(d * 10);
        var pl = planes[key] || (planes[key] = { n: n.clone(), d: d, L: L, iv: [] });
        var ts = [va, vb, vc].map(function (v) { return -pl.n.z * v.x + pl.n.x * v.z; });
        pl.iv.push([Math.min.apply(null, ts), Math.max.apply(null, ts), ymin, Math.max(va.y, vb.y, vc.y)]);
      }
    });
    var made = 0;
    Object.keys(planes).forEach(function (k) {
      var pl = planes[k], fy = pl.L.elevation + (pl.L._slabTop || 0), wins = [];
      pl.iv.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (q) { // panes 25 cm apart or less are one window
        var w = wins[wins.length - 1];
        if (w && q[0] <= w[1] + 0.25) { w[1] = Math.max(w[1], q[1]); w[2] = Math.min(w[2], q[2]); w[3] = Math.max(w[3], q[3]); } else wins.push(q.slice());
      });
      wins.forEach(function (w) {
        var wd = w[1] - w[0], ht = w[3] - w[2]; if (wd < 0.5 || ht < 1.5 || w[2] - fy > 1.2) return;
        var tm = (w[0] + w[1]) / 2, c = new THREE.Vector3(pl.n.x * pl.d - pl.n.z * tm, fy + 1, pl.n.z * pl.d + pl.n.x * tm), nrm = pl.n.clone();
        var fr = ROOMS[roomTypeAt(c.x + nrm.x * 0.6, fy + 0.3, c.z + nrm.z * 0.6)], bk = ROOMS[roomTypeAt(c.x - nrm.x * 0.6, fy + 0.3, c.z - nrm.z * 0.6)];
        if (!fr && !bk) return; if (!fr) nrm.negate();
        if (!curtainMat) curtainMat = new THREE.MeshStandardMaterial({ color: 0xEDE7DD, roughness: 0.92, side: THREE.DoubleSide, clippingPlanes: [cutPlane] });
        var top = Math.min(w[3] + 0.15, fy + 7), H = top - fy - 0.01, pw = Math.min(0.6, Math.max(0.35, wd * 0.22)), tan = new THREE.Vector3(-pl.n.z, 0, pl.n.x);
        [[w[0], 1], [w[1], -1]].forEach(function (e) {
          var tc = e[0] + e[1] * (0.14 - pw / 2), at = new THREE.Vector3(pl.n.x * pl.d, 0, pl.n.z * pl.d).addScaledVector(tan, tc).addScaledVector(nrm, 0.2);
          var m = new THREE.Mesh(pleatGeo(pw, H), curtainMat); m.position.set(at.x, fy + 0.01 + H / 2, at.z); m.rotation.y = Math.atan2(nrm.x, nrm.z);
          m.castShadow = true; m.receiveShadow = true; realGroup.add(m); made++;
        });
      });
    });
    return made;
  }

  /* Contact shadows: soft dark patches on the floor under each piece of furniture (and under each
     chair of a dining set), sized from the piece's own footprint in its own frame. They give the
     grounding that screen-space AO gives, for one draw call and no per-frame cost. */
  var contactTex = null;
  function contactTexture() {
    if (contactTex) return contactTex;
    var n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n; var c = cv.getContext('2d');
    c.filter = 'blur(10px)'; c.fillStyle = '#000'; c.fillRect(n * 0.2, n * 0.2, n * 0.6, n * 0.6); c.filter = 'none';
    contactTex = new THREE.CanvasTexture(cv); return contactTex;
  }
  function buildContactShadows() {
    var items = [], inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), box = new THREE.Box3(), tb = new THREE.Box3();
    scene.updateMatrixWorld(true);
    function footprint(G) { // the piece's box in its own frame, leaving out rugs, glows and wall-hung parts
      inv.copy(G.matrixWorld).invert(); box.makeEmpty();
      G.traverse(function (o) {
        if (!o.isMesh || o.material.transparent || o.material.isMeshBasicMaterial) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        rel.multiplyMatrices(inv, o.matrixWorld); tb.copy(o.geometry.boundingBox).applyMatrix4(rel);
        if (tb.max.y - tb.min.y < 0.03 && tb.min.y < 0.03) return; // a rug
        if (tb.min.y > 0.6) return; // hanging or wall-mounted
        box.union(tb);
      });
      return box.isEmpty() ? null : box.clone();
    }
    function add(G, k) {
      var b = footprint(G); if (!b || b.min.y > 0.35) return;
      var sx = (b.max.x - b.min.x) * k + 0.18, sz = (b.max.z - b.min.z) * k + 0.18;
      if (sx > 6 || sz > 6) return;
      var m = new THREE.Matrix4().compose(new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + 0.017, (b.min.z + b.max.z) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(sx / 0.6, sz / 0.6, 1));
      items.push(new THREE.Matrix4().multiplyMatrices(G.matrixWorld, m));
    }
    realGroup.children.forEach(function (G) {
      if (!G.isGroup) return;
      var subs = G.children.filter(function (c) { return c.isGroup; });
      if (G.userData.kind === 'dining') subs.forEach(function (C) { add(C, 1); }); else add(G, 1.0);
      if (G.userData.kind === 'dining') { var t = G.userData.table; if (t) {
        items.push(new THREE.Matrix4().multiplyMatrices(G.matrixWorld, new THREE.Matrix4().compose(new THREE.Vector3((t.rect.u0 + t.rect.u1) / 2, 0.017, (t.rect.v0 + t.rect.v1) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3((t.rect.u1 - t.rect.u0 + 0.3) / 0.6, (t.rect.v1 - t.rect.v0 + 0.3) / 0.6, 1)))); } }
    });
    kitchenGroup.children.forEach(function (G) { if (G.isGroup) add(G, 1.0); });
    if (!items.length) return;
    var mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: contactTexture(), transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, clippingPlanes: [cutPlane] });
    var im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, items.length);
    items.forEach(function (m, i) { im.setMatrixAt(i, m); });
    im.renderOrder = 1; realGroup.add(im);
  }

  /* Shelf and desk styling. The walnut boards' upward faces are merged into plates (one per
     shelf / desk top). Desks (a top 0.68-0.82 m high, 40-90 cm deep) get a lamp, books and a
     vase; shelves with 18-60 cm of clear height above get folded clothes and linen boxes in
     dressing rooms and bedrooms, books and vases elsewhere. Everything small is instanced: two
     draw calls for all the shelves of the house. */
  function shelfPlates() {
    var tris = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    scene.updateMatrixWorld(true);
    var above = []; // the other furniture surfaces (a stone counter over a board)
    ['furn', 'arch', 'wall'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.visible && venMeshes.indexOf(o) < 0 && !(o.material && o.material.side === THREE.BackSide)) above.push(o); }); });
    // horizontal faces of everything else, in a 0.25 m plan grid: a board with one just above it
    // (a stone counter over a vanity) goes back to the cabinet's lacquer
    var grid = {}, GS = 0.25, w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), w3 = new THREE.Vector3();
    above.forEach(function (o) {
      if (!o.parent || !(o.parent === meshGroups.furn || o.parent.parent === meshGroups.furn)) return; // the Revit furniture and casework
      var pa2 = o.geometry.attributes.position, ix = o.geometry.index, cnt = ix ? ix.count : pa2.count;
      for (var t2 = 0; t2 < cnt; t2 += 3) {
        w1.fromBufferAttribute(pa2, ix ? ix.getX(t2) : t2).applyMatrix4(o.matrixWorld); w2.fromBufferAttribute(pa2, ix ? ix.getX(t2 + 1) : t2 + 1).applyMatrix4(o.matrixWorld); w3.fromBufferAttribute(pa2, ix ? ix.getX(t2 + 2) : t2 + 2).applyMatrix4(o.matrixWorld);
        if (Math.max(w1.y, w2.y, w3.y) - Math.min(w1.y, w2.y, w3.y) > 0.005) continue;
        var e = { y: w1.y, x0: Math.min(w1.x, w2.x, w3.x), x1: Math.max(w1.x, w2.x, w3.x), z0: Math.min(w1.z, w2.z, w3.z), z1: Math.max(w1.z, w2.z, w3.z) };
        if ((e.x1 - e.x0) * (e.z1 - e.z0) > 40) continue;
        for (var gx = Math.floor(e.x0 / GS); gx <= Math.floor(e.x1 / GS); gx++) for (var gz = Math.floor(e.z0 / GS); gz <= Math.floor(e.z1 / GS); gz++) (grid[gx + ',' + gz] || (grid[gx + ',' + gz] = [])).push(e);
      }
    });
    function coveredAt(x, y, z) {
      var l = grid[Math.floor(x / GS) + ',' + Math.floor(z / GS)]; if (!l) return false;
      for (var k2 = 0; k2 < l.length; k2++) { var e = l[k2]; if (e.y > y + 0.002 && e.y < y + 0.08 && x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1) return true; }
      return false;
    }
    venMeshes.forEach(function (m) {
      var pa = m.geometry.attributes.position.array, na = m.geometry.attributes.normal.array, keepV = [], keepN = [], covV = [], covN = [];
      for (var t = 0; t < pa.length; t += 9) {
        a.fromArray(pa, t).applyMatrix4(m.matrixWorld); b.fromArray(pa, t + 3).applyMatrix4(m.matrixWorld); c.fromArray(pa, t + 6).applyMatrix4(m.matrixWorld);
        var cov = coveredAt((a.x + b.x + c.x) / 3, Math.max(a.y, b.y, c.y), (a.z + b.z + c.z) / 3), V = cov ? covV : keepV, N = cov ? covN : keepN;
        for (var q = 0; q < 9; q++) { V.push(pa[t + q]); N.push(na[t + q]); }
      }
      if (!covV.length) return;
      function geo(V, N) { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g; }
      var cm = new THREE.Mesh(geo(covV, covN), m.userData.lacq); cm.castShadow = cm.receiveShadow = true; m.parent.add(cm);
      m.geometry.dispose(); m.geometry = geo(keepV, keepN);
    });
    venMeshes.forEach(function (m) {
      var g = m.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, cnt = idx ? idx.length : pos.count;
      for (var t = 0; t < cnt; t += 3) {
        a.fromBufferAttribute(pos, idx ? idx[t] : t).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, idx ? idx[t + 1] : t + 1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, idx ? idx[t + 2] : t + 2).applyMatrix4(m.matrixWorld);
        n.subVectors(b, a).cross(c.clone().sub(a)); if (n.length() < 1e-8) continue; n.normalize();
        if (n.y < 0.95) continue;
        tris.push({ y: (a.y + b.y + c.y) / 3, x0: Math.min(a.x, b.x, c.x), x1: Math.max(a.x, b.x, c.x), z0: Math.min(a.z, b.z, c.z), z1: Math.max(a.z, b.z, c.z) });
      }
    });
    var plates = [];
    tris.forEach(function (t) { // merge into touching plates at the same height
      var hit = null;
      for (var i = 0; i < plates.length; i++) { var q = plates[i]; if (Math.abs(q.y - t.y) < 0.006 && t.x0 < q.x1 + 0.01 && t.x1 > q.x0 - 0.01 && t.z0 < q.z1 + 0.01 && t.z1 > q.z0 - 0.01) { hit = q; break; } }
      if (hit) { hit.x0 = Math.min(hit.x0, t.x0); hit.x1 = Math.max(hit.x1, t.x1); hit.z0 = Math.min(hit.z0, t.z0); hit.z1 = Math.max(hit.z1, t.z1); }
      else plates.push({ y: t.y, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 });
    });
    for (var pass = 0; pass < 3; pass++) for (var i = 0; i < plates.length; i++) for (var j = plates.length - 1; j > i; j--) { // second merge pass
      var A = plates[i], B = plates[j];
      if (Math.abs(A.y - B.y) < 0.006 && B.x0 < A.x1 + 0.01 && B.x1 > A.x0 - 0.01 && B.z0 < A.z1 + 0.01 && B.z1 > A.z0 - 0.01) { A.x0 = Math.min(A.x0, B.x0); A.x1 = Math.max(A.x1, B.x1); A.z0 = Math.min(A.z0, B.z0); A.z1 = Math.max(A.z1, B.z1); plates.splice(j, 1); }
    }
    plates.forEach(function (q) { // clear height to the next board above; covered = inside a cabinet
      q.gap = 9; q.covered = false;
      var qa = (q.x1 - q.x0) * (q.z1 - q.z0);
      plates.forEach(function (o) {
        if (!(o.y > q.y + 0.03 && o.x0 < q.x1 - 0.05 && o.x1 > q.x0 + 0.05 && o.z0 < q.z1 - 0.05 && o.z1 > q.z0 + 0.05)) return;
        q.gap = Math.min(q.gap, o.y - q.y - 0.02);
        var ov = (Math.min(o.x1, q.x1) - Math.max(o.x0, q.x0)) * (Math.min(o.z1, q.z1) - Math.max(o.z0, q.z0));
        if (o.y - q.y < 1.7 && ov > qa * 0.8) q.covered = true;
      });
      var L = levelAt(q.y); q.hy = q.y - (L.elevation + (L._slabTop || 0));
    });
    plates.forEach(function (q) { // free height: also stop at any other furniture surface above
      [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5]].forEach(function (f) {
        var x = q.x0 + (q.x1 - q.x0) * f[0], z = q.z0 + (q.z1 - q.z0) * f[1], l = grid[Math.floor(x / GS) + ',' + Math.floor(z / GS)] || [];
        l.forEach(function (e) { if (e.y > q.y + 0.002 && x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1) q.gap = Math.min(q.gap, e.y - q.y - 0.02); });
      });
    });
    return plates;
  }
  function buildShelfDecor(mt) {
    if (!venMeshes.length) return;
    var plates = shelfPlates(), rnd = rng(211), soft = [], hard = [], beds = [], desks = [];
    realGroup.children.forEach(function (G) { if (G.userData.kind === 'bed') beds.push(new THREE.Box3().setFromObject(G).getCenter(new THREE.Vector3())); });
    var CLOTH = ['#ECE6DA', '#D6CCBB', '#B7A994', '#8C7B68', '#5B5650', '#2F3A4B', '#E9E9E6', '#6F7352', '#A88B6A'];
    var BOOK = ['#E8E2D6', '#C9BBA5', '#8E7D69', '#4B4641', '#2F3A4B', '#7A432D', '#D8D2C6', '#565C3E'];
    function item(list, x, y, z, w, h, d, ry, col) { list.push({ p: new THREE.Vector3(x, y + h / 2, z), s: new THREE.Vector3(w, h, d), r: ry, c: new THREE.Color(col) }); }
    plates.forEach(function (q) {
      var dx = q.x1 - q.x0, dz = q.z1 - q.z0, alongX = dx >= dz, L = Math.max(dx, dz), D = Math.min(dx, dz);
      var cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, ry = alongX ? 0 : Math.PI / 2;
      function at(t, off) { return alongX ? [q.x0 + t, cz + (off || 0)] : [cx + (off || 0), q.z0 + t]; }
      var room = roomAt(cx, q.y, cz, { service: 1, bedroom: 1 }), dress = (room && /dress|closet|wardrobe/i.test(room.name || '')) || roomTypeAt(cx, q.y, cz) === 'bedroom'
        || beds.some(function (bc) { return Math.abs(bc.y - q.y) < 2 && Math.hypot(bc.x - cx, bc.z - cz) < 7; }); // a closet beside a bedroom
      if (q.hy > 0.66 && q.hy < 0.84 && D >= 0.33 && D <= 0.95 && L >= 0.8 && q.gap > 0.35 && !q.covered) { // desk
        if (desks.some(function (d) { return Math.hypot(d.x - cx, d.z - cz) < 0.6 && Math.abs(d.y - q.y) < 0.2; })) return;
        desks.push({ x: cx, y: q.y, z: cz });
        var e = at(L - 0.22), lb = at(0.32), vb = at(0.6, -D * 0.15);
        put(realGroup, new THREE.CylinderGeometry(0.06, 0.08, 0.02, 24), mt.brass, e[0], q.y + 0.01, e[1]); // lamp: brass foot, ink stem, linen shade
        put(realGroup, new THREE.CylinderGeometry(0.01, 0.01, 0.3, 10), mt.ink || mt.brass, e[0], q.y + 0.17, e[1]);
        put(realGroup, new THREE.CylinderGeometry(0.09, 0.13, 0.17, 28, 1, true), mt.shade, e[0], q.y + 0.38, e[1]);
        item(hard, lb[0], q.y, lb[1], 0.3, 0.03, 0.22, ry + 0.12, '#E8E2D6'); item(hard, lb[0], q.y + 0.03, lb[1], 0.26, 0.025, 0.19, ry - 0.08, '#2F3A4B');
        vessel(realGroup, 'round', mt.sage || mt.ceramic, vb[0], q.y, vb[1], 0.7);
        return;
      }
      if (q.hy < 0.25 || q.hy > 2.05 || D < 0.2 || D > 0.75 || L < 0.25 || q.gap < 0.18 || q.gap > 0.62) return;
      var t = 0.05, depth = Math.min(D - 0.08, 0.32), H = q.gap;
      while (t < L - 0.12) {
        var pick = rnd(), p2;
        if (pick < 0.18) { t += 0.12 + rnd() * 0.15; continue; } // a gap
        if (dress) {
          if (pick < 0.75) { // a stack of folded clothes
            var w = 0.28 + rnd() * 0.06; if (t + w > L - 0.04) break;
            var col = CLOTH[(rnd() * CLOTH.length) | 0], k = Math.max(1, Math.min(6, Math.floor((H - 0.04) / 0.055 * (0.5 + rnd() * 0.5)))), yy = q.y;
            p2 = at(t + w / 2);
            for (var j = 0; j < k; j++) { var th = 0.045 + rnd() * 0.015, c2 = rnd() < 0.6 ? col : CLOTH[(rnd() * CLOTH.length) | 0]; item(soft, p2[0], yy, p2[1], w - rnd() * 0.02, th, depth - rnd() * 0.03, ry + (rnd() - 0.5) * 0.06, c2); yy += th; }
            t += w + 0.04;
          } else { // a linen storage box
            var bw = 0.32, bh = Math.min(0.24, H - 0.04); if (t + bw > L - 0.04) break;
            p2 = at(t + bw / 2); item(hard, p2[0], q.y, p2[1], bw, bh, depth, ry, '#CFC4B1'); t += bw + 0.04;
          }
        } else {
          if (pick < 0.7) { // a row of books standing
            var nb = 4 + ((rnd() * 7) | 0), x = t;
            for (var bI = 0; bI < nb; bI++) { var bt = 0.022 + rnd() * 0.02, bh2 = Math.min(H - 0.03, 0.18 + rnd() * 0.09); if (x + bt > L - 0.04) break; p2 = at(x + bt / 2); item(hard, p2[0], q.y, p2[1], bt, bh2, Math.min(depth, 0.15 + rnd() * 0.06), ry, BOOK[(rnd() * BOOK.length) | 0]); x += bt + 0.002; }
            t = x + 0.05;
          } else { // a vase or a low bowl
            p2 = at(t + 0.1); if (H > 0.24) vessel(realGroup, rnd() < 0.5 ? 'round' : 'tall', rnd() < 0.5 ? (mt.ink || mt.ceramic) : mt.ceramic, p2[0], q.y, p2[1], Math.min(1, (H - 0.03) / 0.34)); else vessel(realGroup, 'bowl', mt.sage || mt.ceramic, p2[0], q.y, p2[1], 0.7);
            t += 0.26;
          }
        }
      }
    });
    var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    [[soft, 0.95, 0.06], [hard, 0.7, 0.004]].forEach(function (set) {
      var list = set[0]; if (!list.length) return;
      var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: set[1], clippingPlanes: [cutPlane] });
      var im = new THREE.InstancedMesh(rboxGeo(1, 1, 1, set[2]), mat, list.length);
      list.forEach(function (it, i) { Q.setFromAxisAngle(up, it.r); M4.compose(it.p, Q, it.s); im.setMatrixAt(i, M4); im.setColorAt(i, it.c); });
      im.castShadow = false; im.receiveShadow = true; realGroup.add(im);
    });
  }
  function greedyRects(mask, nu, nv) {
    var used = new Uint8Array(nu * nv), out = [];
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var k = i * nv + j; if (!mask[k] || used[k]) continue;
      var w = 1; while (j + w < nv && mask[i * nv + j + w] && !used[i * nv + j + w]) w++;
      var h = 1, ok = true;
      while (ok && i + h < nu) { for (var q = 0; q < w; q++) if (!mask[(i + h) * nv + j + q] || used[(i + h) * nv + j + q]) { ok = false; break; } if (ok) h++; }
      for (var a = 0; a < h; a++) for (var b = 0; b < w; b++) used[(i + a) * nv + j + b] = 1;
      out.push({ i0: i, i1: i + h, j0: j, j1: j + w });
    }
    return out;
  }
  function morph(mask, nu, nv, r, grow) { // dilate (grow) or erode by r cells
    var out = new Uint8Array(nu * nv);
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var hit = !grow;
      for (var a = -r; a <= r && hit !== grow; a++) for (var b = -r; b <= r; b++) {
        var ii = i + a, jj = j + b, v = ii >= 0 && jj >= 0 && ii < nu && jj < nv ? mask[ii * nv + jj] : 0;
        if (grow && v) { hit = true; break; } if (!grow && !v) { hit = false; break; }
      }
      out[i * nv + j] = hit ? 1 : 0;
    }
    return out;
  }
  function buildKitchen() {
    if (!KIT.length) return;
    var lacq = new THREE.MeshStandardMaterial({ color: 0xF4F3F0, roughness: 0.16, envMapIntensity: 1, clippingPlanes: [cutPlane] });
    var plinth = new THREE.MeshStandardMaterial({ color: 0xD6D4D0, roughness: 0.5, clippingPlanes: [cutPlane] });
    var steel = new THREE.MeshStandardMaterial({ color: 0xC9CBCD, metalness: 0.85, roughness: 0.28, clippingPlanes: [cutPlane] });
    var bar = new THREE.MeshStandardMaterial({ color: 0xD8D9DB, metalness: 1, roughness: 0.22, clippingPlanes: [cutPlane] });
    var blackGlass = new THREE.MeshStandardMaterial({ color: 0x0E0F11, metalness: 0.2, roughness: 0.05, envMapIntensity: 1.3, clippingPlanes: [cutPlane] });
    var ring = new THREE.MeshStandardMaterial({ color: 0x5A5C60, roughness: 0.4, clippingPlanes: [cutPlane] });
    var quartz = MX().top, up = new THREE.Vector3(0, 1, 0);
    var walls = []; ['wall', 'ext'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.material !== glassMat && o.material.side !== THREE.BackSide) walls.push(o); }); });
    var ceils = []; if (meshGroups.ceil) meshGroups.ceil.traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) ceils.push(o); });
    var rc = new THREE.Raycaster(), built = 0, CELLK = 0.05;
    D.levels.forEach(function (L) {
      var fy = L.elevation + (L._slabTop || 0);
      L.rooms.forEach(function (room) {
        if (room.type !== 'kitchen' || !room.poly || room.poly.length < 3) return;
        var wp = room.poly.map(function (q) { return [q[0] - CX, -(q[1] - CY)]; }), best = 0, ang = 0;
        wp.forEach(function (q, i) { var n2 = wp[(i + 1) % wp.length], len = Math.hypot(n2[0] - q[0], n2[1] - q[1]); if (len > best) { best = len; ang = Math.atan2(n2[1] - q[1], n2[0] - q[0]); } });
        var A = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), C = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
        var U0 = 1e9, U1 = -1e9, V0 = 1e9, V1 = -1e9;
        wp.forEach(function (q) { var u = q[0] * A.x + q[1] * A.z, v = q[0] * C.x + q[1] * C.z; U0 = Math.min(U0, u); U1 = Math.max(U1, u); V0 = Math.min(V0, v); V1 = Math.max(V1, v); });
        U0 -= 0.2; V0 -= 0.2; U1 += 0.2; V1 += 0.2;
        var nu = Math.ceil((U1 - U0) / CELLK), nv = Math.ceil((V1 - V0) / CELLK), code = new Uint8Array(nu * nv), hs = [], tallH = [];
        function inRoom(x, z) { return inPoly(x + CX, -z + CY, room.poly); }
        KIT.forEach(function (t) {
          var v = t.v, ymin = Math.min(v[0][1], v[1][1], v[2][1]); if (ymin < fy - 0.2 || ymin > fy + 3) return;
          var mx = (v[0][0] + v[1][0] + v[2][0]) / 3, mz = (v[0][2] + v[1][2] + v[2][2]) / 3; if (!inRoom(mx, mz)) return;
          var ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2];
          var ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1, hy = (v[0][1] + v[1][1] + v[2][1]) / 3 - fy, cd;
          if (Math.abs(ny) / nl > 0.95 && hy > 0.7 && hy < 1.0) { cd = t.wood ? 1 : 2; hs.push(hy); }
          else if (Math.abs(ny) / nl > 0.9 && hy > 1.55 && hy < 2.4) { cd = 3; tallH.push(hy); }
          else return;
          var P2 = v.map(function (q) { return [(q[0] * A.x + q[2] * A.z - U0) / CELLK, (q[0] * C.x + q[2] * C.z - V0) / CELLK]; });
          var i0 = Math.max(0, Math.floor(Math.min(P2[0][0], P2[1][0], P2[2][0]))), i1 = Math.min(nu - 1, Math.ceil(Math.max(P2[0][0], P2[1][0], P2[2][0])));
          var j0 = Math.max(0, Math.floor(Math.min(P2[0][1], P2[1][1], P2[2][1]))), j1 = Math.min(nv - 1, Math.ceil(Math.max(P2[0][1], P2[1][1], P2[2][1])));
          for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
            var px = i + 0.5, py = j + 0.5, a = P2[0], b = P2[1], c = P2[2];
            var d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]), d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]), d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
            if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
            var k = i * nv + j; if (cd > code[k]) code[k] = cd;
          }
        });
        if (!hs.length) return;
        var H = median(hs), tallTop = Math.min(Math.max(median(tallH) || 1.85, 1.75), 2.1);
        var runM = new Uint8Array(nu * nv), tallM = new Uint8Array(nu * nv);
        for (var k = 0; k < nu * nv; k++) { if (code[k] === 1 || code[k] === 2) runM[k] = 1; if (code[k] === 3) tallM[k] = 1; }
        runM = morph(morph(runM, nu, nv, 2, true), nu, nv, 2, false); tallM = morph(morph(tallM, nu, nv, 2, true), nu, nv, 2, false);
        for (k = 0; k < nu * nv; k++) if (tallM[k]) runM[k] = 0;
        // keep every door's opening and swing clear (1 m each side of the leaf line)
        leafPivots.forEach(function (lf) {
          var bx = new THREE.Box3().setFromObject(lf.inner); if (bx.isEmpty() || bx.min.y > fy + 1 || bx.max.y < fy + 0.5) return;
          var Hh = P(lf.x, lf.y), c3 = bx.getCenter(new THREE.Vector3()), ud = new THREE.Vector3(c3.x - Hh.x, 0, c3.z - Hh.z), half = ud.length(); if (half < 0.15) return; ud.normalize();
          var nd = new THREE.Vector3(-ud.z, 0, ud.x);
          for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
            var wx = A.x * (U0 + (i + 0.5) * CELLK) + C.x * (V0 + (j + 0.5) * CELLK), wz = A.z * (U0 + (i + 0.5) * CELLK) + C.z * (V0 + (j + 0.5) * CELLK);
            var t = (wx - Hh.x) * ud.x + (wz - Hh.z) * ud.z, d = (wx - Hh.x) * nd.x + (wz - Hh.z) * nd.z;
            if (t > -0.1 && t < half * 2 + 0.1 && Math.abs(d) < 1.0) { runM[i * nv + j] = 0; tallM[i * nv + j] = 0; }
          }
        });
        function frameOf(rr, minDepth) { // world frame of a cell rectangle: long axis, depth, which side is the wall
          var u0 = U0 + rr.i0 * CELLK, u1 = U0 + rr.i1 * CELLK, v0 = V0 + rr.j0 * CELLK, v1 = V0 + rr.j1 * CELLK, du = u1 - u0, dv = v1 - v0;
          if (Math.min(du, dv) < minDepth) return null;
          var alongU = du >= dv, len = alongU ? du : dv, dep = alongU ? dv : du;
          var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ctr = A.clone().multiplyScalar(cu).addScaledVector(C, cv);
          var sideN = alongU ? C : A, half = dep / 2;
          var pA = ctr.clone().addScaledVector(sideN, -(half + 0.12)), pB = ctr.clone().addScaledVector(sideN, half + 0.12);
          var inA = inRoom(pA.x, pA.z), inB = inRoom(pB.x, pB.z);
          var F = !inA && inB ? sideN.clone() : inA && !inB ? sideN.clone().negate() : !inA && !inB ? sideN.clone() : null; // F points into the room
          var island = !F; if (island) F = sideN.clone();
          return { ctr: ctr, len: len, dep: dep, F: F, X: new THREE.Vector3().crossVectors(up, F), island: island, rr: rr };
        }
        function wallAt(G, x, y, z, far) { // solid wall straight behind a local point?
          var o = new THREE.Vector3(x, y, z).applyMatrix4(G.matrix), d = new THREE.Vector3(0, 0, -1).transformDirection(G.matrix);
          rc.set(o, d); rc.near = 0; rc.far = far; return rc.intersectObjects(walls, false)[0];
        }
        function group(f, h) { var G = new THREE.Group(); G.matrixAutoUpdate = false; G.matrix.makeBasis(f.X, up, f.F).setPosition(f.ctr.x, fy, f.ctr.z); kitchenGroup.add(G); G.updateMatrixWorld(true); return G; }
        function box(G, mat, w, h, d, x, y, z, r) { var m = new THREE.Mesh(r ? rboxGeo(w, h, d, r) : new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; G.add(m); return m; }
        function handle(G, x, y, z, len, vertical) { var m = box(G, bar, vertical ? 0.012 : len, vertical ? len : 0.012, 0.014, x, y, z + 0.022, 0.004); return m; }
        // tall units: steel French-door fridge (or a lacquered larder when narrow)
        greedyRects(tallM, nu, nv).forEach(function (rr) {
          var f = frameOf(rr, 0.45); if (!f || f.len < 0.5) return;
          var G = group(f), W = Math.min(f.len, 0.95), Dd = Math.min(f.dep, 0.72), hz = Dd / 2 - 0.02;
          if (W < 0.7) {
            box(G, lacq, W - 0.006, tallTop - 0.1, Dd - 0.02, 0, 0.1 + (tallTop - 0.1) / 2, -0.01, 0.002); box(G, plinth, W, 0.1, Dd - 0.08, 0, 0.05, -0.04);
            handle(G, W / 2 - 0.06, 1.05, hz, 0.5, true); built++; return;
          }
          box(G, steel, W - 0.01, tallTop - 0.02, Dd - 0.06, 0, 0.01 + (tallTop - 0.02) / 2, -0.03, 0.01);
          var split = tallTop * 0.36;
          [-1, 1].forEach(function (sg) { // two doors above, a freezer drawer below
            box(G, steel, W / 2 - 0.008, tallTop - split - 0.02, 0.03, sg * W / 4, split + (tallTop - split) / 2, hz, 0.006);
            var hb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 12), bar); hb.position.set(-sg * 0.04, split + 0.25 + 0.35, hz + 0.045); G.add(hb);
          });
          box(G, steel, W - 0.016, split - 0.03, 0.03, 0, 0.02 + (split - 0.03) / 2, hz, 0.006);
          box(G, bar, W * 0.6, 0.014, 0.016, 0, split - 0.09, hz + 0.03, 0.004);
          box(G, blackGlass, 0.16, 0.26, 0.006, -W / 4, split + 0.75, hz + 0.016, 0.004); // water and ice panel
          built++;
        });
        // base runs
        var runs = greedyRects(runM, nu, nv).map(function (rr) { return frameOf(rr, 0.4); }).filter(function (f) { return f && f.len >= 0.4; });
        var sinkDone = false;
        runs.forEach(function (f) {
          var G = group(f), Lr = f.len, Dd = Math.min(f.dep, 0.66), zb = -f.dep / 2, zf = zb + Dd, n = Math.max(1, Math.round(Lr / 0.6)), wm = Lr / n;
          var top = H - 0.03, fh = top - 0.1;
          box(G, plinth, Lr, 0.1, Dd - 0.07, 0, 0.05, zb + (Dd - 0.07) / 2);
          box(G, lacq, Lr, fh, Dd - 0.02, 0, 0.1 + fh / 2, zb + (Dd - 0.02) / 2);
          box(G, quartz, Lr, 0.03, Dd + 0.02, 0, H - 0.015, zb + (Dd + 0.02) / 2, 0.003);
          // which module carries the cooker (most appliance cells), which has a window behind
          var cook = -1, cookN = 0, rr = f.rr;
          for (var m = 0; m < n; m++) {
            var cnt = 0;
            for (var i = rr.i0; i < rr.i1; i++) for (var j = rr.j0; j < rr.j1; j++) {
              var p3 = A.clone().multiplyScalar(U0 + (i + 0.5) * CELLK).addScaledVector(C, V0 + (j + 0.5) * CELLK);
              var lx = (p3.x - f.ctr.x) * f.X.x + (p3.z - f.ctr.z) * f.X.z;
              if (lx >= -Lr / 2 + m * wm && lx < -Lr / 2 + (m + 1) * wm && code[i * nv + j] === 2) cnt++;
            }
            if (cnt > cookN) { cookN = cnt; cook = m; }
          }
          if (cookN * CELLK * CELLK < 0.06) cook = -1;
          var win = [];
          for (m = 0; m < n; m++) { var xm = -Lr / 2 + (m + 0.5) * wm; win.push(!f.island && !wallAt(G, xm, 1.75, zb + 0.05, 0.3)); }
          var sink = -1;
          if (!sinkDone) { for (m = 0; m < n; m++) if (win[m] && m !== cook) { sink = m; break; } if (sink < 0 && n >= 3 && !f.island) sink = cook === Math.floor(n / 2) ? 0 : Math.floor(n / 2); if (sink >= 0) sinkDone = true; }
          for (m = 0; m < n; m++) {
            var x = -Lr / 2 + (m + 0.5) * wm, zF = zf - 0.009 + 0.0;
            if (m === cook) { // built-in oven under a black glass hob
              box(G, lacq, wm - 0.004, 0.12, 0.018, x, top - 0.065, zF, 0.002); handle(G, x, top - 0.03, zF, wm * 0.5);
              var oh = 0.6, oy = top - 0.13 - oh / 2;
              box(G, blackGlass, wm - 0.03, oh, 0.02, x, oy, zF, 0.004);
              box(G, steel, wm - 0.03, 0.07, 0.022, x, oy + oh / 2 - 0.035, zF + 0.002, 0.003);
              box(G, bar, wm * 0.7, 0.014, 0.016, x, oy + oh / 2 - 0.1, zF + 0.03, 0.004);
              box(G, lacq, wm - 0.004, 0.1 + top - 0.13 - oh - 0.1 - 0.004, 0.018, x, 0.1 + (top - 0.13 - oh - 0.1) / 2, zF, 0.002);
              box(G, blackGlass, Math.min(0.58, wm - 0.02), 0.006, Math.min(0.5, Dd - 0.1), x, H + 0.003, zb + Dd / 2, 0.003);
              [[-0.13, -0.1, 0.09], [0.13, -0.1, 0.07], [-0.13, 0.12, 0.07], [0.13, 0.12, 0.09]].forEach(function (q) {
                var t2 = new THREE.Mesh(new THREE.TorusGeometry(q[2], 0.003, 6, 40), ring); t2.rotation.x = Math.PI / 2; t2.position.set(x + q[0], H + 0.007, zb + Dd / 2 + q[1]); G.add(t2);
              });
              if (!f.island) { // steel chimney hood to the ceiling
                box(G, steel, Math.min(0.9, wm + 0.1), 0.06, 0.5, x, 1.68, zb + 0.25, 0.006);
                var o = new THREE.Vector3(x, 1.7, zb + 0.12).applyMatrix4(G.matrix); rc.set(o, up); rc.near = 0; rc.far = 3;
                var ch = rc.intersectObjects(ceils, false)[0], ctop = ch ? ch.point.y - fy : 2.7;
                if (ctop > 1.8) box(G, steel, 0.26, ctop - 1.71, 0.24, x, 1.71 + (ctop - 1.71) / 2, zb + 0.12);
              }
              continue;
            }
            if (m % 3 === 1 && m !== sink) { // a drawer stack
              [[0.1, 0.2], [0.3, 0.26], [0.56, top - 0.56 - 0.1]].forEach(function (d) {
                var y0 = top - d[0] - 0.003, h2 = Math.max(0.12, d[1]) - 0.004; box(G, lacq, wm - 0.004, h2, 0.018, x, y0 - h2 / 2, zF, 0.002); handle(G, x, y0 - 0.04, zF, wm * 0.5);
              });
            } else { box(G, lacq, wm - 0.004, fh - 0.006, 0.018, x, 0.1 + fh / 2, zF, 0.002); handle(G, x, top - 0.05, zF, wm * 0.5); }
            if (m === sink) { // undermount steel sink and a chrome tap
              box(G, new THREE.MeshStandardMaterial({ color: 0x8E9196, metalness: 0.9, roughness: 0.25, clippingPlanes: [cutPlane] }), Math.min(0.5, wm - 0.1), 0.004, Math.min(0.4, Dd - 0.2), x, H + 0.001, zb + Dd / 2 + 0.03, 0.02);
              var tp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 16), bar); tp.position.set(x, H + 0.15, zb + 0.08); G.add(tp);
              var sp = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.011, 10, 24, Math.PI), bar); sp.position.set(x, H + 0.3, zb + 0.08 + 0.09); sp.rotation.y = Math.PI / 2; G.add(sp);
            }
          }
          // wall units: 60 cm modules where solid wall stands behind at 1.6 and 2.1 m; not over the hob, the sink window or a window
          if (!f.island) for (m = 0; m < n; m++) {
            if (m === cook || win[m]) continue;
            var x2 = -Lr / 2 + (m + 0.5) * wm;
            var solid = [x2 - wm / 2 + 0.06, x2, x2 + wm / 2 - 0.06].every(function (xx) { return wallAt(G, xx, 1.5, zb + 0.05, 0.3) && wallAt(G, xx, 1.85, zb + 0.05, 0.3) && wallAt(G, xx, 2.15, zb + 0.05, 0.3); });
            if (!solid) continue;
            box(G, lacq, wm - 0.004, 0.72, 0.33, x2, 1.45 + 0.36, zb + 0.165, 0.002);
            box(G, lacq, wm - 0.006, 0.716, 0.018, x2, 1.45 + 0.36, zb + 0.339, 0.002);
            handle(G, x2, 1.49, zb + 0.339, wm * 0.5);
            var led = new THREE.Mesh(new THREE.BoxGeometry(wm - 0.04, 0.006, 0.012), ledMat); led.position.set(x2, 1.447, zb + 0.29); G.add(led);
          }
          built++;
        });
      });
    });
    if (built) kitMeshes.forEach(function (o) { o.visible = false; });
  }
  var skirtGroup = new THREE.Group(); scene.add(skirtGroup);
  function buildSkirting() {
    if (!meshGroups.wall) return;
    var floors = D.levels.map(function (L) { return L.elevation + (L._slabTop || 0); }), segs = [];
    var e = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    meshGroups.wall.traverse(function (mesh) {
      if (!mesh.isMesh || mesh.material.side === THREE.BackSide) return;
      var g = mesh.geometry, idx = g.index ? g.index.array : null, pos = g.attributes.position, cnt = idx ? idx.length : pos.count;
      for (var t = 0; t < cnt; t += 3) {
        var vs = [0, 1, 2].map(function (i) { return new THREE.Vector3().fromBufferAttribute(pos, idx ? idx[t + i] : t + i).applyMatrix4(mesh.matrixWorld); });
        n.crossVectors(e.subVectors(vs[1], vs[0]), c.subVectors(vs[2], vs[0])); n.y = 0;
        if (n.lengthSq() < 1e-8) continue; n.normalize();
        var ymin = Math.min(vs[0].y, vs[1].y, vs[2].y), low = vs.filter(function (v) { return v.y - ymin < 0.004; });
        if (low.length !== 2 || low[0].distanceTo(low[1]) < 0.25) continue;
        if (!floors.some(function (f) { return Math.abs(ymin - f) < 0.04; })) continue;
        segs.push({ a: low[0], b: low[1], n: n.clone(), y: ymin });
      }
    });
    if (!segs.length) return;
    var mat = new THREE.MeshStandardMaterial({ color: 0xF4F2EE, roughness: 0.45, clippingPlanes: [cutPlane] });
    var inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, segs.length), M4 = new THREE.Matrix4(), S4 = new THREE.Matrix4(), R4 = new THREE.Matrix4(), mid = new THREE.Vector3(), d = new THREE.Vector3();
    segs.forEach(function (sg, i) {
      var len = sg.a.distanceTo(sg.b); d.subVectors(sg.b, sg.a).normalize();
      var th = Math.atan2(-d.z, d.x); R4.makeRotationY(th);
      mid.addVectors(sg.a, sg.b).multiplyScalar(0.5).addScaledVector(sg.n, 0.006);
      M4.makeTranslation(mid.x, sg.y + 0.045, mid.z).multiply(R4).multiply(S4.makeScale(len, 0.09, 0.012));
      inst.setMatrixAt(i, M4);
    });
    inst.receiveShadow = true; skirtGroup.add(inst);
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
    var WD = 0.6, HD = 0.22, LIP = 0.12, GAP = 0.08, nbs = 0;
    segs.forEach(function (s) { nbs += Math.max(1, Math.floor(s.a.distanceTo(s.b) / 1.2)); });
    var shelf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shelfMat, segs.length);
    var lip = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shelfMat, segs.length);
    var led = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ledMat, segs.length);
    var bandSpots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), ledMat, nbs), bi = 0;
    var glowM = glowMat.clone(); glowM.clippingPlanes = [cutPlane]; glowM.map = glowTexture(); glowMat = glowM;
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
      put(shelf, len, WD - LIP, HD, (WD - LIP) / 2, s.y - HD / 2);
      put(lip, len, LIP, HD - GAP, WD - LIP / 2, s.y - HD + (HD - GAP) / 2);
      put(led, len, 0.02, 0.012, WD - LIP + 0.025, s.y - GAP + 0.006);
      put(glow, len, 0.9, 0, WD + 0.3, s.y - 0.006, true);
      var nsp = Math.max(1, Math.floor(len / 1.2)), sm = new THREE.Matrix4();
      for (var k = 0; k < nsp; k++) {
        var t = (k + 0.5) / nsp - 0.5, px = mid.x + d.x * t * len + s.n.x * (WD - LIP) / 2, pz = mid.z + d.z * t * len + s.n.z * (WD - LIP) / 2;
        bandSpots.setMatrixAt(bi++, sm.makeTranslation(px, s.y - HD - 0.009, pz));
      }
    });
    [shelf, lip].forEach(function (m) { m.receiveShadow = true; m.castShadow = true; });
    coveGroup.add(shelf, lip, led, glow, bandSpots);
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
    var near = function (p, q) { return p.p.distanceToSquared(focus) - q.p.distanceToSquared(focus); };
    var ch = S.ceil === 'flat' ? [] : chandSpots.filter(function (s) { return s.level === li && s.p.distanceTo(focus) < 9; }).sort(near).slice(0, 2);
    ch.concat(spots.filter(function (s) { return s.level === li; }).sort(near).slice(0, pool.length - ch.length))
      .forEach(function (s, i) {
        pool[i].position.set(s.p.x, s.p.y - (s.chand ? 0 : 0.15), s.p.z);
        pool[i].intensity = (S.walk ? 1.3 : 0.9) * (s.chand ? 1.8 : 1); pool[i].distance = s.chand ? 9 : 7;
      });
  }
  var CEILS = [
    { id: 'spots', ar: 'سبوتات', en: 'Downlights', arD: 'سقف جبس مستوي وسبوتات LED دافئة 3000K كل 1.5 م، وثريات فوق الطاولات', enD: 'Flat gypsum ceiling, warm 3000K LED downlights every 1.5 m, chandeliers over the tables' },
    { id: 'cove', ar: 'سقف ساقط بإنارة مخفية', en: 'Drop ceiling, hidden light', arD: 'شريط جبس ساقط 60 سم على محيط الفراغ بفتحة إضاءة LED مخفية تنعكس على السقف، وسبوتات في الشريط، وثريات فوق الطاولات', enD: 'A 60 cm gypsum drop band round each space with a hidden LED slot washing the ceiling, downlights in the band, chandeliers over the tables' },
    { id: 'flat', ar: 'كما في الموديل', en: 'As modelled', arD: 'سقف بلا تجهيزات إضاءة', enD: 'Ceiling without light fittings' }
  ];
  function applyCeiling() {
    var sc = CEILS.filter(function (c) { return c.id === S.ceil; })[0] || CEILS[0];
    if (spotMesh) spotMesh.visible = sc.id !== 'flat';
    coveGroup.visible = sc.id === 'cove';
    chandGroup.visible = sc.id !== 'flat';
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
    setTimeout(function () { buildCeilings(); buildSkirting(); buildTrim(); applyCeiling(); dirtyShadow(); queueGlassEnv(); }, 80);
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
  function plaster(c, n, r) { // matte emulsion over skimmed plaster: soft mottling, roller stipple
    c.fillStyle = '#f7f6f3'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 40; i++) { var gx = r() * n, gy = r() * n, g = c.createRadialGradient(gx, gy, 0, gx, gy, 40 + r() * 100);
      g.addColorStop(0, 'rgba(' + (r() < 0.5 ? '0,0,0,.005' : '255,255,255,.015') + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }
    for (i = 0; i < 16000; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0,.018' : '255,255,255,.04') + ')'; c.fillRect(r() * n, r() * n, 1.4, 1.4); }
  }
  function gypsum(c, n, r) { // smooth painted gypsum board
    c.fillStyle = '#fbfbfa'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 6000; i++) { c.fillStyle = 'rgba(0,0,0,.018)'; c.fillRect(r() * n, r() * n, 1.2, 1.2); }
  }
  function boucle(c, n, r) { // looped boucle wool
    c.fillStyle = '#f1ede6'; c.fillRect(0, 0, n, n);
    for (var i = 0; i < 5200; i++) {
      var x = r() * n, y = r() * n, rad = 1.5 + r() * 2.5;
      c.strokeStyle = 'rgba(' + (r() < 0.5 ? '90,80,70,.16' : '255,255,255,.5') + ')'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke();
    }
  }
  function travertine(c, n, r) { // warm travertine: soft horizontal veining and small pits
    c.fillStyle = '#ece4d6'; c.fillRect(0, 0, n, n);
    for (var k = 0; k < 40; k++) { c.fillStyle = 'rgba(190,170,140,' + (0.05 + r() * 0.08) + ')'; c.fillRect(0, r() * n, n, 1 + r() * 7); }
    for (var i = 0; i < 1400; i++) { c.fillStyle = 'rgba(150,128,100,' + (0.08 + r() * 0.14) + ')'; c.beginPath(); c.ellipse(r() * n, r() * n, 0.4 + r() * 1.4, 0.2 + r() * 0.5, 0, 0, Math.PI * 2); c.fill(); }
    for (i = 0; i < 9000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.025)' : 'rgba(255,255,255,.05)'; c.fillRect(r() * n, r() * n, 1.3, 1.3); }
  }
  function woolPlain(c, n, r) { // cut-pile wool: an even field with soft tonal variation
    c.fillStyle = '#efe9df'; c.fillRect(0, 0, n, n);
    for (var k = 0; k < 30; k++) { var gx = r() * n, gy = r() * n, g = c.createRadialGradient(gx, gy, 0, gx, gy, 60 + r() * 120); g.addColorStop(0, 'rgba(' + (r() < 0.5 ? '0,0,0,.025' : '255,255,255,.04') + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }
    for (var i = 0; i < 42000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)'; c.fillRect(r() * n, r() * n, 1.5, 1.5); }
  }
  function carved(c, n, r) { // hand-carved rug: fields of parallel grooves and concentric arcs
    c.fillStyle = '#efe9df'; c.fillRect(0, 0, n, n);
    c.strokeStyle = 'rgba(120,110,95,.22)'; c.lineWidth = 1.6;
    for (var y = 0; y < n / 2; y += 7) { c.beginPath(); c.moveTo(0, y); c.lineTo(n / 2, y); c.stroke(); }
    for (var x = n / 2; x < n; x += 7) { c.beginPath(); c.moveTo(x, n / 2); c.lineTo(x, n); c.stroke(); }
    [[n / 2, n / 2, n / 2], [0, n, n / 2], [n, 0, n / 2]].forEach(function (o) {
      for (var rr = 8; rr < o[2]; rr += 7) { c.beginPath(); c.arc(o[0], o[1], rr, 0, Math.PI * 2); c.stroke(); }
    });
    c.strokeStyle = 'rgba(120,110,95,.3)'; c.lineWidth = 3; c.strokeRect(0, 0, n, n);
    for (var i = 0; i < 30000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)'; c.fillRect(r() * n, r() * n, 1.5, 1.5); } // wool pile
  }

  // Walnut, Calacatta marble and leather carry their own colours (the material colour stays white),
  // and repeat without seams so the world-space projection shows no joints.
  function walnut(c, n, r) { // straight-grained walnut veneer, grain running along the canvas x
    c.fillStyle = '#5B4334'; c.fillRect(0, 0, n, n);
    for (var b = 0; b < 26; b++) { // broad streaks of lighter and darker wood
      var y = r() * n, h = 6 + r() * 40, col = r() < 0.5 ? 'rgba(34,24,18,' + (0.12 + r() * 0.18) + ')' : 'rgba(138,110,86,' + (0.08 + r() * 0.14) + ')';
      c.filter = 'blur(' + (3 + r() * 6) + 'px)'; c.fillStyle = col;
      [-n, 0, n].forEach(function (o) { c.fillRect(-20, y + o, n + 40, h); });
    }
    c.filter = 'none';
    for (var i = 0; i < 380; i++) { // fine fibres, waves with whole periods across the tile
      var yy = r() * n, a = 1 + r() * 3, k = (1 + ((r() * 3) | 0)) * Math.PI * 2 / n, ph = r() * 6.28;
      c.strokeStyle = 'rgba(' + (r() < 0.7 ? '28,19,13,' + (0.05 + r() * 0.11) : '160,130,102,' + (0.04 + r() * 0.07)) + ')';
      c.lineWidth = 0.5 + r() * 1.3;
      [-n, 0, n].forEach(function (o) { c.beginPath(); for (var x = 0; x <= n; x += 8) c[x ? 'lineTo' : 'moveTo'](x, yy + o + Math.sin(x * k + ph) * a); c.stroke(); });
    }
    for (i = 0; i < 2500; i++) { c.fillStyle = 'rgba(20,10,5,' + (0.08 + r() * 0.12) + ')'; c.fillRect(r() * n, r() * n, 2 + r() * 5, 0.8); } // pores
  }
  function calacatta(c, n, r) { // warm white marble, soft grey veins with a few gold ones
    c.fillStyle = '#F5F2EC'; c.fillRect(0, 0, n, n);
    for (var k = 0; k < 14; k++) { var gx = r() * n, gy = r() * n, g = c.createRadialGradient(gx, gy, 0, gx, gy, 80 + r() * 160); g.addColorStop(0, r() < 0.5 ? 'rgba(225,219,208,.35)' : 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }
    var cv = document.createElement('canvas'); cv.width = cv.height = n; var v = cv.getContext('2d');
    veins(v, n, r, 7, '120,118,122', 1.4); veins(v, n, r, 4, '176,142,88', 1.1); veins(v, n, r, 10, '150,148,150', 0.6);
    [-n, 0, n].forEach(function (ox) { [-n, 0, n].forEach(function (oy) { c.drawImage(cv, ox, oy); }); }); // veins that cross an edge come back on the other side
  }
  function leather(c, n, r) { // cognac leather: tonal clouds and a fine pebble grain
    c.fillStyle = '#7A4C33'; c.fillRect(0, 0, n, n);
    for (var k = 0; k < 24; k++) { var gx = r() * n, gy = r() * n, rad = 40 + r() * 120;
      [-n, 0, n].forEach(function (ox) { [-n, 0, n].forEach(function (oy) { var g = c.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, r() < 0.5 ? 'rgba(50,28,16,.1)' : 'rgba(170,120,88,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }); }); }
    for (var i = 0; i < 12000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(40,20,10,.035)' : 'rgba(255,220,190,.025)'; c.beginPath(); c.arc(r() * n, r() * n, 0.5 + r() * 0.7, 0, 6.283); c.fill(); }
  }
  function procFor(kind) {
    if (!procTex[kind]) {
      var c = document.createElement('canvas'); c.width = c.height = 512;
      var cx = c.getContext('2d');
      if (kind === 'woodV' || kind === 'walnutV') { cx.translate(512, 0); cx.rotate(Math.PI / 2); } // grain running up the door
      ({ wood: grain, woodV: grain, fabric: weave, stone: speckle, rug: woolPlain, marble: marble, boucle: boucle, travertine: travertine, plaster: plaster, gypsum: gypsum, walnut: walnut, walnutV: walnut, calacatta: calacatta, leather: leather })[kind](cx, 512, rng({ wood: 11, woodV: 29, fabric: 13, stone: 17, rug: 19, marble: 23, boucle: 31, travertine: 37, plaster: 41, gypsum: 43, walnut: 47, walnutV: 47, calacatta: 53, leather: 59 }[kind]));
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      procTex[kind] = t;
    }
    return procTex[kind];
  }
  // World-space texture projection blended by the face's normal (works without UVs).
  function triplanar(mat, tex, sx, sy, bump, zones) {
    mat.userData.triTex = tex;
    bump = 0; // relief from the texture shows as pixel blocks up close: off
    mat.onBeforeCompile = function (sh) {
      if (zones) { var Z = zoneUniforms(); Object.keys(Z).forEach(function (k) { sh.uniforms[k] = Z[k]; }); }
      sh.uniforms.triMap = mat.userData.triMapU || (mat.userData.triMapU = { value: tex }); mat.userData.triTex = tex; sh.uniforms.triScale = { value: new THREE.Vector2(1 / sx, 1 / sy) }; sh.uniforms.triBump = { value: bump };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', ['#include <common>', 'varying vec3 vTriPos;', 'uniform sampler2D triMap;', 'uniform vec2 triScale;', 'uniform float triBump;', zones ? 'uniform sampler2D zoneMask; uniform sampler2D zoneTile; uniform vec4 zoneLv; uniform vec4 zoneB; float zoneW = 0.0;' : '',
        'vec3 triPerturb(vec3 sp, vec3 sn, vec2 dH) {',
        '  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);',
        '  float det = dot(sx, r1) * (gl_FrontFacing ? 1.0 : -1.0);',
        '  return normalize(abs(det) * sn - sign(det) * (dH.x * r1 + dH.y * r2));',
        '}'].join('\n'))
        .replace('#include <map_fragment>', [
          'vec3 triN = abs(normalize(cross(dFdx(vTriPos), dFdy(vTriPos))));',
          'vec3 triW = pow(triN, vec3(4.0)); triW /= (triW.x + triW.y + triW.z);',
          'vec4 triT = texture2D(triMap, vTriPos.zy * triScale) * triW.x + texture2D(triMap, vTriPos.xz * triScale) * triW.y + texture2D(triMap, vTriPos.xy * triScale) * triW.z;',
          'diffuseColor *= sRGBToLinear(triT);',
          zones ? [
            '{ vec3 zn = normalize(cross(dFdx(vTriPos), dFdy(vTriPos))); if (dot(zn, cameraPosition - vTriPos) < 0.0) zn = -zn;',
            '  vec2 zp = vTriPos.xz + zn.xz * 0.15;',
            '  float li = vTriPos.y < zoneLv.y - 0.3 ? 0.0 : vTriPos.y < zoneLv.z - 0.3 ? 1.0 : vTriPos.y < zoneLv.w - 0.3 ? 2.0 : 3.0;',
            '  float fy = li < 0.5 ? zoneLv.x : li < 1.5 ? zoneLv.y : li < 2.5 ? zoneLv.z : zoneLv.w;',
            '  vec4 zm = texture2D(zoneMask, vec2(((zp.x - zoneB.x) / zoneB.z + li) * 0.25, (zp.y - zoneB.y) / zoneB.z));',
            '  float hy = vTriPos.y - fy;',
            '  zoneW = (abs(zn.y) < 0.5) ? max(step(0.5, zm.r), step(0.5, zm.g) * step(0.9, hy) * step(hy, 1.55)) : 0.0;',
            '  vec4 zt = texture2D(zoneTile, vTriPos.zy / 2.4) * triW.x + texture2D(zoneTile, vTriPos.xz / 2.4) * triW.y + texture2D(zoneTile, vTriPos.xy / 2.4) * triW.z;',
            '  diffuseColor.rgb = mix(diffuseColor.rgb, sRGBToLinear(zt).rgb, zoneW); }'].join('\n') : ''].join('\n'));
      if (zones) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.14, zoneW);');
      if (bump > 0) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        'vec4 triS = texture2D(triMap, vTriPos.zy * triScale, 2.5) * triW.x + texture2D(triMap, vTriPos.xz * triScale, 2.5) * triW.y + texture2D(triMap, vTriPos.xy * triScale, 2.5) * triW.z;', 'float triH = dot(triS.rgb, vec3(0.3333));',
        'normal = triPerturb(-vViewPosition, normal, vec2(dFdx(triH), dFdy(triH)) * triBump' + (zones ? ' * (1.0 - zoneW)' : '') + ');'].join('\n'));
    };
    mat.customProgramCacheKey = function () { return 'triplanar' + (bump > 0 ? 'b' : '') + (zones ? 'z' : ''); };
    mat.extensions = { derivatives: true };
    return mat;
  }
  var BUMP = { fabric: 0.25, boucle: 0.45, rug: 0.6, travertine: 0.3, stone: 0.2, wood: 0.1 }; // relief per texture
  function makeMaterial(p, smooth) {
    var mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.rough, metalness: p.metal, flatShading: !smooth,
      envMapIntensity: p.metal ? 1 : 0.7, side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
    furnMats.push({ mat: mat, p: p });
    return p.tex ? triplanar(mat, procFor(p.tex), p.scale, p.scale, BUMP[p.tex] || 0) : mat;
  }
  /* Interior palettes: with a finish scheme chosen, the furniture is dressed to match it rather
     than keeping a mix of Revit colours. Each proposed kind maps to a slot of the palette, the
     original lightness choosing between light/dark variants, so bedding stays lighter than a
     headboard and cushions stay darker than a sofa. 'revit' keeps the per-piece proposal. */
  var furnMats = [];
  var PALETTES = {
    classic: { woodL: '#B08A64', woodD: '#5A3A26', fabL: '#EFE8DC', fabM: '#CDBFA8', fabD: '#6B5A4A', accent: '#7A5C3A', metal: '#B8955A', rug: '#5F5245' },
    warm: { woodL: '#C29B72', woodD: '#7A5235', fabL: '#ECE4D6', fabM: '#C9B79C', fabD: '#7B5E4B', accent: '#B5654A', metal: '#2A2A2A', metalRough: 0.45, rug: '#5E4A38' },
    calm: { woodL: '#B3A898', woodD: '#4A4440', fabL: '#E9E7E3', fabM: '#B9B6B0', fabD: '#55565A', accent: '#22324A', metal: '#B8BABC', rug: '#55524E' }
  };
  function paletteFor(p, pal) {
    var l = p.hsl && p.hsl.l != null ? p.hsl.l : 0.5;
    switch (p.kind) {
      case 'wood': return { color: '#F3F2EF', rough: 0.2, plain: true }; // white lacquer
      case 'fabric': return { color: l > 0.82 ? pal.fabL : pal.fabM };
      case 'charcoal': return { color: pal.fabD };
      case 'accent': return { color: pal.accent };
      case 'metal': return { color: pal.metal, rough: pal.metalRough || 0.3 };
      case 'rug': return { color: pal.rug };
    }
    return null;
  }
  var plainT = null;
  function plainTex() { if (!plainT) { var c = document.createElement('canvas'); c.width = c.height = 4; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); plainT = new THREE.CanvasTexture(c); } return plainT; }
  function dressFurniture(scheme) {
    var pal = PALETTES[scheme];
    furnMats.forEach(function (f) {
      var v = pal ? paletteFor(f.p, pal) : null;
      f.mat.color.set(v ? v.color : f.p.color);
      f.mat.roughness = v && v.rough != null ? v.rough : f.p.rough;
      var ud = f.mat.userData, u = ud.triMapU || (ud.triTex ? (ud.triMapU = { value: ud.triTex }) : null); // may run before the shader compiles
      if (u) u.value = v && v.plain ? plainTex() : ud.triTex;
    });
  }
  function lookMaterial(b, smooth) {
    // aluminium/steel doors (curtain-wall and service doors) keep a metal finish
    if ((b.grp === 'door' || b.grp === 'leaf') && nameKind(lookOf(b)) !== 'metal') return doorWoodMat();
    if (!PROPOSE[b.grp]) return new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85, flatShading: true, envMapIntensity: 0.75,
      side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
    return makeMaterial(proposal(b), smooth);
  }

  /* Furniture geometry: rugs (thin horizontal pieces lying on a floor) are split off and dressed
     as wool; the rest gets smooth shading with a 35-degree crease, so cushions, chairs and plants
     read as soft forms while box edges stay crisp. */
  var COS_CREASE = Math.cos(35 * Math.PI / 180), WET = { wet: 1 };
  var KITCHEN = { kitchen: 1 }, SERVICE = { service: 1 };
  var KIT = [], kitMeshes = [];
  function furnParts(g, cabinets, kitAll) {
    var p = g.attributes.position.array, idx = g.index.array, k = MESH.step / 1000, oy = MESH.origin[1] / 1000;
    var floors = D.levels.map(function (L) { return L.elevation + (L._slabTop || 0); });
    function onFloor(y) { for (var i = 0; i < floors.length; i++) if (y >= floors[i] - 0.01 && y <= floors[i] + 0.055) return true; return false; } // rugs up to 5 cm thick
    var keep = [], rug = [], wet = [], top = [], kit = [], ven = [], ox = MESH.origin[0] / 1000, oz = MESH.origin[2] / 1000;
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (onFloor(p[a * 3 + 1] * k + oy) && onFloor(p[b * 3 + 1] * k + oy) && onFloor(p[c * 3 + 1] * k + oy)) { rug.push(a, b, c); continue; }
      // pieces standing in bathrooms/WCs are sanitary ware: porcelain, not fabric
      var cx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3 * k + ox, cy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3 * k + oy, cz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3 * k + oz;
      if (kitAll && roomAt(cx - CX, cy, cz + CY, KITCHEN)) { // kitchen casework and appliances
        kit.push(a, b, c);
        KIT.push({ v: [a, b, c].map(function (q) { return [p[q * 3] * k + ox - CX, p[q * 3 + 1] * k + oy, p[q * 3 + 2] * k + oz + CY]; }), wood: !!cabinets });
        continue;
      }
      if (cabinets) {
        var ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var fl = levelAt(cy), hy = cy - (fl.elevation + (fl._slabTop || 0));
        if (ny / nl > 0.95 && hy > 0.7 && hy < 1.0 && roomAt(cx - CX, cy, cz + CY, KITCHEN)) { top.push(a, b, c); continue; }
        // outside kitchens and wet rooms: the boards (shelves, desk and console tops, their front
        // edges) in walnut, the carcass and doors staying white lacquer
        var svc = roomAt(cx - CX, cy, cz + CY, SERVICE);
        if (hy > 0.15 && !roomAt(cx - CX, cy, cz + CY, KITCHEN) && !roomAt(cx - CX, cy, cz + CY, WET) && !(svc && !/dress|closet/i.test(svc.name || ''))) {
          var y0 = Math.min(p[a * 3 + 1], p[b * 3 + 1], p[c * 3 + 1]) * k, y1 = Math.max(p[a * 3 + 1], p[b * 3 + 1], p[c * 3 + 1]) * k, an = Math.abs(ny / nl);
          if (an > 0.95 || (an < 0.2 && y1 - y0 < 0.045)) { ven.push(a, b, c); continue; }
        }
      }
      (roomAt(cx - CX, cy, cz + CY, WET) ? wet : keep).push(a, b, c);
    }
    var rugGeo = null;
    if (rug.length >= 6) { rugGeo = new THREE.BufferGeometry(); rugGeo.setAttribute('position', g.attributes.position); rugGeo.setIndex(rug); }
    return { main: keep.length ? creased(p, keep) : null, rug: rugGeo, wet: wet.length ? creased(p, wet) : null, top: top.length ? creased(p, top) : null, kit: kit.length ? creased(p, kit) : null, ven: ven.length ? creased(p, ven) : null };
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

  /* ---------- realistic furniture in the Revit layout ----------
     Revit's sofas, beds, tables and chairs are simple blocks. Each listed piece (D.furniture:
     insertion point and X axis) is read from its own exported geometry as a height map in its
     local frame; from that the viewer finds the seat, back and arms of a sofa module, the
     headboard, mattress and nightstands of a bed, the top of a table and the chairs around a
     dining table, then builds a detailed piece of the same size, position and orientation
     (cushions, base, legs, bedding, tufted headboard, marble tops). The Revit block is hidden;
     "Realistic furniture" in the finishes panel switches back to it. */
  var elemGroups = {}, elemTris = {}, realGroup = new THREE.Group(), realBuilt = false;
  scene.add(realGroup);
  function elemGroup(id, grp) {
    if (!elemGroups[id]) { elemGroups[id] = new THREE.Group(); elemGroups[id].userData.elemId = id; grp.add(elemGroups[id]); }
    return elemGroups[id];
  }
  function collectTris(id, g, root) {
    var p = g.attributes.position.array, idx = g.index.array, k = MESH.step / 1000, rp = root.position;
    var out = elemTris[id] || (elemTris[id] = []);
    for (var t = 0; t < idx.length; t++) {
      var v = idx[t] * 3; out.push(p[v] * k + rp.x, p[v + 1] * k + rp.y, p[v + 2] * k + rp.z);
    }
  }
  var CELL = 0.04;
  // Height map of a piece in its frame: u along its X axis, v = X x up, h above its lowest point.
  function heightMap(tris, O, A, C) {
    var n = tris.length / 9, us = [], vs = [], hs = [], minY = Infinity, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (var i = 0; i < tris.length; i += 3) {
      var dx = tris[i] - O.x, dz = tris[i + 2] - O.z, u = dx * A.x + dz * A.z, v = dx * C.x + dz * C.z;
      us.push(u); vs.push(v); hs.push(tris[i + 1]); minY = Math.min(minY, tris[i + 1]);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    var nu = Math.max(1, Math.ceil((u1 - u0) / CELL)), nv = Math.max(1, Math.ceil((v1 - v0) / CELL)), H = new Float32Array(nu * nv).fill(-1);
    for (var t = 0; t < n; t++) {
      var a = t * 3, b = a + 1, c = a + 2;
      var minU = Math.min(us[a], us[b], us[c]), maxU = Math.max(us[a], us[b], us[c]), minV = Math.min(vs[a], vs[b], vs[c]), maxV = Math.max(vs[a], vs[b], vs[c]);
      var i0 = Math.max(0, Math.floor((minU - u0) / CELL)), i1 = Math.min(nu - 1, Math.floor((maxU - u0) / CELL));
      var j0 = Math.max(0, Math.floor((minV - v0) / CELL)), j1 = Math.min(nv - 1, Math.floor((maxV - v0) / CELL));
      var den = (vs[b] - vs[c]) * (us[a] - us[c]) + (us[c] - us[b]) * (vs[a] - vs[c]);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
        var pu = u0 + (i + 0.5) * CELL, pv = v0 + (j + 0.5) * CELL, w0, w1, w2;
        if (Math.abs(den) < 1e-12) { // a vertical face: it only lifts the cells along its edge
          if (pu < minU - CELL || pu > maxU + CELL || pv < minV - CELL || pv > maxV + CELL) continue;
          w0 = w1 = w2 = 1 / 3;
          var hv = Math.max(hs[a], hs[b], hs[c]) - minY;
          if (Math.min(Math.abs(pu - minU), Math.abs(pu - maxU)) > CELL && Math.min(Math.abs(pv - minV), Math.abs(pv - maxV)) > CELL) continue;
          if (hv > H[i * nv + j]) H[i * nv + j] = hv;
          continue;
        }
        w0 = ((vs[b] - vs[c]) * (pu - us[c]) + (us[c] - us[b]) * (pv - vs[c])) / den;
        w1 = ((vs[c] - vs[a]) * (pu - us[c]) + (us[a] - us[c]) * (pv - vs[c])) / den;
        w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        var h = w0 * hs[a] + w1 * hs[b] + w2 * hs[c] - minY;
        if (h > H[i * nv + j]) H[i * nv + j] = h;
      }
    }
    return { H: H, nu: nu, nv: nv, u0: u0, v0: v0, u1: u1, v1: v1, base: minY };
  }
  function hAt(m, i, j) { return i < 0 || j < 0 || i >= m.nu || j >= m.nv ? -1 : m.H[i * m.nv + j]; }
  function cellsWhere(m, fn) { var out = []; for (var i = 0; i < m.nu; i++) for (var j = 0; j < m.nv; j++) { var h = m.H[i * m.nv + j]; if (h > 0.02 && fn(h, i, j)) out.push([i, j, h]); } return out; }
  function median(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }
  // Sides of the piece's rectangle: 0 = u-min, 1 = u-max, 2 = v-min, 3 = v-max.
  function stripStats(m, side, depth, thr) {
    var cnt = 0, high = 0, maxh = 0, k = Math.max(1, Math.round(depth / CELL));
    for (var i = 0; i < m.nu; i++) for (var j = 0; j < m.nv; j++) {
      var inS = side === 0 ? i < k : side === 1 ? i >= m.nu - k : side === 2 ? j < k : j >= m.nv - k;
      var h = m.H[i * m.nv + j]; if (!inS || h <= 0.02) continue;
      cnt++; if (h > thr) high++; if (h > maxh) maxh = h;
    }
    return { frac: cnt ? high / cnt : 0, maxh: maxh, cnt: cnt };
  }
  // Rounded box: a segmented box whose corners are pushed onto spheres of radius r.
  var rbCache = {};
  function rboxGeo(w, h, d, r) {
    r = Math.max(0.002, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
    var key = [w, h, d, r].map(function (x) { return x.toFixed(3); }).join(',');
    if (rbCache[key]) return rbCache[key];
    var g = new THREE.BoxGeometry(w, h, d, 5, 5, 5), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    var lo = new THREE.Vector3(-w / 2 + r, -h / 2 + r, -d / 2 + r), hi = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); c.copy(v).clamp(lo, hi); v.sub(c);
      if (v.lengthSq() > 1e-12) v.setLength(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return (rbCache[key] = g);
  }
  var realMats = {};
  function rmat(kind, l, hex, rough, tex, scale, metal) {
    var key = [kind, l, hex, tex].join('|');
    if (!realMats[key]) realMats[key] = makeMaterial({ kind: kind, color: new THREE.Color(hex), rough: rough, metal: metal || 0, tex: tex || null, scale: scale || 1, hsl: { l: l } }, true);
    return realMats[key];
  }
  function M() { // the scheme-aware materials of the real pieces
    return {
      body: rmat('fabric', 0.7, '#CDBFA8', 0.95, 'fabric', 0.16), cushion: rmat('fabric', 0.9, '#EFE8DC', 0.95, 'fabric', 0.16),
      accent: rmat('accent', 0.4, '#7A5C3A', 0.85, 'fabric', 0.16), plinth: rmat('charcoal', 0.15, '#2B2B2D', 0.6),
      wood: rmat('wood', 0.3, '#5A3A26', 0.5, 'wood', 0.6), woodL: rmat('wood', 0.6, '#B08A64', 0.5, 'wood', 0.6),
      metal: rmat('metal', 0.5, '#B8955A', 0.3, null, 1, 0.9), linen: rmat('linen', 0.95, '#F3F0EA', 0.95, 'fabric', 0.12),
      top: rmat('top', 0.9, '#F1EEE8', 0.15, 'marble', 0.9), shade: rmat('linen', 0.95, '#EFE7D8', 0.9, 'fabric', 0.1)
    };
  }
  function put(group, geo, mat, x, y, z, ry, rx) {
    var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (ry) m.rotation.y = ry; if (rx) m.rotation.x = rx;
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  }
  // A box against side s: `depth` inward from the edge, spanning [a0, a1] along the side.
  function sideRect(r, s, off, depth, a0, a1) {
    if (s === 0) return { u: r.u0 + off + depth / 2, v: (a0 + a1) / 2, du: depth, dv: a1 - a0 };
    if (s === 1) return { u: r.u1 - off - depth / 2, v: (a0 + a1) / 2, du: depth, dv: a1 - a0 };
    if (s === 2) return { u: (a0 + a1) / 2, v: r.v0 + off + depth / 2, du: a1 - a0, dv: depth };
    return { u: (a0 + a1) / 2, v: r.v1 - off - depth / 2, du: a1 - a0, dv: depth };
  }
  function along(r, s) { return s < 2 ? [r.v0, r.v1] : [r.u0, r.u1]; }
  function occRect(m, fn) { // bounds of the cells matching fn, in frame units
    var c = cellsWhere(m, fn); if (!c.length) return null;
    var i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1;
    c.forEach(function (x) { i0 = Math.min(i0, x[0]); i1 = Math.max(i1, x[0]); j0 = Math.min(j0, x[1]); j1 = Math.max(j1, x[1]); });
    return { u0: m.u0 + i0 * CELL, u1: m.u0 + (i1 + 1) * CELL, v0: m.v0 + j0 * CELL, v1: m.v0 + (j1 + 1) * CELL, n: c.length, cells: c };
  }

  /* ---------- seating ----------
     One reading of the Revit piece (footprint, seat height, which sides are backs or arms),
     then a style chosen by the room it stands in:
     - living / family rooms: a tailored contemporary sofa (track arms, crowned seat cushions,
       loose plump back cushions, layered scatter pillows, a throw) on a recessed plinth, with a
       tone-on-tone hand-tufted rug in front;
     - majlis: low Arabic seating on a walnut base with a gold inlay, piped seat mattresses,
       upright back cushions, bolsters at the open ends and a bordered medallion rug;
     - bedrooms: a soft boucle loveseat on walnut legs, or a barrel lounge chair. */
  var puffCache = {};
  function puffyGeo(w, h, d, r, px, py, pz) { // rounded box whose faces bulge like a filled cushion
    var key = [w, h, d, r, px, py, pz].map(function (x) { return (+x).toFixed(3); }).join(',');
    if (puffCache[key]) return puffCache[key];
    r = Math.max(0.003, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    var g = new THREE.BoxGeometry(w, h, d, 8, 6, 8), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    var lo = new THREE.Vector3(-w / 2 + r, -h / 2 + r, -d / 2 + r), hi = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var nx = v.x / (w / 2), ny = v.y / (h / 2), nz = v.z / (d / 2);
      var bx = px * (1 - ny * ny) * (1 - nz * nz) * nx, by = py * (1 - nx * nx) * (1 - nz * nz) * ny, bz = pz * (1 - nx * nx) * (1 - ny * ny) * nz;
      c.copy(v).clamp(lo, hi); v.sub(c); if (v.lengthSq() > 1e-12) v.setLength(r); v.add(c);
      p.setXYZ(i, v.x + bx, v.y + by, v.z + bz);
    }
    g.computeVertexNormals();
    return (puffCache[key] = g);
  }
  function tilt(o, sd, t) { if (sd === 0) o.rotation.z = t; if (sd === 1) o.rotation.z = -t; if (sd === 2) o.rotation.x = -t; if (sd === 3) o.rotation.x = t; }
  function occFrac(m, q, minH) {
    var i0 = Math.max(0, Math.floor((q.u0 - m.u0) / CELL)), i1 = Math.min(m.nu - 1, Math.ceil((q.u1 - m.u0) / CELL) - 1);
    var j0 = Math.max(0, Math.floor((q.v0 - m.v0) / CELL)), j1 = Math.min(m.nv - 1, Math.ceil((q.v1 - m.v0) / CELL) - 1), tot = 0, ok = 0;
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { tot++; if (m.H[i * m.nv + j] > minH) ok++; }
    return tot ? ok / tot : 0;
  }
  function pipeRect(G, mat, x, y, z, w, d) { // a 5 mm welt round a cushion's top
    var a1 = put(G, new THREE.CylinderGeometry(0.005, 0.005, w, 8), mat, x, y, z + d / 2); a1.rotation.z = Math.PI / 2;
    var a2 = put(G, new THREE.CylinderGeometry(0.005, 0.005, w, 8), mat, x, y, z - d / 2); a2.rotation.z = Math.PI / 2;
    var b1 = put(G, new THREE.CylinderGeometry(0.005, 0.005, d, 8), mat, x + w / 2, y, z); b1.rotation.x = Math.PI / 2;
    var b2 = put(G, new THREE.CylinderGeometry(0.005, 0.005, d, 8), mat, x - w / 2, y, z); b2.rotation.x = Math.PI / 2;
  }
  // Turned vessels (vases, bowls, candle holders) from a profile: [radius, height] pairs.
  var latheCache = {};
  function lathe(key, prof) {
    if (!latheCache[key]) { var g = new THREE.LatheGeometry(prof.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), 40); g.computeVertexNormals(); latheCache[key] = g; }
    return latheCache[key];
  }
  var VASES = {
    tall: [[0, 0], [0.06, 0], [0.075, 0.04], [0.085, 0.12], [0.07, 0.22], [0.035, 0.29], [0.03, 0.32], [0.036, 0.335], [0, 0.335]],
    round: [[0, 0], [0.05, 0], [0.095, 0.05], [0.105, 0.1], [0.085, 0.16], [0.045, 0.19], [0.04, 0.2], [0, 0.2]],
    bowl: [[0, 0], [0.05, 0], [0.11, 0.04], [0.14, 0.075], [0.135, 0.08], [0.1, 0.05], [0, 0.04]],
    candle: [[0, 0], [0.035, 0], [0.035, 0.01], [0.012, 0.02], [0.01, 0.16], [0.025, 0.17], [0.025, 0.18], [0, 0.18]]
  };
  function vessel(G, kind, mat, x, y, z, sc) { var m = new THREE.Mesh(lathe(kind, VASES[kind]), mat); m.position.set(x, y, z); if (sc) m.scale.setScalar(sc); m.castShadow = m.receiveShadow = true; G.add(m); return m; }
  function seatFrame(m) {
    var r = occRect(m, function () { return true; }); if (!r) return null;
    var top = 0; cellsWhere(m, function (h) { if (h > top) top = h; return false; });
    var seatH = median(cellsWhere(m, function (h) { return h > 0.25 && h < 0.6; }).map(function (c) { return c[2]; })) || 0.42;
    var thr = seatH + 0.12, sides = [0, 1, 2, 3].map(function (s) { return stripStats(m, s, Math.min(0.3, ((s < 2 ? r.u1 - r.u0 : r.v1 - r.v0)) * 0.3), thr); });
    var backs = [], arms = [];
    sides.forEach(function (st, s) { if (st.frac > 0.5) (st.maxh >= top - 0.1 ? backs : arms).push(s); });
    if (!backs.length && arms.length) backs.push(arms.shift());
    return { m: m, r: r, top: top, seatH: seatH, sides: sides, backs: backs, arms: arms };
  }
  function innerRect(F, BK, AW) {
    var r = F.r, s = { u0: r.u0, u1: r.u1, v0: r.v0, v1: r.v1 };
    F.backs.concat(F.arms).forEach(function (sd) { var t = F.backs.indexOf(sd) >= 0 ? BK : AW; if (sd === 0) s.u0 += t; if (sd === 1) s.u1 -= t; if (sd === 2) s.v0 += t; if (sd === 3) s.v1 -= t; });
    return s;
  }
  function seatCells(F, s, la, lb) { // the seat area cut into cushions, keeping only occupied ones (L and U shapes)
    var lenU = s.u1 - s.u0, lenV = s.v1 - s.v0, nu, nv, out = [];
    if (lenU <= 0.1 || lenV <= 0.1) return out;
    if (lenU >= lenV) { nu = Math.max(1, Math.round(lenU / la)); nv = lenV > 1.25 ? Math.max(1, Math.round(lenV / lb)) : 1; }
    else { nv = Math.max(1, Math.round(lenV / la)); nu = lenU > 1.25 ? Math.max(1, Math.round(lenU / lb)) : 1; }
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var q = { u0: s.u0 + lenU * i / nu, u1: s.u0 + lenU * (i + 1) / nu, v0: s.v0 + lenV * j / nv, v1: s.v0 + lenV * (j + 1) / nv };
      if (occFrac(F.m, q, 0.15) > 0.6) out.push(q);
    }
    return out;
  }
  function backSpan(F, sd, BK) { // a back's run, stopping at the backs at right angles to it
    var ax = along(F.r, sd), a0 = ax[0], a1 = ax[1];
    F.backs.forEach(function (o) { if (o === sd || (o < 2) === (sd < 2)) return; if (o === 0 || o === 2) a0 += BK; else a1 -= BK; });
    return [a0, a1];
  }
  function runCells(F, sd, a0, a1, step, minH) { // pieces of a back run where the piece really has a back
    var n = Math.max(1, Math.round((a1 - a0) / step)), L = (a1 - a0) / n, out = [];
    for (var k = 0; k < n; k++) {
      var q = sideRect(F.r, sd, 0, 0.12, a0 + k * L, a0 + (k + 1) * L);
      if (occFrac(F.m, { u0: q.u - q.du / 2, u1: q.u + q.du / 2, v0: q.v - q.dv / 2, v1: q.v + q.dv / 2 }, minH) > 0.4) out.push([a0 + k * L, a0 + (k + 1) * L]);
    }
    return out;
  }

  function mergeRuns(a) { var out = []; a.forEach(function (x) { var l = out[out.length - 1]; if (l && Math.abs(l[1] - x[0]) < 1e-6) l[1] = x[1]; else out.push([x[0], x[1]]); }); return out; }

  var pillowSeq = 0; // varies the pillow pattern from one sofa module to the next
  function seatLiving(F, G, mt, opt) {
    opt = opt || {};
    var r = F.r, du = r.u1 - r.u0, dv = r.v1 - r.v0, cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
    var seatH = Math.min(Math.max(F.seatH, 0.4), 0.46), BK = opt.soft ? 0.24 : 0.2, AW = opt.soft ? 0.2 : 0.13;
    var fab = opt.fab || mt.cushion, legH = opt.legs ? 0.12 : 0.05, baseTop = seatH - 0.15, rad = opt.soft ? 0.06 : 0.025;
    if (opt.legs) {
      var lg = new THREE.CylinderGeometry(0.018, 0.012, legH, 12);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { put(G, lg, mt.wood, cu + s[0] * (du / 2 - 0.08), legH / 2, cv + s[1] * (dv / 2 - 0.08)); });
    } else put(G, rboxGeo(Math.max(0.1, du - 0.12), legH, Math.max(0.1, dv - 0.12), 0.01), opt.plinth || mt.plinth, cu, legH / 2, cv);
    // the upholstered base follows the footprint cells (so an L sofa is an L, not a filled square)
    (occFrac(F.m, r, 0.15) > 0.8 ? [r] : seatCells(F, r, 1.2, 0.6)).forEach(function (q) {
      put(G, puffyGeo(q.u1 - q.u0 + 0.002, baseTop - legH, q.v1 - q.v0 + 0.002, rad, 0, 0, 0), fab, (q.u0 + q.u1) / 2, legH + (baseTop - legH) / 2, (q.v0 + q.v1) / 2);
    });
    var s = innerRect(F, BK, AW);
    seatCells(F, s, 0.95, 0.9).forEach(function (q) { // crowned seat cushions with a piped top edge
      var cw = q.u1 - q.u0 - 0.012, cd = q.v1 - q.v0 - 0.012, cx = (q.u0 + q.u1) / 2, cz = (q.v0 + q.v1) / 2;
      put(G, puffyGeo(cw, 0.15, cd, 0.045, 0.012, 0.035, 0.012), fab, cx, baseTop + 0.075, cz);
      if (!opt.soft) pipeRect(G, opt.pipe || mt.body, cx, baseTop + 0.15 - 0.02, cz, cw - 0.03, cd - 0.03);
    });
    var backTop = Math.min(Math.max(F.top, seatH + 0.3), seatH + 0.4), armTop = seatH + 0.2;
    F.backs.forEach(function (sd) {
      var sp = backSpan(F, sd, BK);
      mergeRuns(runCells(F, sd, sp[0], sp[1], 0.6, seatH + 0.12)).forEach(function (rc) { // back frame
        var fr = sideRect(r, sd, 0, 0.13, rc[0], rc[1]);
        put(G, puffyGeo(fr.du + (sd < 2 ? 0 : 0.002), backTop - legH, fr.dv + (sd < 2 ? 0.002 : 0), rad, 0, 0, 0), fab, fr.u, legH + (backTop - legH) / 2, fr.v);
      });
      var c0 = sp[0], c1 = sp[1];
      F.arms.forEach(function (o) { if ((o < 2) === (sd < 2)) return; if (o === 0) c0 = Math.max(c0, r.u0 + AW); if (o === 2) c0 = Math.max(c0, r.v0 + AW); if (o === 1) c1 = Math.min(c1, r.u1 - AW); if (o === 3) c1 = Math.min(c1, r.v1 - AW); });
      var hgt = backTop - baseTop - 0.15 + 0.06;
      runCells(F, sd, c0, c1, 0.95, seatH + 0.12).forEach(function (rc, k) { // loose back cushions
        var L2 = rc[1] - rc[0], cr = sideRect(r, sd, 0.11, 0.2, rc[0], rc[1]);
        var bc = put(G, puffyGeo(sd < 2 ? 0.2 : L2 - 0.01, hgt, sd < 2 ? L2 - 0.01 : 0.2, 0.05, sd < 2 ? 0.05 : 0.012, 0.02, sd < 2 ? 0.012 : 0.05), fab, cr.u, baseTop + 0.15 + hgt / 2, cr.v);
        tilt(bc, sd, 0.13);
        if (!opt.small) return;
        // living: pillows along the whole sectional in a repeating pattern (cream + terracotta, olive, none)
        var at = (rc[0] + rc[1]) / 2, h = (pillowSeq++) * 5 + 1, pat = h % 3, ds = ((h >> 2) % 2) ? 1 : -1;
        if (pat === 2) return;
        var big = pat === 0 ? opt.pillow : opt.small[1], pa = at + ds * 0.08, pq = sideRect(r, sd, 0.3, 0.14, pa - 0.25, pa + 0.25);
        var q1 = put(G, puffyGeo(sd < 2 ? 0.12 : 0.5, 0.48, sd < 2 ? 0.5 : 0.12, 0.02, sd < 2 ? 0.06 : 0.03, 0.03, sd < 2 ? 0.03 : 0.06), big, pq.u, baseTop + 0.15 + 0.24, pq.v);
        tilt(q1, sd, 0.3); q1.rotation.y += ds * 0.08;
        if (pat !== 0) return;
        var pb = at - ds * 0.12, pq2 = sideRect(r, sd, 0.44, 0.12, pb - 0.2, pb + 0.2);
        var q2 = put(G, puffyGeo(sd < 2 ? 0.11 : 0.4, 0.4, sd < 2 ? 0.4 : 0.11, 0.02, sd < 2 ? 0.055 : 0.025, 0.025, sd < 2 ? 0.025 : 0.055), opt.small[0], pq2.u, baseTop + 0.15 + 0.2, pq2.v);
        tilt(q2, sd, 0.22); q2.rotation.y -= ds * 0.12;
      });
      // layered scatter pillows: a large one and a smaller darker one in front, at each end
      var ends = [];
      if (opt.small) return; // living: pillows come with the back cushions above
      if (F.arms.indexOf(sd < 2 ? 2 : 0) >= 0) ends.push([c0 + 0.34, 1]);
      if (F.arms.indexOf(sd < 2 ? 3 : 1) >= 0) ends.push([c1 - 0.34, -1]);
      if (sd === F.backs[0]) { // a corner piece gets one in the corner
        if (F.backs.indexOf(sd < 2 ? 2 : 0) >= 0) ends.push([c0 + 0.3, 1]);
        else if (F.backs.indexOf(sd < 2 ? 3 : 1) >= 0) ends.push([c1 - 0.3, -1]);
      }
      ends.forEach(function (e, k) {
        var pr = sideRect(r, sd, 0.3, 0.14, e[0] - 0.25, e[0] + 0.25);
        var p1 = put(G, puffyGeo(sd < 2 ? 0.12 : 0.5, 0.48, sd < 2 ? 0.5 : 0.12, 0.02, sd < 2 ? 0.06 : 0.03, 0.03, sd < 2 ? 0.03 : 0.06), opt.pillow || mt.pillowA, pr.u, baseTop + 0.15 + 0.24, pr.v);
        if (opt.small) k = (k + (sd % 2)) % opt.small.length;
        tilt(p1, sd, 0.3); p1.rotation.y += e[1] * 0.1;
        if (opt.soft) return;
        var smallMat = opt.small ? opt.small[k] : mt.pillowB;
        var at = e[0] + e[1] * 0.12, pr2 = sideRect(r, sd, 0.44, 0.12, at - 0.2, at + 0.2);
        var p2 = put(G, puffyGeo(sd < 2 ? 0.11 : 0.4, 0.4, sd < 2 ? 0.4 : 0.11, 0.02, sd < 2 ? 0.055 : 0.025, 0.025, sd < 2 ? 0.025 : 0.055), smallMat, pr2.u, baseTop + 0.15 + 0.2, pr2.v);
        tilt(p2, sd, 0.22); p2.rotation.y -= e[1] * 0.14;
      });
    });
    F.arms.forEach(function (sd, k) {
      var ax = along(r, sd), a0 = ax[0], a1 = ax[1];
      armTop = Math.min(Math.max(F.sides[sd].maxh, seatH + 0.16), seatH + 0.24);
      F.backs.forEach(function (o) { if ((o < 2) === (sd < 2)) return; if (o === 0 || o === 2) a0 += BK - 0.02; else a1 -= BK - 0.02; });
      var fr = sideRect(r, sd, 0, AW, a0, a1);
      put(G, puffyGeo(fr.du, armTop - legH, fr.dv, opt.soft ? 0.09 : 0.03, opt.soft ? 0.02 : 0.004, 0.012, opt.soft ? 0.02 : 0.004), fab, fr.u, legH + (armTop - legH) / 2, fr.v);
      if (k || opt.noThrow) return; // a knitted throw folded over the first arm
      var mid = (a0 + a1) / 2 + 0.05, t1 = sideRect(r, sd, -0.015, AW + 0.03, mid - 0.2, mid + 0.2), t2 = sideRect(r, sd, -0.016, 0.014, mid - 0.2, mid + 0.2);
      put(G, rboxGeo(t1.du, 0.025, t1.dv, 0.01), opt.throwMat || mt.throwKnit, t1.u, armTop + 0.012, t1.v);
      put(G, rboxGeo(t2.du, 0.36, t2.dv, 0.006), opt.throwMat || mt.throwKnit, t2.u, armTop - 0.17, t2.v);
    });
    if (opt.rug !== false && F.backs.length) mt.seatInfo = { r: F.r, backs: F.backs, style: 'modern', BK: BK };
    return true;
  }

  var majSeq = 0; // cushions alternate terracotta / ivory along the whole majlis
  function seatMajlis(F, G, mt) {
    var r = F.r, du = r.u1 - r.u0, dv = r.v1 - r.v0, cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
    if (!F.backs.length) { var bm = -1; F.sides.forEach(function (st, s) { if (st.maxh > bm) { bm = st.maxh; F.backs = [s]; } }); }
    var BK = 0.18, plH = 0.1, seatTop = 0.38;
    (occFrac(F.m, r, 0.15) > 0.8 ? [r] : seatCells(F, r, 1.2, 0.6)).forEach(function (q) { // walnut base with a gold inlay band
      var w = q.u1 - q.u0, d = q.v1 - q.v0, x = (q.u0 + q.u1) / 2, z = (q.v0 + q.v1) / 2;
      put(G, rboxGeo(w - 0.02 + 0.002, plH, d - 0.02 + 0.002, 0.008), mt.walnut || mt.wood, x, plH / 2, z);
      put(G, rboxGeo(w - 0.004, 0.012, d - 0.004, 0.002), mt.brass || mt.metal, x, plH - 0.03, z);
    });
    seatCells(F, innerRect(F, BK, 0), 1.9, 0.75).forEach(function (q) { // piped seat mattresses
      var w = q.u1 - q.u0 - 0.012, d = q.v1 - q.v0 - 0.012, h = seatTop - plH, x = (q.u0 + q.u1) / 2, z = (q.v0 + q.v1) / 2;
      put(G, puffyGeo(w, h, d, 0.035, 0.008, 0.022, 0.008), mt.majSeat || mt.cushion, x, plH + h / 2, z);
      var y = seatTop - 0.018, pg = function (len) { return new THREE.CylinderGeometry(0.0065, 0.0065, len, 8); };
      [-1, 1].forEach(function (sg) {
        var a = put(G, pg(w - 0.05), mt.brass || mt.pipe, x, y, z + sg * (d / 2 - 0.012)); a.rotation.z = Math.PI / 2;
        var b = put(G, pg(d - 0.05), mt.brass || mt.pipe, x + sg * (w / 2 - 0.012), y, z); b.rotation.x = Math.PI / 2;
      });
    });
    F.backs.forEach(function (sd) {
      var sp = backSpan(F, sd, BK), runs = runCells(F, sd, sp[0], sp[1], 0.9, 0.5);
      runs.forEach(function (rc, k) { // upright back cushions, slightly reclined
        var L2 = rc[1] - rc[0], cr = sideRect(r, sd, 0.01, 0.17, rc[0], rc[1]);
        var bc = put(G, puffyGeo(sd < 2 ? 0.17 : L2 - 0.015, 0.52, sd < 2 ? L2 - 0.015 : 0.17, 0.035, sd < 2 ? 0.045 : 0.01, 0.015, sd < 2 ? 0.01 : 0.045), mt.majBack || mt.body, cr.u, seatTop + 0.26, cr.v);
        tilt(bc, sd, 0.05);
        if (k % 2) return; // a small square cushion in front of every other one
        var at = (rc[0] + rc[1]) / 2, pr = sideRect(r, sd, 0.22, 0.12, at - 0.21, at + 0.21);
        var pl = put(G, puffyGeo(sd < 2 ? 0.12 : 0.42, 0.42, sd < 2 ? 0.42 : 0.12, 0.02, sd < 2 ? 0.05 : 0.025, 0.025, sd < 2 ? 0.025 : 0.05), (mt.pilRust ? ((majSeq++) % 2 ? mt.pilCream : mt.pilRust) : mt.pipe), pr.u, seatTop + 0.2, pr.v);
        tilt(pl, sd, 0.18);
      });
      // bolsters at the open ends of the run, gold end caps
      var depth = Math.min(0.72, (sd < 2 ? du : dv) - BK - 0.04), ends = [];
      if (F.arms.indexOf(sd < 2 ? 2 : 0) >= 0) ends.push(sp[0] + 0.12);
      if (F.arms.indexOf(sd < 2 ? 3 : 1) >= 0) ends.push(sp[1] - 0.12);
      ends.forEach(function (at) {
        var br = sideRect(r, sd, BK, depth, at - 0.1, at + 0.1), bol = new THREE.Group(); bol.position.set(br.u, seatTop + 0.11, br.v);
        if (sd < 2) bol.rotation.z = Math.PI / 2; else bol.rotation.x = Math.PI / 2;
        put(bol, new THREE.CylinderGeometry(0.11, 0.11, depth - 0.03, 32), mt.majBack || mt.body, 0, 0, 0);
        [-1, 1].forEach(function (sg) { put(bol, new THREE.CylinderGeometry(0.112, 0.112, 0.014, 32), mt.brass || mt.metal, 0, sg * (depth / 2 - 0.01), 0); });
        G.add(bol);
      });
    });
    mt.seatInfo = { r: F.r, backs: F.backs, style: 'majlis', BK: BK };
    return true;
  }

  function seatBedroom(F, G, mt) {
    var r = F.r, du = r.u1 - r.u0, dv = r.v1 - r.v0;
    // a module of a sofa (fewer than two arms) or a long piece: soft boucle sofa; a lone armchair: barrel chair
    if (F.backs.length && (Math.max(du, dv) >= 1.25 || F.arms.length < 2)) return seatLiving(F, G, mt, { soft: true, legs: true, fab: mt.boucle, rug: false, noThrow: true });
    // barrel lounge chair: boucle shell wrapped round a deep round seat, on a walnut ring
    var bs = F.backs.length ? F.backs[0] : 2, f = [[1, 0], [-1, 0], [0, 1], [0, -1]][bs];
    var C = new THREE.Group(); C.position.set((r.u0 + r.u1) / 2, 0, (r.v0 + r.v1) / 2); C.rotation.y = Math.atan2(f[0], f[1]); G.add(C);
    var R = Math.min(Math.max(Math.min(du, dv) / 2, 0.34), 0.45), seat = 0.42;
    put(C, new THREE.CylinderGeometry(R * 0.62, R * 0.66, 0.07, 40), mt.wood, 0, 0.035, 0);
    put(C, new THREE.CylinderGeometry(R * 0.96, R * 0.9, seat - 0.2, 48), mt.boucle, 0, 0.07 + (seat - 0.2) / 2 - 0.0, 0);
    put(C, new THREE.CylinderGeometry(R * 0.86, R * 0.88, 0.13, 48), mt.boucle, 0, seat - 0.07, 0.02);
    put(C, shellGeo(R, 1.9, 0.74 - (seat - 0.13)), mt.boucle, 0, seat - 0.13, 0);
    var lum = put(C, puffyGeo(0.42, 0.26, 0.12, 0.02, 0.02, 0.02, 0.05), mt.pillowA, 0, seat + 0.13, -R * 0.55); lum.rotation.x = -0.25;
    return true;
  }

  // Seating dispatch by room.
  function buildSeat(m, G, mt) {
    var F = seatFrame(m); if (!F) return false;
    if (mt.room === 'majlis') return seatMajlis(F, G, mt);
    if (mt.room === 'bedroom') return seatBedroom(F, G, mt);
    return seatLiving(F, G, mt, mt.sofaFab ? { fab: mt.sofaFab, pipe: mt.sofaFab, plinth: mt.walnut, pillow: mt.pilCream, small: [mt.pilRust, mt.pilOlive], throwMat: mt.knitDark } : {});
  }

  /* Rugs in front of seating: sized from the seating (under the front of the seats, out over the
     open side), skipped where a rug already lies. Texture drawn per rug with real UVs. */

  /* Wall art: on the longest back of a seating group, where solid wall stands behind it across
     the whole width: one landscape canvas, or a pair for long runs. Abstract, quiet, in the
     scheme's neutrals with a touch of gold; thin brass frame. */
  var artWalls = null, artTex = {};
  function artTexture(seed, w, h) {
    var key = seed + '|' + w.toFixed(2) + '|' + h.toFixed(2); if (artTex[key]) return artTex[key];
    var W = 512, H = Math.round(512 * h / w), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), r = rng(101 + seed);
    c.fillStyle = '#EFE9DF'; c.fillRect(0, 0, W, H);
    var cols = ['rgba(176,160,138,', 'rgba(120,108,96,', 'rgba(214,204,188,', 'rgba(60,58,56,'];
    for (var k = 0; k < 7; k++) { // broad washes
      var x = r() * W, y = r() * H, rx = W * (0.15 + r() * 0.35), ry = H * (0.1 + r() * 0.3);
      c.filter = 'blur(' + (6 + r() * 14) + 'px)'; c.fillStyle = cols[k % 4] + (0.25 + r() * 0.35) + ')';
      c.beginPath(); c.ellipse(x, y, rx, ry, r() * Math.PI, 0, Math.PI * 2); c.fill();
    }
    c.filter = 'blur(0.6px)';
    for (k = 0; k < 3; k++) { // a few confident brush strokes
      c.strokeStyle = cols[3] + (0.5 + r() * 0.3) + ')'; c.lineWidth = 6 + r() * 14; c.lineCap = 'round';
      c.beginPath(); var sx = r() * W, sy = H * (0.3 + r() * 0.5); c.moveTo(sx, sy); c.bezierCurveTo(sx + W * 0.2, sy - H * 0.3 * r(), sx + W * 0.4, sy + H * 0.2 * r(), sx + W * (0.3 + r() * 0.3), sy - H * 0.1); c.stroke();
    }
    c.strokeStyle = 'rgba(201,162,93,.85)'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.15, H * (0.2 + r() * 0.6)); c.quadraticCurveTo(W * 0.5, H * r(), W * 0.85, H * (0.2 + r() * 0.6)); c.stroke(); // gold leaf line
    c.filter = 'none';
    for (k = 0; k < 9000; k++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.03)' : 'rgba(255,255,255,.05)'; c.fillRect(r() * W, r() * H, 1, 1); } // canvas weave
    var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (artTex[key] = t);
  }
  function placeArt(O, A, Cv, R, backs, base, seed) {
    if (!artWalls) { scene.updateMatrixWorld(true); artWalls = []; ['wall', 'ext'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.material !== glassMat && o.material.side !== THREE.BackSide) artWalls.push(o); }); }); }
    var sides = Object.keys(backs).map(Number).map(function (sd) { return [sd, sd < 2 ? R.v1 - R.v0 : R.u1 - R.u0]; }).sort(function (a, b) { return b[1] - a[1]; });
    var rc = new THREE.Raycaster(), y = base + 1.62, found = null;
    sides.some(function (sb) { // the longest back that has solid wall behind it, within 1.3 m
      var sd = sb[0], bl = sb[1]; if (bl < 1.5) return false;
      var out = [A.clone().negate(), A, Cv.clone().negate(), Cv][sd], tan = sd < 2 ? Cv : A;
      var eu = sd === 0 ? R.u0 : sd === 1 ? R.u1 : (R.u0 + R.u1) / 2, ev = sd === 2 ? R.v0 : sd === 3 ? R.v1 : (R.v0 + R.v1) / 2;
      var mid = O.clone().addScaledVector(A, eu).addScaledVector(Cv, ev), d0 = null;
      var pair = bl >= 2.8, w = pair ? 0.75 : Math.min(1.4, bl * 0.55), h = pair ? 1.0 : w * 0.66, span = pair ? 2 * w + 0.15 : w;
      var ok = [-span / 2, 0, span / 2].every(function (k) {
        var o = mid.clone().addScaledVector(tan, k).addScaledVector(out, -0.05); o.y = y;
        rc.set(o, out); rc.near = 0; rc.far = 1.35; var hit = rc.intersectObjects(artWalls, false)[0];
        if (!hit) return false; if (d0 == null) d0 = hit.distance; return Math.abs(hit.distance - d0) < 0.06;
      });
      if (ok) found = { sd: sd, out: out, tan: tan, mid: mid, d0: d0, pair: pair, w: w, h: h };
      return ok;
    });
    if (!found) return;
    var artBox = new THREE.Box3().setFromCenterAndSize(found.mid.clone().addScaledVector(found.out, found.d0).setY(y), new THREE.Vector3(1, 1, 1).multiplyScalar((found.pair ? 2 * found.w + 0.15 : found.w) + 0.6));
    if (realGroup.children.some(function (g2) { return g2.userData.kind === 'tv' && new THREE.Box3().setFromObject(g2).intersectsBox(artBox); })) return;
    var out = found.out, tan = found.tan, mid = found.mid, d0 = found.d0, pair = found.pair, w = found.w, h = found.h;
    var on = mid.clone().addScaledVector(out, d0 - 0.05 - 0.025); on.y = y;
    var frameM = MX().brass, rot = Math.atan2(-out.x, -out.z);
    (pair ? [-(w + 0.15) / 2, (w + 0.15) / 2] : [0]).forEach(function (k, ix) {
      var G = new THREE.Group(); G.position.copy(on).addScaledVector(tan, k); G.rotation.y = rot; realGroup.add(G);
      var cvs = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), [0, 0, 0, 0, 0, 0].map(function (_, f) {
        return f === 4 ? new THREE.MeshStandardMaterial({ map: artTexture(seed * 3 + ix, w, h), roughness: 0.9, clippingPlanes: [cutPlane] }) : new THREE.MeshStandardMaterial({ color: 0xE8E2D8, roughness: 0.9, clippingPlanes: [cutPlane] });
      }));
      cvs.castShadow = true; G.add(cvs);
      [[0, h / 2 + 0.008, w + 0.032, 0.016], [0, -h / 2 - 0.008, w + 0.032, 0.016], [w / 2 + 0.008, 0, 0.016, h], [-w / 2 - 0.008, 0, 0.016, h]].forEach(function (b) {
        var fm = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 0.04), frameM); fm.position.set(b[0], b[1], 0.005); fm.castShadow = true; G.add(fm);
      });
    });
  }
  /* One rug per seating group (modules that touch): sized from the group, under the front of
     the seats and out over the side the seats face; skipped where a rug already lies. */
  function groupRugs(recs, rugTaken) {
    var used = [];
    function gap(a, b) { return Math.max(a.wb[0] - b.wb[2], b.wb[0] - a.wb[2], a.wb[1] - b.wb[3], b.wb[1] - a.wb[3]); }
    recs.forEach(function (r0, i) {
      if (used[i]) return; used[i] = 1;
      var cl = [r0];
      for (var q = 0; q < cl.length; q++) recs.forEach(function (r1, j) { if (!used[j] && Math.abs(r1.base - cl[q].base) < 0.5 && gap(cl[q], r1) < 0.35) { used[j] = 1; cl.push(r1); } });
      var O = r0.O, A = r0.A, Cv = r0.Cv, R = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity }, style = 'modern', BK = r0.BK, backs = {};
      function fu(w) { return (w.x - O.x) * A.x + (w.z - O.z) * A.z; }
      function fv(w) { return (w.x - O.x) * Cv.x + (w.z - O.z) * Cv.z; }
      cl.forEach(function (rc) {
        if (rc.style === 'majlis') style = 'majlis';
        rc.corners.forEach(function (w) { var u = fu(w), v = fv(w); R.u0 = Math.min(R.u0, u); R.u1 = Math.max(R.u1, u); R.v0 = Math.min(R.v0, v); R.v1 = Math.max(R.v1, v); });
      });
      cl.forEach(function (rc) { // which sides of the group are backs
        rc.backs.forEach(function (sd) {
          var n = [rc.A.clone().negate(), rc.A, rc.Cv.clone().negate(), rc.Cv][sd], a = n.x * A.x + n.z * A.z, b = n.x * Cv.x + n.z * Cv.z;
          var side = Math.abs(a) > 0.7 ? (a < 0 ? 0 : 1) : (b < 0 ? 2 : 3), edge = rc.corners.map(side < 2 ? fu : fv), lim = [R.u0, R.u1, R.v0, R.v1][side];
          if (Math.abs((side % 2 ? Math.max : Math.min).apply(null, edge) - lim) < 0.3) backs[side] = 1;
        });
      });
      var X = { u0: R.u0, u1: R.u1, v0: R.v0, v1: R.v1 };
      [0, 1, 2, 3].forEach(function (sd) {
        var perp = sd < 2 ? [2, 3] : [0, 1], opp = sd ^ 1;
        var d = backs[sd] ? -(BK + 0.45) : backs[opp] && !(backs[perp[0]] && backs[perp[1]]) ? 1.7 : 0.25;
        if (sd === 0) X.u0 -= d; if (sd === 1) X.u1 += d; if (sd === 2) X.v0 -= d; if (sd === 3) X.v1 += d;
      });
      placeArt(O, A, Cv, R, backs, r0.base, i);
      var du = Math.min(5, X.u1 - X.u0), dv = Math.min(5, X.v1 - X.v0), cu = (X.u0 + X.u1) / 2, cv = (X.v0 + X.v1) / 2;
      if (du < 1.3 || dv < 1.3 || rugTaken(O, A, Cv, cu, cv, du, dv, r0.base)) return;
      var G = new THREE.Group(); G.matrixAutoUpdate = false; G.matrix.makeBasis(A, new THREE.Vector3(0, 1, 0), Cv).setPosition(O.x, r0.base, O.z);
      var rug = put(G, rboxGeo(du, 0.014, dv, 0.005), rugMat(style, du / dv), cu, 0.007, cv); rug.castShadow = false;
      realGroup.add(G);
    });
  }
  var rugMats = {};
  function rugMat(style, aspect) {
    var key = style + (Math.round(aspect * 4) / 4); if (rugMats[key]) return rugMats[key];
    var W = 1024, H = Math.round(Math.min(2048, Math.max(320, W / aspect)));
    var cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
    var c = cvs.getContext('2d'), rr = rng(style === 'majlis' ? 71 : 73);
    (style === 'majlis' ? rugPersian : rugModern)(c, W, H, rr);
    for (var i = 0; i < W * H / 22; i++) { c.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)'; c.fillRect(rr() * W, rr() * H, 1.6, 1.6); } // wool pile
    var t = new THREE.CanvasTexture(cvs); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (rugMats[key] = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.025, roughness: 1, envMapIntensity: 0.3, clippingPlanes: [cutPlane] }));
  }
  function rugModern(c, W, H, r) { // plain hand-tufted wool with a quiet tonal border
    c.fillStyle = '#E4DDD1'; c.fillRect(0, 0, W, H);
    var m = Math.min(W, H), b = m * 0.06;
    c.strokeStyle = 'rgba(150,135,115,.35)'; c.lineWidth = m * 0.012; c.strokeRect(b, b, W - 2 * b, H - 2 * b);
    c.strokeStyle = 'rgba(150,135,115,.5)'; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8);
  }
  function rugPersian(c, W, H, r) { // bordered medallion rug in navy, rust, gold and ivory
    var navy = '#1E2A44', gold = '#B8955A', ivory = '#E8DFCC', rust = '#7E3E30', m = Math.min(W, H);
    var b1 = m * 0.03, b2 = m * 0.12, bw = b2 - b1;
    c.fillStyle = ivory; c.fillRect(0, 0, W, H);
    c.fillStyle = navy; c.fillRect(b1, b1, W - 2 * b1, H - 2 * b1);
    c.fillStyle = rust; c.fillRect(b2, b2, W - 2 * b2, H - 2 * b2);
    function dia(x, y, s) { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); c.fill(); }
    c.fillStyle = gold;
    for (var x = b1 + bw * 0.45; x < W - b1; x += bw * 0.9) { dia(x, (b1 + b2) / 2, bw * 0.26); dia(x, H - (b1 + b2) / 2, bw * 0.26); }
    for (var y = b1 + bw * 0.45; y < H - b1; y += bw * 0.9) { dia((b1 + b2) / 2, y, bw * 0.26); dia(W - (b1 + b2) / 2, y, bw * 0.26); }
    c.strokeStyle = ivory; c.lineWidth = m * 0.006; c.strokeRect(b2 - m * 0.01, b2 - m * 0.01, W - 2 * b2 + m * 0.02, H - 2 * b2 + m * 0.02);
    c.strokeStyle = gold; c.lineWidth = m * 0.004; c.strokeRect(b1 + m * 0.008, b1 + m * 0.008, W - 2 * b1 - m * 0.016, H - 2 * b1 - m * 0.016);
    c.save(); c.beginPath(); c.rect(b2, b2, W - 2 * b2, H - 2 * b2); c.clip();
    var cs = m * 0.09; c.strokeStyle = 'rgba(184,149,90,.4)'; c.lineWidth = 2;
    for (var d = -H; d < W + H; d += cs) {
      c.beginPath(); c.moveTo(d, 0); c.lineTo(d + H, H); c.stroke();
      c.beginPath(); c.moveTo(d, 0); c.lineTo(d - H, H); c.stroke();
    }
    c.fillStyle = 'rgba(232,223,204,.5)';
    for (var yy = 0, row = 0; yy < H; yy += cs / 2, row++) for (var xx = (row % 2) * cs / 2; xx < W; xx += cs) { c.beginPath(); c.arc(xx, yy, m * 0.007, 0, Math.PI * 2); c.fill(); }
    var cx = W / 2, cy = H / 2, R = Math.min(W - 2 * b2, H - 2 * b2) * 0.32, ex = W > H ? 1.4 : 1, ey = H > W ? 1.4 : 1;
    [[1, navy], [0.88, gold], [0.8, ivory], [0.64, rust], [0.5, gold], [0.38, navy], [0.18, ivory]].forEach(function (s) {
      c.fillStyle = s[1]; c.beginPath();
      for (var i = 0; i <= 96; i++) { var a = i / 96 * Math.PI * 2, rr = R * s[0] * (1 + 0.1 * Math.cos(a * 8)); c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr * ex, cy + Math.sin(a) * rr * ey); }
      c.closePath(); c.fill();
    });
    [[b2, b2], [W - b2, b2], [b2, H - b2], [W - b2, H - b2]].forEach(function (p) {
      [[0.5, navy], [0.4, gold], [0.3, ivory], [0.18, rust]].forEach(function (s) { c.fillStyle = s[1]; c.beginPath(); c.arc(p[0], p[1], R * s[0], 0, Math.PI * 2); c.fill(); });
    });
    c.restore();
    for (var k = 0; k < 30; k++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.02 + r() * 0.03) + ')'; c.fillRect(0, r() * H, W, 4 + r() * 20); } // abrash
  }

  // Pieces in a calm, contemporary style (boucle, travertine, walnut and oak, cream, bronze),
  // all generated: no model downloads, a few hundred triangles each.
  function MX() {
    var b = M();
    b.boucle = rmat('fabric', 0.86, '#E6DFD3', 0.97, 'boucle', 0.25);
    b.travertine = rmat('stone', 0.8, '#D9CDB8', 0.6, 'travertine', 0.7);
    b.cream = rmat('top', 0.9, '#EDE7DC', 0.35);
    b.tv = rmat('tv', 0.05, '#0C0D0F', 0.08, null, 1, 0.6);
    b.ceramic = rmat('ceramic', 0.85, '#E4DED3', 0.45);
    b.throwKnit = rmat('fabric', 0.55, '#9C8E7D', 0.97, 'boucle', 0.12);
    b.leaf = rmat('foliage', 0.3, '#FFFFFF', 0.7); // leaf colours come per instance
    b.trunk = rmat('wood', 0.25, '#6A5644', 0.85, 'wood', 0.3);
    b.soil = rmat('soil', 0.1, '#3B3127', 1);
    b.planter = rmat('stone', 0.75, '#CFC7B9', 0.85, 'stone', 0.35);
    b.pillowA = rmat('fabric', 0.62, '#B7A592', 0.95, 'fabric', 0.14); // taupe
    b.pillowB = rmat('charcoal', 0.35, '#5E5852', 0.95, 'fabric', 0.14); // charcoal
    b.chairFab = rmat('fabric', 0.78, '#D3CFC8', 0.95, 'fabric', 0.14); // light grey weave
    b.pipe = rmat('accent', 0.4, '#7A5C3A', 0.9, 'fabric', 0.14); // majlis piping and cushions
    b.stone2 = rmat('ceramic2', 0.4, '#8C8274', 0.6); // darker stoneware
    b.candle = rmat('wax', 0.95, '#F6F2EA', 0.7);
    b.brass = rmat('brassD', 0.5, '#B08D57', 0.35, null, 1, 0.9);
    // dining: walnut, Calacatta, cognac leather, sage stoneware, lemons
    b.walnut = rmat('walnut', 0.3, '#FFFFFF', 0.42, 'walnutV', 1.1);
    b.walnutH = rmat('walnut', 0.31, '#FFFFFF', 0.38, 'walnut', 1.1); // grain lying along a top
    b.calacatta = rmat('stoneTop', 0.93, '#FFFFFF', 0.1, 'calacatta', 1.8);
    b.leather = rmat('leather', 0.4, '#FFFFFF', 0.42, 'leather', 0.45);
    b.sage = rmat('ceramic3', 0.55, '#8F9C84', 0.55);
    b.ink = rmat('ceramic4', 0.2, '#2F3236', 0.4);
    b.lemon = rmat('fruit', 0.65, '#E2BC3E', 0.5);
    b.chairUph = rmat('upholstery', 0.82, '#DCD2C3', 0.97, 'fabric', 0.1); // oatmeal woven fabric
    b.oakLeg = rmat('oakLeg', 0.6, '#BE9A73', 0.55, 'woodV', 0.5); // light oak
    // living sofa: warm greige linen, cream boucle, terracotta and olive accents, charcoal knit
    b.sofaFab = rmat('sofa', 0.7, '#AEA090', 0.96, 'fabric', 0.09);
    b.pilCream = rmat('pillowC', 0.9, '#EFE9DE', 0.97, 'boucle', 0.18);
    b.pilRust = rmat('pillowR', 0.45, '#97593F', 0.95, 'fabric', 0.1);
    b.pilOlive = rmat('pillowO', 0.4, '#6F7352', 0.95, 'fabric', 0.1);
    b.knitDark = rmat('throwD', 0.25, '#4B4641', 0.97, 'boucle', 0.12);
    // bedrooms: taupe upholstery, an accent per room (terracotta / olive / NITAQ navy)
    b.bedUph = rmat('bedUph', 0.5, '#8C7A68', 0.95, 'fabric', 0.1);
    b.runR = rmat('runR', 0.3, '#7A432D', 0.95, 'fabric', 0.1); b.runO = rmat('runO', 0.3, '#565C3E', 0.95, 'fabric', 0.1); b.runN = rmat('runN', 0.2, '#242E3D', 0.95, 'fabric', 0.1);
    b.accNavy = rmat('pillowN', 0.25, '#2F3A4B', 0.95, 'fabric', 0.1);
    // majlis: sand seats, deep navy backs and bolsters, gold piping, terracotta and ivory cushions
    b.majSeat = rmat('majSeat', 0.7, '#C9B99E', 0.9, 'fabric', 0.09);
    b.majBack = rmat('majBack', 0.15, '#232D45', 0.82, 'fabric', 0.09);
    return b;
  }
  function glowMatBed() {
    if (!bedGlow) {
      var g = document.createElement('canvas'); g.width = 4; g.height = 128;
      var x = g.getContext('2d'), gr = x.createLinearGradient(0, 128, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 4, 128);
      bedGlow = new THREE.MeshBasicMaterial({ color: 0xFFC98A, map: new THREE.CanvasTexture(g), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [cutPlane] });
    }
    return bedGlow;
  }
  var bedGlow = null;

  // Beds (reference: low boucle bed, soft headboard with a warm LED wash behind it, floating
  // nightstands with mushroom lamps, knitted throw, carved-arc rug).
  var bedSeq = 0; // each bedroom takes the next accent colour
  function buildBed(m, G, mt) {
    var r = occRect(m, function () { return true; }); if (!r) return false;
    var best = -1, head = 2; [0, 1, 2, 3].forEach(function (s) { var st = stripStats(m, s, 0.15, 0); if (st.maxh > best) { best = st.maxh; head = s; } });
    var wAxisU = head >= 2, nW = wAxisU ? m.nu : m.nv, nL = wAxisU ? m.nv : m.nu, cell = function (w, l) {
      var i = wAxisU ? w : (head === 0 ? l : m.nu - 1 - l), j = wAxisU ? (head === 2 ? l : m.nv - 1 - l) : w;
      return hAt(m, i, j);
    };
    var colOK = [];
    for (var w = 0; w < nW; w++) { var ok = 0, tot = 0; for (var l = Math.floor(nL * 0.45); l < Math.floor(nL * 0.95); l++) { tot++; var h = cell(w, l); if (h > 0.25 && h < 0.85) ok++; } colOK.push(tot && ok / tot > 0.5); }
    var runA = 0, runB = -1, a = -1; colOK.concat([false]).forEach(function (v, i) { if (v && a < 0) a = i; if (!v && a >= 0) { if (i - a > runB - runA + 1) { runA = a; runB = i - 1; } a = -1; } });
    if (runB < runA) return false;
    var footL = 0; for (w = runA; w <= runB; w++) for (l = 0; l < nL; l++) if (cell(w, l) > 0.1) footL = Math.max(footL, l + 1);
    var W = (runB - runA + 1) * CELL, L = footL * CELL, w0 = (wAxisU ? m.u0 : m.v0) + runA * CELL;
    function at(x, z) {
      var wc = w0 + x; if (head === 2) return [wc, m.v0 + z]; if (head === 3) return [wc, m.v1 - z];
      if (head === 0) return [m.u0 + z, wc]; return [m.u1 - z, wc];
    }
    function bx(gx, gy, gz, x, y, z, mat, rx, rad) {
      var p = at(x, z), m2 = put(G, rboxGeo(wAxisU ? gx : gz, gy, wAxisU ? gz : gx, rad != null ? rad : Math.min(0.06, gy / 2, gx / 2, gz / 2)), mat, p[0], y, p[1]);
      if (rx) { if (wAxisU) m2.rotation.x = head === 2 ? -rx : rx; else m2.rotation.z = head === 0 ? rx : -rx; }
      return m2;
    }
    G.userData.headSide = head;
    var baseH = 0.32, mTop = baseH + 0.2, uph = mt.bedUph || mt.boucle, accI = (bedSeq++) % 3, acc = mt.pilRust ? [mt.pilRust, mt.pilOlive, mt.accNavy][accI] : mt.throwKnit, run = mt.runR ? [mt.runR, mt.runO, mt.runN][accI] : mt.throwKnit;
    put(G, rboxGeo(wAxisU ? W - 0.1 : L - 0.2, 0.04, wAxisU ? L - 0.2 : W - 0.1, 0.01), mt.walnut || mt.plinth, at(W / 2, L / 2)[0], 0.02, at(W / 2, L / 2)[1]);
    bx(W + 0.16, baseH, L + 0.04, W / 2, 0.04 + baseH / 2, L / 2 + 0.06, uph, 0, 0.13); // rounded upholstered base
    bx(W - 0.02, 0.2, L - 0.16, W / 2, baseH + 0.1, 0.14 + (L - 0.16) / 2, mt.linen, 0, 0.06);
    var duvL = (L - 0.16) * 0.74, dz = L - 0.02 - duvL / 2;
    bx(W + 0.06, 0.06, duvL, W / 2, mTop + 0.03, dz, mt.cushion, 0, 0.03);
    [-1, 1].forEach(function (sd) { bx(0.025, 0.24, duvL, W / 2 + sd * (W / 2 + 0.04), mTop - 0.09, dz, mt.cushion, 0, 0.012); }); // duvet drop
    bx(W + 0.07, 0.08, 0.22, W / 2, mTop + 0.06, L - 0.02 - duvL + 0.11, mt.cushion, 0, 0.04); // turned-down fold
    bx(W + 0.2, 0.035, 0.55, W / 2, mTop + 0.08, L - 0.45, run, 0, 0.017); // bed runner in the room's accent
    [-1, 1].forEach(function (sd) { bx(0.03, 0.32, 0.55, W / 2 + sd * (W / 2 + 0.11), mTop - 0.08, L - 0.45, run, 0, 0.014); });
    var np = W > 1.3 ? 2 : 1, pw = (W - 0.1) / np;
    for (var k = 0; k < np; k++) bx(pw - 0.03, 0.5, 0.16, 0.05 + pw * (k + 0.5), mTop + 0.24, 0.13, uph, 0.18, 0.07); // euro shams against the headboard
    for (k = 0; k < np; k++) bx(pw - 0.06, 0.34, 0.16, 0.05 + pw * (k + 0.5), mTop + 0.16, 0.3, mt.linen, 0.28, 0.07); // sleeping pillows
    if (W > 1.3) bx(0.55, 0.26, 0.13, W / 2, mTop + 0.14, 0.45, acc, 0.2, 0.06); // lumbar
    var hbTop = Math.max(best, 1.05), hbH = hbTop - 0.12;
    bx(W + 0.12, hbH, 0.07, W / 2, 0.12 + hbH / 2, -0.015, uph, 0, 0.03); // backing panel
    var padTop = hbTop - 0.03, pad0 = mTop + 0.02, cols = Math.max(6, Math.round((W + 0.1) / 0.16)), pw2 = (W + 0.1) / cols;
    for (var cc = 0; cc < cols; cc++) // vertical channel tufting
      bx(pw2 - 0.01, padTop - pad0, 0.09, W / 2 - (W + 0.1) / 2 + pw2 * (cc + 0.5), (padTop + pad0) / 2, 0.06, uph, 0, Math.min(0.045, pw2 / 2 - 0.006));
    var gl = at(W / 2, -0.06), glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, 0.45), glowMatBed());
    glow.position.set(gl[0], hbTop + 0.18, gl[1]); glow.rotation.y = head === 2 ? 0 : head === 3 ? Math.PI : head === 0 ? Math.PI / 2 : -Math.PI / 2;
    G.add(glow); // LED wash on the wall above the headboard
    // floating nightstands with mushroom lamps where Revit has them beside the head
    [[0, runA - 1], [runB + 1, nW - 1]].forEach(function (rg) {
      if (rg[1] - rg[0] < 6) return;
      var wa = Infinity, wb = -1, lb = 0;
      for (w = rg[0]; w <= rg[1]; w++) for (l = 0; l < Math.min(nL, Math.round(0.8 / CELL)); l++) { h = cell(w, l); if (h > 0.25 && h < 0.85) { wa = Math.min(wa, w); wb = Math.max(wb, w); lb = Math.max(lb, l + 1); } }
      if (wb < wa) return;
      var nx = (wa - runA) * CELL, nw = Math.min((wb - wa + 1) * CELL, 0.6), nd = Math.min(lb * CELL, 0.42);
      var cx = nx + (wb - wa + 1) * CELL / 2;
      bx(nw, 0.16, nd, cx, 0.47, 0.03 + nd / 2, mt.walnut || mt.wood, 0, 0.01);
      bx(nw - 0.06, 0.004, 0.01, cx, 0.47, 0.03 + nd + 0.002, mt.brass || mt.plinth, 0, 0.001); // brass drawer line
      var p = at(cx, 0.03 + nd / 2);
      put(G, new THREE.CylinderGeometry(0.035, 0.05, 0.24, 20), mt.ink || mt.ceramic, p[0], 0.55 + 0.12, p[1]);
      put(G, new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mt.shade, p[0], 0.77, p[1]);
    });
    if (W > 1.3) { // carved-arc rug under the lower two thirds
      var rp = at(W / 2, L * 0.62);
      put(G, rboxGeo(wAxisU ? W + 1.4 : L * 0.9, 0.012, wAxisU ? L * 0.9 : W + 1.4, 0.004), mt.rugC, rp[0], 0.006, rp[1]).castShadow = false;
    }
    return true;
  }

  // Tables after the references: square → thin marble top on slim bronze legs with a nesting
  // wooden tray table; elongated → travertine pill on two drums; small → travertine drum.
  function pillGeo(len, wid, t) {
    var r = wid / 2, s = new THREE.Shape(), hl = len / 2 - r;
    s.moveTo(-hl, -r); s.lineTo(hl, -r); s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-hl, r); s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    var g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); g.translate(0, -t / 2, 0); return g;
  }
  function tableAt(G, mt, rect, topH, round, dining) {
    G.userData.table = { rect: rect, topH: topH, dining: !!dining };
    var cu = (rect.u0 + rect.u1) / 2, cv = (rect.v0 + rect.v1) / 2, du = rect.u1 - rect.u0, dv = rect.v1 - rect.v0;
    var longU = du >= dv, lo = Math.max(du, dv), sh = Math.min(du, dv);
    if (dining) { diningTable(G, mt, cu, cv, du, dv, topH); return; }
    if (lo <= 0.62) { // side table: travertine drum
      var R = sh / 2;
      put(G, new THREE.CylinderGeometry(R * 0.78, R * 0.82, topH - 0.04, 36), mt.travertine, cu, (topH - 0.04) / 2, cv);
      put(G, new THREE.CylinderGeometry(R, R, 0.04, 40), mt.travertine, cu, topH - 0.02, cv);
      return;
    }
    // coffee table: a honed travertine top on a recessed plinth (round when the piece is round or square)
    var tb = topH - 0.05;
    if (round || lo / sh < 1.15) {
      put(G, new THREE.CylinderGeometry(sh / 2, sh / 2 - 0.004, 0.05, 64), mt.walnutH || mt.travertine, cu, topH - 0.025, cv);
      put(G, new THREE.CylinderGeometry(sh * 0.3, sh * 0.32, tb, 48), mt.travertine, cu, tb / 2, cv);
    } else {
      put(G, rboxGeo(du, 0.05, dv, 0.012), mt.walnutH || mt.travertine, cu, topH - 0.025, cv);
      put(G, rboxGeo(Math.max(0.2, du - 0.26), tb, Math.max(0.2, dv - 0.26), 0.008), mt.travertine, cu, tb / 2, cv);
    }
    // styling: two stacked books and a low ceramic bowl
    var ox = longU ? lo * 0.2 : 0, oz = longU ? 0 : lo * 0.2;
    put(G, rboxGeo(0.3, 0.03, 0.22, 0.004), mt.cream, cu - ox, topH + 0.015, cv - oz, 0.15);
    put(G, rboxGeo(0.26, 0.025, 0.19, 0.004), mt.pillowA, cu - ox, topH + 0.042, cv - oz, -0.1);
    vessel(G, 'round', mt.stone2, cu + ox, topH, cv + oz, 0.9);
    vessel(G, 'bowl', mt.ceramic, cu + ox * 0.2, topH, cv + oz * 0.2, 0.8);
  }
  /* Dining tables: a 3 cm Calacatta top with soft corners and an eased edge. Long tables stand on
     two sculpted walnut pedestals (oval, wider at the top) on thin brass plinths; square ones are
     round, on a fluted walnut drum with a brass foot. */
  function softTopGeo(len, wid, rad, t) {
    var s = new THREE.Shape(), a = len / 2 - rad, b = wid / 2 - rad;
    s.moveTo(-a, -wid / 2); s.lineTo(a, -wid / 2); s.absarc(a, -b, rad, -Math.PI / 2, 0, false);
    s.lineTo(len / 2, b); s.absarc(a, b, rad, 0, Math.PI / 2, false);
    s.lineTo(-a, wid / 2); s.absarc(-a, b, rad, Math.PI / 2, Math.PI, false);
    s.lineTo(-len / 2, -b); s.absarc(-a, -b, rad, Math.PI, Math.PI * 1.5, false);
    var g = new THREE.ExtrudeGeometry(s, { depth: t - 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 16 });
    g.rotateX(-Math.PI / 2); g.translate(0, -t / 2 + 0.006, 0); return g;
  }
  function flutedGeo(rt, rb, h, flutes) {
    var g = new THREE.CylinderGeometry(rt, rb, h, flutes * 6, 1, false), p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); var rr = Math.sqrt(v.x * v.x + v.z * v.z); if (rr < 1e-4) continue;
      var a = Math.atan2(v.z, v.x), f = 1 - 0.05 * Math.pow(Math.abs(Math.sin(a * flutes / 2)), 0.6);
      p.setXYZ(i, v.x * f, v.y, v.z * f);
    }
    g.computeVertexNormals(); return g;
  }
  function diningTable(G, mt, cu, cv, du, dv, topH) {
    var longU = du >= dv, lo = Math.max(du, dv), sh = Math.min(du, dv), t = 0.03;
    if (lo / sh < 1.25) { // round table on a fluted drum
      var R = Math.min(du, dv) / 2;
      put(G, new THREE.CylinderGeometry(R, R - 0.004, t, 72), mt.calacatta, cu, topH - t / 2, cv);
      put(G, new THREE.CylinderGeometry(R - 0.03, R - 0.05, 0.02, 64), mt.walnutH, cu, topH - t - 0.01, cv); // shadow underside
      put(G, flutedGeo(R * 0.34, R * 0.3, topH - t - 0.04, 20), mt.walnut, cu, 0.02 + (topH - t - 0.04) / 2, cv);
      put(G, new THREE.CylinderGeometry(R * 0.4, R * 0.42, 0.02, 48), mt.brass, cu, 0.01, cv);
      return;
    }
    var top = put(G, softTopGeo(lo, sh, Math.min(0.22, sh * 0.25), t), mt.calacatta, cu, topH - t / 2, cv);
    if (!longU) top.rotation.y = Math.PI / 2;
    put(G, rboxGeo(longU ? lo - 0.24 : sh - 0.24, 0.025, longU ? sh - 0.24 : lo - 0.24, 0.008), mt.walnutH, cu, topH - t - 0.0125, cv); // recessed walnut underframe
    var legH = topH - t - 0.025 - 0.015, pw = Math.min(0.62, sh * 0.62), pd = 0.2;
    [-1, 1].forEach(function (sd) {
      var off = sd * (lo / 2 - Math.min(0.5, lo * 0.22)), x = cu + (longU ? off : 0), z = cv + (longU ? 0 : off);
      var ped = put(G, new THREE.CylinderGeometry(0.5, 0.36, legH, 48), mt.walnut, x, 0.015 + legH / 2, z); // oval, wider at the top
      ped.scale.set(longU ? pd : pw, 1, longU ? pw : pd);
      var foot = put(G, new THREE.CylinderGeometry(0.5, 0.5, 0.015, 48), mt.brass, x, 0.0075, z);
      foot.scale.set((longU ? pd : pw) * 0.82, 1, (longU ? pw : pd) * 0.82);
    });
  }
  function buildTable(m, G, mt) {
    var topH = 0; cellsWhere(m, function (h) { if (h > topH) topH = h; return false; });
    var rect = occRect(m, function (h) { return h > topH - 0.04; }); if (!rect) return false;
    var area = ((rect.u1 - rect.u0) / CELL) * ((rect.v1 - rect.v0) / CELL);
    tableAt(G, mt, rect, topH, rect.n / area < 0.86, false);
    return true;
  }
  // Curved-back upholstered dining chair (reference), oak legs, facing (fu, fv).
  var shellCache = {};
  function shellGeo(R, span, h) {
    var key = R.toFixed(3) + h.toFixed(3) + span.toFixed(2); if (shellCache[key]) return shellCache[key];
    var s = new THREE.Shape(), t = 0.05, a0 = -span, a1 = span, n = 24;
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; s[i ? 'lineTo' : 'moveTo'](R * Math.sin(a), R * Math.cos(a)); }
    for (i = n; i >= 0; i--) { a = a0 + (a1 - a0) * i / n; s.lineTo((R - t) * Math.sin(a), (R - t) * Math.cos(a)); }
    var g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3 });
    g.rotateX(-Math.PI / 2); // arc behind the seat (−z), extruded upward
    return (shellCache[key] = g);
  }
  /* Upholstered tub chair (reference): one continuous shell wraps the back and the sides, high at
     the back and sweeping down to arm height at the front, with a rounded top edge; a thick seat
     cushion inside it, four slim splayed light-oak legs. The shell is a closed profile swept
     around the seat, so it reads as one soft padded piece. */
  var tubCache = {};
  function tubShellGeo(R, T, span, y0, hBack, hArm) {
    var key = [R, T, span, y0, hBack, hArm].map(function (x) { return x.toFixed(3); }).join(); if (tubCache[key]) return tubCache[key];
    var prof = [], k, N = 40, pos = [], idx = [];
    prof.push([R - T, 0]); // inner bottom (y relative to the bottom; the top follows the sweep)
    prof.push([R - T, -1]); // inner, up to the start of the rounded top (marker -1)
    for (k = 1; k < 8; k++) { var a = Math.PI - Math.PI * k / 8; prof.push([R - T / 2 + Math.cos(a) * T / 2, -2, Math.sin(a) * T / 2]); }
    prof.push([R, -1]); prof.push([R, 0]);
    var P = prof.length;
    for (var i = 0; i <= N; i++) {
      var t = i / N, ang = -span + 2 * span * t, f = Math.abs(ang) / span;
      var top = hArm + (hBack - hArm) * Math.pow(Math.cos(Math.min(1, f) * Math.PI / 2), 1.3);
      var sn = Math.sin(ang), cs = -Math.cos(ang);
      prof.forEach(function (q) {
        var y = q[1] === 0 ? y0 : q[1] === -1 ? top - T / 2 : top - T / 2 + q[2];
        pos.push(q[0] * sn, y, q[0] * cs);
      });
    }
    for (i = 0; i < N; i++) for (k = 0; k < P; k++) {
      var a0 = i * P + k, a1 = i * P + (k + 1) % P, b0 = a0 + P, b1 = a1 + P;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    [0, N].forEach(function (e, ei) { // end caps
      var c = pos.length / 3, sx = 0, sy = 0, sz = 0;
      for (k = 0; k < P; k++) { sx += pos[(e * P + k) * 3]; sy += pos[(e * P + k) * 3 + 1]; sz += pos[(e * P + k) * 3 + 2]; }
      pos.push(sx / P, sy / P, sz / P);
      for (k = 0; k < P; k++) { var u = e * P + k, w2 = e * P + (k + 1) % P; if (ei) idx.push(c, u, w2); else idx.push(c, w2, u); }
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    return (tubCache[key] = g);
  }
  function chairAt(G, mt, cu, cv, w, d, hTop, fu, fv) {
    var C = new THREE.Group(); C.position.set(cu, 0, cv); C.rotation.y = Math.atan2(fu, fv); G.add(C);
    w = Math.min(Math.max(w, 0.5), 0.58); hTop = Math.min(Math.max(hTop, 0.78), 0.84);
    var uph = mt.chairUph || mt.chairFab || mt.cushion, leg = mt.oakLeg || mt.wood;
    var R = w / 2, T = 0.065, seat = 0.48, y0 = 0.37;
    put(C, tubShellGeo(R, T, 2.05, y0, hTop, 0.64), uph, 0, 0, 0);
    var cush = put(C, new THREE.CylinderGeometry(R - T + 0.004, R - T - 0.006, seat - y0 + 0.005, 40, 1), uph, 0, (y0 + seat) / 2, 0.02);
    cush.scale.set(1, 1, 1.08); // seat a little deeper than wide, its front past the shell
    var front = put(C, rboxGeo(2 * (R - T) * 0.86, seat - y0, 0.16, 0.045), uph, 0, (y0 + seat) / 2 - 0.002, R - T - 0.02); // squared-off front edge
    var lg = new THREE.CylinderGeometry(0.016, 0.009, y0 + 0.01, 14);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s2) {
      var l = put(C, lg, leg, s2[0] * R * 0.6, (y0 + 0.01) / 2, s2[1] * R * 0.6);
      l.rotation.z = s2[0] * 0.14; l.rotation.x = -s2[1] * 0.14; // splayed outward
    });
    return C;
  }
  function buildChair(m, G, mt) {
    var r = occRect(m, function () { return true; }); if (!r) return false;
    var best = -1, bs = 2; [0, 1, 2, 3].forEach(function (s) { var st = stripStats(m, s, 0.1, 0); if (st.maxh > best) { best = st.maxh; bs = s; } });
    var f = [[1, 0], [-1, 0], [0, 1], [0, -1]][bs];
    chairAt(G, mt, (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, bs < 2 ? r.v1 - r.v0 : r.u1 - r.u0, bs < 2 ? r.u1 - r.u0 : r.v1 - r.v0, best, f[0], f[1]);
    return true;
  }
  function buildDiningSet(m, G, mt) {
    var hs = cellsWhere(m, function (h) { return h > 0.65 && h < 0.82; }).map(function (c) { return Math.round(c[2] * 50) / 50; });
    if (!hs.length) return false;
    var cnt = {}, topH = 0.75, bc = 0; hs.forEach(function (h) { cnt[h] = (cnt[h] || 0) + 1; if (cnt[h] > bc) { bc = cnt[h]; topH = h; } });
    var rect = occRect(m, function (h) { return Math.abs(h - topH) < 0.03; }); if (!rect) return false;
    var cu = (rect.u0 + rect.u1) / 2, cv = (rect.v0 + rect.v1) / 2, inTable = function (u, v) { return u > rect.u0 - 0.05 && u < rect.u1 + 0.05 && v > rect.v0 - 0.05 && v < rect.v1 + 0.05; };
    tableAt(G, mt, rect, topH, false, true);
    var seen = new Uint8Array(m.nu * m.nv);
    for (var i = 0; i < m.nu; i++) for (var j = 0; j < m.nv; j++) {
      var idx = i * m.nv + j, u = m.u0 + (i + 0.5) * CELL, v = m.v0 + (j + 0.5) * CELL;
      if (seen[idx] || m.H[idx] <= 0.05 || inTable(u, v)) continue;
      var comp = [], top = 0, q = [[i, j]]; seen[idx] = 1;
      while (q.length) {
        var c = q.pop(); comp.push(c); top = Math.max(top, m.H[c[0] * m.nv + c[1]]);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
          var a = c[0] + dd[0], b = c[1] + dd[1], k = a * m.nv + b;
          if (a < 0 || b < 0 || a >= m.nu || b >= m.nv || seen[k] || m.H[k] <= 0.05) return;
          if (inTable(m.u0 + (a + 0.5) * CELL, m.v0 + (b + 0.5) * CELL)) return;
          seen[k] = 1; q.push([a, b]);
        });
      }
      if (comp.length * CELL * CELL < 0.06) continue;
      var a0 = Infinity, a1 = -1, b0 = Infinity, b1 = -1; comp.forEach(function (c) { a0 = Math.min(a0, c[0]); a1 = Math.max(a1, c[0]); b0 = Math.min(b0, c[1]); b1 = Math.max(b1, c[1]); });
      var ccu = m.u0 + (a0 + a1 + 1) / 2 * CELL, ccv = m.v0 + (b0 + b1 + 1) / 2 * CELL, fu = cu - ccu, fv = cv - ccv;
      var horiz = Math.abs(fu) > Math.abs(fv); fu = horiz ? Math.sign(fu) : 0; fv = horiz ? 0 : Math.sign(fv);
      chairAt(G, mt, ccu - fu * 0.05, ccv - fv * 0.05, (horiz ? b1 - b0 + 1 : a1 - a0 + 1) * CELL, (horiz ? a1 - a0 + 1 : b1 - b0 + 1) * CELL, top, fu, fv);
    }
    // centrepiece: a stone vase with olive sprigs
    // centrepiece: a travertine tray with three vases of different heights and two brass candlesticks
    var lu = rect.u1 - rect.u0 >= rect.v1 - rect.v0, trayL = Math.min(1.0, Math.max(rect.u1 - rect.u0, rect.v1 - rect.v0) * 0.4);
    put(G, rboxGeo(lu ? trayL : 0.32, 0.02, lu ? 0.32 : trayL, 0.006), mt.walnutH || mt.travertine, cu, topH + 0.01, cv);
    var at = function (k) { return lu ? [cu + k, cv] : [cu, cv + k]; };
    var p1 = at(-trayL * 0.25), p2 = at(0.02), p3 = at(trayL * 0.28), p4 = at(-trayL * 0.62), p5 = at(trayL * 0.62);
    vessel(G, 'tall', mt.sage || mt.ceramic, p1[0], topH + 0.02, p1[1]);
    vessel(G, 'round', mt.ink || mt.stone2, p2[0], topH + 0.02, p2[1], 0.85);
    vessel(G, 'bowl', mt.ceramic, p3[0], topH + 0.02, p3[1], 1.0);
    if (mt.lemon) { var lg2 = new THREE.SphereGeometry(0.036, 16, 12); [[0, 0], [0.05, 0.02], [-0.045, 0.03], [0.01, -0.05]].forEach(function (o, k) { var l = put(G, lg2, mt.lemon, p3[0] + o[0], topH + 0.088 + (k ? 0 : 0.028), p3[1] + o[1]); l.scale.set(1, 0.85, 1.15); }); }
    [p4, p5].forEach(function (q) { vessel(G, 'candle', mt.brass, q[0], topH, q[1]); put(G, new THREE.CylinderGeometry(0.011, 0.011, 0.12, 12), mt.candle, q[0], topH + 0.24, q[1]); });
    return true;
  }

  // TV wall (reference): with a wall behind the unit, a travertine feature panel, the TV on it
  // and a floating walnut console with drawer seams; without one, the console and TV alone.
  function buildTV(m, G, mt, back) {
    var r = occRect(m, function () { return true; }); if (!r) return false;
    var s = back, along2 = along(r, s), a0 = along2[0], a1 = along2[1], len = a1 - a0, dep = s < 2 ? r.u1 - r.u0 : r.v1 - r.v0;
    dep = Math.min(Math.max(dep, 0.38), 0.46);
    function box(off, depth, h, y, w, mat, center) {
      var fr = sideRect(r, s, off, depth, (a0 + a1) / 2 - w / 2, (a0 + a1) / 2 + w / 2);
      return put(G, rboxGeo(fr.du, h, fr.dv, Math.min(0.01, h / 2)), mat, fr.u, y, fr.v);
    }
    var cons = len;
    if (back >= 0 && back <= 3 && G.userData.wall) {
      var tvW = Math.min(1.65, len * 0.72), panelW = tvW + 0.8; // panel frames the TV, ~40 cm each side
      box(0, 0.05, 2.35, 0.3 + 2.35 / 2, panelW, mt.travertine);
      box(0.05, 0.035, tvW * 9 / 16, 1.3, tvW, mt.tv);
      cons = Math.min(len, panelW + 0.4); a0 = (a0 + a1) / 2 - cons / 2; a1 = a0 + cons; // console a little beyond the panel
    } else {
      tvW = Math.min(1.45, len * 0.65);
      box(0.06, 0.04, tvW * 9 / 16, 0.62 + tvW * 9 / 32 + 0.04, tvW, mt.tv);
    }
    box(0.05, dep, 0.3, 0.18 + 0.15, cons, mt.wood); // floating console
    len = cons;
    var nd = Math.max(2, Math.round(len / 0.6)), dw = len / nd;
    for (var k = 1; k < nd; k++) { // drawer seams on the front
      var x = a0 + dw * k, fr = sideRect(r, s, 0.05 + dep, 0.004, x - 0.002, x + 0.002);
      put(G, new THREE.BoxGeometry(fr.du, 0.26, fr.dv), mt.plinth, fr.u, 0.33, fr.v);
    }
    // two ceramic vases on the console
    [0.22, 0.32].forEach(function (f, i) {
      var fr = sideRect(r, s, 0.05 + dep * 0.5, 0.01, a1 - len * f, a1 - len * f + 0.01), vh = i ? 0.26 : 0.36;
      put(G, new THREE.CylinderGeometry(0.05, 0.075, vh, 24), mt.ceramic, fr.u, 0.48 + vh / 2, fr.v);
    });
    return true;
  }

  // Potted olive tree (reference) from the plant's bounding box: textured stone planter, a few
  // slender trunks and a canopy of instanced leaves (one draw call per tree).
  var leafGeo = null;
  function buildPlant(f, mt) {
    var bb = f.bb; if (!bb) return null;
    var w = bb[3] - bb[0], d = bb[4] - bb[1], H = Math.max(0.6, bb[5] - bb[2]), G = new THREE.Group(), rnd = rng(f.id % 2147483646 || 7);
    var c = P((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2); G.position.set(c.x, bb[2], c.z);
    var R = Math.min(Math.max(Math.min(w, d) * 0.38, 0.17), 0.3), ph = Math.min(0.55, Math.max(0.32, H * 0.3));
    var prof = []; for (var i = 0; i <= 12; i++) { var t = i / 12; prof.push(new THREE.Vector2(R * (0.72 + 0.32 * Math.sin(Math.PI * (0.15 + t * 0.75))), t * ph)); }
    put(G, new THREE.LatheGeometry(prof, 36), mt.planter, 0, 0, 0);
    put(G, new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.02, 30), mt.soil, 0, ph - 0.03, 0);
    var tall = H > 1.0, crown = tall ? ph + (H - ph) * 0.62 : ph + (H - ph) * 0.5;
    var nTr = tall ? 3 : 0, tips = [];
    for (i = 0; i < nTr; i++) {
      var ang = i * 2.1 + rnd(), lean = 0.08 + rnd() * 0.1, len = crown - ph + 0.05;
      var tr = put(G, new THREE.CylinderGeometry(0.008, 0.016, len, 8), mt.trunk, Math.sin(ang) * lean * len / 2, ph + len / 2, Math.cos(ang) * lean * len / 2);
      tr.rotation.set(Math.cos(ang) * lean, 0, -Math.sin(ang) * lean);
      tips.push(new THREE.Vector3(Math.sin(ang) * lean * len, ph + len, Math.cos(ang) * lean * len));
    }
    if (!tips.length) tips.push(new THREE.Vector3(0, crown, 0));
    if (!leafGeo) { leafGeo = new THREE.SphereGeometry(1, 6, 4); leafGeo.scale(0.008, 0.0025, 0.032); leafGeo.translate(0, 0, 0.03); }
    // foliage in clumps at the ends of twigs, as an olive grows: silvery grey-green, denser outside
    var spread = Math.min(Math.max(Math.min(w, d) * 0.45, 0.25), 0.55), canopyH = tall ? (H - crown) + 0.25 : (H - ph) * 0.7;
    var nClump = tall ? 16 : 9, per = tall ? 70 : 60, n = nClump * per, leaves = new THREE.InstancedMesh(leafGeo, mt.leaf, n), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), k2 = 0;
    for (var cI = 0; cI < nClump; cI++) {
      var tip = tips[cI % tips.length], u = rnd() * Math.PI * 2, rr = (0.35 + 0.65 * Math.sqrt(rnd())) * spread, yy = (rnd() - 0.3) * canopyH;
      var cc = new THREE.Vector3(tip.x + Math.cos(u) * rr, tip.y + yy, tip.z + Math.sin(u) * rr);
      var tw = new THREE.Vector3().subVectors(cc, tip), tl = tw.length(); // a twig from the trunk top to the clump
      var twig = put(G, new THREE.CylinderGeometry(0.0025, 0.005, tl, 5), mt.trunk, (tip.x + cc.x) / 2, (tip.y + cc.y) / 2, (tip.z + cc.z) / 2);
      twig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tw.normalize()); twig.castShadow = false;
      var cr = 0.08 + rnd() * 0.06;
      for (var l = 0; l < per; l++) {
        var a1 = rnd() * Math.PI * 2, a2 = Math.acos(2 * rnd() - 1), rad = cr * Math.cbrt(rnd());
        var lp = new THREE.Vector3(cc.x + Math.sin(a2) * Math.cos(a1) * rad, cc.y + Math.cos(a2) * rad * 0.7, cc.z + Math.sin(a2) * Math.sin(a1) * rad);
        e.set(-0.6 - rnd() * 0.8, a1 + (rnd() - 0.5), (rnd() - 0.5) * 0.8); q.setFromEuler(e);
        M4.compose(lp, q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.5));
        leaves.setMatrixAt(k2, M4); leaves.setColorAt(k2, col.setHSL(0.19 + rnd() * 0.06, 0.14 + rnd() * 0.12, 0.3 + rnd() * 0.16)); k2++;
      }
    }
    leaves.castShadow = true; G.add(leaves);
    return G;
  }

  function redressKind(name) {
    var n = name.toLowerCase();
    if (/plant|vase|foliage|bamboo|ficus|olive/.test(n)) return 'plant';
    if (/entertainment|tv unit/.test(n)) return 'tv';
    if (/bed|letto/.test(n)) return 'bed';
    if (/dining_table|chairs\)|tavolo da pranzo/.test(n)) return 'dining';
    if (/chair|sedia|katakana/.test(n)) return 'chair';
    if (/table|tavol|coffee/.test(n)) return 'table';
    if (/sofa|couch|divano|poltrona|armchair|corner/.test(n)) return 'seat';
    return '';
  }
  function buildRealFurniture() {
    if (realBuilt || !D.furniture || !D.furniture.length) return;
    realBuilt = true;
    var mt = MX(), up = new THREE.Vector3(0, 1, 0), made = 0;
    mt.rugC = rmat('rug', 0.9, '#E3DCCF', 1, 'rug', 2.4);
    var fronts = []; ['wall', 'ext', 'arch'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.material.side !== THREE.BackSide) fronts.push(o); }); });
    var wrc = new THREE.Raycaster();
    // rugs already lying in the model (those of pieces that stay), and the ones placed here
    var willGo = {}, rugBoxes = [];
    D.furniture.forEach(function (f) { if (redressKind(f.name)) willGo[f.id] = 1; });
    Object.keys(elemGroups).forEach(function (id) {
      if (willGo[id]) return;
      elemGroups[id].traverse(function (o) { if (o.isMesh && o.userData.rug) { var b = new THREE.Box3().setFromObject(o); rugBoxes.push([b.min.x, b.min.z, b.max.x, b.max.z]); } });
    });
    var seatRecs = [], tableBoxes = [];
    var revitRugs = []; if (meshGroups.furn) meshGroups.furn.traverse(function (o) {
      if (!o.isMesh || !o.userData.rug) return;
      for (var q = o.parent; q; q = q.parent) if (q.userData && q.userData.elemId != null && willGo[q.userData.elemId]) return;
      revitRugs.push(o);
    });
    var downRc = new THREE.Raycaster(), downV = new THREE.Vector3(0, -1, 0);
    function rugTaken(O, A, Cv, cu, cv, du, dv, base) {
      if (base != null && revitRugs.length && [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].some(function (k) {
        var u = cu + k[0] * du, v = cv + k[1] * dv; downRc.set(new THREE.Vector3(O.x + A.x * u + Cv.x * v, base + 0.5, O.z + A.z * u + Cv.z * v), downV); downRc.far = 0.7;
        return downRc.intersectObjects(revitRugs, false).length > 0;
      })) return true;
      var xs = [], zs = [];
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { var u = cu + k[0] * du / 2, v = cv + k[1] * dv / 2; xs.push(O.x + A.x * u + Cv.x * v); zs.push(O.z + A.z * u + Cv.z * v); });
      var bx = [Math.min.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, xs), Math.max.apply(null, zs)], area = (bx[2] - bx[0]) * (bx[3] - bx[1]);
      var hit = rugBoxes.some(function (o) {
        var w = Math.min(bx[2], o[2]) - Math.max(bx[0], o[0]), h = Math.min(bx[3], o[3]) - Math.max(bx[1], o[1]);
        return w > 0 && h > 0 && w * h > 0.08 * Math.min(area, (o[2] - o[0]) * (o[3] - o[1]));
      });
      if (!hit) rugBoxes.push(bx);
      return hit;
    }
    D.furniture.forEach(function (f) {
      var kind = redressKind(f.name);
      if (kind === 'plant') { var pg = buildPlant(f, mt); if (pg) { pg.userData.elem = f.id; realGroup.add(pg); made++; } return; }
      var tris = elemTris[f.id]; if (!tris || !kind) return;
      var al = Math.hypot(f.ax[0], f.ax[1]) || 1, A = new THREE.Vector3(f.ax[0] / al, 0, -f.ax[1] / al), Cv = new THREE.Vector3().crossVectors(A, up);
      var O = P(f.p[0], f.p[1]), m = heightMap(tris, O, A, Cv), G = new THREE.Group();
      var r0 = occRect(m, function () { return true; });
      mt.room = r0 ? roomTypeAt(O.x + A.x * (r0.u0 + r0.u1) / 2 + Cv.x * (r0.v0 + r0.v1) / 2, m.base + 0.2, O.z + A.z * (r0.u0 + r0.u1) / 2 + Cv.z * (r0.v0 + r0.v1) / 2) : '';
      mt.seatInfo = null;
      mt.rugTaken = function (cu, cv, du, dv) { return rugTaken(O, A, Cv, cu, cv, du, dv); };
      var back = -1;
      if (kind === 'tv') { // the side of the unit that has a wall right behind it
        var rr = occRect(m, function () { return true; }), best = 0.7;
        if (rr) [[0, -1, 0], [1, 1, 0], [2, 0, -1], [3, 0, 1]].forEach(function (sd) {
          var cu = (rr.u0 + rr.u1) / 2, cv = (rr.v0 + rr.v1) / 2, half = sd[1] ? (rr.u1 - rr.u0) / 2 : (rr.v1 - rr.v0) / 2;
          var o = O.clone().addScaledVector(A, cu).addScaledVector(Cv, cv); o.y = m.base + 1.2;
          var dir = A.clone().multiplyScalar(sd[1]).addScaledVector(Cv, sd[2]);
          wrc.set(o, dir); wrc.near = 0; wrc.far = half + 0.4;
          var hit = wrc.intersectObjects(fronts, false)[0];
          if (hit && hit.distance - half < best) { best = hit.distance - half; back = sd[0]; }
        });
        G.userData.wall = back >= 0; if (back >= 0) G.userData.front = [A, A, Cv, Cv][back].clone().multiplyScalar(back % 2 ? -1 : 1); // faces into the room
        if (back < 0) back = 2;
      }
      var ok = kind === 'tv' ? buildTV(m, G, mt, back) : ({ seat: buildSeat, bed: buildBed, table: buildTable, chair: buildChair, dining: buildDiningSet })[kind](m, G, mt);
      if (!ok) return;
      if (G.userData.headSide != null) G.userData.front = [A, A, Cv, Cv][G.userData.headSide].clone().multiplyScalar(G.userData.headSide % 2 ? -1 : 1);
      G.matrixAutoUpdate = false; G.matrix.makeBasis(A, up, Cv).setPosition(O.x, m.base, O.z);
      if (G.userData.table && (kind === 'table' || kind === 'dining')) {
        var tr = G.userData.table.rect, tc = [[tr.u0, tr.v0], [tr.u1, tr.v0], [tr.u0, tr.v1], [tr.u1, tr.v1]].map(function (c) { return O.clone().addScaledVector(A, c[0]).addScaledVector(Cv, c[1]); });
        var tb2 = [Math.min.apply(null, tc.map(function (c) { return c.x; })), Math.min.apply(null, tc.map(function (c) { return c.z; })), Math.max.apply(null, tc.map(function (c) { return c.x; })), Math.max.apply(null, tc.map(function (c) { return c.z; })), m.base];
        var dup = tableBoxes.some(function (o) {
          var w = Math.min(tb2[2], o[2]) - Math.max(tb2[0], o[0]), h = Math.min(tb2[3], o[3]) - Math.max(tb2[1], o[1]);
          return Math.abs(o[4] - tb2[4]) < 0.5 && w > 0 && h > 0 && w * h > 0.3 * Math.min((tb2[2] - tb2[0]) * (tb2[3] - tb2[1]), (o[2] - o[0]) * (o[3] - o[1]));
        });
        if (dup) { if (elemGroups[f.id]) elemGroups[f.id].userData.replaced = true; return; }
        tableBoxes.push(tb2);
      }
      G.userData.elem = f.id; G.userData.room = mt.room; G.userData.kind = kind; realGroup.add(G); made++;
      if (mt.seatInfo) {
        var si = mt.seatInfo, rr2 = si.r, cs = [[rr2.u0, rr2.v0], [rr2.u1, rr2.v0], [rr2.u0, rr2.v1], [rr2.u1, rr2.v1]].map(function (c) { return O.clone().addScaledVector(A, c[0]).addScaledVector(Cv, c[1]); });
        seatRecs.push({ O: O, A: A, Cv: Cv, base: m.base, backs: si.backs, style: si.style, BK: si.BK, corners: cs,
          wb: [Math.min.apply(null, cs.map(function (c) { return c.x; })), Math.min.apply(null, cs.map(function (c) { return c.z; })), Math.max.apply(null, cs.map(function (c) { return c.x; })), Math.max.apply(null, cs.map(function (c) { return c.z; }))] });
      }
      if (elemGroups[f.id]) elemGroups[f.id].userData.replaced = true;
    });
    groupRugs(seatRecs, rugTaken);
    buildChandeliers();
    dressWetAndKitchen();
    buildFalseCeilings();
    buildKitchen();
    buildShelfDecor(mt);
    buildContactShadows();
    applyRealFurniture();
    return made;
  }
  function applyRealFurniture() {
    dirtyShadow();
    realGroup.visible = S.realFurn && S.furn;
    Object.keys(elemGroups).forEach(function (id) { var g = elemGroups[id]; g.visible = !(S.realFurn && g.userData.replaced); });
  }


  /* ---------- doors ----------
     Every hinged door gets a real frame (jamb lining through the wall and casing on both
     faces), three hinges on the hinge side and lever handles on both faces of each leaf (they
     turn with it). Leaves and frames share one wood, chosen in the finishes panel. The opening
     is read from the leaves themselves (closed at load) and the wall thickness by casting from
     inside the jamb to both wall faces. */
  var DOOR_WOODS = [
    { id: 'walnut', ar: 'جوز', en: 'Walnut', color: '#5E3D27', rough: 0.45, grain: true },
    { id: 'oak', ar: 'بلوط', en: 'Oak', color: '#B48C62', rough: 0.5, grain: true },
    { id: 'white', ar: 'أبيض لاكيه', en: 'White lacquer', color: '#F2EFE9', rough: 0.3, grain: false },
    { id: 'ash', ar: 'رمادي', en: 'Ash grey', color: '#8E8A84', rough: 0.5, grain: true }
  ];
  var doorMat = null, doorDetail = new THREE.Group();
  scene.add(doorDetail);
  function doorWoodMat() {
    if (!doorMat) {
      doorMat = new THREE.MeshStandardMaterial({ color: '#5E3D27', roughness: 0.45, flatShading: true, envMapIntensity: 0.7,
        side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
      triplanar(doorMat, procFor('woodV'), 0.9, 0.9);
    }
    return doorMat;
  }
  function applyDoorWood() {
    var w = DOOR_WOODS.filter(function (x) { return x.id === S.doorWood; })[0] || DOOR_WOODS[0], m = doorWoodMat();
    m.color.set(w.color); m.roughness = w.rough;
    // lacquer: no grain (swap to a plain copy of the same material)
    m.userData.plain = !w.grain;
    doorPlain().color.set(w.color); doorPlain().roughness = w.rough;
    var useMat = w.grain ? m : doorPlain();
    [meshGroups.door, meshGroups.leaf, doorDetail].forEach(function (g) {
      if (g) g.traverse(function (o) { if (o.isMesh && (o.material === m || o.material === doorPlainMat)) o.material = useMat; });
    });
    [].forEach.call($('doorWoods').children, function (b) { b.classList.toggle('on', b.dataset.id === w.id); });
  }
  var doorPlainMat = null;
  function doorPlain() {
    if (!doorPlainMat) doorPlainMat = new THREE.MeshStandardMaterial({ color: '#F2EFE9', roughness: 0.3, flatShading: true,
      side: THREE.FrontSide, clippingPlanes: [cutPlane], clipShadows: true });
    return doorPlainMat;
  }
  function renderDoorWood() {
    var box = $('doorWoods'); if (!box) return;
    $('kDoor').textContent = T('doorWood'); box.innerHTML = '';
    DOOR_WOODS.forEach(function (w) {
      var b = document.createElement('button'), sw = document.createElement('span'), i = document.createElement('i');
      b.className = 'fin'; b.dataset.id = w.id; sw.className = 'sw'; i.style.background = w.color; sw.appendChild(i);
      b.appendChild(sw); b.appendChild(document.createTextNode(S.lang === 'ar' ? w.ar : w.en));
      b.onclick = function () { S.doorWood = w.id; applyDoorWood(); };
      box.appendChild(b);
    });
    applyDoorWood();
  }
  function dressDoors() {
    if (!leafPivots.length) return;
    var metal = M().metal, wood = doorWoodMat(), up = new THREE.Vector3(0, 1, 0);
    var backs = []; ARCH.forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o) { if (o.isMesh && o.material.side === THREE.BackSide) backs.push(o); }); });
    var rc = new THREE.Raycaster(), byDoor = {};
    leafPivots.forEach(function (lf) {
      var box = new THREE.Box3().setFromObject(lf.inner); if (box.isEmpty()) return;
      var H = P(lf.x, lf.y), c = box.getCenter(new THREE.Vector3()), u = new THREE.Vector3(c.x - H.x, 0, c.z - H.z);
      var half = u.length(); if (half < 0.15) return; u.normalize();
      var n = new THREE.Vector3().crossVectors(u, up), size = box.getSize(new THREE.Vector3());
      var thick = Math.max(0.03, Math.min(0.07, Math.abs(size.x * n.x) + Math.abs(size.z * n.z)));
      // the leaf's real edges along u (the hinge axis can sit a few cm inside the frame rebate)
      var t0 = Infinity, t1 = -Infinity;
      [box.min.x, box.max.x].forEach(function (x) { [box.min.z, box.max.z].forEach(function (z) { var t = (x - H.x) * u.x + (z - H.z) * u.z; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }); });
      lf.geom = { H: H, u: u, n: n, W: half * 2, base: box.min.y, h: size.y, thick: thick, mid: c, t0: Math.max(t0, -0.05), t1: t1 };
      (byDoor[lf.door] = byDoor[lf.door] || []).push(lf);
      // lever handles on both faces near the leaf's free edge, turning with the leaf
      var hx = H.clone().addScaledVector(u, half * 2 - 0.08);
      [-1, 1].forEach(function (side) {
        var at = hx.clone().addScaledVector(n, side * (thick / 2 + 0.012)); at.y = box.min.y + 1.0;
        var rose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24), metal);
        rose.position.copy(at); rose.quaternion.setFromUnitVectors(up, n);
        var lever = new THREE.Mesh(rboxGeo(0.13, 0.018, 0.018, 0.008), metal);
        lever.position.copy(at).addScaledVector(n, side * 0.03).addScaledVector(u, -0.055);
        lever.rotation.y = Math.atan2(-u.z, u.x);
        [rose, lever].forEach(function (m) { m.castShadow = true; lf.inner.updateMatrixWorld(true); m.applyMatrix4(new THREE.Matrix4().copy(lf.inner.matrixWorld).invert()); lf.inner.add(m); });
      });
    });
    Object.keys(byDoor).forEach(function (d) {
      var leaves = byDoor[d], g0 = leaves[0].geom, u = g0.u, n = g0.n;
      // the opening runs between the outermost hinge/edge points along u
      var pts = []; leaves.forEach(function (lf) { var g = lf.geom; pts.push(g.H.clone().addScaledVector(g.u, g.t0), g.H.clone().addScaledVector(g.u, g.t1)); });
      var o = pts[0], ts = pts.map(function (p) { return (p.x - o.x) * u.x + (p.z - o.z) * u.z; });
      var tA = Math.min.apply(null, ts), tB = Math.max.apply(null, ts), A = o.clone().addScaledVector(u, tA), W = tB - tA;
      var base = Math.min.apply(null, leaves.map(function (lf) { return lf.geom.base; })), h = Math.max.apply(null, leaves.map(function (lf) { return lf.geom.h; }));
      // wall faces: cast both ways from inside the jamb, just beyond the opening
      var probe = A.clone().addScaledVector(u, -0.05); probe.y = base + h * 0.5;
      var faces = [-1, 1].map(function (sd) {
        rc.set(probe, n.clone().multiplyScalar(sd)); rc.near = 0; rc.far = 0.6;
        var hit = rc.intersectObjects(backs, false)[0]; return hit ? hit.distance : null;
      });
      // no exit on a side: the leaf sits flush with that face of the wall
      if (faces[0] == null && faces[1] == null) faces = [0.1, 0.1];
      else faces = faces.map(function (f) { return f == null ? 0 : f; });
      var T = Math.min(0.6, faces[0] + faces[1]), mid = A.clone().addScaledVector(n, (faces[1] - faces[0]) / 2);
      // the wall opening is usually a little larger than the leaves: find its reveals
      var fronts = []; ['wall', 'ext', 'arch'].forEach(function (k) { if (meshGroups[k]) meshGroups[k].traverse(function (o2) { if (o2.isMesh && o2.material.side !== THREE.BackSide && o2.parent === meshGroups[k]) fronts.push(o2); }); });
      var ctr = mid.clone().addScaledVector(u, W / 2); ctr.y = base + h * 0.5;
      [[-1, 'a'], [1, 'b']].forEach(function (q) {
        rc.set(ctr, u.clone().multiplyScalar(q[0])); rc.near = 0; rc.far = W / 2 + 0.12;
        var hit = rc.intersectObjects(fronts, false)[0];
        if (hit && hit.distance > W / 2 - 0.02) { var extra = hit.distance - W / 2; if (q[1] === 'a') { mid.addScaledVector(u, -extra); W += extra; } else W += extra; }
      });
      rc.set(ctr, up); rc.far = 0.3; var top = rc.intersectObjects(fronts, false)[0];
      if (top && top.point.y > base + h - 0.02) h = top.point.y - base;
      function piece(gw, gh, gd, cu, y, cn) { // gw along u, gd along n
        var m = new THREE.Mesh(rboxGeo(gw, gh, gd, 0.004), wood), at = mid.clone().addScaledVector(u, cu).addScaledVector(n, cn);
        m.position.set(at.x, y, at.z); m.rotation.y = Math.atan2(-u.z, u.x); m.castShadow = m.receiveShadow = true; doorDetail.add(m);
      }
      var lin = 0.025, cas = 0.07, cd = 0.018;
      // jamb and head linings sit inside the opening, covering the wall reveals
      piece(lin, h, T + 0.004, lin / 2, base + h / 2, 0); piece(lin, h, T + 0.004, W - lin / 2, base + h / 2, 0);
      piece(W, lin, T + 0.004, W / 2, base + h - lin / 2, 0);
      [-1, 1].forEach(function (sd) { // casing (architrave) on both wall faces, from the opening edge outward
        var cn = sd * (T / 2 + cd / 2);
        piece(cas, h + cas, cd, -cas / 2 + 0.004, base + (h + cas) / 2, cn);
        piece(cas, h + cas, cd, W + cas / 2 - 0.004, base + (h + cas) / 2, cn);
        piece(W + 2 * cas - 0.008, cas, cd, W / 2, base + h + cas / 2 - 0.004, cn);
      });
      // hinges on each leaf's hinge side
      leaves.forEach(function (lf) {
        var g = lf.geom;
        [0.2, g.h / 2, g.h - 0.2].forEach(function (y) {
          var k = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 12), metal);
          var at = g.H.clone().addScaledVector(g.u, 0.004); k.position.set(at.x, g.base + y, at.z); k.castShadow = true; doorDetail.add(k);
        });
      });
    });
    applyDoorWood();
  }

  if (MESH) loadMesh();

  home(); cam.t.copy(goal.t);
  applyLevel(); applyNight(); renderUI(); resize(); frame();
})();
