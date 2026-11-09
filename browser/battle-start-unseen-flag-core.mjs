// 35番 BATTLE開始の旗「見られなかった」を本物の流れへつなぐ — 純粋な核（DRAFT）
//
// 決まったこと（引き継ぎメモより）：旗を立てる所を本物の流れへつなぐ。決め待ち：なし。
// 土台：GAMEROAD-BATTLE-START-見せ方.patch（E30・29番）の旗の仕組み。
// この核は保存を直接触らない。「見られなかった理由」と「次にどう出すか」を決めるだけ。
// 保存への書き込みは、既存の createBattleStartFlagsStore にまかせること。
// 順番の出し方には触らない（29番の決め待ち。処理順はでっち上げない）。

// 既存の旗の鍵（調べメモより。そのまま使う。新しい鍵は作らない）。
export const BATTLE_START_FLAGS_KEY = 'gameroad.battle-start-flags.v1';

// 「見られなかった」理由。今の調べメモに書かれた、出さない場合だけ。
// - no-screen：画面が作れないとき。
// - no-battle-screen：対戦画面がないとき。
// - participant-entry：友だちの部屋の参加者側の入口（projectionToMatch）が
// startMatch を通らないため、見せ方が出なかったとき。
export const BATTLE_START_UNSEEN_REASONS = [
 'no-screen',
 'no-battle-screen',
 'participant-entry',
];

// 「見られなかった」を旗として残す形。既存の旗（見た・飛ばした・失敗した）に足す。
// 失敗した旗と同じ扱いにする：次は題だけ出す。対戦は止めない。
export function recordBattleStartUnseen(previousFlags = {}, reason) {
 if (!BATTLE_START_UNSEEN_REASONS.includes(reason)) {
 return {...previousFlags, unseen: null};
}
 return {...previousFlags, unseen: reason};
}

// 次にどう出すかを決める。既存の decideBattleStartPresentation の前に入れる。
// - 「見られなかった」旗があるときは、次は「題だけ」（600ms）。
// - 題だけを出した次の回で、旗は消す（失敗した旗と同じ決まり）。
// - 設定が「見ない」のときは、もともとの「なし」の決まりが先（ここでは扱わない）。
export function decideBattleStartAfterUnseen(flags = {}) {
 if (flags.unseen) {
 return { presentation: 'title-only', clearUnseenAfter: true};
}
 return { presentation: null, clearUnseenAfter: false};
}

// 旗の形が正しいかを確かめる。理由が3つのうちの1つでなければ false を返す。
export function auditBattleStartUnseenFlags(flags = {}) {
 if (flags.unseen == null) return true;
 return BATTLE_START_UNSEEN_REASONS.includes(flags.unseen);
}

