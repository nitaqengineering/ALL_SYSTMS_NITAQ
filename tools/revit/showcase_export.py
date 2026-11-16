# NITAQ Showcase — read rooms, floor slabs, walls, doors and windows from the open
# Revit model and return them in the shape public/showcase/data/*.js expects (metres).
# Read-only: run through the pyRevit agent (run_query). IronPython 2.7 and CPython.
# Curtain walls are exported as glass panels and cut as window openings in their host.
from pyrevit.api import DB

FT = 0.3048
r3 = lambda v: round(v * FT, 3)


def eid(e):
    i = e.Id
    return i.IntegerValue if hasattr(i, 'IntegerValue') else i.Value


def bip(el, name):
    p = el.get_Parameter(getattr(DB.BuiltInParameter, name)) if el else None
    return p.AsDouble() if p and p.HasValue else None


def size(inst, names):
    for src in (inst, inst.Symbol):
        for n in names:
            v = bip(src, n)
            if v:
                return v
    return None


def room_type(name):
    n = (name or '').lower()
    for key, words in (
        ('wet', ('bath', 'w/c', 'wc', 'toil', 'wash', 'حمام', 'دورة')),
        ('bedroom', ('bed', 'نوم')),
        ('majlis', ('majlis', 'مجلس')),
        ('kitchen', ('kitchen', 'pantry', 'مطبخ')),
        ('dining', ('dining', 'طعام')),
        ('living', ('living', 'family', 'office', 'معيشة', 'صالة')),
        ('service', ('maid', 'laundry', 'store', 'driver', 'lift', 'cctv', 'dress', 'خادمة', 'غسيل', 'مخزن')),
        ('terrace', ('terrace', 'balcony', 'تراس', 'شرفة')),
    ):
        if any(w in n for w in words):
            return key
    return 'hall'


def zrange(el, lv):
    bb = el.get_BoundingBox(None)
    if not bb:
        return None
    return r3(bb.Min.Z - lv.Elevation), r3(bb.Max.Z - bb.Min.Z)


def loop_poly(loop):
    poly = []
    for c in loop:
        for pt in c.Tessellate():
            xy = [r3(pt.X), r3(pt.Y)]
            if not poly or poly[-1] != xy:
                poly.append(xy)
    if len(poly) > 1 and poly[0] == poly[-1]:
        poly.pop()
    return poly


def poly_area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2


is_curtain = lambda w: w.WallType.Kind == DB.WallKind.Curtain
DOORS, WINDOWS = DB.ElementId(DB.BuiltInCategory.OST_Doors), DB.ElementId(DB.BuiltInCategory.OST_Windows)

levels = sorted(DB.FilteredElementCollector(doc).OfClass(DB.Level), key=lambda l: l.Elevation)
lv_by_id = dict((eid(l), l) for l in levels)
opts = DB.SpatialElementBoundaryOptions()
all_rooms = list(DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType())
all_walls = list(DB.FilteredElementCollector(doc).OfClass(DB.Wall))
all_floors = list(DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Floors).WhereElementIsNotElementType())

out = []
for i, lv in enumerate(levels):
    nxt = levels[i + 1].Elevation if i + 1 < len(levels) else lv.Elevation + 3.4 / FT
    L = {'id': lv.Name, 'name': lv.Name, 'elevation': r3(lv.Elevation),
         'height': r3(nxt - lv.Elevation), 'rooms': [], 'slabs': [], 'walls': [], 'furniture': []}

    for rm in all_rooms:
        if rm.LevelId != lv.Id or rm.Area <= 0:
            continue
        loops = rm.GetBoundarySegments(opts)
        if not loops:
            continue
        poly = loop_poly([s.GetCurve() for s in loops[0]])
        name = rm.get_Parameter(DB.BuiltInParameter.ROOM_NAME).AsString() or ''
        L['rooms'].append({'id': str(eid(rm)), 'name': name, 'type': room_type(name),
                           'area': round(rm.Area * FT * FT, 2), 'poly': poly})

    for fl in all_floors:
        if fl.LevelId != lv.Id:
            continue
        try:
            refs = DB.HostObjectUtils.GetTopFaces(fl)
        except Exception:
            continue
        zr = zrange(fl, lv)
        for ref in refs:
            face = fl.GetGeometryObjectFromReference(ref)
            loops = [loop_poly(list(cl)) for cl in face.GetEdgesAsCurveLoops()]
            loops = [p for p in loops if len(p) > 2]
            if loops and zr:
                outer = max(loops, key=poly_area)
                if poly_area(outer) > 1:
                    L['slabs'].append({'poly': outer, 'top': round(zr[0] + zr[1], 3), 'd': zr[1]})

    for w in all_walls:
        if w.LevelId != lv.Id or not isinstance(w.Location, DB.LocationCurve):
            continue
        c = w.Location.Curve
        if not isinstance(c, DB.Line):
            continue  # curved walls: not supported in the viewer yet
        a, b = c.GetEndPoint(0), c.GetEndPoint(1)
        zr = zrange(w, lv)
        rec = {'a': [r3(a.X), r3(a.Y)], 'b': [r3(b.X), r3(b.Y)], 't': r3(w.Width), 'openings': []}
        if zr:
            rec['base'], rec['h'] = zr
        if is_curtain(w):
            rec['glass'] = True
            L['walls'].append(rec)
            continue
        dirv = (b - a).Normalize()
        for iid in w.FindInserts(True, False, True, False):
            ins = doc.GetElement(iid)
            if isinstance(ins, DB.Wall) and is_curtain(ins) and isinstance(ins.Location, DB.LocationCurve):
                ic = ins.Location.Curve
                mid = (ic.GetEndPoint(0) + ic.GetEndPoint(1)) / 2.0
                izr = zrange(ins, lv)
                if not izr:
                    continue
                rec['openings'].append({'at': r3((mid - a).DotProduct(dirv)), 'w': r3(ic.Length),
                                        'type': 'window', 'sill': izr[0], 'h': izr[1]})
                continue
            if not isinstance(ins, DB.FamilyInstance) or not isinstance(ins.Location, DB.LocationPoint):
                continue
            cat = ins.Category.Id
            kind = 'door' if cat == DOORS else 'window' if cat == WINDOWS else None
            if not kind:
                continue
            wd = size(ins, ('DOOR_WIDTH', 'WINDOW_WIDTH', 'FAMILY_WIDTH_PARAM', 'CASEWORK_WIDTH'))
            ht = size(ins, ('DOOR_HEIGHT', 'WINDOW_HEIGHT', 'FAMILY_HEIGHT_PARAM', 'GENERIC_HEIGHT'))
            o = {'at': r3((ins.Location.Point - a).DotProduct(dirv)), 'w': r3(wd or 3), 'type': kind, 'h': r3(ht or 7)}
            if kind == 'window':
                o['sill'] = r3(bip(ins, 'INSTANCE_SILL_HEIGHT_PARAM') or 3)
            rec['openings'].append(o)
        L['walls'].append(rec)
    if L['rooms'] or L['walls'] or L['slabs']:
        out.append(L)

pi = doc.ProjectInformation
result = {'project': {'name': pi.Name or doc.Title, 'ref': pi.Number or '', 'location': pi.Address or ''},
          'levels': out,
          'unplacedRooms': [r.get_Parameter(DB.BuiltInParameter.ROOM_NAME).AsString() for r in all_rooms if r.Area <= 0]}
