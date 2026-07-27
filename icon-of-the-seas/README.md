# Icon of the Seas — Assembly Console

An interactive 3D design-and-assembly game for Royal Caribbean's *Icon of the Seas*:
build her keel-up in 24 blocks, pull the whole ship apart, cut away the starboard
shell to look inside, then take her out on a sea trial.

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
src/ship.js       hull loft, the 24 blocks, dossier copy
src/app.js        renderer, sea, camera rig, build timeline, sea trial
vendor/three.min.js
build.mjs         inlines the above into dist/
smoke.mjs         headless checks — drives the console and fails on any runtime error
```

## Tests

```
npm install        # playwright, for the headless run only
npm test           # 8 checks: build scrub, tags, dossiers, cutaway, night, sea trial
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
