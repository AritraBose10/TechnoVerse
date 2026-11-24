import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read(); o=s
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(a,s.count(a)); s=s.replace(a,b)
rep('import { fitLamps } from "./lampfit.js";','import { fitLamps } from "./lampfit.js";\nimport { MeshoptDecoder } from "/vendor/jsm/libs/meshopt_decoder.module.js";')
# near-tier flags: the converted high-poly kit models
near={'micra':(0.963,0.298),'altok10':(0.822,0.284),'alto800':(0.788,0.255),'m800':(0.765,0.249),'baleno':(1.053,0.327),'wuling':(0.858,0.314),'fortuner15':(0.895,0.418),'everest':(0.975,0.396),'safari':(0.883,0.373)}
for n,(k,wr) in near.items():
    pat=re.compile(r'(  %s: \{ kind: "[a-z]+", file: "%s")'%(n,n))
    assert pat.search(s),n
    s=pat.sub(r'\1, kit: true, near: true, k: %s, wr: %s'%(k,wr),s,1)
rep('export function preloadVehicles(high = true) {','''// Near-car detail tier, chosen once per session: "hi" (about 105K triangles a car) on strong machines, "mid" (about 55K) elsewhere.
// ?cars=hi|mid overrides it. The files are meshopt-compressed (models/vehicles/near/<tier>/).
const _q = new URLSearchParams(location.search);
export const CAR_TIER = _q.get("cars") === "hi" || _q.get("cars") === "mid" ? _q.get("cars") : (_q.get("q") === "high" || (navigator.hardwareConcurrency || 4) >= 12) ? "hi" : "mid";
export function preloadVehicles(high = true) {''')
rep('  const loader = new GLTFLoader();\n  const jobs = [];','  const loader = new GLTFLoader();\n  loader.setMeshoptDecoder(MeshoptDecoder);\n  const jobs = [];')
rep('loader.loadAsync(`/models/vehicles/${m.file}.glb`)','loader.loadAsync(m.near ? `/models/vehicles/near/${CAR_TIER}/${m.file}.glb` : `/models/vehicles/${m.file}.glb`)')
rep('g.scene.getObjectByName("lod1")?.removeFromParent(); // one level of detail is enough here','if (m.near) { const l1 = g.scene.getObjectByName("lod1"); if (l1) l1.visible = false; } // far copy (about 2.7K triangles): shown by setLod beyond ~38 m\n          else g.scene.getObjectByName("lod1")?.removeFromParent(); // one level of detail is enough here')
rep('    const L = lodGeo[name];\n    if (!L || m.kit) return false;','''    if (m.near) {
      const a = car.getObjectByName("lod0"), b = car.getObjectByName("lod1");
      if (!a || !b) return false;
      a.visible = !far; b.visible = far;
      return true;
    }
    const L = lodGeo[name];
    if (!L || m.kit) return false;''')
open(p,'w',encoding='utf-8').write(s)
print('ok')
