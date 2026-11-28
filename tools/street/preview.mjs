import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const out = path.resolve("tools/street/out");
fs.mkdirSync(out, { recursive: true });
const port = 3319;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("server start timeout")), 15000);
  server.stdout.on("data", (chunk) => { if (String(chunk).includes("http://localhost:")) { clearTimeout(timer); resolve(); } });
});
const views = [
  ["burger-king", [236.5, 5, -25, 236.7, 2, -40.3]],
  ["nizams-express", [244.2, 5, -22, 244.2, 2, -36.5]],
  ["dominos", [278, 5, -35, 278, 2, -52.9]],
  ["tea-junction", [-10.84, 6, -12.71, -21.69, 2, -17.84]],
  ["ecocentre-name", [-24.57, 7, -105.3, -30.02, 5, -94.6]],
  ["millennium-city-name", [285, 16, -45, 291, 6.5, -87]],
  ["sector-v-metro-name", [-10, 12, -548, 14, 8.5, -519]],
  ["street13-south-stalls", [250, 7, -20, 251, 1.6, 7]],
  ["metro-approach-stalls", [37, 6, -425, 48, 1.5, -434]],
  ["metro-approach-railing", [52, 5, -405, 62, 1, -414]],
];
const systemBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
  path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, ...(systemBrowser ? { executablePath: systemBrowser } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/?q=high`, { waitUntil: "load", timeout: 60000 });
  await page.fill("#name", "Street preview");
  await page.waitForSelector("#enterBtn:not([disabled])", { timeout: 240000 });
  await page.click("#enterBtn");
  await page.waitForFunction(() => !document.body.classList.contains("entering") && window.__tiu?.renderInfo().calls > 0, null, { timeout: 240000 });
  for (const [name, camera] of views) {
    await page.evaluate((v) => window.__tiu.cam(...v), camera);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
  const survey = JSON.parse(fs.readFileSync("data/world/street-survey.json", "utf8"));
  const links = new Map(survey.captures.flatMap((capture) => capture.items.map((id) => [id, capture.url])));
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>T-008 street fronts</title><style>body{font:16px system-ui;background:#182027;color:#eee;margin:30px}figure{max-width:900px;margin:0 0 40px}img{width:100%;border:1px solid #556}a{color:#8dc8ff}</style><h1>T-008 Phase 1</h1>${views.map(([name]) => `<figure><h2>${name}</h2><img src="${name}.png"><p><a href="${links.get(name)}">Google Maps reference</a></p></figure>`).join("")}`);
  console.log(`street preview: ${out}`);
} finally {
  await browser.close();
  server.kill();
}
