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
const ship = read('src/ship.js');
const app = read('src/app.js');

// Guard against a source file accidentally closing the inline script early.
for (const [name, src] of [['ship.js', ship], ['app.js', app], ['three.min.js', three]]) {
  if (/<\/script/i.test(src)) throw new Error(`${name} contains a literal </script — escape it before inlining`);
}

const bundle = `<style>\n${css}\n</style>\n<script>\n${three}\n</script>\n<script>\n${ship}\n</script>\n<script>\n${app}\n</script>`;

// Replacements go through functions — the sources are full of `$`, which would
// otherwise be read as replacement patterns.
const scriptTags = /<script src="vendor\/three\.min\.js"><\/script>\s*<script src="src\/ship\.js"><\/script>\s*<script src="src\/app\.js"><\/script>/;
if (!scriptTags.test(html)) throw new Error('script tags not found in index.html');

let standalone = html
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace(scriptTags, () => `<script>\n${three}\n</script>\n<script>\n${ship}\n</script>\n<script>\n${app}\n</script>`);

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
