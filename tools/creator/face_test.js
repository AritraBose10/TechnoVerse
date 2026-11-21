const { chromium } = require('playwright');
(async () => {
  const logs=[];const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
  page.on('pageerror',e=>logs.push(e.stack));page.on('console',m=>{if(m.type()=='error')logs.push(m.text())});await page.goto('http://localhost:3100/creator/');
  await page.waitForFunction(() => window.__hb, null, { timeout: 60000 });
  const cases = { a: { gender: 0.85, skin: 0.45 }, b: { gender: 0.1, skin: 0.55, eye: 'darkbrown', sliders: { eyeSize: 0.4, cheekbones: 0.6, lowerLip: 0.5 } }, c: { gender: 0.9, skin: 0.25, eye: 'hazel', sliders: { jawWidth: 0.6, noseWidth: 0.4 } } };
  for (const [k, c] of Object.entries(cases)) {
    await page.evaluate((c) => { __hb.pose('t', 0); __hb.config(c); __hb.view(0.15, 0.02); }, c);
    await page.waitForTimeout(600);
    const h = await page.evaluate(() => __hb.hb.height);
    await page.evaluate((h) => { __hb.zoom(0.6, h - 0.1); }, h);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/home/claude/cc/shots/face_${k}.png`, clip: { x: 290, y: 80, width: 400, height: 520 } });
  }
  console.log(logs.slice(0,4).join('\n'));await browser.close();
})();
