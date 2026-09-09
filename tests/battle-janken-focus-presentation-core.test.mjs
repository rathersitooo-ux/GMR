import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT,
  BATTLE_JANKEN_FOCUS_SURFACE,
  beginBattleJankenCommitPresentation,
  createBattleJankenFocusPresentation,
  enterBattleJankenBoardPeek,
  enterBattleLoadFocus,
  focusBattleJankenPackage,
  invalidateBattleJankenFocusPresentation,
  returnBattleJankenFocus,
} from '../browser/battle-janken-focus-presentation-core.mjs';

function packageFor(jankenHand, index) {
  const lane = ['L', 'C', 'R'][index];
  return {
    jankenHand,
    cardId: `CARD-${jankenHand}`,
    path: [`FIELD-${index}`, `SHIELD-${lane}`],
    direction: `DIR-${index}`,
    roadId: `ROAD-${index}`,
    battleId: `BATTLE-${index}`,
    opponentId: `P${index + 2}`,
    shieldLane: lane,
    shieldRef: `P${index + 2}-SHIELD-${lane}`,
  };
}

function exactThree() {
  return [
    packageFor('ROCK', 0),
    packageFor('SCISSORS', 1),
    packageFor('PAPER', 2),
  ];
}

test('projects exactly three caller-supplied compound packages without target or route invention', () => {
  const state = createBattleJankenFocusPresentation({
    packages: exactThree(),
    generationId: 'GEN-12',
  });

  assert.equal(state.available, true);
  assert.equal(state.surface, BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS);
  assert.deepEqual(state.choices.map((choice) => choice.jankenHand), ['ROCK', 'SCISSORS', 'PAPER']);
  assert.equal(state.choices[1].preview.opponentId, 'P3');
  assert.equal(state.choices[1].preview.shieldLane, 'C');
  assert.deepEqual(state.choices[1].preview.route.path, ['FIELD-1', 'SHIELD-C']);
  assert.equal(state.targetInference, false);
  assert.equal(state.legalTargetRecompute, false);
  assert.equal(state.routeRecompute, false);
  assert.equal(state.gameStateWrite, false);
});

test('fails closed unless the authoritative choice set is exactly one ROCK, SCISSORS, and PAPER package', () => {
  const missing = createBattleJankenFocusPresentation({ packages: exactThree().slice(0, 2) });
  assert.equal(missing.available, false);
  assert.equal(missing.reason, 'EXACT_ROCK_SCISSORS_PAPER_PACKAGES_REQUIRED');
  assert.deepEqual(missing.choices, []);

  const duplicate = createBattleJankenFocusPresentation({
    packages: [packageFor('ROCK', 0), packageFor('ROCK', 1), packageFor('PAPER', 2)],
  });
  assert.equal(duplicate.available, false);
  assert.equal(duplicate.focusedPackage, null);
});

test('focus can select only one of the existing three package identities', () => {
  const initial = createBattleJankenFocusPresentation({ packages: exactThree() });
  const focused = focusBattleJankenPackage(initial, 'PAPER', { previewReady: true });

  assert.equal(focused.available, true);
  assert.equal(focused.focusedHand, 'PAPER');
  assert.equal(focused.focusedPackage.opponentId, 'P4');
  assert.equal(focused.focusedPackage.shieldLane, 'R');
  assert.equal(focused.previewReady, true);

  const invalid = focusBattleJankenPackage(initial, 'LIZARD');
  assert.equal(invalid.available, false);
  assert.equal(invalid.reason, 'FOCUS_PACKAGE_NOT_IN_AUTHORITATIVE_THREE');
});

test('board peek preserves the same focus package and returns without restaging drift', () => {
  const initial = createBattleJankenFocusPresentation({ packages: exactThree(), generationId: 'GEN-A' });
  const focused = focusBattleJankenPackage(initial, 'SCISSORS', { previewReady: true });
  const peek = enterBattleJankenBoardPeek(focused);
  const returned = returnBattleJankenFocus(peek);

  assert.equal(peek.surface, BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK);
  assert.equal(peek.boardPeek, true);
  assert.equal(peek.focusedPackage, focused.focusedPackage);
  assert.equal(peek.generationId, 'GEN-A');
  assert.equal(returned.surface, BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS);
  assert.equal(returned.focusedPackage, focused.focusedPackage);
  assert.equal(returned.previewReady, true);
});

test('load focus opens only after the existing exact visible preview is ready', () => {
  const initial = createBattleJankenFocusPresentation({ packages: exactThree() });
  const notReady = focusBattleJankenPackage(initial, 'ROCK');
  assert.equal(enterBattleLoadFocus(notReady), notReady);

  const ready = focusBattleJankenPackage(initial, 'ROCK', { previewReady: true });
  const load = enterBattleLoadFocus(ready);
  assert.equal(load.surface, BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS);
  assert.equal(load.loadFocus, true);
  assert.equal(load.focusedPreview.cardId, 'CARD-ROCK');
  assert.equal(load.focusedPreview.opponentId, 'P2');
  assert.equal(load.focusedPreview.shieldRef, 'P2-SHIELD-L');
});

test('commit presentation exposes no payload or transport and only marks the existing staged focus as committing', () => {
  const initial = createBattleJankenFocusPresentation({ packages: exactThree() });
  const ready = focusBattleJankenPackage(initial, 'PAPER', { previewReady: true });
  const load = enterBattleLoadFocus(ready);
  const committing = beginBattleJankenCommitPresentation(load);

  assert.equal(committing.surface, BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING);
  assert.equal(committing.committing, true);
  assert.equal(committing.focusedHand, 'PAPER');
  assert.equal('payload' in committing, false);
  assert.equal('commit' in committing, false);
  assert.equal(committing.commitTransport, false);
  assert.equal(committing.gameStateWrite, false);
});

test('stale or version mismatch discards old focus and package presentation fail closed', () => {
  const initial = createBattleJankenFocusPresentation({ packages: exactThree(), generationId: 'GEN-OLD' });
  const focused = focusBattleJankenPackage(initial, 'ROCK', { previewReady: true });
  const stale = invalidateBattleJankenFocusPresentation(focused, 'STALE_OR_VERSION_MISMATCH');

  assert.equal(stale.surface, BATTLE_JANKEN_FOCUS_SURFACE.UNAVAILABLE);
  assert.equal(stale.available, false);
  assert.equal(stale.focusedHand, null);
  assert.equal(stale.focusedPackage, null);
  assert.equal(stale.previewReady, false);
  assert.deepEqual(stale.choices, []);
  assert.equal(stale.generationId, 'GEN-OLD');
});

test('reduced motion and low-perf change only motion mode, not package or surface meaning', () => {
  const reduced = createBattleJankenFocusPresentation({
    packages: exactThree(),
    focusedHand: 'SCISSORS',
    previewReady: true,
    reducedMotion: true,
  });
  const lowPerf = createBattleJankenFocusPresentation({
    packages: exactThree(),
    focusedHand: 'SCISSORS',
    previewReady: true,
    lowPerf: true,
  });

  assert.equal(reduced.motionMode, 'STATIC');
  assert.equal(lowPerf.motionMode, 'STATIC');
  assert.equal(reduced.focusedPackage.opponentId, lowPerf.focusedPackage.opponentId);
  assert.equal(reduced.focusedPackage.shieldLane, lowPerf.focusedPackage.shieldLane);
  assert.equal(BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT.freeTargetPicker, false);
  assert.equal(BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT.commitTransportDelegatedToExistingLiveStack, true);
  assert.equal(BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT.mutatesProductionRuntime, false);
});
