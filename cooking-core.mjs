// 料理の核（2026-11-10、第1弾の未回答5の第一版）。
//
// 形（ライカの整理）：食材カードを合わせて料理を作り、パートナーに
// 食べさせる。置き場は対戦の外（パートナー側の遊び）で、対戦の流れには
// 触れない。料理工程のカードは、工程（切る・焼く・煮る等）として使う。
//
// この核は「材料と工程から料理を決める」ところまで。食べた時の効き先は
// 結果として返し、好感度や調子への当てはめはパートナー側の段でやる。

// レシピ：材料の組＋工程で1品。材料の並び順は問わない。
// effects は、食べた時の効き先の下書き（好感度 affinity、調子 mood）。
export const RECIPES = Object.freeze([
  { id: 'dish_omelette', name: 'ふわふわオムレツ', ingredients: ['ing_egg', 'ing_milk'], process: 'proc_fry', effects: { affinity: 2, mood: 'genki' } },
  { id: 'dish_salad', name: '畑のサラダ', ingredients: ['ing_tomato', 'ing_lettuce'], process: 'proc_cut', effects: { affinity: 1, mood: 'sawayaka' } },
  { id: 'dish_stew', name: 'こっくりシチュー', ingredients: ['ing_potato', 'ing_carrot', 'ing_milk'], process: 'proc_simmer', effects: { affinity: 3, mood: 'pokapoka' } },
  { id: 'dish_cake', name: '星形ケーキ', ingredients: ['ing_egg', 'ing_flour', 'ing_berry'], process: 'proc_bake', effects: { affinity: 4, mood: 'happy' } },
]);

const FAILED_DISH = Object.freeze({ id: 'dish_failed', name: 'なぞの料理', effects: { affinity: 0, mood: 'fushigi' } });

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// 料理する。材料（食材カードの識別子の一覧）と工程（工程札の識別子）を渡す。
// レシピに合えばその料理、合わなければ「なぞの料理」（失敗作）。
// 材料は消費する前提で、消費の記録は呼び出し側の所持管理に返す。
export function cook(ingredientIds, processId) {
  const recipe = RECIPES.find((r) => r.process === processId && sameSet(r.ingredients, ingredientIds));
  if (!recipe) return { ok: false, dish: { ...FAILED_DISH }, consumed: [...ingredientIds] };
  return { ok: true, dish: { id: recipe.id, name: recipe.name, effects: { ...recipe.effects } }, consumed: [...recipe.ingredients] };
}

// 食べさせる。料理の効き先をそのまま返す（当てる先はパートナー側）。
export function feedPartner(dish) {
  return { dishId: dish.id, dishName: dish.name, effects: { ...dish.effects } };
}

// 材料から作れる料理の一覧（レシピの予告用）。
export function cookableWith(ingredientIds) {
  return RECIPES.filter((r) => r.ingredients.every((i) => ingredientIds.includes(i))).map((r) => r.id);
}
