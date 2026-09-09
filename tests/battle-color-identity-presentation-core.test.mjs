import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBattleColorIdentityPolicy,
  getBattleJankenPresentation,
  getBattlePlayerIdentityPresentation,
  getBattleStatePresentation,
  getBattleSuitPresentation,
  projectAuthoritativeCompoundTarget,
  selectTwoOpponentCenterPackage,
} from '../browser/battle-color-identity-presentation-core.mjs';

test('suit hue namespace stays ♠ blue / ♣ green / ♦ yellow / ♥ red', () => {
  assert.deepEqual(
    ['SPADE', 'CLUB', 'DIAMOND', 'HEART'].map((suit) => {
      const view = getBattleSuitPresentation(suit);
      return [view.symbol, view.hueRole, view.role];
    }),
    [
      ['♠', 'BLUE', '剣'],
      ['♣', 'GREEN', '斧'],
      ['♦', 'YELLOW', '槍'],
      ['♥', 'RED', '回復'],
    ],
  );
});

test('janken identity is fixed left-to-right by hand symbol rather than suit hue', () => {
  const views = getBattleJankenPresentation();
  assert.deepEqual(
    views.map(({ jankenHand, symbol, label, position }) => [jankenHand, symbol, label, position]),
    [
      ['ROCK', '✊', 'グー', 'LEFT'],
      ['SCISSORS', '✌', 'チョキ', 'CENTER'],
      ['PAPER', '✋', 'パー', 'RIGHT'],
    ],
  );
  for (const view of views) assert.equal('hueRole' in view, false);
});

test('player identity uses number, notch count and stroke pattern without owning a suit hue', () => {
  const players = [1, 2, 3, 4].map(getBattlePlayerIdentityPresentation);
  assert.deepEqual(players.map((view) => view.label), ['1P', '2P', '3P', '4P']);
  assert.deepEqual(players.map((view) => view.notchCount), [1, 2, 3, 4]);
  assert.equal(new Set(players.map((view) => view.strokePattern)).size, 4);
  assert.ok(players.every((view) => view.hueRole === null));
  assert.equal(getBattlePlayerIdentityPresentation(0), null);
  assert.equal(getBattlePlayerIdentityPresentation(5), null);
});

test('interaction state vocabulary uses structure/luminance/motion rather than traffic-light hue', () => {
  for (const state of ['IDLE', 'FOCUS', 'STAGED', 'COMMITTED', 'PUBLIC', 'RESOLVED', 'INVALIDATED', 'DISABLED']) {
    const view = getBattleStatePresentation(state);
    assert.ok(view);
    assert.equal('hueRole' in view, false);
    assert.ok(view.outlineRole);
    assert.ok(view.depthRole);
    assert.ok(view.luminanceRole);
    assert.ok(view.motionRole);
  }
  const policy = createBattleColorIdentityPolicy();
  assert.equal(policy.trafficLightStateHue, false);
  assert.equal(policy.colorOnlyIdentityAllowed, false);
});

test('compound target projection copies only caller-authoritative target facts', () => {
  const packageValue = Object.freeze({
    jankenHand: 'ROCK',
    opponentId: 'P3',
    shieldLane: 'L',
    direction: 'LEFT',
    opaqueAuthorityFact: 17,
  });
  const view = projectAuthoritativeCompoundTarget(packageValue);
  assert.equal(view.jankenHand, 'ROCK');
  assert.equal(view.opponentId, 'P3');
  assert.equal(view.shieldLane, 'L');
  assert.equal(view.route, 'LEFT');
  assert.equal(view.package, packageValue);
  assert.equal(projectAuthoritativeCompoundTarget(null), null);
});

test('2v2 center hand split selects only an explicitly supplied authoritative package', () => {
  const leftPackage = Object.freeze({ jankenHand: 'SCISSORS', opponentId: 'P2', shieldLane: 'C' });
  const rightPackage = Object.freeze({ jankenHand: 'SCISSORS', opponentId: 'P4', shieldLane: 'R' });

  const left = selectTwoOpponentCenterPackage({ direction: 'LEFT', leftPackage, rightPackage });
  const right = selectTwoOpponentCenterPackage({ direction: 'RIGHT', leftPackage, rightPackage });
  assert.equal(left.package, leftPackage);
  assert.equal(right.package, rightPackage);
  assert.equal(selectTwoOpponentCenterPackage({ direction: 'CENTER', leftPackage, rightPackage }), null);
  assert.equal(selectTwoOpponentCenterPackage({ direction: 'LEFT', leftPackage: null, rightPackage }), null);

  const policy = createBattleColorIdentityPolicy();
  assert.equal(policy.targetRandomizationAllowed, false);
  assert.equal(policy.presentationLegalityRecalculationAllowed, false);
});
