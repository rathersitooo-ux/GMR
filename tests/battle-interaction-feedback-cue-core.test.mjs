import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT,
  projectBattleInteractionFeedbackCue,
} from '../browser/battle-interaction-feedback-cue-core.mjs';

function cue(stage, options = {}) {
  const result = projectBattleInteractionFeedbackCue(stage, options);
  assert.equal(result.ok, true, result.reason);
  return result.cue;
}

test('uses only the three existing formal SFX semantic keys', () => {
  assert.deepEqual(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.formalSfxKeys, {
    CLICK: 'click',
    CARD_SLIDE: 'cardSlide',
    CARD_PLACE: 'cardPlace',
  });
  const used = new Set(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.supportedStages
    .map((stage) => projectBattleInteractionFeedbackCue(stage, { authoritativeAccepted: true }))
    .filter((result) => result.ok)
    .map((result) => result.cue.formalSfxKey));
  assert.deepEqual([...used].sort(), ['cardPlace', 'cardSlide', 'click']);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.soundAssetRegistryOwned, false);
});

test('input acknowledgement is immediate presentation feedback and never blocks input', () => {
  const projected = cue('INPUT_ACCEPTED');
  assert.equal(projected.formalSfxKey, 'click');
  assert.equal(projected.hapticClass, 'TAP');
  assert.equal(projected.visualCue, 'ACK');
  assert.equal(projected.blocksInput, false);
  assert.equal(projected.gameStateWrite, false);
});

test('staged, commit, reveal, resolution and board-return stages keep causal intensity hierarchy', () => {
  assert.equal(cue('STAGED_SELECTION').intensity, 'MEDIUM');
  assert.equal(cue('COMMIT_ACCEPTED', { authoritativeAccepted: true }).intensity, 'STRONG');
  assert.equal(cue('PUBLIC_REVEAL').formalSfxKey, 'cardSlide');
  assert.equal(cue('RESOLUTION_STEP').formalSfxKey, 'click');
  const returned = cue('BOARD_RETURN_ACCEPTED', { authoritativeAccepted: true });
  assert.equal(returned.formalSfxKey, 'cardPlace');
  assert.equal(returned.hapticClass, 'RESOLVE');
});

test('authoritative outcome-like stages fail closed until caller confirms acceptance', () => {
  for (const stage of ['COMMIT_ACCEPTED', 'BOARD_RETURN_ACCEPTED', 'GOAL_PATH_OPENED', 'GOAL_REACHED_ACCEPTED']) {
    assert.deepEqual(
      projectBattleInteractionFeedbackCue(stage),
      { ok: false, reason: 'AUTHORITATIVE_ACCEPTANCE_REQUIRED', cue: null },
      stage,
    );
  }
});

test('GOAL path opening remains explicitly nonterminal and does not become a victory cue', () => {
  const projected = cue('GOAL_PATH_OPENED', { authoritativeAccepted: true });
  assert.equal(projected.semanticGuard, 'NONTERMINAL_PATH_OPEN');
  assert.equal(projected.visualCue, 'GOAL_PATH_OPEN');
  assert.equal(projected.resultAuthority, false);
  assert.equal(projected.gameplayAuthority, false);
  assert.equal(projected.probabilityCue, false);
});

test('accepted GOAL_REACHED is only presentation of caller authority, never local result authority', () => {
  const projected = cue('GOAL_REACHED_ACCEPTED', { authoritativeAccepted: true });
  assert.equal(projected.semanticGuard, 'AUTHORITATIVE_GOAL_EVENT_ONLY');
  assert.equal(projected.resultAuthority, false);
  assert.equal(projected.gameStateWrite, false);
  assert.equal(projected.targetAuthority, false);
  assert.equal(projected.legalityAuthority, false);
});

test('audio, haptic and visual capability flags fail soft without changing semantic stage', () => {
  const projected = cue('STAGED_SELECTION', {
    audioEnabled: false,
    hapticsEnabled: false,
    visualEnabled: false,
  });
  assert.equal(projected.stage, 'STAGED_SELECTION');
  assert.equal(projected.formalSfxKey, null);
  assert.equal(projected.hapticClass, null);
  assert.equal(projected.visualCue, null);
  assert.equal(projected.motionProfile, 'NONE');
});

test('ReducedMotion and LowPerf only change motion profile, never gameplay meaning', () => {
  const normal = cue('COMMIT_ACCEPTED', { authoritativeAccepted: true });
  const reduced = cue('COMMIT_ACCEPTED', { authoritativeAccepted: true, reducedMotion: true });
  const lowPerf = cue('COMMIT_ACCEPTED', { authoritativeAccepted: true, lowPerformance: true });
  const both = cue('COMMIT_ACCEPTED', {
    authoritativeAccepted: true,
    reducedMotion: true,
    lowPerformance: true,
  });
  assert.equal(normal.motionProfile, 'NORMAL');
  assert.equal(reduced.motionProfile, 'REDUCED');
  assert.equal(lowPerf.motionProfile, 'LOW_PERF');
  assert.equal(both.motionProfile, 'REDUCED_LOW_PERF');
  for (const projected of [normal, reduced, lowPerf, both]) {
    assert.equal(projected.stage, 'COMMIT_ACCEPTED');
    assert.equal(projected.formalSfxKey, 'cardPlace');
    assert.equal(projected.gameStateWrite, false);
  }
});

test('haptic output is symbolic only and owns no browser API or timing numbers', () => {
  const projected = cue('BOARD_RETURN_ACCEPTED', { authoritativeAccepted: true });
  assert.equal(projected.hapticClass, 'RESOLVE');
  assert.equal(projected.numericHapticTimingOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.numericHapticTimingOwned, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.browserHapticApiOwned, false);
});

test('precommit cancel acknowledges only the presentation clear and owns no rollback', () => {
  const projected = cue('PRECOMMIT_CANCELLED');
  assert.equal(projected.formalSfxKey, 'click');
  assert.equal(projected.visualCue, 'CLEAR_STAGED');
  assert.equal(projected.gameStateWrite, false);
  assert.equal(projected.resultAuthority, false);
});

test('unknown stages and gambling-style cue semantics are absent', () => {
  assert.deepEqual(
    projectBattleInteractionFeedbackCue('ANTICIPATION_ODDS_UP'),
    { ok: false, reason: 'UNSUPPORTED_PRESENTATION_STAGE', cue: null },
  );
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.randomization, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.probabilityOrExpectationSignaling, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.blocksInput, false);
  assert.equal(BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.liveRuntimeWiringIncluded, false);
});
