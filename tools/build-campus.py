"""Turn the OpenStreetMap extract (tools/osm-extract.json) into public/campus.json.

Output coordinates are metres from the university's map pin: x = east, z = south
(so north is -z, which matches the 3D scene). Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
LAT0, LON0 = 22.5760302, 88.4284409  # "Techno India University" node in OSM
RADIUS = 240  # keep things whose centre is within this many metres

def to_xz(lat, lon):
    x = (lon - LON0) * 111320 * math.cos(math.radians(LAT0))
    n = (lat - LAT0) * 110574
    return [round(x, 2), round(-n, 2)]

data = json.load(open(os.path.join(HERE, "osm-extract.json")))
nodes = {e["id"]: e for e in data["elements"] if e["type"] == "node"}
out = {"buildings": [], "roads": [], "pitches": [], "grass": [], "construction": [], "labels": []}

for e in data["elements"]:
    tags = e.get("tags", {})
    if e["type"] == "node":
        if "name" in tags:
            x, z = to_xz(e["lat"], e["lon"])
            if math.hypot(x, z) < RADIUS:
                out["labels"].append({"name": tags["name"], "x": x, "z": z})
        continue
    if e["type"] != "way":
        continue
    pts = [to_xz(nodes[n]["lat"], nodes[n]["lon"]) for n in e["nodes"] if n in nodes]
    if len(pts) < 2:
        continue
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    closed = e["nodes"][0] == e["nodes"][-1]
    ring = pts[:-1] if closed else pts
    if "highway" in tags:
        if any(math.hypot(p[0], p[1]) < RADIUS + 40 for p in pts):
            out["roads"].append({"kind": tags["highway"], "name": tags.get("name", ""), "oneway": tags.get("oneway") == "yes", "pts": pts})
        continue
    if math.hypot(cx, cz) > RADIUS or not closed:
        continue
    if "building" in tags:
        out["buildings"].append({"id": e["id"], "name": tags.get("name", ""), "pts": ring})
    elif tags.get("leisure") == "pitch":
        out["pitches"].append({"pts": ring})
    elif tags.get("landuse") == "grass":
        out["grass"].append({"pts": ring})
    elif tags.get("landuse") == "construction":
        out["construction"].append({"pts": ring})

path = os.path.join(HERE, "..", "public", "campus.json")
json.dump(out, open(path, "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items()}, os.path.getsize(path), "bytes")
for b in out["buildings"]:
    if math.hypot(sum(p[0] for p in b["pts"]) / len(b["pts"]), sum(p[1] for p in b["pts"]) / len(b["pts"])) < 130:
        print("building", b["id"], b["name"], b["pts"])
for r in out["roads"]:
    if r["kind"] == "secondary":
        print("road", r["oneway"], [p for p in r["pts"] if math.hypot(p[0], p[1]) < 260])
