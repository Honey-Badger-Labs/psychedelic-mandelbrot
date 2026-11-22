// The Buddhabrot tracer, for tools/buddha-render.mjs (one per worker thread).
// Counts, for every cell of a window in the complex plane, how many escaping paths cross it: red for paths up
// to limits[0] steps, green limits[1], blue limits[2]. Paths that escape in fewer than minK steps are skipped.
//
// Whole-figure windows: c is drawn uniformly from the sampling box, and every path counts once.
// Small windows: Metropolis-Hastings. Mostly try small changes of a path that crossed the window (now and then a
// fresh random one), accept with probability (cells crossed now / cells crossed before), and draw the current
// path with weight 1 / its cells crossed. The result is proportional to what uniform sampling would give, found
// far sooner; buddha-render.mjs scales it to match the window around it.

export const BOX = { re: -2.15, im: -1.6, size: 3.2 };

export function createTracer(p) {
  // p: w, h (cells), re, im (window centre), pix (complex units per cell), rot (radians), limits [r, g, b],
  //    minK, mh (Metropolis-Hastings?), seed
  let seed = p.seed >>> 0 || 1;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const L = Math.max(...p.limits), lim = p.limits, minK = p.minK || 12;
  const cos = Math.cos(p.rot), sin = Math.sin(p.rot), w = p.w, h = p.h;
  // posters are big: 32-bit counts there (exact to 16 million per cell), 64-bit otherwise
  const hist = p.f32 ? new Float32Array(w * h * 3) : new Float64Array(w * h * 3);
  const ox = new Float64Array(L + 1), oy = new Float64Array(L + 1);
  const mk = () => ({ idx: new Int32Array(2 * L + 2), n: 0, k: 0, cr: 0, ci: 0 });
  let cur = mk(), tmp = mk(), samples = 0;

  function cell(x, y) {
    const dx = x - p.re, dy = y - p.im, u = (dx * cos + dy * sin) / p.pix, v = (-dx * sin + dy * cos) / p.pix;
    const px = Math.floor(w / 2 + u), py = Math.floor(h / 2 + v);
    return px < 0 || py < 0 || px >= w || py >= h ? -1 : (py * w + px) * 3;
  }
  function add(i, k, wt) {
    if (k <= lim[0]) hist[i] += wt;
    if (k <= lim[1]) hist[i + 1] += wt;
    if (k <= lim[2]) hist[i + 2] += wt;
  }
  // follow 0 under z -> z^2 + c; the cells its escaping path and its mirror image (which c's conjugate traces)
  // cross go into `into`. Returns how many
  function trace(cr, ci, into) {
    into.n = 0;
    const q = (cr - 0.25) * (cr - 0.25) + ci * ci;
    if (q * (q + (cr - 0.25)) < 0.25 * ci * ci || (cr + 1) * (cr + 1) + ci * ci < 0.0625) return 0;
    let x = 0, y = 0, k = 0, esc = false;
    for (k = 1; k <= L; k++) { const t = x * x - y * y + cr; y = 2 * x * y + ci; x = t; ox[k] = x; oy[k] = y; if (x * x + y * y > 4) { esc = true; break; } }
    if (!esc || k < minK) return 0;
    for (let j = 2; j < k; j++) {
      const a = cell(ox[j], oy[j]); if (a >= 0) into.idx[into.n++] = a;
      const b = cell(ox[j], -oy[j]); if (b >= 0) into.idx[into.n++] = b;
    }
    into.k = k; into.cr = cr; into.ci = ci;
    return into.n;
  }
  function run(count) {
    for (let s = 0; s < count; s++) {
      samples++;
      if (!p.mh) {
        trace(BOX.re + rnd() * BOX.size, BOX.im + rnd() * BOX.size, tmp);
        for (let j = 0; j < tmp.n; j++) add(tmp.idx[j], tmp.k, 1);
        continue;
      }
      let cr, ci;
      if (!cur.n || rnd() < 0.12) { cr = BOX.re + rnd() * BOX.size; ci = BOX.im + rnd() * BOX.size; }
      else { const r = Math.pow(10, -7 + 5.5 * rnd()), a = rnd() * 6.2831853; cr = cur.cr + r * Math.cos(a); ci = cur.ci + r * Math.sin(a); }
      const n = trace(cr, ci, tmp);
      if (n > 0 && (!cur.n || rnd() * cur.n < n)) { const t = cur; cur = tmp; tmp = t; }
      if (cur.n) { const wt = 1 / cur.n; for (let m = 0; m < cur.n; m++) add(cur.idx[m], cur.k, wt); }
    }
  }
  return { run, hist, get samples() { return samples; } };
}
