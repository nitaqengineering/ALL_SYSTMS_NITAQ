// Turn a showcase_export.py result (JSON) into public/showcase/data/<slug>.js.
// Usage: node tools/revit/showcase_build.mjs export.json <slug> [config.json] [mesh.json]
// mesh.json (from showcase_export_mesh.py) adds the real Revit geometry as
// public/showcase/data/<slug>.bin; the viewer then draws that instead of rebuilding walls.
// config.json (optional): { main: ["GR","1ST"], site: ["0"], levelNames: {GR:["Ground Floor","الطابق الأرضي"]},
//   project: { name, nameAr, location, locationAr, builtUp, plotArea, floors } }
import {readFile, writeFile} from 'node:fs/promises';

const [src, slug, cfgPath, meshPath] = process.argv.slice(2);
if (!src || !/^[a-z0-9-]{1,60}$/.test(slug || '')) {
  console.error('usage: node tools/revit/showcase_build.mjs export.json <slug> [config.json]');
  process.exit(1);
}
const ex = JSON.parse(await readFile(src, 'utf8'));
// '-' (or nothing) means no config file: the defaults below name and pick the storeys.
const cfg = cfgPath && cfgPath !== '-' ? JSON.parse(await readFile(cfgPath, 'utf8')) : {};
// Common Revit level names → viewer names, used when the config does not name a level.
const STOREY = [
  [/^(b|basement|bsmt)\b/i, 'Basement', 'القبو'],
  [/^(gr|gf|g|ground)\b/i, 'Ground Floor', 'الطابق الأرضي'],
  [/^(1st|ff|first)\b/i, 'First Floor', 'الطابق الأول'],
  [/^(2nd|sf|second)\b/i, 'Second Floor', 'الطابق الثاني'],
  [/^(rf|roof)\b/i, 'Roof', 'السطح']
];
const storey = (name) => STOREY.find(([re]) => re.test(name.trim()));

// English → Arabic for common room names (matched on the normalised name).
const AR = {
  'bedroom': 'غرفة نوم', 'master bedroom': 'غرفة النوم الرئيسية', 'bath': 'حمام', 'toil': 'دورة مياه',
  'toilet': 'دورة مياه', 'toi.': 'دورة مياه', 'wash': 'مغسلة', 'dress': 'غرفة ملابس', 'majlis': 'المجلس',
  'living': 'المعيشة', 'family hall': 'صالة العائلة', 'dining': 'الطعام', 'kitchen': 'المطبخ',
  'pantry': 'تحضير', 'store': 'مخزن', 'laundry': 'غسيل', 'maid': 'غرفة الخادمة', 'office': 'مكتب',
  'lift': 'مصعد', 'lobby': 'بهو', 'entrance': 'المدخل', 'cctv. room': 'غرفة المراقبة', 'gym': 'نادي رياضي',
  'terrace': 'تراس', 'guest room': 'غرفة ضيوف', 'iron': 'كوي', 'trophy rm.': 'غرفة الجوائز',
  'dining / game': 'طعام / ألعاب', 'f. dress': 'ملابس', 'm. dress': 'ملابس', 'sitting': 'جلسة',
  'double hight': 'ارتفاع مزدوج', 'double height': 'ارتفاع مزدوج', 'roof': 'سطح'
};
const title = (s) => s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

const main = new Set(cfg.main || ex.levels.filter((l) => l.rooms.length || storey(l.name)).map((l) => l.name));
const siteNames = new Set(cfg.site || []);
const names = {...Object.fromEntries(ex.levels.filter((l) => storey(l.name)).map((l) => [l.name, storey(l.name).slice(1)])), ...(cfg.levelNames || {})};
const out = {
  // with plan notes naming spaces, the Revit rooms do not cover the whole built-up area
  partialRooms: cfg.partialRooms ?? ex.levels.some((l) => (l.notes || []).length),
  project: {...ex.project, ...(cfg.project || {})},
  levels: [],
  site: [],
  views: ex.views || [] // Revit perspective views: {name, eye:[x,y,z], dir:[x,y,z]} in metres
};
for (const L of ex.levels) {
  const n = names[L.name];
  if (main.has(L.name)) {
    const counts = {};
    L.rooms.forEach((r) => { const k = r.name.trim().toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
    const seen = {};
    out.levels.push({
      ...L,
      name: n ? n[0] : L.name, nameAr: n ? n[1] : L.name,
      rooms: L.rooms.map((r) => {
        const k = r.name.trim().toLowerCase();
        const num = counts[k] > 1 && /bed/.test(k) ? ' ' + (seen[k] = (seen[k] || 0) + 1) : '';
        // a wash basin room is not a bathroom: keep it out of the bathroom count
        const type = /^wash$/.test(k) ? 'service' : r.type;
        return {...r, type, name: title(r.name.trim()) + num, nameAr: (AR[k] || title(r.name.trim())) + num};
      }),
      // plan text notes naming spaces that have no Revit room; the sheet title is not a space
      notes: (L.notes || []).filter((t) => t.text.toLowerCase() !== String(ex.project.name || '').toLowerCase())
        .map((t) => ({x: t.x, y: t.y, name: title(t.text), nameAr: AR[t.text.toLowerCase()] || title(t.text)}))
    });
  } else if (siteNames.has(L.name)) {
    out.site.push({elevation: L.elevation, height: L.height, walls: L.walls, slabs: L.slabs});
  }
}
if (meshPath) {
  out.mesh = await packMesh(JSON.parse(await readFile(meshPath, 'utf8')), `public/showcase/data/${slug}.bin`);
  out.mesh.file = `data/${slug}.bin`;
  // The real geometry replaces the rebuilt walls and site; rooms and slabs stay for labels and bounds.
  out.levels.forEach((L) => { delete L.walls; });
  delete out.site;
}

// Pack mesh buckets into one binary: per bucket, Int16 positions (quantised around a shared
// origin, identical vertices merged) followed by Uint16/Uint32 indices, 4-byte aligned.
async function packMesh(mesh, binPath) {
  const keys = Object.keys(mesh.buckets);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const k of keys) {
    const p = mesh.buckets[k].p;
    for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < lo[a]) lo[a] = p[i]; if (p[i] > hi[a]) hi[a] = p[i]; }
  }
  const origin = lo.map((v, a) => Math.round((v + hi[a]) / 2));
  const half = Math.max(...hi.map((v, a) => v - origin[a]), ...lo.map((v, a) => origin[a] - v));
  const step = Math.max(1, Math.ceil(half / 32000)); // millimetres per unit
  const parts = [], buckets = [];
  let offset = 0;
  const push = (typed) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    parts.push(bytes); if (pad) parts.push(new Uint8Array(pad));
    const at = offset; offset += bytes.length + pad; return at;
  };
  for (const k of keys) {
    const [grpKey, rgb, transp] = k.split('|');
    // 'leaf:<door>:<hinge>' buckets are door leaves that the viewer swings open
    const [grp, door, hinge] = grpKey.split(':');
    const {p, i: idx} = mesh.buckets[k];
    const map = new Map(), pos = [], remap = new Int32Array(p.length / 3);
    for (let v = 0; v < p.length / 3; v++) {
      const q = [0, 1, 2].map((a) => Math.round((p[v * 3 + a] - origin[a]) / step));
      const key = q.join(',');
      let n = map.get(key);
      if (n === undefined) { n = pos.length / 3; map.set(key, n); pos.push(...q); }
      remap[v] = n;
    }
    const tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]];
      if (a !== b && b !== c && a !== c) tris.push(a, b, c); // drop triangles collapsed by quantising
    }
    if (!tris.length) continue;
    const wide = pos.length / 3 > 65535;
    buckets.push({
      grp, ...(grp === 'leaf' ? {door: +door, hinge: +hinge} : {}), color: '#' + rgb.split(',').map((n) => (+n).toString(16).padStart(2, '0')).join(''),
      opacity: Math.round(100 - +transp) / 100,
      pos: push(Int16Array.from(pos)), verts: pos.length / 3,
      idx: push(wide ? Uint32Array.from(tris) : Uint16Array.from(tris)), count: tris.length, wide
    });
  }
  const bin = Buffer.concat(parts.map((u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength)));
  await writeFile(binPath, bin);
  console.log(`wrote ${binPath} — ${buckets.length} buckets, ${(bin.length / 1048576).toFixed(1)} MB, step ${step} mm`);
  // origin is in viewer axes (x, z, -y), millimetres; the viewer re-centres it.
  // hinges: [x, y (m, model plan), sign (+1 = counter-clockwise seen from above), angle (rad)]
  return {origin, step, bytes: bin.length, buckets, doors: (mesh.doors || []).map((d) => d.hinges)};
}

const body = `/* NITAQ Showcase — ${out.project.name} (${out.project.ref || slug}).
   Generated from Revit by tools/revit/showcase_export.py + showcase_build.mjs. Do not edit by hand. */
window.NITAQ_SHOWCASE = ${JSON.stringify(out)};
`;
await writeFile(`public/showcase/data/${slug}.js`, body);
console.log(`wrote public/showcase/data/${slug}.js — levels: ${out.levels.map((l) => `${l.name} (${l.rooms.length} rooms)`).join(', ')}; site: ${out.site ? out.site.length : "replaced by mesh"}`);
