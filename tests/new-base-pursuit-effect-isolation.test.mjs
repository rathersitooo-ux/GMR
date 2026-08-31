import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PURSUIT_MODE_FINISHER,
  resolvePursuitCard,
  resolvePursuitTriad,
  removePursuitPhysicalMana,
} from '../browser/pursuit-triad-core.mjs';

test('triad winner resolution ignores pursuit-only card, effect, and mana payload', () => {
  const selections = [
    Object.freeze({
      playerId: 'p1',
      hand: 'club',
      intrinsicSuit: 'heart',
      value: 7,
      mode: PURSUIT_MODE_FINISHER,
      battleAddend: 999,
      disposition: 'subdeck',
      physicalManaCount: 1,
      maximumMana: 1,
    }),
    Object.freeze({
      playerId: 'p2',
      hand: 'diamond',
      intrinsicSuit: 'spade',
      value: 1,
      mode: PURSUIT_MODE_FINISHER,
      battleAddend: 888,
      disposition: 'subdeck',
      physicalManaCount: 2,
      maximumMana: 2,
    }),
  ];
  const before = JSON.parse(JSON.stringify(selections));

  const resolved = resolvePursuitTriad(selections);

  assert.deepEqual(resolved, {
    participants: ['p1', 'p2'],
    nonParticipants: [],
    uniqueHands: ['club', 'diamond'],
    winningHand: 'club',
    winners: ['p1'],
  });
  assert.deepEqual(selections, before);
  assert.deepEqual(Object.keys(resolved).sort(), [
    'nonParticipants',
    'participants',
    'uniqueHands',
    'winners',
    'winningHand',
  ].sort());

  for (const forbidden of [
    'battleAddend',
    'disposition',
    'physicalManaCount',
    'maximumMana',
    'mode',
    'value',
    'intrinsicSuit',
  ]) {
    assert.equal(forbidden in resolved, false, `${forbidden} must remain outside pure triad resolution`);
  }
});

test('pursuit battle, subdeck, physical-mana, and finisher effects require explicit pursuit APIs', () => {
  const triad = resolvePursuitTriad([
    { playerId: 'p1', hand: 'club' },
    { playerId: 'p2', hand: 'diamond' },
  ]);

  assert.equal(triad.winningHand, 'club');
  assert.equal('battleAddend' in triad, false);
  assert.equal('disposition' in triad, false);
  assert.equal('physicalManaCount' in triad, false);
  assert.equal('maximumMana' in triad, false);

  assert.deepEqual(resolvePursuitCard({
    won: true,
    value: 7,
    mode: PURSUIT_MODE_FINISHER,
  }), {
    battleAddend: 14,
    disposition: 'battle',
  });

  assert.deepEqual(resolvePursuitCard({
    won: false,
    value: 7,
    mode: PURSUIT_MODE_FINISHER,
  }), {
    battleAddend: 0,
    disposition: 'subdeck',
  });

  assert.deepEqual(removePursuitPhysicalMana({
    physicalManaCount: 3,
    availableMana: 3,
  }), {
    physicalManaCount: 2,
    maximumMana: 2,
    availableMana: 2,
  });
});
