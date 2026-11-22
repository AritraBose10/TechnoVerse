# T-007 Landmark References

All entries accessed: 2026-11-22.

---

## 535333512 — Salt Lake Sector V Metro Station
**Green Line (East-West Metro Corridor), Kolkata Metro, India**

| Item | Detail |
|------|--------|
| OSM way | https://www.openstreetmap.org/way/535333512 |
| OSM tags | `building=train_station`, `floors=4`, `style=ochre`, `roof=#8d8a84` |
| Footprint pts (world m) | [[-3.17,-508.44],[115.08,-581.79],[122.53,-569.96],[4.26,-496.63]] |
| Dimensions from footprint | L ≈ 139.15 m, W ≈ 13.95 m |
| Modelled height | 18.5 m (4 floors × 4.5 m avg + arched roof) |
| Max footprint deviation | 0.053 m (≤ 0.5 m requirement ✓) |
| Architecture type | Elevated rapid-transit station (3 levels: ground entry, concourse, platform) |
| Roof form | Barrel-vaulted aluminium canopy (Green Line standard design) |
| Façade material | Ochre composite cladding with ribbon glazing |
| Sides not visible in references | Interior platform details — kept minimal per budget |

### Reference Sources
- OpenStreetMap way 535333512 (CC BY-SA 2.0 / ODbL) — footprint polygon, floors, tags
- Wikipedia: "Sector V metro station" (en.wikipedia.org) — station description, platform layout, line info
- Mapillary street-level imagery, Salt Lake Sector V area (CC BY-SA 4.0) — façade appearance,
  pier spacing, canopy profile
- Google Maps satellite view (reference only, no assets copied) — footprint orientation check

### Modelling Notes
- No external texture images used. All materials are procedural PBR (baseColorFactor, metallic, roughness).
- Company logos and trademarks omitted per AGENTS.md. Signage plates are blank geometry.
- Barrel arch approximated by 14 flat box segments (standard polygonal arc for real-time mesh).
- Portal column diameter: 0.5 m (12-sided prism ≈ circular section at game LOD).
