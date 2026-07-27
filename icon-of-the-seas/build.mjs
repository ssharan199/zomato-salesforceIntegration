/* Inlines the source tree into single-file builds.
   node build.mjs
     dist/icon-of-the-seas.html  — standalone, opens straight from the filesystem
     dist/artifact.html          — body content only, for hosts that supply the shell */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const three = read('vendor/three.min.js');
const sources = ['src/venues.js', 'src/water.js', 'src/ship.js', 'src/fx.js', 'src/walk.js', 'src/reel.js', 'src/app.js'];
const code = sources.map(read);

// Guard against a source file accidentally closing the inline script early.
for (const [name, src] of [...sources.map((s, i) => [s, code[i]]), ['three.min.js', three]]) {
  if (/<\/script/i.test(src)) throw new Error(`${name} contains a literal </script — escape it before inlining`);
}

const scripts = [three, ...code].map((src) => `<script>\n${src}\n</script>`).join('\n');
const bundle = `<style>\n${css}\n</style>\n${scripts}`;

// Replacements go through functions — the sources are full of `$`, which would
// otherwise be read as replacement patterns.
const scriptTags = new RegExp(
  ['vendor/three.min.js', ...sources]
    .map((s) => `<script src="${s.replace(/\//g, '\\/').replace(/\./g, '\\.')}"><\\/script>`)
    .join('\\s*')
);
if (!scriptTags.test(html)) throw new Error('script tags not found in index.html');

let standalone = html
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace(scriptTags, () => scripts);

if (standalone.includes('vendor/three.min.js')) throw new Error('script tags were not replaced');
if (standalone.includes('href="styles.css"')) throw new Error('stylesheet link was not replaced');

// Body content only: strip the document shell the host provides.
const bodyInner = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script src="[^"]+"><\/script>\s*/g, '')
  .trim();

const artifact = `<title>Icon of the Seas — Assembly Console</title>\n${bundle}\n${bodyInner}\n`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/icon-of-the-seas.html'), standalone);
writeFileSync(join(here, 'dist/artifact.html'), artifact);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
console.log(`dist/icon-of-the-seas.html  ${kb(standalone)}`);
console.log(`dist/artifact.html          ${kb(artifact)}`);
