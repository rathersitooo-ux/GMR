// 公開手札の記録（純粋な計算）。
// 原則（2026-11-10、ライカの決め）：公開領域から非公開領域へカードが行くことは
// あってはならない。手札に戻る時は表向きで戻り、戻った後も公開された物として
// 全員に見える状態を保つ。この核は「どのプレイヤーの手札の、どのカードが
// 公開済みか」の記録だけを持つ。画面と本体への接続は live-bridge 側。

export function createPublicHandState() {
  return { byPlayer: {} };
}

function listFor(state, playerId) {
  if (!state.byPlayer[playerId]) state.byPlayer[playerId] = [];
  return state.byPlayer[playerId];
}

// カードが公開された状態で手札に入った（戻った）ことを記録する。
export function markPublicInHand(state, playerId, cardId) {
  if (!state || !playerId || !cardId) return false;
  const list = listFor(state, playerId);
  if (list.includes(cardId)) return false;
  list.push(cardId);
  return true;
}

// そのカードが手札を離れたら、手札としての公開記録からは外す
// （場に出れば場で公開、墓地へ行けば墓地で公開。記録の対象は手札の中だけ）。
export function unmarkInHand(state, playerId, cardId) {
  const list = state?.byPlayer?.[playerId];
  if (!list) return false;
  const ix = list.indexOf(cardId);
  if (ix < 0) return false;
  list.splice(ix, 1);
  return true;
}

// 実際の手札と照合して、手札に無いカードの記録を落とす（同期用）。
export function syncWithHand(state, player) {
  const list = state?.byPlayer?.[player.id];
  if (!list) return 0;
  const hand = new Set(player.hand || []);
  let dropped = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!hand.has(list[i])) { list.splice(i, 1); dropped++; }
  }
  return dropped;
}

// 見る側から見た、各プレイヤーの手札の見え方。
// 公開済みのカードは中身が見える。非公開の分は枚数だけ。
export function viewForViewer(state, players, viewerId) {
  return (players || []).map((p) => {
    const publicCards = [...(state?.byPlayer?.[p.id] || [])]
      .filter((id) => (p.hand || []).includes(id));
    const hiddenCount = Math.max(0, (p.hand || []).length - publicCards.length);
    return {
      playerId: p.id,
      name: p.name,
      isViewer: p.id === viewerId,
      publicCards,
      hiddenCount,
      totalInHand: (p.hand || []).length,
    };
  });
}
