// コンビ打ち対策の核（2026-11-10、第1弾の未回答2の第一版・設計の下書き）。
//
// 問題の形：4人の自由対戦で、2人が示し合わせて1人を集中して狙うと、
// 狙われた側には防ぎようがなく、対戦が崩れる。計画は同時に出す形なので、
// 「見つけて罰する」対策は取れない。狙う側の得を減らす、仕組み側の対策にする。
//
// 対策（この核の形）：同じ相手への攻撃が同じ巡に重なったら、2人目以降の
// 攻撃を弱める（1人目=そのまま、2人目=7割、3人目=5割）。集中するより
// 分散した方が総量が大きくなるので、示し合わせの旨みが減る。
// 計画は同時なので、入力の並び順で結果が変わらないようにする
// （同じ相手への攻撃は、力の大きい順に並べてから倍率を付ける）。
//
// 注意：これは対策の設計が正本に無かった所への、実装側の下書き。
// 数字（7割・5割）は調整の前提で、正式な採用は比べと一緒に上げる。

const FACTORS = Object.freeze([1, 0.7, 0.5]);

// attacks: [{ attackerId, targetId, power }]
// 戻り値：{ adjusted: [{ attackerId, targetId, power, factor }], focusedTargets: [targetId] }
export function applyFocusFireRule(attacks) {
  const byTarget = new Map();
  for (const a of attacks) {
    if (!byTarget.has(a.targetId)) byTarget.set(a.targetId, []);
    byTarget.get(a.targetId).push(a);
  }
  const adjusted = [];
  const focusedTargets = [];
  for (const [targetId, list] of byTarget.entries()) {
    // 同時計画なので順番に意味を持たせない：力の降順、同点は攻撃者の識別子順で固定
    const sorted = [...list].sort((x, y) => (y.power - x.power) || String(x.attackerId).localeCompare(String(y.attackerId)));
    if (sorted.length >= 2) focusedTargets.push(targetId);
    sorted.forEach((a, i) => {
      const factor = FACTORS[Math.min(i, FACTORS.length - 1)];
      adjusted.push({ attackerId: a.attackerId, targetId, power: Math.floor(a.power * factor), factor });
    });
  }
  return { adjusted, focusedTargets };
}

// 集中した場合としなかった場合の、対象への総量の差を見るための道具。
export function totalDamageTo(adjusted, targetId) {
  return adjusted.filter((a) => a.targetId === targetId).reduce((s, a) => s + a.power, 0);
}
