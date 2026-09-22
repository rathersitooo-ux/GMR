const SCHEMA = 'gameroad.temp-sfx-reference-runtime.v1';

export const TEMP_REFERENCE_SFX_KEYS = Object.freeze({
  CONFIRM: 'temp.confirm.reference',
  RECOVERY: 'temp.recovery.reference',
  SUPER_CHARGE: 'temp.super-charge.reference',
});

const CUE_SPECS = Object.freeze({
  [TEMP_REFERENCE_SFX_KEYS.CONFIRM]: Object.freeze({
    intent: 'fast bright two-step electronic confirmation; Dinosaur King feel reference only, not a source copy',
    voices: Object.freeze([
      Object.freeze({ wave: 'square', start: 0, duration: 0.055, fromHz: 980, toHz: 1320, gain: 0.030 }),
      Object.freeze({ wave: 'triangle', start: 0.052, duration: 0.082, fromHz: 1420, toHz: 1880, gain: 0.038 }),
    ]),
  }),
  [TEMP_REFERENCE_SFX_KEYS.RECOVERY]: Object.freeze({
    intent: 'ascending sparkling recovery reference',
    voices: Object.freeze([
      Object.freeze({ wave: 'sine', start: 0.000, duration: 0.18, fromHz: 523.25, toHz: 659.25, gain: 0.032 }),
      Object.freeze({ wave: 'sine', start: 0.050, duration: 0.18, fromHz: 659.25, toHz: 783.99, gain: 0.030 }),
      Object.freeze({ wave: 'triangle', start: 0.100, duration: 0.20, fromHz: 783.99, toHz: 1046.50, gain: 0.026 }),
      Object.freeze({ wave: 'sine', start: 0.155, duration: 0.24, fromHz: 1046.50, toHz: 1318.51, gain: 0.022 }),
    ]),
  }),
  [TEMP_REFERENCE_SFX_KEYS.SUPER_CHARGE]: Object.freeze({
    intent: 'rising gyuiin-style super-action charge reference',
    voices: Object.freeze([
      Object.freeze({ wave: 'sawtooth', start: 0.000, duration: 0.46, fromHz: 170, toHz: 1180, gain: 0.022 }),
      Object.freeze({ wave: 'triangle', start: 0.025, duration: 0.43, fromHz: 340, toHz: 2360, gain: 0.014 }),
      Object.freeze({ wave: 'sine', start: 0.330, duration: 0.16, fromHz: 1180, toHz: 1680, gain: 0.020 }),
    ]),
  }),
});

let sharedContext = null;

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1, Math.max(0, numeric));
}

function audioContextCtor(source = globalThis) {
  return source?.AudioContext || source?.webkitAudioContext || null;
}

function contextFor({ context = null, AudioContextCtor = null } = {}) {
  if (context) return context;
  const Ctor = AudioContextCtor || audioContextCtor();
  if (typeof Ctor !== 'function') return null;
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = new Ctor();
  return sharedContext;
}

function scheduleVoice(context, destination, voice, volume) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = Number(context.currentTime) || 0;
  const startAt = now + voice.start;
  const stopAt = startAt + voice.duration;
  const attackEnd = Math.min(stopAt, startAt + 0.012);
  const releaseStart = Math.max(attackEnd, stopAt - Math.min(0.045, voice.duration * 0.45));
  const peak = Math.max(0.0001, voice.gain * volume);

  oscillator.type = voice.wave;
  oscillator.frequency.setValueAtTime(Math.max(1, voice.fromHz), startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, voice.toHz), stopAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
  gain.gain.setValueAtTime(peak, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.005);

  return stopAt - now;
}

export function resolveTempReferenceSfxSpec(key) {
  return CUE_SPECS[key] ?? null;
}

export function isTempReferenceSfxEnabled(locationSource = globalThis.location) {
  const search = typeof locationSource?.search === 'string' ? locationSource.search : '';
  try {
    return new URLSearchParams(search).get('tempSfx') === '1';
  } catch {
    return false;
  }
}

export function playTempReferenceSfx(key, {
  context = null,
  AudioContextCtor = null,
  volume = 1,
} = {}) {
  const spec = resolveTempReferenceSfxSpec(key);
  if (!spec) return Object.freeze({ ok: false, reason: 'UNKNOWN_TEMP_SFX_KEY', key, voiceCount: 0 });

  const ctx = contextFor({ context, AudioContextCtor });
  if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
    return Object.freeze({ ok: false, reason: 'WEB_AUDIO_UNAVAILABLE', key, voiceCount: 0 });
  }

  try {
    const resumeResult = ctx.state === 'suspended' && typeof ctx.resume === 'function' ? ctx.resume() : null;
    if (resumeResult && typeof resumeResult.catch === 'function') resumeResult.catch(() => {});

    const level = clamp01(volume);
    let duration = 0;
    for (const voice of spec.voices) {
      duration = Math.max(duration, scheduleVoice(ctx, ctx.destination, voice, level));
    }
    return Object.freeze({
      ok: true,
      reason: 'TEMP_REFERENCE_SFX_SCHEDULED',
      key,
      voiceCount: spec.voices.length,
      durationSeconds: duration,
      formalAsset: false,
      presentationOnly: true,
      externalAudioBytes: false,
      mustReviewBeforeRelease: true,
    });
  } catch {
    return Object.freeze({ ok: false, reason: 'TEMP_REFERENCE_SFX_FAILED_SOFT', key, voiceCount: 0 });
  }
}

export const TEMP_REFERENCE_SFX_CONTRACT = Object.freeze({
  schema: SCHEMA,
  keys: TEMP_REFERENCE_SFX_KEYS,
  formalAsset: false,
  thirdPartyAudioBytes: false,
  runtimeSynthesisOnly: true,
  sourceAudioCopied: false,
  presentationOnly: true,
  settingsAuthority: false,
  gameplayAuthority: false,
  resultAuthority: false,
  testModeQuery: 'tempSfx=1',
  mustReviewBeforeRelease: true,
});
