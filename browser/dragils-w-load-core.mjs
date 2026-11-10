// ドラギルス（蒼炎の白龍 ドラギルス）の核。能力の正式名称は W・ロード（読み：ダブルロード）。このゲームの看板カード。
//
// 実装の前提（2026-11-10、ライカの言葉そのまま）：
// 「ドラギルスを出したらじゃんけん用のUIが消えずに残って再度出せるだけ。
// まあ、特殊な演出を見た目としては入れてもいいけど。このゲームの看板
// カードだし」
// 仕組みとしては：出したら、じゃんけんの出番が閉じずに残り、もう一度
// じゃんけんの手を出せる。それだけのシンプルな物。特殊な演出を
// 見た目として入れるのは可（看板カードなので）。
//
// Drive側には別の仕様の文がある（食い違いは寄せずに記録に並べてある。
// hidden_files/doppel-trial-20261110/dragils-implementation-20261110.md）：
// キーワード能力メモ（2026-06-21）の rulesKey定義_W_LOAD_v0 は、
// 「出した時、手札からロードカード1枚を追加で出してよい（通常コストと
// 条件つき、失敗条件5種、連鎖停止あり）」という形で、ライカの説明より
// 重い。この核はライカの説明を前提にし、v0側の付随条件は入れていない。コストの付け方もライカの決め通り：追加で出すロードカード自体にコストは要らず、コストが付くのは能力の方だけ（2026-11-10決着。v0の「追加分は通常のコスト」とは違う物として記録に明記）。
//
// 2回目の手が出た先の処理は、2026-11-10のライカの決め一式：
// - じゃんけん手の登録はロードごとに1枚（各ロードの最初のカード）
// - じゃんけんは味方には効かない（自分の2つの手同士・味方同士は当たらない）
// - 数字の小さい順、勝った札は勝ち抜け、負けた札は手札に戻る（公開のまま）
// - あいこは何も起きない。最初の手は消費されない
// - 手とスートの対応は台帳の不変の文（グー=クラブ、チョキ=ダイヤ、パー=スペード）

export const DRAGILS_CARD_ID = 'DCG_DRAG_DRAGILS';
export const W_LOAD_RULES_KEY = 'W_LOAD';
export const W_LOAD_DISPLAY_TEXT = 'W・ロード';

const HAND_BY_SUIT = Object.freeze({
  SP: 'パー',
  CL: 'グー',
  DI: 'チョキ',
  // HT は手を持たない（台帳の不変の対応 グー=♣、チョキ=♦、パー=♠）
});

const BEATS = Object.freeze({ 'グー': 'チョキ', 'チョキ': 'パー', 'パー': 'グー' });

// カードのスートからじゃんけんの手を引く。手を持たない札は null。
export function jankenHandOf(card) {
  if (!card) return null;
  const suit = card.suit || card.suitCode || null;
  return HAND_BY_SUIT[suit] || null;
}

// その札が W・ロードの印を持つか（台帳とカードデータの登録の印）。
export function hasWLoad(card) {
  if (!card) return false;
  return card.rulesKey === W_LOAD_RULES_KEY || card.effect_type === W_LOAD_RULES_KEY;
}

// ドラギルスを出した後の、2回目の手の提出を解決する。
// 前提はライカの形：じゃんけんの出番が閉じずに残り、もう一度出せる。
// input: {
//   ownerId,       持ち主
//   hand,          持ち主の手札（ドラギルスを出した後の残り）
//   chooseCard(candidates), 複数候補から使用者に選ばせる（省略時は先頭）
// }
// 返り：{ canPlayAgain, secondCard, candidates }
// 手札にじゃんけんの手を持つ札が無ければ、2回目は出せない（それだけ）。
export function resolveDragilsSecondHand(input) {
  const { hand = [], chooseCard = null } = input || {};
  const candidates = (hand || []).filter((c) => c && jankenHandOf(c));
  if (candidates.length === 0) {
    return { canPlayAgain: false, secondCard: null, candidates: [] };
  }
  const secondCard = (typeof chooseCard === 'function' ? chooseCard([...candidates]) : candidates[0]) || candidates[0];
  return { canPlayAgain: true, secondCard, candidates };
}

// ロードごとの提出から、じゃんけん手を登録する。
// submissions: [{ playerId, roadIndex, cards: [card, ...] }]
// 各ロードの「最初の有効なじゃんけんカード」（手を持つ札のうち最初）が
// そのロードの手として登録される。手を持つ札が無いロードは登録なし。
export function registerJankenHands(submissions) {
  const hands = [];
  for (const sub of submissions || []) {
    if (!sub || !Array.isArray(sub.cards)) continue;
    const card = sub.cards.find((c) => jankenHandOf(c));
    if (!card) continue;
    hands.push(Object.freeze({
      playerId: sub.playerId,
      roadIndex: sub.roadIndex ?? 0,
      cardId: card.id ?? card.cardId ?? null,
      number: Number.isFinite(card.power) ? card.power : card.number,
      hand: jankenHandOf(card),
    }));
  }
  return hands;
}

// 勝ち抜けの連鎖を回す。
// hands: registerJankenHands の返り。
// options.sideOf: (playerId) => sideKey。同じ側同士は当たらない。
//   省略時は全員が別々の側（自分同士だけは常に同じ側として扱う）。
// 返り：{ steps, returned, survivors, champion }
export function resolveJankenChain(hands, options = {}) {
  const sideOf = typeof options.sideOf === 'function'
    ? options.sideOf
    : (playerId) => `player:${playerId}`;
  const sorted = [...(hands || [])].sort(
    (a, b) => (a.number - b.number) || String(a.cardId).localeCompare(String(b.cardId)),
  );
  const returned = [];
  const steps = [];
  const eliminated = new Set();
  let champion = null;

  const sameSide = (x, y) => x.playerId === y.playerId || sideOf(x.playerId) === sideOf(y.playerId);
  const toReturned = (h) => ({
    ...h,
    returnedToHand: true,
    visibility: 'public',
    staysPublicInHand: true,
  });

  for (const challenger of sorted) {
    if (eliminated.has(challenger)) continue;
    if (!champion) {
      champion = challenger;
      continue;
    }
    if (champion === challenger) continue;
    if (sameSide(champion, challenger)) {
      steps.push({ a: champion, b: challenger, result: 'skip-ally' });
      continue;
    }
    if (champion.hand === challenger.hand) {
      steps.push({ a: champion, b: challenger, result: 'aiko' });
      continue;
    }
    if (BEATS[champion.hand] === challenger.hand) {
      steps.push({ a: champion, b: challenger, result: 'a' });
      eliminated.add(challenger);
      returned.push(toReturned(challenger));
    } else {
      steps.push({ a: champion, b: challenger, result: 'b' });
      eliminated.add(champion);
      returned.push(toReturned(champion));
      champion = challenger;
    }
  }

  const survivors = sorted.filter((h) => !eliminated.has(h));
  return { steps, returned, survivors, champion };
}
