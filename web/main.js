const scene   = document.querySelector('.parallax-scene');
const hint    = document.getElementById('scrollHint');
const introEl = document.querySelector('.scene-content');


const bgs = {
  spring: document.getElementById('bg-spring'),
  summer: document.getElementById('bg-summer'),
  autumn: document.getElementById('bg-autumn'),
  winter: document.getElementById('bg-winter'),
};


const caps = {
  spring: document.getElementById('cap-spring'),
  summer: document.getElementById('cap-summer'),
  autumn: document.getElementById('cap-autumn'),
  winter: document.getElementById('cap-winter'),
};

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

function setOpacity(el, v)  { if (el) el.style.opacity = Math.max(0, Math.min(1, v)); }
function setScale(el, s)    { if (el) el.style.transform = `scale(${s})`; }
function resetAll() {
  SEASONS.forEach(s => { setOpacity(bgs[s], 0); setOpacity(caps[s], 0); });
}

window.addEventListener('scroll', () => {
  const sceneH  = scene.offsetHeight - window.innerHeight;
  const scrollY = Math.min(Math.max(window.scrollY, 0), sceneH);
  const p       = scrollY / sceneH;   // 0 → 1

  
  if (scrollY > 40) hint.classList.add('hidden');
  else              hint.classList.remove('hidden');

  resetAll();


  const SEGS = [
    { season: 'spring', solid: [0,      0.20], fade: [0.20, 0.35] },
    { season: 'summer', rise:  [0.20, 0.35],  solid: [0.35, 0.55], fade: [0.55, 0.68] },
    { season: 'autumn', rise:  [0.55, 0.68],  solid: [0.68, 0.80], fade: [0.80, 0.90] },
    { season: 'winter', rise:  [0.80, 0.90],  solid: [0.90, 1.0]  },
  ];

  SEGS.forEach(({ season, solid, fade, rise }) => {
    let bgAlpha  = 0;
    let capAlpha = 0;

    if (rise && p >= rise[0] && p < rise[1]) {
      const t = (p - rise[0]) / (rise[1] - rise[0]);
      bgAlpha  = t;
      capAlpha = t;
    }
    if (solid && p >= solid[0] && p < solid[1]) {
      bgAlpha  = 1;
      capAlpha = 1;
    }
    if (fade && p >= fade[0] && p < fade[1]) {
      const t = (p - fade[0]) / (fade[1] - fade[0]);
      bgAlpha  = 1 - t;
      capAlpha = 1 - t;
    }

    setOpacity(bgs[season],  bgAlpha);
    setOpacity(caps[season], capAlpha);

    
    if (season === 'spring' && introEl) {
      introEl.style.opacity = bgAlpha;
    }

    
    if (bgs[season] && bgAlpha > 0) {
      const progress = solid
        ? (p >= solid[0] ? (p - solid[0]) / Math.max(0.001, (solid[1] || 1) - solid[0]) : 0)
        : 0;
      setScale(bgs[season], 1 + progress * 0.04);
    }
  });
}, { passive: true });


function goToOak()  { window.location.href = '../page2/oak.html'; }
function goHome()   { window.location.href = 'index.html'; }

let audioCtx   = null;
let masterGain = null;
let windNodes  = null;
let birdTimers = [];
let isPlaying  = false;

const soundBtn   = document.getElementById('soundBtn');
const soundLabel = document.getElementById('soundLabel');

soundBtn.addEventListener('click', () => {
  if (!isPlaying) startAmbient(); else stopAmbient();
});


function createCtx() {
  if (!audioCtx) {
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}


function createNoiseBuffer(dur = 2) {
  const len  = Math.floor(audioCtx.sampleRate * dur);
  const buf  = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}


function startWind() {
  const ctx = audioCtx;
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(3);
  src.loop   = true;

  const bp   = ctx.createBiquadFilter();
  bp.type    = 'bandpass';
  bp.frequency.value = 320;
  bp.Q.value = 0.55;

  const bp2  = ctx.createBiquadFilter();
  bp2.type   = 'bandpass';
  bp2.frequency.value = 110;
  bp2.Q.value = 0.38;

  const wg = ctx.createGain();
  wg.gain.value = 0.16;


  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  lfo.type = 'sine';
  const lg = ctx.createGain();
  lg.gain.value = 0.07;
  lfo.connect(lg); lg.connect(wg.gain); lfo.start();

  src.connect(bp); src.connect(bp2);
  bp.connect(wg); bp2.connect(wg);
  wg.connect(masterGain);
  src.start();

  windNodes = { src, bp, bp2, wg, lfo, lg };
}

function stopWind() {
  if (!windNodes) return;
  try { windNodes.src.stop(); windNodes.lfo.stop(); } catch(_) {}
  windNodes = null;
}


function chirp(dest, baseFreq, duration, vol) {
  const ctx = audioCtx;
  const t   = ctx.currentTime;

  const carrier = ctx.createOscillator();
  carrier.type  = 'sine';
  carrier.frequency.setValueAtTime(baseFreq, t);
  carrier.frequency.linearRampToValueAtTime(baseFreq * 1.38, t + duration * 0.44);
  carrier.frequency.exponentialRampToValueAtTime(baseFreq * 0.68, t + duration);

  const mod     = ctx.createOscillator();
  const modGain = ctx.createGain();
  mod.type      = 'sine';
  mod.frequency.setValueAtTime(baseFreq * 1.75, t);
  mod.frequency.linearRampToValueAtTime(baseFreq * 2.2, t + duration * 0.5);
  modGain.gain.setValueAtTime(baseFreq * 0.45, t);
  modGain.gain.linearRampToValueAtTime(baseFreq * 0.08, t + duration);
  mod.connect(modGain); modGain.connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.014);
  env.gain.setValueAtTime(vol, t + duration * 0.28);
  env.gain.exponentialRampToValueAtTime(0.001, t + duration);

 
  const delay = ctx.createDelay(0.35);
  delay.delayTime.value = 0.09;
  const dg = ctx.createGain(); dg.gain.value = 0.16;

  carrier.connect(env);
  env.connect(dest); env.connect(delay);
  delay.connect(dg); dg.connect(dest);

  carrier.start(t); mod.start(t);
  carrier.stop(t + duration + 0.12); mod.stop(t + duration + 0.12);
}


const BIRD_VOICES = [
  { minF:2800, maxF:4200, minD:0.08, maxD:0.18, bMin:2, bMax:4, bPause:0.13, gMin:0.9, gMax:3.8, vol:0.11 },
  
  { minF:3900, maxF:5200, minD:0.05, maxD:0.09, bMin:6, bMax:11, bPause:0.07, gMin:2.5, gMax:6.0, vol:0.08 },
  
  { minF: 700, maxF:1050, minD:0.22, maxD:0.38, bMin:2, bMax:5, bPause:0.55, gMin:3.0, gMax:7.0, vol:0.09 },
];

function scheduleBird(v, dest) {
  if (!isPlaying) return;
  const count = v.bMin + Math.floor(Math.random() * (v.bMax - v.bMin + 1));
  let delay = 0;
  for (let i = 0; i < count; i++) {
    const f = v.minF + Math.random() * (v.maxF - v.minF);
    const d = v.minD + Math.random() * (v.maxD - v.minD);
    const dd = delay;
    const tid = setTimeout(() => { if (isPlaying) chirp(dest, f, d, v.vol); }, dd * 1000);
    birdTimers.push(tid);
    delay += d + v.bPause;
  }
  const next = (v.gMin + Math.random() * (v.gMax - v.gMin)) * 1000 + delay * 1000;
  const tid = setTimeout(() => scheduleBird(v, dest), next);
  birdTimers.push(tid);
}


function scheduleRustle(dest) {
  if (!isPlaying) return;
  const ctx = audioCtx;
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(0.35);
  const hp  = ctx.createBiquadFilter();
  hp.type   = 'highpass'; hp.frequency.value = 3200;
  const env = ctx.createGain();
  const t   = ctx.currentTime;
  const vol = 0.03 + Math.random() * 0.05;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.018);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  src.connect(hp); hp.connect(env); env.connect(dest);
  src.start(t); src.stop(t + 0.36);

  const tid = setTimeout(() => scheduleRustle(dest), 1200 + Math.random() * 3800);
  birdTimers.push(tid);
}


function startAmbient() {
  createCtx();
  isPlaying = true;

  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
  masterGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 2.5);

  startWind();
  BIRD_VOICES.forEach(v => {
    const tid = setTimeout(() => scheduleBird(v, masterGain), Math.random() * 1800);
    birdTimers.push(tid);
  });
  const tid = setTimeout(() => scheduleRustle(masterGain), 600);
  birdTimers.push(tid);

  soundBtn.classList.add('playing');
  soundLabel.textContent = 'Playing';
}

function stopAmbient() {
  isPlaying = false;
  birdTimers.forEach(t => clearTimeout(t));
  birdTimers = [];

  if (masterGain) {
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.4);
    setTimeout(stopWind, 1500);
  }

  soundBtn.classList.remove('playing');
  soundLabel.textContent = 'Sounds';
}


document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});