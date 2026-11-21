#!/usr/bin/env python3
"""Export MakeHuman/MPFB2 base mesh + rig + morph targets to a compact web format (hb.json + hb.bin).
All source data is CC0 (mpfb2 LICENSE.ASSETS.md). No Blender needed."""
import gzip, json, struct, sys
from pathlib import Path
import numpy as np

SRC = Path("/home/claude/cc/mpfb2/src/mpfb/data")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/cc/out")
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 0.1  # decimetres -> metres
NBODY = 13380

# ---------- base mesh ----------
V, VT, F = [], [], []
for line in open(SRC / "3dobjs/base.obj"):
    if line.startswith("v "):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith("vt "):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith("f "):
        F.append([tuple(int(i) - 1 for i in p.split("/")[:2]) for p in line.split()[1:]])
V = np.array(V, np.float32) * SCALE
VT = np.array(VT, np.float32)
print("verts", len(V), "uvs", len(VT), "faces", len(F))

# body faces only; split vertices per (v, vt) pair; triangulate
pair_index, orig, uvs, tris = {}, [], [], []
for f in F:
    if any(v >= NBODY for v, _ in f):
        continue
    ids = []
    for v, t in f:
        k = (v, t)
        if k not in pair_index:
            pair_index[k] = len(orig)
            orig.append(v)
            uvs.append(VT[t])
        ids.append(pair_index[k])
    for i in range(1, len(ids) - 1):
        tris.append((ids[0], ids[i], ids[i + 1]))
orig = np.array(orig, np.uint32)
uvs = np.array(uvs, np.float32)
tris = np.array(tris, np.uint32)
print("render verts", len(orig), "tris", len(tris))

# ---------- rig ----------
rig = json.load(open(SRC / "rigs/standard/rig.mixamo.json"))["bones"]
groups = json.load(open(SRC / "mesh_metadata/basemesh_vertex_groups.json"))

def group_indices(name):
    out = []
    for a, b in groups[name]:
        out.extend(range(a, b + 1))
    return out

# parents first
order, seen = [], set()
def add(n):
    if n in seen:
        return
    p = rig[n]["parent"]
    if p:
        add(p)
    seen.add(n)
    order.append(n)
for n in sorted(rig):
    add(n)
bidx = {n: i for i, n in enumerate(order)}

def joint_spec(j):
    if j["strategy"] == "CUBE":
        return group_indices(j["cube_name"])
    return list(j["vertex_indices"])  # MEAN

bones = []
for n in order:
    b = rig[n]
    bones.append({"name": n, "parent": bidx[b["parent"]] if b["parent"] else -1,
                  "head": joint_spec(b["head"]), "tail": joint_spec(b["tail"])})

# skin weights: top 4 per body vertex
w = json.load(open(SRC / "rigs/standard/weights.mixamo.json"))["weights"]
acc = [dict() for _ in range(NBODY)]
for bn, lst in w.items():
    if bn not in bidx:
        continue
    for v, wt in lst:
        if v < NBODY:
            acc[v][bidx[bn]] = acc[v].get(bidx[bn], 0) + wt
sk_i = np.zeros((NBODY, 4), np.uint8)
sk_w = np.zeros((NBODY, 4), np.float32)
missing = 0
for v, d in enumerate(acc):
    if not d:
        missing += 1
        continue
    top = sorted(d.items(), key=lambda kv: -kv[1])[:4]
    s = sum(x for _, x in top)
    for k, (bi, x) in enumerate(top):
        sk_i[v, k] = bi
        sk_w[v, k] = x / s
print("body verts without weights:", missing)
# render-vertex skin arrays
r_i = sk_i[orig]
r_w = sk_w[orig]

pending = []
def put_pending(a):
    pending.append(a)
    return len(pending) - 1

# ---------- targets ----------
targets = []  # {name, idx, delta}

def load_target(rel):
    p = SRC / "targets" / (rel + ".target.gz")
    if not p.exists():
        return None
    idx, d = [], []
    for line in gzip.open(p, "rt"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        a = line.split()
        idx.append(int(a[0]))
        d.append([float(a[1]), float(a[2]), float(a[3])])
    return np.array(idx, np.uint32), np.array(d, np.float32) * SCALE

tindex = {}
def reg(rel):
    if rel in tindex:
        return tindex[rel]
    t = load_target(rel)
    if t is None:
        print("  MISSING", rel)
        return None
    tindex[rel] = len(targets)
    targets.append({"name": rel, "idx": t[0], "d": t[1]})
    return tindex[rel]

# macro targets: young adults only for phase 0
races = ["african", "asian", "caucasian"]
genders = ["female", "male"]
age = "young"
muscles = ["minmuscle", "averagemuscle", "maxmuscle"]
weights_ = ["minweight", "averageweight", "maxweight"]
macro = {"race": [], "universal": [], "height": []}
for r in races:
    for g in genders:
        macro["race"].append({"race": r, "gender": g, "t": reg(f"macrodetails/{r}-{g}-{age}")})
for g in genders:
    for m in muscles:
        for wt in weights_:
            macro["universal"].append({"gender": g, "muscle": m, "weight": wt,
                                       "t": reg(f"macrodetails/universal-{g}-{age}-{m}-{wt}")})
            for h in ("minheight", "maxheight"):
                macro["height"].append({"gender": g, "muscle": m, "weight": wt, "h": h,
                                        "t": reg(f"macrodetails/height/{g}-{age}-{m}-{wt}-{h}")})

# face / body sliders: (id, label, dir, base, sides)
S = [
    ("jawWidth", "Jaw width", "chin", "chin-width", [""]),
    ("chinProminence", "Chin prominence", "chin", "chin-prominent", [""]),
    ("chinHeight", "Chin height", "chin", "chin-height", [""]),
    ("cheekbones", "Cheekbones", "cheek", "cheek-bones", ["l-", "r-"]),
    ("cheekVolume", "Cheek fullness", "cheek", "cheek-volume", ["l-", "r-"]),
    ("foreheadHeight", "Forehead height", "forehead", "forehead-scale-vert", [""]),
    ("foreheadShape", "Forehead roundness", "forehead", "forehead-nubian", [""]),
    ("eyeSize", "Eye size", "eyes", "eye-scale", ["l-", "r-"]),
    ("eyeSpacing", "Eye spacing", "eyes", "eye-trans", ["l-", "r-"]),
    ("eyeHeight", "Eye openness", "eyes", "eye-height1", ["l-", "r-"]),
    ("eyeTilt", "Eye corner tilt", "eyes", "eye-corner1", ["l-", "r-"]),
    ("noseWidth", "Nose width", "nose", "nose-scale-horiz", [""]),
    ("noseLength", "Nose length", "nose", "nose-scale-vert", [""]),
    ("noseProjection", "Nose projection", "nose", "nose-scale-depth", [""]),
    ("noseTip", "Nose tip", "nose", "nose-point", [""]),
    ("noseBridge", "Nose bridge", "nose", "nose-hump", [""]),
    ("mouthWidth", "Mouth width", "mouth", "mouth-scale-horiz", [""]),
    ("lowerLip", "Lower lip fullness", "mouth", "mouth-lowerlip-volume", [""]),
    ("upperLip", "Upper lip height", "mouth", "mouth-upperlip-height", [""]),
    ("earSize", "Ear size", "ears", "ear-scale", ["l-", "r-"]),
    ("earWing", "Ear stick-out", "ears", "ear-wing", ["l-", "r-"]),
    ("neckThickness", "Neck thickness", "neck", "neck-scale-horiz", [""]),
]
extra_dirs = {"incr": ("incr", "decr"), "pt": None}
sliders = []
for sid, label, d, base, sides in S:
    pos, neg = [], []
    for s in sides:
        # incr/decr naming varies: -incr/-decr, or direction words (in/out, up/down)
        for suffix_pos, suffix_neg in (("incr", "decr"), ("out", "in"), ("up", "down"), ("forward", "backward")):
            a = reg(f"{d}/{s}{base}-{suffix_pos}") if (SRC / f"targets/{d}/{s}{base}-{suffix_pos}.target.gz").exists() else None
            b = reg(f"{d}/{s}{base}-{suffix_neg}") if (SRC / f"targets/{d}/{s}{base}-{suffix_neg}.target.gz").exists() else None
            if a is not None or b is not None:
                if a is not None:
                    pos.append(a)
                if b is not None:
                    neg.append(b)
                break
    if not pos and not neg:
        print("  slider skipped (no targets):", sid)
        continue
    sliders.append({"id": sid, "label": label, "pos": pos, "neg": neg})
print("sliders", len(sliders), "targets", len(targets))


# ---------- eyes + shorts (phase 1a) ----------
def group_set(*names):
    out = set()
    for n in names:
        out.update(group_indices(n))
    return out

parts = {}
for key, names in (("eyeL", ["helper-l-eye"]), ("eyeR", ["helper-r-eye"]), ("lashL", ["helper-l-eyelashes-1", "helper-l-eyelashes-2"]), ("lashR", ["helper-r-eyelashes-1", "helper-r-eyelashes-2"])):
    gs = group_set(*names)
    verts, ptri = {}, []
    ecy = float(np.mean([V[i][1] for i in group_set("helper-l-eye" if "L" in key else "helper-r-eye")]))
    for f in F:
        if key.startswith("lash") and np.mean([V[v][1] for v, _ in f]) < ecy + 0.005:
            continue
        if all(v in gs for v, _ in f):
            ids = []
            for v, _ in f:
                if v not in verts:
                    verts[v] = len(verts)
                ids.append(verts[v])
            for i in range(1, len(ids) - 1):
                ptri.append((ids[0], ids[i], ids[i + 1]))
    parts[key] = {"orig": put_pending(np.array(list(verts.keys()), np.uint32)), "tris": put_pending(np.array(ptri, np.uint32))}
    print(key, len(verts), "verts", len(ptri), "tris")

def mean_y(spec):
    return float(np.mean([V[i][1] for i in spec]))
hips_y = mean_y(bones[bidx["mixamorig:Hips"]]["head"])
leg_y = mean_y(bones[bidx["mixamorig:LeftUpLeg"]]["head"])
top, bot = hips_y + 0.11, leg_y - 0.30
sel = []
for t in tris:
    p = V[orig[t]]
    if np.all((p[:, 1] < top) & (p[:, 1] > bot) & (np.abs(p[:, 0]) < 0.24)):
        sel.append(t)
print("shorts band", round(bot, 3), round(top, 3), "tris", len(sel))
shorts = np.array(sel, np.uint32)
hy = mean_y(bones[bidx["mixamorig:Head"]]["head"])
hsel = [t for t in tris if np.all(V[orig[t]][:, 1] > hy - 0.02)]
print("hair tris", len(hsel))
hairT = np.array(hsel, np.uint32)

# ---------- pack binary ----------
blob = bytearray()
def put(arr):
    arr = np.ascontiguousarray(arr)
    off = len(blob)
    blob.extend(arr.tobytes())
    while len(blob) % 4:
        blob.append(0)
    return {"off": off, "n": int(arr.size)}

man = {
    "scale": SCALE, "nFull": len(V), "nBody": NBODY,
    "base": put(V.astype(np.float32)),
    "orig": put(orig), "uv": put(uvs), "tris": put(tris.astype(np.uint32)),
    "skinIdx": put(r_i), "skinW": put(r_w),
    "bones": bones, "macro": macro, "sliders": sliders, "targets": [],
    "headBone": bidx["mixamorig:Head"], "shorts": put(shorts), "hair": put(hairT),
    "parts": {k: {"orig": put(pending[v["orig"]]), "tris": put(pending[v["tris"]])} for k, v in parts.items()},
}
for t in targets:
    d = t["d"]
    m = (float(np.abs(d).max()) if d.size else 0.0) or 1e-9
    q = np.round(d / m * 32767).astype(np.int16)
    man["targets"].append({"name": t["name"], "scale": m / 32767, "idx": put(t["idx"].astype(np.uint32)), "d": put(q)})
(OUT / "hb.bin").write_bytes(blob)
(OUT / "hb.json").write_text(json.dumps(man, separators=(",", ":")))
print("bin MB", round(len(blob) / 1e6, 2), "json KB", round((OUT / "hb.json").stat().st_size / 1e3))
