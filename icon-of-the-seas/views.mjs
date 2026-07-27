/* Review tool: drops the camera into every venue and saves a first-person
   frame from each, so the interiors can be judged without clicking through.
   node views.mjs [venue-id ...]        output: dist/view-<id>.png */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);

// id, where to stand, which way to face, and how far to look up or down
const VIEWS = [
  { id: 'promenade', pos: [-60, 32.7, 0], yaw: -Math.PI / 2, pitch: 0.05 },
  { id: 'promenade-atrium', pos: [0, 32.7, 6], yaw: -Math.PI / 2, pitch: 0.32 },
  { id: 'park', pos: [-30, 46.86, 0], yaw: -Math.PI / 2, pitch: 0.12 },
  { id: 'park-up', pos: [4, 46.86, 0], yaw: -Math.PI / 2, pitch: 0.75 },
  { id: 'chill', pos: [-30, 76.8, -14], yaw: Math.PI, pitch: -0.05 },
  { id: 'chill-pool', pos: [-56, 76.8, 0], yaw: -Math.PI / 2, pitch: -0.1 },
  { id: 'thrill', pos: [-118, 76.8, 0], yaw: -Math.PI / 2, pitch: 0.35 },
  { id: 'aquadome', pos: [72, 77, 0], yaw: Math.PI / 2, pitch: 0.15 },
  { id: 'hideaway', pos: [-148, 62.4, 0], yaw: Math.PI / 2, pitch: -0.05 },
  { id: 'crown', pos: [-34, 66.3, 24], yaw: 0, pitch: -0.15 },
  { id: 'maindeck', pos: [40, 30.4, 21.9], yaw: -Math.PI / 2, pitch: 0 },
  { id: 'surfside', pos: [96, 44, 0], yaw: Math.PI / 2, pitch: 0.05 },
  { id: 'crowd', pos: [-64, 76.8, -13], yaw: Math.PI * 0.92, pitch: -0.02 },
  { id: 'crowd-promenade', pos: [-96, 32.7, 2], yaw: -Math.PI / 2, pitch: -0.03 }
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('file://' + join(here, 'dist/icon-of-the-seas.html'));
await page.waitForTimeout(2500);
const night = process.argv.includes('--night');
await page.evaluate((isNight) => {
  window.IconApp.setProgress(1);
  window.IconApp.setToggle('hideUI', true);
  if (isNight) window.IconApp.setToggle('night', true);
  window.IconApp.setMode('walk');
}, night);
await page.waitForTimeout(800);

const EXTERIOR = {
  'ext-quarter': { eye: [-330, 70, 300], look: [-20, 45, 0], fov: 34 },
  'ext-stern':   { eye: [-360, 60, 40],  look: [-150, 55, 0], fov: 40 },
  'ext-bow':     { eye: [330, 55, 30],   look: [80, 60, 0],  fov: 38 },
  'ext-beam':    { eye: [-10, 45, 430],  look: [-10, 48, 0], fov: 30 }
};

for (const [id, e] of Object.entries(EXTERIOR)) {
  if (only.length && !only.includes(id)) continue;
  await page.evaluate((v) => {
    const T = window.THREE;
    const app = window.IconApp;
    app.setMode('orbit');
    app.freeCam(v.eye, v.look, v.fov);
  }, e);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(here, 'dist/' + id + '.png') });
  console.log(id + '.png');
}
await page.evaluate(() => window.IconApp.setMode('walk'));

for (const v of VIEWS) {
  if (only.length && !only.includes(v.id)) continue;
  await page.evaluate((view) => {
    const w = window.IconApp.walker;
    w.pos.set(view.pos[0], view.pos[1], view.pos[2]);
    w.vel.set(0, 0, 0);
    w.yaw = view.yaw;
    w.pitch = view.pitch;
    w.eyeY = view.pos[1] + w.eye;
  }, v);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(here, 'dist/view-' + v.id + '.png') });
  console.log('view-' + v.id + '.png');
}

if (errors.length) console.log('errors:', [...new Set(errors)].join(' | '));
await browser.close();
