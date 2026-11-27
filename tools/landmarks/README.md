# tools/landmarks — GLB Landmark Builder

Procedural Node.js scripts that generate binary GLB models for TechnoVerse landmarks.
The original 11 task landmarks are supported. Four nearby façades have a reproducible January
2026 Street View survey; the others remain legacy assets and are not claimed as surveyed.

## Requirements
Node.js ≥ 18. Uses vendored Three.js math and vanilla Buffer packing. No npm packages.

## Scripts

```powershell
# Generate all 10 remaining landmark models:
node tools/landmarks/build-all-landmarks.mjs

# Generate the Sector V Metro Station:
node tools/landmarks/build-station.mjs

# Rebuild the four inspected frontage models and validate their GLBs:
node tools/landmarks/build-surveyed.mjs
node tools/landmarks/validate-surveyed.mjs
node tools/landmarks/inventory.mjs

# Render the comparison sheet and exercise the real world/fallback integration:
node tools/landmarks/preview.mjs
node tools/landmarks/integration.mjs
```

## Generated Landmarks List

| No | Building Name | ID | GLB File | Tris | Size |
|----|---------------|----|----------|------|------|
| 1 | Salt Lake Sector V Metro Station | `535333512` | `535333512.glb` | 9,552 | 1,012 KB |
| 2 | Wipro Tower 5 | `193308962` | `193308962.glb` | 3,352 | 359 KB |
| 3 | PWC Office | `134101085` | `134101085.glb` | 865 | 97 KB |
| 4 | Sector - V Police Station | `ov332` | `ov332.glb` | 182 | 23 KB |
| 5 | Aliah University | `ov582` | `ov582.glb` | 184 | 23 KB |
| 6 | NITTTR Residential Campus | `382403604` | `382403604.glb` | 290 | 34 KB |
| 7 | IIHM Global Campus | `sv4` | `sv4.glb` | 390 | 45 KB |
| 8 | Bharat Petroleum | `ov240` | `ov240.glb` | 372 | 43 KB |
| 9 | HP Petrol Pump | `238285653` | `238285653.glb` | 208 | 25 KB |
| 10 | Ambuja Neotia EcoCentre | `ov359` | `ov359.glb` | 1,945 | 210 KB |
| 11 | Tea Junction | `ov325` | `ov325.glb` | 126 | 17 KB |
| 12 | Hotel Monotel | `193478726` | `193478726.glb` | 646 | 74 KB |

All models are within the T-007 budget (≤ 30,000 triangles, ≤ 2,048 KB). The output directory is
ignored because it contains generated reports and screenshots.
