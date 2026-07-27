/* Aligns the script's lines to the voice track's speech segments.

   No speech recognition is available here (every model host is blocked), so
   this does the next best thing: it detects where the speaker is and is not
   talking, then splits those speech runs into as many consecutive groups as
   there are lines — choosing the split that best matches how long each line
   should take, given its syllable count.

   The point is not the estimate. The point is the constraint: every cut is
   forced to land inside a real pause, so a scene can never change in the
   middle of a word. */
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const AUDIO = process.argv[2] || join(here, 'audio/vo.mp3');

// syllables per line, in script order — what sets each line's expected share
const LINES = [
  { id: 'hook',      syl: 19, text: 'Ye koi sheher nahi / ye duniya ka sabse bada cruise ship hai' },
  { id: 'name',      syl: 9,  text: 'Iska naam hai Icon of the Seas' },
  { id: 'titanic',   syl: 26, text: 'Ye itna bada hai ki Titanic iske saamne chhota lagta hai — karib 5 guna bada' },
  { id: 'decks',     syl: 25, text: 'Ismein 20 se zyada decks hain, matlab 20-manzil ki building' },
  { id: 'people',    syl: 30, text: '7,000 passengers aur 2,000 crew — ek poora chhota sheher' },
  { id: 'pools',     syl: 9,  text: 'Andar 7 alag swimming pools hain' },
  { id: 'waterpark', syl: 11, text: 'samundar ka sabse bada waterpark' },
  { id: 'park',      syl: 14, text: 'ek park jismein hazaaron asli paudhe lage hain' },
  { id: 'food',      syl: 19, text: 'aur itne restaurants ki har din alag jagah khana kha sakte ho' },
  { id: 'price',     syl: 17, text: 'Iski keemat karib 200 crore' }
];

const probe = spawnSync(ffmpegPath, ['-v', 'error', '-i', AUDIO,
  '-af', 'silencedetect=noise=-33dB:d=0.20,ametadata=print:file=-', '-f', 'null', '-'],
  { encoding: 'utf8' });
const dur = Number(spawnSync(ffmpegPath, ['-i', AUDIO, '-f', 'null', '-'], { encoding: 'utf8' })
  .stderr.match(/time=(\d+):(\d+):([\d.]+)/g)?.pop()?.match(/time=(\d+):(\d+):([\d.]+)/)?.slice(1)
  .reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0) ?? 36.24);

const marks = [...probe.stdout.matchAll(/lavfi\.silence_(start|end)=([\d.]+)/g)]
  .map((m) => ({ kind: m[1], at: Number(m[2]) }));

// speech runs: everything that is not a detected silence
const runs = [];
let cursor = 0;
for (const m of marks) {
  if (m.kind === 'start') { if (m.at - cursor > 0.05) runs.push({ a: cursor, b: m.at }); }
  else cursor = m.at;
}
if (dur - cursor > 0.05) runs.push({ a: cursor, b: dur });

const speech = runs.reduce((s, r) => s + (r.b - r.a), 0);
const rate = LINES.reduce((s, l) => s + l.syl, 0) / speech;      // syllables per second
console.log(`${runs.length} speech runs, ${speech.toFixed(2)}s of speech, ${rate.toFixed(2)} syl/s`);

// Split the runs into LINES.length consecutive groups, minimising the squared
// error between each group's speech time and the line's expected time.
const N = runs.length, K = LINES.length;
const want = LINES.map((l) => l.syl / rate);
const pre = [0];
for (const r of runs) pre.push(pre[pre.length - 1] + (r.b - r.a));
// A scene shorter than this cannot read on screen, whatever the arithmetic
// says — without the floor the optimiser happily assigns a line a 0.4 s cut.
const MIN_SCENE = 1.4;
const cost = (i, j, k) => {              // runs [i, j) assigned to line k
  const span = runs[j - 1].b - runs[i].a;
  if (span < MIN_SCENE) return Infinity;
  const got = pre[j] - pre[i];
  const d = got - want[k];
  return d * d;
};
const best = Array.from({ length: K + 1 }, () => new Float64Array(N + 1).fill(Infinity));
const from = Array.from({ length: K + 1 }, () => new Int32Array(N + 1).fill(-1));
best[0][0] = 0;
for (let k = 1; k <= K; k++) {
  for (let j = k; j <= N - (K - k); j++) {
    for (let i = k - 1; i < j; i++) {
      if (!isFinite(best[k - 1][i])) continue;
      const c = best[k - 1][i] + cost(i, j, k - 1);
      if (c < best[k][j]) { best[k][j] = c; from[k][j] = i; }
    }
  }
}
const cuts = [];
let j = N;
for (let k = K; k >= 1; k--) { cuts.unshift(from[k][j]); j = from[k][j]; }
cuts.push(N);

// A cut sits in the gap between the last run of one group and the first of the
// next, biased early so the picture is already there when the line starts.
const out = [];
for (let k = 0; k < K; k++) {
  const first = runs[cuts[k]], last = runs[cuts[k + 1] - 1];
  const gapStart = last.b;
  const nextStart = k + 1 < K ? runs[cuts[k + 1]].a : dur;
  const end = k + 1 < K ? gapStart + (nextStart - gapStart) * 0.35 : dur;
  out.push({ id: LINES[k].id, start: first.a, end, runs: cuts[k + 1] - cuts[k], text: LINES[k].text });
}
let prev = 0;
console.log('\n  at     dur   runs  line');
const durations = out.map((o, i) => {
  const start = i === 0 ? 0 : prev;
  const d = o.end - start;
  prev = o.end;
  console.log(`  ${start.toFixed(2).padStart(5)}  ${d.toFixed(2).padStart(5)}   ${String(o.runs).padStart(2)}   ${o.id}  — ${o.text.slice(0, 46)}`);
  return { id: o.id, dur: Number(d.toFixed(2)) };
});
console.log('\ntotal ' + durations.reduce((s, d) => s + d.dur, 0).toFixed(2) + 's  (audio ' + dur.toFixed(2) + 's)');
console.log(JSON.stringify(Object.fromEntries(durations.map((d) => [d.id, d.dur]))));
