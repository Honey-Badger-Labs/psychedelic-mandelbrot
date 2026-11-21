// Psychedelic Mandelbrot: procedural soundtrack.
// One voice per stage, all generated live with the Web Audio API (no audio files), crossfaded by the
// journey. Under them runs an endless Shepard-Risset glissando tied to the zoom: it rises for as long
// as you dive and falls as you pull back, and never arrives, like the set itself. Tuned for stillness:
// soft pads, sparse bells that ring like singing bowls, and a glissando kept low and distant, since the
// long deep dives made a louder one tiring.
// Everything is tuned around A.
(function (global) {
  "use strict";

  var A1 = 55;
  function hz(semitones) { return A1 * Math.pow(2, semitones / 12); }

  // voices: chord (semitones above A1), pad timbre, filter, how fast it breathes, and an optional bell figure
  var VOICES = {
    overview: { chord: [0, 7, 12, 16, 19, 24], wave: "sine", cutoff: 1100, breathe: 0.03, bells: [24, 28, 31, 35], every: 5.5 },
    seahorse: { chord: [-3, 4, 9, 12, 16, 23], wave: "triangle", cutoff: 1100, breathe: 0.045, bells: [28, 31, 35, 40], every: 4.2 },
    elephant: { chord: [-7, 0, 5, 9, 12, 17], wave: "triangle", cutoff: 600, breathe: 0.02, bells: [17, 21, 24], every: 6.5 },
    spiral: { chord: [2, 9, 14, 17, 21, 26], wave: "sine", cutoff: 1300, breathe: 0.06, bells: [26, 29, 33, 36, 38], every: 3.2 },
    tendril: { chord: [-5, 2, 7, 10, 14, 19], wave: "sine", cutoff: 1100, breathe: 0.035, bells: [26, 31, 34, 38], every: 4.8 },
    minibrot: { chord: [0, 7, 11, 14, 19, 23], wave: "triangle", cutoff: 800, breathe: 0.025, bells: [31, 35, 38, 43], every: 3.8 },
    star: { chord: [-2, 5, 10, 14, 17, 22], wave: "triangle", cutoff: 950, breathe: 0.04, bells: [29, 34, 38, 41], every: 4.4 },
    abyss: { chord: [-12, -5, 0, 3, 7, 10], wave: "triangle", cutoff: 420, breathe: 0.018, bells: [24, 27, 31], every: 7.5 }
  };

  function createSoundtrack(ctx, dest, names) {
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    function osc(type, f, detune) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      if (detune) o.detune.value = detune; o.start(); return o;
    }
    function filt(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
    function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
    function lfo(rate, depth, param, owned) { var o = osc("sine", rate); owned.push(o); var g = gain(depth); o.connect(g); g.connect(param); }
    function smooth(param, value, now, tc) { param.setTargetAtTime(value, now, tc || 0.15); }
    function impulse(seconds, decay) {
      var len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }

    // master: a long, wide reverb (this is a place of echoes), glue, a limiter
    var master = gain(0), mix = gain(1), wet = gain(0.7);
    var hp = filt("highpass", 38, 0.7), verb = ctx.createConvolver(); verb.buffer = impulse(7, 2.4);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    var limit = ctx.createDynamicsCompressor(); limit.threshold.value = -3; limit.ratio.value = 12; limit.attack.value = 0.005;
    chain(mix, hp, comp); chain(hp, verb, wet, comp); chain(comp, limit, master, dest);

    // a stage voice: a slow, detuned pad that breathes through a filter, and bells drawn from the chord
    function Voice(spec) { this.spec = spec; this.out = null; this.srcs = []; this.next = 0; this.step = 0; }
    Voice.prototype.wake = function () {
      if (this.out) return;
      var s = this.spec, owned = [], out = gain(0); out.connect(mix);
      var lp = filt("lowpass", s.cutoff, 0.9); lfo(s.breathe, s.cutoff * 0.45, lp.frequency, owned);
      var pad = gain(0.9 / s.chord.length); lfo(s.breathe * 1.7, 0.3 / s.chord.length, pad.gain, owned);
      chain(pad, lp, out);
      s.chord.forEach(function (n, i) {
        var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        [-7, 7].forEach(function (cents) {
          var o = osc(s.wave, hz(n), cents + (i % 2 ? 3 : -3)); owned.push(o);
          var g = gain(s.wave === "triangle" ? 0.3 : 0.4);
          if (pan) { pan.pan.value = (i / (s.chord.length - 1)) * 1.4 - 0.7; chain(o, g, pan); } else chain(o, g, pad);
        });
        if (pan) pan.connect(pad);
      });
      // a deep root, felt more than heard
      var sub = osc("sine", hz(s.chord[0] - 12)); owned.push(sub); chain(sub, gain(0.12), out);
      this.out = out; this.srcs = owned; this.next = ctx.currentTime + 0.5;
    };
    Voice.prototype.sleep = function (now) {
      if (!this.out) return;
      this.srcs.forEach(function (o) { try { o.stop(now + 0.05); } catch (e) {} });
      var out = this.out; setTimeout(function () { try { out.disconnect(); } catch (e) {} }, 300);
      this.out = null; this.srcs = [];
    };
    Voice.prototype.bell = function (now, level) {
      if (!this.out || now < this.next) return;
      var s = this.spec, n = s.bells[(this.step * 3 + (this.step >> 2)) % s.bells.length]; this.step++;
      var when = this.next; this.next = when + s.every * (0.75 + Math.random() * 0.5);
      // a soft strike that rings a long time, like a singing bowl: a slow attack (no click), a faint
      // inharmonic partial, and a slight beating between two near-equal tones
      [[1, 1, 0], [1, 0.6, 1.8], [2.76, 0.12, 0]].forEach(function (p) {
        var o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz(n) * p[0] + p[2];
        var g = ctx.createGain(); g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.026 * level * p[1], when + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, when + (p[0] > 1 ? 2.5 : 7));
        o.connect(g); g.connect(mix); o.start(when); o.stop(when + 7.1);
      });
    };

    var voices = (names || []).map(function (n) { return new Voice(VOICES[n] || VOICES.overview); });

    // the endless glissando: eight sines an octave apart, loudest in the middle, sliding together
    var SHEP = 8, shepOut = gain(0), shep = [], shepPhase = 0;
    chain(shepOut, filt("lowpass", 1000, 0.5), mix);
    for (var i = 0; i < SHEP; i++) { var o = osc("sine", 40); var g = gain(0); chain(o, g, shepOut); shep.push({ o: o, g: g }); }
    function shepard(now) {
      for (var i = 0; i < SHEP; i++) {
        var pos = ((i + shepPhase) % SHEP + SHEP) % SHEP;     // 0..8 octaves above the base
        var f = 40 * Math.pow(2, pos), x = (pos - SHEP / 2) / (SHEP / 4.5);
        var prev = shep[i].pos;
        shep[i].pos = pos;
        // a voice wrapping from top to bottom is silent there, so it jumps without a click
        if (prev !== undefined && Math.abs(pos - prev) > SHEP / 2) shep[i].o.frequency.setValueAtTime(f, now);
        else smooth(shep[i].o.frequency, f, now, 0.06);
        smooth(shep[i].g.gain, Math.exp(-x * x) * 0.022, now, 0.06);
      }
    }

    var LEVEL = 0.75, lastUpdate = -1, lastSpan = 0;
    return {
      // a different fractal: a new set of stage voices (the old ones fade and stop)
      setVoices: function (names) {
        var now = ctx.currentTime;
        voices.forEach(function (v) { if (v.out) { smooth(v.out.gain, 0, now, 0.4); (function (v) { setTimeout(function () { v.sleep(ctx.currentTime); }, 2000); })(v); } });
        voices = names.map(function (n) { return new Voice(VOICES[n] || VOICES.overview); });
        lastSpan = 0;
      },
      setOn: function (on, seconds) { smooth(master.gain, on ? LEVEL : 0, ctx.currentTime, (seconds || 1.6) / 4); },
      // call every frame with the journey position and the camera
      update: function (T, C) {
        var now = ctx.currentTime, dt = now - lastUpdate;
        if (dt < 0.05) return;
        if (lastUpdate < 0) dt = 0;
        lastUpdate = now;
        var n = voices.length;
        voices.forEach(function (v, k) {
          // voice k is loudest at stage k and fades across the transitions either side (the journey loops)
          var d = Math.abs(T - k); d = Math.min(d, Math.abs(T - k - n), Math.abs(T - k + n));
          var w = Math.sin(Math.max(0, 1 - d) * Math.PI / 2);
          if (w > 0.001) v.wake();
          if (!v.out) return;
          smooth(v.out.gain, w, now, 0.3);
          if (w > 0.2) v.bell(now, w);
          if (w <= 0.001 && !v.quiet) v.quiet = now;
          if (w > 0.001) v.quiet = 0;
          if (v.quiet && now - v.quiet > 2) { v.sleep(now); v.quiet = 0; }
        });
        // the glissando follows the zoom: octaves per second of change in scale
        var L = Math.log2(C.span), rate = lastSpan && dt > 0 ? (lastSpan - L) / dt : 0;
        lastSpan = L;
        rate = Math.max(-6, Math.min(6, rate));
        // half the speed it used to glide at, and swelling in and out over seconds rather than following every change
        shepPhase += rate * dt * 0.03;
        smooth(shepOut.gain, Math.min(0.7, Math.sqrt(Math.abs(rate)) / 2.2), now, 2);
        shepard(now);
      }
    };
  }

  global.createSoundtrack = createSoundtrack;
  global.SOUND_VOICES = Object.keys(VOICES);
})(typeof window !== "undefined" ? window : this);
