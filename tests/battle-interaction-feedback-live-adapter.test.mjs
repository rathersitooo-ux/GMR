import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT,
  createBattleInteractionFeedbackLiveAdapter,
  projectBattleInteractionFeedbackEvent,
} from '../browser/battle-interaction-feedback-live-adapter.mjs';

function confirmed(stage, extra = {}) {
  return {
    receiptId: `receipt-${stage}`,
    stage,
    eventConfirmed: true,
    ...extra,
  };
}

test('projection fails closed without caller confirmation or with rejected events', () => {
  assert.equal(projectBattleInteractionFeedbackEvent(null).reason, 'EVENT_REQUIRED');
  assert.equal(projectBattleInteractionFeedbackEvent({ rejected: true }).reason, 'REJECTED_EVENT_NOT_OWNED');
  assert.equal(projectBattleInteractionFeedbackEvent({ stage: 'FOCUS_ACCEPTED', eventConfirmed: true }).reason, 'RECEIPT_ID_REQUIRED');
  assert.equal(projectBattleInteractionFeedbackEvent({ receiptId: 'r', eventConfirmed: true }).reason, 'STAGE_REQUIRED');
  assert.equal(projectBattleInteractionFeedbackEvent({ receiptId: 'r', stage: 'FOCUS_ACCEPTED' }).reason, 'EVENT_CONFIRMATION_REQUIRED');
});

test('authoritative stages retain existing acceptance authority', () => {
  const missingAuthority = projectBattleInteractionFeedbackEvent(confirmed('COMMIT_ACCEPTED'));
  assert.equal(missingAuthority.ok, false);
  assert.equal(missingAuthority.reason, 'AUTHORITATIVE_ACCEPTANCE_REQUIRED');

  const accepted = projectBattleInteractionFeedbackEvent(confirmed('COMMIT_ACCEPTED', {
    authoritativeAccepted: true,
  }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.feedback.cue.formalSfxKey, 'cardPlace');
  assert.equal(accepted.feedback.cue.hapticClass, 'COMMIT');
  assert.equal(accepted.feedback.gameStateWrite, false);
});

test('semantic guards must exactly match guarded goal stages', () => {
  const missing = projectBattleInteractionFeedbackEvent(confirmed('GOAL_PATH_OPENED', {
    authoritativeAccepted: true,
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'SEMANTIC_GUARD_MISMATCH');

  const wrong = projectBattleInteractionFeedbackEvent(confirmed('GOAL_PATH_OPENED', {
    authoritativeAccepted: true,
    semanticGuard: 'AUTHORITATIVE_GOAL_EVENT_ONLY',
  }));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, 'SEMANTIC_GUARD_MISMATCH');

  const correct = projectBattleInteractionFeedbackEvent(confirmed('GOAL_PATH_OPENED', {
    authoritativeAccepted: true,
    semanticGuard: 'NONTERMINAL_PATH_OPEN',
  }));
  assert.equal(correct.ok, true);
  assert.equal(correct.feedback.cue.visualCue, 'GOAL_PATH_OPEN');
});

test('live adapter delivers a confirmed stage once and suppresses duplicate receipt-stage pairs', () => {
  const visuals = [];
  const audio = [];
  const haptics = [];
  const adapter = createBattleInteractionFeedbackLiveAdapter({
    renderVisual: (payload) => visuals.push(payload),
    playFormalSfx: (key, context) => audio.push({ key, context }),
    emitHaptic: (kind, context) => haptics.push({ kind, context }),
  });

  const event = confirmed('COMMIT_ACCEPTED', {
    receiptId: 'commit-42',
    authoritativeAccepted: true,
  });
  const first = adapter.publish(event);
  assert.equal(first.ok, true);
  assert.deepEqual(first.delivery, {
    sequence: 1,
    duplicateSuppressed: false,
    visual: 'DELIVERED',
    audio: 'DELIVERED',
    haptic: 'DELIVERED',
  });
  assert.equal(visuals[0].visualCue, 'COMMITTED');
  assert.equal(audio[0].key, 'cardPlace');
  assert.equal(haptics[0].kind, 'COMMIT');
  assert.equal(adapter.hasPresented('commit-42', 'COMMIT_ACCEPTED'), true);

  const duplicate = adapter.publish(event);
  assert.equal(duplicate.reason, 'DUPLICATE_FEEDBACK_SUPPRESSED');
  assert.equal(duplicate.delivery.duplicateSuppressed, true);
  assert.equal(adapter.getSequence(), 1);
  assert.equal(visuals.length, 1);
  assert.equal(audio.length, 1);
  assert.equal(haptics.length, 1);
});

test('the same receipt may carry a different confirmed stage without being suppressed', () => {
  const audio = [];
  const adapter = createBattleInteractionFeedbackLiveAdapter({
    playFormalSfx: (key) => audio.push(key),
  });

  const focus = adapter.publish(confirmed('FOCUS_ACCEPTED', { receiptId: 'action-9' }));
  const staged = adapter.publish(confirmed('STAGED_SELECTION', { receiptId: 'action-9' }));

  assert.equal(focus.delivery.sequence, 1);
  assert.equal(staged.delivery.sequence, 2);
  assert.deepEqual(audio, ['click', 'cardSlide']);
});

test('public reveal keeps haptics absent and preferences can disable all cue channels', () => {
  const visuals = [];
  const audio = [];
  const haptics = [];
  const adapter = createBattleInteractionFeedbackLiveAdapter({
    renderVisual: (payload) => visuals.push(payload),
    playFormalSfx: (key) => audio.push(key),
    emitHaptic: (kind) => haptics.push(kind),
  });

  const reveal = adapter.publish(confirmed('PUBLIC_REVEAL', { receiptId: 'reveal-1' }));
  assert.equal(reveal.delivery.visual, 'DELIVERED');
  assert.equal(reveal.delivery.audio, 'DELIVERED');
  assert.equal(reveal.delivery.haptic, 'DISABLED');
  assert.equal(haptics.length, 0);

  const muted = adapter.publish(confirmed('FOCUS_ACCEPTED', { receiptId: 'focus-muted' }), {
    visualEnabled: false,
    audioEnabled: false,
    hapticsEnabled: false,
  });
  assert.deepEqual(muted.delivery, {
    sequence: 2,
    duplicateSuppressed: false,
    visual: 'DISABLED',
    audio: 'DISABLED',
    haptic: 'DISABLED',
  });
  assert.equal(visuals.length, 1);
  assert.equal(audio.length, 1);
  assert.equal(haptics.length, 0);
});

test('reduced motion and low performance are forwarded only to presentation output', () => {
  const visuals = [];
  const adapter = createBattleInteractionFeedbackLiveAdapter({
    renderVisual: (payload) => visuals.push(payload),
  });

  const result = adapter.publish(confirmed('STAGED_SELECTION', { receiptId: 'stage-low' }), {
    reducedMotion: true,
    lowPerformance: true,
  });

  assert.equal(result.ok, true);
  assert.equal(visuals[0].motionProfile, 'REDUCED_LOW_PERF');
  assert.equal(result.feedback.gameStateWrite, false);
});

test('consumer failures are fail-soft but the confirmed receipt is still consumed once', () => {
  const adapter = createBattleInteractionFeedbackLiveAdapter({
    renderVisual: () => { throw new Error('visual failed'); },
    playFormalSfx: () => { throw new Error('audio failed'); },
    emitHaptic: () => { throw new Error('haptic failed'); },
  });

  const event = confirmed('BOARD_RETURN_ACCEPTED', {
    receiptId: 'return-1',
    authoritativeAccepted: true,
  });
  const first = adapter.publish(event);
  assert.deepEqual(first.delivery, {
    sequence: 1,
    duplicateSuppressed: false,
    visual: 'FAILED_SOFT',
    audio: 'FAILED_SOFT',
    haptic: 'FAILED_SOFT',
  });

  const second = adapter.publish(event);
  assert.equal(second.reason, 'DUPLICATE_FEEDBACK_SUPPRESSED');
  assert.equal(adapter.getSequence(), 1);
});

test('adapter requires at least one real presentation consumer and owns no game authority', () => {
  assert.throws(() => createBattleInteractionFeedbackLiveAdapter(), /at least one feedback consumer callback is required/);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.rejectedEventOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.soundAssetRegistryOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.browserHapticApiOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.gameStateWrite, false);
});
