// 山札切れの最終手段（2026-11-10 ライカの決め）
// 対戦中に山札が尽きて補充が足りない時、不足分は普通のトランプからランダムに出る。
// 確率は普通のトランプと同じ：52枚＋ジョーカー1枚の53枚から等しく1枚ずつ出る。
// 試合開始のマナの補充には使わない（そちらは2026-08-04に却下された別の話）。

export const TRUMP_SUITS = ['SP', 'HT', 'DI', 'CL'];
export const TRUMP_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const JOKER_CARD_ID = 'JK_JOKER';

// ジョーカーの仮の効果。土台は大富豪のジョーカー（最強の切り札で、場のどの数字にも勝つ）。
// 数値と形は仮置きで、遊びながらチューニングしていく（2026-11-10 ライカの決め）。
export const JOKER_CARD = {
  id: JOKER_CARD_ID,
  display_name: 'ジョーカー',
  suit: 'JK',
  rank: 'JOKER',
  power: 14,
  ability_type: 'JokerTrump',
  ability: '切り札（仮）：バトルでは場の一番強い数字より1大きくなる。ロードでは13として扱う。',
  effect_type: 'jokerTrump',
  ability_cost: 0,
  rules_text: '切り札（仮）：バトルでは場の一番強い数字より1大きくなる。ロードでは13として扱う。土台は大富豪のジョーカー。数値は仮置きで、遊びながら直していく。',
  browser_status: 'browser_mechanics_provisional',
  runtime_status: 'playable',
  authority: 'user_spec_20261110',
};

export function trumpFallbackPool() {
  const pool = [];
  for (const suit of TRUMP_SUITS) {
    for (const rank of TRUMP_RANKS) pool.push(`${suit}_${rank}`);
  }
  pool.push(JOKER_CARD_ID);
  return pool;
}

// rng: () => [0,1) の関数。53枚から等しく1枚を出す。
export function drawFallbackCard(rng = Math.random) {
  const pool = trumpFallbackPool();
  const ix = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[ix];
}

// player: { deck: string[], hand: string[] }
// 山札から先に引き、尽きた分だけ最終手段で補う。
// 最終手段の1枚は、手札に既にある実物のカードと重ならない物にする
// （物理のカードは1枚ずつしか無い、という対戦の前提を守るため）。
// 返り値は引いたカードの一覧（id と出どころ 'deck' | 'fallback'）。
export function refillHandWithFallback(player, target = 3, rng = Math.random) {
  const drawn = [];
  const used = new Set(player.hand);
  while (player.hand.length < target) {
    if (player.deck.length) {
      const id = player.deck.shift();
      player.hand.push(id);
      used.add(id);
      drawn.push({ id, source: 'deck' });
    } else {
      let id = drawFallbackCard(rng);
      let guard = 0;
      while (used.has(id) && guard++ < 64) id = drawFallbackCard(rng);
      if (used.has(id)) {
        id = trumpFallbackPool().find((c) => !used.has(c)) ?? id;
      }
      player.hand.push(id);
      used.add(id);
      drawn.push({ id, source: 'fallback' });
    }
  }
  return drawn;
}

// ジョーカーをバトルで出した時の数字（仮）：相手の一番強い数字より1大きい。
// 相手が誰もいない時は素の数字14。
export function jokerBattleValue(opponentValues) {
  const vals = (opponentValues || []).filter((v) => Number.isFinite(v));
  if (!vals.length) return JOKER_CARD.power;
  return Math.max(...vals) + 1;
}

// ジョーカーをロードで出した時の数字（仮）：Kと同じ13として扱う。
export function jokerRoadValue() {
  return 13;
}
