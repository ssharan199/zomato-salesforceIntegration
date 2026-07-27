# Icon of the Seas

Interactive 3D *Icon of the Seas* — Royal Caribbean's 2024 megaship — built
from scratch with three.js. No engine, no model files: the hull is lofted at
runtime from 74 station curves and everything above it is written as code.

The finished vertical reel is in [`reel/`](reel/).

**Picking this up in a new session? Read [`HANDOFF.md`](HANDOFF.md) first** — it
has the whole state of the project, what is still open, and how to render.

## Assembly Console

An interactive 3D design-and-assembly game for Royal Caribbean's *Icon of the Seas*:
build her keel-up in 24 blocks, pull the whole ship apart, cut away the starboard
shell to look inside, **walk her decks in first person**, then take her out on a
sea trial — and film the whole thing for a reel.

Written from scratch with [three.js](https://threejs.org) — no engine, no model
files. The hull is lofted at runtime from 74 station curves; everything above it is
built from primitives in `src/ship.js`.

## Run it

```
# just open it — no build step, no server needed
open index.html
```

Or use a single-file build:

```
node build.mjs
# dist/icon-of-the-seas.html   standalone, everything inlined (~750 kB)
# dist/artifact.html           body content only, for hosts that supply the shell
```

## Controls

| | |
|---|---|
| Drag | Orbit |
| Right-drag / Shift-drag | Pan |
| Scroll / pinch | Zoom |
| Click a block | Open its dossier |
| <kbd>Space</kbd> | Run / pause the build |
| <kbd>E</kbd> | Explode / collapse |
| <kbd>L</kbd> | Block tags |
| <kbd>C</kbd> | Cutaway |
| <kbd>N</kbd> | Night |
| <kbd>R</kbd> | Reset to an empty dock |
| <kbd>W</kbd> <kbd>S</kbd> / <kbd>A</kbd> <kbd>D</kbd> | Throttle and helm, in sea trial |
| <kbd>Esc</kbd> | Leave sea trial / clear selection |

## The 24 blocks

Erected in the order the console runs them: keel and double bottom, LNG tanks,
engine room, azimuth pods, bow thrusters, stabiliser fins, port and starboard
plating, bulbous bow, transom, main deck, Royal Promenade, balcony stacks,
Central Park, Surfside, the suite neighbourhood, lifeboats, Chill Island,
Swim & Tonic, Thrill Island, Crown's Edge, The Hideaway, the AquaDome, and
finally the funnel, mast and bridge.

Each carries a dossier — what the block is, what it does, and why it is shaped
the way it is. Figures follow the delivered ship (364.75 m LOA, 48.5 m beam,
9.3 m draft, 248,663 GT, 20 decks, 5,610 guests at double occupancy, 22 kn);
anything approximate is marked ≈.

## Layout

```
index.html        markup and the console
styles.css        design tokens, light and dark
src/venues.js     human-scale fit-out, walkable floors, colliders, the crowd
src/water.js      pool and sea optics — shared wave bands, Fresnel, foam
src/ship.js       hull loft, the 24 blocks, dossier copy
src/fx.js         HDR target, bloom pyramid, tone map, grade
src/walk.js       first-person controller, camera director, webm recorder
src/app.js        renderer, sea, camera rig, build timeline, sea trial
vendor/three.min.js
build.mjs         inlines the above into dist/
smoke.mjs         headless checks — drives everything, fails on any runtime error
views.mjs         review tool — first-person and exterior frames from each venue
reelshots.mjs     contact sheet — one frame from the middle of every reel cut
verify.mjs        checks load state, daylight, selection chrome, crowd rig
```

## Walking aboard

Nine places you can stand: Royal Promenade, Central Park, Chill Island, Thrill
Island, the AquaDome, The Hideaway, Crown's Edge, the promenade deck and
Surfside. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walks, the mouse
looks (pointer lock where the browser allows it, drag-to-look otherwise),
<kbd>Shift</kbd> runs, <kbd>Space</kbd> jumps. Walk into a pool and you wade.
Walk off Crown's Edge and you go over the side.

The player lives in the ship's own coordinate frame, so the horizon tilts when
she rolls — you are standing on her, not beside her.

## Filming

Nine authored camera moves (<kbd>F</kbd>), a vertical 9:16 framing toggle
(<kbd>B</kbd>), a hide-the-console key (<kbd>H</kbd>), and a recorder
(<kbd>K</kbd>) that writes a .webm straight off the canvas.

## The image pipeline

`src/fx.js`: scene to an HDR multisampled target, soft-knee bright pass, a
four-level downsample/tent-upsample bloom pyramid added in HDR, then exposure,
ACES tone mapping, grade, vignette and grain, encoded to sRGB. The renderer's
own tone mapping is off so this stays the single owner. Exposure is authored per
lighting mode rather than metered — a reel wants a stable image, and an
auto-exposure loop pumps as the camera pans.

Water is documented in `src/water.js`: six analytic wave bands shared between
the sea and the pools, derivative-attenuated so fine bands fade out rather than
alias, side-aware Fresnel, Beer-Lambert absorption over an estimated path, and
crest-linked foam. Screen-space refraction is *not* implemented — there is no
scene-colour texture bound, so the body term is absorption over an authored
bottom colour, and the light on the water at night is an authored pool of
illumination rather than a reflection.

## Tests

```
npm install        # playwright, for the headless run only
npm test           # 15 checks: build, dossiers, cutaway, night, sea trial, walking, filming
npm run test:shots # same, plus screenshots into dist/
```

The smoke test fails on any console error or unhandled rejection, so a broken
frame loop shows up without opening a browser.

## Notes on accuracy

The geometry is a readable likeness, not a fair-form hull: station spacing,
deck heights and neighbourhood positions are set to match photographs and the
published general arrangement, but this is a game, not a lines plan. Where a
published figure is uncertain — pod output, tank capacity, boat count — the
dossier describes the system instead of inventing a number.

## On load

She arrives finished, in daylight. **Build from scratch** in the console (or
<kbd>Space</kbd>) resets to bare keel and runs the 24-block erection; the
progress slider scrubs it by hand. Night is a toggle, not the default.

## The reel

`src/reel.js` holds a ten-cut vertical sequence timed to a Hinglish voice-over,
with the Titanic built alongside for the scale shot. Press <kbd>P</kbd>, or use
the console: **Play the cut** previews it, **Record** sets 9:16, hides the
console and writes the .webm.

Retiming to a voice track: each scene's `dur` is its seconds on screen, and the
console lists the start time of every cut. Change a `dur` and everything after
it shifts; the pace slider stretches the whole sequence at once.

Composition note — a 9:16 frame at this standoff is about 307 m wide and 546 m
tall, so a 365 m ship does not fit across it. The closing shot puts her on the
diagonal, where the frame is longest.

Captions are sized and positioned against the rendered frame, not the browser
window: `onResize` publishes the canvas rectangle as `--frame-w/h/x/y` and the
overlays lay themselves out inside it. Using `vw` here would push text outside
the 9:16 box that actually gets exported.

`node reelshots.mjs [n...]` renders one frame from the middle of each cut as a
contact sheet.

## Rendering the reel to a file

The browser's own recorder is no use in a container with no GPU: the page draws
at a couple of frames a second, so a real-time capture would be a slideshow.
`render.mjs` instead addresses every frame by time — `IconApp.renderFrameAt(t)`
draws a frame that depends on nothing but `t`, including the caption animation,
the sea, the crowd and the ship's trim — saves each one, and assembles them
afterwards. The render takes as long as it takes; the film still runs at 30 fps.

```
node render.mjs                       # whole cut, 720x1280 upscaled to 1080x1920
node render.mjs --frames 24           # a short test
node render.mjs --shards 3 --shard 0 --no-mux   # one worker of a split render
node render.mjs --mux-only            # assemble frames already on disk
```

Sharding across browsers turned out not to help here — the software rasteriser
already uses every core, so three workers deliver the same 0.38 fps as one.

Timing comes from the voice track in `audio/`, via `align.mjs`. No speech recogniser is
reachable from a sandboxed container, so `align.mjs` does the next best thing:
it finds every run of speech with `silencedetect`, then splits those runs into
one group per script line — choosing the split that best matches each line's
syllable count, subject to a floor on scene length. Every cut is therefore
forced into a real pause and can never land mid-word.

That fixes cuts landing mid-word. It cannot verify that the right *scene* sits
on the right *line*, which needs someone who can hear the recording. The
durations in `src/reel.js` are plain numbers — replace them with measured ones
and re-render.
