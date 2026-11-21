const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const logs = []; p.on('console', m => { if (m.type() == 'error') logs.push(m.text()) }); p.on('pageerror', e => logs.push('ERR ' + e.stack));
  await p.goto('http://localhost:3100/creator/'); await p.waitForFunction(() => window.__hb, null, { timeout: 60000 });
  const cases = process.argv[2] ? JSON.parse(process.argv[2]) : [['short', 0x1c1410, 0.5, 0], ['medium', 0x4a2f1b, 0.0, 0], ['long', 0x0e0a08, 2.6, 0], ['long', 0xb58a4a, 0.0, 1]];
  let k = 0;
  for (const [st, col, yaw, pre] of cases) {
    await p.evaluate(([st, col, yaw, pre]) => { __hb.preset(pre); __hb.hb.setHair(st, col); __hb.view(yaw, 0.05); __hb.zoom(0.85, __hb.hb.height - 0.14); }, [st, col, yaw, pre]);
    await p.waitForTimeout(500); await p.screenshot({ path: `/home/claude/cc/shots/h${k++}.png`, clip: { x: 284, y: 0, width: 616, height: 700 } });
  }
  console.log(await p.evaluate(() => __hb.hb.cards.count)); console.log(logs.slice(0, 4).join('\n')); await b.close();
})();
