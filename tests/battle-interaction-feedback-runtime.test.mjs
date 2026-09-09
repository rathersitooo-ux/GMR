import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT,
  createBattleInteractionFeedbackRuntime,
} from '../browser/battle-interaction-feedback-runtime.mjs';

test('accepted input delivers only the existing symbolic visual, SFX and haptic vocabulary', () => {
  const visuals = [];
  const sounds = [];
  const haptics = [];
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: (payload) => visuals.push(payload),
    playFormalSfx: (key) => sounds.push(key),
    emitHaptic: (kind) => haptics.push(kind),
  });

  const out = runtime.publish('INPUT_ACCEPTED', { feedbackId: 'input-1' });
  assert.equal(out.ok, true);
  assert.equal(out.cue.stage, 'INPUT_ACCEPTED');
  assert.equal(out.cue.formalSfxKey, 'click');
  assert.equal(out.cue.hapticClass, 'TAP');
  assert.equal(out.cue.visualCue, 'ACK');
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'DELIVERED',
    audio: 'DELIVERED',
    haptic: 'DELIVERED',
  });
  assert.equal(visuals.length, 1);
  assert.equal(visuals[0].visualCue, 'ACK');
  assert.equal(visuals[0].gameStateWrite, false);
  assert.deepEqual(sounds, ['click']);
  assert.deepEqual(haptics, ['TAP']);
});

test('strong feedback remains fail-closed until existing core receives authoritative acceptance', () => {
  let calls = 0;
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: () => { calls += 1; },
    playFormalSfx: () => { calls += 1; },
    emitHaptic: () => { calls += 1; },
  });

  const rejected = runtime.publish('COMMIT_ACCEPTED', { feedbackId: 'commit-1' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'AUTHORITATIVE_ACCEPTANCE_REQUIRED');
  assert.equal(rejected.delivery, null);
  assert.equal(calls, 0);

  const accepted = runtime.publish('COMMIT_ACCEPTED', {
    feedbackId: 'commit-1',
    authoritativeAccepted: true,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.cue.formalSfxKey, 'cardPlace');
  assert.equal(accepted.cue.hapticClass, 'COMMIT');
  assert.equal(accepted.cue.visualCue, 'COMMITTED');
  assert.equal(accepted.delivery.sequence, 1);
  assert.equal(calls, 3);
});

test('unsupported stage or missing caller feedback id never fires presentation callbacks', () => {
  let calls = 0;
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: () => { calls += 1; },
    playFormalSfx: () => { calls += 1; },
    emitHaptic: () => { calls += 1; },
  });

  const noId = runtime.publish('INPUT_ACCEPTED');
  assert.equal(noId.ok, false);
  assert.equal(noId.reason, 'FEEDBACK_ID_REQUIRED');

  const unsupported = runtime.publish('NOT_A_REAL_STAGE', { feedbackId: 'bad-stage-1' });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, 'UNSUPPORTED_PRESENTATION_STAGE');
  assert.equal(unsupported.delivery, null);
  assert.equal(calls, 0);
  assert.equal(runtime.getSequence(), 0);
});

test('same caller event and stage is delivered exactly once while another stage remains distinct', () => {
  const sounds = [];
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: () => {},
    playFormalSfx: (key) => sounds.push(key),
    emitHaptic: () => {},
  });

  const first = runtime.publish('STAGED_SELECTION', { feedbackId: 'action-7' });
  const duplicate = runtime.publish('STAGED_SELECTION', { feedbackId: 'action-7' });
  const nextStage = runtime.publish('PUBLIC_REVEAL', { feedbackId: 'action-7' });

  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.reason, 'DUPLICATE_FEEDBACK_IGNORED');
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.delivery, {
    sequence: 1,
    visual: 'SKIPPED_DUPLICATE',
    audio: 'SKIPPED_DUPLICATE',
    haptic: 'SKIPPED_DUPLICATE',
  });
  assert.equal(nextStage.ok, true);
  assert.equal(nextStage.duplicate, false);
  assert.equal(nextStage.delivery.sequence, 2);
  assert.deepEqual(sounds, ['cardSlide', 'cardSlide']);
});

test('disabled channels remain disabled without changing the remaining presentation meaning', () => {
  const visuals = [];
  let soundCalls = 0;
  let hapticCalls = 0;
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: (payload) => visuals.push(payload),
    playFormalSfx: () => { soundCalls += 1; },
    emitHaptic: () => { hapticCalls += 1; },
  });

  const out = runtime.publish('FOCUS_ACCEPTED', {
    feedbackId: 'focus-muted',
    audioEnabled: false,
    hapticsEnabled: false,
    reducedMotion: true,
    lowPerformance: true,
  });

  assert.equal(out.ok, true);
  assert.equal(out.cue.formalSfxKey, null);
  assert.equal(out.cue.hapticClass, null);
  assert.equal(out.cue.motionProfile, 'REDUCED_LOW_PERF');
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'DELIVERED',
    audio: 'DISABLED',
    haptic: 'DISABLED',
  });
  assert.equal(visuals[0].visualCue, 'FOCUS');
  assert.equal(visuals[0].motionProfile, 'REDUCED_LOW_PERF');
  assert.equal(soundCalls, 0);
  assert.equal(hapticCalls, 0);
});

test('presentation sink failures are isolated and never become gameplay blockers', () => {
  const attempted = [];
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: () => { attempted.push('visual'); throw new Error('paint'); },
    playFormalSfx: () => { attempted.push('audio'); throw new Error('audio'); },
    emitHaptic: () => { attempted.push('haptic'); throw new Error('haptic'); },
  });

  const out = runtime.publish('BOARD_RETURN_ACCEPTED', {
    feedbackId: 'board-return-1',
    authoritativeAccepted: true,
  });

  assert.equal(out.ok, true);
  assert.deepEqual(attempted, ['visual', 'audio', 'haptic']);
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'FAILED_SOFT',
    audio: 'FAILED_SOFT',
    haptic: 'FAILED_SOFT',
  });
  assert.equal(out.cue.blocksInput, false);
  assert.equal(out.cue.gameStateWrite, false);
  assert.equal(out.cue.gameplayAuthority, false);
});

test('destroy clears presentation-only dedupe state and rejects later delivery without owning gameplay lifetime', () => {
  let calls = 0;
  const runtime = createBattleInteractionFeedbackRuntime({
    renderVisual: () => { calls += 1; },
  });
  assert.equal(runtime.publish('INPUT_ACCEPTED', { feedbackId: 'a' }).ok, true);
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.destroy(), false);
  const after = runtime.publish('INPUT_ACCEPTED', { feedbackId: 'b' });
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'RUNTIME_DESTROYED');
  assert.equal(calls, 1);
});

test('runtime contract stays presentation-only and does not own numeric haptic timing or browser vibration', () => {
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.reusesExistingCueProjection, true);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.formalSfxKeyPassThroughOnly, true);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.createsNewSfxVocabulary, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.createsNewHapticVocabulary, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.numericHapticTimingOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.browserHapticApiOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT.gameStateWrite, false);
});
