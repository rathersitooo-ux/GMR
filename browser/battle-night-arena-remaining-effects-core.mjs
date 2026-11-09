// 33番 E36 夜の闘技場の残りの演出 — 純粋な核（DRAFT）
//
// 決まったこと（引き継ぎメモより）：青い炎・金のふちのマスなど、まだ入っていない演出を
// 入れる（動きと絵）。決め待ち：なし。
// 土台：夜の闘技場 v1・v2（色だけの直し。配置・文字・動きは変えていない）。
// この核は画面を直接触らない。4つの演出を「何を・どこに・どう出すか」の形で決めるだけ。
// 画面への取り付け（DOM・CSS・Canvas）は、写しで確かめてから別に作ること。
// 動きを減らす設定・低性能のときは、動きなしで色と形だけ出す（BATTLE STARTの決まりと同じ）。

// 残っている4つの演出（v1・v2の引き継ぎ文に「まだ入れていない」と書かれたもの、そのまま）。
export const NIGHT_ARENA_REMAINING_EFFECTS = [
 {
 id: 'janken-blue-flame',
 name: 'じゃんけんの枠の青い炎',
 target: 'じゃんけんの枠',
 kind: 'motion',
 note: '見本の動画の青い炎を、そのまま貼るのではなく本物の部品として作り直す。'
 + '炎の色は夜の闘技場の濃い青紫に合わせる。P2の青とは別の色に見えるようにする。',
},
 {
 id: 'gold-edged-tile',
 name: '金のふちのマス',
 target: '盤面のマス',
 kind: 'visual',
 note: 'マスのふちだけ金にする。マスの中の色とプレイヤーの色（P1赤・P2青・P3金・P4緑）は'
 + '変えない。金の道（v2で細く・暗くしたもの）と同じ金を使う。',
},
 {
 id: 'glowing-pattern',
 name: '光る模様',
 target: '盤面',
 kind: 'visual',
 note: '盤面に光る模様を足す。文字と手札の数字の読みやすさを落とさないこと。'
 + '動きを減らす設定では光らせない。',
},
 {
 id: 'turn-round-decoration',
 name: '中央のTURNの丸い飾り',
 target: '中央のTURN表示',
 kind: 'visual',
 note: '中央のTURNの周りに丸い飾りを足す。TURNの文字と順番の表示は変えない。'
 + '29番の「順番の出し方」には触らない。',
},
];

// 4つの演出を出すかどうかを決める。引数は BATTLE START の決まりと同じ形。
// - reducedMotion：動きを減らす設定（OSの設定・ゲーム内の設定・低性能）のとき true。
// - 動きなしのときも、色と形だけは出す（「動きなし＝何も出さない」ではない）。
export function decideNightArenaRemainingEffects({ reducedMotion = false} = {}) {
 return NIGHT_ARENA_REMAINING_EFFECTS.map((effect) => ({
...effect,
 enabled: true,
 animate:!reducedMotion,
}));
}

// 4つがそろっているかを確かめる。足りない・名前が違うものがあれば false を返す。
// 写しで確かめること：この4つの id が、取り付け側（DOM・CSS・Canvas）の名前と一致すること。
export function auditNightArenaRemainingEffects(effects) {
 const ids = new Set((effects?? []).map((effect) => effect.id));
 return NIGHT_ARENA_REMAINING_EFFECTS.every((effect) => ids.has(effect.id));
}

