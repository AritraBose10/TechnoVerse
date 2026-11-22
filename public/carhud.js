const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

export function createCarHud() {
  if (typeof document === "undefined" || !document.body) return { show() {}, update() {} };
  const style = document.createElement("style");
  style.textContent = `
    .carhud-card{position:fixed;right:18px;bottom:18px;z-index:30;width:286px;padding:13px;color:#fff;background:rgba(20,24,32,.82);border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.32);font:12px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;backdrop-filter:blur(10px)}
    .carhud-card[hidden]{display:none}.carhud-top{display:flex;align-items:center;gap:8px}.carhud-gauge{width:105px;height:64px}.carhud-readout{font-size:29px;font-weight:700;letter-spacing:-1px}.carhud-unit{color:#aeb8c8;font-size:10px;letter-spacing:1px}.carhud-rpm{margin-left:auto;text-align:right;font-size:17px;font-weight:650}.carhud-rpm small{display:block;color:#aeb8c8;font-size:10px;font-weight:500}
    .carhud-gearline{display:flex;align-items:center;gap:4px;margin:9px 0 7px}.carhud-gear{min-width:20px;padding:3px 2px;border-radius:5px;text-align:center;color:#9da8b9;background:rgba(255,255,255,.07)}.carhud-gear.carhud-current{color:#10151e;background:#eaf2ff;font-weight:800}.carhud-tag{padding:3px 6px;border:1px solid rgba(255,255,255,.2);border-radius:999px;color:#cbd8eb;font-size:10px}.carhud-tag[hidden]{display:none}
    .carhud-status{min-height:16px;color:#d9e3f1}.carhud-icons{display:flex;align-items:center;gap:9px;margin-top:8px;color:#748094}.carhud-icon{font-size:16px;opacity:.35}.carhud-icon.carhud-on{color:#ffbf45;opacity:1}.carhud-icon.carhud-warn{color:#ff6666;opacity:1}.carhud-clutch{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:10px}.carhud-bar{width:44px;height:6px;border-radius:8px;background:#46505d;overflow:hidden}.carhud-fill{height:100%;background:#91d8ff}.carhud-meta{display:flex;justify-content:space-between;gap:8px;margin-top:8px;color:#aeb8c8}.carhud-hint{margin-top:6px;min-height:15px;color:#e5edf8}.carhud-helpbtn{margin-left:auto;width:21px;height:21px;border:1px solid #8290a5;border-radius:50%;padding:0;color:#fff;background:transparent;font:700 12px system-ui;cursor:pointer}.carhud-help{margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14);color:#d7e0ed}.carhud-help[hidden]{display:none}.carhud-help table{width:100%;border-collapse:collapse}.carhud-help td{padding:2px 0;vertical-align:top}.carhud-help td:first-child{width:74px;color:#9bcfff;font-weight:650}
  `;
  const root = document.createElement("section");
  root.className = "carhud-card";
  root.hidden = true;
  root.innerHTML = `<div class="carhud-top"><canvas class="carhud-gauge" width="210" height="128"></canvas><div><div class="carhud-readout">0</div><div class="carhud-unit">KM/H</div></div><div class="carhud-rpm">0<small>RPM ×1000</small></div></div><div class="carhud-gearline"><span class="carhud-gears"></span><span class="carhud-tag carhud-mode">MT</span><span class="carhud-tag carhud-autoclutch">AUTO-CLUTCH</span></div><div class="carhud-status"></div><div class="carhud-icons"><span class="carhud-icon carhud-left">◀</span><span class="carhud-icon carhud-hazard">◆</span><span class="carhud-icon carhud-right">▶</span><span class="carhud-icon carhud-lights">◉</span><span class="carhud-icon carhud-brake">Ⓟ!</span><span class="carhud-clutch">CL <span class="carhud-bar"><span class="carhud-fill"></span></span></span></div><div class="carhud-meta"><span class="carhud-camera">Chase</span><button class="carhud-helpbtn" type="button" aria-label="Driving controls">?</button></div><div class="carhud-hint"></div><div class="carhud-help" hidden><table><tr><td>E</td><td>Enter / exit car</td></tr><tr><td>I</td><td>Start / stop engine</td></tr><tr><td>W / S</td><td>Throttle / brake</td></tr><tr><td>A / D</td><td>Steer</td></tr><tr><td>Space</td><td>Handbrake</td></tr><tr><td>R / F</td><td>Gear up / down</td></tr><tr><td>Shift / K</td><td>Clutch / auto-clutch</td></tr><tr><td>M</td><td>Manual / automatic</td></tr><tr><td>Z / X / B</td><td>Indicators / hazards</td></tr><tr><td>L / H / C</td><td>Lights / horn / camera</td></tr></table></div>`;
  document.head.append(style); document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const gauge = $(".carhud-gauge"), g = gauge.getContext("2d");
  const refs = { speed: $(".carhud-readout"), rpm: $(".carhud-rpm"), gears: $(".carhud-gears"), mode: $(".carhud-mode"), ac: $(".carhud-autoclutch"), status: $(".carhud-status"), left: $(".carhud-left"), right: $(".carhud-right"), hazard: $(".carhud-hazard"), lights: $(".carhud-lights"), brake: $(".carhud-brake"), clutch: $(".carhud-clutch"), fill: $(".carhud-fill"), camera: $(".carhud-camera"), hint: $(".carhud-hint") };
  $(".carhud-helpbtn").addEventListener("click", () => { const help = $(".carhud-help"); help.hidden = !help.hidden; });
  let lastDraw = 0;
  function draw(s) {
    if (!g) return; const now = performance.now(); if (now - lastDraw < 33) return; lastDraw = now;
    const dpr = 2, w = gauge.width, h = gauge.height, cx = w / 2, cy = h * .92;
    const arc = (value, max, color, width = 8) => { const a0 = Math.PI * 1.12, a1 = Math.PI * 1.88, end = a0 + (a1 - a0) * clamp(value / max, 0, 1); g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.arc(cx, cy, 72, a0, end); g.stroke(); };
    g.clearRect(0, 0, w, h); g.lineCap = "round"; g.strokeStyle = "rgba(255,255,255,.13)"; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, 72, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    arc(s.kmh, 180, "#83ceff"); const red = clamp(s.redline, 0, 8000) / 8000, a0 = Math.PI * 1.12, a1 = Math.PI * 1.88; g.strokeStyle = "#ff5c62"; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, 57, a0 + (a1 - a0) * red, a1); g.stroke(); arc(s.rpm, 8000, "#f3f6fb", 5);
  }
  function update(input = {}) {
    const s = { kmh: 0, rpm: 0, redline: 6200, gear: "N", mode: "manual", autoClutch: false, engine: "off", blinkOn: false, indL: false, indR: false, hazard: false, lights: 0, handbrake: false, clutch: 0, cam: "chase", hint: "", ...input };
    refs.speed.textContent = Math.round(clamp(s.kmh, 0, 999)); refs.rpm.firstChild.nodeValue = (clamp(s.rpm, 0, 9999) / 1000).toFixed(1);
    const names = s.mode === "auto" ? ["P", "R", "N", "D"] : ["R", "N", "1", "2", "3", "4", "5"];
    refs.gears.replaceChildren(...names.map((name) => { const el = document.createElement("span"); el.className = "carhud-gear" + (String(s.gear) === name ? " carhud-current" : ""); el.textContent = name; return el; }));
    refs.mode.textContent = s.mode === "auto" ? "AT" : "MT"; refs.ac.hidden = s.mode === "auto" || !s.autoClutch;
    refs.status.textContent = s.engine === "cranking" ? "Cranking…" : s.engine === "stalled" ? "Stalled — hold I to restart" : s.engine === "running" ? "Engine running" : "Engine off — hold I to start";
    const flash = Boolean(s.blinkOn); refs.left.classList.toggle("carhud-on", flash && Boolean(s.indL || s.hazard)); refs.right.classList.toggle("carhud-on", flash && Boolean(s.indR || s.hazard)); refs.hazard.classList.toggle("carhud-on", Boolean(s.hazard)); refs.lights.classList.toggle("carhud-on", Number(s.lights) > 0); refs.lights.textContent = Number(s.lights) === 2 ? "☼" : Number(s.lights) === 1 ? "◉" : "○"; refs.brake.classList.toggle("carhud-warn", Boolean(s.handbrake));
    refs.clutch.hidden = s.mode !== "manual"; refs.fill.style.width = `${clamp(s.clutch, 0, 1) * 100}%`; refs.camera.textContent = ({ chase: "Chase", bonnet: "Bonnet", cockpit: "Cockpit" })[s.cam] || "Chase"; refs.hint.textContent = s.hint || ""; draw(s);
  }
  return { show(on) { root.hidden = !on; }, update };
}
