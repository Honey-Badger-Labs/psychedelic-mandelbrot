# Psychedelic Mandelbrot

A psychedelic deep-zoom journey through the Mandelbrot set. Eight places, from the whole set to a copy of it nearly four trillion times smaller, painted in flowing neon palettes, with a soundtrack whose endless rising tone climbs for as long as you dive. A sibling of [The Unfolding](https://github.com/honey-badger-labs/the-unfolding), built the same way.

## Run it

```sh
npm run serve        # then open http://localhost:8000
npm test             # checks the map's arithmetic
```

Jump to a stage with a hash: `#seahorse`, `#elephant`, `#deep`, or `#t150` for halfway between stages 1 and 2. Space plays and pauses, M turns sound on and off, the arrow keys step. The journey loops. The last button (Auto) cycles render resolution; Auto adapts to your GPU.

Debug parameters: `?at=6.5` opens at a journey position, `?scale=1` fixes the resolution, `?still` freezes the colour flow (for screenshots), `?autoplay` starts playing.

## How it is built

- **`index.html`** is the whole renderer: WebGL2, no build step, no dependencies. Two passes:
  1. **Iterate.** Plain float32 runs out of digits at about 10⁵ magnification, so the page uses *perturbation*: JS computes one reference orbit at the centre of the view in double precision, and each pixel iterates only its tiny offset from it in float32. When a pixel's orbit passes closer to 0 than its offset, it *rebases* onto the start of the reference, which removes the classic glitches. This reaches about 10¹³. The pass stores a smooth iteration count, a stripe average, a distance estimate and a surface normal per pixel.
  2. **Colour.** Cosine palettes, shading from a slowly circling light, neon glow on the filaments. This pass is cheap, so the colours keep flowing while the view rests.
- **`audio.js`**: one live-generated voice per stage (detuned pad, glass bells from its chord), crossfaded by the journey, over a Shepard-Risset glissando driven by the zoom speed.
- **`data/stages.json`** is the map: place, depth, rotation, iteration limit, palette, voice and text for each stage.
- **`data/sources.json`** says which check backs each claim. There are no outside sources: see [docs/maths-policy.md](docs/maths-policy.md).
- **`tools/locate.mjs`** finds a copy of the set near any point: its period, its exact centre (Newton's method) and an estimate of its size.
- **`tests/stages.test.mjs`** fails the build if a stage is incomplete or any claim in it is false: each copy's centre must return to 0 after exactly its stated period, magnifications must match, the period-3 centre must solve its cubic.

## Adding a stage

1. Find a spot by eye, then run `node tools/locate.mjs <re> <im>` to snap to the copy there.
2. Add a record to `data/stages.json` (span about 8 × the size estimate shows the copy nicely).
3. Run `npm test`, then look at it: `?at=<stage>&scale=1`.

## Licence

The code (`index.html`, `audio.js`, `tests/`, `tools/`, `.github/`, `package.json`) is [MIT](LICENSE). The content (the map text, the choice of route, docs, the name) is all rights reserved; see [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
