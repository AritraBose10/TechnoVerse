#!/bin/bash
# Re-run the whole vehicle conversion. U = folder holding the car folders (the user's Desktop\vehicles).
U=${1:-/mnt/user-data/uploads/Desktop/vehicles}; O=${2:-public/models/vehicles}; C="node ${CONVERTER:-tools/vehicles/fbx2car.mjs}"
car(){ echo "== $2"; $C "$U/$1" "$O/$2.glb" "${@:3}" | tail -1 | cut -c1-240; }
car "2022-maruti-suzuki-swift-dzire/source/dzire/dzire/dzire.fbx" dzire --lod0 13000 --drop '^(dashboard|seats.*|speedometer.*|movsteer.*|radio_glass|screen_glass|sidewall|mb07|mb01|mb0111|foglight_f|chassis)$'
car "nissan-micra/source/micra/micra/micra.fbx" micra --lod0 12000
car "2018-ford-everestendeavour/source/everest/everest/everest.fbx" everest --lod0 14000
car "2013-wuling-hongguang-s/source/hongguan/hongguan/wulingvan.fbx" wuling --lod0 12000
car "2015-toyota-fortuner/source/fortuner/fortuner/fortuner.fbx" fortuner15 --lod0 12000
car "2016-maruti-suzuki-alto-k10/source/k10/k10/k10.fbx" altok10 --lod0 11000
car "2020-maruti-suzuki-alto-800/source/alto/alto/alto.fbx" alto800 --lod0 11000
car "2021-tata-safari/source/safari/safari/safari.fbx" safari --lod0 13000
car "maruti-800-ac/source/Maruti 800 AC/Maruti 800 AC/Maruti 800 AC.fbx" maruti800 --lod0 10000 --wheels '^rim_rf'
car "2022-maruti-suzuki-baleno/source/baleno22/baleno22/baleno22.fbx" baleno --lod0 12000
car "renault-triber/source/triber/triber/triber.fbx" triber --lod0 13000
car "2022-mahindra-scorpio-n/source/scorpio_n/scorpio_n/scorpio_n.fbx" scorpio_n --lod0 13000
car "auto-rickshaw.fbx" autorickshaw --lod0 12000 --lod1 3000 --generic --flip 1 --center bbox --drop '^Helper_Cube$' --wheels '^Cylinder(171|001|002)$' --paint '^(Material\.014|Material\.013|COVER)$'
car "indian-bus/source/indian gsrtc bus.fbx" bus --lod0 20000 --lod1 4000 --generic --flip 0 --center bbox --wheels '^G-__(555717|555636|555735|555762)$' --paint '^(poo|Doorrfok.*)$'
# not converted: SX4 (source has doors and tailgate modelled open), Figo (GLB source), Alto Works (OBJ, wheels fused in one mesh),
# Fortuner 2021 (310 anonymous meshes, 1.8M tris)
