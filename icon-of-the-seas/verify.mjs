/* Checks the four things asked for: she is already built on arrival, the reel
   runs in daylight, nothing draws a cage around a selected block, and the
   crowd is built from limbs rather than a capsule on a box. */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 700, height: 480 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('file://' + join(here, 'dist/icon-of-the-seas.html'));
await p.waitForTimeout(2600);

const out = await p.evaluate(() => {
  const s = window.IconApp.state;
  const fx = window.IconApp.fx;
  const orig = fx.render.bind(fx);
  let scene = null;
  fx.render = function (sc, c, t) { scene = sc; return orig(sc, c, t); };
  return new Promise((res) => setTimeout(() => {
    let helpers = 0, instanced = 0;
    if (scene) scene.traverse((o) => {
      if (o.type === 'Box3Helper' || o.type === 'BoxHelper') helpers++;
      if (o.isInstancedMesh && o.count > 100) instanced++;
    });
    res({
      progress: s.progress,
      playing: s.playing,
      night: s.night,
      playLabel: document.querySelector('#play').textContent.trim(),
      nightScenes: window.IconReel.scenes.filter((x) => x.env === 'night').length,
      dayScenes: window.IconReel.scenes.filter((x) => x.env === 'day').length,
      helpers,
      crowdMeshes: instanced
    });
  }, 1200));
});

// select a block and confirm no cage appears
await p.evaluate(() => document.querySelectorAll('.block-row')[22].click());
await p.waitForTimeout(1500);
const afterSelect = await p.evaluate(() => {
  const fx = window.IconApp.fx;
  const orig = fx.render.bind(fx);
  let scene = null;
  fx.render = function (sc, c, t) { scene = sc; return orig(sc, c, t); };
  return new Promise((res) => setTimeout(() => {
    let helpers = 0;
    if (scene) scene.traverse((o) => { if (/Helper/.test(o.type)) helpers++; });
    res({ helpers, dossierOpen: document.querySelector('#dossier').classList.contains('open') });
  }, 1000));
});
await p.screenshot({ path: join(here, 'dist/verify-selected.png') });

// captions must sit inside the 9:16 frame that gets exported, not the window.
// Measured from Node rather than inside an in-page promise, which the very slow
// software-rendered page can have collected before it settles.
await p.evaluate(() => {
  window.IconApp.setToggle('reel', true);
  window.IconApp.setToggle('hideUI', true);
  window.IconApp.startReel(false);
});
await p.waitForTimeout(2000);
const caption = await p.evaluate(() => {
  const canvas = document.querySelector('#stage').getBoundingClientRect();
  const worst = [];
  for (const el of document.querySelectorAll('.reel-line, .reel-sub')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;          // hidden subtitle on a caption with no sub line
    worst.push({
      tag: el.id,
      insideL: r.left >= canvas.left - 0.5,
      insideR: r.right <= canvas.right + 0.5,
      over: Math.round(Math.max(canvas.left - r.left, r.right - canvas.right))
    });
  }
  return { canvasW: Math.round(canvas.width), canvasH: Math.round(canvas.height), worst };
});
await p.screenshot({ path: join(here, 'dist/verify-caption.png') });
const allInside = caption.worst.length > 0 && caption.worst.every((w) => w.insideL && w.insideR);
const ratioOk = Math.abs(caption.canvasW / caption.canvasH - 9 / 16) < 0.02;

const checks = [
  ['already built on arrival', out.progress === 1 && out.playing === false, JSON.stringify({ progress: out.progress, playing: out.playing })],
  ['build is offered, not forced', /build from scratch/i.test(out.playLabel), out.playLabel],
  ['loads in daylight', out.night === false, 'night=' + out.night],
  ['reel is all daylight', out.nightScenes === 0 && out.dayScenes === 10, out.dayScenes + ' day / ' + out.nightScenes + ' night'],
  ['no cage around a selection', afterSelect.helpers === 0 && afterSelect.dossierOpen, JSON.stringify(afterSelect)],
  ['crowd built from limbs', out.crowdMeshes >= 8, out.crowdMeshes + ' instanced limb meshes'],
  ['captions stay inside the 9:16 frame', allInside && ratioOk, JSON.stringify(caption)]
];
let bad = 0;
for (const [label, ok, detail] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ' — ' + detail}`);
  if (!ok) bad++;
}
if (errors.length) console.log('errors:', [...new Set(errors)].join(' | '));
await b.close();
process.exit(bad || errors.length ? 1 : 0);
