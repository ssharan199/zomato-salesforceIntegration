# Icon of the Seas — Assembly Console

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
npm test           # 14 checks: build, dossiers, cutaway, night, sea trial, walking, filming
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
