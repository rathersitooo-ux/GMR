// season-store の検査：古い記録の移行・月の切り替え・結果の番号。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeasonResultKey,
  cleanSeasonState,
  createSeasonStore,
  ensureCurrentSeasonMonth,
} from '../browser/season-store.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

describe('season-store', () => {
  it('古い記録（カタログと投票だけ）も読めて、ない所は初期値で埋まる', () => {
    const cleaned = cleanSeasonState({ catalogPoints: 250, claimedFree: [1, 2], festivalVotes: { 2: 1 }, grantedResultKeys: ['k1'] }, { month: 2 });
    assert.equal(cleaned.catalogPoints, 250);
    assert.deepEqual(cleaned.claimedFree, [1, 2]);
    assert.deepEqual(cleaned.festivalVotes, { 2: 1 });
    assert.equal(cleaned.exchangeTokens, 0);
    assert.equal(cleaned.mannyEarned, 0);
    assert.deepEqual(cleaned.missions.counts, { battles: 0, wins: 0, grow: 0, watch: 0, deck: 0, partner: 0 });
    assert.equal(cleaned.festival.month, 2);
    assert.deepEqual(cleaned.festival.contribution.soloBattles, [0, 0, 0]);
    assert.deepEqual(cleaned.claimBox.grants, []);
  });

  it('月が変わるとお題・お祭り・ドロップがその月へ入れ替わり、マニーの台帳は残る', () => {
    const store = createSeasonStore(memoryStorage());
    const first = store.save({
      catalogPoints: 100,
      claimedFree: [1],
      festivalVotes: { 2: 0 },
      mannyEarned: 50,
      mannyLedger: [{ id: 'mission-battle-3-02', amount: 50, source: 'weekly-mission' }],
      missions: { weekKey: '02', counts: { battles: 3, wins: 1, grow: 0, watch: 0, deck: 0, partner: 0 }, done: ['battle-3'], allDoneBonusClaimed: false },
      festival: { month: 2, vote: 0, contribution: { soloBattles: [2, 0, 0] } },
    }, 2);
    assert.equal(first.missions.counts.battles, 3);
    const next = ensureCurrentSeasonMonth(store.load(3), 3);
    assert.equal(next.missions.weekKey, '03');
    assert.equal(next.missions.counts.battles, 0);
    assert.deepEqual(next.missions.done, []);
    assert.equal(next.festival.month, 3);
    assert.deepEqual(next.festival.contribution.soloBattles, [0, 0, 0]);
    assert.equal(next.mannyEarned, 50);
    assert.equal(next.mannyLedger.length, 1);
    assert.equal(next.catalogPoints, 100);
  });

  it('同じ月なら入れ替わらない', () => {
    const state = cleanSeasonState({
      missions: { weekKey: '02', counts: { battles: 2, wins: 0, grow: 0, watch: 0, deck: 0, partner: 0 }, done: [] },
    }, { month: 2 });
    const next = ensureCurrentSeasonMonth(state, 2);
    assert.equal(next.missions.counts.battles, 2);
  });

  it('結果の番号は、日付と結果の文が同じなら同じになる', () => {
    const a = buildSeasonResultKey({ grade: '1位', headline: '対戦結果', rounds: '3巡', points: '+30', month: 2, day: 5 });
    const b = buildSeasonResultKey({ grade: '1位', headline: '対戦結果', rounds: '3巡', points: '+30', month: 2, day: 5 });
    const c = buildSeasonResultKey({ grade: '1位', headline: '対戦結果', rounds: '4巡', points: '+30', month: 2, day: 5 });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});
