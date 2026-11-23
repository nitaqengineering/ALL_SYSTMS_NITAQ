# NITAQ Showcase — export the real Revit geometry of every model element visible in a
# 3D view (walls, floors, stairs, railings, curtain walls, doors, furniture, fixtures...)
# as triangle meshes grouped by material colour, so the web viewer looks like Revit.
# Read-only: run through the pyRevit agent (run_query) with inputs {"out": "<file.json>"}.
# Coordinates are written in millimetres, already in viewer axes: (x, z, -y).
from pyrevit.api import DB
from System.Collections.Generic import List
import io
import json

FT_MM = 304.8
OUT = inputs['out']

view = doc.ActiveView
if not isinstance(view, DB.View3D) or view.IsTemplate:
    view = [v for v in DB.FilteredElementCollector(doc).OfClass(DB.View3D) if not v.IsTemplate][0]

SKIP = set(['Cameras', 'Lines', 'Curtain Wall Grids', 'Rooms', 'Areas', 'HVAC Zones'])
FURN = set(['Furniture', 'Furniture Systems', 'Plumbing Fixtures', 'Casework', 'Specialty Equipment',
            'Parking', 'Planting', 'Entourage', 'Lighting Fixtures', 'Electrical Fixtures'])

opts = DB.Options()
opts.DetailLevel = DB.ViewDetailLevel.Medium
opts.IncludeNonVisibleObjects = False

DEFAULT = ((214, 210, 202), 0)
mats = {}


def eid(i):
    return i.IntegerValue if hasattr(i, 'IntegerValue') else i.Value


def material(mid, fallback):
    k = eid(mid)
    if k in mats:
        return mats[k]
    m = doc.GetElement(mid) if k > 0 else None
    r = fallback
    if isinstance(m, DB.Material):
        c = m.Color
        r = ((c.Red, c.Green, c.Blue) if c.IsValid else fallback[0], m.Transparency)
    mats[k] = r
    return r


buckets = {}
stats = {'elements': 0, 'tris': 0, 'byCategory': {}}


def bucket(grp, m):
    key = '%s|%d,%d,%d|%d' % (grp, m[0][0], m[0][1], m[0][2], m[1])
    b = buckets.get(key)
    if b is None:
        b = buckets[key] = {'p': [], 'i': []}
    return b


def add_mesh(b, mesh):
    p, ii = b['p'], b['i']
    base = len(p) // 3
    verts = mesh.Vertices
    for k in range(verts.Count):
        v = verts[k]
        p.append(int(round(v.X * FT_MM)))
        p.append(int(round(v.Z * FT_MM)))
        p.append(int(round(-v.Y * FT_MM)))
    n = mesh.NumTriangles
    for t in range(n):
        tr = mesh.get_Triangle(t)
        ii.append(base + int(tr.get_Index(0)))
        ii.append(base + int(tr.get_Index(1)))
        ii.append(base + int(tr.get_Index(2)))
    return n


# Finish surfaces: walls and slabs are split per face so the viewer can apply finish schemes.
#   wall = interior wall face, ext = outward face of an exterior wall (facade),
#   floor = top of a slab with a slab/roof above it (interior), pave = top with open sky above,
#   ceil = underside of a slab or roof; other faces stay 'arch'.
UP_RAY = None
try:
    if not view.IsPerspective:
        UP_RAY = DB.ReferenceIntersector(DB.ElementMulticategoryFilter(
            List[DB.BuiltInCategory]([DB.BuiltInCategory.OST_Floors, DB.BuiltInCategory.OST_Roofs])),
            DB.FindReferenceTarget.Face, view)
except Exception:
    UP_RAY = None


def face_normal(f):
    try:
        bb = f.GetBoundingBox()
        uv = DB.UV((bb.Min.U + bb.Max.U) / 2, (bb.Min.V + bb.Max.V) / 2)
        return f.ComputeNormal(uv), f.Evaluate(uv)
    except Exception:
        return None, None


def covered(f):
    # Interior when most of the face has a slab or roof above it (5 x 5 samples on the face).
    if UP_RAY is None:
        return True
    bb = f.GetBoundingBox()
    inside = under = 0
    for i in range(5):
        for j in range(5):
            uv = DB.UV(bb.Min.U + (bb.Max.U - bb.Min.U) * (i + 0.5) / 5, bb.Min.V + (bb.Max.V - bb.Min.V) * (j + 0.5) / 5)
            if not f.IsInside(uv):
                continue
            inside += 1
            hit = UP_RAY.FindNearest(f.Evaluate(uv) + DB.XYZ(0, 0, 0.1), DB.XYZ(0, 0, 1))
            if hit is not None and hit.Proximity * 0.3048 < 12:
                under += 1
    return inside == 0 or under * 2 >= inside


def surface_kind(elem, cat):
    if cat == 'Walls' and isinstance(elem, DB.Wall) and elem.WallType.Kind != DB.WallKind.Curtain:
        exterior = elem.WallType.Function == DB.WallFunction.Exterior
        out = elem.Orientation
        def kind(f):
            n, _ = face_normal(f)
            if n is None or abs(n.Z) > 0.7:
                return 'ceil' if n is not None and n.Z < -0.7 else 'arch'
            return 'ext' if exterior and n.DotProduct(out) > 0.5 else 'wall'
        return kind
    if cat in ('Floors', 'Roofs', 'Ceilings'):
        def kind(f):
            n, pt = face_normal(f)
            if n is None:
                return 'arch'
            if n.Z > 0.7:
                m = doc.GetElement(f.MaterialElementId)
                if m is not None and 'grass' in m.Name.lower():  # lawns are never an interior floor
                    return 'pave'
                return 'floor' if cat == 'Floors' and covered(f) else 'pave' if cat == 'Floors' else 'arch'
            return 'ceil' if n.Z < -0.7 else 'arch'
        return kind
    return None


def walk(geo, grp, fb, route=None, kind=None):
    n = 0
    for g in geo:
        if isinstance(g, DB.Solid):
            if g.Faces.Size == 0:
                continue
            gg = route(g) if route else grp
            if gg is None:
                continue
            for f in g.Faces:
                try:
                    m = f.Triangulate(0.35)
                except Exception:
                    m = None
                if m is not None and m.NumTriangles:
                    fg = kind(f) if kind and gg == 'arch' else gg
                    n += add_mesh(bucket(fg, material(f.MaterialElementId, fb)), m)
        elif isinstance(g, DB.GeometryInstance):
            n += walk(g.GetInstanceGeometry(), grp, fb, route, kind)
        elif isinstance(g, DB.Mesh) and g.NumTriangles:
            n += add_mesh(bucket(grp, material(g.MaterialElementId, fb)), g)
    return n


# Doors: the leaf (Panel/Glass/Ironmongery solids) is exported apart from the frame, hinged where
# the door's plan swing arc is centred. The arc's closed end lies on the wall line, its open end
# shows which way the leaf swings, so no family convention has to be guessed.
LEAF = set(['Panel', 'Glass', 'Ironmongery'])
HIDDEN = set(['Clearance Zone', 'Mounting Space', 'Opening'])
plans = {}
for pv in DB.FilteredElementCollector(doc).OfClass(DB.ViewPlan):
    if not pv.IsTemplate and pv.ViewType == DB.ViewType.FloorPlan and pv.GenLevel is not None:
        plans.setdefault(eid(pv.GenLevel.Id), pv)
doors = []


def arcs(geo, out):
    for g in geo:
        if isinstance(g, DB.Arc) and g.Radius * 0.3048 > 0.3:
            out.append(g)
        elif isinstance(g, DB.GeometryInstance):
            arcs(g.GetInstanceGeometry(), out)
    return out


def hinges_of(d):
    pv = plans.get(eid(d.LevelId))
    if pv is None or not isinstance(d.Location, DB.LocationPoint):
        return []
    o = DB.Options()
    o.View = pv
    geo = d.get_Geometry(o)
    if geo is None:
        return []
    p, f = d.Location.Point, d.FacingOrientation
    out = []
    for a in arcs(geo, []):
        c, e0, e1 = a.Center, a.GetEndPoint(0), a.GetEndPoint(1)
        closed, opened = (e0, e1) if abs((e0 - p).DotProduct(f)) < abs((e1 - p).DotProduct(f)) else (e1, e0)
        u, w = closed - c, opened - c
        sign = 1 if u.X * w.Y - u.Y * w.X > 0 else -1
        ang = min(a.Length / a.Radius, 1.75)
        out.append([round(c.X * 0.3048, 3), round(c.Y * 0.3048, 3), sign, round(ang, 3)])
    return out


def door_route(d, di, hinges):
    p, h = d.Location.Point, d.HandOrientation
    def route(solid):
        gs = doc.GetElement(solid.GraphicsStyleId)
        sub = gs.GraphicsStyleCategory.Name if gs is not None else ''
        if sub in HIDDEN:
            return None
        if sub not in LEAF or not hinges:
            return 'door'
        if len(hinges) == 1:
            return 'leaf:%d:0' % di
        # double door: the leaf belongs to the hinge on its side of the door centre
        cen = solid.ComputeCentroid()
        side = (cen - p).DotProduct(h)
        best = min(range(len(hinges)), key=lambda i: abs(((hinges[i][0] / 0.3048 - p.X) * h.X + (hinges[i][1] / 0.3048 - p.Y) * h.Y) - side * 2))
        return 'leaf:%d:%d' % (di, best)
    return route


for e in DB.FilteredElementCollector(doc, view.Id).WhereElementIsNotElementType():
    c = e.Category
    if c is None or c.CategoryType != DB.CategoryType.Model or c.Name in SKIP:
        continue
    geo = e.get_Geometry(opts)
    if geo is None:
        continue
    fb = DEFAULT
    if c.Material is not None:
        fb = material(c.Material.Id, DEFAULT)
    # doors are their own group: the walk mode lets the visitor pass through them
    grp = 'furn' if c.Name in FURN else 'door' if c.Name == 'Doors' else 'arch'
    route = None
    if c.Name == 'Doors':
        hs = hinges_of(e)
        route = door_route(e, len(doors), hs)
        doors.append({'id': eid(e.Id), 'hinges': hs})
    n = walk(geo, grp, fb, route, surface_kind(e, c.Name))
    if n:
        stats['elements'] += 1
        stats['tris'] += n
        stats['byCategory'][c.Name] = stats['byCategory'].get(c.Name, 0) + n

# Written by hand: json.dumps on millions of numbers is slow under IronPython.
f = io.open(OUT, 'w', encoding='utf-8')
f.write(u'{"view":%s,"buckets":{' % json.dumps(view.Name))
for n, (k, b) in enumerate(buckets.items()):
    f.write(u'%s"%s":{"p":[%s],"i":[%s]}' % (u',' if n else u'', k, u','.join(map(str, b['p'])), u','.join(map(str, b['i']))))
f.write(u'},"doors":%s}' % json.dumps(doors))
f.close()
stats['doors'] = len(doors)
stats['hingedLeaves'] = sum(len(d['hinges']) for d in doors)
stats['buckets'] = len(buckets)
result = stats
