// ドッペルゲンガー試し版の測る道具（カードだけのボット対戦、2026-11-10）。
// 実際の対戦の流れではなく、4人が毎巡ロード札とバトル札を出す所だけを
// 再現して、形ごとの違いを同じ土俵で数える。試合の長さは対戦本体でないと
// 測れないので、ここでは扱わない（比べのメモにその旨を書く）。

import { evaluateDoppelTrial, fieldTotalsAfter, winnerOf } from './doppel-trial-core.mjs';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMED_POOL = [
  ['炎の剣士', 7], ['氷の女王', 9], ['風の旅人', 5], ['雷の番人', 8],
  ['森の番人', 4], ['海の歌い手', 6], ['星の読み手', 10], ['影の踊り子', 3],
  ['鉄の騎士', 8], ['花の精', 2], ['月の狩人', 9], ['砂の商人', 5],
  ['雲の画家', 6], ['霧の案内', 4], ['焔の料理人', 7], ['雪の郵便屋', 3],
  ['虹の橋守', 11], ['泉の番人', 6], ['崖の番人', 8], ['灯の番人', 2],
  ['歌う時計', 10], ['眠りの番人', 1], ['笑う門番', 5], ['静かな番人', 12],
];

// 1人のデッキ40枚：トランプ（数字1〜13）から26枚＋名前つきから14枚。
// 名前つきは人ごとに同じ池から取るので、違う人の間で同名が場に並ぶ。
function buildDeck(rng) {
  const trumps = [];
  for (const suit of ['SP', 'HT', 'DI', 'CL']) {
    for (let n = 1; n <= 13; n++) trumps.push({ cardId: `${suit}_${n}`, name: `${suit}_${n}`, number: n });
  }
  shuffle(trumps, rng);
  const named = NAMED_POOL.map(([name, number]) => ({ cardId: `N_${name}`, name, number }));
  shuffle(named, rng);
  return [...trumps.slice(0, 26), ...named.slice(0, 14)];
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const PLAYER_IDS = ['P1', 'P2', 'P3', 'P4'];
const ROUNDS_PER_MATCH = 20;

// 1試合ぶんを全形で測る。cardsPerRound は1人あたり毎巡出す枚数
// （2＝ロード札＋バトル札、1＝バトル札だけを対象にした当て方）。
export function measureMatch(seed, cardsPerRound = 2) {
  const rng = mulberry32(seed);
  const decks = PLAYER_IDS.map(() => buildDeck(rng));
  const stats = {
    rounds: 0,
    baseline: { winnerChanges: 0 },
  };
  for (const form of ['normal', 'super', 'unified']) {
    stats[form] = { triggeredRounds: 0, returned: 0, destroyed: 0, winnerChangedRounds: 0 };
  }
  stats.unifiedOrderDiffRounds = 0;

  for (let round = 0; round < ROUNDS_PER_MATCH; round++) {
    const field = [];
    decks.forEach((deck, i) => {
      for (let k = 0; k < cardsPerRound; k++) {
        const c = deck[round * 2 + k];
        if (c) field.push({ playerId: PLAYER_IDS[i], ...c });
      }
    });
    if (!field.length) break;
    stats.rounds++;
    const baseTotals = {};
    for (const c of field) baseTotals[c.playerId] = (baseTotals[c.playerId] || 0) + c.number;
    const baseWinner = winnerOf(baseTotals);

    for (const form of ['normal', 'super', 'unified']) {
      const r = evaluateDoppelTrial(field, { form, order: 'nameFirst' });
      const s = stats[form];
      if (r.triggered) s.triggeredRounds++;
      s.returned += r.counts.returned;
      s.destroyed += r.counts.destroyed;
      const w = winnerOf(fieldTotalsAfter(field, r));
      if (w !== baseWinner) s.winnerChangedRounds++;
    }
    const a = evaluateDoppelTrial(field, { form: 'unified', order: 'nameFirst' });
    const b = evaluateDoppelTrial(field, { form: 'unified', order: 'numberFirst' });
    const wa = winnerOf(fieldTotalsAfter(field, a));
    const wb = winnerOf(fieldTotalsAfter(field, b));
    if (wa !== wb || a.counts.returned !== b.counts.returned || a.counts.destroyed !== b.counts.destroyed) {
      stats.unifiedOrderDiffRounds++;
    }
  }
  return stats;
}

export function measureMatches(matchCount = 50, seedStart = 1, cardsPerRound = 2) {
  const total = { matches: matchCount, rounds: 0, cardsPerRound };
  for (const form of ['normal', 'super', 'unified']) {
    total[form] = { triggeredRounds: 0, returned: 0, destroyed: 0, winnerChangedRounds: 0 };
  }
  total.unifiedOrderDiffRounds = 0;
  for (let i = 0; i < matchCount; i++) {
    const s = measureMatch(seedStart + i, cardsPerRound);
    total.rounds += s.rounds;
    for (const form of ['normal', 'super', 'unified']) {
      total[form].triggeredRounds += s[form].triggeredRounds;
      total[form].returned += s[form].returned;
      total[form].destroyed += s[form].destroyed;
      total[form].winnerChangedRounds += s[form].winnerChangedRounds;
    }
    total.unifiedOrderDiffRounds += s.unifiedOrderDiffRounds;
  }
  return total;
}
