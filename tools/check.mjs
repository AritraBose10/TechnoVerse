// Syntax check of every source file, so a broken file fails here, not in someone's browser.
// public/ files are ES modules (import, top-level await), so they go through stdin as modules.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = ["server.js", ...readdirSync("public").filter((f) => f.endsWith(".js")).map((f) => `public/${f}`),
  ...readdirSync("tools").filter((f) => f.endsWith(".mjs")).map((f) => `tools/${f}`)];
let bad = 0;
for (const f of files) {
  const module = !f.endsWith("server.js");
  const r = spawnSync(process.execPath, module ? ["--check", "--input-type=module"] : ["--check", f], { input: module ? readFileSync(f) : undefined });
  if (r.status !== 0) { bad++; console.error(`FAIL ${f}\n${String(r.stderr).split("\n").slice(0, 6).join("\n")}`); }
}
console.log(`${files.length - bad}/${files.length} files OK`);
process.exit(bad ? 1 : 0);
