// Finds a minibrot (a small copy of the whole set) near a point, in double precision.
// Usage: node tools/locate.mjs [--ship] <re> <im> [maxIter]
// Prints the period found from the point's orbit, the centre ("nucleus") Newton's method converges to,
// and an estimate of the copy's size (Mandelbrot only). Paste the result into data/sets.json.
// --ship uses the Burning Ship, z -> (|Re z| + i|Im z|)^2 + c, which needs a 2x2 Jacobian instead of
// a complex derivative.

// one step of each formula, with its Jacobian with respect to c carried along (J = [[a, b], [c, d]] as dx/dre, dx/dim, dy/dre, dy/dim)
export const FORMULAS = {
  mandelbrot(x, y, J, re, im) {
    const nx = x * x - y * y + re, ny = 2 * x * y + im;
    const j = [2 * (x * J[0] - y * J[2]) + 1, 2 * (x * J[1] - y * J[3]), 2 * (y * J[0] + x * J[2]), 2 * (y * J[1] + x * J[3]) + 1];
    return [nx, ny, j];
  },
  ship(x, y, J, re, im) {
    const a = Math.abs(x), b = Math.abs(y), sx = x < 0 ? -1 : 1, sy = y < 0 ? -1 : 1;
    const nx = a * a - b * b + re, ny = 2 * a * b + im;
    // f = (a^2 - b^2, 2ab): df/dx = (2a sx, 2b sx), df/dy = (-2b sy, 2a sy)
    const f = [2 * a * sx, -2 * b * sy, 2 * b * sx, 2 * a * sy];
    const j = [f[0] * J[0] + f[1] * J[2] + 1, f[0] * J[1] + f[1] * J[3], f[2] * J[0] + f[3] * J[2], f[2] * J[1] + f[3] * J[3] + 1];
    return [nx, ny, j];
  },
};

export function orbit(re, im, n, formula = "mandelbrot") {
  const step = FORMULAS[formula]; let x = 0, y = 0, J = [0, 0, 0, 0]; const out = [[0, 0]];
  for (let k = 0; k < n; k++) { [x, y, J] = step(x, y, J, re, im); out.push([x, y]); if (x * x + y * y > 1e10) break; }
  return out;
}
export function period(re, im, maxIter = 100000, formula = "mandelbrot") {
  // the last iteration that brought z closer to 0 than ever before, before the orbit escapes,
  // is the period of the most prominent copy nearby ("atom domain")
  const step = FORMULAS[formula]; let x = 0, y = 0, J = [0, 0, 0, 0], best = Infinity, p = 0;
  for (let n = 1; n <= maxIter; n++) {
    [x, y, J] = step(x, y, J, re, im);
    const r = x * x + y * y;
    if (r > 4) break;
    if (r < best) { best = r; p = n; }
  }
  return p;
}
export function nucleus(re, im, p, formula = "mandelbrot", steps = 64) {
  // Newton's method on z_p(c) = 0
  const step = FORMULAS[formula];
  for (let s = 0; s < steps; s++) {
    let x = 0, y = 0, J = [0, 0, 0, 0];
    for (let n = 0; n < p; n++) [x, y, J] = step(x, y, J, re, im);
    const det = J[0] * J[3] - J[1] * J[2]; if (!(Math.abs(det) > 0)) break;
    const dr = (J[3] * x - J[1] * y) / det, di = (-J[2] * x + J[0] * y) / det;
    re -= dr; im -= di;
    if (Math.hypot(dr, di) < 1e-18 + 1e-16 * Math.hypot(re, im)) break;
  }
  return [re, im];
}
// the true period: Newton can land on a copy whose period divides the one the search found
export function truePeriod(re, im, p, formula = "mandelbrot") {
  const o = orbit(re, im, p, formula);
  for (let k = 1; k <= p; k++) if (p % k === 0 && Math.hypot(...o[k]) < 1e-9) return k;
  return p;
}
export function size(re, im, p) {
  // size estimate of the Mandelbrot copy with this nucleus and period
  let x = 0, y = 0, lr = 1, li = 0, br = 1, bi = 0;
  for (let n = 1; n < p; n++) {
    const t = x * x - y * y + re; y = 2 * x * y + im; x = t;
    const nlr = 2 * (x * lr - y * li), nli = 2 * (x * li + y * lr); lr = nlr; li = nli;
    const d = lr * lr + li * li; br += lr / d; bi -= li / d;
  }
  const l2r = lr * lr - li * li, l2i = 2 * lr * li;
  const dr = br * l2r - bi * l2i, di = br * l2i + bi * l2r;
  return 1 / Math.hypot(dr, di);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), formula = args[0] === "--ship" ? (args.shift(), "ship") : "mandelbrot";
  const re = Number(args[0]), im = Number(args[1]), it = Number(args[2] || 100000);
  const p0 = period(re, im, it, formula);
  const [nr, ni] = nucleus(re, im, p0, formula);
  const p = truePeriod(nr, ni, p0, formula);
  const res = { formula, period: p, re: nr, im: ni, moved: Math.hypot(nr - re, ni - im), returns: Math.hypot(...orbit(nr, ni, p, formula)[p]) };
  if (formula === "mandelbrot") res.size = size(nr, ni, p);
  console.log(JSON.stringify(res));
}
