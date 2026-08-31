import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NEW_BASE_HIDDEN_HAND_RUNTIME,
  createNewBaseHiddenHandRuntime,
  readNewBaseHiddenHandCardIds,
} from '../browser/new-base-hidden-hand-runtime-core.mjs';

function matchStartSnapshot(hiddenHandCardIds) {
  return {
    schema: 'gameroad.browser.match-start-snapshot.v1',
    deck: {
      main: ['MAIN-A'],
      ex: ['EX-A'],
      hiddenHandCardIds,
      ruleId: 'RULE-A',
      ruleRevision: 1,
    },
    setup: { mode: '2v2', content: 'new_base' },
  };
}

test('projects registered hidden-hand card identities from match-start snapshot only', () => {
  const source = matchStartSnapshot(['CARD-HIDDEN-A', 'CARD-HIDDEN-B']);
  const runtime = createNewBaseHiddenHandRuntime(source);
  assert.equal(runtime.schema, NEW_BASE_HIDDEN_HAND_RUNTIME.schema);
  assert.equal(runtime.source, 'match-start-snapshot');
  assert.deepEqual(readNewBaseHiddenHandCardIds(runtime), ['CARD-HIDDEN-A', 'CARD-HIDDEN-B']);
  assert.ok(Object.isFrozen(runtime));
  assert.ok(Object.isFrozen(runtime.registeredCardIds));
});

test('runtime projection is detached from later source mutation', () => {
  const source = matchStartSnapshot(['CARD-HIDDEN-A']);
  const runtime = createNewBaseHiddenHandRuntime(source);
  source.deck.hiddenHandCardIds[0] = 'MUTATED';
  source.deck.hiddenHandCardIds.push('ADDED-LATER');
  assert.deepEqual(readNewBaseHiddenHandCardIds(runtime), ['CARD-HIDDEN-A']);
});

test('requires an explicit structurally valid hidden-hand registration payload', () => {
  assert.throws(() => createNewBaseHiddenHandRuntime(null), /HIDDEN_HAND_MATCH_START_SNAPSHOT_REQUIRED/);
  assert.throws(() => createNewBaseHiddenHandRuntime({}), /HIDDEN_HAND_MATCH_START_DECK_REQUIRED/);
  assert.throws(() => createNewBaseHiddenHandRuntime({ deck: {} }), /HIDDEN_HAND_REGISTRATION_MISSING/);
  assert.throws(() => createNewBaseHiddenHandRuntime({ deck: { hiddenHandCardIds: 'CARD-A' } }), /HIDDEN_HAND_REGISTRATION_INVALID/);
  assert.throws(() => createNewBaseHiddenHandRuntime({ deck: { hiddenHandCardIds: [''] } }), /HIDDEN_HAND_CARD_ID_INVALID/);
});

test('does not invent a hidden-hand cardinality ruling', () => {
  assert.deepEqual(readNewBaseHiddenHandCardIds(createNewBaseHiddenHandRuntime(matchStartSnapshot([]))), []);
  assert.deepEqual(readNewBaseHiddenHandCardIds(createNewBaseHiddenHandRuntime(matchStartSnapshot(['A', 'B', 'C']))), ['A', 'B', 'C']);
});

test('runtime surface contains identity only and no invented gameplay semantics', () => {
  const runtime = createNewBaseHiddenHandRuntime(matchStartSnapshot(['CARD-HIDDEN-A']));
  assert.deepEqual(Object.keys(runtime).sort(), ['registeredCardIds', 'schema', 'source']);
  const forbidden = ['effect','uses','remainingUses','trigger','winsAgainst','specialOutcome','replacement','suit','jankenHand','battleAddend','subdeck','physicalMana','maxMana','finisherMultiplier'];
  for (const key of forbidden) assert.equal(key in runtime, false, key);
});

test('module has no Pursuit or triad dependency and no activation API', () => {
  const source = readFileSync(new URL('../browser/new-base-hidden-hand-runtime-core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"].*pursuit/i);
  assert.doesNotMatch(source, /from\s+['"].*triad/i);
  assert.doesNotMatch(source, /export\s+function\s+(?:activate|use|resolve)/i);
});
