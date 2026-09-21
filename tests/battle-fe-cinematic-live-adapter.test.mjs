import assert from 'node:assert/strict';
import test from 'node:test';
import { projectBattleFeDuelState } from './battle-fe-cinematic-live-adapter.mjs';

function snapshot(overrides = {}) {
  return {
    screen: 'battle',
    phase: 'resolve',
    mode: '2p',
    players: [
      { id: 'P1', name: 'あなた', character: 'partner.naki', team: null },
      { id: 'P2', name: 'サースナー', character: 'partner.saasuna', team: null }
    ],
    presentation: {
      stage: 'focus',
      round: 2,
      mode: '2p',
      attackerId: 'P1',
      defenderId: 'P2',
      lane: 'C',
      shield: 'R',
      players: []
    },
    ...overrides
  };
}

test('projects the accepted attacker and defender without recalculation', () => {
  const view = projectBattleFeDuelState(snapshot({
    presentation: {
      ...snapshot().presentation,
      stage: 'winner',
      winnerIds: ['P2'],
      players: [
        { id: 'P1', name: 'あなた', score: 4, winner: false, cards: [{ label: 'Iron', value: 4 }] },
        { id: 'P2', name: 'サースナー', score: 7, winner: true, cards: [{ label: 'Frost', value: 7 }] }
      ]
    }
  }));

  assert.equal(view.active, true);
  assert.equal(view.sourceId, 'P1');
  assert.equal(view.targetId, 'P2');
  assert.equal(view.left.characterId, 'partner.naki');
  assert.equal(view.right.characterId, 'partner.saasuna');
  assert.equal(view.left.score, 4);
  assert.equal(view.right.score, 7);
  assert.deepEqual(view.winnerIds, ['P2']);
  assert.equal(view.targetCalculation, false);
  assert.equal(view.winnerCalculation, false);
  assert.equal(view.gameStateWrite, false);
});

test('supports four players while preserving the exact accepted pair', () => {
  const view = projectBattleFeDuelState(snapshot({
    mode: '4p',
    players: [
      { id: 'P1', name: 'P1', character: 'partner.naki' },
      { id: 'P2', name: 'P2', character: 'partner.mato' },
      { id: 'P3', name: 'P3', character: 'partner.saasuna' },
      { id: 'P4', name: 'P4', character: 'partner.naki' }
    ],
    presentation: {
      ...snapshot().presentation,
      stage: 'compare',
      attackerId: 'P4',
      defenderId: 'P2',
      players: []
    }
  }));

  assert.equal(view.active, true);
  assert.equal(view.sourceId, 'P4');
  assert.equal(view.targetId, 'P2');
  assert.equal(view.publicPlayerCount, 4);
});

test('fails closed outside the live resolve stages', () => {
  for (const overrides of [
    { screen: 'home' },
    { phase: 'plan' },
    { presentation: null },
    { presentation: { ...snapshot().presentation, stage: 'settle' } },
    { presentation: { ...snapshot().presentation, attackerId: 'P9' } }
  ]) {
    const view = projectBattleFeDuelState(snapshot(overrides));
    assert.equal(view.active, false);
  }
});
