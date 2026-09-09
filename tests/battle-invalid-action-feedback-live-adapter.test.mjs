import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT,
  createBattleInvalidActionFeedbackLiveAdapter,
  projectBattleInvalidActionFeedback,
} from '../browser/battle-invalid-action-feedback-live-adapter.mjs';

const canonicalReject = Object.freeze({
  rejected: true,
  viewerSafe: true,
  viewerSafeReason: 'そのカードは今は出せません',
  internalReason: 'SECRET_SERVER_ONLY_DETAIL',
});

test('fails closed unless rejection and viewer-safe reason are explicitly supplied by caller', () => {
  assert.deepEqual(projectBattleInvalidActionFeedback(null), {
    ok: false,
    reason: 'REJECTION_REQUIRED',
    feedback: null,
  });
  assert.equal(projectBattleInvalidActionFeedback({ rejected: false }).reason, 'REJECTION_NOT_CONFIRMED');
  assert.equal(projectBattleInvalidActionFeedback({ rejected: true, viewerSafe: false, viewerSafeReason: 'x' }).reason, 'VIEWER_SAFE_ASSERTION_REQUIRED');
  assert.equal(projectBattleInvalidActionFeedback({ rejected: true, viewerSafe: true, viewerSafeReason: '   ' }).reason, 'VIEWER_SAFE_REASON_REQUIRED');
});

test('projects caller-owned viewer-safe reason without inferring or exposing hidden reason fields', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject);
  assert.equal(out.ok, true);
  assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
  assert.equal(out.feedback.kind, 'INVALID_ACTION');
  assert.equal(out.feedback.visual.state, 'failed');
  assert.equal(out.feedback.visual.cue, 'REJECTED');
  assert.equal(JSON.stringify(out).includes('SECRET_SERVER_ONLY_DETAIL'), false);
  assert.equal(out.feedback.reasonAuthority, false);
  assert.equal(out.feedback.legalityAuthority, false);
});

test('reuses existing input acknowledgement SFX/haptic vocabulary instead of inventing reject authority', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject);
  assert.equal(out.feedback.inputAcknowledgement.stage, 'INPUT_ACCEPTED');
  assert.equal(out.feedback.inputAcknowledgement.formalSfxKey, 'click');
  assert.equal(out.feedback.inputAcknowledgement.hapticClass, 'TAP');
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.reusesExistingInputAcknowledgementCue, true);
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.createsNewSfxVocabulary, false);
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.createsNewHapticVocabulary, false);
});

test('muted or haptics-disabled modes preserve viewer-safe text and failed visual meaning', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject, {
    audioEnabled: false,
    hapticsEnabled: false,
  });
  assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
  assert.equal(out.feedback.visual.state, 'failed');
  assert.equal(out.feedback.visual.cue, 'REJECTED');
  assert.equal(out.feedback.inputAcknowledgement.formalSfxKey, null);
  assert.equal(out.feedback.inputAcknowledgement.hapticClass, null);
});

test('reduced-motion and low-performance only reduce motion, not rejection meaning', () => {
  const reduced = projectBattleInvalidActionFeedback(canonicalReject, { reducedMotion: true });
  const lowPerf = projectBattleInvalidActionFeedback(canonicalReject, { lowPerformance: true });
  const both = projectBattleInvalidActionFeedback(canonicalReject, { reducedMotion: true, lowPerformance: true });

  assert.equal(reduced.feedback.visual.motionProfile, 'REDUCED');
  assert.equal(lowPerf.feedback.visual.motionProfile, 'LOW_PERF');
  assert.equal(both.feedback.visual.motionProfile, 'REDUCED_LOW_PERF');
  for (const out of [reduced, lowPerf, both]) {
    assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
    assert.equal(out.feedback.visual.state, 'failed');
    assert.equal(out.feedback.gameStateWrite, false);
  }
});

test('live adapter delivers visual, existing SFX key and symbolic haptic exactly once', () => {
  const renders = [];
  const sounds = [];
  const haptics = [];
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: (payload) => renders.push(payload),
    playFormalSfx: (key) => sounds.push(key),
    emitHaptic: (kind) => haptics.push(kind),
  });

  const out = adapter.publish(canonicalReject);
  assert.equal(out.ok, true);
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'DELIVERED',
    audio: 'DELIVERED',
    haptic: 'DELIVERED',
  });
  assert.equal(renders.length, 1);
  assert.equal(renders[0].reasonText, 'そのカードは今は出せません');
  assert.deepEqual(sounds, ['click']);
  assert.deepEqual(haptics, ['TAP']);
  assert.equal(adapter.getSequence(), 1);
});

test('invalid rejection never fires presentation callbacks', () => {
  let calls = 0;
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: () => { calls += 1; },
    playFormalSfx: () => { calls += 1; },
    emitHaptic: () => { calls += 1; },
  });

  const out = adapter.publish({ rejected: true, viewerSafe: false, viewerSafeReason: 'internal' });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.equal(adapter.getSequence(), 0);
});

test('presentation callback failures fail soft and never become gameplay blockers', () => {
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: () => { throw new Error('paint failed'); },
    playFormalSfx: () => { throw new Error('audio failed'); },
    emitHaptic: () => { throw new Error('haptic failed'); },
  });

  const out = adapter.publish(canonicalReject);
  assert.equal(out.ok, true);
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'FAILED_SOFT',
    audio: 'FAILED_SOFT',
    haptic: 'FAILED_SOFT',
  });
  assert.equal(out.feedback.blocksInput, false);
  assert.equal(out.feedback.gameplayAuthority, false);
});
