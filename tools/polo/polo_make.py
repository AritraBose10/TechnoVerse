import bpy, bmesh, numpy as np, math, sys, os
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
VARIANT=sys.argv[sys.argv.index("--")+1]          # reboot | sof | tiu
OUTDIR=sys.argv[sys.argv.index("--")+2]
GLB="/mnt/user-data/uploads/Desktop/Metaverse-crash/public/models/people/Male_Adult_16.glb"
TEX="/home/claude/polo/tex"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
body=[o for o in bpy.data.objects if o.type=="MESH" and len(o.data.vertices)>1000][0]
for o in [o for o in bpy.data.objects if o.type=="MESH" and o is not body]: bpy.data.objects.remove(o,do_unlink=True)
mw=body.matrix_world.copy(); mwi=mw.inverted(); mw3=mw.to_3x3(); mwi3=mwi.to_3x3()
bone=lambda n:(arm.matrix_world@arm.data.bones[n].head_local)
HEM_Z=1.73; NECK_Z=2.36
me=body.data
bm=bmesh.new(); bm.from_mesh(me)
bmesh.ops.transform(bm,matrix=mw,verts=bm.verts)
NCEN=Vector((0.012,0.0,0.0)); SLEEVE_T=0.60
arms={}
for side in "LR":
    sh=bone(f"Bip01 {side} UpperArm"); el=bone(f"Bip01 {side} Forearm"); arms[side]=(sh,el,(el-sh).normalized(),(el-sh).length)
def cut(co_,no_):
    geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
    bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-6,plane_co=co_,plane_no=no_)
cut(Vector((0,0,HEM_Z)),Vector((0,0,1)))
for side in "LR":
    sh,el,an,L=arms[side]; cut(sh+an*L*SLEEVE_T,an)
for k in range(8):
    a_=k*math.pi/4+math.pi/8; no=Vector((math.cos(a_),math.sin(a_),0)); cut(NCEN+no*0.10,no)
bm.normal_update()
def inside(c):
    if c.z<HEM_Z-1e-4 or c.z>2.43: return False
    r=math.hypot(c.x-NCEN.x,c.y-NCEN.y)
    # neck: remove everything inside the octagonal opening
    if c.z>2.25 and all(((c.x-NCEN.x)*math.cos(k*math.pi/4+math.pi/8)+(c.y-NCEN.y)*math.sin(k*math.pi/4+math.pi/8))<0.10 for k in range(8)): return False
    if abs(c.y)<0.245: return True
    for side in "LR":
        sh,el,an,L=arms[side]; v=c-sh; t=v.dot(an)/L
        if -0.4<=t<=SLEEVE_T+0.01 and (v-an*(t*L)).length<0.095 and (c.y*(1 if side=="R" else -1))>0: return True
    return False
for f in list(bm.faces):
    if not inside(f.calc_center_median()): bm.faces.remove(f)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context="VERTS")
bmesh.ops.transform(bm,matrix=mwi,verts=bm.verts)
g=bpy.data.meshes.new("polo"); bm.to_mesh(g); bm.free()
polo=bpy.data.objects.new("polo",g); bpy.context.collection.objects.link(polo)
polo.parent=body.parent; polo.matrix_parent_inverse=body.matrix_parent_inverse.copy(); polo.matrix_world=mw.copy()
bpy.context.view_layer.objects.active=polo
for o in bpy.data.objects: o.select_set(False)
polo.select_set(True)
m=polo.modifiers.new("sub","SUBSURF"); m.levels=1; m.render_levels=1; m.boundary_smooth="PRESERVE_CORNERS"
bpy.ops.object.modifier_apply(modifier="sub")
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.0004); bpy.ops.object.mode_set(mode="OBJECT")
g=polo.data
W=lambda v:mw@v; Lc=lambda w:mwi@w
bm=bmesh.new(); bm.from_mesh(g); bm.normal_update(); bm.verts.ensure_lookup_table()
for v in bm.verts:
    w=W(v.co); off=0.0145
    if abs(w.y)>0.2: off=0.016
    if w.z<HEM_Z+0.12: off=0.017
    v.co+=v.normal*off
bm.normal_update()
# boundary loops
def loops():
    be=[e for e in bm.edges if e.is_boundary]; seen=set(); out=[]
    for e in be:
        if e in seen: continue
        comp=[]; stack=[e]
        while stack:
            x=stack.pop()
            if x in seen: continue
            seen.add(x); comp.append(x)
            for v in x.verts:
                for ne in v.link_edges:
                    if ne.is_boundary and ne not in seen: stack.append(ne)
        out.append(comp)
    return out
def center(edges):
    vs={v for e in edges for v in e.verts}; return sum((W(v.co) for v in vs),Vector())/len(vs),vs
kind=bm.faces.layers.int.new("kind")   # 0 fabric, 1 rib, 2 collar
neck=hem=None; cuffs=[]
for comp in loops():
    c,vs=center(comp)
    if c.z>2.3 and abs(c.y)<0.08: neck=(comp,vs)
    elif c.z<1.9: hem=(comp,vs)
    elif c.y>0.2: cuffs.append(("R",comp,vs,c))
    elif c.y<-0.2: cuffs.append(("L",comp,vs,c))
best={}
for c in cuffs:
    if c[0] not in best or len(c[1])>len(best[c[0]][1]): best[c[0]]=c
print("all loops",[(round(c[3].y,2),round(c[3].z,2),len(c[1])) for c in cuffs])
cuffs=list(best.values())
print("loops neck",bool(neck),"hem",bool(hem),"cuffs",[c[0] for c in cuffs])
# hem: flat, then a band 2.5 cm down
for v in hem[1]:
    w=W(v.co); v.co=Lc(Vector((w.x,w.y,HEM_Z)))
r=bmesh.ops.extrude_edge_only(bm,edges=hem[0])
nv=[x for x in r["geom"] if isinstance(x,bmesh.types.BMVert)]
hc=sum((W(v.co) for v in nv),Vector())/len(nv)
for v in nv:
    w=W(v.co); d=Vector((w.x-hc.x,w.y-hc.y,0)); d.normalize() if d.length else None
    v.co=Lc(Vector((w.x,w.y,w.z-0.018))+d*0.002)
# neck: snap to a round opening, then collar
ncen=Vector((0.012,0.0,0))
for v in neck[1]:
    w=W(v.co); a=math.atan2(w.y,(w.x-ncen.x)); v.co=Lc(Vector((ncen.x+0.088*math.cos(a)*1.05,0.082*math.sin(a),w.z)))
r=bmesh.ops.extrude_edge_only(bm,edges=neck[0])
ring1=[x for x in r["geom"] if isinstance(x,bmesh.types.BMVert)]
for v in ring1: w=W(v.co); v.co=Lc(Vector((w.x*0.985+0.0002,w.y*0.97,w.z+0.040)))
faces1=[x for x in r["geom"] if isinstance(x,bmesh.types.BMFace)]
ring_edges=list({e for v in ring1 for e in v.link_edges if all(x in ring1 for x in e.verts) and e.is_boundary})
r2=bmesh.ops.extrude_edge_only(bm,edges=ring_edges)
ring2=[x for x in r2["geom"] if isinstance(x,bmesh.types.BMVert)]
for v in ring2:
    w=W(v.co); d=Vector((w.x-ncen.x,w.y,0)); d.normalize(); v.co=Lc(Vector((w.x,w.y,w.z-0.050))+d*0.058)
faces2=[x for x in r2["geom"] if isinstance(x,bmesh.types.BMFace)]
for f in faces1+faces2: f[kind]=2
# cuffs: 4 cm ribbed band along the arm
for side,comp,vs,c in cuffs:
    sh=bone(f"Bip01 {side} UpperArm"); el=bone(f"Bip01 {side} Forearm"); an=(el-sh).normalized()
    r=bmesh.ops.extrude_edge_only(bm,edges=comp)
    nv=[x for x in r["geom"] if isinstance(x,bmesh.types.BMVert)]
    cc=sum((W(v.co) for v in nv),Vector())/len(nv)
    for v in nv:
        w=W(v.co); w=cc+(w-cc)*0.95+an*0.045; v.co=Lc(w)
    for f in [x for x in r["geom"] if isinstance(x,bmesh.types.BMFace)]: f[kind]=1
# placket: a raised 3.6 cm strip down the centre front
bm.normal_update()
pl=[f for f in bm.faces if f[kind]==0 and (mwi3@Vector((0,0,0))) is not None]
sel=[]
for f in bm.faces:
    if f[kind]!=0: continue
    c=W(f.calc_center_median()); n=(mw3@f.normal).normalized()
    if n.x<-0.35 and abs(c.y)<0.020 and 2.12<c.z<2.345: sel.append(f)
dup=bmesh.ops.duplicate(bm,geom=sel)
dvs=[x for x in dup["geom"] if isinstance(x,bmesh.types.BMVert)]
dfs=[x for x in dup["geom"] if isinstance(x,bmesh.types.BMFace)]
bm.normal_update()
for v in dvs: v.co+=v.normal*0.0035
for f in dfs: f[kind]=0
# diagonal (design C)
if VARIANT=="tiu":
    # white where s + 0.31*(z-1.72) - 0.15 > 0, with s = -y (wearer's left is -y)
    n_w=Vector((0,-1.0,0.31)); n_w.normalize(); d0=0.15/Vector((0,-1.0,0.31)).length
    # plane: -y*1 + 0.31*z = 0.15+0.31*1.72 ; point on plane: y=0,z=(0.15+0.31*1.72)/0.31
    pz=(0.15+0.31*1.72)/0.31; pco=Lc(Vector((0,0,pz))); pno=(mw3.transposed()@n_w).normalized()
    geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
    bmesh.ops.bisect_plane(bm,geom=geom,dist=0.0002,plane_co=pco,plane_no=pno)
    bm.normal_update()
# materials
def mat(name,col,rough=0.9,metal=0.0,nmap=None,nscale=1.0,tex=None,alpha=False):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; b=nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value=(*col,1); b.inputs["Roughness"].default_value=rough; b.inputs["Metallic"].default_value=metal
    if nmap:
        t=nt.nodes.new("ShaderNodeTexImage"); t.image=bpy.data.images.load(nmap); t.image.colorspace_settings.name="Non-Color"
        n=nt.nodes.new("ShaderNodeNormalMap"); n.inputs["Strength"].default_value=nscale
        nt.links.new(t.outputs["Color"],n.inputs["Color"]); nt.links.new(n.outputs["Normal"],b.inputs["Normal"])
    if tex:
        t=nt.nodes.new("ShaderNodeTexImage"); t.image=bpy.data.images.load(tex); t.interpolation="Linear"
        nt.links.new(t.outputs["Color"],b.inputs["Base Color"]); nt.links.new(t.outputs["Alpha"],b.inputs["Alpha"])
        try: m.surface_render_method="BLENDED"
        except Exception: pass
        try: m.blend_method="BLEND"
        except Exception: pass
    return m
srgb=lambda h:tuple(((c/255.0)**2.2) for c in h)
PN=TEX+"/pique_n.png"; RN=TEX+"/rib_n.png"
mats=[]; idx={}
def add(name,*a,**k):
    mats.append(mat(name,*a,**k)); idx[name]=len(mats)-1
if VARIANT=="tiu":
    NAVY=srgb((0x0F,0x1D,0x3A)); WHITE=srgb((0xF5,0xF5,0xF5))
    add("fabric_white",WHITE,0.92,nmap=PN,nscale=0.8); add("fabric_navy",NAVY,0.92,nmap=PN,nscale=0.8)
    add("rib_white",WHITE,0.95,nmap=RN,nscale=1.2); add("rib_navy",NAVY,0.95,nmap=RN,nscale=1.2)
    add("button",(0.92,0.92,0.9),0.4)
else:
    BLK=(0.012,0.012,0.012)
    add("fabric_black",BLK,0.93,nmap=PN,nscale=0.8); add("rib_black",(0.03,0.03,0.032),0.8,nmap=RN,nscale=1.6); add("button",(0.02,0.02,0.02),0.35)
    idx["fabric_white"]=idx["fabric_navy"]=0; idx["rib_white"]=idx["rib_navy"]=1
for f in bm.faces:
    c=W(f.calc_center_median()); s=-c.y; white=True
    if VARIANT=="tiu": white=(s+0.31*(c.z-1.72)-0.15)>0
    k=f[kind]
    if k==2 and VARIANT=="tiu": white=True   # the collar is white on the diagonal polo
    name=("fabric_" if k==0 else "rib_")+("white" if white else "navy")
    if VARIANT!="tiu": name="fabric_black" if k==0 else "rib_black"
    f.material_index=idx[name]
# triplanar UVs, 10 cm per repeat
uv=bm.loops.layers.uv.verify()
for f in bm.faces:
    n=mw3@f.normal
    for l in f.loops:
        w=W(l.vert.co); a=[abs(n.x),abs(n.y),abs(n.z)]; m_=a.index(max(a))
        u,v=((w.y,w.z),(w.x,w.z),(w.x,w.y))[m_]; l[uv].uv=(u*10,v*10)
bm.to_mesh(g); bm.free()
for p in g.polygons: p.use_smooth=True
for m_ in mats: g.materials.append(m_)
g.update()
# ---- ray casting helpers for buttons and decals ----
def cast(origin,direction,maxd=1.0):
    ok,loc,nor,fi=polo.ray_cast(mwi@origin,(mwi3@direction).normalized(),distance=maxd)
    return (mw@loc,(mw3@nor).normalized()) if ok else (None,None)
extra=[]
# buttons
bb=bmesh.new()
for z in (2.305,2.262,2.219):
    loc,nor=cast(Vector((-0.6,0.0,z)),Vector((1,0,0)))
    if loc is None: print("no hit for button",z); continue
    mtx=Matrix.Translation(Lc(loc+nor*0.0012))
    # cylinder facing along the normal
    q=Vector((0,0,1)).rotation_difference(mwi3@nor).to_matrix().to_4x4()
    bmesh.ops.create_cone(bb,cap_ends=True,segments=12,radius1=0.0065,radius2=0.0065,depth=0.0036,matrix=mtx@q)
bg=bpy.data.meshes.new("buttons"); bb.to_mesh(bg); bb.free()
bobj=bpy.data.objects.new("buttons",bg); bpy.context.collection.objects.link(bobj)
bobj.parent=polo.parent; bobj.matrix_parent_inverse=polo.matrix_parent_inverse.copy(); bobj.matrix_world=mw.copy()
bg.materials.append(mats[idx["button"]]); extra.append(bobj)
# decals
def decal(name,png,center,n,up,w,h,flat_back=False):
    n=n.normalized(); y=(up-n*up.dot(n)).normalized(); x=y.cross(n)
    NX,NY=10,6
    bd=bmesh.new(); uvl=bd.loops.layers.uv.verify(); vs=[]
    for j in range(NY+1):
        row=[]
        for i in range(NX+1):
            u=i/NX-0.5; v=j/NY-0.5
            p=center+x*u*w+y*v*h
            loc,nor=cast(p+n*0.6,-n,1.2)
            q=(loc+nor*0.0016) if loc is not None else p
            row.append(bd.verts.new(Lc(q)))
        vs.append(row)
    for j in range(NY):
        for i in range(NX):
            f=bd.faces.new((vs[j][i],vs[j][i+1],vs[j+1][i+1],vs[j+1][i]))
            for l in f.loops:
                ii=vs[j].index(l.vert) if l.vert in vs[j] else (vs[j+1].index(l.vert))
                jj=j if l.vert in vs[j] else j+1
                l[uvl].uv=(ii/NX,jj/NY)
    dg=bpy.data.meshes.new(name); bd.to_mesh(dg); bd.free()
    for p_ in dg.polygons: p_.use_smooth=True
    dobj=bpy.data.objects.new(name,dg); bpy.context.collection.objects.link(dobj)
    dobj.parent=polo.parent; dobj.matrix_parent_inverse=polo.matrix_parent_inverse.copy(); dobj.matrix_world=mw.copy()
    dg.materials.append(mat("decal_"+name,(1,1,1),0.7,tex=f"{TEX}/{png}.png")); extra.append(dobj)
UP=Vector((0,0,1)); FRONT=Vector((-1,0,0)); BACK=Vector((1,0,0))
lsh=bone("Bip01 L UpperArm"); lel=bone("Bip01 L Forearm"); la=(lel-lsh).normalized()
sp=lsh+(lel-lsh)*0.28; sn=Vector((0,-0.92,0.38))
if VARIANT in("reboot","sof"):
    decal("sof","sof",Vector((0.0,-0.092,2.225)),FRONT,UP,0.088,0.040)
if VARIANT=="reboot":
    decal("lb","lb",sp,sn,-la,0.058,0.058)
    decal("univ","tiu_univ",Vector((0.0,0.0,2.272)),BACK,UP,0.118,0.078)
    decal("reboot","reboot",Vector((0.0,0.0,2.108)),BACK,UP,0.17,0.113)
if VARIANT=="sof":
    decal("ima","ima",sp,sn,-la,0.075,0.041)
if VARIANT=="tiu":
    decal("t","t",Vector((0.0,-0.092,2.225)),FRONT,UP,0.046,0.046)
# ---- weights from the body, nearest vertex ----
kd=KDTree(len(me.vertices))
for i,v in enumerate(me.vertices): kd.insert(v.co,i)
kd.balance()
for o in [polo]+[bobj]+[e for e in extra if e is not bobj]:
    for vg in body.vertex_groups:
        if vg.name not in o.vertex_groups: o.vertex_groups.new(name=vg.name)
    for v in o.data.vertices:
        _,i,_=kd.find(v.co)
        for ge in me.vertices[i].groups: o.vertex_groups[ge.group].add([v.index],ge.weight,'REPLACE')
    mod=o.modifiers.new("Armature","ARMATURE"); mod.object=arm
parts=[polo]+extra
os.makedirs(OUTDIR,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUTDIR}/{VARIANT}.blend")
for o in bpy.data.objects: o.select_set(False)
for o in parts+[arm]: o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=f"{OUTDIR}/polo_{VARIANT}.glb",export_format="GLB",use_selection=True,export_animations=False,export_skins=True,export_yup=True)
print("DONE",VARIANT,os.path.getsize(f"{OUTDIR}/polo_{VARIANT}.glb"))
