import sys
d=sys.argv[1]
def edit(f,a,b):
    p=d+'/'+f; s=open(p,encoding='utf-8').read(); assert s.count(a)==1,(f,a[:40],s.count(a)); open(p,'w',encoding='utf-8').write(s.replace(a,b))
edit('traffic.js','const COLOURS = [["#f1f1ef", 30], ["#b9bcc0", 16], ["#6f7378", 12], ["#1b1d21", 9], ["#9b1d20", 7], ["#23396b", 7], ["#5a4232", 4], ["#7a1c2c", 3], ["#2d4a3a", 3], ["#c9571f", 2], ["#d8c9a6", 3]];',
'const COLOURS = [["#f1f1ef", 15], ["#b9bcc0", 11], ["#6f7378", 8], ["#1b1d21", 7], ["#9b1d20", 8], ["#23396b", 7], ["#3b78b8", 6], ["#1f6f7a", 4], ["#5a4232", 4], ["#8c5a2b", 3], ["#7a1c2c", 4], ["#2d4a3a", 3], ["#566b3a", 3], ["#c9571f", 4], ["#d8c9a6", 4], ["#e0b840", 3], ["#a8412f", 4], ["#4a3f7a", 2]];')
edit('vehicles.js','    paint ||= o.material.clone();\n    paint.vertexColors = false;\n    paint.color.set(color);\n    paint.roughness = 0.35;\n    paint.metalness = 0.5;\n    o.material = paint;',
'''    if (!paint) {
      // the near-detail cars get a clear-coated metallic finish on the strong tier; the rest keep the cheap standard paint
      paint = m.near && CAR_TIER === "hi" ? new THREE.MeshPhysicalMaterial({ name: "paint", clearcoat: 1, clearcoatRoughness: 0.1 }) : o.material.clone();
    }
    paint.vertexColors = false;
    paint.color.set(color);
    paint.roughness = m.near ? 0.3 : 0.35;
    paint.metalness = m.near ? 0.6 : 0.5;
    o.material = paint;''')
print('ok')
