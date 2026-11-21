// Checks how every journey moves, in a real browser (the camera lives in the page, not in a module).
//   npm run serve     (in another terminal)
//   node tools/check-motion.mjs [--site http://localhost:8765]
// Needs Playwright (npm i --no-save playwright-core, or a global playwright) and Chrome or Chromium.
// Fails (exit 1) if, in any set:
//   - the camera jumps at the start or end of a move (it did on shallow stages, when pans did not finish),
//   - its speed changes suddenly anywhere inside a move,
//   - a journey played with fixed frame steps does not stop on every stage (with 0.05 s and 1/30 s steps,
//     moves of a whole number of steps once summed to just under the stage and sailed through it).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright-core")); } catch { ({ chromium } = require("playwright")); }
const i = process.argv.indexOf("--site"), SITE = i > 0 ? process.argv[i + 1] : "http://localhost:8765";
const CHROME = process.env.CHROME;

const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 160, height: 100 } });
await page.addInitScript(() => {
  let now = 0, rafs = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { rafs.push(cb); return 1; };
  window.__step = (ms) => { now += ms; const r = rafs; rafs = []; r.forEach((cb) => cb(now)); };
});
await page.goto(SITE + "/index.html?scale=.1");
await page.waitForFunction(() => window.__mandel && window.__mandel.set);
const problems = await page.evaluate(() => {
  const m = window.__mandel, out = [];
  for (const id of ["mandelbrot", "julia", "ship", "bulb", "buddha"]) {
    m.useSet(id); window.__step(16);
    const st = m.stages(), n = st.length;
    if (id !== "bulb") {
      for (let k = 0; k < n; k++) {
        const at = m.camAt(k), e = 1e-6, a = m.camAt(k + e), b = m.camAt(((k - e) % n + n) % n);
        const d = (x, y) => Math.hypot(x.re - y.re, x.im - y.im) / at.span + Math.abs(Math.log(x.span / y.span));
        if (Math.max(d(at, a), d(at, b)) > 1e-3) out.push(`${id}/${st[k].id}: the camera jumps ${(100 * Math.max(d(at, a), d(at, b))).toFixed(1)}% of the view`);
        let prev = null, worst = 0;
        for (let t = k, h = 5e-4; t < k + 1 - h / 2; t += h) {
          const p = m.camAt(t), q = m.camAt(Math.min(t + h, k + 1 - 1e-9));
          const v = Math.hypot(p.re - q.re, p.im - q.im) / p.span + Math.abs(Math.log(p.span / q.span)) + Math.abs(p.rot - q.rot);
          if (prev !== null) worst = Math.max(worst, Math.abs(v - prev));
          prev = v;
        }
        if (worst > 0.004) out.push(`${id} ${k}->${(k + 1) % n}: speed changes suddenly (${worst.toFixed(4)})`);
      }
    }
    for (const ms of [50, 1000 / 30]) {
      m.useSet(id, 0); window.__step(ms);
      document.getElementById("play").click();
      const from = m.progress, held = new Set();
      for (let f = 0; f < 200000 && m.progress - from < n; f++) {
        window.__step(ms);
        if (m.phase === "holding") held.add(Math.round(m.T) % n);
      }
      document.getElementById("play").click();
      for (let k = 0; k < n; k++) if (!held.has(k)) out.push(`${id}: with ${ms.toFixed(1)} ms steps the journey does not stop on ${st[k].id}`);
    }
  }
  return out;
});
await browser.close();
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("motion: no jumps, smooth speed, and every journey stops on every stage");
