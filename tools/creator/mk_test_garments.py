# Builds two synthetic MakeHuman-format garments (test_tee, test_jeans) from the base mesh, to test the .mhclo fitter.
import numpy as np, os, sys
SRC="mpfb2/src/mpfb/data/3dobjs/base.obj"
V=[];VT=[];F=[]
for l in open(SRC):
    w=l.split()
    if not w: continue
    if w[0]=="v": V.append([float(x) for x in w[1:4]])
    elif w[0]=="vt": VT.append([float(x) for x in w[1:3]])
    elif w[0]=="f": F.append([(int(t.split("/")[0])-1, int(t.split("/")[1])-1 if "/" in t and t.split("/")[1] else -1) for t in w[1:]])
V=np.array(V); NB=13380
F=[f for f in F if all(v<NB for v,_ in f)]
N=np.zeros_like(V)
for f in F:
    p=V[[v for v,_ in f[:3]]]; n=np.cross(p[1]-p[0],p[2]-p[0])
    for v,_ in f: N[v]+=n
N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-9)
y0,y1=V[:NB,1].min(),V[:NB,1].max(); H=y1-y0
Y=lambda p:(p-y0)/H
def build(name,pred,off,color):
    d=f"/home/claude/tv/public/creator/clothes/{name}"; os.makedirs(d,exist_ok=True)
    sel=[f for f in F if all(pred(V[v]) for v,_ in f)]
    used=sorted({v for f in sel for v,_ in f}); remap={v:i for i,v in enumerate(used)}
    with open(f"{d}/{name}.obj","w") as o:
        for v in used: o.write("v %f %f %f\n"%tuple(V[v]))
        for t in VT: o.write("vt %f %f\n"%tuple(t))
        for f in sel: o.write("f "+" ".join(f"{remap[v]+1}/{t+1}" for v,t in f)+"\n")
    with open(f"{d}/{name}.mhclo","w") as o:
        o.write(f"# author test\n# license CC0\nname {name}\nobj_file {name}.obj\nmaterial {name}.mhmat\nverts 0\n")
        for v in used:
            dx,dy,dz=N[v]*off; o.write(f"{v} {v} {v} 1 0 0 {dx:.5f} {dy:.5f} {dz:.5f}\n")
        o.write("\ndelete_verts\n"+" ".join(str(v) for v in used)+"\n")
    open(f"{d}/{name}.mhmat","w").write(f"name {name}\ndiffuseColor {color}\n")
    print(name,len(used),"verts",len(sel),"faces")
build("test_tee",lambda p:0.55<Y(p[1])<0.835 and (abs(p[0])<0.13*H or (Y(p[1])>0.72 and abs(p[0])<0.235*H)),0.07,"0.85 0.85 0.88")
build("test_jeans",lambda p:0.06<Y(p[1])<0.55 and abs(p[0])<0.25*H,0.06,"0.2 0.3 0.5")
