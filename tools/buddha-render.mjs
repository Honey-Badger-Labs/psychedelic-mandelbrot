// Traces the Buddhabrot in advance, as a stack of images the page zooms and pans through (data/buddha/).
//
//   node tools/buddha-render.mjs [--whole 60 --zoom 90 --between 45]   (seconds of tracing per image, all cores)
//   node tools/buddha-render.mjs --quick                                (a few seconds each, to try the pipeline)
//   node tools/buddha-render.mjs --4k                                   (images twice the size, for 4K films, into
//                                                                        data/buddha-4k/: not committed, too big)
//
// Needs Node 20+ and Python 3 with Pillow (it writes the JPEGs). The Buddhabrot never changes, so tracing it live
// on the viewer's machine (as the page once did) only cost time, grain and processor cores the sound needed.
//
// Which images: one per stage, framed like the screen at rest, plus images between stages wherever a move would
// otherwise stretch the nearest image more than MAX_STRETCH times (long zooms) or leave the screen uncovered (pans).
// The camera path is the page's own (camAt in index.html, Buddhabrot branch); keep the two in step.
//
// What is stored: per cell and per colour, the density of paths (paths crossing per unit area per path drawn),
// as its logarithm in 8 bits, so every image shares one brightness scale and they blend without seams. Images of
// small windows are traced with Metropolis-Hastings, whose result is in arbitrary units: each is scaled to match
// the larger image around it. Colours, palettes and exposure stay live in the page.
import { Worker } from "node:worker_threads";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOX } from "./buddha-trace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const QUICK = process.argv.includes("--quick");
const SECS = { whole: +arg("whole", QUICK ? 3 : 60), zoom: +arg("zoom", QUICK ? 4 : 90), between: +arg("between", QUICK ? 3 : 45) };
const THREADS = Math.max(1, +arg("threads", cpus().length));
// --4k: every image twice as wide and high, chosen for a 2160-line screen, kept out of the repository
const K4 = process.argv.includes("--4k");
const OUT = path.join(root, K4 ? "data/buddha-4k" : "data/buddha");

const ASPECT = 16 / 9;
const FRAME = 1.7;            // an image is this many times the height of the view it is for
const EDGE = 0.12;            // the page fades each image out over this fraction of its size at every edge
const MAX_STRETCH = +arg("stretch", 2);   // in motion, an image may be shown up to this much larger than its own pixels
const SIZES = { stage: K4 ? [6144, 3456] : [3072, 1728], between: (arg("between-size", K4 ? "5120x2880" : "2560x1440")).split("x").map(Number) };
const SCREEN = K4 ? 2160 : 1080;   // the screen height the sizes are chosen for

const sets = JSON.parse(readFileSync(path.join(root, "data/sets.json"), "utf8")).sets;
const stages = sets.find((s) => s.id === "buddha").stages.slice().sort((a, b) => a.stage - b.stage);
const groupOf = (lim) => lim.join("/");

// ---------- the camera path: the page's own (index.html, camAt, Buddhabrot branch)
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
function camera(A, B, e) {
  const sp = Math.exp(lerp(Math.log(A.span), Math.log(B.span), e));
  const w = Math.abs(A.span - B.span) > 1e-9 ? (A.span - sp) / (A.span - B.span) : e;
  return { re: lerp(A.re, B.re, w), im: lerp(A.im, B.im, w), span: sp, rot: lerpAngle(A.turn, B.turn, e), group: groupOf(e < 0.5 ? A.limits : B.limits) };
}

// ---------- which images are needed
function makeLayer(kind, cam, hc, limits, stage) {
  const [w, h] = SIZES[kind];
  return { kind, re: cam.re, im: cam.im, rot: cam.rot, hc, w, h, pix: hc / h, limits, group: groupOf(limits), stage, mh: cam.span < 2.4 };
}
// the screen's view, in an image's cells: centre and half sizes
function viewIn(layer, cam) {
  const r = (layer.rot * Math.PI) / 180, dx = cam.re - layer.re, dy = cam.im - layer.im;
  return { u: (dx * Math.cos(r) + dy * Math.sin(r)) / layer.pix, v: (-dx * Math.sin(r) + dy * Math.cos(r)) / layer.pix,
    hu: (cam.span * ASPECT) / 2 / layer.pix, hv: cam.span / 2 / layer.pix };
}
function covers(layer, cam, stretch) {
  if (layer.group !== cam.group || Math.abs(layer.rot - cam.rot) > 0.5) return false;
  if (layer.pix > (stretch * cam.span) / SCREEN) return false;               // too coarse for this view
  const v = viewIn(layer, cam), mu = layer.w * (0.5 - EDGE), mv = layer.h * (0.5 - EDGE);
  return Math.abs(v.u) + v.hu <= mu && Math.abs(v.v) + v.hv <= mv;
}
const layers = [];
for (const s of stages) {
  const cam = { re: s.re, im: s.im, span: s.span, rot: s.turn, group: groupOf(s.limits) };
  layers.push(makeLayer("stage", cam, s.span * FRAME, s.limits, s.id));
}
// walk every move; where no image covers the view, add one sized to cover as much of the move ahead as it can
const STEP = 0.002;
for (let k = 0; k < stages.length; k++) {
  const A = stages[k], B = stages[(k + 1) % stages.length];
  for (let e = 0; e <= 1 + 1e-9; e += STEP) {
    const cam = camera(A, B, Math.min(1, e));
    if (layers.some((l) => covers(l, cam, MAX_STRETCH))) continue;
    // grow the stretch of the move this image serves while one image can still cover it sharply enough
    let best = null;
    for (let e1 = e; e1 <= 1 + 1e-9; e1 += STEP) {
      const cams = []; for (let t = e; t <= e1 + 1e-9; t += STEP) cams.push(camera(A, B, Math.min(1, t)));
      if (cams.some((c) => c.group !== cam.group)) break;
      // a window around all of them (the rotation is the same through every move here)
      const r = (cam.rot * Math.PI) / 180, U = (c) => c.re * Math.cos(r) + c.im * Math.sin(r), V = (c) => -c.re * Math.sin(r) + c.im * Math.cos(r);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, minSpan = Infinity;
      for (const c of cams) {
        u0 = Math.min(u0, U(c) - (c.span * ASPECT) / 2); u1 = Math.max(u1, U(c) + (c.span * ASPECT) / 2);
        v0 = Math.min(v0, V(c) - c.span / 2); v1 = Math.max(v1, V(c) + c.span / 2); minSpan = Math.min(minSpan, c.span);
      }
      const hc = Math.max((v1 - v0) / (1 - 2 * EDGE), (u1 - u0) / (1 - 2 * EDGE) / ASPECT) * 1.02;
      if (hc / SIZES.between[1] > (MAX_STRETCH * minSpan) / SCREEN && e1 > e) break;
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { re: cu * Math.cos(r) - cv * Math.sin(r), im: cu * Math.sin(r) + cv * Math.cos(r), span: minSpan, rot: cam.rot, group: cam.group, hc };
    }
    const lim = (e < 0.5 ? A : B).limits;
    layers.push(makeLayer("between", best, best.hc, lim, null));
  }
}

if (process.argv.includes("--plan")) {
  for (const l of layers) console.log(l.kind, l.stage || "", l.w + "x" + l.h, "span", (l.hc / FRAME).toPrecision(3), "at", l.re.toFixed(4), l.group);
  console.log(layers.length, "images");
  process.exit(0);
}
// ---------- tracing, on every core
function trace(layer, seconds, seed) {
  // big images count in 32 bits per thread (exact to 16 million per cell), or a dozen threads would want 6 GB
  const params = { w: layer.w, h: layer.h, re: layer.re, im: layer.im, pix: layer.pix, rot: (layer.rot * Math.PI) / 180, limits: layer.limits, minK: 12, mh: layer.mh, f32: layer.w * layer.h > 8e6 };
  return Promise.all(Array.from({ length: THREADS }, (_, n) => new Promise((res, rej) => {
    const wk = new Worker(new URL("./buddha-worker.mjs", import.meta.url), { workerData: { params: { ...params, seed: seed * 7919 + n * 104729 + 1 }, seconds } });
    wk.on("message", res); wk.on("error", rej);
  }))).then((parts) => {
    const sum = new Float64Array(layer.w * layer.h * 3); let samples = 0;
    for (const p of parts) { const h = p.hist; for (let i = 0; i < sum.length; i++) sum[i] += h[i]; samples += p.samples; }
    return { hist: sum, samples };
  });
}
const percentile = (arr, q) => { const a = Float64Array.from(arr).sort(); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0; };

// a reduced copy of each finished image's densities, for scaling the finer images inside it
const CAL = 4;
function reduced(layer, d) {
  const w = Math.floor(layer.w / CAL), h = Math.floor(layer.h / CAL), out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let j = 0; j < CAL; j++) for (let i = 0; i < CAL; i++) s += d[((y * CAL + j) * layer.w + x * CAL + i) * 3 + c];
    out[(y * w + x) * 3 + c] = s / (CAL * CAL);
  }
  return { w, h, d: out, pix: layer.pix * CAL, re: layer.re, im: layer.im, rot: layer.rot, group: layer.group };
}
// where a point of the plane falls in a (reduced) image, or null
function at(img, re, im) {
  const r = (img.rot * Math.PI) / 180, dx = re - img.re, dy = im - img.im;
  const x = Math.floor(img.w / 2 + (dx * Math.cos(r) + dy * Math.sin(r)) / img.pix), y = Math.floor(img.h / 2 + (-dx * Math.sin(r) + dy * Math.cos(r)) / img.pix);
  return x < 0 || y < 0 || x >= img.w || y >= img.h ? null : (y * img.w + x) * 3;
}
const centreOf = (layer, x, y) => {
  const r = (layer.rot * Math.PI) / 180, u = (x + 0.5 - layer.w / 2) * layer.pix, v = (y + 0.5 - layer.h / 2) * layer.pix;
  return [layer.re + u * Math.cos(r) - v * Math.sin(r), layer.im + u * Math.sin(r) + v * Math.cos(r)];
};

mkdirSync(OUT, { recursive: true });
const tmp = path.join(tmpdir(), "buddha-render"); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
// coarse first, so every image has a finished larger one around it to be scaled against
const order = layers.map((l, i) => i).sort((a, b) => layers[b].pix - layers[a].pix);
const done = [], encoding = {}, stageInfo = {};
console.log(`${layers.length} images (${layers.filter((l) => l.kind === "stage").length} stages, ${layers.filter((l) => l.kind === "between").length} between), ${THREADS} threads`);
const t0 = Date.now();
for (const [n, li] of order.entries()) {
  const layer = layers[li], secs = layer.kind === "stage" ? (layer.mh ? SECS.zoom : SECS.whole) : SECS.between;
  const { hist, samples } = await trace(layer, secs, li + 1);
  const d = new Float32Array(hist.length);
  if (!layer.mh) {
    // uniform sampling: paths per unit area, per path drawn
    const f = (BOX.size * BOX.size) / (samples * layer.pix * layer.pix);
    for (let i = 0; i < d.length; i++) d[i] = hist[i] * f;
  } else {
    // Metropolis-Hastings: scale to the finished image around this one, channel by channel, on cells both see well
    const parent = done.filter((p) => p.group === layer.group && p.pix > layer.pix * 1.01 && at(p, layer.re, layer.im) !== null).sort((a, b) => a.pix - b.pix)[0];
    if (!parent) throw new Error("no larger image to scale image " + li + " against");
    const sums = new Float64Array(parent.w * parent.h * 3), cnt = new Float64Array(parent.w * parent.h);
    for (let y = 0; y < layer.h; y += 2) for (let x = 0; x < layer.w; x += 2) {
      const [re, im] = centreOf(layer, x, y), j = at(parent, re, im); if (j === null) continue;
      const i = (y * layer.w + x) * 3; sums[j] += hist[i]; sums[j + 1] += hist[i + 1]; sums[j + 2] += hist[i + 2]; cnt[j / 3]++;
    }
    for (let c = 0; c < 3; c++) {
      const ratios = [], pv = []; for (let j = 0; j < cnt.length; j++) if (cnt[j] > 3 && parent.d[j * 3 + c] > 0) pv.push(parent.d[j * 3 + c]);
      const floor = percentile(pv, 0.3);
      for (let j = 0; j < cnt.length; j++) {
        const pd = parent.d[j * 3 + c], cd = sums[j * 3 + c] / (cnt[j] || 1);
        if (cnt[j] > 3 && pd > floor && cd > 0) ratios.push(pd / cd);
      }
      const k = percentile(ratios, 0.5) || 0;
      for (let i = c; i < d.length; i += 3) d[i] = hist[i] * k;
    }
  }
  // one brightness scale per group of limits, set by its first (whole-figure) image: logarithm of density in 8 bits
  if (!encoding[layer.group]) {
    const lo = [], hi = [];
    for (let c = 0; c < 3; c++) {
      const pos = []; for (let i = c; i < d.length; i += 3 * 7) if (d[i] > 0) pos.push(d[i]);
      lo.push(Math.log(percentile(pos, 0.01)) - 2); hi.push(Math.log(percentile(pos, 1)) + 3);
    }
    encoding[layer.group] = { lmin: lo, lmax: hi };
  }
  const enc = encoding[layer.group], bytes = Buffer.alloc(layer.w * layer.h * 3);
  for (let i = 0; i < d.length; i++) {
    const c = i % 3; if (d[i] <= 0) continue;
    bytes[i] = Math.max(1, Math.min(255, Math.round((255 * (Math.log(d[i]) - enc.lmin[c])) / (enc.lmax[c] - enc.lmin[c]))));
  }
  const file = `layer-${String(li).padStart(2, "0")}.jpg`, raw = path.join(tmp, file + ".rgb");
  writeFileSync(raw, bytes);
  execFileSync("python3", ["-c", `import sys;from PIL import Image;Image.frombytes("RGB",(${layer.w},${layer.h}),open(sys.argv[1],"rb").read()).save(sys.argv[2],quality=90,subsampling=0)`, raw, path.join(OUT, file)]);
  rmSync(raw);
  layer.file = file; layer.samples = samples;
  // exposure for a stage: from the part of its image the screen shows at rest
  if (layer.kind === "stage") {
    const lo = [], hi = [], x0 = Math.floor(layer.w / 2 - layer.w / FRAME / 2), x1 = Math.ceil(layer.w / 2 + layer.w / FRAME / 2);
    const y0 = Math.floor(layer.h / 2 - layer.h / FRAME / 2), y1 = Math.ceil(layer.h / 2 + layer.h / FRAME / 2);
    for (let c = 0; c < 3; c++) {
      const v = []; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) v.push(d[(y * layer.w + x) * 3 + c]);
      lo.push(percentile(v, 0.03)); hi.push(percentile(v, 0.9995));
    }
    stageInfo[layer.stage] = { low: lo, high: hi, paths: samples };
  }
  done.push(reduced(layer, d));
  console.log(`${n + 1}/${layers.length} ${file} ${layer.kind}${layer.mh ? " (MH)" : ""} ${layer.w}x${layer.h} span ${(layer.hc / FRAME).toPrecision(3)}: ${(samples / 1e6).toFixed(0)}M paths, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
const manifest = {
  about: "The Buddhabrot, traced in advance by tools/buddha-render.mjs. Each image covers a window of the plane (centre re, im; rotation rot in degrees; window height hc, width hc * w / h) at w x h cells. Each colour channel holds ln(density) mapped from [lmin, lmax] of its group to 1..255 (0: no paths). Stage exposure (low, high) is in density units.",
  edge: EDGE, encoding,
  layers: layers.map((l) => ({ file: l.file, kind: l.kind, stage: l.stage, re: l.re, im: l.im, rot: l.rot, hc: l.hc, w: l.w, h: l.h, group: l.group, mh: l.mh, paths: l.samples })),
  stages: stageInfo,
};
writeFileSync(path.join(OUT, "layers.json"), JSON.stringify(manifest, null, 1));
console.log(`wrote ${layers.length} images and layers.json in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
