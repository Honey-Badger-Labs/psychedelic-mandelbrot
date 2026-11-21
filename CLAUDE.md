# Working on Psychedelic Mandelbrot

- Owner: Jakes. He gives taste notes; Claude does the build. Keep replies short: what changed, how to check it, what you need from him.
- No build step and no dependencies. `index.html` must keep working when opened from any static host.
- Sets, places and text live in `data/sets.json`, never hard-coded in the page. Run `npm test` before every commit.
- Follow `docs/maths-policy.md`: every claim is checked by a test or visible on screen; colours are labelled artistic choices.
- Rendering is perturbation with rebasing: the reference orbit is computed in JS doubles (`referenceOrbit`) and read by the shader from a float texture (`uRef`, 4096 texels per row). Keep stage `iter` ≤ `REF_MAX` and stage spans above ~1e-13 or the picture breaks up.
- Escape-time pass 1 (`FS_ITER`, one source with `MANDEL`/`JULIA`/`SHIP` defines) runs only when the camera moves; pass 2 (`FS_COL`) runs every frame. Keep animation that does not change the geometry in pass 2. The Mandelbulb (`FS_BULB`) draws every frame; the Buddhabrot is traced by `buddhaTracer` (in a worker, or on the page with `?film`).
- Motion: `glide()` gives steady log-scale speed with eased ends. Do not change render resolution mid-move (`adaptResolution`); it shows as a jump.
- Recording: the Rec button (MediaRecorder, real time, canvas only) and `tools/film.mjs` (virtual clock, frame by frame, with text unless `--clean`). The `Film` workflow runs the latter.
- New copies: `node tools/locate.mjs <re> <im>`; the test checks the true period (it divides the one the atom-domain search reports).
- To look at a stage, serve the folder (`npm run serve`) and screenshot `?set=<id>&at=<T>&scale=1&still` in headless Chrome with SwiftShader; `file://` cannot load the map.
- Also published as a claude.ai artifact (https://claude.ai/artifact/2995zK43Qkazd4zdbMe5hS). Republish `index.html` with `audio.js`, `data/*.json`, `tests/stages.test.mjs` and `tools/film-audio.html` together. It is private (owner only).
