// Renders three views and checks failed-load fallback without modifying the public test page.
import fs from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const paths = [process.env.SMOKE_CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const executablePath = paths.find((p) => fs.existsSync(p));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "3994" }, windowsHide: true });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview server did not start")), 15000);
    server.stdout.on("data", (d) => { const m = String(d).match(/http:\/\/localhost:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.on("error", reject); server.on("exit", (code) => reject(new Error(`Preview server exited: ${code}`)));
  });
  browser = await chromium.launch({ executablePath, args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__landmark-preview.html", (r) => r.fulfill({ contentType: "text/html", body: fs.readFileSync("tools/landmarks/preview.html", "utf8") }));
  await page.route("**/__survey.json", (r) => r.fulfill({ contentType: "application/json", body: fs.readFileSync("tools/landmarks/survey.json", "utf8") }));
  await page.goto(`${url}/__landmark-preview.html`);
  await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
  const normal = await page.evaluate(() => window.__report);
  const survey = JSON.parse(fs.readFileSync("tools/landmarks/survey.json", "utf8"));
  const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
  assert.deepEqual(normal.ids.map(String).sort(), survey.buildings.map((s) => String(s.id)).sort());
  for (const model of normal.models) {
    const b = campus.buildings.find((b) => String(b.id) === String(model.id));
    const centre = b.pts.reduce((s, p) => [s[0] + p[0] / b.pts.length, s[1] + p[1] / b.pts.length], [0, 0]);
    assert(Math.hypot(model.position[0] - centre[0], model.position[2] - centre[1]) < 0.001);
  }
  fs.mkdirSync("tools/landmarks/out", { recursive: true });
  await page.screenshot({ path: "tools/landmarks/out/frontage-studies.png", fullPage: true });
  const viewer = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  const viewerErrors = [];
  viewer.on("pageerror", (e) => viewerErrors.push(e.message));
  viewer.on("response", (r) => { if (r.status() >= 400) viewerErrors.push(`${r.status()} ${r.url()}`); });
  await viewer.goto(`${url}/landmarks.html`);
  await viewer.waitForTimeout(15000);
  const viewerReport = await viewer.evaluate(() => ({ done: window.__done === true, info: document.querySelector("#info")?.textContent }));
  assert(viewerReport.done, `${viewerReport.info}; ${viewerErrors.join("; ")}`);
  assert.equal(viewerErrors.length, 0, viewerErrors.join("\n"));
  await viewer.screenshot({ path: "tools/landmarks/out/public-viewer.png" });
  await viewer.close();
  await page.route("**/models/landmarks/sv4.glb*", (r) => r.fulfill({ status: 404, body: "Intentional missing-model test" }));
  await page.reload(); await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
  const fallback = await page.evaluate(() => window.__report);
  assert(!fallback.ids.map(String).includes("sv4"));
  assert.equal(fallback.ids.length, normal.ids.length - 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  const report = { normal, missingModel: { requested: "sv4", replacementIds: fallback.ids, generatedFallbackRequired: true }, pageErrors: errors };
  fs.writeFileSync("tools/landmarks/out/browser-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ models: normal.ids.length, exactPlacement: true, publicViewer: true, missingModelOmitted: true, pageErrors: errors.length, sheet: "tools/landmarks/out/frontage-studies.png" }));
} finally { await browser?.close(); server.kill(); }
