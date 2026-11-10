(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const wait = ms => new Promise(r => setTimeout(r, ms));
const fx = $('#fx');
const isTouch = matchMedia('(pointer:coarse)').matches;

/* ---------------------------------------------------------
   Sound (WebAudio, no files)
--------------------------------------------------------- */
let audio = null, soundOn = true;
function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audio && audio.state === 'suspended') audio.resume();
  return audio;
}
function tone(f, t = 0, d = .12, type = 'square', v = .05) {
  if (!soundOn) return;
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, s);
  g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(.0001, s + d);
  o.connect(g).connect(a.destination); o.start(s); o.stop(s + d + .02);
}

let _master = null, _noise = null, dest = null;
function master() {
  const a = ac(); if (!a) return null;
  if (_master) return _master;
  const comp = a.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .25;
  const m = a.createGain(); m.gain.value = .9;
  const len = a.sampleRate * 1.8, buf = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
  const cv = a.createConvolver(); cv.buffer = buf; const wet = a.createGain(); wet.gain.value = .3;
  m.connect(comp); m.connect(cv); cv.connect(wet); wet.connect(comp); comp.connect(a.destination);
  _master = m; return m;
}
function noiseBuf() {
  const a = ac(); if (_noise) return _noise;
  const len = a.sampleRate * 2.5; _noise = a.createBuffer(1, len, a.sampleRate);
  const d = _noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _noise;
}
function noiseHit(t, dur, type, f, q, vol, f2) {
  const a = ac(), m = dest || master(); if (!a || !m) return;
  t = Math.max(0, t);
  const s = a.currentTime + t, n = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  n.buffer = noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, s); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, s + dur);
  g.gain.setValueAtTime(vol, s); g.gain.exponentialRampToValueAtTime(.0008, s + dur);
  n.connect(fl).connect(g).connect(m); n.start(s, Math.random()); n.stop(s + dur + .05);
}
function osc(type, f, t, dur, vol, atk = .005, f2, lp) {
  const a = ac(), m = dest || master(); if (!a || !m) return;
  t = Math.max(0, t);
  const s = a.currentTime + t, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, s); if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + dur);
  g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + atk); g.gain.exponentialRampToValueAtTime(.0008, s + dur);
  let node = o;
  if (lp) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp[0], s); fl.frequency.exponentialRampToValueAtTime(lp[1], s + dur * .6); o.connect(fl); node = fl; }
  node.connect(g).connect(m); o.start(s); o.stop(s + dur + .05);
}
/* 太鼓：皮の胴鳴り + 倍音 + バチの当たり音 + 響き */
function taiko(big = false, t = 0, vel = 1) {
  if (!soundOn || !ac()) return;
  const f0 = (big ? 88 : 122) * rand(.97, 1.04), dur = big ? 1.2 : .6;
  osc('sine', f0 * 2.1, t, dur, .95 * vel, .003, f0 * .72);
  osc('sine', f0 * 1.58, t, dur * .5, .35 * vel, .003, f0 * 1.2);
  osc('triangle', f0 * 3.3, t, .16, .12 * vel, .002);
  noiseHit(t, .035, 'bandpass', 2200, .9, .55 * vel);
  noiseHit(t, .12, 'lowpass', 600, .7, .5 * vel, 120);
  if (big) noiseHit(t, .5, 'lowpass', 220, .5, .25 * vel, 70);
}
function brass(f, t, dur, vol = .12) {
  osc('sawtooth', f, t, dur, vol, .06, undefined, [380, 2600]);
  osc('sawtooth', f * 1.005, t, dur, vol * .8, .06, undefined, [380, 2600]);
  osc('square', f * .5, t, dur, vol * .5, .08, undefined, [300, 1200]);
}
function cymbal(t, vol = .35) { noiseHit(t, 2.2, 'highpass', 5200, .4, vol); noiseHit(t, 1.2, 'bandpass', 9000, 1.2, vol * .6); }

/* ---------------------------------------------------------
   BGM（その場で演奏します。音のファイルは使いません）
   main = 冒険のテーマ / boss = 大サタン戦
--------------------------------------------------------- */
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const TRACKS = {
  main: {
    bpm: 128, bars: 8, vol: .6,
    CH: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],      // Am F C G
    BASS: [33, 29, 36, 31],
    MEL: [
      [[0, 69, 3], [4, 72, 1], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
      [[0, 72, 3], [4, 69, 1], [6, 72, 2], [8, 77, 4], [12, 76, 4]],
      [[0, 76, 3], [4, 79, 1], [6, 76, 2], [8, 72, 4], [12, 74, 4]],
      [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 8]],
      [[0, 81, 4], [4, 79, 2], [6, 76, 2], [8, 77, 4], [12, 76, 4]],
      [[0, 77, 3], [4, 76, 1], [6, 72, 2], [8, 74, 4], [12, 72, 4]],
      [[0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 84, 4], [12, 83, 2], [14, 79, 2]],
      [[0, 81, 4], [4, 79, 4], [8, 74, 6], [14, 71, 2]]
    ],
    step(s, t) {
      const bar = s >> 4, st = s & 15, ci = bar % 4, spb = 60 / this.bpm / 4;
      const ch = this.CH[ci], b = this.BASS[ci];
      if (st === 0) ch.forEach(m => osc('triangle', mf(m + 12), t, spb * 16, .04, .3));
      if (st % 2 === 0) osc('sawtooth', mf(b + (st % 8 === 6 ? 12 : 0)), t, spb * 1.9, .12, .005, undefined, [700, 200]);
      osc('square', mf(ch[[0, 1, 2, 1][st % 4]] + (st % 8 >= 4 ? 24 : 12)), t, spb * 1.3, .03, .002, undefined, [3200, 700]);
      (this.MEL[bar] || []).forEach(([ms, m, len]) => {
        if (ms !== st) return;
        osc('sawtooth', mf(m), t, spb * len * .95, .075, .03, undefined, [1300, 3400]);
        osc('square', mf(m + 12), t, spb * len * .6, .018, .02, undefined, [2000, 5000]);
      });
      if (st === 4 || st === 12) noiseHit(t, .12, 'bandpass', 1800, .8, .16);
      if (st % 2 === 0) noiseHit(t, .03, 'highpass', 7000, .5, .05);
      if (bar % 4 === 3 && st >= 12) noiseHit(t, .08, 'bandpass', 2200, .8, .12);
      if (bar % 8 === 0 && st === 0) cymbal(t, .1);
    }
  },
  quest: {
    bpm: 100, bars: 8, vol: .62,
    CH: [[64, 67, 71], [60, 64, 67], [57, 60, 64], [59, 63, 66], [64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66]],   // Em C Am B | Em C D B
    BASS: [40, 36, 33, 35, 40, 36, 38, 35],
    OST: [0, 0, 7, 0, 0, 7, 3, 0],
    MEL: [
      [[0, 76, 6], [6, 79, 2], [8, 83, 6], [14, 81, 2]],
      [[0, 84, 6], [6, 83, 2], [8, 79, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 76, 6], [14, 79, 2]],
      [[0, 78, 4], [4, 81, 4], [8, 83, 8]],
      [[0, 88, 6], [6, 86, 2], [8, 83, 6], [14, 79, 2]],
      [[0, 84, 4], [4, 83, 2], [6, 81, 2], [8, 79, 8]],
      [[0, 78, 4], [4, 81, 4], [8, 86, 6], [14, 83, 2]],
      [[0, 83, 8], [8, 81, 4], [12, 83, 4]]
    ],
    step(s, t) {
      const bar = s >> 4, st = s & 15, spb = 60 / this.bpm / 4;
      const ch = this.CH[bar], b = this.BASS[bar];
      // 緊張感のある和音
      if (st === 0) ch.forEach(m => osc('sawtooth', mf(m), t, spb * 16, .025, .4, undefined, [500, 1100]));
      // 前へ押し出すベース
      if (st % 2 === 0) osc('sawtooth', mf(b + (st % 8 === 6 ? 12 : 0)), t, spb * 1.8, .13, .004, undefined, [800, 180]);
      // 切り込むような弦のオスティナート
      osc('square', mf(b + 24 + this.OST[st % 8]), t, spb * .8, .03, .002, undefined, [2600, 600]);
      // ファンファーレ（金管）
      (this.MEL[bar] || []).forEach(([ms, m, len]) => {
        if (ms !== st) return;
        brass(mf(m), t, spb * len * .95, .06);
        osc('triangle', mf(m + 12), t, spb * len * .6, .025, .02);
      });
      // 戦いのリズム：キック、スネアのバックビート、小太鼓の連打
      if (st === 0 || st === 8 || (st === 6 && bar % 2 === 1)) osc('sine', 140, t, .15, .5, .002, 45);
      if (st === 4 || st === 12) { noiseHit(t, .16, 'bandpass', 1800, .8, .22); noiseHit(t, .06, 'highpass', 3500, .5, .1); }
      if (st === 10) noiseHit(t, .07, 'bandpass', 2000, .8, .08);
      if (bar % 4 === 3 && st >= 8) noiseHit(t, .07 + (st - 8) * .002, 'bandpass', 2200, .8, .1 + (st - 8) * .018);
      noiseHit(t, .03, 'highpass', 7500, .5, st % 2 ? .03 : .055);
      if (bar % 4 === 0 && st === 0) cymbal(t, .09);
    }
  },
  boss: {
    bpm: 148, bars: 8, vol: .65,
    CH: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],     // Dm Bb Gm A
    BASS: [38, 34, 31, 33],
    RIFF: [
      [[0, 62, 3], [3, 63, 1], [4, 62, 2], [6, 58, 2], [8, 62, 8]],
      [[0, 58, 3], [3, 59, 1], [4, 58, 2], [6, 53, 2], [8, 58, 8]],
      [[0, 67, 3], [3, 68, 1], [4, 67, 2], [6, 62, 2], [8, 67, 8]],
      [[0, 69, 3], [3, 70, 1], [4, 69, 2], [6, 64, 2], [8, 73, 4], [12, 74, 4]]
    ],
    OST: [0, 0, 12, 0, 7, 0, 12, 3],
    step(s, t) {
      const bar = s >> 4, st = s & 15, ci = bar % 4, spb = 60 / this.bpm / 4;
      const ch = this.CH[ci], b = this.BASS[ci];
      if (st === 0) {
        ch.forEach(m => osc('sawtooth', mf(m + 12), t, spb * 16, .03, .5, undefined, [500, 1000]));
        noiseHit(t, 1.4, 'lowpass', 140, .8, .16, 60);
      }
      if (st % 2 === 0) osc('sawtooth', mf(b), t, spb * 1.9, .14, .004, undefined, [800, 150]);
      osc('square', mf(b + 24 + this.OST[st % 8]), t, spb * .75, .032, .002, undefined, [2400, 500]);
      (this.RIFF[ci] || []).forEach(([ms, m, len]) => { if (ms === st) brass(mf(m + (bar >= 4 ? 12 : 0)), t, spb * len * .95, .06); });
      if (st === 4 || st === 12) noiseHit(t, .18, 'bandpass', 1600, .7, .26);
      if (bar % 4 === 0 && st === 0) cymbal(t, bar === 0 ? .2 : .1);
    }
  }
};
const bgm = { want: null, name: null, bus: null, timer: 0, nextT: 0, step: 0, unlocked: false };
function bgmStop(fade = .6) {
  clearInterval(bgm.timer); bgm.timer = 0; bgm.name = null;
  const a = audio, b = bgm.bus; bgm.bus = null;
  if (!a || !b) return;
  const n = a.currentTime;
  b.gain.cancelScheduledValues(n); b.gain.setValueAtTime(b.gain.value, n); b.gain.linearRampToValueAtTime(0, n + fade);
  setTimeout(() => { try { b.disconnect(); } catch (e) {} }, fade * 1000 + 300);
}
function bgmPlay(name) {
  bgm.want = name;
  if (!soundOn || !bgm.unlocked) return;
  const a = ac(), m = master(); if (!a || !m) return;
  if (bgm.name === name) return;
  if (bgm.timer) bgmStop(.25);
  const g = a.createGain(), now = a.currentTime;
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(TRACKS[name].vol, now + .35);
  g.connect(m); bgm.bus = g; bgm.name = name; bgm.step = 0; bgm.nextT = now + .15;
  bgm.timer = setInterval(bgmTick, 30);
}
function bgmTick() {
  const a = audio, tr = TRACKS[bgm.name]; if (!a || !tr || !soundOn) return;
  while (bgm.nextT < a.currentTime + .3) {
    dest = bgm.bus;
    try { tr.step(bgm.step, bgm.nextT - a.currentTime); } finally { dest = null; }
    bgm.nextT += 60 / tr.bpm / 4; bgm.step = (bgm.step + 1) % (tr.bars * 16);
  }
}
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown', 'click', 'wheel', 'scroll'];
function bgmUnlock(e) {
  if (bgm.unlocked) return;
  const a = ac(); if (!a) return;
  const ok = () => {
    if (a.state !== 'running' || bgm.unlocked) return;
    bgm.unlocked = true;
    UNLOCK_EVENTS.forEach(ev => removeEventListener(ev, bgmUnlock, true));
    if (soundOn) bgmPlay(bgm.want || 'main');
  };
  if (a.state === 'running') ok(); else a.resume().then(ok).catch(() => {});
}
// タップ・キー・スクロールのどれかでブラウザが許可した時点で、すぐに再生を始める
UNLOCK_EVENTS.forEach(ev => addEventListener(ev, bgmUnlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) audio.suspend(); else if (soundOn) audio.resume();
});
/* 開いた時点で再生を試みる。ブラウザが許可しない場合は、最初のタップですぐ始める */
(function tryAutoplay() {
  try {
    const a = ac(); if (!a) return;
    const go = () => { if (a.state === 'running' && !bgm.unlocked) bgmUnlock(); };
    a.addEventListener('statechange', go);
    a.resume().then(go).catch(() => {});
    go();
  } catch (e) {}
})();
const sfx = {
  tap: () => tone(rand(780, 980), 0, .07, 'triangle'),
  ok: () => [660, 880, 1320].forEach((f, i) => tone(f, i * .09, .16)),
  ng: () => { tone(180, 0, .25, 'sawtooth', .07); tone(120, .12, .3, 'sawtooth', .07); },
  hit: () => { tone(300, 0, .1); tone(620, .05, .16); tone(900, .1, .2, 'triangle'); },
  boom: () => { tone(90, 0, .5, 'sawtooth', .09); tone(60, .1, .6, 'square', .07); },
  win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * .12, .3, 'triangle', .07)),
  don: () => taiko(false),
  taikoBig: () => taiko(true),
  taikoWin: () => sfx.victory(),
  bossAppear: () => {
    if (!soundOn || !ac()) return;
    osc('sawtooth', 55, 0, 3.2, .22, 1.4, 49, [90, 260]);
    osc('sawtooth', 58.3, 0, 3.2, .22, 1.4, 52, [90, 260]);
    noiseHit(0, 2.6, 'lowpass', 160, .8, .5, 40);
    noiseHit(.3, 1.4, 'bandpass', 1100, 2.5, .22, 140);
    taiko(true, .1, 1); taiko(true, 1.0, .9); taiko(true, 1.7, 1);
    brass(130.8, .5, 1.6, .13); brass(185, .5, 1.6, .1);
    brass(98, 1.9, 1.5, .16); brass(138.6, 1.9, 1.5, .12); taiko(true, 2.0, 1.1); noiseHit(2.0, 1.2, 'bandpass', 700, 1.5, .3, 90);
  },
  bossStab: () => { taiko(true, 0, .9); brass(98, 0, .7, .12); brass(139, 0, .7, .09); },
  victory: () => {
    if (!soundOn || !ac()) return;
    taiko(true, 0); cymbal(0, .3); taiko(true, .28); taiko(true, .56);
    for (let i = 0; i < 14; i++) taiko(false, .9 + i * (.16 - i * .006), .55 + i * .04);
    taiko(true, 2.0, 1.2); taiko(true, 2.35, 1.2); cymbal(2.0, .45);
    const C = [261.6, 329.6, 392, 523.3];
    C.forEach(f => brass(f, 2.0, 2.2, .13));
    brass(130.8, 2.0, 2.2, .14);
    [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => { osc('triangle', f, 2.6 + i * .1, .9, .09, .004); osc('sine', f * 2, 2.6 + i * .1, .6, .05, .004); });
    for (let i = 0; i < 14; i++) osc('sine', rand(1800, 4200), 2.2 + i * .14, .35, .04, .004);
    taiko(true, 3.4, 1.1); cymbal(3.4, .3);
  },
  appear: () => { tone(110, 0, .4, 'sawtooth', .06); tone(165, .2, .5, 'sawtooth', .06); }
};
const soundBtn = $('#soundBtn');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', soundOn);
  soundBtn.textContent = soundOn ? '音 ON' : '音 OFF';
  if (soundOn) { sfx.tap(); bgm.unlocked = true; bgmPlay(bgm.want || 'main'); } else bgmStop(.4);
});

/* ---------------------------------------------------------
   Hearts FX
--------------------------------------------------------- */
function burst(x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const h = document.createElement('i');
    h.className = 'fx-heart pop';
    const a = rand(0, Math.PI * 2), r = rand(40, 130);
    h.style.left = x + 'px'; h.style.top = y + 'px';
    h.style.setProperty('--dx', Math.cos(a) * r + 'px');
    h.style.setProperty('--dy', Math.sin(a) * r - 50 + 'px');
    h.style.setProperty('--s', rand(.6, 1.5).toFixed(2));
    h.style.setProperty('--rot', rand(-60, 60).toFixed(0) + 'deg');
    fx.appendChild(h);
    setTimeout(() => h.remove(), 950);
  }
}
function shoot(from, to, n = 10, cb) {
  if (fx.childElementCount > 90) { cb && cb(); return; }
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
  const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  let done = 0;
  for (let i = 0; i < n; i++) {
    const h = document.createElement('i');
    h.className = 'fx-heart';
    h.style.left = x0 + 'px'; h.style.top = y0 + 'px';
    fx.appendChild(h);
    const mx = (x1 - x0) / 2 + rand(-90, 90), my = (y1 - y0) / 2 - rand(60, 160);
    const tx = x1 - x0 + rand(-30, 30), ty = y1 - y0 + rand(-30, 30);
    const an = h.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${mx}px),calc(-50% + ${my}px)) scale(1.1)`, opacity: 1, offset: .5 },
      { transform: `translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px)) scale(.7)`, opacity: .9 }
    ], { duration: rand(520, 720), delay: i * 45, easing: 'ease-in', fill: 'both' });
    an.onfinish = () => { h.remove(); if (++done === n && cb) cb(); };
  }
}

/* ---------------------------------------------------------
   SVG parts
--------------------------------------------------------- */
const HEART = 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z';
const heartSVG = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}"/></svg>`;
const RCOL = ['#e0262b', '#2b6bff', '#ffd22b', '#262626', '#ff6fae', '#22b36b'];

function rangerSVG(c, phone = true) {
  return `<svg viewBox="0 -14 100 144" aria-hidden="true">
  <path d="M30 54 L14 94 L25 99 L40 62Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <path d="M66 54 L80 18 L91 23 L78 62Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  ${phone ? `<g transform="translate(74 -12) rotate(10)"><rect width="24" height="38" rx="5" fill="#16162e" stroke="#ff5d7e" stroke-width="2.5"/><path transform="translate(4 9) scale(.67)" fill="#ff5d7e" d="${HEART}"/></g>` : ''}
  <path d="M27 52 Q50 42 73 52 L69 102 L31 102Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <path d="M50 54 L62 76 L50 98 L38 76Z" fill="#fff"/>
  <rect x="31" y="100" width="38" height="8" rx="2" fill="#ddd"/>
  <rect x="45" y="98" width="10" height="12" rx="2" fill="#ffd84a" stroke="#9a5a08"/>
  <path d="M33 108 H48 V130 H30Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <path d="M52 108 H67 L70 130 H52Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <circle cx="50" cy="30" r="21" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <path d="M33 28 Q50 19 67 28 L65 41 Q50 48 35 41Z" fill="#111"/>
  <path d="M38 27 Q46 23 52 24" stroke="rgba(255,255,255,.6)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M30 20 Q34 10 50 9" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
}

function monsterSVG(kind, c, d) {
  const eyes = (y = 88, g = 26) => `<ellipse cx="${100 - g}" cy="${y}" rx="13" ry="15" fill="#fff"/><ellipse cx="${100 + g}" cy="${y}" rx="13" ry="15" fill="#fff"/>
  <circle cx="${100 - g + 3}" cy="${y + 2}" r="6" fill="#200"/><circle cx="${100 + g - 3}" cy="${y + 2}" r="6" fill="#200"/>
  <path d="M${100 - g - 18} ${y - 24} L${100 - g + 14} ${y - 12}" stroke="#200" stroke-width="6" stroke-linecap="round"/>
  <path d="M${100 + g + 18} ${y - 24} L${100 + g - 14} ${y - 12}" stroke="#200" stroke-width="6" stroke-linecap="round"/>`;
  const mouth = `<path d="M68 122 L78 134 L89 122 L100 134 L111 122 L122 134 L132 122 Q100 156 68 122Z" fill="#200" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>`;
  let body = '';
  if (kind === 0) {
    body = `<path d="M45 52 L58 6 L84 46Z" fill="${d}"/><path d="M155 52 L142 6 L116 46Z" fill="${d}"/>
    <ellipse cx="22" cy="118" rx="16" ry="11" fill="${c}" stroke="${d}" stroke-width="4"/><ellipse cx="178" cy="118" rx="16" ry="11" fill="${c}" stroke="${d}" stroke-width="4"/>
    <path d="M28 150 C6 80 40 34 100 34 C160 34 194 80 172 150 Q100 172 28 150Z" fill="${c}" stroke="${d}" stroke-width="4"/>${eyes()}${mouth}`;
  } else if (kind === 1) {
    body = `<path d="M28 168 L28 84 C28 40 62 18 100 18 C138 18 172 40 172 84 L172 168 L150 150 L125 170 L100 150 L75 170 L50 150Z" fill="${c}" stroke="${d}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="100" cy="82" rx="32" ry="36" fill="#fff" stroke="${d}" stroke-width="3"/><circle cx="104" cy="86" r="16" fill="#d01030"/><circle cx="104" cy="86" r="7" fill="#200"/>
    <path d="M62 50 L136 66" stroke="#200" stroke-width="7" stroke-linecap="round"/>
    <path d="M70 130 Q100 112 130 130" stroke="#200" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M44 100 q-24 8 -22 30 M156 100 q24 8 22 30" stroke="${d}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  } else {
    let pts = '';
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2, r = i % 2 ? 66 : 92;
      pts += `${(100 + Math.cos(a) * r).toFixed(1)},${(92 + Math.sin(a) * r * .92).toFixed(1)} `;
    }
    body = `<polygon points="${pts}" fill="${d}" stroke="${d}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="100" cy="92" r="64" fill="${c}" stroke="${d}" stroke-width="4"/>${eyes(84, 24)}${mouth.replace(/ 122/g, ' 118').replace(/134/g, '130')}`;
  }
  return `<svg viewBox="0 0 200 180" aria-hidden="true">${body}</svg>`;
}

function bossSVG() {
  const wing = `<path d="M150 150 C96 70 24 64 6 124 C30 114 42 126 48 144 C62 132 80 140 88 158 C104 150 122 158 134 178Z" fill="#2a0a4a" stroke="#120020" stroke-width="3"/>`;
  return `<svg viewBox="0 -20 300 320" aria-hidden="true">
  <defs><radialGradient id="bg" cx="50%" cy="40%"><stop offset="0" stop-color="#b050ff" stop-opacity=".55"/><stop offset="1" stop-color="#b050ff" stop-opacity="0"/></radialGradient></defs>
  <circle cx="150" cy="130" r="150" fill="url(#bg)"/>
  ${wing}<g transform="translate(300 0) scale(-1 1)">${wing}</g>
  <path d="M86 140 L50 296 L250 296 L214 140Z" fill="#7a0a1a" stroke="#2a0008" stroke-width="4"/>
  <path d="M98 128 Q150 108 202 128 L224 256 L76 256Z" fill="#3a1170" stroke="#120020" stroke-width="4"/>
  <path d="M150 150 L172 192 L150 236 L128 192Z" fill="#ff3b3b" opacity=".85"/>
  <path d="M96 72 C58 44 44 6 66 -14 C68 16 90 34 114 50Z" fill="#e8dcc0" stroke="#120020" stroke-width="3"/>
  <path d="M204 72 C242 44 256 6 234 -14 C232 16 210 34 186 50Z" fill="#e8dcc0" stroke="#120020" stroke-width="3"/>
  <circle cx="150" cy="88" r="60" fill="#4b1a8f" stroke="#120020" stroke-width="4"/>
  <path d="M100 76 L142 92 L136 108 L102 98Z" fill="#ffe14a"/><path d="M200 76 L158 92 L164 108 L198 98Z" fill="#ffe14a"/>
  <circle cx="124" cy="96" r="5" fill="#a00"/><circle cx="176" cy="96" r="5" fill="#a00"/>
  <path d="M106 120 Q150 156 194 120 L184 132 L172 122 L160 136 L150 124 L140 136 L128 122 L116 132Z" fill="#120020"/>
  <path d="M120 122 L126 140 L132 124Z M180 122 L174 140 L168 124Z" fill="#fff"/>
</svg>`;
}

/* ---------------------------------------------------------
   Hearts grid (story + rally)
--------------------------------------------------------- */
function makeGrid(el, n = 100) {
  el.innerHTML = '';
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'cell'; c.setAttribute('aria-label', 'ハート');
    c.innerHTML = heartSVG();
    el.appendChild(c); cells.push(c);
  }
  return cells;
}
function tapCell(c, e) {
  c.classList.remove('boing'); void c.offsetWidth; c.classList.add('boing');
  const r = c.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 5);
  sfx.tap();
}

/* ---------------------------------------------------------
   Hero : kinetic title + leaves
--------------------------------------------------------- */
const hero = $('#hero');
const chars = [];
$$('.line', $('#title')).forEach((line, li) => {
  [...line.dataset.text].forEach((t, i) => {
    const s = document.createElement('span'); s.className = 'ch';
    const ie = document.createElement('i'); ie.textContent = t;
    ie.style.setProperty('--d', (li * .55 + i * .09).toFixed(2) + 's');
    s.appendChild(ie); line.appendChild(s);
    chars.push({ el: s, x: 0, y: 0 });
  });
});
let heroVisible = true, px = -9999, py = -9999, boost = 1, boostTimer;
new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; if (heroVisible) loop(); }).observe(hero);
hero.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; });
hero.addEventListener('pointerleave', () => { px = py = -9999; });
hero.addEventListener('pointerdown', e => {
  px = e.clientX; py = e.clientY; boost = 2.4;
  clearTimeout(boostTimer);
  boostTimer = setTimeout(() => { boost = 1; if (isTouch) px = py = -9999; }, 380);
  if (e.target.closest('a')) return;
  burst(e.clientX, e.clientY, 9); sfx.tap();
});

const cv = $('#leaves'), cx = cv.getContext('2d');
let leaves = [], cw = 0, ch = 0;
const LIGHT_COL = ['255,236,150', '255,255,255', '255,150,190', '255,190,90', '150,220,255'];
function sizeCanvas() {
  const d = Math.min(devicePixelRatio || 1, 2);
  cw = hero.clientWidth; ch = hero.clientHeight;
  cv.width = cw * d; cv.height = ch * d; cx.setTransform(d, 0, 0, d, 0, 0);
  const n = cw < 600 ? 18 : 34;
  leaves = Array.from({ length: n }, () => newLeaf(true));
}
function newLeaf(init) {
  return { x: rand(0, cw), y: init ? rand(-ch * .2, ch) : rand(-60, -10), s: rand(2.5, 9), vy: rand(.5, 1.8), sw: rand(.15, .6), ph: rand(0, 6.3),
    tw: rand(.03, .08), star: Math.random() < .35, c: LIGHT_COL[(Math.random() * LIGHT_COL.length) | 0] };
}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let tPrev = 0;
function loop(t = 0) {
  if (!heroVisible) return;
  requestAnimationFrame(loop);
  const dt = Math.min(2, (t - tPrev) / 16.7 || 1); tPrev = t;
  // leaves
  cx.clearRect(0, 0, cw, ch);
  if (!reduce) {
    cx.globalCompositeOperation = 'lighter';
    for (const l of leaves) {
      l.y += l.vy * dt; l.ph += l.tw * dt; l.x += Math.sin(l.ph * .5) * l.sw * dt;
      if (l.y > ch + 30) Object.assign(l, newLeaf(false), { x: rand(0, cw) });
      const tw = .55 + .45 * Math.sin(l.ph * 2.2), r = l.s * (l.star ? 2.4 : 2);
      // trail
      const g = cx.createLinearGradient(l.x, l.y - l.s * 9, l.x, l.y);
      g.addColorStop(0, `rgba(${l.c},0)`); g.addColorStop(1, `rgba(${l.c},${.35 * tw})`);
      cx.fillStyle = g; cx.fillRect(l.x - l.s * .18, l.y - l.s * 9, l.s * .36, l.s * 9);
      // glow
      const rg = cx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 2.2);
      rg.addColorStop(0, `rgba(255,255,255,${tw})`); rg.addColorStop(.25, `rgba(${l.c},${.8 * tw})`); rg.addColorStop(1, `rgba(${l.c},0)`);
      cx.fillStyle = rg; cx.beginPath(); cx.arc(l.x, l.y, r * 2.2, 0, 6.283); cx.fill();
      if (l.star) { // sparkle cross
        cx.strokeStyle = `rgba(255,255,255,${tw})`; cx.lineWidth = 1.2;
        const k = r * 2.6 * tw; cx.beginPath();
        cx.moveTo(l.x - k, l.y); cx.lineTo(l.x + k, l.y); cx.moveTo(l.x, l.y - k); cx.lineTo(l.x, l.y + k); cx.stroke();
      }
    }
    cx.globalCompositeOperation = 'source-over';
  }
  // kinetic chars: repel from pointer
  const R = (cw < 600 ? 120 : 170);
  for (const c of chars) {
    const r = c.el.getBoundingClientRect();
    const bx = r.left + r.width / 2 - c.x, by = r.top + r.height / 2 - c.y;
    const dx = bx - px, dy = by - py, d = Math.hypot(dx, dy) || 1;
    let tx = 0, ty = 0;
    if (d < R) { const f = (1 - d / R) * 70 * boost; tx = dx / d * f; ty = dy / d * f; }
    c.x += (tx - c.x) * .16; c.y += (ty - c.y) * .16;
    if (Math.abs(c.x) < .05 && Math.abs(c.y) < .05 && !tx && !ty) { c.x = c.y = 0; c.el.style.translate = ''; }
    else c.el.style.translate = `${c.x.toFixed(1)}px ${c.y.toFixed(1)}px`;
  }
}
sizeCanvas(); loop();
addEventListener('resize', sizeCanvas);

/* ---------------------------------------------------------
   Scroll-linked effects
--------------------------------------------------------- */
const progress = $('#progress'), heroBg = $('#heroBg'), heroInner = $('#heroInner');
const track = $('#marqueeTrack'), storyPin = $('#storyPin');
const cnt = $('#cnt'), cntPlus = $('#cntPlus'), caps = $$('.cap');
const sCells = makeGrid($('#storyGrid'));
const manual = new Set();
sCells.forEach((c, i) => c.addEventListener('click', () => {
  if (manual.has(i)) manual.delete(i); else manual.add(i);
  tapCell(c); lastN = -1; paintStory();
}));
let lastN = -1, sp = 0;
function paintStory() {
  const n = 1 + Math.round(99 * clamp(sp / .75, 0, 1));
  if (n !== lastN) {
    lastN = n; cnt.textContent = n; cntPlus.classList.toggle('on', n >= 100);
    sCells.forEach((c, i) => { c.classList.toggle('lit', i < n || manual.has(i)); c.classList.toggle("gold", i >= 1); });
  }
  const ci = sp < .34 ? 0 : sp < .67 ? 1 : 2;
  caps.forEach((c, i) => c.classList.toggle('on', i === ci));
}
let ticking = false;
function update() {
  ticking = false;
  const y = scrollY, H = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = (H > 0 ? y / H * 100 : 0) + '%';
  const hh = hero.offsetHeight;
  if (y < hh * 1.2) {
    const p = y / hh;
    heroBg.style.transform = `translate3d(0,${p * 90}px,0)`;
    heroInner.style.transform = `translate3d(0,${p * -60}px,0)`;
    heroInner.style.opacity = clamp(1 - p * 1.15, 0, 1);
  }
  const period = track.scrollWidth / 3;
  track.style.transform = `translate3d(${-((y * .6) % period)}px,0,0)`;
  const r = storyPin.getBoundingClientRect();
  sp = clamp(-r.top / (r.height - innerHeight), 0, 1);
  paintStory();
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
addEventListener('resize', update);
update();

// reveal
$$('.game-title,.kicker.center,.cabinet').forEach(e => e.classList.add('reveal'));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
$$('.reveal').forEach(e => io.observe(e));

/* ---------------------------------------------------------
   GAME
--------------------------------------------------------- */
const Q0 = window.QUIZ_DATA || [], EN = window.ENEMY_DATA || [], BOSS = window.BOSS_DATA || { name: '大サタン' };
let flags = Q0.map(q => !!q.boss);
if (!flags.some(Boolean) && Q0.length) { const k = Q0.length >= 6 ? 3 : 1; for (let i = Q0.length - k; i < Q0.length; i++) flags[i] = true; }
const LIST = Q0.map((q, i) => ({ ...q, boss: flags[i] }));
LIST.sort((a, b) => (a.boss - b.boss));          // stable: boss questions last
const TOTAL = LIST.length, BOSS_N = LIST.filter(q => q.boss).length;

const el = id => document.getElementById(id);
const screens = { start: el('screenStart'), battle: el('screenBattle'), result: el('screenResult') };
const panels = { quiz: el('pQuiz'), fb: el('pFeedback'), rally: el('pRally'), finale: el('pFinale'), over: el('pOver') };
const arena = el('arena'), enemy = el('enemy'), enemySvg = el('enemySvg'), phone = el('phone'), rangerBig = el('rangerBig');
const banner = el('banner'), hpFill = el('hpFill'), barrier = el('barrier');

el('startRanger').innerHTML = rangerSVG(RCOL[0]);
rangerBig.insertAdjacentHTML('afterbegin', rangerSVG(RCOL[0]));

let S;
function newState() {
  return { i: 0, lives: 3, correct: 0, wrong: 0, missed: [], rallied: false, qMissed: false, retry: false, bossHits: 0, normalIdx: 0, locked: false,
    finale: { taps: 0, need: 30, started: false, over: false, t0: 0, raf: 0 }, squadShown: 0 };
}
const squadFor = c => c >= TOTAL ? 100 : 1 + Math.floor(99 * c / Math.max(1, TOTAL));
const fmtSquad = n => n >= 100 ? '100+' : n;

function showScreen(name) {
  Object.entries(screens).forEach(([k, v]) => v.classList.toggle('on', k === name));
}
function showPanel(name) {
  Object.entries(panels).forEach(([k, v]) => v.hidden = k !== name);
}
function showBanner(text) {
  banner.textContent = text; banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
}
function flash(cls) { arena.classList.remove(cls); void arena.offsetWidth; arena.classList.add(cls); setTimeout(() => arena.classList.remove(cls), 700); }
function renderLives() {
  el('lives').innerHTML = [0, 1, 2].map(i => heartSVG().replace('<svg', `<svg class="${i < S.lives ? '' : 'off'}"`)).join('');
}
function renderSquad() {
  const n = squadFor(S.correct);
  const sn = el('squadNum'); sn.textContent = fmtSquad(n);
  const row = el('squadRow');
  const want = Math.max(1, Math.round(n / 100 * 14));
  if (S.squadShown > want) { row.innerHTML = ''; S.squadShown = 0; }
  while (S.squadShown < want) {
    row.insertAdjacentHTML('beforeend', rangerSVG(RCOL[S.squadShown % RCOL.length], true));
    S.squadShown++;
  }
}
function setEnemy(isBoss) {
  arena.classList.toggle('boss', isBoss);
  enemy.classList.toggle('boss', isBoss);
  enemy.classList.remove('defeat', 'hit', 'lunge', 'prebreak', 'gone'); enemySvg.style.visibility = '';
  hpFill.style.transition = 'none'; hpFill.style.width = '100%'; void hpFill.offsetWidth; hpFill.style.transition = '';
  barrier.innerHTML = '';
  if (isBoss) {
    enemySvg.innerHTML = bossSVG(); el('enemyName').textContent = BOSS.name;
    for (let i = 0; i < BOSS_N; i++) {
      const r = document.createElement('div'); r.className = 'ring'; r.style.inset = `-${4 + i * 5}%`; barrier.appendChild(r);
    }
  } else {
    const e = EN.length ? EN[S.normalIdx % EN.length] : { name: '敵', kind: 0, color: '#6c7bff', dark: '#2b2f8f' };
    enemySvg.innerHTML = monsterSVG(e.kind, e.color, e.dark); el('enemyName').textContent = e.name;
  }
  enemy.classList.remove('enter'); void enemy.offsetWidth; enemy.classList.add('enter');
}

function startGame() {
  S = newState();
  bgmPlay('quest');
  // 通常戦の出題順を毎回ランダムに（大サタン戦は最後に固定）
  const nn = TOTAL - BOSS_N;
  for (let i = nn - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [LIST[i], LIST[j]] = [LIST[j], LIST[i]]; }
  showScreen('battle');
  el('squadRow').innerHTML = '';
  renderLives(); renderSquad();
  el('cabinet').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  loadQuestion();
}

function loadQuestion() {
  const q = LIST[S.i];
  if (q.boss && !S.rallied) { doRally(); return; }
  S.locked = false;
  setEnemy(q.boss);
  if (q.boss) { for (let k = 0; k < S.bossHits; k++) barrier.children[barrier.children.length - 1 - k]?.classList.add('gone'); }
  el('stageLabel').textContent = q.boss ? '最終決戦' : `第${S.normalIdx + 1}戦`;
  el('qNo').textContent = `QUESTION ${S.i + 1} / ${TOTAL}`;
  el('qText').textContent = q.q;
  rangerBig.classList.remove('charge');
  buildChoices(q);
  showPanel('quiz');
  if (!S.retry) { showBanner(q.boss ? 'VS 大サタン' : 'ENEMY APPEAR'); q.boss ? sfx.bossStab() : sfx.appear(); }
  S.retry = false;
}

function buildChoices(q) {
  const box = el('choices'); box.innerHTML = '';
  box.className = 'choices' + (q.type === 'order' ? ' order' : '') + (q.choices.some(c => c.img) ? ' imgs' : '');
  const old = el('submitRow'); if (old) old.remove();
  const type = q.type || 'single';
  const hint = el('qHint'); hint.hidden = type === 'single';
  hint.textContent = type === 'multi' ? 'あてはまるものを、すべて選んでください。' : type === 'order' ? '拡散されやすい順に、上からタップして番号をつけてください。' : '';
  const opts = q.choices.map((c, idx) => ({ c: typeof c === 'string' ? { t: c } : c, idx }));
  if (!q.fixed && type === 'single') for (let i = opts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const btns = [];
  opts.forEach((o, n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'choice'; b.dataset.idx = o.idx;
    const k = document.createElement('span'); k.className = 'k'; k.textContent = type === 'order' ? '' : (o.c.img ? n + 1 : 'ABCD'[n]);
    b.appendChild(k);
    if (o.c.img) { const im = document.createElement('img'); im.src = o.c.img; im.alt = `記号${n + 1}`; b.appendChild(im); }
    else { const s = document.createElement('span'); s.textContent = o.c.t; b.appendChild(s); }
    box.appendChild(b); btns.push(b);
    if (type === 'single') b.addEventListener('click', () => {
      $$('.choice').forEach(x => { x.disabled = true; if (+x.dataset.idx === q.answer) x.classList.add('right'); else if (x !== b) x.classList.add('dim'); });
      const ac = q.choices[q.answer];
      answer(o.idx === q.answer, b, typeof ac === 'string' ? ac : `記号${q.answer + 1}`);
    });
  });
  if (type === 'single') return;
  const picked = [];
  const sub = document.createElement('div'); sub.id = 'submitRow'; sub.className = 'btn-row';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-gold'; go.textContent = 'こたえる'; go.disabled = true;
  sub.appendChild(go);
  const paint = () => {
    btns.forEach(b => {
      const idx = +b.dataset.idx, p = picked.indexOf(idx);
      const on = p >= 0; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on);
      if (type === 'order') b.firstChild.textContent = on ? p + 1 : '';
    });
    go.disabled = type === 'order' ? picked.length !== q.choices.length : picked.length === 0;
  };
  if (type === 'order') {
    const rs = document.createElement('button'); rs.type = 'button'; rs.className = 'btn-ghost'; rs.textContent = 'やり直す'; sub.appendChild(rs);
    rs.addEventListener('click', () => { if (S.locked) return; picked.length = 0; paint(); });
  }
  box.after(sub);
  btns.forEach(b => b.addEventListener('click', () => {
    if (S.locked) return; sfx.tap();
    const idx = +b.dataset.idx, p = picked.indexOf(idx);
    if (p >= 0) picked.splice(p, 1); else picked.push(idx);
    paint();
  }));
  go.addEventListener('click', () => {
    if (S.locked) return;
    btns.forEach(b => b.disabled = true); go.disabled = true;
    let ok, aText;
    if (type === 'multi') {
      ok = [...q.answer].sort().join() === [...picked].sort().join();
      aText = q.answer.map(i => q.choices[i]).join('、');
      btns.forEach(b => { const i = +b.dataset.idx, isA = q.answer.includes(i), isP = picked.includes(i); if (isA) b.classList.add('right'); else if (isP) b.classList.add('wrong'); else b.classList.add('dim'); });
    } else {
      ok = picked.join() === q.answerOrder.join();
      aText = q.answerOrder.map(i => q.choices[i]).join(' → ');
      btns.forEach(b => { const i = +b.dataset.idx; b.firstChild.textContent = q.answerOrder.indexOf(i) + 1; b.classList.add(picked.indexOf(i) === q.answerOrder.indexOf(i) ? 'right' : 'wrong'); });
    }
    answer(ok, null, aText, go);
  });
}

async function answer(ok, btn, aText, anchor) {
  if (S.locked) return; S.locked = true;
  const q = LIST[S.i];
  const v = el('verdict'), ex = el('explain');
  if (ok) {
    if (!S.qMissed) S.correct++; sfx.ok(); renderSquad();
    el('squadRow').classList.add('glow'); setTimeout(() => el('squadRow').classList.remove('glow'), 900);
    rangerBig.classList.add('charge');
    v.textContent = '正解！'; v.className = 'verdict ok';
    ex.textContent = q.explain || ''; ex.hidden = !q.explain;
    el('btnAttack').hidden = false; el('btnNext').hidden = true; el('btnAttack').disabled = false; el('btnNext').textContent = 'つぎへ';
    { const rb = (btn || anchor).getBoundingClientRect(); burst(rb.left + 30, rb.top + 20, 6); }
  } else {
    S.wrong++; S.lives--; if (!S.qMissed) S.missed.push({ q: q.q, a: aText, e: q.explain }); S.qMissed = true;
    if (btn) btn.classList.add('wrong'); sfx.ng(); flash('hurt');
    enemy.classList.remove('lunge'); void enemy.offsetWidth; enemy.classList.add('lunge');
    const L = el('lives'); L.classList.remove('shake'); void L.offsetWidth; L.classList.add('shake'); renderLives();
    v.textContent = 'ざんねん…'; v.className = 'verdict ng';
    ex.innerHTML = ''; const b = document.createElement('b'); b.textContent = `正解は「${aText}」`;
    ex.appendChild(b); if (q.explain) ex.append(`　${q.explain}`);
    ex.hidden = false;
    el('btnAttack').hidden = true; el('btnNext').hidden = false; el('btnNext').textContent = 'もう一度挑戦する';
  }
  await wait(ok ? 650 : 950);
  if (!ok && S.lives <= 0) { showPanel('over'); return; }
  showPanel('fb');
}

el('btnAttack').addEventListener('click', () => {
  const b = el('btnAttack'); b.disabled = true;
  const q = LIST[S.i];
  sfx.hit();
  shoot(phone, enemySvg, 14, () => {
    enemy.classList.remove('hit'); void enemy.offsetWidth; enemy.classList.add('hit');
    const r = enemySvg.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 14);
    flash('flash'); sfx.boom();
    if (q.boss) {
      const rings = barrier.children, ring = rings[rings.length - 1 - S.bossHits];
      S.bossHits++; ring && ring.classList.add('gone');
      hpFill.style.width = Math.max(70, 100 - S.bossHits * (30 / Math.max(1, BOSS_N))) + '%';
      showBanner('バリア破壊！');
    } else {
      hpFill.style.width = '0%';
      setTimeout(() => { enemy.classList.add('defeat'); showBanner('撃破！'); }, 350);
    }
    rangerBig.classList.remove('charge');
    setTimeout(() => { b.hidden = true; el('btnNext').hidden = false; el('btnNext').focus({ preventScroll: true }); }, 900);
  });
});
el('btnNext').addEventListener('click', () => {
  const q = LIST[S.i];
  if (S.qMissed && el('btnNext').textContent !== 'つぎへ') { S.retry = true; loadQuestion(); return; }
  S.qMissed = false;
  if (!q.boss) S.normalIdx++;
  S.i++;
  if (S.i >= TOTAL) startFinale(); else loadQuestion();
});
el('btnRetryQ').addEventListener('click', () => {
  S.lives = 3; renderLives(); S.retry = true;   // 同じ問題をやり直す
  loadQuestion();
});

/* rally cutscene */
let rallyCells;
function doRally() {
  S.rallied = true;
  setEnemy(true); el('stageLabel').textContent = 'RALLY';
  showPanel('rally'); showBanner('大サタン出現！'); bgmStop(.5); bgm.want = 'boss'; sfx.bossAppear();
  rallyCells = makeGrid(el('rallyGrid')); rallyCells.forEach(c => c.addEventListener('click', () => { c.classList.add('lit'); tapCell(c); }));
  const n = squadFor(S.correct), num = el('rallyNum');
  num.textContent = '0'; el('rallyPlus').textContent = '';
  let k = 0;
  const iv = setInterval(() => {
    if (k >= n) { clearInterval(iv); if (n >= 100) el('rallyPlus').textContent = '+'; return; }
    k++; num.textContent = k;
    rallyCells[k - 1].classList.add('lit', k > 1 ? "gold" : "x");
    if (k % 6 === 0) tone(400 + k * 6, 0, .06, 'triangle');
  }, Math.max(14, 1400 / Math.max(n, 1)));
}
el('btnRally').addEventListener('click', () => { sfx.tap(); bgmPlay('boss'); loadQuestion(); });

/* finale : mash */
function startFinale() {
  const F = S.finale;
  F.need = clamp(30 + 6 * S.wrong, 30, 66);
  F.taps = 0; F.started = false; F.over = false;
  arena.classList.add('boss'); enemy.classList.add('boss');
  el('stageLabel').textContent = 'FINAL';
  el('gaugeFill').style.width = '0%'; el('gaugeText').textContent = '0%';
  el('timerFill').style.transform = 'scaleX(1)';
  el('finaleLead').innerHTML = '全員の力を、ひとつに。<br>太鼓を連打して拡散してください。';
  hpFill.style.width = '100%';
  showPanel('finale'); showBanner('ラストアタック！');
  el('squadRow').classList.add('glow');
}
const mash = el('btnMash');
mash.setAttribute('aria-label', '太鼓を叩いて拡散');
mash.innerHTML = `<svg viewBox="-60 -60 120 120" aria-hidden="true">
  <circle r="58" fill="#4a1a0a"/><circle r="55" fill="#8a2a10" stroke="#ffd84a" stroke-width="2"/>
  ${Array.from({ length: 20 }, (_, i) => { const a = i / 20 * Math.PI * 2; return `<circle cx="${(Math.cos(a) * 49).toFixed(1)}" cy="${(Math.sin(a) * 49).toFixed(1)}" r="2.6" fill="#ffd84a" stroke="#6b2a00" stroke-width=".8"/>`; }).join('')}
  <circle r="43" fill="#f6e7c8" stroke="#c9a56a" stroke-width="2"/><circle r="38" fill="none" stroke="#c4161c" stroke-width="2.5"/>
  <image href="images/tomoe.png" x="-31" y="-31" width="62" height="62"/>
</svg>`;
function shock() {
  const rr = mash.getBoundingClientRect(), s = document.createElement('i');
  s.className = 'shock'; s.style.left = rr.left + rr.width / 2 + 'px'; s.style.top = rr.top + rr.height / 2 + 'px';
  fx.appendChild(s); setTimeout(() => s.remove(), 600);
}
mash.addEventListener('pointerdown', e => {
  e.preventDefault();
  const F = S && S.finale; if (!F || F.over) return;
  mash.classList.add('press');
  if (!F.started) { F.started = true; F.t0 = performance.now(); tick(); }
  F.taps++; sfx.don(); shock();
  const pct = clamp(F.taps / F.need, 0, 1);
  el('gaugeFill').style.width = pct * 100 + '%'; el('gaugeText').textContent = Math.round(pct * 100) + '%';
  hpFill.style.width = (1 - pct) * 100 + '%';
  shoot(phone, enemySvg, 2);
  const rr = mash.getBoundingClientRect(); burst(rr.left + rr.width / 2, rr.top + 10, 2);
  if (F.taps % 3 === 0) { enemy.classList.remove('hit'); void enemy.offsetWidth; enemy.classList.add('hit'); }
  if (F.taps >= F.need) winFinale();
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => mash.addEventListener(ev, () => mash.classList.remove('press')));
mash.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); mash.dispatchEvent(new PointerEvent('pointerdown')); } });
const DURATION = 8000;
function tick() {
  const F = S.finale; if (F.over) return;
  const t = performance.now() - F.t0, left = clamp(1 - t / DURATION, 0, 1);
  el('timerFill').style.transform = `scaleX(${left})`;
  if (left <= 0) { failFinale(); return; }
  F.raf = requestAnimationFrame(tick);
}
async function failFinale() {
  const F = S.finale; F.started = false;
  el('finaleLead').innerHTML = 'あと少し。もう一度、力を合わせましょう。';
  sfx.ng(); await wait(900);
  F.taps = 0; el('gaugeFill').style.width = '0%'; el('gaugeText').textContent = '0%';
  hpFill.style.width = '100%'; el('timerFill').style.transform = 'scaleX(1)';
  el('finaleLead').innerHTML = '全員の力を、ひとつに。<br>太鼓を連打して拡散してください。';
}

/* 大サタンが砕け散る */
function shatter() {
  const body = enemySvg.parentElement;
  const wrap = document.createElement('div'); wrap.className = 'shards';
  const COLS = 5, ROWS = 6, P = [];
  for (let j = 0; j <= ROWS; j++) { P[j] = []; for (let i = 0; i <= COLS; i++) {
    const edge = i === 0 || j === 0 || i === COLS || j === ROWS;
    P[j][i] = [i / COLS * 100 + (edge ? 0 : rand(-7, 7)), j / ROWS * 100 + (edge ? 0 : rand(-6, 6))];
  } }
  const tris = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i], d = P[j + 1][i + 1];
    if (Math.random() < .5) { tris.push([a, b, c]); tris.push([b, d, c]); } else { tris.push([a, b, d]); tris.push([a, d, c]); }
  }
  const html = enemySvg.innerHTML;
  tris.forEach(t => {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    const s = document.createElement('div'); s.className = 'shard';
    s.style.clipPath = `polygon(${t.map(p => p[0].toFixed(1) + '% ' + p[1].toFixed(1) + '%').join(',')})`;
    s.style.transformOrigin = `${cx}% ${cy}%`;
    s.innerHTML = html; wrap.appendChild(s);
    const dx = cx - 50, dy = cy - 55, dist = Math.hypot(dx, dy) || 1;
    const fx2 = dx / dist * rand(90, 240) + rand(-30, 30), fy2 = dy / dist * rand(70, 200) + rand(20, 160);
    s.animate([
      { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1, filter: 'brightness(3)' },
      { transform: `translate(${fx2 * .25}px,${fy2 * .2 - 20}px) rotate(${rand(-40, 40)}deg) scale(1)`, opacity: 1, filter: 'brightness(1.4)', offset: .2 },
      { transform: `translate(${fx2}px,${fy2}px) rotate(${rand(-420, 420)}deg) scale(${rand(.15, .6)})`, opacity: 0, filter: 'brightness(1)' }
    ], { duration: rand(1300, 2100), delay: dist * 5 + rand(0, 160), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' });
  });
  body.appendChild(wrap);
  enemySvg.style.visibility = 'hidden'; barrier.innerHTML = '';
  enemy.classList.add('gone');
  setTimeout(() => wrap.remove(), 2800);
}
async function winFinale() {
  const F = S.finale; F.over = true; cancelAnimationFrame(F.raf); bgmStop(.4); bgm.want = 'main';
  el('timerFill').style.transform = 'scaleX(0)'; hpFill.style.width = '0%';
  sfx.boom(); flash('flash');
  enemy.classList.add('prebreak'); await wait(650);
  shatter(); showBanner('大サタン撃破！'); sfx.victory();
  { const rb = enemySvg.getBoundingClientRect(); burst(rb.left + rb.width / 2, rb.top + rb.height / 2, 24); flash('flash'); }
  const r = arena.getBoundingClientRect();
  for (let i = 0; i < 6; i++) setTimeout(() => burst(r.left + rand(.1, .9) * r.width, r.top + rand(.15, .8) * r.height, 14), i * 220);
  await wait(4200);
  showResult();
}

/* result */
function showResult() {
  const rate = TOTAL ? S.correct / TOTAL : 0;
  const rk = rate >= 1 ? ['S', '伝説のレンジャイ', '全問正解です。発信のお手本として、みなさんを引っぱってください。']
    : rate >= .8 ? ['A', 'エースレンジャイ', 'とても良い理解度です。学んだことを、さっそく次の投稿で試してみましょう。']
    : rate >= .6 ? ['B', '一人前のレンジャイ', 'しっかり力がついています。まちがえた問題を見直すと、さらに伸びます。']
    : ['C', '見習いレンジャイ', 'ここからが冒険のはじまりです。復習してもう一度挑戦してみましょう。'];
  el('rankLetter').textContent = rk[0]; el('rankName').textContent = rk[1]; el('resultMsg').textContent = rk[2];
  el('statCorrect').textContent = `${S.correct}/${TOTAL}`;
  el('statSquad').textContent = fmtSquad(squadFor(S.correct)) + '人';
  el('statMiss').textContent = S.wrong;
  const list = el('reviewList'); list.innerHTML = '';
  S.missed.forEach(m => {
    const d = document.createElement('div'); d.className = 'item';
    const p = document.createElement('div'); p.textContent = m.q;
    const a = document.createElement('div'); const b = document.createElement('b'); b.textContent = `正解：${m.a}`; a.appendChild(b);
    d.append(p, a); if (m.e) { const e = document.createElement('div'); e.textContent = m.e; d.appendChild(e); }
    list.appendChild(d);
  });
  el('review').hidden = !S.missed.length; el('review').open = false;
  el('copied').hidden = true;
  showScreen('result');
  el('cabinet').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  burst(innerWidth / 2, innerHeight / 2, 16);
  bgmPlay('main');
}
el('btnAgain').addEventListener('click', startGame);
el('btnShare').addEventListener('click', async () => {
  const SITE = 'https://is.gd/Xe5rfv';
  const msg = `レンジャイの大冒険をクリアしました。ランクは${el('rankLetter').textContent}、集まった仲間は${el('statSquad').textContent}でした。君は大サタンを倒せるか？`;
  const full = `${msg}
${SITE}`;           // 結果とリンクを1つの文章にして渡す
  try {
    if (navigator.share) { await navigator.share({ title: 'レンジャイの大冒険', text: full }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(full); el('copied').hidden = false; el('copied').textContent = '結果とリンクをコピーしました'; }
  catch (e) { prompt('コピーしてお使いください', full); }
});
el('btnStart').addEventListener('click', () => { ac(); sfx.tap(); startGame(); });
el('startCta').addEventListener('click', () => { ac(); });
})();
