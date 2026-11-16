// Turn a showcase_export.py result (JSON) into public/showcase/data/<slug>.js.
// Usage: node tools/revit/showcase_build.mjs export.json <slug> [config.json]
// config.json (optional): { main: ["GR","1ST"], site: ["0"], levelNames: {GR:["Ground Floor","الطابق الأرضي"]},
//   project: { name, nameAr, location, locationAr, builtUp, plotArea, floors } }
import {readFile, writeFile} from 'node:fs/promises';

const [src, slug, cfgPath] = process.argv.slice(2);
if (!src || !/^[a-z0-9-]{1,60}$/.test(slug || '')) {
  console.error('usage: node tools/revit/showcase_build.mjs export.json <slug> [config.json]');
  process.exit(1);
}
const ex = JSON.parse(await readFile(src, 'utf8'));
const cfg = cfgPath ? JSON.parse(await readFile(cfgPath, 'utf8')) : {};

// English → Arabic for common room names (matched on the normalised name).
const AR = {
  'bedroom': 'غرفة نوم', 'master bedroom': 'غرفة النوم الرئيسية', 'bath': 'حمام', 'toil': 'دورة مياه',
  'toilet': 'دورة مياه', 'toi.': 'دورة مياه', 'wash': 'مغسلة', 'dress': 'غرفة ملابس', 'majlis': 'المجلس',
  'living': 'المعيشة', 'family hall': 'صالة العائلة', 'dining': 'الطعام', 'kitchen': 'المطبخ',
  'pantry': 'تحضير', 'store': 'مخزن', 'laundry': 'غسيل', 'maid': 'غرفة الخادمة', 'office': 'مكتب',
  'lift': 'مصعد', 'lobby': 'بهو', 'entrance': 'المدخل', 'cctv. room': 'غرفة المراقبة', 'gym': 'نادي رياضي',
  'terrace': 'تراس', 'guest room': 'غرفة ضيوف', 'iron': 'كوي'
};
const title = (s) => s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

const main = new Set(cfg.main || ex.levels.filter((l) => l.rooms.length).map((l) => l.name));
const siteNames = new Set(cfg.site || []);
const names = cfg.levelNames || {};
const out = {
  partialRooms: cfg.partialRooms ?? false,
  project: {...ex.project, ...(cfg.project || {})},
  levels: [],
  site: []
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
      })
    });
  } else if (siteNames.has(L.name)) {
    out.site.push({elevation: L.elevation, height: L.height, walls: L.walls, slabs: L.slabs});
  }
}
const body = `/* NITAQ Showcase — ${out.project.name} (${out.project.ref || slug}).
   Generated from Revit by tools/revit/showcase_export.py + showcase_build.mjs. Do not edit by hand. */
window.NITAQ_SHOWCASE = ${JSON.stringify(out)};
`;
await writeFile(`public/showcase/data/${slug}.js`, body);
console.log(`wrote public/showcase/data/${slug}.js — levels: ${out.levels.map((l) => `${l.name} (${l.rooms.length} rooms)`).join(', ')}; site: ${out.site.length}`);
