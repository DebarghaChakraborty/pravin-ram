'use strict';
// Sound effects + background tune generated with the Web Audio API, so no audio files are needed.
const Sound = (() => {
  let ctx = null, master = null, muted = false;
  let musicTimer = null, musicStep = 0, nextNoteTime = 0;

  // Browsers only allow audio after a user gesture, so this is called from the Start button.
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function toneAt(freq, at, dur, type, vol, slideTo) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(vol || 0.12, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  const tone = (freq, delay, dur, type, vol, slideTo) =>
    ctx && toneAt(freq, ctx.currentTime + delay, dur, type, vol, slideTo);

  function noise(dur, vol) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  const seq = (notes, gap, dur, type, vol) => notes.forEach((f, i) => f && tone(f, i * gap, dur, type, vol));

  const sfx = {
    jump: () => tone(330, 0, 0.18, 'square', 0.1, 720),
    coin: () => { tone(988, 0, 0.08, 'square', 0.1); tone(1319, 0.08, 0.28, 'square', 0.1); },
    stomp: () => tone(420, 0, 0.12, 'square', 0.14, 110),
    bump: () => tone(170, 0, 0.1, 'triangle', 0.3, 90),
    brick: () => { noise(0.16, 0.25); tone(200, 0, 0.1, 'square', 0.08, 80); },
    sprout: () => seq([392, 494, 587, 740, 880], 0.05, 0.08, 'square', 0.09),
    powerup: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.07, 0.1, 'square', 0.1),
    oneup: () => seq([659, 784, 1319, 1047, 1175, 1568], 0.09, 0.12, 'square', 0.1),
    hurt: () => seq([784, 587, 440, 330], 0.08, 0.1, 'sawtooth', 0.09),
    die: () => seq([494, 698, 0, 698, 659, 587, 523, 330, 262], 0.13, 0.16, 'square', 0.11),
    tick: () => tone(1175, 0, 0.04, 'square', 0.05),
    clear: () => seq([392, 523, 659, 784, 1047, 1319, 1568, 1319, 1568], 0.11, 0.16, 'square', 0.1),
    gameover: () => seq([523, 0, 392, 0, 330, 440, 494, 440, 415, 392], 0.16, 0.22, 'triangle', 0.22),
  };

  // --- Background tune: a short original loop, scheduled slightly ahead of time ---
  const C = 261.63, D = 293.66, E = 329.63, G = 392.0, A = 440.0, B = 493.88;
  const MELODY = [
    E * 2, 0, C * 2, E * 2, 0, G * 2, 0, E * 2,
    D * 2, 0, B, D * 2, 0, G, 0, 0,
    C * 2, 0, A, C * 2, 0, E * 2, 0, C * 2,
    D * 2, E * 2, D * 2, B, G, 0, 0, 0,
  ];
  const BASS = [
    C / 2, 0, G / 2, 0, C / 2, 0, G / 2, 0,
    G / 4, 0, D / 2, 0, G / 4, 0, D / 2, 0,
    A / 4, 0, E / 2, 0, A / 4, 0, E / 2, 0,
    G / 4, 0, D / 2, 0, G / 4, 0, B / 4, 0,
  ];
  const STEP = 0.16;

  function schedule() {
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const i = musicStep % MELODY.length;
      if (MELODY[i]) toneAt(MELODY[i], nextNoteTime, STEP * 0.9, 'square', 0.045);
      if (BASS[i]) toneAt(BASS[i], nextNoteTime, STEP * 1.7, 'triangle', 0.12);
      nextNoteTime += STEP;
      musicStep++;
    }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.08;
    musicTimer = setInterval(schedule, 60);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { init, sfx, startMusic, stopMusic, toggleMute };
})();
