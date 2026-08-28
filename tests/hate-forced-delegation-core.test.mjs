import test from 'node:test';
import assert from 'node:assert/strict';
import { createHateDelegationState, applyAuthoritativeHate, restoreHateDelegationState } from '../browser/hate-forced-delegation-core.mjs';

const selection = { mode: 'normal', regulation: 'honey-hunt', deck: ['A', 'B', 'C'] };

function advance(state, hate, revision) {
  return applyAuthoritativeHate(state, { matchId: 'match-1', hate, revision });
}

test('999 does not force delegation', () => {
  const result = advance(createHateDelegationState({ matchId: 'match-1', selection }), 999, 1);
  assert.equal(result.effect, null);
  assert.equal(result.state.forcedDelegationApplied, false);
});

test('1000 forces delegation exactly once and preserves selection', () => {
  const initial = createHateDelegationState({ matchId: 'match-1', selection });
  const first = advance(initial, 1000, 1);
  assert.equal(first.effect.type, 'FORCE_DELEGATION');
  assert.equal(first.effect.eventId, 'hate1000:match-1');
  assert.deepEqual(first.effect.selection, selection);
  assert.deepEqual(first.state.selection, selection);

  const resend = advance(first.state, 1000, 1);
  assert.equal(resend.accepted, false);
  assert.equal(resend.effect, null);

  const over = advance(first.state, 1001, 2);
  assert.equal(over.accepted, true);
  assert.equal(over.effect, null);
  assert.equal(over.state.forcedDelegationApplied, true);
});

test('reconnect restore keeps exactly-once marker and selected mode regulation deck', () => {
  const fired = advance(createHateDelegationState({ matchId: 'match-1', selection }), 1000, 4);
  const restored = restoreHateDelegationState(JSON.parse(JSON.stringify(fired.state)));
  const afterReconnect = advance(restored, 1001, 5);
  assert.equal(afterReconnect.effect, null);
  assert.equal(afterReconnect.state.forcedDelegationEventId, 'hate1000:match-1');
  assert.deepEqual(afterReconnect.state.selection, selection);
});

test('stale and duplicate authoritative revisions cannot fire or mutate', () => {
  const base = advance(createHateDelegationState({ matchId: 'match-1', selection }), 999, 10).state;
  const stale = advance(base, 1000, 9);
  const duplicate = advance(base, 1000, 10);
  assert.equal(stale.accepted, false);
  assert.equal(duplicate.accepted, false);
  assert.equal(stale.effect, null);
  assert.equal(duplicate.effect, null);
  assert.equal(base.forcedDelegationApplied, false);
});

test('wrong match and invalid hate fail closed', () => {
  const state = createHateDelegationState({ matchId: 'match-1', selection });
  const wrong = applyAuthoritativeHate(state, { matchId: 'match-2', hate: 1000, revision: 1 });
  const invalid = applyAuthoritativeHate(state, { matchId: 'match-1', hate: -1, revision: 1 });
  assert.equal(wrong.accepted, false);
  assert.equal(invalid.accepted, false);
  assert.equal(wrong.effect, null);
  assert.equal(invalid.effect, null);
});
