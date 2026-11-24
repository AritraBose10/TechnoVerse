// Prepare a downloaded tree model (Poly Haven "glTF" download: a .gltf + .bin + textures folder, or a .glb) for the game:
// one .glb, welded, simplified to about TARGET triangles, unused data removed.
//   node prep.mjs <input.gltf|.glb> <output.glb> [targetTriangles=20000]
// needs: npm i @gltf-transform/core @gltf-transform/functions meshoptimizer
// Leaf-card trees simplify badly if pushed hard (cards collapse into blobs): if a tree looks sparse, raise the target.
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, dedup, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , input, output, target = '20000'] = process.argv;
if (!input || !output) { console.error('usage: node prep.mjs in.gltf out.glb [targetTriangles]'); process.exit(1); }
await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(input);
const count = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = count();
await doc.transform(flatten(), join(), weld({ tolerance: 0.0005 }));
const ratio = Math.min(1, Number(target) / Math.max(1, count()));
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }));
await doc.transform(dedup(), prune({ keepAttributes: true }));
await io.write(output, doc);
console.log(`${input}: ${Math.round(before)} -> ${Math.round(count())} triangles, written to ${output}`);
