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

// The scene renders at ~1 fps under software raster, which is slower than
// Playwright's "element stable for two frames" gate. These are behaviour
// checks, not hit-testing checks, so dispatch the click directly.
const click = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) throw new Error('no element for ' + s);
  el.click();
}, sel);

const setRange = (sel, value) => page.evaluate(([s, v]) => {
  const el = document.querySelector(s);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [sel, value]);

const checks = [];
const expect = (label, ok, detail) => { checks.push({ label, ok, detail }); };

try {
// 1 — she is finished when you arrive, and running the build is a choice
let r = await readout();
expect('arrives already built', r.progress === 1 && !r.playing && r.done === 24, JSON.stringify(r));
await click('#play');
await page.waitForTimeout(500);
const started = await page.evaluate(() => ({
  playing: window.IconApp.state.playing, progress: window.IconApp.state.progress
}));
expect('build from scratch restarts at the keel', started.playing && started.progress < 0.3, JSON.stringify(started));
await page.evaluate(() => { window.IconApp.state.playing = false; });
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
await click('.block-row:nth-child(23)');
await page.waitForTimeout(900);
const dossier = await page.evaluate(() => ({
  open: document.querySelector('#dossier').classList.contains('open'),
  name: document.querySelector('#dossier-name').textContent,
  specs: document.querySelectorAll('#dossier-specs dd').length
}));
expect('dossier opens with specs', dossier.open && dossier.specs === 3, JSON.stringify(dossier));
await shot('05-dossier');

// 6 — cutaway, night, heavy sea
await click('#dossier-close');
await click('[data-toggle="cutaway"]');
await page.waitForTimeout(500);
await shot('06-cutaway');
await click('[data-toggle="cutaway"]');
await click('[data-toggle="night"]');   // brings the deck lights up with it
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
await click('[data-toggle="night"]');
await setRange('#sea', 30);
await click('#sail-btn');
await page.waitForTimeout(300);
// Advance the helm at a fixed step rather than in wall-clock: under software
// raster the frame loop would buy only a fraction of a simulated second.
await page.keyboard.down('KeyW');
await page.keyboard.down('KeyD');
const helm = await page.evaluate(() => {
  for (let i = 0; i < 600; i++) window.IconApp.stepSail(1 / 60);   // 10 s of helm
  return {
    kn: parseFloat(document.querySelector('#kn').textContent),
    hdg: document.querySelector('#hdg').textContent,
    heading: window.IconApp.state.heading,
    sailing: window.IconApp.state.sailing
  };
});
await page.keyboard.up('KeyW');
await page.keyboard.up('KeyD');
expect('ship makes way under helm',
  helm.sailing && helm.kn > 10 && helm.hdg !== '000°', JSON.stringify(helm));
await shot('08-sailing');

await click('#helm-exit');
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

// 9 — walk aboard: spawn in the promenade and actually move
await click('#walk-btn');
await page.waitForTimeout(600);
const spawned = await page.evaluate(() => {
  const w = window.IconApp.walker;
  return { mode: window.IconApp.state.mode, x: w.pos.x, y: w.pos.y, ground: w.onGround };
});
await page.keyboard.down('KeyW');
const walked = await page.evaluate(() => {
  for (let i = 0; i < 300; i++) window.IconApp.stepWalk(1 / 60);   // 5 s of walking
  const w = window.IconApp.walker;
  return { x: w.pos.x, z: w.pos.z, y: w.pos.y, ground: w.onGround, venue: document.querySelector('#walk-venue').textContent };
});
await page.keyboard.up('KeyW');
// Walks forward down the street, stays on the deck it started on.
expect('walks the Royal Promenade',
  spawned.mode === 'walk' && Math.abs(walked.z) > 8 && walked.ground && Math.abs(walked.y - spawned.y) < 0.5,
  JSON.stringify({ spawned, walked }));
await shot('09-promenade');

// 10 — the pool deck, standing in the water
await page.evaluate(() => {
  const spawn = window.IconVenues.spawns.find((s) => s.id === 'chill');
  window.IconApp.walker.spawn(spawn);
  window.IconApp.walker.pos.set(-56, spawn.pos[1], 0);   // into the pool
});
await page.waitForTimeout(1200);
const wading = await page.evaluate(() => ({
  wading: window.IconApp.walker.wading,
  eye: window.IconApp.walker.eyeY
}));
expect('wades into the pool', wading.wading > 0.1, JSON.stringify(wading));
await shot('10-pool');

// 11 — filming: shots advance and the camera actually moves
await click('#walk-exit');
await page.waitForTimeout(200);
await click('#film-btn');
await page.waitForTimeout(500);
const film0 = await page.evaluate(() => ({
  mode: window.IconApp.state.mode,
  shot: document.querySelector('#film-shot').textContent,
  cam: window.IconApp.cameraPos()
}));
const film1 = await page.evaluate(() => {
  for (let i = 0; i < 180; i++) window.IconApp.stepFilm(1 / 60);   // 3 s of shot
  return { cam: window.IconApp.cameraPos() };
});
const moved = Math.hypot(film1.cam[0] - film0.cam[0], film1.cam[1] - film0.cam[1], film1.cam[2] - film0.cam[2]);
expect('camera flies the authored shots', film0.mode === 'film' && moved > 5,
  JSON.stringify({ shot: film0.shot, moved: moved.toFixed(2) }));
await shot('11-film');

// 12 — vertical framing for a reel
await page.evaluate(() => window.IconApp.setToggle('reel', true));
await page.waitForTimeout(900);
const reel = await page.evaluate(() => {
  const c = document.querySelector('#stage');
  return { w: c.clientWidth, h: c.clientHeight };
});
expect('reel framing is 9:16', Math.abs((reel.w / reel.h) - 9 / 16) < 0.02, JSON.stringify(reel));
await shot('12-reel');
await page.evaluate(() => window.IconApp.setToggle('reel', false));
await page.evaluate(() => window.IconApp.setMode('orbit'));
await page.waitForTimeout(500);

// 13 — the artifact build boots too. It has a different shape: scripts run
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
