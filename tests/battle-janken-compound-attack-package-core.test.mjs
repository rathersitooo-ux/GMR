import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT,
  BattleJankenCompoundAttackPackageError,
  StaleBattleJankenCompoundAttackPackageError,
  clearBattleJankenCompoundAttackStage,
  createBattleJankenCompoundAttackPackage,
  prepareBattleJankenCompoundAttackCommit,
  projectBattleJankenCompoundAttackPreview,
  sameBattleJankenCompoundAttackPackage,
  stageBattleJankenCompoundAttack,
} from '../browser/battle-janken-compound-attack-package-core.mjs';

function candidate(overrides = {}) {
  return {
    jankenHand: 'ROCK',
    cardId: 'card-17',
    path: ['seat-me', { node: 'road-3', step: 2 }, 'target-edge'],
    direction: 'UP_RIGHT',
    roadId: 'road-3',
    battleId: 'battle-42',
    opponentId: 'player-b',
    shieldLane: 'lane-2',
    shieldRef: 'shield-b-2',
    ...overrides,
  };
}

test('preserves one immutable authority-supplied card/route/opponent/Shield package', () => {
  const input = candidate();
  const pkg = createBattleJankenCompoundAttackPackage(input);

  assert.equal(pkg.jankenHand, 'ROCK');
  assert.equal(pkg.cardId, 'card-17');
  assert.deepEqual(pkg.path, input.path);
  assert.equal(pkg.opponentId, 'player-b');
  assert.equal(pkg.shieldLane, 'lane-2');
  assert.equal(pkg.shieldRef, 'shield-b-2');
  assert.ok(Object.isFrozen(pkg));
  assert.ok(Object.isFrozen(pkg.path));
  assert.ok(Object.isFrozen(pkg.path[1]));

  input.path[1].node = 'mutated-after-stage';
  assert.equal(pkg.path[1].node, 'road-3');
});

test('requires all atomic fields without inventing target or route', () => {
  for (const field of ['jankenHand', 'cardId', 'path', 'opponentId', 'shieldLane']) {
    const input = candidate();
    delete input[field];
    assert.throws(
      () => createBattleJankenCompoundAttackPackage(input),
      BattleJankenCompoundAttackPackageError,
      field,
    );
  }

  assert.throws(
    () => createBattleJankenCompoundAttackPackage(candidate({ jankenHand: 'LIZARD' })),
    (error) => error.code === 'INVALID_JANKEN_HAND',
  );
  assert.throws(
    () => createBattleJankenCompoundAttackPackage(candidate({ path: [] })),
    (error) => error.code === 'INVALID_PATH',
  );
});

test('preview is only a projection of the exact staged package', () => {
  const pkg = createBattleJankenCompoundAttackPackage(candidate());
  const preview = projectBattleJankenCompoundAttackPreview(pkg);

  assert.deepEqual(preview.route, {
    path: pkg.path,
    direction: pkg.direction,
    roadId: pkg.roadId,
    battleId: pkg.battleId,
  });
  assert.equal(preview.opponentId, pkg.opponentId);
  assert.equal(preview.shieldLane, pkg.shieldLane);
  assert.equal(preview.shieldRef, pkg.shieldRef);
  assert.ok(Object.isFrozen(preview));
  assert.ok(Object.isFrozen(preview.route));
});

test('stage and one-operation clear treat the whole package as one draft', () => {
  const stage = stageBattleJankenCompoundAttack(candidate());
  const cleared = clearBattleJankenCompoundAttackStage(stage);

  assert.equal(stage.status, 'STAGED');
  assert.deepEqual(stage.preview, projectBattleJankenCompoundAttackPreview(stage.package));
  assert.deepEqual(cleared.clearedFields, ['package', 'preview']);
  assert.equal(cleared.next, null);
  assert.equal(cleared.authoritativeRollback, false);
  assert.equal(cleared.gameStateWrite, false);
});

test('commit preparation returns the staged package unchanged after fresh authority revalidation', () => {
  const stage = stageBattleJankenCompoundAttack(candidate());
  const fresh = candidate({
    path: ['seat-me', { step: 2, node: 'road-3' }, 'target-edge'],
  });
  const commit = prepareBattleJankenCompoundAttackCommit(stage, fresh);

  assert.strictEqual(commit.payload, stage.package);
  assert.equal(commit.callerMustSendPayloadOnce, true);
  assert.equal(commit.transportPerformed, false);
  assert.equal(commit.gameStateWrite, false);
});

test('fresh authority mismatch rejects the entire stale package instead of repairing one field', () => {
  const stage = stageBattleJankenCompoundAttack(candidate());
  const variants = [
    { cardId: 'card-18' },
    { jankenHand: 'PAPER' },
    { path: ['seat-me', 'other-road', 'target-edge'] },
    { opponentId: 'player-c' },
    { shieldLane: 'lane-3' },
    { shieldRef: 'shield-b-3' },
  ];

  for (const overrides of variants) {
    assert.throws(
      () => prepareBattleJankenCompoundAttackCommit(stage, candidate(overrides)),
      StaleBattleJankenCompoundAttackPackageError,
      JSON.stringify(overrides),
    );
  }
});

test('package equality is structural and does not depend on object key order', () => {
  const left = candidate();
  const right = candidate({
    path: ['seat-me', { step: 2, node: 'road-3' }, 'target-edge'],
  });
  assert.equal(sameBattleJankenCompoundAttackPackage(left, right), true);
  assert.equal(sameBattleJankenCompoundAttackPackage(left, candidate({ shieldLane: 'lane-9' })), false);
});

test('rejects cyclic or executable authority values rather than hiding them in the package', () => {
  const cyclic = { node: 'road-3' };
  cyclic.self = cyclic;
  assert.throws(
    () => createBattleJankenCompoundAttackPackage(candidate({ path: [cyclic] })),
    (error) => error.code === 'INVALID_AUTHORITY_VALUE',
  );
  assert.throws(
    () => createBattleJankenCompoundAttackPackage(candidate({ path: [() => 'target'] })),
    (error) => error.code === 'INVALID_AUTHORITY_VALUE',
  );
});

test('contract explicitly forbids presentation-side target, legality, mapping, and game-state authority', () => {
  assert.deepEqual(
    {
      computesTarget: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.computesTarget,
      computesLegality: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.computesLegality,
      computesMapping: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.computesMapping,
      globalFixedMapping: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.globalFixedMapping,
      randomTargeting: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.randomTargeting,
      gameStateWrite: BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT.gameStateWrite,
    },
    {
      computesTarget: false,
      computesLegality: false,
      computesMapping: false,
      globalFixedMapping: false,
      randomTargeting: false,
      gameStateWrite: false,
    },
  );
});
