// Exercise the real entry point, including world meshes and deferred physics.
// Test-only inspection is injected into the served main.js; production has no new debug API.
import fs from "node:fs";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";

const OUT = "tools/landmarks/out";
fs.mkdirSync(OUT, { recursive: true });
const survey = JSON.parse(fs.readFileSync("tools/landmarks/survey.json", "utf8"));
const instrument = "\nwindow.__landmarkHarness = {scene, renderer, camera, worldInfo, world, RAPIER, THREE, campus, models: typeof landmarkModels === 'undefined' ? new Map() : landmarkModels};\n";
const executablePath = [process.env.SMOKE_CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find((p) => fs.existsSync(p));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "3995" }, windowsHide: true });
let browser;
const report = { at: new Date().toISOString(), runs: [] };
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timed out")), 15000);
    server.stdout.on("data", (d) => { const m = String(d).match(/http:\/\/localhost:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.on("error", reject); server.on("exit", (code) => reject(new Error(`Server exited: ${code}`)));
  });
  browser = await chromium.launch({ executablePath, args: ["--enable-unsafe-swiftshader"] });
  for (const mode of ["baseline", "replacements", "missing-model"]) {
    console.log(`Starting ${mode}`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Compare against the exact branch base, without changing files in the working tree.
    if (mode === "baseline") await page.route(/\/(main\.js|world\.js|landmarks\.js|models\/landmarks\/[^/?]+\.glb)(\?.*)?$/, async (route) => {
      const file = `public${new URL(route.request().url()).pathname}`;
      let body = execFileSync("git", ["show", `2551f68:${file}`], { maxBuffer: 10 * 1024 * 1024 });
      if (file === "public/main.js") body = Buffer.concat([body, Buffer.from(instrument)]);
      await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "model/gltf-binary" });
    });
    else await page.route("**/main.js*", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync("public/main.js", "utf8") + instrument }));
    if (mode === "missing-model") await page.route("**/models/landmarks/sv4.glb*", (r) => r.fulfill({ status: 404, body: "Intentional missing replacement" }));
    await page.goto(`${url}/?fp=1`, { timeout: 240000 });
    await page.fill("#name", `Landmarks ${mode}`);
    await page.waitForSelector("#enterBtn:not([disabled])", { timeout: 240000 });
    await page.click("#enterBtn");
    await page.waitForFunction(() => window.__landmarkHarness && window.__tiu?.me && !document.body.classList.contains("entering"), null, { timeout: 240000 });
    await page.evaluate(() => window.__tiu.time("12:00"));
    await page.waitForTimeout(1500);
    const result = await page.evaluate(({ mode, specs }) => {
      const { scene, renderer, camera, worldInfo, world, RAPIER, THREE, campus, models } = window.__landmarkHarness;
      renderer.render(scene, camera);
      const render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      const buildings = [];
      scene.updateMatrixWorld(true);
      if (mode !== "baseline") for (const spec of specs) {
        const b = campus.buildings.find((b) => String(b.id) === String(spec.id));
        const [x, z] = b.pts.reduce((s, p) => [s[0] + p[0] / b.pts.length, s[1] + p[1] / b.pts.length], [0, 0]);
        const entry = models.get(String(spec.id));
        const matches = scene.children.filter((o) => o.name.startsWith(`landmark ${spec.id}:`));
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 150, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(worldInfo.chunks.map((c) => c.mesh), false).filter((h) => h.point.y > 3);
        const belongs = (mesh) => { for (let p = mesh; p; p = p.parent) if (p === entry?.model) return true; return false; };
        const roof = hits.map((h) => ({ y: h.point.y, replacement: belongs(h.object) }));
        worldInfo.staticColliders.update(x, z, 0, 0);
        const area = b.pts.reduce((s, p, i) => s + p[0] * b.pts[(i + 1) % b.pts.length][1] - b.pts[(i + 1) % b.pts.length][0] * p[1], 0);
        const walls = b.pts.map((a, i) => {
          const end = b.pts[(i + 1) % b.pts.length], dx = end[0] - a[0], dz = end[1] - a[1], len = Math.hypot(dx, dz);
          if (len < 0.5) return true;
          const nx = dz / len * Math.sign(area), nz = -dx / len * Math.sign(area);
          const ray = new RAPIER.Ray({ x: (a[0] + end[0]) / 2 + nx, y: 5, z: (a[1] + end[1]) / 2 + nz }, { x: -nx, y: 0, z: -nz });
          return !!world.castRay(ray, 2, true);
        });
        buildings.push({ id: spec.id, copies: matches.length, loaded: !!entry, roof, walls, colliders: worldInfo.staticColliders.near(x, z, 50), placement: entry?.model.position.toArray() });
      }
      return { mode, render, boot: window.__boot, buildings, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown" };
    }, { mode, specs: survey.buildings });
    assert.equal(errors.length, 0, errors.join("\n"));
    if (mode !== "baseline") for (const b of result.buildings) {
      const missing = mode === "missing-model" && b.id === "sv4";
      assert.equal(b.copies, missing ? 0 : 1, `${b.id}: wrong number of replacements`);
      assert(b.roof.length, `${b.id}: missing building roof`);
      assert(b.roof.every((h) => h.replacement === !missing), `${b.id}: overlapping generated building`);
      assert(b.colliders.need > 0 && b.colliders.have === b.colliders.need, `${b.id}: inactive nearby colliders`);
      assert(b.walls.every(Boolean), `${b.id}: missing wall collision`);
    }
    await page.screenshot({ path: `${OUT}/world-${mode}.png` });
    if (mode === "replacements") {
      await page.evaluate(() => window.__tiu.simulate(20));
      result.street = await page.evaluate(() => window.__tiu.crowdStats());
      for (const time of ["19:30", "23:00"]) {
        await page.evaluate((t) => window.__tiu.time(t), time);
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/world-${time.replace(":", "")}.png` });
      }
    }
    result.pageErrors = errors; report.runs.push(result);
    fs.writeFileSync(`${OUT}/integration.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally { await browser?.close(); server.kill(); }
