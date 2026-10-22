import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleNewBaseLiveConsumerAdapter } from '../browser/battle-new-base-live-consumer-adapter.mjs';

const hand = Object.freeze([
  Object.freeze({ id: 'card-11', suit: 'HT' }),
  Object.freeze({ id: 'card-12', suit: 'SP' }),
  Object.freeze({ id: 'card-13', suit: 'CL' }),
]);
const authority = (turnId = 'turn-100') => ({ roundId: 'round-100', turnId, hand });
function harness({ readRoundAuthority, readAuthoritativeHand3Uint32 }) {
  return createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority,
    readAuthoritativeHand3Uint32,
    readCompoundAttackCandidate: async () => { throw new Error('not used'); },
    sendExistingBattleAction: async () => { throw new Error('not used'); },
  });
}

test('two concurrent reads of the same authoritative turn sample R/S/P once', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entropyDraws = 0;
  let authorityReads = 0;
  const adapter = harness({
    readRoundAuthority: async () => {
      authorityReads += 1;
      await blocked;
      return authority();
    },
    readAuthoritativeHand3Uint32: () => { entropyDraws += 1; return 5; },
  });
  const first = adapter.syncRoundStart();
  const second = adapter.syncRoundStart();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.strictEqual(a, b);
  assert.equal(entropyDraws, 1, 'same turn may not sample a second permutation');
  assert.equal(authorityReads, 2, 'second request still verifies the current authority');
  assert.equal(new Set(a.slots.map(s => s.cardId)).size, 3);
});

test('a newer turn is not hidden behind a concurrent in-flight old-turn read', async () => {
  let resumeFirst;
  const blocked = new Promise(resolve => { resumeFirst = resolve; });
  let reads = 0;
  let draws = 0;
  const adapter = harness({
    readRoundAuthority: async () => {
      reads += 1;
      if (reads === 1) { await blocked; return authority('turn-old'); }
      return authority('turn-new');
    },
    readAuthoritativeHand3Uint32: () => { draws += 1; return draws - 1; },
  });
  const first = adapter.syncRoundStart();
  const second = adapter.syncRoundStart();
  resumeFirst();
  const [oldSnap, newSnap] = await Promise.all([first, second]);
  assert.notStrictEqual(oldSnap, newSnap);
  assert.equal(draws, 2);
  assert.equal(adapter.status().turnId, 'turn-new');
});

test('rejected authority sample does not poison the sync queue', async () => {
  let draws = 0;
  const adapter = harness({
    readRoundAuthority: async () => authority(),
    readAuthoritativeHand3Uint32: () => (++draws === 1 ? 0x1_0000_0000 : 1),
  });
  const first = adapter.syncRoundStart();
  const second = adapter.syncRoundStart();
  await assert.rejects(first, /readUint32 must return/);
  const next = await second;
  assert.equal(next.slots.length, 3);
  assert.equal(draws, 2);
});
