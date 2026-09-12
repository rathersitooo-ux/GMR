import { normalizePartnerVoiceTuning } from './partner-dialogue-feedback-core.mjs';

export const SAASUNA_VOICE_RUNTIME = Object.freeze({
  partnerId: 'partner.saasuna',
  displayName: 'サースナー',
  language: 'ja-JP',
  provider: 'browser-system-voice',
  canonicalVoice: false,
  productionFormalVoice: false,
  label: '端末音声（サースナー仮音声）',
});

function text(value, max = 600) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  if (!out || out.length > max) return null;
  return out;
}

export function listSaasunaSystemVoices(synth = globalThis.speechSynthesis) {
  if (!synth || typeof synth.getVoices !== 'function') return Object.freeze([]);
  const seen = new Set();
  const voices = [];
  for (const voice of synth.getVoices() ?? []) {
    const lang = String(voice?.lang ?? '');
    const voiceURI = String(voice?.voiceURI ?? voice?.name ?? '');
    if (!voiceURI || !/^ja(?:-|$)/i.test(lang) || seen.has(voiceURI)) continue;
    seen.add(voiceURI);
    voices.push(Object.freeze({
      voiceURI,
      name: String(voice?.name ?? voiceURI),
      lang,
      localService: voice?.localService === true,
      default: voice?.default === true,
    }));
  }
  return Object.freeze(voices);
}

export function buildSaasunaVoicePreviewPlan(input = {}) {
  const line = text(input.text);
  if (!line) return null;
  const tuning = normalizePartnerVoiceTuning(input.tuning);
  const segments = line
    .split(/(?<=[。！？!?\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return Object.freeze({
    runtime: SAASUNA_VOICE_RUNTIME,
    text: line,
    segments: Object.freeze(segments.length ? segments : [line]),
    tuning,
  });
}

function findVoice(synth, voiceURI) {
  if (!voiceURI || !synth || typeof synth.getVoices !== 'function') return null;
  return (synth.getVoices() ?? []).find((voice) => String(voice?.voiceURI ?? voice?.name ?? '') === voiceURI) ?? null;
}

export function previewSaasunaVoice(input = {}, {
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  const terminalResult = (reason) => Object.freeze({
    ok: false,
    reason,
    done: Promise.resolve(Object.freeze({ status: 'error', reason })),
    cancel() {},
  });
  const plan = buildSaasunaVoicePreviewPlan(input);
  if (!plan) return terminalResult('saasuna_voice_text_invalid');
  if (!synth || typeof synth.speak !== 'function' || typeof synth.cancel !== 'function' || typeof Utterance !== 'function') {
    return terminalResult('saasuna_voice_unsupported');
  }

  let cancelled = false;
  let settled = false;
  let timer = null;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const chosenVoice = findVoice(synth, plan.tuning.voiceURI);

  const finish = (status, reason = null) => {
    if (settled) return false;
    settled = true;
    if (timer !== null && typeof clearTimer === 'function') {
      try { clearTimer(timer); } catch {}
      timer = null;
    }
    resolveDone(Object.freeze({ status, reason }));
    return true;
  };

  try {
    synth.cancel();
  } catch {
    return terminalResult('saasuna_voice_start_failed');
  }

  const speakIndex = (index) => {
    if (cancelled || settled || index >= plan.segments.length) return;
    try {
      const utterance = new Utterance(plan.segments[index]);
      utterance.lang = SAASUNA_VOICE_RUNTIME.language;
      utterance.rate = plan.tuning.rate;
      utterance.pitch = plan.tuning.pitch;
      utterance.volume = plan.tuning.volume;
      if (chosenVoice) utterance.voice = chosenVoice;
      utterance.onend = () => {
        if (cancelled || settled) return;
        if (index + 1 >= plan.segments.length) {
          finish('completed');
          return;
        }
        if (typeof setTimer !== 'function') {
          cancelled = true;
          finish('error', 'saasuna_voice_timer_unavailable');
          return;
        }
        timer = setTimer(() => {
          timer = null;
          speakIndex(index + 1);
        }, plan.tuning.pauseMs);
      };
      utterance.onerror = () => {
        if (cancelled || settled) return;
        cancelled = true;
        try { synth.cancel(); } catch {}
        finish('error', 'saasuna_voice_playback_error');
      };
      synth.speak(utterance);
    } catch {
      if (cancelled || settled) return;
      cancelled = true;
      try { synth.cancel(); } catch {}
      finish('error', 'saasuna_voice_playback_error');
    }
  };

  speakIndex(0);
  return Object.freeze({
    ok: true,
    reason: null,
    plan,
    done,
    cancel() {
      if (cancelled || settled) return;
      cancelled = true;
      try { synth.cancel(); } catch {}
      finish('cancelled', 'saasuna_voice_cancelled');
    },
  });
}
