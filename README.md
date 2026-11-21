# Psychedelic Mandelbrot

A psychedelic deep-zoom journey through five fractals, painted in flowing neon palettes, with a soundtrack whose endless rising tone climbs for as long as you dive. A sibling of [The Unfolding](https://github.com/honey-badger-labs/the-unfolding), built the same way.

| Set | What you see | Stages |
| --- | --- | --- |
| **Mandelbrot** | Seahorse and Elephant valleys, tendrils, the antenna, down to a copy of the set at nearly 4 trillion × | 8 |
| **Julia** | One formula, five constants: the rabbit, a golden whirlpool, lightning, spirals, near-dust. The shape melts from one to the next | 5 |
| **Burning Ship** | The Mandelbrot formula with a fold: hulls, masts and a Gothic cathedral of rigging | 4 |
| **Mandelbulb** | A 3D cousin, ray-marched and lit, its power melting from 8 to 4 | 3 |
| **Buddhabrot** | The paths of escaping points, traced live; the picture develops like a photograph | 2 |

## Run it

```sh
npm run serve        # then open http://localhost:8000
npm test             # checks the map's arithmetic
```

Pick a set at the top right. Jump straight there with a hash: `#julia`, `#ship-cathedral`, `#seahorse` (a Mandelbrot stage).

Keys: Space plays and pauses, M sound, **T no text** (only the picture; the controls fade until you move the pointer), **R record**, arrows step. The journey loops.

## Recording

- **Rec button (quick, real time).** Records the canvas, with sound if Sound is on, to an MP4 or WebM as fast as your GPU draws. Text is never in it. Save asks for confirmation inside claude.ai and downloads directly anywhere else.
- **`tools/film.mjs` (perfect, frame by frame).** Replaces the page's clock, renders every frame however slowly, renders the soundtrack offline from the same timeline, and joins them with ffmpeg. With or without text (`--clean`), any size (`--width 1080 --height 1920` for vertical clips), any part (`--from 2 --to 3`). Run it locally (notes at the top of the file) or from **Actions → Film → Run workflow**; the MP4 appears under the run's Artifacts. Software rendering is slow: a one-stage clip at 1080p takes from minutes (Julia, Ship) to hours (deep Mandelbrot, Mandelbulb). `--scale 0.5` is four times quicker.

Debug parameters: `?set=ship&at=2.5` opens at a journey position, `&re=…&im=…&span=…` overrides that stage's view (for finding new places), `?scale=1` fixes the resolution, `?still` freezes the colour flow, `?clean` hides the text, `?autoplay` starts playing.

## How it is built

- **`index.html`** is the whole renderer: WebGL2, no build step, no dependencies.
  - **Escape-time sets** (Mandelbrot, Julia, Burning Ship) use two passes. *Iterate*: float32 runs out of digits at about 10⁵ magnification, so the page uses *perturbation*: JS computes one reference orbit at the centre in double precision, and each pixel iterates only its tiny offset from it. When a pixel's orbit comes closer to the reference's start than its own offset, it *rebases*, which removes the classic glitches. The Burning Ship's fold is perturbed with "diffabs". This reaches about 10¹³. *Colour*: cosine palettes, a slowly circling light, neon glow on the filaments; cheap, so colours flow while the view rests.
  - **Mandelbulb**: ray-marched with its distance estimate, ambient occlusion and a rim light, coloured by an orbit trap.
  - **Buddhabrot**: a Web Worker traces random escaping orbits and counts the pixels they cross, at three iteration limits; the shader paints the three counts in three palette colours.
  - **Motion**: zooms move at a steady speed in log-scale, easing in and out over a few seconds, so a dive feels like constant flight. Auto resolution only changes while the view rests, never mid-dive.
- **`audio.js`**: one live-generated voice per stage, crossfaded, over a Shepard-Risset glissando driven by the zoom speed.
- **`data/sets.json`** is the map: each set, and for each stage its place, depth, rotation, iteration limit, palette, voice and text.
- **`data/sources.json`** says which check backs each claim. There are no outside sources: see [docs/maths-policy.md](docs/maths-policy.md).
- **`tools/locate.mjs`** finds a copy of the set near any point (Mandelbrot or `--ship`): its true period, exact centre and size.
- **`tests/stages.test.mjs`** fails the build if a stage is incomplete or any claim is false.

## Adding a stage

1. Find a spot by eye with `?set=…&at=…&re=…&im=…&span=…`, then `node tools/locate.mjs <re> <im>` to snap to the copy there.
2. Add a record to `data/sets.json`.
3. Run `npm test`, then look at it.

## Licence

The code (`index.html`, `audio.js`, `tests/`, `tools/`, `.github/`, `package.json`) is [MIT](LICENSE). The content (the map text, the choice of route, docs, the name) is all rights reserved; see [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
