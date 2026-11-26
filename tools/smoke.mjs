// Visual smoke test. Boots the world in a real browser, enters campus, snaps fixed views and
// records render numbers, so a change that breaks the look or the frame budget shows up without
// anyone walking around.  Usage: npm run smoke  [-- http://localhost:3000]  (starts server.js if no URL)
// Output: tools/smoke-out/latest/*.png + report.json. Claude reads report.json (tiny) and only opens
// a PNG when a number or an error looks wrong: that keeps a run at ~1-2k tokens instead of ~5k.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "tools/smoke-out/latest";
const TIMES = ["12:00", "19:30", "23:00"]; // midday, dusk, night: the three lighting rigs
// Budget at spawn. shortcut: one fixed spot, add Sector V peak once its coordinates are settled.
const BUDGET = { calls: 750, triangles: 1_500_000 }; // first run 2026-11-26: 581 calls, 1.2M tris

mkdirSync(OUT, { recursive: true });
let url = process.argv.find((a) => a.startsWith("http"));
let server;
if (!url) {
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "3990" } });
  url = await new Promise((ok, fail) => {
    server.stdout.on("data", (d) => { const m = String(d).match(/http:\/\/localhost:\d+/); if (m) ok(m[0]); });
    server.on("exit", () => fail(new Error("server.js exited before listening")));
  });
}

const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text().slice(0, 300)));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url().replace(url, "")}`));

const report = { url, at: new Date().toISOString(), errors, shots: [], ok: false };
try {
  await page.goto(url, { waitUntil: "load" });
  await page.fill("#name", "Smoke");
  await page.waitForSelector("#enterBtn:not([disabled])", { timeout: 240_000 }); // assets loaded
  await page.click("#enterBtn");
  await page.waitForFunction(() => !document.body.classList.contains("entering") && window.__tiu?.renderInfo().calls > 0, null, { timeout: 240_000 });
  await page.waitForTimeout(5000); // let textures and shadows settle
  for (const t of TIMES) {
    await page.evaluate((t) => window.__tiu.time(t), t);
    await page.waitForTimeout(1500);
    const file = `${OUT}/spawn-${t.replace(":", "")}.png`;
    await page.screenshot({ path: file });
    report.shots.push({ time: t, file });
  }
  // renderInfo() only sees the last post-processing pass, so measure the plain scene with __tiu.cost().
  // ms is only meaningful on a real GPU; headless software WebGL is 10-50x slower.
  report.render = await page.evaluate(() => { window.__tiu.time("12:00"); const c = window.__tiu.cost(); return { ...c.base, top: c.topSceneChildren.slice(0, 5).map((r) => [r.child, r.trisSaved]) }; });
  // the two test pages set window.__done once everything has rendered
  for (const t of ["rides", "bodies"]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p.on("pageerror", (e) => errors.push(`${t}: ${String(e.message).slice(0, 300)}`));
    await p.goto(`${url}/${t}.html`);
    await p.waitForFunction(() => window.__done, null, { timeout: 240_000 });
    await p.screenshot({ path: `${OUT}/${t}.png` });
    await p.close();
  }
  await page.evaluate(() => window.__tiu.simulate(20)); // 20 s of street life must not throw
  report.street = await page.evaluate(() => window.__tiu.crowdStats());
  const got = { calls: report.render.calls, triangles: report.render.tris };
  report.overBudget = Object.keys(BUDGET).filter((k) => got[k] > BUDGET[k]);
  // Headless software WebGL (SwiftShader, llvmpipe) fails program validation on shaders a real GPU accepts.
  // shortcut: matched by message; drop this once the run moves to a GPU machine.
  report.gpu = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const x = gl.getExtension("WEBGL_debug_renderer_info"); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : "?"; });
  if (/SwiftShader|llvmpipe/i.test(report.gpu)) {
    report.softwareOnly = errors.filter((e) => e.includes("VALIDATE_STATUS false")).length;
    errors.splice(0, errors.length, ...errors.filter((e) => !e.includes("VALIDATE_STATUS false")));
  }
  report.ok = errors.length === 0 && report.overBudget.length === 0;
} catch (e) {
  report.failure = String(e.message).slice(0, 500);
  await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, gpu: report.gpu, softwareOnly: report.softwareOnly, errors: errors.length, overBudget: report.overBudget, failure: report.failure, render: report.render && { calls: report.render.calls, tris: report.render.tris, ms: report.render.ms }, firstErrors: errors.slice(0, 3) }));
await browser.close();
server?.kill();
process.exit(report.ok ? 0 : 1);
