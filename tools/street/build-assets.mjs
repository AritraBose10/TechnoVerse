import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const sourcePath = path.join(root, "data/world/street-furniture.json");
const runtimePath = path.join(root, "public/models/street/street-furniture.json");
const atlasPath = path.join(root, "public/models/street/sign-atlas.webp");
const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
fs.copyFileSync(sourcePath, runtimePath);

const systemBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
  path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, ...(systemBrowser ? { executablePath: systemBrowser } : {}) });
try {
  const page = await browser.newPage();
  const url = await page.evaluate(({ width, height, items }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, width, height);
    for (const item of items.filter((item) => item.atlasRect)) {
      const [x, y, w, h] = item.atlasRect;
      const sign = item.sign;
      g.fillStyle = sign.background; g.fillRect(x, y, w, h);
      if (sign.trim) { g.fillStyle = sign.trim; g.fillRect(x, y + h - 10, w, 10); }
      g.font = sign.font;
      g.fillStyle = sign.foreground;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(item.name, x + w / 2, y + h / 2, w - 30);
    }
    return canvas.toDataURL("image/webp", 0.92);
  }, { width: data.atlas.width, height: data.atlas.height, items: data.items });
  fs.writeFileSync(atlasPath, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
} finally {
  await browser.close();
}
console.log(`street assets: ${path.relative(root, atlasPath)} and runtime data mirror`);
