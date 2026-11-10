// パートナーの仮参戦（2026-11-10 ライカの決め）
// 仲いいキャラクターは複数人作る。その中から、一番仲良かったり、気まぐれで決めた人を
// パートナーとして仮参戦させる。目的はパートナーのアドバイスセリフ等の実装のテスト。
// 仮参戦は正式なパートナーの決定ではない。

// アドバイスセリフを出す場面の一覧（テストの対象。セリフ本文はキャラ側の材料が正本で、ここは置き場の形だけ）
export const ADVICE_SCENES = [
  { id: 'plan_start', name: '計画のはじまり' },
  { id: 'road_chosen', name: 'ロードを選んだ時' },
  { id: 'battle_chosen', name: 'バトルを選んだ時' },
  { id: 'battle_win', name: '戦闘で勝った時' },
  { id: 'battle_lose', name: '戦闘で負けた時' },
  { id: 'deck_low', name: '山札が少なくなった時' },
  { id: 'goal_close', name: 'ゴールが近づいた時' },
  { id: 'facility_stop', name: '店や施設に止まった時' },
];

// character: { id, friends: [{ characterId, closeness (大きいほど仲いい), note }] }
// mode: 'closest' = 一番仲いい人 / 'whim' = 気まぐれで決めた人
export function selectProvisionalPartner(character, mode = 'closest', rng = Math.random) {
  const friends = (character?.friends || []).filter((f) => f && f.characterId);
  if (!friends.length) return null;
  if (mode === 'whim') {
    const ix = Math.min(friends.length - 1, Math.floor(rng() * friends.length));
    return { partnerId: friends[ix].characterId, mode, reason: '気まぐれで決めた' };
  }
  let best = friends[0];
  for (const f of friends) {
    if ((f.closeness ?? 0) > (best.closeness ?? 0)) best = f;
  }
  return { partnerId: best.characterId, mode: 'closest', reason: '一番仲いい' };
}

// 仮参戦の記録1件を作る（誰が・誰を・どちらの形で連れてきたか）
export function makeProvisionalJoin(character, mode = 'closest', rng = Math.random) {
  const sel = selectProvisionalPartner(character, mode, rng);
  if (!sel) return null;
  return {
    provisional: true,
    hostId: character.id,
    partnerId: sel.partnerId,
    mode: sel.mode,
    reason: sel.reason,
    purpose: 'パートナーのアドバイスセリフ等の実装のテスト',
    testedScenes: [],
  };
}

// テストで1場面ぶん進める（場面が一覧にある時だけ記録する）
export function recordTestedScene(join, sceneId) {
  if (!join) return false;
  if (!ADVICE_SCENES.some((s) => s.id === sceneId)) return false;
  if (!join.testedScenes.includes(sceneId)) join.testedScenes.push(sceneId);
  return true;
}

export function untestedScenes(join) {
  if (!join) return ADVICE_SCENES.map((s) => s.id);
  return ADVICE_SCENES.filter((s) => !join.testedScenes.includes(s.id)).map((s) => s.id);
}
