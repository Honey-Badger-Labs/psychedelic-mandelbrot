// Finds a minibrot (a small copy of the whole set) near a point, in double precision.
// Usage: node tools/locate.mjs <re> <im> [maxIter]
// Prints the period found from the point's orbit, the nucleus Newton's method converges to,
// and an estimate of the copy's size. Paste the result into data/stages.json.
export function period(re, im, maxIter = 100000) {
  // the last iteration that brought z closer to 0 than ever before, before the orbit escapes,
  // is the period of the most prominent minibrot nearby ("atom domain")
  let x = 0, y = 0, best = Infinity, p = 0;
  for (let n = 1; n <= maxIter; n++) {
    const t = x * x - y * y + re; y = 2 * x * y + im; x = t;
    const r = x * x + y * y;
    if (r > 4) break;
    if (r < best) { best = r; p = n; }
  }
  return p;
}
export function nucleus(re, im, p, steps = 64) {
  // Newton's method on z_p(c) = 0
  for (let s = 0; s < steps; s++) {
    let x = 0, y = 0, dx = 0, dy = 0;
    for (let n = 0; n < p; n++) {
      const ndx = 2 * (x * dx - y * dy) + 1, ndy = 2 * (x * dy + y * dx);
      const t = x * x - y * y + re; y = 2 * x * y + im; x = t; dx = ndx; dy = ndy;
    }
    const d = dx * dx + dy * dy; if (!(d > 0)) break;
    const sr = (x * dx + y * dy) / d, si = (y * dx - x * dy) / d;
    re -= sr; im -= si;
    if (Math.hypot(sr, si) < 1e-18 + 1e-16 * Math.hypot(re, im)) break;
  }
  return [re, im];
}
export function size(re, im, p) {
  // size estimate of the minibrot with this nucleus and period
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
  const re = Number(process.argv[2]), im = Number(process.argv[3]), it = Number(process.argv[4] || 100000);
  let p = period(re, im, it);
  const [nr, ni] = nucleus(re, im, p);
  // Newton can land on a copy whose true period divides the one found: report the true one
  let x = 0, y = 0;
  for (let k = 1; k < p; k++) {
    const t = x * x - y * y + nr; y = 2 * x * y + ni; x = t;
    if (p % k === 0 && Math.hypot(x, y) < 1e-9) { p = k; break; }
  }
  console.log(JSON.stringify({ period: p, re: nr, im: ni, size: size(nr, ni, p), moved: Math.hypot(nr - re, ni - im) }));
}
