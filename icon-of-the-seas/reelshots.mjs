/* Renders one frame from the middle of every reel scene, at 9:16, so the cut
   can be judged as a contact sheet.  node reelshots.mjs   -> dist/reel-NN-id.png */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 460, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('file://' + join(here, 'dist/icon-of-the-seas.html'));
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.IconApp.setProgress(1);
  window.IconApp.setToggle('reel', true);
  window.IconApp.setToggle('hideUI', true);
});
await page.waitForTimeout(600);

const count = await page.evaluate(() => window.IconReel.scenes.length);
const only = process.argv.slice(2).map(Number);
for (let i = 0; i < count; i++) {
  if (only.length && !only.includes(i + 1)) continue;
  const id = await page.evaluate((n) => {
    const app = window.IconApp;
    app.setMode('reel');
    app.reel.start(n);
    // run to the middle of the shot at a fixed step
    const dur = window.IconReel.scenes[n].dur;
    for (let k = 0; k < Math.floor(dur * 30); k++) app.stepReel(1 / 60);
    return window.IconReel.scenes[n].id;
  }, i);
  await page.waitForTimeout(1500);
  const name = 'reel-' + String(i + 1).padStart(2, '0') + '-' + id;
  await page.screenshot({ path: join(here, 'dist/' + name + '.png') });
  console.log(name + '.png');
}
if (errors.length) console.log('errors:', [...new Set(errors)].join(' | '));
await browser.close();
