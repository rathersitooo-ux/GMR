// GAMEROAD 36番・マナの回復（手札を切ってマナを戻す）— 写しへのつなぎ。
// 直し案（36番）の純粋な計算部分を、写しの仕様に合わせて置いたもの。
// 仮置き：1枚で1マナ、1ターンに1枚まで、上限10。切ったカードは門の7枚に数えない。
// 決め待ち：切れる色。ALLOWED_COLORS だけ変えればよい（仮置きは ['HEART']）。
// 写しの色はスート4つ（SPADE・CLUB・DIAMOND・HEART）。カードは `suit` を持つ（`color` はない）。
// 案A「ハートだけ」はスート HEART（♥・回復）のこと。
// ライカの決まり（2026-11-08）：「マナが全部戻るごほうび」はなくして点数のごほうびにする。
// このファイルはマナを全部戻さない。1ずつ戻すだけ。

export const MAX_MANA = 10;
export const RECOVER_PER_CARD = 1;
export const MAX_RECOVER_PER_TURN = 1;

// 決め待ち：切れる色（ハートだけか、どの色でもか）。
// 仮置きは ['HEART']。決まり次第ここだけ変える。
export const ALLOWED_COLORS = ['HEART'];

function canonicalSuit(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

// state の形（写し側のつなぎに合わせること）：
//   { mana, hand: [{ id, suit }], discarded: [], manaRecoveredThisTurn }
// mana は今のマナ（0〜10）。hand は手札。discarded は捨て札。
// 写しに捨て札の入れ物はまだないため、この計算が返す state の discarded が捨て札になる。

export function canRecoverMana(state, card) {
  if (!state || !card) {
    return { ok: false, reason: 'カードが選ばれていません' };
  }
  if (state.manaRecoveredThisTurn >= MAX_RECOVER_PER_TURN) {
    return { ok: false, reason: 'この番はもう1枚切っています' };
  }
  if (state.mana >= MAX_MANA) {
    return { ok: false, reason: 'マナがいっぱいです' };
  }
  if (!state.hand.some((c) => c.id === card.id)) {
    return { ok: false, reason: '手札にそのカードがありません' };
  }
  if (!ALLOWED_COLORS.includes(canonicalSuit(card.suit))) {
    return { ok: false, reason: 'その色のカードは切れません' };
  }
  return { ok: true, reason: '' };
}

// 手札を1枚切ってマナを1戻す。できないときは state を変えずに理由を返す。
// 切ったカードは「出したカード」ではない。門の7枚・最初の1枚無料には数えない。
export function recoverMana(state, card) {
  const check = canRecoverMana(state, card);
  if (!check.ok) {
    return { state, ok: false, reason: check.reason };
  }
  const nextMana = Math.min(MAX_MANA, state.mana + RECOVER_PER_CARD);
  return {
    state: {
      ...state,
      mana: nextMana,
      hand: state.hand.filter((c) => c.id !== card.id),
      discarded: [...state.discarded, card],
      manaRecoveredThisTurn: state.manaRecoveredThisTurn + 1,
    },
    ok: true,
    reason: '',
  };
}

// 番の始めに呼ぶ。1ターン1枚までの数え方を0へ戻す。
export function resetManaRecoveryTurn(state) {
  return { ...state, manaRecoveredThisTurn: 0 };
}
