// Shrink a prepared tree .glb for download: WebP textures, normal maps halved to 1024, colour maps keep their size.
//   node compress.mjs <in.glb> <out.glb>
// needs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
// Not done on purpose: meshopt/quantized geometry (herotrees.js leaf sway reads vertex positions in model units, quantizing rescales them)
// and KTX2 (needs the `toktx` binary from KTX-Software; would cut GPU memory about 4x, see docs/STATUS.md).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node compress.mjs in.glb out.glb'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(dedup(), prune());
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /normalTexture/, resize: [1024, 1024], quality: 90 }));
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /baseColorTexture/, quality: 92 }));
await io.write(output, doc);
