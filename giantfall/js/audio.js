// Procedural sound effects and ambience. Everything is synthesised; no audio files.
(function (root) {
  'use strict';
  const GF = root.GF;
  const A = GF.Audio = { vol: { master: 0.7, sfx: 0.8, music: 0.35 }, ctx: null, on: true };
  let master, noiseBuf, musicT = 8;
  function init() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) { A.on = false; return; }
      A.ctx = new C();
      master = A.ctx.createGain(); master.connect(A.ctx.destination); master.gain.value = A.vol.master;
      noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { A.on = false; }
  }
  function tone(f0, f1, dur, g, type, delay) {
    if (!A.ctx || !A.on) return;
    const t = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = A.ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g * A.vol.sfx, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, g, freq, q, type) {
    if (!A.ctx || !A.on) return;
    const t = A.ctx.currentTime;
    const s = A.ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = A.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const gn = A.ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g * A.vol.sfx, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  const last = {};
  A.play = function (name) {
    if (!A.ctx || !A.on || A.ctx.state !== 'running') return;
    const now = performance.now();
    if (last[name] && now - last[name] < 45) return; last[name] = now;
    switch (name) {
      case 'hit': noise(0.08, 0.4, 900, 1.2); tone(220, 120, 0.07, 0.15, 'square'); break;
      case 'crit': noise(0.1, 0.5, 1500, 1); tone(500, 900, 0.12, 0.25, 'square'); break;
      case 'kill': noise(0.18, 0.5, 500, 0.8); tone(300, 80, 0.2, 0.2, 'sawtooth'); break;
      case 'swing': noise(0.07, 0.18, 2200, 0.8, 'highpass'); break;
      case 'chop': noise(0.09, 0.45, 600, 1.4); tone(150, 90, 0.08, 0.2, 'triangle'); break;
      case 'mine': noise(0.08, 0.4, 2500, 1.5); tone(900, 500, 0.06, 0.12, 'square'); break;
      case 'bump': tone(120, 90, 0.08, 0.15, 'square'); break;
      case 'pickup': tone(600, 1100, 0.08, 0.14, 'sine'); break;
      case 'coin': tone(1200, 1800, 0.08, 0.14, 'square'); tone(1600, 2400, 0.1, 0.1, 'square', 0.06); break;
      case 'rare': tone(500, 1000, 0.12, 0.2, 'triangle'); tone(750, 1500, 0.16, 0.18, 'triangle', 0.08); tone(1000, 2000, 0.2, 0.15, 'triangle', 0.16); break;
      case 'craft': tone(300, 500, 0.08, 0.2, 'square'); tone(500, 800, 0.12, 0.2, 'square', 0.08); noise(0.12, 0.2, 3000, 1); break;
      case 'build': noise(0.2, 0.5, 400, 0.7); tone(100, 60, 0.25, 0.3, 'sawtooth'); tone(300, 600, 0.12, 0.15, 'square', 0.15); break;
      case 'place': noise(0.06, 0.25, 700, 1); break;
      case 'water': noise(0.18, 0.3, 700, 0.8); break;
      case 'eat': for (let i = 0; i < 3; i++) tone(200 + i * 30, 120, 0.06, 0.2, 'square', i * 0.09); break;
      case 'hurt': tone(280, 90, 0.22, 0.35, 'sawtooth'); noise(0.12, 0.3, 400, 0.8); break;
      case 'dodge': noise(0.14, 0.2, 1800, 0.5, 'highpass'); break;
      case 'level': case 'levelup': tone(400, 800, 0.15, 0.25, 'triangle'); tone(600, 1200, 0.2, 0.25, 'triangle', 0.12); tone(800, 1600, 0.3, 0.25, 'triangle', 0.26); break;
      case 'quest': tone(520, 780, 0.12, 0.2, 'triangle'); tone(780, 1040, 0.2, 0.2, 'triangle', 0.1); break;
      case 'unlock': tone(300, 600, 0.2, 0.25, 'sawtooth'); tone(450, 900, 0.3, 0.2, 'triangle', 0.15); break;
      case 'event': tone(660, 440, 0.2, 0.2, 'sine'); tone(880, 660, 0.2, 0.2, 'sine', 0.2); break;
      case 'bossroar': tone(90, 40, 0.9, 0.5, 'sawtooth'); tone(130, 50, 1.0, 0.4, 'square'); noise(0.8, 0.4, 200, 0.6); break;
      case 'victory': [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.4, 0.25, 'triangle', i * 0.15)); break;
      case 'death': tone(300, 40, 0.9, 0.4, 'sawtooth'); break;
      case 'portal': tone(200, 800, 0.4, 0.2, 'sine'); tone(800, 200, 0.4, 0.2, 'sine', 0.3); break;
      case 'whirl': noise(0.3, 0.4, 1200, 0.5); tone(300, 600, 0.3, 0.2, 'sawtooth'); break;
      case 'click': tone(900, 700, 0.04, 0.12, 'square'); break;
      case 'buy': tone(700, 1000, 0.06, 0.15, 'square'); break;
      default: break;
    }
  };
  A.setVolumes = function (m, s, mu) { A.vol.master = m; A.vol.sfx = s; A.vol.music = mu; if (master) master.gain.value = m; };
  /** Slow generative music: a soft pentatonic phrase every 40-70 s. */
  A.update = function (dt, mood) {
    if (!A.ctx || A.ctx.state !== 'running' || A.vol.music <= 0) return;
    musicT -= dt;
    if (musicT > 0) return;
    musicT = 40 + Math.random() * 30;
    const scale = mood === 'boss' ? [0, 1, 3, 5, 7, 8, 10] : mood === 'night' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    const root = mood === 'boss' ? 110 : mood === 'night' ? 146.8 : 196;
    let t = A.ctx.currentTime + 0.1;
    for (let i = 0; i < 6; i++) {
      const f = root * Math.pow(2, (scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0)) / 12);
      const o = A.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * A.vol.music, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 3.3); t += 1.2 + Math.random() * 1.1;
    }
  };
  A.init = init;
  GF.hooks.sound = (n) => A.play(n);
})(typeof window !== 'undefined' ? window : globalThis);
