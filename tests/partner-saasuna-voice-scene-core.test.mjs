import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAASUNA_TRIGGER_MOTION,
  SAASUNA_VOICE_PRESET,
  SAASUNA_VOICE_SCENE_TRIGGERS,
  buildSaasunaVoiceCompleteness,
  buildSaasunaVoiceScenePlan,
  createSaasunaVoiceScenePlayer,
} from '../browser/partner-saasuna-voice-scene-core.mjs';
import { getSaasunaConversationSource } from '../browser/partner-saasuna-conversation-source.mjs';

test('preset is one provisional starting point and never claims a formal voice', () => {
  assert.equal(SAASUNA_VOICE_PRESET.provisional, true);
  assert.equal(SAASUNA_VOICE_PRESET.canonicalVoice, false);
  assert.equal(SAASUNA_VOICE_PRESET.productionFormalVoice, false);
  assert.deepEqual(SAASUNA_VOICE_PRESET.tuning, {
    rate: 0.95, pitch: 1.15, volume: 1, pauseMs: 160, voiceURI: '',
  });
});

test('every approved battle line has a scene plan with text, voice, motion and art', () => {
  const source = getSaasunaConversationSource();
  assert.ok(source);
  for (const triggerId of source.approvedBattleTriggerIds) {
    assert.ok(Object.hasOwn(SAASUNA_TRIGGER_MOTION, triggerId), `motion missing for ${triggerId}`);
    const needsCard = triggerId === 'load_reveal' || triggerId === 'effect_activation';
    const plan = buildSaasunaVoiceScenePlan({
      triggerId,
      seed: `test-${triggerId}`,
      fields: needsCard ? { cardName: '試しのカード' } : {},
    });
    assert.ok(plan, `plan missing for ${triggerId}`);
    assert.equal(plan.partnerId, 'partner.saasuna');
    assert.ok(plan.text.length > 0);
    assert.equal(plan.voice.shouldSpeak, true);
    assert.ok(plan.voice.segments.length >= 1);
    assert.equal(plan.voice.tuning.pitch, SAASUNA_VOICE_PRESET.tuning.pitch);
    assert.equal(plan.motion.state, SAASUNA_TRIGGER_MOTION[triggerId]);
    assert.ok(plan.motion.durationMs > 0);
    assert.ok(plan.asset.fileName.endsWith('.png'));
    assert.equal(plan.voice.canonicalVoice, false);
  }
  assert.ok(SAASUNA_VOICE_SCENE_TRIGGERS.includes('idle'));
});

test('card-name lines fail closed without a card name and render with one', () => {
  assert.equal(buildSaasunaVoiceScenePlan({ triggerId: 'load_reveal' }), null);
  const plan = buildSaasunaVoiceScenePlan({
    triggerId: 'load_reveal',
    fields: { cardName: '氷のカード' },
  });
  assert.ok(plan);
  assert.ok(plan.text.includes('氷のカード'));
});

test('idle plan uses an approved fallback line with the gentle motion', () => {
  const plan = buildSaasunaVoiceScenePlan({ triggerId: 'idle', seed: 'scene-test-idle' });
  assert.ok(plan);
  assert.ok(getSaasunaConversationSource().approvedFallbackLines.includes(plan.text));
  assert.equal(plan.motion.state, 'IDLE_GENTLE');
  assert.equal(plan.motion.loop, true);
});

test('unknown triggers and other partners never produce a plan', () => {
  assert.equal(buildSaasunaVoiceScenePlan({ triggerId: 'no_such_trigger' }), null);
  assert.equal(buildSaasunaVoiceScenePlan({}), null);
  assert.equal(buildSaasunaVoiceScenePlan(null), null);
});

test('voice off and purge keep text, motion and art while silencing only the voice', () => {
  const off = buildSaasunaVoiceScenePlan({ triggerId: 'battle_start', voiceEnabled: false });
  assert.equal(off.voice.shouldSpeak, false);
  assert.equal(off.voice.reason, 'voice_off');
  assert.ok(off.text.length > 0);
  assert.equal(off.motion.state, 'GUIDE_PRESENT');
  assert.ok(off.asset.fileName.endsWith('.png'));

  const purged = buildSaasunaVoiceScenePlan({ triggerId: 'battle_start', voicePurged: true });
  assert.equal(purged.voice.shouldSpeak, false);
  assert.equal(purged.voice.reason, 'voice_purged');
  assert.ok(purged.text.length > 0);
  assert.ok(purged.motion.keyframes.length >= 2);
});

test('reduced motion keeps the pose and text but marks the motion suppressed', () => {
  const plan = buildSaasunaVoiceScenePlan({ triggerId: 'royal_reveal', reducedMotion: true });
  assert.equal(plan.motion.suppressed, true);
  assert.equal(plan.motion.state, 'HAPPY_WAVE');
  assert.ok(plan.asset.fileName.endsWith('.png'));
});

test('tuning overrides layer on top of the preset instead of replacing it', () => {
  const plan = buildSaasunaVoiceScenePlan({ triggerId: 'battle_start', tuning: { rate: 1.1 } });
  assert.equal(plan.voice.tuning.rate, 1.1);
  assert.equal(plan.voice.tuning.pitch, SAASUNA_VOICE_PRESET.tuning.pitch);
  assert.equal(plan.voice.tuning.pauseMs, SAASUNA_VOICE_PRESET.tuning.pauseMs);
});

test('completeness counts line up with the approved sources', () => {
  const done = buildSaasunaVoiceCompleteness();
  assert.equal(done.battleLineCount, 14);
  assert.equal(done.battleLinesWithMotion, 14);
  assert.equal(done.fallbackLineCount, 4);
  assert.equal(done.motionStateCount, 9);
  assert.equal(done.bustupAssetCount, 9);
  assert.equal(done.formalAcceptancePending, true);
  assert.equal(done.canonicalVoice, false);
});

function fakeVoice({ fail = false } = {}) {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    preview(input) {
      calls.push(input);
      if (fail) return { ok: false, reason: 'saasuna_voice_unsupported', done: Promise.resolve({ status: 'error', reason: 'saasuna_voice_unsupported' }), cancel() {} };
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      const entry = { input, resolve, cancelled: false };
      pending.push(entry);
      return {
        ok: true,
        reason: null,
        done,
        cancel() { entry.cancelled = true; resolve({ status: 'cancelled', reason: 'saasuna_voice_cancelled' }); },
      };
    },
  };
}

test('player speaks and moves together, exactly once per fingerprint', async () => {
  const voice = fakeVoice();
  const motions = [];
  const player = createSaasunaVoiceScenePlayer({
    previewVoice: voice.preview,
    motionController: { setState: (input) => motions.push(input) },
  });
  const plan = buildSaasunaVoiceScenePlan({ triggerId: 'battle_start' });
  const first = player.play(plan, { fingerprint: 'match-1:start' });
  assert.equal(first.ok, true);
  assert.equal(first.spoken, true);
  assert.equal(voice.calls.length, 1);
  assert.equal(voice.calls[0].text, plan.text);
  assert.deepEqual(motions, [{ partnerId: 'partner.saasuna', visualState: 'GUIDE_PRESENT' }]);

  const again = player.play(plan, { fingerprint: 'match-1:start' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'saasuna_voice_scene_already_played');
  assert.equal(voice.calls.length, 1);

  voice.pending[0].resolve({ status: 'completed', reason: null });
  await first.done;
  assert.deepEqual(player.flags().map((f) => f.kind), ['heard']);
});

test('player records skipped when a new scene interrupts, and notHeard when the device cannot speak', async () => {
  const voice = fakeVoice();
  const player = createSaasunaVoiceScenePlayer({ previewVoice: voice.preview });
  const a = player.play(buildSaasunaVoiceScenePlan({ triggerId: 'battle_start' }), { fingerprint: 'a' });
  const b = player.play(buildSaasunaVoiceScenePlan({ triggerId: 'delegate_normal' }), { fingerprint: 'b' });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(voice.pending[0].cancelled, true);
  voice.pending[1].resolve({ status: 'completed', reason: null });
  await b.done;
  await a.done;
  const kinds = player.flags().map((f) => f.kind);
  assert.ok(kinds.includes('skipped'));
  assert.ok(kinds.includes('heard'));

  const broken = createSaasunaVoiceScenePlayer({ previewVoice: fakeVoice({ fail: true }).preview });
  const silent = broken.play(buildSaasunaVoiceScenePlan({ triggerId: 'battle_start' }), { fingerprint: 'x' });
  assert.equal(silent.spoken, false);
  assert.deepEqual(broken.flags().map((f) => f.kind), ['notHeard']);
});

test('player with voice off still moves and records muted, never notHeard', async () => {
  const voice = fakeVoice();
  const motions = [];
  const player = createSaasunaVoiceScenePlayer({
    previewVoice: voice.preview,
    motionController: { setState: (input) => motions.push(input) },
  });
  const plan = buildSaasunaVoiceScenePlan({ triggerId: 'battle_start', voiceEnabled: false });
  const result = player.play(plan, { fingerprint: 'muted-1' });
  assert.equal(result.ok, true);
  assert.equal(result.spoken, false);
  assert.equal(voice.calls.length, 0);
  assert.equal(motions.length, 1);
  assert.deepEqual(await result.done, { status: 'silent', reason: 'voice_off' });
  assert.deepEqual(player.flags().map((f) => f.kind), ['muted']);
});
