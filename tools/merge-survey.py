#!/usr/bin/env python3
"""Merge a survey export from public/survey.html into tools/survey.json, then rebuild public/campus.json.

Usage (from the repo folder):
    python3 tools/merge-survey.py                       # tools/survey-export.json -> survey.json + rebuild
    python3 tools/merge-survey.py path/to/export.json   # another file
    python3 tools/merge-survey.py --no-build            # merge only

An entry whose point lies within 3 m of an existing survey entry replaces that entry's fields (only the
fields the export sets), so surveying a building twice updates it instead of duplicating it.
tools/survey.json is copied to tools/survey.json.bak first.
"""
import json, math, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
build = "--no-build" not in sys.argv
src = args[0] if args else os.path.join(HERE, "survey-export.json")
dst = os.path.join(HERE, "survey.json")

export = json.load(open(src))
survey = json.load(open(dst))
shutil.copyfile(dst, dst + ".bak")
rows = survey.setdefault("buildings", [])

added = updated = 0
for e in export.get("buildings", []):
    hit = next((r for r in rows if math.hypot(r["at"][0] - e["at"][0], r["at"][1] - e["at"][1]) < 3), None)
    fields = {k: v for k, v in e.items() if k != "at"}
    if hit:
        hit.update(fields)
        updated += 1
    else:
        rows.append({"at": e["at"], **fields})
        added += 1

with open(dst, "w") as f:
    json.dump(survey, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"survey.json: {added} added, {updated} updated ({len(rows)} entries). Backup: survey.json.bak")

if build:
    r = subprocess.run([sys.executable, os.path.join(HERE, "build-campus.py")], cwd=os.path.join(HERE, ".."))
    if r.returncode:
        sys.exit(r.returncode)
    print("campus.json rebuilt. Restart the server and hard-refresh the game.")
