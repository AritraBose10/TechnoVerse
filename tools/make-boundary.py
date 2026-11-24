"""Build tools/sector-v-boundary.json: the Sector V boundary polygon, derived from OpenStreetMap.

Inputs (written by tools/fetch-sector-v.mjs): sector-v-features.json (raw Overpass features) and sector-v-bbox.json.
Edges (each recorded with the OSM ids it came from in the output):
  north  Bypass -> along the old map's northern limit (22.5816, just north of Salt Lake Sector V station, node 7976140073, which
         lies inside) -> north end of way/325486011
  east   way/325486011 (New Town Road, Action Area I), north end to south end
  south  south end of the east way -> the old map's southern limit (22.5702, a little south of Meen Bhavan) -> the Bypass
         (College More, the bus stop by the university at 22.5749, lies inside, 0.0047 deg north of this edge; the old 600 m
         map ran to 22.5706 and the task requires it to stay whole, so the south edge is not drawn through College More)
  west   the westernmost carriageway of the Eastern Metropolitan Bypass between those two latitudes
A 30 m margin is applied when the polygon is used (build-campus.py), not baked into the vertices.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
feat = json.load(open(os.path.join(HERE, "sector-v-features.json")))["elements"]
bbox = json.load(open(os.path.join(HERE, "sector-v-bbox.json")))
SOUTH_LAT = 22.5702
NORTH_LAT = 22.5816  # the old map ran 600 m north of the pin (22.5814); kept whole


def pts(e):
    return [(g["lat"], g["lon"]) for g in e["geometry"]] if "geometry" in e else [(e["lat"], e["lon"])]


station = next(e for e in feat if e["type"] == "node" and e["id"] == 7976140073)
east = next(e for e in feat if e["type"] == "way" and e["id"] == 325486011)
ep = pts(east)
if ep[0][0] < ep[-1][0]:
    ep = ep[::-1]  # north end first
north_lat = max(station["lat"] + 0.0005, NORTH_LAT)

# west edge: the westernmost Bypass carriageway point in each 0.0004 deg latitude band
byp = [e for e in feat if e["type"] == "way" and "Eastern Metropolitan Bypass" in e.get("tags", {}).get("name", "") and e.get("tags", {}).get("highway")]
bands = {}
used = set()
for e in byp:
    for lat, lon in pts(e):
        if SOUTH_LAT <= lat <= north_lat:
            k = round(lat / 0.0004)
            if k not in bands or lon < bands[k][1]:
                bands[k] = (lat, lon)
                used.add(e["id"])
west = [bands[k] for k in sorted(bands, reverse=True)]  # north to south
# order: north end -> station -> east edge -> south edge (east to west) -> west edge going north
west_up = west[::-1]  # south to north
poly = [west[0], (NORTH_LAT, station["lon"]), (NORTH_LAT, 88.4400)] + ep + [(SOUTH_LAT, 88.4400)] + west_up[:-1]
out = {
    "note": __doc__.strip().split("\n")[0],
    "margin_m": 30,
    "south_lat": SOUTH_LAT,
    "polygon_latlon": [[round(a, 7), round(b, 7)] for a, b in poly],
    "osm_ids": {"station": "node/7976140073", "east": "way/325486011", "bypass_ways": sorted(used), "college_more": bbox.get("collegeMore")},
    "fetched": bbox.get("fetched"),
}
json.dump(out, open(os.path.join(HERE, "sector-v-boundary.json"), "w"), indent=1)
print(len(poly), "vertices;", "bypass ways:", len(used))
