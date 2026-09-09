import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT,
  BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA,
  BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE,
  BATTLE_THUMB_CLUSTER_VISUAL_STATE,
  projectBattleThumbClusterGeometry,
  projectBattleThumbClusterPresentation,
  resolveBattleThumbClusterViewportProfile,
} from '../browser/battle-thumb-cluster-presentation-core.mjs';

const slots = [
  { jankenHand: 'ROCK', cardId: 'card-r', selectable: true },
  { jankenHand: 'SCISSORS', cardId: 'card-s', selectable: true },
  { jankenHand: 'PAPER', cardId: 'card-p', selectable: true },
];

const compound = {
  jankenHand: 'ROCK',
  cardId: 'card-r',
  path: ['FIELD-04', 'FIELD-03', 'SHIELD-P2-L'],
  direction: 'UP_LEFT',
  roadId: 'ROAD-04-03',
  battleId: 'BATTLE-P2-L',
  opponentId: 'P2',
  shieldLane: 'L',
  shieldRef: 'P2-SHIELD-L',
};

function centerInside(rect, viewport) {
  const x = rect.left + (rect.width / 2);
  const y = rect.top + (rect.height / 2);
  return x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;
}

test('selects the current three target viewport profiles without shrinking portrait from desktop', () => {
  assert.equal(resolveBattleThumbClusterViewportProfile({ width: 1280, height: 720 }), BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.LANDSCAPE);
  assert.equal(resolveBattleThumbClusterViewportProfile({ width: 667, height: 375 }), BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.SHORT_LANDSCAPE);
  assert.equal(resolveBattleThumbClusterViewportProfile({ width: 390, height: 844 }), BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.PORTRAIT);
});

test('short-landscape geometry reuses the current bottom-right SlidePad footprint', () => {
  const result = projectBattleThumbClusterGeometry({ width: 667, height: 375 });
  assert.equal(result.profile, BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.SHORT_LANDSCAPE);
  assert.deepEqual(result.geometry.host, { width: 188, height: 146, right: 7, bottom: 7 });
  assert.deepEqual(result.geometry.handle, { width: 58, height: 58 });
  assert.deepEqual(result.geometry.slot, { width: 60, height: 80, right: 2, bottom: 2 });
  assert.deepEqual(result.geometry.offsets.ROCK, { x: -124, y: 10, rotateDeg: -16 });
  assert.deepEqual(result.geometry.offsets.SCISSORS, { x: -92, y: -40, rotateDeg: -7 });
  assert.deepEqual(result.geometry.offsets.PAPER, { x: -48, y: -62, rotateDeg: 4 });
});

test('all three slot interaction centers remain on-screen at 667x375 and 390x844', () => {
  for (const viewport of [{ width: 667, height: 375 }, { width: 390, height: 844 }]) {
    const result = projectBattleThumbClusterGeometry(viewport);
    assert.equal(result.slotRects.every((rect) => centerInside(rect, viewport)), true);
    assert.equal(result.geometry.slot.width >= 44, true);
    assert.equal(result.geometry.slot.height >= 44, true);
  }
});

test('safe-area projection only moves the cluster farther from the physical edge', () => {
  const result = projectBattleThumbClusterGeometry({
    width: 1280,
    height: 720,
    safeArea: { right: 28, bottom: 24 },
  });
  assert.equal(result.geometry.host.right, 28);
  assert.equal(result.geometry.host.bottom, 24);
});

test('stowed and open are presentation states only and preserve the three fixed hands', () => {
  const stowed = projectBattleThumbClusterPresentation({ viewport: { width: 667, height: 375 }, slots });
  assert.equal(stowed.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.STOWED);
  assert.equal(stowed.expandedVisual, false);
  assert.deepEqual(stowed.slots.map((slot) => slot.jankenHand), ['ROCK', 'SCISSORS', 'PAPER']);

  const open = projectBattleThumbClusterPresentation({ viewport: { width: 667, height: 375 }, slots, expanded: true });
  assert.equal(open.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.OPEN);
  assert.equal(open.expandedVisual, true);
});

test('focus is accepted only for a selectable fixed-hand slot', () => {
  const focused = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    expanded: true,
    focusedHand: 'SCISSORS',
  });
  assert.equal(focused.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.FOCUSED);
  assert.equal(focused.activeHand, 'SCISSORS');

  const blocked = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots: slots.map((slot) => slot.jankenHand === 'SCISSORS' ? { ...slot, selectable: false } : slot),
    expanded: true,
    focusedHand: 'SCISSORS',
  });
  assert.equal(blocked.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.OPEN);
  assert.equal(blocked.activeHand, null);
});

test('staged compound attack exposes only the caller-supplied package identity and target summary', () => {
  const staged = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    focusedHand: 'ROCK',
    expanded: true,
    compoundAttack: compound,
    compoundPhase: 'STAGED',
  });
  assert.equal(staged.schema, BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA);
  assert.equal(staged.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.STAGED);
  assert.equal(staged.activeHand, 'ROCK');
  assert.equal(staged.compound.previewVisible, true);
  assert.equal(staged.compound.opponentId, 'P2');
  assert.equal(staged.compound.shieldLane, 'L');
  assert.deepEqual(staged.compound.route.path, compound.path);
  assert.equal(staged.legalTargetRecompute, false);
  assert.equal(staged.gameStateWrite, false);
  assert.equal(staged.commitTransport, false);
});

test('compound package that does not match the current slot fails closed instead of moving the target', () => {
  const result = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    focusedHand: 'ROCK',
    expanded: true,
    compoundAttack: { ...compound, cardId: 'other-card' },
    compoundPhase: 'STAGED',
  });
  assert.equal(result.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.FOCUSED);
  assert.equal(result.compound, null);
  assert.equal(result.failClosedReason, 'PACKAGE_DOES_NOT_MATCH_CURRENT_SELECTABLE_SLOT');
});

test('invalid incomplete compound package is rejected without inventing route or target data', () => {
  const result = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    expanded: true,
    compoundAttack: { jankenHand: 'ROCK', cardId: 'card-r', opponentId: 'P2', shieldLane: 'L' },
    compoundPhase: 'STAGED',
  });
  assert.equal(result.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.OPEN);
  assert.equal(result.compound, null);
  assert.equal(result.failClosedReason, 'INVALID_COMPOUND_ATTACK_PACKAGE');
});

test('committed and resolving states lock the same package identity without showing a second precommit picker', () => {
  const committed = projectBattleThumbClusterPresentation({
    viewport: { width: 1280, height: 720 },
    slots,
    compoundAttack: compound,
    compoundPhase: 'COMMITTED',
  });
  assert.equal(committed.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.COMMITTED);
  assert.equal(committed.lockedVisual, true);
  assert.equal(committed.compound.previewVisible, false);
  assert.equal(committed.compound.cardId, 'card-r');

  const resolving = projectBattleThumbClusterPresentation({
    viewport: { width: 1280, height: 720 },
    slots,
    compoundAttack: compound,
    compoundPhase: 'RESOLVING',
  });
  assert.equal(resolving.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.RESOLVING);
  assert.equal(resolving.lockedVisual, true);
  assert.deepEqual(resolving.compound.route.path, committed.compound.route.path);
});

test('disabled state wins over focus or staged visuals', () => {
  const result = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    focusedHand: 'ROCK',
    compoundAttack: compound,
    compoundPhase: 'STAGED',
    disabled: true,
  });
  assert.equal(result.visualState, BATTLE_THUMB_CLUSTER_VISUAL_STATE.DISABLED);
  assert.equal(result.lockedVisual, true);
});

test('Reduced Motion removes large presentation movement and LowPerf removes filter-heavy pulses only', () => {
  const reduced = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    compoundAttack: compound,
    compoundPhase: 'STAGED',
    reducedMotion: true,
  });
  assert.deepEqual(reduced.motion, {
    bloomDurationMs: 0,
    acknowledgementDurationMs: 0,
    compoundPulse: false,
    depthMotion: false,
    filterEffects: false,
  });

  const lowPerf = projectBattleThumbClusterPresentation({
    viewport: { width: 667, height: 375 },
    slots,
    compoundAttack: compound,
    compoundPhase: 'STAGED',
    lowPerf: true,
  });
  assert.equal(lowPerf.motion.bloomDurationMs, 190);
  assert.equal(lowPerf.motion.acknowledgementDurationMs, 110);
  assert.equal(lowPerf.motion.depthMotion, true);
  assert.equal(lowPerf.motion.filterEffects, false);
  assert.equal(lowPerf.motion.compoundPulse, false);
});

test('presentation output is immutable and the contract explicitly owns no gameplay authority', () => {
  const result = projectBattleThumbClusterPresentation({ viewport: { width: 667, height: 375 }, slots });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.layout.geometry), true);
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.gameplayStateWrite, false);
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.legalTargetRecompute, false);
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.targetInference, false);
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.commitTransport, false);
  assert.equal(BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT.liveSlidePadMutationOwnedHere, false);
});
