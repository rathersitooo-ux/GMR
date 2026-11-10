// 山札切れの最終手段の live 橋（2026-11-10 1440回・4番目）
//
// GAMEROAD.html の refill(p)（戦闘の決着のあと、m.players.forEach(refill) で
// 手札を3枚まで補充する所）のための、状態を書かない写し。
// 決めは deck-fallback-core.mjs（2026-11-10 ライカの決め：山札が尽きた分は
// 普通のトランプ52枚＋ジョーカー1枚の53枚から等しく1枚ずつ出す）。
// この橋は決めを持たない。山札から先に引き、足りない分だけ最終手段で補い、
// 呼ぶ側がそのまま手札・山札へ入れられる次の配列と、記録への文を返すだけ。
// 乱数の出どころ・ゲームの状態の書き込み・ジョーカーの裁定は持たない。
// ジョーカーが出た時は JOKER_CARD と仮の数字（ロード13・バトルは素の14）を
// 一緒に返し、バトルでの「相手の一番強い数字より1大きい」は呼ぶ側が
// jokerBattleValue で決める。

import {
  JOKER_CARD,
  JOKER_CARD_ID,
  drawFallbackCard,
  jokerRoadValue,
  trumpFallbackPool,
} from './deck-fallback-core.mjs';

// 最終手段の1枚は、手札に既にある実物のカードと重ならない物にする。
// 物理のカードは1枚ずつしか無い、という対戦の前提（巡の開始の
// じゃんけん割り当てが「手札の実物のカードは全部違うこと」を要求する）
// を守るため。乱数が同じ物ばかり出す時は、山の先頭から空きを探す。
function drawFallbackAvoiding(rng, used) {
  for (let i = 0; i < 64; i++) {
    const id = drawFallbackCard(rng);
    if (!used.has(id)) return id;
  }
  for (const id of trumpFallbackPool()) {
    if (!used.has(id)) return id;
  }
  return drawFallbackCard(rng);
}

export const DECK_FALLBACK_LIVE_BRIDGE_SCHEMA = 'gameroad.deck-fallback-live-bridge.v1';

// ゲームの補充の目標枚数。GAMEROAD.html の refill(p) と同じ 3。
export const HAND_REFILL_TARGET = 3;

function assertCardArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name}_ARRAY_REQUIRED`);
}

function assertTarget(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('HAND_REFILL_TARGET_INVALID');
  }
}

/**
 * 手札の補充を写し出す。入力の配列は変えない。
 *
 * 返す物：
 * - hand / deck：呼ぶ側がそのまま入れられる次の手札・山札
 * - drawn：引いたカードの一覧（id と出どころ 'deck' | 'fallback'）
 * - status：'REFILLED'（山札だけで足りた）/ 'REFILLED_WITH_FALLBACK'（最終手段を使った）
 *   / 'NO_DRAW_NEEDED'（手札が目標以上で何も引かない）
 * - fallbackCount / jokerDrawn / joker：最終手段の回数と、ジョーカーが出た時の仮の数字
 * - logLines：記録へそのまま出せる文
 * - callerMustCommitDeckUpdate：呼ぶ側が hand と deck を入れるかどうか
 * - gameplayStateWrite：常に false（この橋はゲームの状態を書かない）
 */
export function projectHandRefillWithFallback({
  deck,
  hand,
  target = HAND_REFILL_TARGET,
  rng = Math.random,
} = {}) {
  assertCardArray(deck, 'DECK');
  assertCardArray(hand, 'HAND');
  assertTarget(target);
  if (typeof rng !== 'function') throw new TypeError('FALLBACK_RNG_FUNCTION_REQUIRED');

  const nextDeck = [...deck];
  const nextHand = [...hand];
  const drawn = [];
  const logLines = [];
  const used = new Set(nextHand);
  let jokerDrawn = false;

  while (nextHand.length < target) {
    if (nextDeck.length > 0) {
      const id = nextDeck.shift();
      nextHand.push(id);
      used.add(id);
      drawn.push(Object.freeze({ id, source: 'deck' }));
      logLines.push(`山札から ${id} を引いた。`);
    } else {
      const id = drawFallbackAvoiding(rng, used);
      nextHand.push(id);
      used.add(id);
      drawn.push(Object.freeze({ id, source: 'fallback' }));
      if (id === JOKER_CARD_ID) {
        jokerDrawn = true;
        logLines.push('山札が尽きたため、最終手段でジョーカーを引いた。');
      } else {
        logLines.push(`山札が尽きたため、最終手段で ${id} を引いた。`);
      }
    }
  }

  const status = drawn.length === 0
    ? 'NO_DRAW_NEEDED'
    : (drawn.some((d) => d.source === 'fallback') ? 'REFILLED_WITH_FALLBACK' : 'REFILLED');

  return Object.freeze({
    schema: DECK_FALLBACK_LIVE_BRIDGE_SCHEMA,
    status,
    hand: Object.freeze(nextHand),
    deck: Object.freeze(nextDeck),
    drawn: Object.freeze(drawn),
    fallbackCount: drawn.filter((d) => d.source === 'fallback').length,
    jokerDrawn,
    joker: jokerDrawn
      ? Object.freeze({
          card: JOKER_CARD,
          roadValue: jokerRoadValue(),
          battleBaseValue: JOKER_CARD.power,
        })
      : null,
    logLines: Object.freeze(logLines),
    callerMustCommitDeckUpdate: drawn.length > 0,
    gameplayStateWrite: false,
  });
}

export const DECK_FALLBACK_LIVE_BRIDGE_CONTRACT = Object.freeze({
  schema: DECK_FALLBACK_LIVE_BRIDGE_SCHEMA,
  authority: 'DECK_FALLBACK_CORE',
  decision: '2026-11-10 ライカの決め（山札切れの最終手段：普通のトランプ53枚から等しく出す）',
  handRefillTarget: HAND_REFILL_TARGET,
  refillCallSite: 'GAMEROAD.html refill(p) / m.players.forEach(refill)（戦闘の決着のあと）',
  drawOrder: 'DECK_FIRST_THEN_FALLBACK',
  fallbackPool: 'STANDARD_52_PLUS_JOKER_53',
  callerMustCommitDeckUpdate: true,
  gameplayStateWrite: false,
  rngAuthority: 'CALLER',
  jokerSemantics: 'PROVISIONAL_IN_DECK_FALLBACK_CORE',
});
