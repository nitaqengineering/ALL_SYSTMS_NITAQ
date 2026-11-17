# NITAQ Showcase — export the real Revit geometry of every model element visible in a
# 3D view (walls, floors, stairs, railings, curtain walls, doors, furniture, fixtures...)
# as triangle meshes grouped by material colour, so the web viewer looks like Revit.
# Read-only: run through the pyRevit agent (run_query) with inputs {"out": "<file.json>"}.
# Coordinates are written in millimetres, already in viewer axes: (x, z, -y).
from pyrevit.api import DB
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


def walk(geo, grp, fb):
    n = 0
    for g in geo:
        if isinstance(g, DB.Solid):
            if g.Faces.Size == 0:
                continue
            for f in g.Faces:
                try:
                    m = f.Triangulate(0.35)
                except Exception:
                    m = None
                if m is not None and m.NumTriangles:
                    n += add_mesh(bucket(grp, material(f.MaterialElementId, fb)), m)
        elif isinstance(g, DB.GeometryInstance):
            n += walk(g.GetInstanceGeometry(), grp, fb)
        elif isinstance(g, DB.Mesh) and g.NumTriangles:
            n += add_mesh(bucket(grp, material(g.MaterialElementId, fb)), g)
    return n


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
    grp = 'furn' if c.Name in FURN else 'arch'
    n = walk(geo, grp, fb)
    if n:
        stats['elements'] += 1
        stats['tris'] += n
        stats['byCategory'][c.Name] = stats['byCategory'].get(c.Name, 0) + n

# Written by hand: json.dumps on millions of numbers is slow under IronPython.
f = io.open(OUT, 'w', encoding='utf-8')
f.write(u'{"view":%s,"buckets":{' % json.dumps(view.Name))
for n, (k, b) in enumerate(buckets.items()):
    f.write(u'%s"%s":{"p":[%s],"i":[%s]}' % (u',' if n else u'', k, u','.join(map(str, b['p'])), u','.join(map(str, b['i']))))
f.write(u'}}')
f.close()
stats['buckets'] = len(buckets)
result = stats
