// A finished, full-quality still of the whole Buddhabrot: traced on every core for as long as you give it,
// coloured the way the page colours it, saved as a PNG.
//
//   node tools/buddha-poster.mjs [--stage buddha] [--size 7680x4320] [--minutes 60] [--out posters]
//
// Needs Node 20+ and Python 3 with Pillow. The page's palettes and colouring are copied here (PALETTES, paint,
// finish in index.html); keep them in step if those change. Uniform sampling, so the density is exact, not
// estimated: the longer it runs, the smoother the faint outer glow becomes.
import { Worker } from "node:worker_threads";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg("size", "7680x4320").split("x").map(Number);
const MINUTES = +arg("minutes", 60), STAGE = arg("stage", "buddha"), OUTDIR = path.resolve(root, arg("out", "posters"));
const THREADS = Math.max(1, +arg("threads", cpus().length));
const sets = JSON.parse(readFileSync(path.join(root, "data/sets.json"), "utf8")).sets;
const S = sets.find((s) => s.id === "buddha").stages.find((s) => s.id === STAGE);
if (!S) throw new Error("no Buddhabrot stage " + STAGE);
const span = S.span * 1.08, pix = span / H;     // the stage's view, with a little room

// the page's palettes (index.html, PALETTES) and how it paints the Buddhabrot (FS_BUDDHA paint, GLSL_PAL finish)
const PALETTES = {
  prism: [[.5,.5,.5],[.5,.5,.5],[1,1,1],[0,.33,.67]], nebula: [[.5,.35,.6],[.5,.4,.45],[1,1,1],[.85,.6,.25]],
  candy: [[.7,.45,.7],[.3,.45,.3],[1,1,1],[0,.5,.7]], ultraviolet: [[.55,.35,.65],[.45,.35,.4],[1,1,1],[.78,.95,.12]],
  coral: [[.75,.45,.5],[.35,.35,.4],[1,1,1],[0,.2,.4]], ice: [[.3,.45,.7],[.4,.45,.35],[1,1,.8],[.6,.7,.8]],
  aurora: [[.3,.6,.5],[.4,.45,.45],[1,.8,1],[.55,.25,.85]],
};
const P = PALETTES[S.palette] || PALETTES.prism;
const pal = (x) => [0, 1, 2].map((i) => P[0][i] + P[1][i] * Math.cos(6.2831853 * (P[2][i] * x + P[3][i])));

const t0 = Date.now();
console.log(`${STAGE}: ${W}x${H}, ${MINUTES} min on ${THREADS} threads`);
const parts = await Promise.all(Array.from({ length: THREADS }, (_, n) => new Promise((res, rej) => {
  const params = { w: W, h: H, re: S.re, im: S.im, pix, rot: (S.turn * Math.PI) / 180, limits: S.limits, minK: 12, mh: false, f32: true, seed: 9001 + n * 104729 };
  const wk = new Worker(new URL("./buddha-worker.mjs", import.meta.url), { workerData: { params, seconds: MINUTES * 60 } });
  wk.on("message", res); wk.on("error", rej);
})));
const d = new Float32Array(W * H * 3); let samples = 0;
for (const p of parts) { const h = new Float32Array(p.hist.buffer); for (let i = 0; i < d.length; i++) d[i] += h[i]; samples += p.samples; }
console.log(`${(samples / 1e9).toFixed(1)} billion samples in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// exposure as the page sets it at rest: from the 3rd to the 99.95th percentile of each colour
const lo = [], hi = [];
for (let c = 0; c < 3; c++) {
  const v = []; for (let i = c; i < d.length; i += 3 * 37) v.push(d[i]);
  v.sort((a, b) => a - b); lo.push(v[Math.floor(v.length * 0.03)]); hi.push(v[Math.floor(v.length * 0.9995)]);
}
const c0 = pal(0), c1 = pal(0.33), c2 = pal(0.66), out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3, v = [0, 1, 2].map((c) => Math.min(1.2, Math.pow(Math.max(d[i + c] - lo[c], 0) / Math.max(hi[c] - lo[c], 1e-30), 0.6)));
  const g = Math.pow(v[0] * v[1] * v[2], 1.5) * S.glow * 0.6;
  let col = [0, 1, 2].map((k) => (v[0] * c0[k] + v[1] * c1[k] * 0.9 + v[2] * c2[k] * 0.8 + g) * 0.8 + [0.008, 0.004, 0.02][k]);
  const lum = col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114, qx = x / W - 0.5, qy = y / H - 0.5, vig = 1 - 0.55 * (qx * qx + qy * qy);
  col = col.map((k) => Math.pow(Math.max(0, (lum + (k - lum) * 1.4) * vig), 0.92));
  // the page's y runs up, an image's rows run down
  const o = ((H - 1 - y) * W + x) * 3;
  out[o] = Math.min(255, Math.round(col[0] * 255)); out[o + 1] = Math.min(255, Math.round(col[1] * 255)); out[o + 2] = Math.min(255, Math.round(col[2] * 255));
}
mkdirSync(OUTDIR, { recursive: true });
const raw = path.join(OUTDIR, `.${STAGE}.rgb`), png = path.join(OUTDIR, `psychedelic-buddhabrot-${STAGE}-${W}x${H}.png`);
writeFileSync(raw, out);
execFileSync("python3", ["-c", `import sys;from PIL import Image;Image.frombytes("RGB",(${W},${H}),open(sys.argv[1],"rb").read()).save(sys.argv[2])`, raw, png]);
rmSync(raw);
console.log("poster:", png);
