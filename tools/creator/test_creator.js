const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('ERR ' + e.message));
  await page.goto('http://localhost:3100/creator/');
  try { await page.waitForFunction(() => window.__hb, null, { timeout: 60000 }); } catch (e) { console.log(logs.join('\n')); throw e; }
  const N = await page.evaluate(() => __hb.PRESETS.length);
  for (let i = 0; i < N; i++) {
    for (const [mode, t] of [['t', 0], ['walk', 0.45]]) {
      const r = await page.evaluate(([i, mode, t]) => { const a = __hb.preset(i); __hb.pose(mode, t); __hb.view(0.5, 0.05); return { ...a, ...__hb.stretch() }; }, [i, mode, t]);
      console.log(i, mode, JSON.stringify(r));
      await page.waitForTimeout(250);
      if (mode === 'walk' || i === 0) await page.screenshot({ path: `/home/claude/cc/shots/p${i}_${mode}.png` });
    }
  }
  console.log(logs.slice(0, 5).join('\n'));
  await browser.close();
})();
