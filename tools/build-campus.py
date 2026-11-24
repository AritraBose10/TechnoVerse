"""Build public/campus.json from map data.

Inputs (all in tools/):
  osm-extract.json        OpenStreetMap extract from the Overpass API (500 m around the university pin)
  overture-buildings.json Overture Maps building outlines for the same area. Fills the many buildings
                          OpenStreetMap is missing here, from Google Open Buildings and Microsoft footprints.
  survey.json             Hand corrections checked against street-level and satellite imagery:
                          floors, facade style and roof colour for nearby buildings, outdated outlines
                          replaced, and a few outlines missing from both sources.

Output coordinates are metres from the university's map pin: x = east, z = south (north is -z, which
matches the 3D scene).

Map data (c) OpenStreetMap contributors, ODbL. Overture Maps buildings, ODbL (includes Google Open
Buildings, CC BY 4.0, and Microsoft building footprints, ODbL).

Area: the Sector V boundary polygon in tools/sector-v-boundary.json (made by tools/make-boundary.py from OpenStreetMap
features), plus a 30 m margin. Features are kept when their centre (roads: any vertex) is inside; roads are clipped at the edge.

Refresh the inputs (see README "Map data"):
  node tools/fetch-sector-v.mjs      # finds the boundary features, downloads tools/osm-extract.json for their box
  python3 tools/make-boundary.py     # writes tools/sector-v-boundary.json
  Overture: see tools/fetch-overture.py (still the old 600 m box)
  python3 tools/build-campus.py && python3 tools/validate-campus.py
The Overpass query is (per tile of the box): [out:json][timeout:180];(nwr(S,W,N,E););out body;>;out skel qt;
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
LAT0, LON0 = 22.5760302, 88.4284409  # "Techno India University" node in OSM
RADIUS = 600  # the old map: a 600 m square around the pin. Now only the area the Overture extract covers.
KEEP_BUS_STOPS = {"College More"}  # bus stops are not labelled, except the ones that name a junction on the boundary
MARGIN = 30  # metres outside the boundary polygon that are still kept
M_PER_DEG_LON = 111320 * math.cos(math.radians(LAT0))
M_PER_DEG_LAT = 110574


def to_xz(lat, lon):
    return [round((lon - LON0) * M_PER_DEG_LON, 2), round(-(lat - LAT0) * M_PER_DEG_LAT, 2)]


BOUNDARY = json.load(open(os.path.join(HERE, "sector-v-boundary.json")))
POLY = [to_xz(la, lo) for la, lo in BOUNDARY["polygon_latlon"]]
PX0, PX1 = min(p[0] for p in POLY) - MARGIN, max(p[0] for p in POLY) + MARGIN
PZ0, PZ1 = min(p[1] for p in POLY) - MARGIN, max(p[1] for p in POLY) + MARGIN


def _seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def in_area(x, z):
    """Inside the boundary polygon, or within MARGIN metres of it."""
    if x < PX0 or x > PX1 or z < PZ0 or z > PZ1:
        return False
    if inside(x, z, POLY):
        return True
    return any(_seg_dist(x, z, POLY[i - 1], POLY[i]) <= MARGIN for i in range(len(POLY)))


def runs(pts):
    """Clip a polyline to the area: the stretches of consecutive vertices inside, each extended by one vertex at either end."""
    flags = [in_area(p[0], p[1]) for p in pts]
    out, cur = [], []
    for i, p in enumerate(pts):
        if flags[i]:
            if not cur and i > 0:
                cur.append(pts[i - 1])
            cur.append(p)
        else:
            if cur:
                cur.append(p)
                out.append(cur)
                cur = []
    if cur:
        out.append(cur)
    return [r for r in out if len(r) >= 2]


def from_survey(p):  # survey points are [east, north]
    return [float(p[0]), -float(p[1])]


def area(pts):
    return abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))) / 2


def centroid(pts):
    return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]


def inside(x, z, pts):
    hit = False
    for i in range(len(pts)):
        a, b = pts[i], pts[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
    return hit


def overlap(a, b):
    """Rough share of polygon a covered by polygon b, by sampling a grid over a."""
    xs = [p[0] for p in a]
    zs = [p[1] for p in a]
    n = hit = 0
    for i in range(12):
        for j in range(12):
            x = min(xs) + (max(xs) - min(xs)) * (i + 0.5) / 12
            z = min(zs) + (max(zs) - min(zs)) * (j + 0.5) / 12
            if inside(x, z, a):
                n += 1
                hit += inside(x, z, b)
    return hit / n if n else 0


def simplify(pts):
    """Drop repeated points and points on a straight line."""
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 0.3:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 0.3:
        out.pop()
    return out


def levels(tags):
    for key in ("building:levels", "num_floors"):
        try:
            return max(1, round(float(tags[key])))
        except (KeyError, TypeError, ValueError):
            pass
    try:
        return max(1, round(float(str(tags["height"]).split()[0]) / 3.7))
    except (KeyError, TypeError, ValueError):
        return None


data = json.load(open(os.path.join(HERE, "osm-extract.json")))
overture = json.load(open(os.path.join(HERE, "overture-buildings.json")))
survey = json.load(open(os.path.join(HERE, "survey.json")))

DROP = set(survey.get("drop", {}).get("osm", []))
nodes = {e["id"]: e for e in data["elements"] if e["type"] == "node"}
ways = {e["id"]: e for e in data["elements"] if e["type"] == "way"}
out = {"buildings": [], "roads": [], "paths": [], "pitches": [], "grass": [], "water": [], "construction": [], "trees": [], "labels": [], "rail": []}


def way_pts(w):
    return [to_xz(nodes[n]["lat"], nodes[n]["lon"]) for n in w["nodes"] if n in nodes]


def near(pts):
    c = centroid(pts)
    return in_area(c[0], c[1])


# ---------- OpenStreetMap ----------
osm_buildings = []
for e in data["elements"]:
    tags = e.get("tags", {})
    if e["type"] == "node":
        x, z = to_xz(e["lat"], e["lon"])
        if not in_area(x, z):
            continue
        if tags.get("natural") == "tree":
            out["trees"].append({"x": x, "z": z})
        elif "name" in tags and (tags.get("highway") != "bus_stop" or tags["name"] in KEEP_BUS_STOPS):
            out["labels"].append({"name": tags["name"], "x": x, "z": z, "sid": f"osm:node/{e['id']}"})
        continue

    if e["type"] == "way" and tags.get("railway") == "subway":
        pts = way_pts(e)
        for part in runs(pts):
            out["rail"].append({"pts": part, "name": tags.get("name", ""), "sid": f"osm:way/{e['id']}"})
        continue

    if e["type"] == "relation":
        # Multipolygon buildings: use each outer ring as its own outline.
        if "building" in tags and tags.get("type") == "multipolygon":
            for m in e["members"]:
                if m["type"] == "way" and m["role"] == "outer" and m["ref"] in ways:
                    pts = simplify(way_pts(ways[m["ref"]]))
                    if len(pts) >= 3 and near(pts):
                        osm_buildings.append({"id": m["ref"], "sid": f"osm:way/{m['ref']}", "name": tags.get("name", ""), "pts": pts, "floors": levels(tags), "src": "osm"})
        continue

    if e["type"] != "way" or e["id"] in DROP:
        continue
    pts = way_pts(e)
    if len(pts) < 2:
        continue
    closed = e["nodes"][0] == e["nodes"][-1]
    hw = tags.get("highway")
    if hw:
        parts = runs(pts)
        if not parts:
            continue
        sid = f"osm:way/{e['id']}"
        if hw in ("footway", "path", "pedestrian", "steps", "cycleway"):
            for part in parts:
                out["paths"].append({"kind": hw, "pts": part, "sid": sid})
        elif hw not in ("construction", "proposed", "platform"):
            try:
                lanes = int(tags.get("lanes", 0))
            except ValueError:
                lanes = 0
            for part in parts:
                out["roads"].append({"kind": hw, "name": tags.get("name", ""), "oneway": tags.get("oneway") == "yes", "lanes": lanes, "pts": part, "sid": sid})
        continue
    if not closed:
        continue
    ring = simplify(pts[:-1])
    if len(ring) < 3 or not near(ring):
        continue
    if "building" in tags or "building:part" in tags:
        osm_buildings.append({"id": e["id"], "sid": f"osm:way/{e['id']}", "name": tags.get("name", ""), "pts": ring, "floors": levels(tags), "src": "osm"})
    elif tags.get("leisure") == "pitch":
        out["pitches"].append({"sport": tags.get("sport", ""), "pts": ring})
    elif tags.get("landuse") in ("grass", "meadow", "village_green") or tags.get("leisure") in ("park", "garden"):
        out["grass"].append({"pts": ring})
    elif tags.get("natural") == "water" or tags.get("leisure") == "swimming_pool":
        out["water"].append({"name": tags.get("name", ""), "pts": ring})
    elif tags.get("landuse") == "construction":
        out["construction"].append({"pts": ring})

# ---------- Overture: buildings OpenStreetMap does not have ----------
extra = []
def _bb(pts):
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
for _b in osm_buildings:
    _b["_bb"] = _bb(_b["pts"])
for i, b in enumerate(overture):
    if b["src"] == "OpenStreetMap":
        continue  # already in the OSM extract, with its tags
    g = b["geom"]
    ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
    pts = simplify([to_xz(lat, lon) for lon, lat in ring])
    if len(pts) < 3 or not near(pts) or area(pts) < 12:
        continue
    ob = _bb(pts)
    cand = [o for o in osm_buildings if not (o["_bb"][2] < ob[0] or o["_bb"][0] > ob[2] or o["_bb"][3] < ob[1] or o["_bb"][1] > ob[3])]
    if any(overlap(pts, o["pts"]) > 0.3 or overlap(o["pts"], pts) > 0.3 for o in cand):
        continue
    extra.append({"id": f"ov{i}", "sid": f"overture:{b['id']}", "name": b["name"] or "", "pts": pts, "floors": b["num_floors"], "src": "overture"})
for _b in osm_buildings:
    del _b["_bb"]
buildings = osm_buildings + extra

# ---------- survey corrections ----------
for s in survey.get("split", []):
    base = next((b for b in buildings if b["id"] == s["osm"]), None)
    if not base:
        print("split: building", s["osm"], "not found")
        continue
    buildings.remove(base)
    pts = base["pts"]
    # Long axis of the outline: direction of its longest edge.
    edges = [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    a, b = max(edges, key=lambda e: math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]))
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    if ux < 0:  # measure from the west end
        ux, uz = -ux, -uz
    vx, vz = -uz, ux
    along = [p[0] * ux + p[1] * uz for p in pts]
    across = [p[0] * vx + p[1] * vz for p in pts]
    s0, s1, w0, w1 = min(along), max(along), min(across), max(across)
    for k, part in enumerate(s["parts"]):
        t0, t1 = part["t"]
        p0, p1 = s0 + (s1 - s0) * t0, s0 + (s1 - s0) * t1
        box = [[p * ux + w * vx, p * uz + w * vz] for p, w in ((p0, w0), (p1, w0), (p1, w1), (p0, w1))]
        # keep only the part of the box inside the original outline (approximately: shrink to it)
        box = [[round(x, 2), round(z, 2)] for x, z in box]
        buildings.append({"id": f"{s['osm']}-{k}", "name": part.get("name", ""), "pts": box, "floors": part.get("floors"), "style": part.get("style"), "roof": part.get("roof"), "src": "survey", "sid": f"survey:{s['osm']}-{k}"})

for k, add in enumerate(survey.get("add", [])):
    pts = [from_survey(p) for p in add["pts"]]
    buildings.append({"id": f"sv{k}", "sid": f"survey:sv{k}", "name": add.get("name", ""), "pts": pts, "floors": add.get("floors"), "style": add.get("style"), "roof": add.get("roof"), "src": "survey"})

for s in survey.get("buildings", []):
    x, z = from_survey(s["at"])
    hits = [b for b in buildings if inside(x, z, b["pts"])]
    if not hits:
        print("survey: no building at", s["at"])
        continue
    b = min(hits, key=lambda b: area(b["pts"]))
    for key in ("name", "floors", "style", "roof"):
        if key in s:
            b[key] = s[key]

# Names for unnamed buildings from Overture places (businesses and institutions with a map pin).
# Only when exactly one confident place sits inside the outline: big multi-tenant blocks stay
# unnamed unless the survey names them.
try:
    places = json.load(open(os.path.join(HERE, "overture-places.json")))
except FileNotFoundError:
    places = []
# OpenStreetMap's named points first (shops, offices, colleges mapped as points).
TIU_ID = 134101262  # the university building: named and modelled separately in world.js
for b in buildings:
    if b.get("name") or b["id"] == TIU_ID:
        continue
    hits = [l["name"] for l in out["labels"] if inside(l["x"], l["z"], b["pts"]) and not l["name"].lower().startswith("techno india university")]
    if len(set(hits)) == 1:
        b["name"] = hits[0]
        b["name_src"] = "osm-point"
SKIP = {"atm", "printing_service", "parking", "bus_station", "public_toilet"}
for b in buildings:
    if b.get("name") or b["id"] == TIU_ID:
        continue
    inside_here = []
    for p in places:
        if (p.get("confidence") or 0) < 0.8 or p.get("category") in SKIP or not p.get("name"):
            continue
        x, z = to_xz(p["lat"], p["lon"])
        if inside(x, z, b["pts"]):
            inside_here.append(p["name"])
    if len(set(inside_here)) == 1 and len(inside_here[0]) <= 40:
        b["name"] = inside_here[0]
        b["name_src"] = "overture-places"

for w in survey.get("water", []):
    out["water"].append({"name": w.get("name", ""), "pts": [from_survey(p) for p in w["pts"]]})

# Construction areas: the survey's list replaces OpenStreetMap's, which is out of date here.
if "construction" in survey:
    out["construction"] = [{"pts": [from_survey(p) for p in c["pts"]]} for c in survey["construction"]]

for b in buildings:
    b["area"] = round(area(b["pts"]))
    for key in [k for k, v in b.items() if v in (None, "")]:
        if key != "name":
            del b[key]
out["buildings"] = sorted(buildings, key=lambda b: str(b["id"]))

counts = {k: len(v) for k, v in out.items()}
bb = json.load(open(os.path.join(HERE, "sector-v-bbox.json")))
out["meta"] = {
    "bounds": {"xMin": round(PX0), "xMax": round(PX1), "zMin": round(PZ0), "zMax": round(PZ1)},
    "osmDate": bb.get("fetched"),
    "counts": counts,
    "source": "OpenStreetMap (ODbL), Overture Maps buildings inside the old 600 m box only, hand survey; boundary: tools/sector-v-boundary.json",
}
path = os.path.join(HERE, "..", "public", "campus.json")
json.dump(out, open(path, "w"), separators=(",", ":"))
print(counts, os.path.getsize(path), "bytes")
print("buildings by source:", {s: sum(1 for b in buildings if b["src"] == s) for s in ("osm", "overture", "survey")})
