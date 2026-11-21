const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const logs = []; p.on('console', m => { if (m.type() == 'error') logs.push(m.text()) }); p.on('pageerror', e => logs.push('ERR ' + e.stack));
  await p.goto('http://localhost:3100/creator/'); await p.waitForFunction(() => window.__hb, null, { timeout: 60000 });
  let k = 0;
  for (const pre of [0, 1, 2, 5]) {
    await p.evaluate(async (pre) => { __hb.preset(pre); await __hb.hb.wear('top', '/creator/clothes/test_tee/test_tee.mhclo', { color: 0x2d4a7a }); await __hb.hb.wear('bottom', '/creator/clothes/test_jeans/test_jeans.mhclo', { color: 0x1f2f4f }); __hb.pose('t', 0); __hb.view(0.5, 0.05); __hb.zoom(2.6, __hb.hb.height * 0.5); }, pre);
    await p.waitForTimeout(400); await p.screenshot({ path: `/home/claude/cc/shots/c${k++}.png`, clip: { x: 284, y: 0, width: 616, height: 700 } });
  }
  console.log(logs.slice(0, 4).join('\n')); await b.close();
})();
