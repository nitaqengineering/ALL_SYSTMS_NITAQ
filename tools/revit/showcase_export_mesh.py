# NITAQ Showcase — export the real Revit geometry of every model element visible in a
# 3D view (walls, floors, stairs, railings, curtain walls, doors, furniture, fixtures...)
# as triangle meshes grouped by material colour, so the web viewer looks like Revit.
# Read-only: run through the pyRevit agent (run_query) with inputs {"out": "<file.json>"}.
# Coordinates are written in millimetres, already in viewer axes: (x, z, -y).
from pyrevit.api import DB
from System.Collections.Generic import List
from Autodesk.Revit.DB import Visual
import io
import os
import re
import json

FT_MM = 304.8
OUT = inputs['out']

# The model as a whole: the active 3D view when it is an ordinary (not camera) one, else the
# default {3D} view, else any non-perspective 3D view. Camera views would crop the model.
view = doc.ActiveView
if not isinstance(view, DB.View3D) or view.IsTemplate or view.IsPerspective:
    views3d = [v for v in DB.FilteredElementCollector(doc).OfClass(DB.View3D) if not v.IsTemplate and not v.IsPerspective]
    view = ([v for v in views3d if v.Name == '{3D}'] or views3d)[0]

SKIP = set(['Cameras', 'Lines', 'Curtain Wall Grids', 'Rooms', 'Areas', 'HVAC Zones'])
FURN = set(['Furniture', 'Furniture Systems', 'Plumbing Fixtures', 'Casework', 'Specialty Equipment',
            'Parking', 'Planting', 'Entourage', 'Lighting Fixtures', 'Electrical Fixtures',
            'Generic Models'])  # loose decor (rugs, plants) in villa models

opts = DB.Options()
opts.DetailLevel = DB.ViewDetailLevel.Medium
opts.IncludeNonVisibleObjects = False

DEFAULT = ((214, 210, 202), 0, '')
REDRESS = re.compile(r'sofa|couch|divano|poltrona|armchair|chair|sedia|bed|letto|table|tavolo|blocks_corner|entertainment|tv unit|plant|vase|foliage|bamboo|ficus|olive', re.I)
# Plants are rebuilt from their bounding box (a light olive tree), so their very heavy leaf
# geometry is not exported at all.
PLANT = re.compile(r'plant|vase|foliage|bamboo|ficus|olive', re.I)
mats = {}


def eid(i):
    return i.IntegerValue if hasattr(i, 'IntegerValue') else i.Value


# Render appearance of each material (what Revit's realistic view and renderer use):
# diffuse colour, texture image with its real-world size, glossiness and metal flag.
# Textures are looked up in the Autodesk material library (lowest resolution set first,
# to keep the web page light), then next to the project file.
looks = {}
LIB = [os.path.join(os.environ.get('CommonProgramFiles', r'C:\Program Files\Common Files'), 'Autodesk Shared', 'Materials', 'Textures'),
       os.path.join(os.environ.get('CommonProgramFiles(x86)', r'C:\Program Files (x86)\Common Files'), 'Autodesk Shared', 'Materials', 'Textures')]
TO_M = {'inches': 0.0254, 'feet': 0.3048, 'millimeters': 0.001, 'centimeters': 0.01, 'meters': 1.0}


def ascii_only(text):
    # IronPython's json encoder fails on non-ASCII .NET strings (Cyrillic/Italian material names)
    return ''.join([ch for ch in (text or '') if ord(ch) < 128])


def find_texture(value):
    for cand in [v.strip() for v in value.split('|') if v.strip()]:
        cand = cand.replace('/', os.sep).replace('\\', os.sep)
        tries = [cand] if os.path.isabs(cand) else \
            [os.path.join(b, cand) for b in LIB] + [os.path.join(os.path.dirname(doc.PathName or ''), cand)]
        for t in tries:
            if os.path.isfile(t) and ascii_only(t) == t:
                return t
    return None


def distance_m(prop):
    try:
        unit = prop.GetUnitTypeId().TypeId
    except Exception:
        unit = 'inches'
    for k, f in TO_M.items():
        if k in unit:
            return float(prop.Value) * f
    return float(prop.Value) * 0.0254


def appearance(m):
    ae = doc.GetElement(m.AppearanceAssetId) if eid(m.AppearanceAssetId) > 0 else None
    if ae is None:
        return None
    try:
        a = ae.GetRenderingAsset()
    except Exception:
        return None
    if a is None or a.Size == 0:
        return None
    # cls/schema let the viewer give untextured materials a fitting surface (wood, fabric...).
    look = {'name': ascii_only(m.Name), 'cls': ascii_only(m.MaterialClass), 'schema': ascii_only(a.Name)}
    colour = a.FindByName('generic_diffuse')  # other schemas keep the material's shading colour
    if colour is not None:
        try:
            c = colour.GetValueAsColor()
            look['rgb'] = [int(c.Red), int(c.Green), int(c.Blue)]
        except Exception:
            pass
        if colour.NumberOfConnectedProperties:
            bmp = colour.GetSingleConnectedAsset()
            path = bmp.FindByName('unifiedbitmap_Bitmap') if bmp is not None else None
            tex = find_texture(str(path.Value)) if path is not None else None
            if tex:
                look['tex'] = tex
                sx, sy = bmp.FindByName('texture_RealWorldScaleX'), bmp.FindByName('texture_RealWorldScaleY')
                look['sx'] = round(distance_m(sx), 4) if sx is not None else 0.3
                look['sy'] = round(distance_m(sy), 4) if sy is not None else look['sx']
    g = a.FindByName('generic_glossiness')
    if g is not None:
        try:
            look['gloss'] = round(float(g.Value), 3)
        except Exception:
            pass
    mt = a.FindByName('generic_is_metal')
    if mt is not None:
        try:
            look['metal'] = bool(mt.Value)
        except Exception:
            pass
    return look


def material(mid, fallback):
    k = eid(mid)
    if k in mats:
        return mats[k]
    m = doc.GetElement(mid) if k > 0 else None
    r = (fallback[0], fallback[1], '')
    if isinstance(m, DB.Material):
        c = m.Color
        look = appearance(m)
        key = ''
        if look:
            key = 'm%d' % k
            looks[key] = look
        r = ((c.Red, c.Green, c.Blue) if c.IsValid else fallback[0], m.Transparency, key)
    mats[k] = r
    return r


buckets = {}
stats = {'elements': 0, 'tris': 0, 'byCategory': {}}


def bucket(grp, m):
    key = '%s|%d,%d,%d|%d|%s' % (grp, m[0][0], m[0][1], m[0][2], m[1], m[2] if len(m) > 2 else '')
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
    # pieces the viewer re-dresses keep their own group, so it can read each one's shape and hide it
    if grp == 'furn' and c.Name.strip() in ('Furniture', 'Furniture Systems', 'Generic Models') and isinstance(e, DB.FamilyInstance)             and REDRESS.search('%s %s' % (e.Symbol.FamilyName, e.Name)):
        if PLANT.search('%s %s' % (e.Symbol.FamilyName, e.Name)):
            continue
        grp = 'furn:%d' % eid(e.Id)
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
f.write(u'},"doors":%s,"looks":%s}' % (json.dumps(doors), json.dumps(looks)))
f.close()
stats['doors'] = len(doors)
stats['hingedLeaves'] = sum(len(d['hinges']) for d in doors)
stats['looks'] = len(looks)
stats['textured'] = len([l for l in looks.values() if 'tex' in l])
stats['buckets'] = len(buckets)
result = stats
