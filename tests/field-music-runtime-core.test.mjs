import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_MUSIC_ROLE } from '../browser/field-music-policy-core.mjs';
import { FieldMusicRuntimeCore } from '../browser/field-music-runtime-core.mjs';

class FakeParam {
  constructor(value = 1) { this.value = value; }
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
}
class FakeGain {
  constructor(value = 1) { this.gain = new FakeParam(value); }
  connect() { return this; }
}
class FakeContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumeCalls = 0; this.suspendCalls = 0; }
  createGain() { return new FakeGain(); }
  createMediaElementSource() { return { connect() {} }; }
  async resume() { this.resumeCalls += 1; this.state = 'running'; }
  async suspend() { this.suspendCalls += 1; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
class FakeAudio {
  constructor(env) {
    this.env = env; this.dataset = {}; this.preload = ''; this.loop = false; this.paused = true; this.readyState = 4;
    this.currentTime = 0; this.src = ''; this.error = null; this.listeners = new Map(); this.playCalls = 0; this.pauseCalls = 0;
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {}
  pause() { this.pauseCalls += 1; this.paused = true; }
  async play() {
    this.playCalls += 1;
    this.env.playAttempts.push(this.src);
    if (this.env.failUrls.has(this.src)) throw new Error(`FAKE_PLAY_FAIL:${this.src}`);
    this.paused = false;
    this.listeners.get('playing')?.();
  }
}
function makeEnvironment({ failUrls = [] } = {}) {
  const context = new FakeContext();
  const env = {
    context,
    failUrls: new Set(failUrls),
    playAttempts: [],
    audios: [],
    now: 0,
    createAudioContext() { return context; },
    createAudioElement() { const audio = new FakeAudio(env); env.audios.push(audio); return audio; },
    nowMs() { env.now += 1; return env.now; },
    setTimeout(fn) { fn(); return Symbol('timer'); },
    clearTimeout() {},
  };
  return env;
}
const TRACKS = [
  { key: 'field.primary', role: FIELD_MUSIC_ROLE, url: '/primary.ogg', weight: 100, defaultWeight: 100, baseVolume: 0.6, loopMode: 'whole_file' },
  { key: 'field.fallback', role: FIELD_MUSIC_ROLE, url: '/fallback.ogg', weight: 100, defaultWeight: 100, baseVolume: 0.5, loopMode: 'none' },
];

test('field entry is blocked until explicit user-gesture unlock resumes the AudioContext', async () => {
  const env = makeEnvironment();
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, fadeMs: 0 });
  await assert.rejects(() => runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 }), /USER_GESTURE_UNLOCK_REQUIRED/);
  assert.equal(env.context.resumeCalls, 0);
  assert.equal(await runtime.unlockFromUserGesture(), true);
  assert.equal(env.context.resumeCalls, 1);
  assert.equal(runtime.snapshot().userUnlocked, true);
});

test('selected FIELD_MUSIC starts with policy volume and loop mode, while mute/volume remain authoritative', async () => {
  const env = makeEnvironment();
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, musicVolume: 0.5, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  const result = await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  assert.equal(result.trackKey, 'field.primary');
  assert.deepEqual(env.playAttempts, ['/primary.ogg']);
  assert.equal(runtime.snapshot().mediaLoop, true);
  assert.equal(runtime.snapshot().effectiveGain, 0.3);
  runtime.setMuted(true);
  assert.equal(runtime.snapshot().effectiveGain, 0);
  runtime.setMuted(false);
  runtime.setMusicVolume(0.25);
  assert.equal(runtime.snapshot().effectiveGain, 0.15);
});

test('primary playback failure gets exactly one alternate and never loops into a third retry', async () => {
  const env = makeEnvironment({ failUrls: ['/primary.ogg'] });
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  const result = await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  assert.equal(result.kind, 'fallback');
  assert.equal(result.trackKey, 'field.fallback');
  assert.deepEqual(env.playAttempts, ['/primary.ogg', '/fallback.ogg']);
  assert.equal(runtime.snapshot().mediaLoop, false);
  assert.equal(runtime.events.filter((event) => event.type === 'fallback_selected').length, 1);
});

test('if both primary and alternate fail the runtime becomes silent after two attempts', async () => {
  const env = makeEnvironment({ failUrls: ['/primary.ogg', '/fallback.ogg'] });
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  const result = await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  assert.deepEqual(result, { kind: 'silent', reason: 'fallback_failed', trackKey: null });
  assert.deepEqual(env.playAttempts, ['/primary.ogg', '/fallback.ogg']);
  assert.equal(runtime.snapshot().trackKey, null);
  assert.equal(runtime.events.filter((event) => event.type === 'fallback_failed').length, 1);
});

test('background suspend/resume preserves whether playback was active without reselecting a track', async () => {
  const env = makeEnvironment();
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  const beforeAttempts = env.playAttempts.length;
  await runtime.setBackgroundSuspended(true);
  assert.equal(env.context.state, 'suspended');
  assert.equal(runtime.wasPlayingBeforeSuspend, true);
  await runtime.setBackgroundSuspended(false);
  assert.equal(env.context.state, 'running');
  assert.equal(env.playAttempts.length, beforeAttempts);
});

test('endField fades/stops media and clears selection without exposing gameplay-result semantics', async () => {
  const env = makeEnvironment();
  const runtime = new FieldMusicRuntimeCore({ tracks: TRACKS, environment: env, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  const stopped = await runtime.endField({ fadeMs: 0 });
  assert.equal(stopped.trackKey, null);
  assert.equal(stopped.paused, true);
  assert.equal(stopped.selection, null);
  assert.equal(runtime.events.some((event) => event.type === 'field_exit_stopped'), true);
  assert.equal('winner' in stopped, false);
  assert.equal('reward' in stopped, false);
});

test('silent policy outcomes do not attempt media playback', async () => {
  const env = makeEnvironment();
  const runtime = new FieldMusicRuntimeCore({ tracks: [], environment: env, fadeMs: 0 });
  await runtime.unlockFromUserGesture();
  const result = await runtime.enterField({ fieldId: 'field.1', sessionId: 's1', random: () => 0 });
  assert.equal(result.kind, 'silent');
  assert.deepEqual(env.playAttempts, []);
});
