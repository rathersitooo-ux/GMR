import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_START_FLAGS_KEY,
  BATTLE_START_UNSEEN_REASONS,
  auditBattleStartUnseenFlags,
  decideBattleStartAfterUnseen,
  recordBattleStartUnseen,
} from '../browser/battle-start-unseen-flag-core.mjs';

test('unseen: 旗の鍵は既存のものと同じ', () => {
  assert.equal(BATTLE_START_FLAGS_KEY, 'gameroad.battle-start-flags.v1');
  assert.deepEqual(BATTLE_START_UNSEEN_REASONS, ['no-screen', 'no-battle-screen', 'participant-entry']);
});

test('unseen: 理由3つが旗として残る', () => {
  for (const reason of BATTLE_START_UNSEEN_REASONS) {
    const next = recordBattleStartUnseen({}, reason);
    assert.equal(next.unseen, reason);
  }
});

test('unseen: 変な理由は旗にならない', () => {
  assert.equal(recordBattleStartUnseen({}, 'bogus').unseen, null);
  assert.equal(recordBattleStartUnseen({}, '').unseen, null);
  assert.equal(recordBattleStartUnseen({ seen: true }, 'bogus').seen, true);
});

test('unseen: 旗があるときは次は「題だけ」で、そのあと旗は消す', () => {
  const decided = decideBattleStartAfterUnseen({ unseen: 'no-screen' });
  assert.equal(decided.presentation, 'title-only');
  assert.equal(decided.clearUnseenAfter, true);
  const none = decideBattleStartAfterUnseen({});
  assert.equal(none.presentation, null);
  assert.equal(none.clearUnseenAfter, false);
  const cleared = decideBattleStartAfterUnseen({ unseen: null });
  assert.equal(cleared.presentation, null);
});

test('unseen: 旗の形が正しいかを確かめる', () => {
  assert.equal(auditBattleStartUnseenFlags({}), true);
  assert.equal(auditBattleStartUnseenFlags({ unseen: null }), true);
  assert.equal(auditBattleStartUnseenFlags({ unseen: 'participant-entry' }), true);
  assert.equal(auditBattleStartUnseenFlags({ unseen: 'bogus' }), false);
});
