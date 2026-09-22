import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMP_REFERENCE_SFX_CONTRACT,
  TEMP_REFERENCE_SFX_KEYS,
  isTempReferenceSfxEnabled,
  playTempReferenceSfx,
  resolveTempReferenceSfxSpec,
} from '../browser/temp-sfx-reference-runtime.mjs';

class FakeAudioParam {
  constructor() { this.events = []; }
  setValueAtTime(value, at) { this.events.push(['set', value, at]); }
  exponentialRampToValueAtTime(value, at) { this.events.push(['exp', value, at]); }
}

class FakeOscillator {
  constructor(log) {
    this.log = log;
    this.frequency = new FakeAudioParam();
    this.type = 'sine';
  }
  connect(node) { this.log.push(['osc-connect', node.constructor.name]); }
  start(at) { this.log.push(['start', at, this.type]); }
  stop(at) { this.log.push(['stop', at, this.type]); }
}

class FakeGain {
  constructor(log) {
    this.log = log;
    this.gain = new FakeAudioParam();
  }
  connect(node) { this.log.push(['gain-connect', node === this.destination ? 'destination' : typeof node]); }
}

class FakeContext {
  constructor() {
    this.currentTime = 10;
    this.state = 'running';
    this.destination = {};
    this.log = [];
    this.oscillators = [];
    this.gains = [];
  }
  createOscillator() {
    const node = new FakeOscillator(this.log);
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = new FakeGain(this.log);
    this.gains.push(node);
    return node;
  }
}

test('temporary reference SFX remain explicitly non-formal and byte-free', () => {
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.formalAsset, false);
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.thirdPartyAudioBytes, false);
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.runtimeSynthesisOnly, true);
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.sourceAudioCopied, false);
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.gameplayAuthority, false);
  assert.equal(TEMP_REFERENCE_SFX_CONTRACT.mustReviewBeforeRelease, true);
});

test('all three current reference cues are defined', () => {
  for (const key of [
    TEMP_REFERENCE_SFX_KEYS.CONFIRM,
    TEMP_REFERENCE_SFX_KEYS.RECOVERY,
    TEMP_REFERENCE_SFX_KEYS.SUPER_CHARGE,
  ]) {
    const spec = resolveTempReferenceSfxSpec(key);
    assert.ok(spec);
    assert.ok(spec.voices.length >= 2);
    assert.match(spec.intent, /reference/i);
  }
});

test('test mode requires the explicit tempSfx=1 query value', () => {
  assert.equal(isTempReferenceSfxEnabled({ search: '?tempSfx=1' }), true);
  assert.equal(isTempReferenceSfxEnabled({ search: '?x=1&tempSfx=1' }), true);
  assert.equal(isTempReferenceSfxEnabled({ search: '?tempSfx=0' }), false);
  assert.equal(isTempReferenceSfxEnabled({ search: '' }), false);
  assert.equal(isTempReferenceSfxEnabled(null), false);
});

test('each cue schedules only synthesized oscillator voices', () => {
  for (const key of Object.values(TEMP_REFERENCE_SFX_KEYS)) {
    const context = new FakeContext();
    const result = playTempReferenceSfx(key, { context, volume: 0.5 });
    assert.equal(result.ok, true);
    assert.equal(result.externalAudioBytes, false);
    assert.equal(result.formalAsset, false);
    assert.equal(result.voiceCount, resolveTempReferenceSfxSpec(key).voices.length);
    assert.equal(context.oscillators.length, result.voiceCount);
    assert.equal(context.gains.length, result.voiceCount);
    assert.ok(context.log.some((event) => event[0] === 'start'));
    assert.ok(context.log.some((event) => event[0] === 'stop'));
  }
});

test('unknown cues and unavailable Web Audio fail softly', () => {
  assert.deepEqual(playTempReferenceSfx('not-a-cue', { context: new FakeContext() }), {
    ok: false,
    reason: 'UNKNOWN_TEMP_SFX_KEY',
    key: 'not-a-cue',
    voiceCount: 0,
  });
  assert.deepEqual(playTempReferenceSfx(TEMP_REFERENCE_SFX_KEYS.CONFIRM, {
    AudioContextCtor: null,
    context: null,
  }), {
    ok: false,
    reason: 'WEB_AUDIO_UNAVAILABLE',
    key: TEMP_REFERENCE_SFX_KEYS.CONFIRM,
    voiceCount: 0,
  });
});
