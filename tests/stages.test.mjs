// Checks the map: every stage is complete, every claim in it is true arithmetic, and the page agrees.
// Run with: npm test   (Node 20+, no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nucleus } from "../tools/locate.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const { stages } = JSON.parse(read("data/stages.json"));
const { sources } = JSON.parse(read("data/sources.json"));
const html = read("index.html");
const audio = read("audio.js");
const sourceIds = new Set(sources.map((s) => s.id));
const LABELS = ["exact", "computed", "art"];
const HOME_SPAN = stages.find((s) => s.stage === 0).span;

// z_n for c, in doubles; returns the orbit (stops early on escape)
function orbit(re, im, n) {
  let x = 0, y = 0; const out = [[0, 0]];
  for (let k = 0; k < n; k++) {
    const t = x * x - y * y + re; y = 2 * x * y + im; x = t;
    out.push([x, y]);
    if (x * x + y * y > 1e10) break;
  }
  return out;
}
const escapes = (re, im, n = 2000) => orbit(re, im, n).some(([x, y]) => x * x + y * y > 4);

test("stages run 0..n-1 with no gaps or repeats", () => {
  [...stages].map((s) => s.stage).sort((a, b) => a - b).forEach((s, i) => assert.equal(s, i));
});

test("ids and ticks are unique", () => {
  for (const key of ["id", "tick"]) {
    const v = stages.map((s) => String(s[key]).toLowerCase());
    assert.equal(new Set(v).size, v.length, `duplicate ${key}`);
  }
});

test("the definition holds: inside stays bounded, outside escapes", () => {
  for (const [re, im] of [[0, 0], [-1, 0], [0, 1], [-2, 0]]) assert.ok(!escapes(re, im), `${re}+${im}i should stay`);
  for (const [re, im] of [[1, 0], [0.5, 0], [0, 1.1]]) assert.ok(escapes(re, im), `${re}+${im}i should escape`);
});

for (const s of stages) {
  test(`${s.id}: complete, sourced, in range`, () => {
    for (const f of ["title", "tick", "place", "scale", "note", "palette", "sound"]) {
      assert.ok(typeof s[f] === "string" && s[f].trim(), `${f} missing`);
    }
    assert.ok(LABELS.includes(s.label), `label must be one of ${LABELS}`);
    assert.ok(s.note.length <= 200, `note is ${s.note.length} chars; keep it to 200 so it fits the panel`);
    assert.ok(s.sources.length > 0, "needs at least one source");
    for (const id of s.sources) assert.ok(sourceIds.has(id), `unknown source ${id}`);
    assert.ok(new RegExp(`\\b${s.palette}\\s*:`).test(html), `palette ${s.palette} is not defined in index.html`);
    assert.ok(new RegExp(`\\b${s.sound}\\s*:`).test(audio), `voice ${s.sound} is not defined in audio.js`);
    assert.ok(s.span > 0 && s.span <= HOME_SPAN, "span out of range");
    // float32 offsets and a double-precision reference: below ~1e-15 per pixel the picture falls apart
    assert.ok(s.span / 2000 > 2e-16 * Math.max(1, Math.hypot(s.re, s.im)), "too deep for double precision");
    assert.ok(s.iter >= 200 && s.iter <= 16382, "iteration limit must fit the reference texture");
  });

  test(`${s.id}: the stated magnification matches the span`, () => {
    if (s.stage === 0) return;
    const m = /(\d+|ten|a)?\s*(million|billion|trillion)?\s*times/.exec(s.scale);
    assert.ok(m, `scale should say how many times magnified: "${s.scale}"`);
    const n = m[1] === "ten" ? 10 : m[1] === "a" || !m[1] ? 1 : Number(m[1]);
    const said = n * ({ million: 1e6, billion: 1e9, trillion: 1e12 }[m[2]] || 1);
    const actual = HOME_SPAN / s.span;
    assert.ok(said / actual < 1.6 && actual / said < 1.6, `says ${said}, actually ${actual.toExponential(2)}`);
  });

  if (s.period) {
    test(`${s.id}: the centre is a nucleus of period ${s.period}`, () => {
      const o = orbit(s.re, s.im, s.period);
      const [x, y] = o[s.period];
      assert.ok(Math.hypot(x, y) < 1e-9, `z_${s.period} = ${Math.hypot(x, y)}, not 0`);
      // and not of a shorter period: no earlier return to 0
      for (let k = 1; k < s.period; k++) assert.ok(Math.hypot(...o[k]) > 1e-7, `returns to 0 already at step ${k}`);
      // Newton's method stays put, so the stored value is the nucleus to double precision
      const [nr, ni] = nucleus(s.re, s.im, s.period);
      assert.ok(Math.hypot(nr - s.re, ni - s.im) < s.span * 1e-3, "stored centre is not converged");
      if (/every (\d+) steps/.test(s.note)) assert.equal(Number(/every (\d+) steps/.exec(s.note)[1]), s.period);
    });
  }
}

test("period 3: the centre is the real root of c³ + 2c² + c + 1", () => {
  const s = stages.find((x) => x.id === "three");
  const c = s.re;
  assert.ok(Math.abs(c ** 3 + 2 * c ** 2 + c + 1) < 1e-12);
  assert.equal(s.im, 0);
  // z_3 = ((c² + c)² + c) = c(c³ + 2c² + c + 1)
  assert.ok(Math.abs(((c * c + c) ** 2) + c) < 1e-12);
});

test("Seahorse Valley sits in the neck between the cardioid and the period-2 disc", () => {
  const s = stages.find((x) => x.id === "seahorse");
  // outside the period-2 disc |c + 1| < 1/4
  assert.ok(Math.hypot(s.re + 1, s.im) > 0.25);
  // outside the main cardioid: |1 - sqrt(1 - 4c)| < 1 inside
  const ar = 1 - 4 * s.re, ai = -4 * s.im, r = Math.hypot(ar, ai);
  const sr = Math.sqrt((r + ar) / 2), si = Math.sign(ai) * Math.sqrt((r - ar) / 2);
  assert.ok(Math.hypot(1 - sr, -si) > 1);
  assert.ok(Math.abs(s.re + 0.75) < 0.01, "near the neck at −0.75");
  assert.ok(!escapes(s.re, s.im, 500), "close enough to the set to stay bounded for 500 steps");
});
