import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_BODY_INTENT_SCHEMA,
  selectPartnerBodyIntent,
} from '../browser/partner-body-intent-core.mjs';

const IDENTITY = {id: 'partner.saasuna', version: 'v1'};
const BASE_CAPABILITIES = [
  {intent: 'idle_breathe', ready: true, sync: 'none', motionScale: 'small', cost: 'low'},
  {intent: 'beat_nod', ready: true, sync: 'beat', motionScale: 'small', cost: 'low'},
  {intent: 'light_sway', ready: true, sync: 'beat', motionScale: 'small', cost: 'normal'},
  {intent: 'clap_once', ready: true, sync: 'beat', motionScale: 'small', cost: 'low'},
  {intent: 'clap_pattern', ready: true, sync: 'downbeat', motionScale: 'large', cost: 'normal'},
  {intent: 'hip_sway', ready: true, sync: 'beat', motionScale: 'large', cost: 'normal'},
  {intent: 'smile', ready: true, sync: 'none', motionScale: 'none', cost: 'low'},
  {intent: 'whistle_intent', ready: true, sync: 'none', motionScale: 'none', cost: 'low'},
  {intent: 'short_dance', ready: true, sync: 'section', motionScale: 'large', cost: 'high'},
  {intent: 'interrupt_to_focus', ready: true, sync: 'none', motionScale: 'small', cost: 'low'},
];

function select(overrides = {}) {
  return selectPartnerBodyIntent({
    identity: IDENTITY,
    rendererReady: true,
    availableMotionCapabilities: BASE_CAPABILITIES,
    decisionSeed: 'seed-a',
    decisionTimeMs: 1000,
    ...overrides,
  });
}

function walkKeys(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    output.push(key);
    walkKeys(child, output);
  }
  return output;
}

test('no chat and no music has a valid autonomous idle baseline', () => {
  const result = select({
    availableMotionCapabilities: [BASE_CAPABILITIES[0]],
    audienceSignal: null,
    musicTimingContext: {mode: 'none'},
  });
  assert.equal(result.schema, PARTNER_BODY_INTENT_SCHEMA);
  assert.equal(result.status, 'selected');
  assert.equal(result.intent, 'idle_breathe');
  assert.equal(result.beatLocked, false);
});

test('BGM alone never hard-wires short_dance', () => {
  const result = select({
    musicTimingContext: {mode: 'known', authoritativeTimeline: true, nextBeatAtMs: 1200},
    characterIntentCandidates: [],
  });
  assert.notEqual(result.intent, 'short_dance');
  assert.ok(['idle_breathe', 'beat_nod', 'light_sway'].includes(result.intent));
});

test('public audience stimulus influences candidates but is not a direct body command', () => {
  const result = select({
    audienceSignal: {present: true, publicSafe: true, energy: 'high'},
    availableMotionCapabilities: BASE_CAPABILITIES.filter(({intent}) => ['idle_breathe', 'smile', 'clap_once'].includes(intent)),
    decisionSeed: 'audience-seed',
  });
  assert.ok(['idle_breathe', 'smile', 'clap_once'].includes(result.intent));
  assert.equal(result.presentationOnly, true);
});

test('raw or non-public-safe audience payload fails closed instead of entering BodyIntent state', () => {
  assert.equal(select({audienceSignal: {present: true, publicSafe: false, energy: 'high'}}).reason, 'AUDIENCE_SIGNAL_NOT_PUBLIC_SAFE');
  assert.equal(select({audienceSignal: {present: true, publicSafe: true, energy: 'high', rawText: 'dance'}}).reason, 'AUDIENCE_SIGNAL_NOT_PUBLIC_SAFE');
});

test('critical gameplay interrupts long presentation motion and returns focus immediately', () => {
  const result = select({
    criticalGameEvent: true,
    characterIntentCandidates: ['short_dance'],
    musicTimingContext: {mode: 'known', authoritativeTimeline: true, nextSectionAtMs: 1600},
  });
  assert.equal(result.intent, 'interrupt_to_focus');
  assert.equal(result.beatLocked, false);
  assert.equal(result.scheduledAtMs, null);
});

test('critical gameplay falls back to safe idle when explicit focus animation is unavailable', () => {
  const result = select({
    gameIntensity: 'critical',
    availableMotionCapabilities: [BASE_CAPABILITIES[0]],
  });
  assert.equal(result.intent, 'idle_breathe');
  assert.equal(result.reason, 'CRITICAL_EVENT_IDLE_FALLBACK');
});

test('recent semantic intent is suppressed when a safe alternative exists', () => {
  const caps = BASE_CAPABILITIES.filter(({intent}) => ['idle_breathe', 'smile'].includes(intent));
  const result = select({
    excitement: 'excited',
    availableMotionCapabilities: caps,
    recentIntentHistory: ['idle_breathe'],
  });
  assert.equal(result.intent, 'smile');
});

test('known formal BGM quantizes only after a beat-capable intent is selected', () => {
  const result = select({
    availableMotionCapabilities: [BASE_CAPABILITIES.find(({intent}) => intent === 'beat_nod')],
    musicTimingContext: {
      mode: 'known',
      authoritativeTimeline: true,
      nextBeatAtMs: 1250,
      nextDownbeatAtMs: 1500,
      nextSectionAtMs: 4000,
    },
  });
  assert.equal(result.intent, 'beat_nod');
  assert.equal(result.beatLocked, true);
  assert.equal(result.scheduledAtMs, 1250);
  assert.equal(result.timingSource, 'known');
});

test('known BGM cannot beat-lock when the authoritative timeline is absent', () => {
  const result = select({
    availableMotionCapabilities: [BASE_CAPABILITIES.find(({intent}) => intent === 'beat_nod')],
    musicTimingContext: {mode: 'known', authoritativeTimeline: false, nextBeatAtMs: 1250},
  });
  assert.equal(result.intent, 'beat_nod');
  assert.equal(result.beatLocked, false);
  assert.equal(result.scheduledAtMs, null);
});

test('unknown audio with unusable confidence fails soft to non-locked presentation', () => {
  const result = select({
    availableMotionCapabilities: [BASE_CAPABILITIES.find(({intent}) => intent === 'beat_nod')],
    musicTimingContext: {mode: 'estimated', confidenceUsable: false, nextBeatAtMs: 1250},
  });
  assert.equal(result.intent, 'beat_nod');
  assert.equal(result.beatLocked, false);
  assert.equal(result.timingSource, 'none');
});

test('unknown audio can use caller-certified timing confidence without inventing a BPM threshold', () => {
  const result = select({
    availableMotionCapabilities: [BASE_CAPABILITIES.find(({intent}) => intent === 'beat_nod')],
    musicTimingContext: {mode: 'estimated', confidenceUsable: true, nextBeatAtMs: 1250},
  });
  assert.equal(result.beatLocked, true);
  assert.equal(result.scheduledAtMs, 1250);
  assert.equal(result.timingSource, 'estimated');
});

test('reduced motion removes large motion using renderer capability metadata, not hard-coded amplitudes', () => {
  const result = select({
    reducedMotion: true,
    characterIntentCandidates: ['short_dance', 'hip_sway'],
    availableMotionCapabilities: BASE_CAPABILITIES.filter(({intent}) => ['idle_breathe', 'short_dance', 'hip_sway'].includes(intent)),
    recentIntentHistory: ['short_dance', 'hip_sway'],
  });
  assert.equal(result.intent, 'idle_breathe');
});

test('low performance mode permits only capabilities explicitly classified low-cost', () => {
  const result = select({
    lowPerf: true,
    excitement: 'excited',
    characterIntentCandidates: ['short_dance'],
    availableMotionCapabilities: BASE_CAPABILITIES.filter(({intent}) => ['idle_breathe', 'light_sway', 'short_dance'].includes(intent)),
    recentIntentHistory: ['light_sway', 'short_dance'],
  });
  assert.equal(result.intent, 'idle_breathe');
});

test('whistle_intent is semantic only and emits no audio bytes or voice payload', () => {
  const result = select({
    characterIntentCandidates: ['whistle_intent'],
    availableMotionCapabilities: [BASE_CAPABILITIES.find(({intent}) => intent === 'whistle_intent')],
  });
  assert.equal(result.intent, 'whistle_intent');
  assert.equal('audio' in result, false);
  assert.equal('voice' in result, false);
  assert.equal('tts' in result, false);
});

test('invalid identity/version and missing renderer fail closed', () => {
  assert.equal(selectPartnerBodyIntent({identity: {id: 'x', version: ''}, rendererReady: true, availableMotionCapabilities: BASE_CAPABILITIES}).reason, 'IDENTITY_OR_VERSION_INVALID');
  assert.equal(select({rendererReady: false}).reason, 'RENDERER_OR_RIG_UNAVAILABLE');
});

test('multiple candidates require explicit deterministic seed/time and repeat exactly for the same inputs', () => {
  const args = {
    excitement: 'excited',
    availableMotionCapabilities: BASE_CAPABILITIES.filter(({intent}) => ['idle_breathe', 'smile', 'light_sway'].includes(intent)),
    decisionSeed: 'same-seed',
    decisionTimeMs: 5000,
  };
  assert.deepEqual(select(args), select(args));

  const missingSeed = select({...args, decisionSeed: ''});
  assert.equal(missingSeed.status, 'unavailable');
  assert.equal(missingSeed.reason, 'DETERMINISTIC_DECISION_INPUT_REQUIRED');
});

test('output remains presentation-only and contains no gameplay, reward, relationship, save, persona, or canon mutation fields', () => {
  const result = select({
    excitement: 'excited',
    audienceSignal: {present: true, publicSafe: true, energy: 'positive'},
    musicTimingContext: {mode: 'known', authoritativeTimeline: true, nextBeatAtMs: 1200},
    characterIntentCandidates: ['clap_once'],
  });
  const forbidden = /(battle|card|deck|result|reward|rating|economy|save|relationship|intimacy|persona|canon|memory|publish|gamechange)/i;
  assert.equal(walkKeys(result).some((key) => forbidden.test(key)), false);
  assert.equal(result.presentationOnly, true);
});
