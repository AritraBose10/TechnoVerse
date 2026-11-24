import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,(a[:50],s.count(a)); s=s.replace(a,b)
for n in ('dzire','triber','scorpion'):
    pat=re.compile(r'(  %s: \{ kind: "[a-z]+", file: "[a-z_]+", kit: true), k:'%n)
    assert pat.search(s),n
    s=pat.sub(r'\1, near: true, k:',s,1)
rep('            o.material.roughness = 0.05;\n','            o.material.roughness = 0.05;\n            if (m.near) o.material.envMapIntensity = 1.6; // the sky shows in the glass\n')
rep('    paint.roughness = m.near ? 0.3 : 0.35;','    paint.roughness = m.near ? 0.3 : 0.35;\n    paint.envMapIntensity = m.near ? 1.5 : 1; // near cars pick up the sky reflection more strongly')
open(p,'w',encoding='utf-8').write(s); print('ok')
