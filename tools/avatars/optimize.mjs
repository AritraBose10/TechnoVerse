// Web-optimise a TechnoVerse avatar GLB: resize textures, convert to WebP, prune unused. Keeps every bone and the Col_* collider nodes.
// usage: node optimize.mjs in.glb out.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";
const [, , inp, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
doc.createExtension(EXTTextureWebP).setRequired(true);
const maxOf = (n) => (/^Skin_(BaseColor|Normal)$/.test(n) ? 2048 : /^Eye_/.test(n) ? 512 : /^Hair/.test(n) ? 1024 : 1024);
let before = 0, after = 0;
for (const t of doc.getRoot().listTextures()) {
  const name = t.getName() || t.getURI();
  const buf = Buffer.from(t.getImage());
  before += buf.length;
  const m = maxOf(name);
  const isNormal = /Normal/.test(name);
  const img = sharp(buf).resize(m, m, { fit: "inside", withoutEnlargement: true });
  const o = await img.webp({ quality: isNormal ? 90 : 85, alphaQuality: 95 }).toBuffer();
  t.setImage(new Uint8Array(o)).setMimeType("image/webp");
  after += o.length;
}
await doc.transform(prune({ keepLeaves: true, keepExtras: true }));
await io.write(out, doc);
console.log(inp, "textures", (before / 1e6).toFixed(1), "->", (after / 1e6).toFixed(1), "MB");
