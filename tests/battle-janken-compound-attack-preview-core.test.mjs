import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT,
  auditBattleJankenCompoundAttackPreview,
  projectBattleJankenCompoundAttackPreview,
} from '../browser/battle-janken-compound-attack-preview-core.mjs';

const PACKAGE = {
  source: 'current_public_authoritative_board_legal_target_state',
  visualIntent: 'precommit_exact_compound_attack_preview',
  gameplayMutationClaimed: false,
  packageId: 'preview-p1-rock-r3',
  authorityRevision: 'battle-state-77',
  cardId: 'card-a',
  jankenHand: 'ROCK',
  path: ['road-p1-4', 'junction-2', 'shield-p3-r'],
  direction: 'upper-right',
  routeId: 'route-p1-p3-r',
  opponentId: 'p3',
  shieldLane: 'R',
  shieldRef: 'shield-p3-r',
  destinationKey: 'p3:R',
};

test('projects exact card + hand + accepted route + opponent + Shield without calculating any of them', () => {
  const result = projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: PACKAGE });
  assert.deepEqual(result.sourceCard, { cardId: 'card-a', jankenHand: 'ROCK' });
  assert.deepEqual(result.acceptedRoute, { path: PACKAGE.path, direction: 'upper-right', routeId: 'route-p1-p3-r' });
  assert.deepEqual(result.destination, { opponentId: 'p3', shieldLane: 'R', shieldRef: 'shield-p3-r', destinationKey: 'p3:R' });
  assert.deepEqual(result.stages.map(stage => stage.kind), ['source_choice', 'accepted_route', 'opponent', 'shield_destination']);
  assert.equal(result.legalityCalculation, false);
  assert.equal(result.targetCalculation, false);
  assert.equal(result.targetMappingCalculation, false);
  assert.equal(result.routeCalculation, false);
  assert.equal(result.randomSelection, false);
  assert.equal(result.secretStateRead, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.commitExecution, false);
  assert.equal(auditBattleJankenCompoundAttackPreview(result).ok, true);
});

test('preserves caller-supplied route/path order instead of searching or repairing geometry', () => {
  const result = projectBattleJankenCompoundAttackPreview({
    compoundAttackPackage: { ...PACKAGE, path: ['node-z', 'node-a', { id: 'node-q', edge: 'diagonal' }] },
  });
  assert.deepEqual(result.acceptedRoute.path, ['node-z', 'node-a', { id: 'node-q', edge: 'diagonal' }]);
  assert.equal(result.acceptedRoute.direction, 'upper-right');
});

test('fails closed when the exact authoritative destination or path is incomplete', () => {
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, destinationKey: 'p2:R' } }), /DESTINATION_KEY_MISMATCH/);
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, shieldLane: 'X', destinationKey: 'p3:X' } }), /SHIELD_LANE_INVALID/);
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, path: [] } }), /PATH_REQUIRED/);
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, direction: '' } }), /DIRECTION_REQUIRED/);
});

test('rejects inputs not explicitly sourced from current public authoritative board/legal-target state', () => {
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, source: 'presentation_guess' } }), /SOURCE_NOT_AUTHORITATIVE/);
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, visualIntent: 'commit_attack' } }), /VISUAL_INTENT_INVALID/);
  assert.throws(() => projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: { ...PACKAGE, gameplayMutationClaimed: true } }), /GAMEPLAY_MUTATION_FORBIDDEN/);
});

test('does not expose a second target picker, legal-target list, random map, or gameplay-effect fields', () => {
  const result = projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: PACKAGE });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /legalTargets|targetCandidates|randomTarget|damage|winner|effectResult|postCommitTarget/i);
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.postCommitTargetPicker, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.liveMountOwnedHere, false);
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.targetCoverageProofOwnedHere, false);
});

test('reduced motion and low performance keep exact route + target meaning with static projection', () => {
  for (const flags of [{ reducedMotion: true }, { lowPerf: true }]) {
    const result = projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: PACKAGE, ...flags });
    assert.equal(result.motion.mode, 'static_exact_preview');
    assert.equal(result.motion.animateAcceptedPath, false);
    assert.equal(result.motion.destinationPulse, false);
    assert.equal(result.motion.preserveRouteAndTargetMeaning, true);
    assert.deepEqual(result.acceptedRoute.path, PACKAGE.path);
    assert.equal(result.destination.destinationKey, 'p3:R');
  }
});

test('projection and contract are immutable presentation-only values', () => {
  const result = projectBattleJankenCompoundAttackPreview({ compoundAttackPackage: PACKAGE });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.acceptedRoute), true);
  assert.equal(Object.isFrozen(result.acceptedRoute.path), true);
  assert.equal(Object.isFrozen(result.destination), true);
  assert.equal(Object.isFrozen(result.stages), true);
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.requiredSource, 'current_public_authoritative_board_legal_target_state');
  assert.equal(BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT.gameplayWrite, false);
});
