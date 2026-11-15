#!/usr/bin/env python3
"""
Turns Microsoft Rocketbox avatars (MIT licence, https://github.com/microsoft/Microsoft-Rocketbox)
into small glTF bodies for the street crowd: public/models/people/<name>.glb + index.json.

For each avatar:
  - FBX -> glTF with FBX2glTF (npm package fbx2gltf)
  - textures shrunk to 1024 px WebP: colour, normal, roughness (from the specular map), hair cards
  - skin re-toned to a South Asian range (face, neck, hands, arms) so the crowd looks like Kolkata;
    painted and carded hair darkened to black or dark brown
  - glb assembled by assemble.mjs (gltf-transform)
Usage: python3 convert.py /path/to/Microsoft-Rocketbox /path/to/out
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

RB, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
FBX2GLTF = os.environ.get("FBX2GLTF", "/tmp/conv/node_modules/fbx2gltf/bin/Linux/FBX2glTF")

# name: (folder, role, sex, skin L*, hair)   skin L*: lighter ~62, deeper ~44
BODIES = [
    ("Business_Male_06", "Professions", "office", "m", 56, "black"),
    ("Business_Male_07", "Professions", "office", "m", 50, "black"),
    ("Male_Adult_08", "Adults", "office", "m", 58, "black"),
    ("Business_Male_01", "Professions", "office", "m", 53, "pepper"),
    ("Business_Female_02", "Professions", "office", "f", 60, "black"),
    ("Female_Adult_02", "Adults", "office", "f", 57, "brown"),
    ("Male_Adult_06", "Adults", "student", "m", 54, "black"),
    ("Male_Adult_09", "Adults", "student", "m", 49, "black"),
    ("Male_Adult_10", "Adults", "student", "m", 57, "black"),
    ("Male_Adult_11", "Adults", "student", "m", 52, "brown"),
    ("Male_Adult_16", "Adults", "student", "m", 47, "black"),
    ("Male_Adult_20", "Adults", "student", "m", 55, "black"),
    ("Female_Adult_01", "Adults", "student", "f", 58, "black"),
    ("Female_Adult_03", "Adults", "student", "f", 52, "black"),
    ("Female_Adult_05", "Adults", "student", "f", 61, "brown"),
    ("Female_Adult_15", "Adults", "student", "f", 55, "black"),
    ("Female_Adult_17", "Adults", "student", "f", 50, "black"),
    ("Male_Adult_15", "Adults", "local", "m", 50, "pepper"),
    ("Male_Adult_14", "Adults", "local", "m", 46, "black"),
    ("Male_Adult_03", "Adults", "local", "m", 53, "pepper"),
    ("Male_Adult_05", "Adults", "local", "m", 48, "black"),
    ("Female_Adult_10", "Adults", "local", "f", 52, "black"),
    ("Female_Adult_04", "Adults", "local", "f", 54, "black"),
    ("Female_Adult_11", "Adults", "local", "f", 49, "black"),
    ("Gardener_Male_01", "Professions", "keeper", "m", 45, "black"),
    ("Security_Male_01", "Professions", "guard", "m", 50, "black"),
]

# ---------- colour maths (sRGB <-> CIELAB, D65) ----------
def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255.0
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
Minv = np.linalg.inv(M)
WHITE = np.array([0.95047, 1.0, 1.08883])
def f(t):
    return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
def finv(t):
    return np.where(t > 0.2069, t ** 3, (t - 16 / 116) / 7.787)
def to_lab(rgb):
    xyz = srgb_to_lin(rgb.astype(np.float64)) @ M.T / WHITE
    fx, fy, fz = f(xyz[..., 0]), f(xyz[..., 1]), f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], -1)
def to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    xyz = np.stack([finv(fx), finv(fy), finv(fz)], -1) * WHITE
    return lin_to_srgb(xyz @ Minv.T)

def skin_model(head_lab):
    """Skin colour statistics from the cheeks and forehead of the head texture (shared layout)."""
    h, w, _ = head_lab.shape
    patches = []
    for cx, cy in [(0.43, 0.36), (0.57, 0.36), (0.5, 0.2), (0.5, 0.45)]:
        x0, y0 = int((cx - 0.025) * w), int((cy - 0.025) * h)
        patches.append(head_lab[y0 : y0 + int(0.05 * h), x0 : x0 + int(0.05 * w)].reshape(-1, 3))
    s = np.concatenate(patches)
    mu = s.mean(0)
    cov = np.cov(s.T) + np.diag([60.0, 6.0, 8.0])  # slack for shading (lightness varies most) and blush
    return mu, np.linalg.inv(cov)

def skin_weight(lab, mu, icov):
    d = lab - mu
    m = np.sqrt(np.einsum("...i,ij,...j->...", d, icov, d))
    return np.clip(1 - (m - 2.6) / 2.4, 0, 1)

def generic_skin(lab):
    """Skin as seen anywhere: warm, moderately red and yellow, not too dark or too pale."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    ratio = b / np.maximum(a, 0.1)
    w = np.clip((a - 7) / 4, 0, 1) * np.clip((32 - a) / 4, 0, 1)
    w *= np.clip((b - 9) / 4, 0, 1) * np.clip((40 - b) / 4, 0, 1)
    w *= np.clip((ratio - 0.75) / 0.25, 0, 1) * np.clip((2.4 - ratio) / 0.4, 0, 1)
    w *= np.clip((L - 32) / 6, 0, 1) * np.clip((90 - L) / 5, 0, 1)
    return w

def region_mean(lab, w):
    k = w > 0.6
    return lab[k].mean(0) if k.sum() > 200 else None

def retone(lab, w, mu, target_L):
    """Move skin toward a warm brown of lightness target_L, keeping all the detail."""
    target = np.array([target_L, 14.5 + (62 - target_L) * 0.15, 21.0 + (62 - target_L) * 0.1])
    out = lab.copy()
    scale = target[0] / max(mu[0], 1)
    out[..., 0] = lab[..., 0] * (1 + w * (scale - 1))
    out[..., 1] = lab[..., 1] + w * (target[1] - mu[1])
    out[..., 2] = lab[..., 2] + w * (target[2] - mu[2])
    return out

HAIR = {"black": (16, 1.5, 3.0), "brown": (24, 5.0, 9.0), "pepper": (34, 0.5, 1.5)}
def darken_hair(lab, w, tone):
    L, a, b = HAIR[tone]
    out = lab.copy()
    # keep the strand detail: compress lightness toward the target around its own mean
    mean = (lab[..., 0] * w).sum() / max(w.sum(), 1)
    out[..., 0] = lab[..., 0] + w * ((L + (lab[..., 0] - mean) * 0.45) - lab[..., 0])
    out[..., 1] = lab[..., 1] + w * (a - lab[..., 1])
    out[..., 2] = lab[..., 2] + w * (b - lab[..., 2])
    return out

def load(path, size=1024, mode="RGB"):
    return Image.open(path).convert(mode).resize((size, size), Image.LANCZOS)

def main():
    os.makedirs(OUT, exist_ok=True)
    work = "/tmp/rbwork"
    os.makedirs(work, exist_ok=True)
    index = []
    for name, group, role, sex, skinL, hair in BODIES:
        src = os.path.join(RB, "Assets/Avatars", group, name)
        if not os.path.isdir(os.path.join(src, "Textures")):
            subprocess.run(["git", "-C", RB, "checkout", "HEAD", "--", f"Assets/Avatars/{group}/{name}"], check=True, capture_output=True)
        tex = {os.path.basename(p).split("_", 1)[1].rsplit(".", 1)[0]: os.path.join(src, "Textures", p) for p in os.listdir(os.path.join(src, "Textures")) if p.lower().endswith(".tga")}
        # FBX -> glTF (no textures; they are added below)
        fbx = os.path.join(src, "Export", name + ".fbx")
        subprocess.run([FBX2GLTF, "--binary", "--input", fbx, "--output", os.path.join(work, name)], check=True, capture_output=True)
        # ---- textures ----
        head = load(tex["head_color"])
        body = load(tex["body_color"])
        head_lab = to_lab(np.asarray(head, np.float64))
        body_lab = to_lab(np.asarray(body, np.float64))
        mu, icov = skin_model(head_lab)
        wh = skin_weight(head_lab, mu, icov)
        wb = np.maximum(skin_weight(body_lab, mu, icov), generic_skin(body_lab))
        mub = region_mean(body_lab, wb)
        print(name, "skin", mu.round(1), "mean skin weight body", wb.mean().round(3), flush=True)
        orig_head = head_lab.copy()
        head_lab = retone(head_lab, wh, mu, skinL)
        body_lab = retone(body_lab, wb, mub if mub is not None else mu, skinL)
        # painted hair on the scalp: the upper part of the head texture that is not skin
        hh, hw = wh.shape
        yy = np.arange(hh)[:, None] / hh
        # hair is darker and less red than skin in shadow, which keeps lips, ears and nostrils out
        xx = np.arange(hw)[None, :] / hw
        eyes_mouth = (xx < 0.26) & (yy > 0.6)  # the eyeball and mouth interior live here
        # everything on the head that is not skin, not the face, not the eye or mouth is hair
        face = (((xx - 0.5) / 0.17) ** 2 + ((yy - 0.33) / 0.2) ** 2 < 1) | ((abs(xx - 0.5) < 0.22) & (yy > 0.45))  # and the neck below it
        notskin = np.maximum.reduce([(0.4 - wh) / 0.3, (orig_head[..., 2] - mu[2] - 4) / 4, (mu[1] - orig_head[..., 1] - 5) / 4])
        scalp = np.clip(notskin, 0, 1) * (~eyes_mouth) * (~face) * (orig_head[..., 0] > 4)
        head_lab = darken_hair(head_lab, np.clip(scalp * 1.3, 0, 1), hair)
        Image.fromarray(to_rgb(head_lab).astype(np.uint8)).save(os.path.join(work, f"{name}_head.webp"), quality=86)
        Image.fromarray(to_rgb(body_lab).astype(np.uint8)).save(os.path.join(work, f"{name}_body.webp"), quality=86)
        for part in ("head", "body"):
            load(tex[f"{part}_normal"]).save(os.path.join(work, f"{name}_{part}_n.webp"), quality=90)
            spec = np.asarray(load(tex[f"{part}_specular"], 512, "L"), np.float64) / 255
            rough = np.clip(0.95 - spec * 0.75, 0.25, 1)
            g = (rough * 255).astype(np.uint8)
            rgb = np.stack([np.full_like(g, 255), g, np.zeros_like(g)], -1)  # glTF: roughness in G
            Image.fromarray(rgb).save(os.path.join(work, f"{name}_{part}_r.webp"), quality=88)
        # hair cards, eyebrows, lashes: darken the colour, keep the alpha
        op = load(tex["opacity_color"], 1024, "RGBA") if "opacity_color" in tex else None
        hair_file = os.path.join(work, f"{name}_hair.webp")
        if os.path.exists(hair_file):
            os.remove(hair_file)
        if op is not None:
            arr = np.asarray(op, np.float64)
            lab = to_lab(arr[..., :3])
            alpha = arr[..., 3]
            lab = darken_hair(lab, (alpha > 8).astype(np.float64), hair)
            rgba = np.concatenate([to_rgb(lab), alpha[..., None]], -1).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(hair_file, quality=90)
        # ---- assemble ----
        out = os.path.join(OUT, name + ".glb")
        # assemble.mjs needs @gltf-transform installed next to it: run a copy from the tools folder
        conv = os.environ.get("CONV_DIR", "/tmp/conv")
        subprocess.run(["cp", os.path.join(HERE, "assemble.mjs"), conv], check=True)
        subprocess.run(["node", os.path.join(conv, "assemble.mjs"), os.path.join(work, name + ".glb"), work, name, out], check=True, cwd=conv, capture_output=True)
        index.append({"name": name, "file": name + ".glb", "role": role, "sex": sex})
        print(name, os.path.getsize(out) // 1024, "KB", flush=True)
        # the 2048 px sources are large; drop them once used
        subprocess.run(["rm", "-rf", os.path.join(src, "Textures")])
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)

main()
