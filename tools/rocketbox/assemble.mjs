// Puts the prepared WebP textures on a converted Rocketbox body and writes a compact glb.
// node assemble.mjs in.glb textureDir name out.glb   (run where @gltf-transform is installed)
import { NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";
import fs from "fs";
import path from "path";

const [inp, dir, name, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions([EXTTextureWebP]);
const doc = await io.read(inp);
const root = doc.getRoot();
doc.createExtension(EXTTextureWebP).setRequired(true);
const tex = (file) => doc.createTexture(file).setImage(new Uint8Array(fs.readFileSync(path.join(dir, `${name}_${file}.webp`)))).setMimeType("image/webp");
const T = {};
for (const f of ["head", "body", "head_n", "body_n", "head_r", "body_r", "hair"]) if (fs.existsSync(path.join(dir, `${name}_${f}.webp`))) T[f] = tex(f);
for (const mat of root.listMaterials()) {
  const n = mat.getName().toLowerCase();
  mat.setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]).setEmissiveTexture(null);
  if (n.includes("opacity")) {
    mat.setBaseColorTexture(T.hair || null).setBaseColorFactor([1, 1, 1, 1]).setAlphaMode("MASK").setAlphaCutoff(0.4).setDoubleSided(true);
    mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setRoughnessFactor(0.55);
    mat.setName("hair");
  } else {
    const part = n.includes("head") ? "head" : "body";
    mat.setBaseColorTexture(T[part]).setBaseColorFactor([1, 1, 1, 1]).setAlphaMode("OPAQUE");
    mat.setNormalTexture(T[`${part}_n`]).setMetallicRoughnessTexture(T[`${part}_r`]);
    mat.setName(part === "head" ? "skin_head" : "body");
  }
}
// FBX2glTF leaves empty placeholder textures behind; drop them and anything unused
for (const t of root.listTextures()) if (!Object.values(T).includes(t)) t.dispose();
await doc.transform(prune(), dedup());
await io.write(out, doc);
