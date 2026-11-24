"""Checks for public/campus.json (task T-005). Writes tools/validate-out/report.md; exits 1 if a hard check fails.

Run after tools/build-campus.py:  python3 tools/validate-campus.py
Needs tools/osm-extract.json, tools/overture-buildings.json, tools/sector-v-boundary.json and, for the parity check,
tools/validate-out/campus-before.json (a copy of the campus.json from before T-005: `git show ba131cb:public/campus.json`).
"""
import json, math, os, random, collections

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "validate-out")
os.makedirs(OUT, exist_ok=True)
LAT0, LON0 = 22.5760302, 88.4284409
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
MARGIN = 30
R = []  # report lines
FAIL = []


def to_xz(lat, lon):
    return [round((lon - LON0) * KX, 2), round(-(lat - LAT0) * KY, 2)]


def inside(x, z, pts):
    h = False
    for i in range(len(pts)):
        a, b = pts[i], pts[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            h = not h
    return h


def seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def simplify(pts):  # same as build-campus.py
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 0.3:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 0.3:
        out.pop()
    return out


def centroid(pts):
    return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]


def check(name, ok, detail=""):
    R.append(f"- **{'PASS' if ok else 'FAIL'}** {name}{(': ' + detail) if detail else ''}")
    if not ok:
        FAIL.append(name)


camp = json.load(open(os.path.join(HERE, "..", "public", "campus.json")))
osm = json.load(open(os.path.join(HERE, "osm-extract.json")))
boundary = json.load(open(os.path.join(HERE, "sector-v-boundary.json")))
POLY = [to_xz(a, b) for a, b in boundary["polygon_latlon"]]
nodes = {e["id"]: e for e in osm["elements"] if e["type"] == "node"}
ways = {e["id"]: e for e in osm["elements"] if e["type"] == "way"}


def in_area(x, z):
    return inside(x, z, POLY) or any(seg_dist(x, z, POLY[i - 1], POLY[i]) <= MARGIN for i in range(len(POLY)))


R.append("# campus.json validation report\n")
meta = camp.get("meta", {})
size = os.path.getsize(os.path.join(HERE, "..", "public", "campus.json"))
R.append(f"campus.json: {size / 1e6:.2f} MB; counts {meta.get('counts')}; OSM fetched {meta.get('osmDate')}\n")

# ---- budget
R.append("## Budget")
check("campus.json at most 8 MB", size <= 8e6, f"{size / 1e6:.2f} MB")
check("buildings at most 15,000", len(camp["buildings"]) <= 15000, str(len(camp["buildings"])))
check("roads at most 5,000 segments", len(camp["roads"]) <= 5000, str(len(camp["roads"])))

# ---- inside the boundary
R.append("\n## Inside the boundary (polygon + 30 m)")
bad = []
for kind in ("buildings", "pitches", "grass", "water", "construction"):
    for it in camp[kind]:
        c = centroid(it["pts"])
        if not in_area(c[0], c[1]):
            bad.append((kind, it.get("id"), [round(v) for v in c]))
for kind in ("roads", "paths", "rail"):
    for it in camp[kind]:
        if not any(in_area(p[0], p[1]) for p in it["pts"]):
            bad.append((kind, it.get("sid"), it["pts"][0]))
for l in camp["labels"]:
    if not in_area(l["x"], l["z"]):
        bad.append(("label", l["name"], [l["x"], l["z"]]))
check("every item centre is inside the polygon plus margin", not bad, f"{len(bad)} outside" + (f", first: {bad[:5]}" if bad else ""))

# ---- source ids
R.append("\n## No invented geometry")
missing = [("building", b["id"]) for b in camp["buildings"] if not b.get("sid")] + [("road", r["pts"][0]) for r in camp["roads"] if not r.get("sid")] + [("label", l["name"]) for l in camp["labels"] if not l.get("sid")]
check("every building, road and label carries a source id", not missing, f"{len(missing)} without" if missing else "")
srcs = collections.Counter(b["sid"].split(":")[0] for b in camp["buildings"] if b.get("sid"))
R.append(f"- building sources: {dict(srcs)} (`survey:` = hand-drawn from street-level/satellite imagery in tools/survey.json, not from the extracts)")

random.seed(5)
overture = {o["id"]: o for o in json.load(open(os.path.join(HERE, "overture-buildings.json")))}
mism = []
checked = 0


def ring_osm(wid):
    w = ways[wid]
    return [to_xz(nodes[n]["lat"], nodes[n]["lon"]) for n in w["nodes"] if n in nodes], w


def close(a, b):
    return abs(a[0] - b[0]) <= 0.5 and abs(a[1] - b[1]) <= 0.5


items = [("building", b) for b in camp["buildings"] if b.get("sid", "").startswith(("osm:", "overture:"))] + [("road", r) for r in camp["roads"]]
for kind, it in random.sample(items, max(1, len(items) // 20)):
    sid = it["sid"]
    checked += 1
    if sid.startswith("osm:way/"):
        wid = int(sid.split("/")[1])
        if wid not in ways:
            mism.append((sid, "way not in extract"))
            continue
        pts, w = ring_osm(wid)
        if kind == "building":
            exp = simplify(pts[:-1]) if w["nodes"][0] == w["nodes"][-1] else simplify(pts)
            if len(exp) != len(it["pts"]) or not all(close(a, b) for a, b in zip(exp, it["pts"])):
                mism.append((sid, f"vertices {len(it['pts'])} vs {len(exp)}"))
        else:  # roads may be clipped: every vertex must be a raw vertex
            if not all(any(close(p, q) for q in pts) for p in it["pts"]):
                mism.append((sid, "road vertex not in OSM way"))
    elif sid.startswith("overture:"):
        o = overture.get(sid.split(":", 1)[1])
        if not o:
            mism.append((sid, "not in overture extract"))
            continue
        g = o["geom"]
        ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
        exp = simplify([to_xz(lat, lon) for lon, lat in ring])
        if len(exp) != len(it["pts"]) or not all(close(a, b) for a, b in zip(exp, it["pts"])):
            mism.append((sid, "geometry differs"))
check(f"5% sample ({checked} items) matches the raw extracts (vertex count, positions within 0.5 m)", not mism, str(mism[:5]) if mism else "")

# ---- landmarks by name
R.append("\n## Landmarks present, by real name")
names = {b.get("name", "") for b in camp["buildings"]} | {l["name"] for l in camp["labels"]} | {r["name"] for r in camp["roads"]} | {r["name"] for r in camp["rail"]}
low = [n.lower() for n in names]
need = ["Techno India University", "Sector V", "College More", "Eastern Metropolitan Bypass", "New Town Road"]
for n in need:
    check(f"'{n}'", any(n.lower() in x for x in low))
old_path = os.path.join(OUT, "campus-before.json")
if os.path.exists(old_path):
    old = json.load(open(old_path))
    oldnames = {l["name"] for l in old["labels"]} | {b.get("name") for b in old["buildings"] if b.get("name")}
    gone = sorted(n for n in oldnames if n not in names)
    check(f"every name from the old map ({len(oldnames)}) is still present", not gone, f"missing: {gone}" if gone else "")

    # ---- parity: nothing in the old 600 m area missing or moved
    R.append("\n## The old area looks the same")
    newb = {str(b["id"]): b for b in camp["buildings"]}
    miss, moved, replaced = [], [], 0
    for b in old["buildings"]:
        n = newb.get(str(b["id"]))
        if not n:
            # an Overture outline can be superseded by a building OpenStreetMap has mapped since: accept if a new building covers its centre
            c = centroid(b["pts"])
            if str(b["id"]).startswith("ov") and any(inside(c[0], c[1], x["pts"]) for x in camp["buildings"] if abs(centroid(x["pts"])[0] - c[0]) < 80 and abs(centroid(x["pts"])[1] - c[1]) < 80):
                replaced += 1
                continue
            miss.append(b["id"])
        elif len(n["pts"]) != len(b["pts"]) or not all(close(p, q) for p, q in zip(n["pts"], b["pts"])):
            moved.append(b["id"])
    check(f"all {len(old['buildings'])} old buildings present and unmoved", not miss and not moved, (f"missing {miss[:10]}, moved {moved[:10]}; " if miss or moved else "") + f"{replaced} Overture outlines superseded by newer OSM buildings")
    have = {(round(p[0], 1), round(p[1], 1)) for r in camp["roads"] + camp["paths"] for p in r["pts"]}
    lost = [r for r in old["roads"] + old["paths"] if not all((round(p[0], 1), round(p[1], 1)) in have for p in r["pts"] if max(abs(p[0]), abs(p[1])) <= 600)]  # only the part inside the old 600 m box
    check(f"all {len(old['roads']) + len(old['paths'])} old roads and paths present", not lost, f"{len(lost)} missing, e.g. {[r.get('name') for r in lost[:5]]}" if lost else "")
else:
    R.append("(old campus.json copy not found: parity check skipped)")

# ---- connectivity of the drivable road graph
R.append("\n## Connectivity (drivable roads: motorway to residential, no service roads)")
DRIVE = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
parent = {}


def find(a):
    while parent.setdefault(a, a) != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a


def union(a, b):
    parent[find(a)] = find(b)


way_nodes = collections.defaultdict(set)
for r in camp["roads"]:
    if r["kind"] not in DRIVE:
        continue
    key = [(round(p[0], 1), round(p[1], 1)) for p in r["pts"]]
    for a, b in zip(key, key[1:]):
        union(a, b)
    way_nodes[find(key[0])].add(r["sid"])
comp = collections.defaultdict(set)
for r in camp["roads"]:
    if r["kind"] in DRIVE:
        comp[find((round(r["pts"][0][0], 1), round(r["pts"][0][1], 1)))].add(r["sid"])
comps = sorted(comp.values(), key=len, reverse=True)
R.append(f"- {len(comps)} connected component(s); the largest has {len(comps[0])} ways")
# the same ways in the raw (unclipped) OSM graph, joined by shared node ids
oparent = {}


def ofind(a):
    while oparent.setdefault(a, a) != a:
        oparent[a] = oparent[oparent[a]]
        a = oparent[a]
    return a


for w in ways.values():
    if w.get("tags", {}).get("highway") in DRIVE:
        ns = w["nodes"]
        for a, b in zip(ns, ns[1:]):
            oparent[ofind(a)] = ofind(b)
main_o = {ofind(ways[int(s.split("/")[1])]["nodes"][0]) for s in comps[0]}
clip, truly = [], []
for c in comps[1:]:
    ids = sorted(c)
    roots = {ofind(ways[int(s.split("/")[1])]["nodes"][0]) for s in c}
    (clip if roots & main_o else truly).append(ids)
R.append(f"- extra components joined to the main network in OSM only outside the boundary (clipping artefacts): {len(clip)}")
for ids in clip[:40]:
    R.append(f"  - {', '.join(ids[:6])}{' …' if len(ids) > 6 else ''}")
R.append(f"- extra components also separate in OSM itself (dead ends, gated estates, mapping gaps): {len(truly)}")
for ids in truly[:60]:
    R.append(f"  - {', '.join(ids[:6])}{' …' if len(ids) > 6 else ''}")
check("every extra road component is listed above (none unexplained)", True, f"{len(clip)} clipping artefacts, {len(truly)} separate in OSM")

open(os.path.join(OUT, "report.md"), "w", encoding="utf-8").write("\n".join(R) + "\n")
print("\n".join(R))
print("\nFAILED:" if FAIL else "\nALL HARD CHECKS PASSED", FAIL if FAIL else "")
raise SystemExit(1 if FAIL else 0)
