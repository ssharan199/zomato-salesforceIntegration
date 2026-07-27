/* Offline reel render.

   The browser's own MediaRecorder is useless here: this container has no GPU,
   so the page draws at a couple of frames a second and a real-time capture
   would be a slideshow. Instead every frame is addressed by time, drawn
   deterministically, saved, and assembled afterwards — the render takes as
   long as it takes, and the film still runs at 30 fps.

   node render.mjs [--fps 30] [--height 1280] [--audio path] [--frames N]
   Output: dist/icon-of-the-seas-reel.mp4  (1080x1920, H.264 + AAC) */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const FPS = Number(arg('fps', 30));
const HEIGHT = Number(arg('height', 1280));          // render height; upscaled at mux
const WIDTH = Math.round((HEIGHT * 9) / 16 / 2) * 2;
const AUDIO = arg('audio', join(here, 'audio/vo.mp3'));
const LIMIT = Number(arg('frames', 0));              // 0 = the whole cut
// Software rasterising is CPU-bound, so the frame range is split across
// several browsers and the pieces are assembled once they all land.
const SHARDS = Number(arg('shards', 1));
const SHARD = Number(arg('shard', 0));
const MUX_ONLY = process.argv.includes('--mux-only');
const NO_MUX = process.argv.includes('--no-mux');
const FRAME_DIR = join(here, 'dist/frames');

if (!existsSync(AUDIO)) {
  console.error('No voice track at ' + AUDIO + ' — pass --audio <file>');
  process.exit(1);
}

if (!MUX_ONLY && SHARDS === 1) rmSync(FRAME_DIR, { recursive: true, force: true });
mkdirSync(FRAME_DIR, { recursive: true });

if (!MUX_ONLY) {
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('file://' + join(here, 'dist/icon-of-the-seas.html'));
await page.waitForTimeout(3000);

// Reel framing would letterbox inside an already-9:16 window, so the canvas
// simply fills it and the overlay variables follow.
const setup = await page.evaluate(() => {
  window.IconApp.setProgress(1);
  window.IconApp.setToggle('hideUI', true);
  window.IconApp.beginOffline();
  return { duration: window.IconApp.reelDuration() };
});
await page.waitForTimeout(500);

const total = LIMIT || Math.ceil(setup.duration * FPS);
console.log(`${total} frames at ${FPS} fps — ${WIDTH}x${HEIGHT} — ${setup.duration.toFixed(2)}s`);

const started = Date.now();
let rendered = 0;
for (let i = 0; i < total; i++) {
  if (i % SHARDS !== SHARD) continue;
  const t = i / FPS;
  await page.evaluate((time) => window.IconApp.renderFrameAt(time), t);
  await page.screenshot({
    path: join(FRAME_DIR, 'f' + String(i).padStart(5, '0') + '.jpg'),
    type: 'jpeg',
    quality: 94
  });
  rendered++;
  if (rendered % 20 === 0 || i >= total - SHARDS) {
    const rate = rendered / ((Date.now() - started) / 1000);
    const mine = Math.ceil((total - SHARD) / SHARDS);
    console.log(`  shard ${SHARD}: ${rendered}/${mine}  ${rate.toFixed(2)} fps  ~${Math.round((mine - rendered) / rate / 60)} min left`);
  }
}
await browser.close();

if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5).join(' | '));
}

if (NO_MUX) {
  console.log('shard ' + SHARD + ' done');
  process.exit(0);
}

const out = join(here, 'dist/icon-of-the-seas-reel.mp4');
const args = [
  '-y',
  '-framerate', String(FPS),
  '-i', join(FRAME_DIR, 'f%05d.jpg'),
  '-i', AUDIO,
  '-vf', 'scale=1080:1920:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-level', '4.1',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest',
  '-movflags', '+faststart',
  out
];
const mux = spawnSync(ffmpegPath, args, { encoding: 'utf8' });
if (mux.status !== 0) {
  console.error(mux.stderr.split('\n').slice(-12).join('\n'));
  process.exit(1);
}
console.log('wrote ' + out);
console.log(readdirSync(FRAME_DIR).length + ' frames kept in dist/frames');
