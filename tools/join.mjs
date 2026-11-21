// Joins films into one, each dissolving into the next (picture and sound), the way the tour does on the page.
//   node tools/join.mjs --out psychedelic-all.mp4 [--fade 4] a.mp4 b.mp4 c.mp4 ...
// Each film ends resting on its overview while its sound fades, so the dissolve starts in that rest.
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const OUT = opt("out", "psychedelic-all.mp4"), FADE = +opt("fade", 4);
const files = args;
if (files.length < 2) throw new Error("Give at least two films to join.");
const dur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim();

const inputs = files.flatMap((f) => ["-i", f]);
let v = "[0:v]", a = "[0:a]", t = dur(files[0]), graph = [];
for (let i = 1; i < files.length; i++) {
  const offset = Math.max(0, t - FADE);
  graph.push(`${v}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[v${i}]`);
  graph.push(`${a}[${i}:a]acrossfade=d=${FADE}:c1=tri:c2=tri[a${i}]`);
  v = `[v${i}]`; a = `[a${i}]`; t = offset + dur(files[i]);
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph.join(";"), "-map", v, "-map", a,
  "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", OUT], { stdio: "inherit" });
console.log(`joined ${files.length} films: ${OUT}, ${t.toFixed(1)} s`);
