"""Download Overture Maps building outlines around the university into tools/overture-buildings.json.

Needs: pip install duckdb. Pick the newest release from
https://docs.overturemaps.org/release/latest/ and set RELEASE below.
"""
import json, os
import duckdb

RELEASE = "2026-10-21.0"
W, E, S, N = 88.4226, 88.4343, 22.5706, 22.5815  # about 600 m around the university pin

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
rows = con.sql(f"""
SELECT id, names.primary AS name, class, subtype, height, num_floors, roof_shape, roof_color, facade_color,
       facade_material, sources[1].dataset AS src, ST_AsGeoJSON(geometry) AS geom
FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
WHERE bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}
""").fetchall()
cols = ["id", "name", "class", "subtype", "height", "num_floors", "roof_shape", "roof_color", "facade_color", "facade_material", "src", "geom"]
out = [dict(zip(cols, r)) for r in rows]
for o in out:
    o["geom"] = json.loads(o["geom"])
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "overture-buildings.json"), "w"))
print(len(out), "buildings")

# Named places (businesses, colleges, hotels). Used to name buildings that have exactly one inside.
rows = con.sql(f"""
SELECT id, names.primary, basic_category, confidence, ST_X(geometry), ST_Y(geometry), operating_status, sources[1].dataset
FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*', hive_partitioning=1)
WHERE bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}
""").fetchall()
places = [dict(zip(["id", "name", "category", "confidence", "lon", "lat", "status", "src"], r)) for r in rows]
json.dump(places, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "overture-places.json"), "w"), indent=0)
print(len(places), "places")
