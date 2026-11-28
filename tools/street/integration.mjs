import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 3318;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
const waitForServer = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("server start timeout")), 15000);
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes("http://localhost:")) { clearTimeout(timer); resolve(); }
  });
  server.once("exit", (code) => reject(new Error(`server exited ${code}`)));
});

const systemBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
  path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, ...(systemBrowser ? { executablePath: systemBrowser } : {}) });
try {
  await waitForServer;
  async function sample(query) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => message.type() === "error" && !message.text().startsWith("Failed to load resource") && errors.push(message.text()));
    await page.goto(`http://127.0.0.1:${port}/?q=low&fp=1${query}`, { waitUntil: "load", timeout: 60000 });
    await page.fill("#name", "Street test");
    await page.waitForSelector("#enterBtn:not([disabled])", { timeout: 240000 });
    await page.click("#enterBtn");
    await page.waitForFunction(() => !document.body.classList.contains("entering") && window.__tiu?.renderInfo().calls > 0, null, { timeout: 240000 });
    await page.evaluate(() => { window.__tiu.cam(225, 8, -17, 255, 2, -44); window.__tiu.simulate(20); });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(() => ({ boot: window.__boot, render: window.__tiu.cost().base, street: window.__tiu.street }));
    await page.close();
    return { ...result, errors };
  }

  const off = await sample("&street=0");
  const on = await sample("");
  assert.equal(off.errors.length, 0, `street=0 page errors: ${off.errors.join(" | ")}`);
  assert.equal(on.errors.length, 0, `street on page errors: ${on.errors.join(" | ")}`);
  assert.equal(off.street.rendered, 0, "street=0 rendered items");
  assert.equal(on.street.rendered, 11, "street layer did not render the complete surveyed batch");
  assert(on.render.calls <= off.render.calls * 1.05 + 1, `draw calls +${(((on.render.calls / off.render.calls) - 1) * 100).toFixed(1)}%`);
  assert(on.render.tris <= off.render.tris * 1.05 + 100, `triangles +${(((on.render.tris / off.render.tris) - 1) * 100).toFixed(1)}%`);
  assert(on.boot.buildWorldMs <= off.boot.buildWorldMs + 300, `world build +${on.boot.buildWorldMs - off.boot.buildWorldMs} ms`);
  console.log(JSON.stringify({ off: { buildWorldMs: off.boot.buildWorldMs, ...off.render, fp: off.boot.fp }, on: { buildWorldMs: on.boot.buildWorldMs, ...on.render, fp: on.boot.fp } }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
