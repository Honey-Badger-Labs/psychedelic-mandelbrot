# The maths contract

The Mandelbrot set is arithmetic, so every claim this project makes can be checked by a test rather than cited from somewhere.

- **Exact**: follows from the definition by hand, and the test shows the working (the period-3 centre solves c³ + 2c² + c + 1 = 0).
- **Computed**: found and checked numerically in double precision (a copy's centre returns to 0 after exactly its stated period and no sooner; a stated magnification matches the view).
- **Artistic choice**: colours, palettes, glow, lighting, shadows, rotation, the route and the sound. The shapes are never altered; only how they are painted.

Rules:

1. Every stage note says only things `tests/stages.test.mjs` checks, or things you can see on screen at that stage.
2. No historical or biographical claims (who discovered what, and when) unless a source has actually been read and is added to `data/sources.json` with a link.
3. If a test finds a claim wrong, fix the claim, not the test. (It already caught one: the deepest copy was first recorded as period 232; its true period is 116.)
4. Names like "Seahorse Valley" and "Elephant Valley" are informal names for regions, not discoveries.
