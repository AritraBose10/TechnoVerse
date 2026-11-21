import bpy,sys,math
from mathutils import Vector
blend=sys.argv[sys.argv.index("--")+1]; tag=sys.argv[sys.argv.index("--")+2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc=bpy.context.scene; sc.render.engine="BLENDER_WORKBENCH"; sc.render.resolution_x=700; sc.render.resolution_y=800
sc.display.shading.light="STUDIO"; sc.display.shading.color_type="MATERIAL"; sc.display.shading.show_backface_culling=False
sc.world=bpy.data.worlds.new("w"); 
cam=bpy.data.objects.new("cam",bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam); sc.camera=cam
cam.data.lens=60
for body in bpy.data.objects:
    if body.type=="MESH" and body.name!="polo_base" and not body.name.startswith("polo"): body.color=(0.85,0.65,0.5,1)
for o in bpy.data.objects:
    if o.type=="MESH" and o.name.startswith("polo"): o.color=(0.1,0.15,0.5,1)
for m in bpy.data.materials:
    b=m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
    if b: 
        c=b.inputs["Base Color"].default_value; m.diffuse_color=(c[0]**0.4545,c[1]**0.4545,c[2]**0.4545,1) if not m.name.startswith("decal") else (1,1,1,1)
    if m.name in("body","skin_head"): m.diffuse_color=(0.85,0.65,0.5,1)
    if m.name.startswith("decal"):
        t=[n for n in m.node_tree.nodes if n.type=="TEX_IMAGE"]
        if t: m.diffuse_color=(0.9,0.1,0.1,1)
cam.data.type='ORTHO'; cam.data.ortho_scale=1.6
bpy.context.view_layer.update()
pts=[o.matrix_world@Vector(c) for o in bpy.data.objects if o.type=="MESH" and not o.name.startswith("polo") for c in o.bound_box]
zmin=min(p.z for p in pts); zmax=max(p.z for p in pts); print("BODY Z",zmin,zmax)
zc=(zmin+zmax)/2+0.1; cam.data.ortho_scale=(zmax-zmin)*0.95
target=Vector((0,0,zc))
for name,pos in [("front",(-3.2,0,zc)),("back",(3.2,0,zc)),("side",(0,-3.2,zc)),("q",(-2.2,-2.2,zc))]:
    cam.location=pos; d=target-cam.location; cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f"/home/claude/polo/{tag}_{name}.png"; bpy.ops.render.render(write_still=True)
