# Psychedelic Mandelbrot

A psychedelic deep-zoom journey through five fractals, painted in flowing neon palettes, with a soundtrack whose endless rising tone climbs for as long as you dive. A sibling of [The Unfolding](https://github.com/honey-badger-labs/the-unfolding), built the same way.

| Set | What you see | Stages |
| --- | --- | --- |
| **Mandelbrot** | Seahorse and Elephant valleys, tendrils, the antenna, down to a copy of the set at nearly 4 trillion × | 8 |
| **Julia** | One formula, five constants: the rabbit, a golden whirlpool, lightning, spirals, near-dust. The shape melts from one to the next | 5 |
| **Burning Ship** | The Mandelbrot formula with a fold: hulls, masts and a Gothic cathedral of rigging | 4 |
| **Mandelbulb** | A 3D cousin, ray-marched and lit, its power melting from 8 to 4 | 3 |
| **Buddhabrot** | The paths of escaping points, traced live; it develops like a photograph, then zooms into the heart and the crown | 4 |

## Run it

```sh
npm run serve        # then open http://localhost:8000
npm test             # checks the map's arithmetic
```

**All** (the default) tours every fractal in turn: each journey ends by pulling back to its overview, which dissolves into the next fractal's. Pick one fractal at the top right to loop just that one. Jump straight there with a hash: `#all`, `#julia`, `#ship-cathedral`, `#seahorse` (a Mandelbrot stage).

Keys: Space plays and pauses, M sound, **T no text** (only the picture; the controls fade until you move the pointer), **R record**, arrows step. The journey loops.

## Recording

**Rec (the way to make the films).** On a computer with a graphics card (any recent Mac), the page draws in real time, so it can film itself:

1. Choose **All** for the whole tour, or one fractal for its journey alone. Leave it stopped.
2. Press **Rec** (or R). It goes back to the start, turns the sound on, plays the journey once, and stops by itself back on the overview, with the sound faded out.
3. Press **Save video**.

Films are 1920 × 1080 (1080 × 1920 if the window is taller than it is wide, or with `?vertical`), whatever the window size, with each stage's title, place and note fading in and out as on the page. Press **Text** first for a film with no words at all. Pressing Rec while a journey is already playing records from that moment until you press Stop. The whole tour is about 15 minutes; Mandelbrot alone about 6.

**`tools/film.mjs` (frame by frame, in software).** Replaces the page's clock and renders every frame however slowly, with the soundtrack rendered offline from the same timeline. Without a graphics card that is slow: a deep full-HD Mandelbrot frame takes over 30 seconds, so the GitHub **Film** workflow suits short clips (one stage with `from`/`to`, lower `scale`, smaller sizes), not whole journeys. `--strips 4` computes each deep view over four frames, about four times quicker. `--set all` films the tour, and `tools/join.mjs` joins separate films with the tour's dissolves.

Debug parameters: `?set=ship&at=2.5` opens at a journey position, `&re=…&im=…&span=…` overrides that stage's view (for finding new places), `?scale=1` fixes the resolution, `?still` freezes the colour flow, `?clean` hides the text, `?autoplay` starts playing.

## How it is built

- **`index.html`** is the whole renderer: WebGL2, no build step, no dependencies.
  - **Escape-time sets** (Mandelbrot, Julia, Burning Ship) use two passes. *Iterate*: float32 runs out of digits at about 10⁵ magnification, so the page uses *perturbation*: JS computes one reference orbit at the centre in double precision, and each pixel iterates only its tiny offset from it. When a pixel's orbit comes closer to the reference's start than its own offset, it *rebases*, which removes the classic glitches. The Burning Ship's fold is perturbed with "diffabs". This reaches about 10¹³. *Colour*: cosine palettes, a slowly circling light, neon glow on the filaments; cheap, so colours flow while the view rests.
  - **Mandelbulb**: ray-marched with its distance estimate, ambient occlusion and a rim light, coloured by an orbit trap.
  - **Buddhabrot**: a Web Worker traces random escaping orbits and counts the pixels they cross, at three iteration limits; the shader paints the three counts in three palette colours.
  - **Motion**: zooms move at a steady speed in log-scale, easing in and out over a few seconds. A deep view can take a GPU longer than one frame to compute, so it is computed a strip at a time for where the camera *will* be, while every frame shows the last finished view moved, scaled and turned to where the camera *is*. The picture moves at the screen's full frame rate however heavy the maths. Auto resolution only changes while the view rests.
  - **Buddhabrot zoom**: the old exposure is carried along and fades while the next view develops underneath; small windows retry paths that crossed them, so they fill in seconds.
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

The code (`index.html`, `audio.js`, `tests/`, `tools/`, `.github/`, `package.json`) is free for noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE); commercial use needs a licence from the copyright holder (open an issue to ask). The content (the map text, the choice of route, docs, the name) is all rights reserved; see [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
