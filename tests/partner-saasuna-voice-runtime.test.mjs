import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAASUNA_VOICE_RUNTIME,
  buildSaasunaVoicePreviewPlan,
  listSaasunaSystemVoices,
  previewSaasunaVoice,
} from '../browser/partner-saasuna-voice-runtime.mjs';

test('runtime is explicit about provisional browser voice and never claims formal Saasuna voice', () => {
  assert.equal(SAASUNA_VOICE_RUNTIME.partnerId, 'partner.saasuna');
  assert.equal(SAASUNA_VOICE_RUNTIME.provider, 'browser-system-voice');
  assert.equal(SAASUNA_VOICE_RUNTIME.canonicalVoice, false);
  assert.equal(SAASUNA_VOICE_RUNTIME.productionFormalVoice, false);
});

test('only Japanese device voices are exposed and duplicate URIs are collapsed', () => {
  const synth = { getVoices: () => [
    { name: 'JP A', voiceURI: 'jp-a', lang: 'ja-JP', localService: true },
    { name: 'EN', voiceURI: 'en', lang: 'en-US' },
    { name: 'JP A duplicate', voiceURI: 'jp-a', lang: 'ja-JP' },
    { name: 'JP B', voiceURI: 'jp-b', lang: 'ja' },
  ] };
  assert.deepEqual(listSaasunaSystemVoices(synth).map((voice) => voice.voiceURI), ['jp-a', 'jp-b']);
});

test('preview plan segments sentences and preserves detailed tuning', () => {
  const plan = buildSaasunaVoicePreviewPlan({
    text: '勝てましたね。次も行きましょう！',
    tuning: { rate: 1.15, pitch: 0.9, volume: 0.8, pauseMs: 220, voiceURI: 'jp-a' },
  });
  assert.deepEqual(plan.segments, ['勝てましたね。', '次も行きましょう！']);
  assert.deepEqual(plan.tuning, { rate: 1.15, pitch: 0.9, volume: 0.8, pauseMs: 220, voiceURI: 'jp-a' });
});

test('preview applies selected tuning to utterances and schedules the next segment', () => {
  const spoken = [];
  const timers = [];
  class Utterance {
    constructor(text) { this.text = text; this.onend = null; }
  }
  const synth = {
    cancelled: 0,
    voices: [{ name: 'JP A', voiceURI: 'jp-a', lang: 'ja-JP' }],
    getVoices() { return this.voices; },
    cancel() { this.cancelled += 1; },
    speak(utterance) { spoken.push(utterance); },
  };
  const result = previewSaasunaVoice({
    text: '一文目。二文目。',
    tuning: { rate: 1.2, pitch: 0.8, volume: 0.7, pauseMs: 160, voiceURI: 'jp-a' },
  }, {
    synth,
    Utterance,
    setTimer(fn, ms) { timers.push({ fn, ms }); return 1; },
  });
  assert.equal(result.ok, true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].rate, 1.2);
  assert.equal(spoken[0].pitch, 0.8);
  assert.equal(spoken[0].volume, 0.7);
  assert.equal(spoken[0].voice.voiceURI, 'jp-a');
  spoken[0].onend();
  assert.equal(timers[0].ms, 160);
  timers[0].fn();
  assert.equal(spoken.length, 2);
});
