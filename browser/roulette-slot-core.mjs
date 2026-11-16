// ぐる〜れっと（テーマ＋オレカバトル式）の核。
// ぐる〜れっとはテーマ：ぐる〜れっと持ちカードがデッキに入っていれば、
// ゲーム開始時に適用され、クレスト欄に登録される。
// 対戦中は、ロードカードを普通に出した後、残りの手札（追加手札）が
// スロットに埋め込まれ、ぐる〜れっとで選ばれた1枚が強制的に出される。
// 結果の決定権はゲームの仕組み側にあり、表示はそれに従う。

export const ROULETTE_KEYWORD = 'ぐる〜れっと';

export function isRouletteCard(card) {
  return !!card && Array.isArray(card.keywords) && card.keywords.includes(ROULETTE_KEYWORD);
}

function readCard(cardsById, cardId) {
  if (!cardsById) return null;
  if (cardsById instanceof Map) return cardsById.get(cardId) ?? null;
  return cardsById[cardId] ?? null;
}

// テーマの判定：デッキの中のぐる〜れっと持ちカード（ゲーム開始時にクレスト欄へ登録する）。
export function findRouletteCardIds(deckIds, cardsById) {
  if (!Array.isArray(deckIds)) return [];
  const seen = new Set();
  const out = [];
  for (const id of deckIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isRouletteCard(readCard(cardsById, id))) out.push(id);
  }
  return out;
}

export function hasRouletteTheme(deckIds, cardsById) {
  return findRouletteCardIds(deckIds, cardsById).length > 0;
}

// スロットの候補：ロードカードを除いた残りの手札全部（追加手札）。
export function rouletteCandidates(handIds, excludeId) {
  if (!Array.isArray(handIds)) return [];
  const seen = new Set();
  const out = [];
  for (const id of handIds) {
    if (!id || id === excludeId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// ぐる〜れっとを回して止める。pickIndex(候補数) が止まる位置を決める（ゲーム側の乱数）。
export function spinRoulette(candidates, pickIndex) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const raw = Math.floor(Number(pickIndex(candidates.length)) || 0);
  const index = Math.max(0, Math.min(candidates.length - 1, raw));
  return { candidates: [...candidates], index, chosen: candidates[index] };
}

// 補充（ロケット鉛筆式）：選ばれたカードが抜けた分を、山札の先頭から順に押し込んで候補の数を保つ。
// 戻り値の pool が補充後の候補、drawn が山札から入ったカード（順番どおり）。
// 山札が尽きたら、ある分だけで止まる（無理に作らない）。
export function refillCandidates(poolAfterRemoval, deckIds, target) {
  const pool = Array.isArray(poolAfterRemoval) ? [...poolAfterRemoval] : [];
  const deck = Array.isArray(deckIds) ? deckIds : [];
  const goal = Math.max(pool.length, Math.floor(Number(target) || 0));
  const drawn = [];
  let di = 0;
  while (pool.length < goal && di < deck.length) {
    const id = deck[di++];
    if (!id || pool.includes(id)) continue;
    pool.push(id);
    drawn.push(id);
  }
  return { pool, drawn };
}
