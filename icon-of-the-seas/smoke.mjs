/* Headless smoke test: loads the standalone build, drives the console, and
   fails on any console error, page error, or missing UI state.
   node smoke.mjs [--shots] */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv.includes('--shots');
const errors = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
// Software rasterisation is the constraint here, so the viewport stays modest;
// shots are taken at this size too.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('file://' + join(here, 'dist/icon-of-the-seas.html'));
await page.waitForTimeout(2500);

const shot = async (name) => { if (shots) await page.screenshot({ path: join(here, 'dist/shot-' + name + '.png') }); };

async function readout() {
  return page.evaluate(() => ({
    verb: document.querySelector('#stage-verb').textContent,
    name: document.querySelector('#stage-name').textContent,
    pct: document.querySelector('#pct').textContent,
    playing: window.IconApp.state.playing,
    progress: window.IconApp.state.progress,
    tags: [...document.querySelectorAll('.tag')].filter((t) => t.style.display === 'flex').length,
    done: document.querySelectorAll('.rung.is-done').length
  }));
}

const setRange = (sel, value) => page.evaluate(([s, v]) => {
  const el = document.querySelector(s);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [sel, value]);

const checks = [];
const expect = (label, ok, detail) => { checks.push({ label, ok, detail }); };

try {
// 1 — boots and starts erecting on its own
let r = await readout();
expect('starts the build on arrival', r.playing && r.progress > 0, JSON.stringify(r));
await shot('01-dock');

// 2 — scrub to a partly-built hull
await setRange('#progress', 420);
await page.waitForTimeout(400);
r = await readout();
expect('scrubs mid-build', r.done > 5 && r.done < 24, JSON.stringify(r));
await shot('02-mid');

// 3 — complete the ship, tags appear
await setRange('#progress', 1000);
await page.waitForTimeout(600);
r = await readout();
expect('completes at 24 / 24', r.pct === '100%' && r.done === 24, JSON.stringify(r));
// Tags declutter against each other, so the count depends on the framing —
// this checks that projection and placement work, not how many survive.
expect('block tags project and place', r.tags > 5, 'visible tags: ' + r.tags);
await shot('03-complete');

// 4 — exploded view
await setRange('#explode', 100);
await page.waitForTimeout(700);
await shot('04-exploded');
await setRange('#explode', 0);

// 5 — selection opens a dossier
await page.click('.block-row:nth-child(23)');
await page.waitForTimeout(900);
const dossier = await page.evaluate(() => ({
  open: document.querySelector('#dossier').classList.contains('open'),
  name: document.querySelector('#dossier-name').textContent,
  specs: document.querySelectorAll('#dossier-specs dd').length
}));
expect('dossier opens with specs', dossier.open && dossier.specs === 3, JSON.stringify(dossier));
await shot('05-dossier');

// 6 — cutaway, night, heavy sea
await page.click('#dossier-close');
await page.click('[data-toggle="cutaway"]');
await page.waitForTimeout(500);
await shot('06-cutaway');
await page.click('[data-toggle="cutaway"]');
await page.click('[data-toggle="night"]');   // brings the deck lights up with it
await setRange('#sea', 78);
await page.waitForTimeout(900);
await shot('07-night');
const night = await page.evaluate(() => ({
  night: window.IconApp.state.night,
  sea: window.IconApp.state.seaState,
  lit: window.IconApp.state.deckLights
}));
expect('night brings up the lights, sea state follows',
  night.night && night.lit && night.sea > 0.7, JSON.stringify(night));

// 7 — sea trial makes way
await page.click('[data-toggle="night"]');
await setRange('#sea', 30);
await page.click('#sail-btn');
await page.waitForTimeout(300);
// The loop clamps dt to 50 ms a frame, so under software raster real time buys
// very little simulated time — hold the controls long enough to matter.
await page.keyboard.down('KeyW');
await page.waitForTimeout(7000);
await page.keyboard.down('KeyD');
await page.waitForTimeout(4000);
const helm = await page.evaluate(() => ({
  kn: parseFloat(document.querySelector('#kn').textContent),
  hdg: document.querySelector('#hdg').textContent,
  heading: window.IconApp.state.heading,
  sailing: window.IconApp.state.sailing
}));
await page.keyboard.up('KeyW');
await page.keyboard.up('KeyD');
// Heading is checked in radians, not off the readout: a couple of frames a
// second buys a fraction of a degree, which the display rounds away.
expect('ship makes way under helm', helm.sailing && helm.kn > 1 && Math.abs(helm.heading) > 1e-3, JSON.stringify(helm));
await shot('08-sailing');

await page.click('#helm-exit');
await page.waitForTimeout(400);
const back = await page.evaluate(() => ({
  sailing: window.IconApp.state.sailing,
  console: getComputedStyle(document.querySelector('#console')).display
}));
expect('sea trial can be left from the helm', !back.sailing && back.console !== 'none', JSON.stringify(back));

// 8 — the frame loop is still turning at the end of all that.
// This is a liveness check, not a performance measurement: SwiftShader renders
// this scene at a couple of frames a second, a GPU at sixty.
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const step = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(step);
}));
expect('frame loop still turning', fps > 0.5, fps.toFixed(1) + ' fps under software raster');
} catch (err) {
  expect('script ran to completion', false, err.message.split('\n')[0]);
}

// 9 — the artifact build boots too. It has a different shape: scripts run
// before the markup they drive, so a regression here would not show up above.
const artifact = await browser.newPage({ viewport: { width: 1024, height: 700 } });
const artErrors = [];
artifact.on('console', (m) => { if (m.type() === 'error') artErrors.push(m.text()); });
artifact.on('pageerror', (e) => artErrors.push(e.message));
await artifact.goto('file://' + join(here, 'dist/artifact.html'));
await artifact.waitForTimeout(3000);
const art = await artifact.evaluate(() => ({
  ready: document.body.classList.contains('ready'),
  blocks: document.querySelectorAll('.block-row').length,
  gl: !!document.querySelector('#stage').getContext('webgl2')
}));
expect('artifact build boots', art.ready && art.blocks === 24 && !artErrors.length,
  JSON.stringify(art) + ' ' + artErrors.join('; '));

await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? '  ok  ' : ' FAIL '} ${c.label}${c.ok ? '' : ' — ' + c.detail}`);
  if (!c.ok) failed++;
}
if (errors.length) {
  console.log('\nRuntime errors:');
  for (const e of [...new Set(errors)]) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed, ${new Set(errors).size} distinct runtime errors`);
process.exit(failed || errors.length ? 1 : 0);
