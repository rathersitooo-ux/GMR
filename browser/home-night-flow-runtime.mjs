const HOME_SELECTOR = 'section[data-screen="home"]';
const STAGE_SELECTOR = '.codexHomeArtStage';
const CANVAS_CLASS = 'gameroadHomeNightFlow';
const STYLE_ID = 'gameroad-home-night-flow-style-r1';
const GLOBAL_KEY = 'GAMEROAD_HOME_NIGHT_FLOW';

export const HOME_NIGHT_FLOW_PROFILE = Object.freeze({
  sourceArt: Object.freeze({
    driveId: '1t-viE1VSuatsJd6rC1yuc2ctncguwOVx',
    width: 1536,
    height: 864,
    visual: 'moonlit deep-blue forest; moon upper-left; character center-right; luminous ribbons/crystals',
  }),
  moon: Object.freeze({ x: 0.218, y: 0.145 }),
  ribbonVortex: Object.freeze({ x: 0.31, y: 0.69, radius: 0.52, strength: 0.012 }),
  characterQuietZone: Object.freeze({ x: 0.64, y: 0.43, rx: 0.25, ry: 0.38 }),
  baseWind: Object.freeze({ x: 0.032, y: -0.0045 }),
  curlScale: 2.45,
  curlStrength: 0.020,
  particles: Object.freeze({ normal: 680, lowPerf: 220, reducedMotion: 90 }),
  fps: Object.freeze({ normal: 30, lowPerf: 20, reducedMotion: 16 }),
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const hash2 = (x, y) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return v - Math.floor(v);
};

export function valueNoise2D(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return (ab + (cd - ab) * sy) * 2 - 1;
}

function potential(x, y, t) {
  const s = HOME_NIGHT_FLOW_PROFILE.curlScale;
  const dx = t * 0.018;
  const dy = -t * 0.011;
  return valueNoise2D(x * s + dx, y * s + dy)
    + valueNoise2D(x * s * 1.92 - dy, y * s * 1.92 + dx) * 0.34;
}

export function curlNoise2D(x, y, t, epsilon = 0.0075) {
  const e = Math.max(0.0005, Number(epsilon) || 0.0075);
  const dY = (potential(x, y + e, t) - potential(x, y - e, t)) / (2 * e);
  const dX = (potential(x + e, y, t) - potential(x - e, y, t)) / (2 * e);
  const length = Math.hypot(dY, -dX) || 1;
  return Object.freeze({ x: dY / length, y: -dX / length });
}

export function homeNightOpacityMask(x, y) {
  const q = HOME_NIGHT_FLOW_PROFILE.characterQuietZone;
  const dx = (x - q.x) / q.rx;
  const dy = (y - q.y) / q.ry;
  const character = Math.exp(-(dx * dx + dy * dy) * 1.55);
  const mx = (x - HOME_NIGHT_FLOW_PROFILE.moon.x) / 0.17;
  const my = (y - HOME_NIGHT_FLOW_PROFILE.moon.y) / 0.16;
  const moon = Math.exp(-(mx * mx + my * my) * 1.8);
  const edge = clamp(Math.abs(x - 0.5) * 0.34 + Math.max(0, y - 0.63) * 0.18, 0, 0.24);
  return clamp(0.58 - character * 0.34 + moon * 0.12 + edge, 0.14, 0.86);
}

export function homeNightVelocity(x, y, t, gustX = 0, gustY = 0) {
  const c = curlNoise2D(x, y, t);
  const b = HOME_NIGHT_FLOW_PROFILE.baseWind;
  const v = HOME_NIGHT_FLOW_PROFILE.ribbonVortex;
  const dx = x - v.x;
  const dy = y - v.y;
  const falloff = Math.exp(-(dx * dx + dy * dy) / Math.max(0.03, v.radius * v.radius * 0.36));
  const inv = 1 / Math.max(0.08, Math.hypot(dx, dy));
  const slow = 0.88 + Math.sin(t * 0.21) * 0.11 + Math.sin(t * 0.073 + 1.7) * 0.06;
  return Object.freeze({
    x: b.x * slow + c.x * HOME_NIGHT_FLOW_PROFILE.curlStrength + (-dy * inv) * v.strength * falloff + gustX,
    y: b.y + c.y * HOME_NIGHT_FLOW_PROFILE.curlStrength * 0.72 + (dx * inv) * v.strength * falloff + gustY,
  });
}

export function resolveHomeNightParticleBudget({ lowPerf = false, reducedMotion = false } = {}) {
  if (reducedMotion) return HOME_NIGHT_FLOW_PROFILE.particles.reducedMotion;
  if (lowPerf) return HOME_NIGHT_FLOW_PROFILE.particles.lowPerf;
  return HOME_NIGHT_FLOW_PROFILE.particles.normal;
}

export function resolveHomeNightTargetFps({ lowPerf = false, reducedMotion = false } = {}) {
  if (reducedMotion) return HOME_NIGHT_FLOW_PROFILE.fps.reducedMotion;
  if (lowPerf) return HOME_NIGHT_FLOW_PROFILE.fps.lowPerf;
  return HOME_NIGHT_FLOW_PROFILE.fps.normal;
}

function reduced(win) {
  return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    || win.document.documentElement.classList.contains('r10Reduced');
}
function lowPerf(win) {
  return win.document.documentElement.classList.contains('r10LowPerf');
}
function homeActive(home) {
  if (!home?.isConnected || home.hidden || home.hasAttribute('hidden')) return false;
  if (home.classList.contains('active')) return true;
  const style = home.ownerDocument.defaultView.getComputedStyle(home);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    HOME_SELECTOR + ' ' + STAGE_SELECTOR + '{isolation:isolate}',
    HOME_SELECTOR + ' .' + CANVAS_CLASS + '{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;mix-blend-mode:screen;opacity:.72;transition:opacity 420ms ease;contain:strict}',
    HOME_SELECTOR + ':not(.active) .' + CANVAS_CLASS + '{opacity:0}',
    '@media(prefers-reduced-motion:reduce){' + HOME_SELECTOR + ' .' + CANVAS_CLASS + '{opacity:.34;transition:none}}',
    'html.r10LowPerf ' + HOME_SELECTOR + ' .' + CANVAS_CLASS + '{opacity:.46}',
    'html.r10Reduced ' + HOME_SELECTOR + ' .' + CANVAS_CLASS + '{opacity:.30;transition:none}',
  ].join('\n');
  doc.head.append(style);
}

function spawn(p, randomAge = false) {
  const left = Math.random() < 0.74;
  const range = (a, b) => a + Math.random() * (b - a);
  p.x = left ? range(-0.035, 0.16) : range(0.02, 0.92);
  p.y = left ? range(0.25, 0.94) : range(0.76, 1.04);
  p.vx = 0;
  p.vy = 0;
  p.age = randomAge ? range(0, 10) : 0;
  p.life = range(6.5, 14.5);
  p.size = range(0.55, 1.7);
  p.alpha = range(0.24, 0.62);
  p.streak = Math.random() < 0.16;
  p.phase = range(0, Math.PI * 2);
  return p;
}
function particles(count) {
  return Array.from({ length: count }, () => spawn({}, true));
}

function createAudio(win) {
  return { win, context: null, master: null, chirpTimer: null, started: false, blocked: false, active: false };
}
function scheduleChirp(audio) {
  if (audio.chirpTimer != null) audio.win.clearTimeout(audio.chirpTimer);
  if (!audio.started || !audio.context) return;
  audio.chirpTimer = audio.win.setTimeout(() => {
    if (audio.active && audio.context.state === 'running') {
      const now = audio.context.currentTime;
      for (let i = 0; i < 3; i += 1) {
        const osc = audio.context.createOscillator();
        const gain = audio.context.createGain();
        const start = now + i * 0.17;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(4300 + Math.random() * 950, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.0015, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
        osc.connect(gain).connect(audio.master);
        osc.start(start);
        osc.stop(start + 0.13);
      }
    }
    scheduleChirp(audio);
  }, 5200 + Math.random() * 6200);
}
function windBuffer(context) {
  const frames = Math.floor(context.sampleRate * 4);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < frames; i += 1) {
    brown = brown * 0.986 + (Math.random() * 2 - 1) * 0.014;
    data[i] = clamp(brown * 3.4, -1, 1);
  }
  return buffer;
}
async function startAudio(audio) {
  if (audio.started || audio.blocked) return audio.started;
  const Ctor = audio.win.AudioContext || audio.win.webkitAudioContext;
  if (!Ctor) {
    audio.blocked = true;
    return false;
  }
  try {
    const ctx = new Ctor({ latencyHint: 'playback' });
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = windBuffer(ctx);
    source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 70;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 920;
    const wind = ctx.createGain();
    wind.gain.value = 0.013;
    source.connect(high).connect(low).connect(wind).connect(master);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.073;
    lfoGain.gain.value = 0.0033;
    lfo.connect(lfoGain).connect(wind.gain);
    source.start();
    lfo.start();
    audio.context = ctx;
    audio.master = master;
    audio.started = true;
    await ctx.resume();
    scheduleChirp(audio);
    return true;
  } catch {
    audio.blocked = true;
    return false;
  }
}
function setAudioActive(audio, active) {
  audio.active = Boolean(active);
  if (!audio.started || !audio.context || !audio.master) return;
  const now = audio.context.currentTime;
  audio.master.gain.cancelScheduledValues(now);
  audio.master.gain.setTargetAtTime(active ? 0.72 : 0.0001, now, active ? 0.8 : 0.22);
}

function runtimeFor(win, doc) {
  return {
    win, doc, home: null, host: null, canvas: null, ctx: null, list: [],
    width: 0, height: 0, dpr: 1, active: false, lastMs: 0, raf: 0,
    observer: null, resizeObserver: null, refreshQueued: false,
    gust: { x: 0, y: 0, lastX: 0, lastY: 0, until: 0 },
    audio: createAudio(win),
  };
}

function resize(r) {
  const rect = r.host?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  r.dpr = Math.min(Number(r.win.devicePixelRatio) || 1, lowPerf(r.win) ? 1 : 1.5);
  const w = Math.max(1, Math.round(rect.width * r.dpr));
  const h = Math.max(1, Math.round(rect.height * r.dpr));
  if (w === r.width && h === r.height) return;
  r.width = w;
  r.height = h;
  r.canvas.width = w;
  r.canvas.height = h;
}
function syncParticles(r) {
  const target = resolveHomeNightParticleBudget({ lowPerf: lowPerf(r.win), reducedMotion: reduced(r.win) });
  if (r.list.length > target) r.list.length = target;
  if (r.list.length < target) r.list.push(...particles(target - r.list.length));
}
function draw(r, p, x, y, speed) {
  const alpha = p.alpha * homeNightOpacityMask(p.x, p.y) * (0.76 + Math.sin(p.phase + p.age * 1.7) * 0.24);
  if (p.streak && !reduced(r.win)) {
    const len = clamp(4 + speed * 0.09, 5, 18) * r.dpr;
    const angle = Math.atan2(p.vy * r.height, p.vx * r.width);
    r.ctx.beginPath();
    r.ctx.moveTo(x, y);
    r.ctx.lineTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len);
    r.ctx.strokeStyle = 'rgba(188,222,255,' + (alpha * 0.66) + ')';
    r.ctx.lineWidth = Math.max(0.7, p.size * r.dpr * 0.72);
    r.ctx.stroke();
  } else {
    r.ctx.beginPath();
    r.ctx.arc(x, y, Math.max(0.45, p.size * r.dpr), 0, Math.PI * 2);
    r.ctx.fillStyle = 'rgba(201,227,255,' + alpha + ')';
    r.ctx.fill();
  }
}

function tick(r, now) {
  r.raf = r.win.requestAnimationFrame((t) => tick(r, t));
  if (!r.active || !r.ctx) return;
  const fps = resolveHomeNightTargetFps({ lowPerf: lowPerf(r.win), reducedMotion: reduced(r.win) });
  const minFrame = 1000 / fps;
  if (now - r.lastMs < minFrame) return;
  const dt = clamp((now - (r.lastMs || now - minFrame)) / 1000, 0.001, 0.08);
  r.lastMs = now;
  resize(r);
  syncParticles(r);
  r.ctx.clearRect(0, 0, r.width, r.height);
  const g = now < r.gust.until ? clamp((r.gust.until - now) / 520, 0, 1) : 0;
  for (const p of r.list) {
    p.age += dt;
    const v = homeNightVelocity(p.x, p.y, now / 1000, r.gust.x * 0.018 * g, r.gust.y * 0.012 * g);
    const response = 1 - Math.exp(-dt * 2.7);
    p.vx += (v.x - p.vx) * response;
    p.vy += (v.y - p.vy) * response;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.age > p.life || p.x > 1.06 || p.x < -0.08 || p.y < -0.08 || p.y > 1.08) {
      spawn(p);
      continue;
    }
    draw(r, p, p.x * r.width, p.y * r.height, Math.hypot(p.vx * r.width, p.vy * r.height));
  }
}

function mount(r) {
  const home = r.doc.querySelector(HOME_SELECTOR);
  if (!home) return false;
  const host = home.querySelector(STAGE_SELECTOR) || home;
  r.home = home;
  r.host = host;
  let canvas = host.querySelector('.' + CANVAS_CLASS);
  if (!canvas) {
    canvas = r.doc.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.sourceArt = HOME_NIGHT_FLOW_PROFILE.sourceArt.driveId;
    host.append(canvas);
  }
  r.canvas = canvas;
  r.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d');
  resize(r);
  syncParticles(r);
  if (r.resizeObserver) r.resizeObserver.disconnect();
  if (typeof r.win.ResizeObserver === 'function') {
    r.resizeObserver = new r.win.ResizeObserver(() => resize(r));
    r.resizeObserver.observe(host);
  }
  if (home.dataset.homeNightFlowGestureBound !== 'true') {
    home.dataset.homeNightFlowGestureBound = 'true';
    home.addEventListener('pointermove', (event) => {
      if (!r.active || !(event.buttons > 0)) return;
      const x = Number(event.clientX) || 0;
      const y = Number(event.clientY) || 0;
      const dx = x - r.gust.lastX;
      const dy = y - r.gust.lastY;
      r.gust.lastX = x;
      r.gust.lastY = y;
      if (Math.hypot(dx, dy) < 2) return;
      r.gust.x = clamp(dx / 42, -1, 1);
      r.gust.y = clamp(dy / 42, -1, 1);
      r.gust.until = r.win.performance.now() + 520;
    }, { passive: true });
  }
  return true;
}

function refresh(r) {
  r.refreshQueued = false;
  if (!r.home?.isConnected || !r.canvas?.isConnected) mount(r);
  r.active = homeActive(r.home) && r.doc.visibilityState !== 'hidden';
  setAudioActive(r.audio, r.active);
  if (r.canvas) r.canvas.dataset.active = r.active ? 'true' : 'false';
}
function scheduleRefresh(r) {
  if (r.refreshQueued) return;
  r.refreshQueued = true;
  queueMicrotask(() => refresh(r));
}

export function installHomeNightFlowRuntime(win = globalThis.window, doc = globalThis.document) {
  if (!win || !doc?.body) return null;
  if (win[GLOBAL_KEY]?.runtime) return win[GLOBAL_KEY];
  ensureStyle(doc);
  const r = runtimeFor(win, doc);
  mount(r);
  const observer = new MutationObserver(() => scheduleRefresh(r));
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  r.observer = observer;
  doc.addEventListener('visibilitychange', () => scheduleRefresh(r));
  win.addEventListener('resize', () => { resize(r); scheduleRefresh(r); }, { passive: true });
  const gesture = (event) => {
    if (!r.active) return;
    if (event.type === 'pointerdown') {
      r.gust.lastX = Number(event.clientX) || 0;
      r.gust.lastY = Number(event.clientY) || 0;
    }
    startAudio(r.audio).then(() => setAudioActive(r.audio, r.active));
  };
  doc.addEventListener('pointerdown', gesture, { passive: true });
  doc.addEventListener('keydown', gesture);
  r.raf = win.requestAnimationFrame((t) => tick(r, t));
  refresh(r);
  const api = Object.freeze({ schema: 'gameroad.home-night-flow.v1', runtime: r, profile: HOME_NIGHT_FLOW_PROFILE });
  win[GLOBAL_KEY] = api;
  return api;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const boot = () => installHomeNightFlowRuntime(window, document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
