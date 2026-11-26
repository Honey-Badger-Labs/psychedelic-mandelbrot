// Renders a journey to a video file, frame by frame, with its soundtrack. Ported from The Unfolding.
//
//   npm i --no-save playwright-core @fontsource/cormorant-garamond @fontsource/ibm-plex-mono
//   npm run serve                      (in another terminal; or pass --site)
//   node tools/film.mjs --set julia --out julia.mp4 [--width 1920 --height 1080 --fps 30 --from 0 --to 5 --clean]
//
// Needs Chrome (or Playwright's Chromium) and ffmpeg. Nothing here runs in real time: the page's clock is
// replaced by one this script advances exactly one frame at a time, so the film has no dropped frames however
// slow the machine. The soundtrack is rendered separately, offline, from the same timeline, then joined on.
//
//   --set      mandelbrot | julia | ship | bulb | buddha | all (the tour: every set in turn, dissolving between them)
//   --from/--to  stage numbers. --to defaults to a full loop, back to the first stage.
//   --clean    no text at all: just the picture (for social clips)
//   --scale    render resolution as a fraction of the frame (default 1; 0.5 is four times quicker)
//   --strips   compute each deep view over this many frames (default 1; 4 is about four times quicker)
//   For a vertical clip use --width 1080 --height 1920.
//
// Big-screen quality (run it on a Mac, whose graphics chip does in a second what software takes minutes for):
//
//   node tools/film.mjs --4k --set mandelbrot --out mandelbrot-4k.mp4
//
//   --4k       3840x2160 at 60 frames/s, supersampled 2x2, HEVC 10-bit; the 4K Buddhabrot images if traced
//              (node tools/buddha-render.mjs --4k). Any of these can still be set on their own:
//   --ss       supersampling: each frame drawn at this many times the width and height, then averaged down.
//              Text and picture both, so fine filaments stop shimmering from frame to frame (default 1)
//   --codec    h264 (default) | hevc (10-bit, smaller and cleaner at 4K) | prores (.mov master for editing; huge)
//   --gpu      draw with the machine's graphics chip through Google Chrome (default on a Mac). --cpu forces the
//              software renderer. The renderer in use is printed at the start: check it is not SwiftShader
//   --headed   show the browser window (if a headless browser will not use the graphics chip)
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, createWriteStream, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright-core")); } catch { ({ chromium } = require("playwright")); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes("--" + name);
const K4 = flag("4k");
const W = +arg("width", K4 ? 3840 : 1920), H = +arg("height", K4 ? 2160 : 1080), FPS = +arg("fps", K4 ? 60 : 30);
const SS = Math.max(1, Math.round(+arg("ss", K4 ? 2 : 1)));
const CODEC = arg("codec", K4 ? "hevc" : "h264");
if (!["h264", "hevc", "prores"].includes(CODEC)) throw new Error("--codec is h264, hevc or prores");
const GPU = flag("cpu") ? false : flag("gpu") || process.platform === "darwin";
// the page is laid out at 1080 lines (1920x1080, or 1080x1920 upright) whatever the film's size, so the text
// sits where it does in every film; the pixel ratio makes up the rest, supersampling included
const BASE = Math.min(W, H) / 1080, VW = Math.round(W / BASE), VH = Math.round(H / BASE);
const SET = arg("set", "mandelbrot");
const OUT = path.resolve(arg("out", `psychedelic-${SET}${K4 ? "-4k" : ""}.${CODEC === "prores" ? "mov" : "mp4"}`));
const B4K = arg("buddha", K4 && existsSync(path.join(root, "data/buddha-4k/layers.json")) ? "4k" : "") === "4k";
const FROM = +arg("from", 0), TO = arg("to", null);
const CLEAN = flag("clean"), SCALE = +arg("scale", 1);
// compute each deep view over this many frames, showing it moved and scaled in between (as the live page does).
// 4 is about four times quicker on deep stages, and the difference is hard to see
const STRIPS = +arg("strips", 1);
const SITE = arg("site", "http://localhost:8765");
const CHROME = arg("chrome", process.env.CHROME || "");
const HEAD = +arg("head", 2.5);      // seconds held on the first stage before the journey moves
const TAIL = +arg("tail", 8);        // seconds after the last stage, while the sound fades
const RATE = 48000;

const { sets } = JSON.parse(readFileSync(path.join(root, "data/sets.json"), "utf8"));
const TOUR = SET === "all";
const set = TOUR ? sets[0] : sets.find((s) => s.id === SET);
if (!set) throw new Error(`No set "${SET}". Choose one of: ${sets.map((s) => s.id).join(", ")}, all`);
// the tour travels every stage of every set, back to the first overview
const N = TOUR ? sets.reduce((n, s) => n + s.stages.length, 0) : set.stages.length;
const SPAN = (TO === null ? N : +TO) - FROM;     // stages to travel
if (!(SPAN > 0)) throw new Error("--to must be after --from");

// the web fonts, served from node_modules so the film never depends on the network
const FONT = {
  "cg-500": "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2",
  "cg-500i": "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2",
  "pm-400": "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  "pm-500": "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
};
const face = (family, style, weight, key) =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(https://fonts.gstatic.com/film/${key}.woff2) format('woff2')}`;
const FONT_CSS = face("Cormorant Garamond", "normal", 500, "cg-500") + face("Cormorant Garamond", "italic", 500, "cg-500i") +
  face("IBM Plex Mono", "normal", 400, "pm-400") + face("IBM Plex Mono", "normal", 500, "pm-500");

// Replaces every clock the page can see. Time only moves when __advance is called.
function virtualClock() {
  let now = 0, id = 1, rafs = [];
  const timers = new Map(), anims = new Map(), epoch = Date.now();
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.requestAnimationFrame = (cb) => { rafs.push(cb); return id++; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms, ...a) => { const i = id++; timers.set(i, { at: now + (ms || 0), fn, a }); return i; };
  window.setInterval = (fn, ms, ...a) => { const i = id++; timers.set(i, { at: now + ms, fn, a, every: ms || 1 }); return i; };
  window.clearTimeout = window.clearInterval = (i) => { timers.delete(i); };
  window.__advance = (ms) => {
    now += ms;
    for (let guard = 0; guard < 5000; guard++) {
      let due = null, key = 0;
      for (const [i, t] of timers) if (t.at <= now && (!due || t.at < due.at)) { due = t; key = i; }
      if (!due) break;
      if (due.every) due.at += due.every; else timers.delete(key);
      try { due.fn(...due.a); } catch (e) { console.error(e); }
    }
    const run = rafs; rafs = [];
    for (const cb of run) { try { cb(now); } catch (e) { console.error(e); } }
    // CSS transitions and animations (the text) follow the same clock
    for (const a of document.getAnimations()) {
      if (!anims.has(a)) anims.set(a, now);
      const t = now - anims.get(a), end = a.effect ? a.effect.getComputedTiming().endTime : 0;
      if (t >= end) { try { a.finish(); } catch (e) {} } else { a.pause(); a.currentTime = t; }
    }
    return now;
  };
}

const browser = await chromium.launch({
  // on a Mac, Google Chrome itself: its headless mode draws with the graphics chip (Metal), Playwright's own does not
  ...(CHROME ? { executablePath: CHROME } : GPU ? { channel: "chrome" } : {}),
  headless: !flag("headed"),
  args: GPU
    ? ["--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-gpu", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: BASE * SS });
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
await page.route("**/*", (r) => {
  const u = r.request().url();
  if (u.startsWith(SITE)) return r.continue();
  if (u.includes("fonts.googleapis.com/css")) return r.fulfill({ contentType: "text/css", body: FONT_CSS });
  const m = u.match(/fonts\.gstatic\.com\/film\/([\w-]+)\.woff2/);
  if (m && FONT[m[1]]) {
    const f = path.join(root, "node_modules", FONT[m[1]]);
    if (existsSync(f)) return r.fulfill({ contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(f) });
  }
  return r.abort();
});
await page.addInitScript(virtualClock);
const url = `${SITE}/index.html?film&scale=${SCALE}&set=${set.id}&at=${FROM}${TOUR ? "&tour" : ""}${CLEAN ? "&clean" : ""}&strips=${STRIPS}${B4K ? "&buddha=4k" : ""}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
const step = (ms) => page.evaluate((x) => window.__advance(x), ms);
await page.waitForFunction(() => window.__mandel && window.__mandel.set, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const gpuName = await page.evaluate(() => {
  const g = document.createElement("canvas").getContext("webgl2"), x = g && g.getExtension("WEBGL_debug_renderer_info");
  return g ? (x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : "no WebGL2";
});
console.log(`${W}x${H} at ${FPS} frames/s${SS > 1 ? `, drawn at ${W * SS}x${H * SS} and averaged down` : ""}, ${CODEC}${B4K ? ", 4K Buddhabrot images" : ""}`);
console.log("renderer:", gpuName);
if (GPU && /swiftshader|software|llvmpipe/i.test(gpuName)) console.log("WARNING: this is the software renderer, not the graphics chip. Try --headed, or see the note at the top of this file.");
for (let i = 0; i < +arg("warmup", 90); i++) await step(1000 / FPS);       // warm-up draws and the first text, unfilmed

const silent = OUT + ".video" + path.extname(OUT);
// supersampled frames are averaged down: "area" is the exact mean of each block of pixels
const ENCODE = {
  h264: ["-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p"],
  // fractal detail is the hardest thing to compress: a low CRF and 10 bits keep the gradients free of bands
  hevc: ["-c:v", "libx265", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-x265-params", "log-level=error"],
  prores: ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"],
}[CODEC];
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  ...(SS > 1 ? ["-vf", `scale=${W}:${H}:flags=area`] : []), ...ENCODE, "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
const cdp = await page.context().newCDPSession(page);
const track = [];
let frame = 0, started = false, endedAt = -1, restFrom = -1;
const t0 = Date.now();
for (;;) {
  const time = frame / FPS;
  if (!started && time >= HEAD) { await page.evaluate(() => document.getElementById("play").click()); started = true; }
  await step(1000 / FPS);
  // the Buddhabrot's images load over the network: a frame waits for the ones it needs
  await page.waitForFunction(() => window.__mandel.ready, null, { timeout: 120000 });
  const s = await page.evaluate(() => ({ T: window.__mandel.T, span: window.__mandel.span, progress: window.__mandel.progress, phase: window.__mandel.phase, set: window.__mandel.set }));
  track.push([s.T, s.span, s.set]);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(shot.data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  frame++;
  if (started && endedAt < 0 && s.progress >= SPAN - 1e-6 && s.phase === "holding") {
    // arrived: rest on the last stage while its text shows, then let the sound fade
    if (restFrom < 0) restFrom = time;
    if (time - restFrom > 7) { endedAt = time; await page.evaluate(() => document.getElementById("play").click()); }
  }
  if (endedAt >= 0 && time - endedAt >= TAIL) break;
  if (frame % 10 === 0) {
    const fps = frame / ((Date.now() - t0) / 1000), done = s.progress / SPAN, spent = Date.now() - t0;
    // a rough guess (deep stages are slower than shallow ones), once the journey is under way
    const left = done > 0.02 && done < 1 ? (spent / done - spent) / 60000 : null;
    const eta = left === null ? "" : `, about ${left < 90 ? left.toFixed(0) + " min" : (left / 60).toFixed(1) + " h"} left`;
    process.stdout.write(`\r${frame} frames, ${s.progress.toFixed(2)} of ${SPAN} stages, ${fps.toFixed(2)} frames/s${eta}   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
const seconds = frame / FPS;
console.log(`\npicture: ${frame} frames, ${seconds.toFixed(1)} s, rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// ---- the soundtrack, rendered offline from the same timeline
const snd = await browser.newPage();
snd.on("pageerror", (e) => problems.push("audio: " + e.message));
const wav = OUT + ".wav";
const sink = createWriteStream(wav);
await snd.exposeFunction("__wav", (b64) => { sink.write(Buffer.from(b64, "base64")); });
await snd.goto(SITE + "/tools/film-audio.html", { waitUntil: "load", timeout: 60000 });
await snd.evaluate((o) => window.renderFilmAudio(o), {
  track, fps: FPS, head: HEAD, endedAt, seconds, rate: RATE,
  voices: Object.fromEntries(sets.map((x) => [x.id, [...x.stages].sort((a, b) => a.stage - b.stage).map((s) => s.sound)])),
});
await new Promise((r) => sink.end(r));
await browser.close();

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-c:v", "copy", ...(CODEC === "prores" ? ["-c:a", "pcm_s24le"] : ["-c:a", "aac", "-b:a", "320k"]), "-shortest", "-movflags", "+faststart", OUT]);
rmSync(silent); rmSync(wav);
writeFileSync(OUT + ".json", JSON.stringify({ set: SET, width: W, height: H, fps: FPS, ss: SS, codec: CODEC, renderer: gpuName, buddha4k: B4K, frames: frame, seconds, from: FROM, stages: SPAN, clean: CLEAN, scale: SCALE, problems }, null, 1));
console.log("film:", OUT, problems.length ? "\nproblems: " + problems.slice(0, 5).join(" | ") : "");
