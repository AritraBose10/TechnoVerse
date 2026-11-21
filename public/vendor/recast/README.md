Rebuild: npm i @recast-navigation/core@0.44.0 @recast-navigation/generators@0.44.0 @recast-navigation/wasm@0.44.0 esbuild
entry.js: export * from "@recast-navigation/core"; export { generateTileCache, generateSoloNavMesh } from "@recast-navigation/generators";
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none --outfile=recast.js
