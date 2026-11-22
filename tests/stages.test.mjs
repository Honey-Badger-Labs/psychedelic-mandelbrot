// Checks the map: every set and stage is complete, every claim in it is true arithmetic, and the page agrees.
// Run with: npm test   (Node 20+, no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nucleus, orbit } from "../tools/locate.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const { sets } = JSON.parse(read("data/sets.json"));
const { sources } = JSON.parse(read("data/sources.json"));
const html = read("index.html");
const audio = read("audio.js");
const sourceIds = new Set(sources.map((s) => s.id));
const LABELS = ["exact", "computed", "art"];
const KINDS = { escape: ["mandelbrot", "julia", "ship"], bulb: [undefined], buddha: [undefined] };

// z -> z^2 + k from z0, in doubles; the step at which |z| > 2, or null
function escapeStep(k, z0 = [0, 0], n = 5000) {
  let [x, y] = z0;
  for (let i = 1; i <= n; i++) { const t = x * x - y * y + k[0]; y = 2 * x * y + k[1]; x = t; if (x * x + y * y > 4) return i; }
  return null;
}
const numberIn = (text) => Number(text.replace(/,/g, ""));
function stated(scale) {
  const m = /([\d,.]+|ten|a)?\s*(million|billion|trillion)?\s*times/.exec(scale);
  if (!m) return null;
  const n = m[1] === "ten" ? 10 : m[1] === "a" || !m[1] ? 1 : numberIn(m[1]);
  return n * ({ million: 1e6, billion: 1e9, trillion: 1e12 }[m[2]] || 1);
}

test("set ids are unique, kinds known", () => {
  assert.equal(new Set(sets.map((s) => s.id)).size, sets.length);
  for (const s of sets) assert.ok(KINDS[s.kind] && KINDS[s.kind].includes(s.formula), `${s.id}: unknown kind/formula`);
});

test("the definition holds: inside stays bounded, outside escapes", () => {
  for (const c of [[0, 0], [-1, 0], [0, 1], [-2, 0]]) assert.equal(escapeStep(c), null, `${c} should stay`);
  for (const c of [[1, 0], [0.5, 0], [0, 1.1]]) assert.ok(escapeStep(c), `${c} should escape`);
});

for (const set of sets) {
  const home = set.stages.find((s) => s.stage === 0);
  test(`${set.id}: stages run 0..n-1, ids and ticks unique`, () => {
    [...set.stages].map((s) => s.stage).sort((a, b) => a - b).forEach((s, i) => assert.equal(s, i));
    for (const key of ["id", "tick"]) {
      const v = set.stages.map((s) => String(s[key]).toLowerCase());
      assert.equal(new Set(v).size, v.length, `duplicate ${key}`);
    }
  });
  for (const s of set.stages) {
    const name = `${set.id}/${s.id}`;
    test(`${name}: complete, sourced, in range`, () => {
      for (const f of ["title", "tick", "place", "scale", "note", "palette", "sound"]) {
        assert.ok(typeof s[f] === "string" && s[f].trim(), `${f} missing`);
      }
      assert.ok(LABELS.includes(s.label), `label must be one of ${LABELS}`);
      assert.ok(s.note.length <= 200, `note is ${s.note.length} chars; keep it to 200 so it fits the panel`);
      assert.ok(s.sources.length > 0, "needs at least one source");
      for (const id of s.sources) assert.ok(sourceIds.has(id), `unknown source ${id}`);
      assert.ok(new RegExp(`\\b${s.palette}\\s*:`).test(html), `palette ${s.palette} is not defined in index.html`);
      assert.ok(new RegExp(`\\b${s.sound}\\s*:`).test(audio), `voice ${s.sound} is not defined in audio.js`);
      for (const f of ["flow", "density", "glow"]) assert.ok(typeof s[f] === "number", `${f} missing`);
      if (set.kind === "escape") {
        assert.ok(s.span > 0 && s.span <= home.span, "span out of range");
        // float32 offsets and a double-precision reference: below ~1e-15 per pixel the picture falls apart
        assert.ok(s.span / 2000 > 2e-16 * Math.max(1, Math.hypot(s.re, s.im)), "too deep for double precision");
        assert.ok(s.iter >= 200 && s.iter <= 16382, "iteration limit must fit the reference texture");
      }
    });
    if ((set.kind === "escape" || set.kind === "buddha") && s.stage > 0) {
      test(`${name}: the stated magnification matches the span`, () => {
        const said = stated(s.scale), actual = home.span / s.span;
        if (/^the whole/.test(s.scale)) { assert.ok(actual < 1.5, "says the whole set but is zoomed in"); return; }
        assert.ok(said, `scale should say how many times magnified: "${s.scale}"`);
        assert.ok(said / actual < 1.6 && actual / said < 1.6, `says ${said}, actually ${actual.toExponential(2)}`);
      });
    }
    if (s.period && set.formula !== "julia") {
      test(`${name}: the centre is a nucleus of period ${s.period}`, () => {
        const [cr, ci] = s.nucleus || [s.re, s.im];
        const o = orbit(cr, ci, s.period, set.formula);
        assert.ok(Math.hypot(...o[s.period]) < 1e-9, `z_${s.period} = ${Math.hypot(...o[s.period])}, not 0`);
        // and not of a shorter period: no earlier return to 0
        for (let k = 1; k < s.period; k++) assert.ok(Math.hypot(...o[k]) > 1e-7, `returns to 0 already at step ${k}`);
        const [nr, ni] = nucleus(cr, ci, s.period, set.formula);
        assert.ok(Math.hypot(nr - cr, ni - ci) < Math.max(s.span * 1e-3, 1e-12), "stored centre is not converged");
        if (/every (\d+) steps/.test(s.note)) assert.equal(Number(/every (\d+) steps/.exec(s.note)[1]), s.period);
      });
    }
  }
}

const stage = (setId, id) => sets.find((s) => s.id === setId).stages.find((x) => x.id === id);

test("Mandelbrot period 3: the centre is the real root of c³ + 2c² + c + 1", () => {
  const c = stage("mandelbrot", "three").re;
  assert.ok(Math.abs(c ** 3 + 2 * c ** 2 + c + 1) < 1e-12);
  assert.ok(Math.abs(((c * c + c) ** 2) + c) < 1e-12);   // z_3 = c(c³ + 2c² + c + 1)
});

test("Seahorse Valley sits in the neck between the cardioid and the period-2 disc", () => {
  const s = stage("mandelbrot", "seahorse");
  assert.ok(Math.hypot(s.re + 1, s.im) > 0.25);
  const ar = 1 - 4 * s.re, ai = -4 * s.im, r = Math.hypot(ar, ai);
  const sr = Math.sqrt((r + ar) / 2), si = Math.sign(ai) * Math.sqrt((r - ar) / 2);
  assert.ok(Math.hypot(1 - sr, -si) > 1, "outside the main cardioid");
  assert.ok(Math.abs(s.re + 0.75) < 0.01, "near the neck at −0.75");
  assert.equal(escapeStep([s.re, s.im], [0, 0], 500), null);
});

test("Julia: the rabbit's k is the period-3 nucleus on top of the Mandelbrot set", () => {
  const s = stage("julia", "rabbit"), o = orbit(s.kre, s.kim, 3);
  assert.ok(Math.hypot(...o[3]) < 1e-12 && Math.hypot(...o[1]) > 0.1 && Math.hypot(...o[2]) > 0.1);
  assert.ok(s.kim > 0, "the bulb on top");
});

test("Julia: the whirlpool's fixed point turns by the golden ratio of a turn", () => {
  const s = stage("julia", "siegel"), k = [s.kre, s.kim];
  // fixed point z = (1 - sqrt(1 - 4k)) / 2; multiplier 2z
  const ar = 1 - 4 * k[0], ai = -4 * k[1], r = Math.hypot(ar, ai);
  const sr = Math.sqrt((r + ar) / 2), si = Math.sign(ai) * Math.sqrt((r - ar) / 2);
  const z = [(1 - sr) / 2, -si / 2], lam = [2 * z[0], 2 * z[1]];
  assert.ok(Math.abs(Math.hypot(...lam) - 1) < 1e-12, "neither attracting nor repelling");
  const turns = ((Math.atan2(lam[1], lam[0]) / (2 * Math.PI)) % 1 + 1) % 1;
  assert.ok(Math.abs(turns - (Math.sqrt(5) - 1) / 2) < 1e-12, `turns by ${turns}`);
  // the view is centred on it
  assert.ok(Math.hypot(s.re - z[0], s.im - z[1]) < 0.01);
});

test("Julia: k = i sends 0 to i, −1 + i, −i, −1 + i, −i", () => {
  const s = stage("julia", "dendrite");
  assert.equal(s.kre, 0); assert.equal(s.kim, 1);
  const o = orbit(0, 1, 5).slice(1).map(([x, y]) => [Math.round(x), Math.round(y)]);
  assert.deepEqual(o, [[0, 1], [-1, 1], [0, -1], [-1, 1], [0, -1]]);
});

test("Julia: stated escape steps are right", () => {
  for (const id of ["seahorses", "dust"]) {
    const s = stage("julia", id);
    assert.equal(escapeStep([s.kre, s.kim]), s.escapes, id);
    assert.match(s.note, new RegExp(`escapes after ${s.escapes} steps`));
  }
});

test("Burning Ship: the page folds z before squaring, and draws it keel down", () => {
  assert.match(html, /if\(ship\)\{x=Math\.abs\(x\);y=Math\.abs\(y\);\}/);
  assert.match(html, /#ifdef SHIP\s+p\.y=-p\.y;/);
  assert.match(stage("ship", "cathedral").note, new RegExp(`up to ${stage("ship", "cathedral").iter.toLocaleString("en-GB")} times`));
  assert.match(stage("ship", "armada").note, new RegExp(`${stage("ship", "armada").iter.toLocaleString("en-GB")}-step limit`));
});

test("Mandelbulb: the shader's step is the stated rule, and each stage says its power", () => {
  assert.match(html, /th=acos\(clamp\(z\.z\/r,-1\.,1\.\)\)\*uPower, ph=atan\(z\.y,z\.x\)\*uPower;/);
  assert.match(html, /z=pow\(r,uPower\)\*vec3\(sin\(th\)\*cos\(ph\),sin\(th\)\*sin\(ph\),cos\(th\)\)\+p;/);
  for (const s of sets.find((x) => x.id === "bulb").stages) {
    assert.equal(s.place, `power ${s.power}`);
    assert.match(s.scale, new RegExp(`${s.dist} units`));
  }
});

test("Buddhabrot: the stated limits are the ones used", () => {
  for (const s of sets.find((x) => x.id === "buddha").stages) {
    assert.ok(Array.isArray(s.limits) && s.limits.length >= 3, `${s.id}: three limits`);
    if (!/green/.test(s.note)) continue;
    const [r, g, b] = s.limits.map((n) => n.toLocaleString("en-GB"));
    assert.match(s.note, new RegExp(`${r} steps, green ${g}, blue ${b}`));
  }
});

test("Buddhabrot: every stage has its traced image, framed for it, and the notes do not claim live tracing", () => {
  const m = JSON.parse(read("data/buddha/layers.json"));
  const stages = sets.find((x) => x.id === "buddha").stages;
  let bytes = 0;
  for (const l of m.layers) {
    const size = readFileSync(new URL("data/buddha/" + l.file, root)).length;
    assert.ok(size < 16e6, `${l.file} is ${size} bytes; keep each image under 16 MB`);
    bytes += size;
    assert.ok(m.encoding[l.group], `no brightness scale for group ${l.group}`);
  }
  assert.ok(bytes < 60e6, `the images total ${(bytes / 1e6).toFixed(1)} MB; keep them under 60 MB`);
  for (const s of stages) {
    const l = m.layers.find((x) => x.kind === "stage" && x.stage === s.id);
    assert.ok(l, `${s.id}: no stage image`);
    assert.ok(Math.abs(l.re - s.re) < 1e-9 && Math.abs(l.im - s.im) < 1e-9, `${s.id}: image not centred on the stage`);
    assert.ok(l.hc >= s.span * 1.6, `${s.id}: image does not frame the view`);
    assert.equal(l.group, s.limits.join("/"));
    const info = m.stages[s.id];
    assert.ok(info && info.paths > 0 && info.low.every((v, c) => v < info.high[c]), `${s.id}: no exposure`);
    assert.doesNotMatch(s.note, /as you watch|being traced/, `${s.id}: the page no longer traces live`);
  }
});
