import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUniqueMaxLoadAttackerPrivilege } from '../browser/battle-attacker-load-privilege-core.mjs';
import { resolveCyclicTriadByProcessingOrder } from '../browser/triad-resolver-core.mjs';

const CONFIG = Object.freeze({
  handOrder: Object.freeze(['rock', 'scissors', 'paper']),
  beats: Object.freeze({ rock: 'scissors', scissors: 'paper', paper: 'rock' }),
  noHand: 'idle',
});

function selection(playerId, loadNumber, hand) {
  return { playerId, loadNumber, hand };
}

test('unique largest Load becomes a local attacker winner and is excluded from janken', () => {
  const result = applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 1, 'rock'),
    selection('p2', 3, 'paper'),
    selection('p3', 7, 'scissors'),
    selection('p4', 9, 'rock'),
  ]);

  assert.equal(result.status, 'ATTACKER_SELECTED');
  assert.equal(result.attackerPlayerId, 'p4');
  assert.equal(result.attackerOutcome, 'LOCAL_WIN');
  assert.equal(result.presentationCue, 'ATTACKER_WIN');
  assert.equal(result.matchTerminal, false);
  assert.equal(result.attackerExcludedFromJanken, true);
  assert.deepEqual(result.jankenSelections.map((entry) => entry.playerId), ['p1', 'p2', 'p3']);
  assert.equal(result.jankenSelections.some((entry) => entry.playerId === 'p4'), false);
});

test('remaining three keep caller-authoritative ascending order and use existing FIRST_WIN_LOCK unchanged', () => {
  const privilege = applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 2, 'rock'),
    selection('p2', 4, 'scissors'),
    selection('p3', 6, 'paper'),
    selection('p4', 10, 'rock'),
  ]);
  const resolved = resolveCyclicTriadByProcessingOrder(privilege.jankenSelections, CONFIG);

  assert.deepEqual(resolved.processingOrder, ['p1', 'p2', 'p3']);
  assert.equal(resolved.processingOrder.includes('p4'), false);
  assert.equal(resolved.invalidated.includes('p4'), false);
});

test('equal numbers below the unique maximum preserve their pre-authorized caller order', () => {
  const result = applyUniqueMaxLoadAttackerPrivilege([
    selection('p2', 2, 'paper'),
    selection('p1', 2, 'rock'),
    selection('p3', 5, 'scissors'),
    selection('p4', 8, 'paper'),
  ]);

  assert.deepEqual(result.jankenSelections.map((entry) => entry.playerId), ['p2', 'p1', 'p3']);
});

test('tied maximum invents no attacker and preserves the existing four-card legacy path', () => {
  const result = applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 1, 'rock'),
    selection('p2', 4, 'paper'),
    selection('p3', 9, 'scissors'),
    selection('p4', 9, 'rock'),
  ]);

  assert.equal(result.status, 'MAX_TIE_LEGACY_FALLBACK');
  assert.equal(result.attacker, null);
  assert.equal(result.attackerOutcome, null);
  assert.equal(result.presentationCue, null);
  assert.equal(result.attackerExcludedFromJanken, false);
  assert.equal(result.matchTerminal, false);
  assert.deepEqual(result.tiedMaxPlayerIds, ['p3', 'p4']);
  assert.deepEqual(result.jankenSelections.map((entry) => entry.playerId), ['p1', 'p2', 'p3', 'p4']);
});

test('input validation refuses to invent sorting or malformed Load authority', () => {
  assert.throws(() => applyUniqueMaxLoadAttackerPrivilege([]), /exactly four/);
  assert.throws(() => applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 1, 'rock'),
    selection('p1', 2, 'paper'),
    selection('p3', 3, 'scissors'),
    selection('p4', 4, 'rock'),
  ]), /duplicate playerId/);
  assert.throws(() => applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 1, 'rock'),
    selection('p2', 5, 'paper'),
    selection('p3', 3, 'scissors'),
    selection('p4', 9, 'rock'),
  ]), /authoritative ascending/);
  assert.throws(() => applyUniqueMaxLoadAttackerPrivilege([
    selection('p1', 1, 'rock'),
    selection('p2', Number.NaN, 'paper'),
    selection('p3', 3, 'scissors'),
    selection('p4', 9, 'rock'),
  ]), /finite number/);
});
