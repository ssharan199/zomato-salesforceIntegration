# Handoff — Icon of the Seas

Everything needed to pick this up in a fresh session. Read this first; it is the
only file you need to start from.

**Repo:** https://github.com/ssharan199/icon-of-the-seas (branch `main`) — this is
the home of the project. A mirror exists on branch `claude/icon-of-the-sea-sov6ec`
of `ssharan199/zomato-salesforceintegration`, left in place only because the work
started there. The Salesforce repo does not otherwise need it.

**Owner:** Smriti Sharan (SFDCAmplified). Deliverable is a vertical reel for
social, in Hinglish.

**If you are a fresh session starting from this file:** clone the repo, read §3,
and ask the owner for the ten line start times. Everything else is done and
green. Do not start by re-rendering — the render is 50 minutes and the timing
that would drive it is the thing that is missing.

---

## 1. What this is

An interactive 3D *Icon of the Seas* built with three.js — no engine, no model
files, no downloaded assets. The hull is lofted at runtime from 74 station
curves; everything above it is written as code. It does four things:

1. **Assembly** — builds keel-up in 24 blocks, each with a dossier. Explode the
   ship, cut away the starboard shell, scrub the build by hand.
2. **Walk aboard** — first person across nine neighbourhoods. The player lives in
   the ship's coordinate frame, so the horizon tilts as she rolls. Pools are
   wadeable.
3. **Sea trial** — she makes way under helm on the azimuth pods.
4. **The reel** — a ten-cut 9:16 sequence timed to a voice-over, rendered offline
   to an MP4.

Open `index.html` directly. No build step, no server.

## 2. Where things are

```
index.html            markup + the console UI
styles.css            design tokens, light and dark
src/ship.js           hull loft, the 24 blocks, dossier copy
src/venues.js         human-scale fit-out, walkable floors, colliders, crowd
src/water.js          sea + pool optics (shared wave bands, Fresnel, foam)
src/fx.js             HDR target, bloom pyramid, ACES tone map, grade
src/walk.js           first-person controller, free camera director, recorder
src/reel.js           THE REEL — ten scenes, camera moves, captions, durations
src/app.js            renderer, sea, camera rig, timeline, offline frame render
vendor/three.min.js   three r160, vendored (CDNs are blocked, see §6)
audio/vo.mp3          the voice track, 39.552 s
reel/*.mp4            rendered reel output
build.mjs             inlines everything into dist/ single-file builds
render.mjs            offline frame-by-frame render + audio mux
align.mjs             derives scene durations from the voice track
smoke.mjs             15 headless checks
verify.mjs            7 checks on load state, daylight, captions, crowd
views.mjs             contact sheet of first-person / exterior framings
reelshots.mjs         one frame from the middle of each reel cut
```

## 3. THE ONE OPEN PROBLEM — reel sync

**Status: unresolved. This is the only thing blocking a finished reel.**

The script's ten lines must land on the right scenes. The delivered MP4 (see §4)
was cut against the *first* voice take and is out of sync — the owner said so
twice, and that take has since been replaced.

**Why it is unresolved:** I cannot hear audio. Every timing so far is an
*estimate*. Speech recognition would settle it in seconds, but every model host
is blocked from the container — OpenAI, HuggingFace, Vosk, and ElevenLabs all
return `connect_rejected` at the proxy (verified, §6).

**Current timings** in `src/reel.js`, computed by `align.mjs` from the 39.552 s
take. `align.mjs` finds every run of speech with ffmpeg `silencedetect`, then
splits those runs into one group per line, choosing the split that best matches
each line's syllable count, with a 1.4 s floor on scene length. Every cut is
therefore forced into a real pause and can never land mid-word:

| # | at | dur | line |
|---|------|------|------|
| 1 | 0.00 | 3.37 | Ye koi sheher nahi |
| 2 | 3.37 | 2.20 | ICON OF THE SEAS |
| 3 | 5.57 | 5.95 | Titanic se 5× bada |
| 4 | 11.51 | 4.88 | 20 decks |
| 5 | 16.39 | 4.33 | 7,600 guests |
| 6 | 20.71 | 3.97 | 7 swimming pools |
| 7 | 24.69 | 3.35 | Sabse bada waterpark |
| 8 | 28.03 | 3.41 | Hazaaron asli paudhe |
| 9 | 31.44 | 4.17 | Har din alag restaurant |
| 10 | 35.61 | 3.94 | 200 crore rupees |

That guarantees no cut lands mid-word. It does **not** guarantee the right scene
sits on the right line — that needs someone who can hear the take.

**Three ways to settle it, best first:**

1. **Ask the owner for the start times.** She can hear it. A tap-along tool was
   built for exactly this and is verified working (audio loads, taps register):
   https://claude.ai/code/artifact/0d0a6d77-d4fe-4dd4-b0f6-eda592c964af
   Source of that tool is not in the repo — it is a standalone page with the mp3
   inlined as base64. Rebuild it if needed, or just ask for the numbers in text.
   **Note: results live in her browser. They only reach you if she pastes them or
   screenshots them.** Two rounds were lost to this — say so explicitly.
2. **Forced alignment off-container.** She has an ElevenLabs account. Their
   `/v1/forced-alignment` endpoint takes audio + transcript and returns
   word-level timings. She must run it on her own machine; the container cannot
   reach the API. Then paste the JSON and parse it.
3. **Ship the computed timing** and iterate from her feedback.

**Once you have real start times:** put the durations into `src/reel.js` (one
number per scene, they must sum to 39.55) and re-render (§5).

## 4. Renders

The delivered MP4 (`reel/icon-of-the-seas-reel-1080x1920.mp4`) is **stale** — it
was cut to the 36.24 s first take, which has been scrapped. Re-render before
sending anything.

Output spec that worked: 1080×1920, H.264 high, 30 fps, AAC 160k.
**Keep the file under 30 MB** — the chat transfer limit. CRF 24 with
`-maxrate 6M` lands ~19 MB for 36 s. CRF 18 gave 57 MB and was rejected.

## 5. How to render

```bash
npm install                    # playwright, ffmpeg-static, ffprobe-static
node build.mjs                 # refresh dist/ from src/
node render.mjs --frames 24    # short test first, always
node render.mjs                # full render, then mux with audio/vo.mp3
node render.mjs --mux-only     # re-assemble frames already on disk
```

`render.mjs` does **not** capture in real time. The container has no GPU, so the
page draws at ~0.4 fps and a MediaRecorder capture would be a slideshow.
Instead `IconApp.renderFrameAt(t)` draws a frame that is a pure function of `t` —
camera, caption animation, sea, crowd, machinery and ship trim all read the same
clock — so frames can be produced as slowly as needed and still assemble to
30 fps.

**Budget ~50 minutes** for a full render (39.55 s × 30 fps = ~1187 frames at
0.38 fps). Run it with `run_in_background: true` and a long timeout; the Bash
tool caps at 600 s per call.

**Sharding does not help.** `--shards N --shard i --no-mux` exists, but three
workers deliver the same 0.38 fps as one — SwiftShader already saturates all
4 cores. Verified, do not re-try it expecting a win.

Frames are kept in `dist/frames/`, so a timing change only needs the scenes that
actually moved re-rendered, not the whole pass.

## 6. Environment constraints — read before debugging network

The container is sandboxed behind a proxy. Check denials with:
`curl -sS "$HTTPS_PROXY/__agentproxy/status"`

- **Blocked:** unpkg, huggingface.co, openaipublic.azureedge.net, alphacephei.com,
  api.elevenlabs.io. All `connect_rejected`.
- **Allowed:** registry.npmjs.org, pypi.org. That is how three.js, playwright and
  ffmpeg-static got in. There is no system ffmpeg — it comes from npm
  (`require('ffmpeg-static')`).
- **No GPU.** Chromium runs SwiftShader: `--use-gl=swiftshader
  --enable-unsafe-swiftshader`.
- **Playwright's actionability gate fights the slow page.** `page.click()` waits
  for an element to be stable across two animation frames, which at ~1 fps times
  out. `smoke.mjs` dispatches clicks directly via `page.evaluate` instead.
- **Fixed-step hooks exist for tests:** `IconApp.stepSail/stepWalk/stepFilm/
  stepReel(dt)`. Use these rather than wall-clock waits — otherwise you measure
  the rasteriser, not the app.
- Chromium is at `/opt/pw-browsers/chromium`. Never run `playwright install`.

## 7. Facts to keep honest

These were checked and matter for a public reel:

- **"200 crore rupees"** is what the owner asked for and what is on screen. It is
  wrong: she cost ~USD 2 billion ≈ **₹16,600 crore**. ₹200 crore ≈ USD 24 million.
  The confusion is understandable — 2 billion *is* 200 crore, but of **dollars**.
  Raised twice, she chose it; do not silently change it, but it is fair to
  mention once if she revisits the line.
- **"Titanic se 5× bada"** is true by **tonnage** (46,328 GT vs 248,663 GT), not
  length (269 m vs 365 m — 1.36×). The caption carries the GT figures so the
  visual does not contradict the voice.
- Ship figures used: 364.75 m LOA, 48.5 m beam, 9.3 m draft, 248,663 GT, 20 decks
  (not "20+"), 5,610 guests double occupancy / 7,600 max, 2,350 crew, 22 kn.

## 8. Known weaknesses, in priority order

1. **Reel sync** — §3. Everything else is cosmetic next to this.
2. **`decks` and `food` cuts** are the weakest two of the ten; never re-staged
   after the day/night switch.
3. **Waterpark** is six clean slides; the real Category 6 is a dense tangle.
4. **No screen-space reflection.** Light on the water at night is an authored
   glow in the sea shader, not a reflection. Documented in `src/water.js`.
5. Superstructure is ~15% taller than scale relative to her length — traded for a
   silhouette that reads at a glance.
6. Central Park has no glass canopy.

## 9. Verify before delivering

```bash
npm test          # 15 checks — build, dossiers, cutaway, night, sail, walk, film
node verify.mjs   # 7 checks — load state, daylight, captions inside frame, crowd
node reelshots.mjs   # contact sheet, one frame per cut, to eyeball the cut
```

Both suites were green at last commit. `verify.mjs` includes a check that every
caption stays inside the 9:16 canvas — captions were once laid out against the
browser window and spilled outside the exported frame.

## 10. Decisions already made — don't relitigate

- **Daylight, not night.** Night was built and rejected; the blue-water aerials
  read her shape better. Night remains a toggle.
- **She arrives already built.** The build runs only when asked.
- **No selection cage.** The Box3Helper wireframe was removed on request.
- **Captions on the diagonal for hero shots.** A 9:16 frame at this standoff is
  ~307 m wide against ~546 m tall; a 365 m ship does not fit across it.
- Crowd is eight instanced meshes with a walk cycle, not billboards.

## 11. The script, verbatim

Ten lines, in order. These are what the voice track says; the `id` is the scene
in `src/reel.js`. The syllable counts are what `align.mjs` uses to guess each
line's share of the recording — they are also kept in `align.mjs` itself, which
is the single source of truth if these ever drift.

| # | id | syl | line |
|---|----|-----|------|
| 1 | hook | 19 | Ye koi sheher nahi / ye duniya ka sabse bada cruise ship hai |
| 2 | name | 9 | Iska naam hai Icon of the Seas |
| 3 | titanic | 26 | Ye itna bada hai ki Titanic iske saamne chhota lagta hai — karib 5 guna bada |
| 4 | decks | 25 | Ismein 20 se zyada decks hain, matlab 20-manzil ki building |
| 5 | people | 30 | 7,000 passengers aur 2,000 crew — ek poora chhota sheher |
| 6 | pools | 9 | Andar 7 alag swimming pools hain |
| 7 | waterpark | 11 | samundar ka sabse bada waterpark |
| 8 | park | 14 | ek park jismein hazaaron asli paudhe lage hain |
| 9 | food | 19 | aur itne restaurants ki har din alag jagah khana kha sakte ho |
| 10 | price | 17 | Iski keemat karib 200 crore |

The captions on screen are shorter than the spoken lines on purpose — a 9:16
frame cannot hold a full sentence at a readable size. The caption text lives in
`src/reel.js` (`line` and `sub`), the spoken text in `align.mjs`.

## 12. Credentials

An ElevenLabs API key was pasted into chat during this work. It was kept outside
every repo, used once, then shredded, and both repos were checked clean. **It
should be treated as compromised and rotated** — deleting a chat message does
not un-expose a key. Do not ask for it again; if forced alignment is wanted, the
owner should run it on her own machine (§3, option 2) and paste the JSON.
