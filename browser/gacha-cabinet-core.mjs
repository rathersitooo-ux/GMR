// ガチャの筐体演出の核（2026-11-10、第1弾の未回答11の第一版）。
//
// 形：実物の筐体（カプセルが出てくる機械）の動きを、段階の列として持つ。
// 引く→カプセルが出る→カプセルの色で予告→割れて中身が出る。
// 一番高いレアリティで予告の色と山場の長さが変わる。10連は、カプセルを
// 全部出してから、レアリティの低い順に開けて一番良い物を最後に見せる。
//
// この核は「演出の段取り」だけを持つ。絵と音は別段。
// レアリティの段階と色の対応は下書き（通常=白、レア=青、激レア=金、
// 一番上=虹）。

export const RARITY_ORDER = Object.freeze(['common', 'rare', 'super', 'legend']);
const CAPSULE_COLOR = Object.freeze({ common: 'white', rare: 'blue', super: 'gold', legend: 'rainbow' });

function rarityRank(r) { return RARITY_ORDER.indexOf(r); }

export function capsuleColorFor(rarity) {
  return CAPSULE_COLOR[rarity] ?? 'white';
}

// 1回分の演出の段取り。results は引いた結果（レアリティの一覧）。
export function buildCabinetSequence(results) {
  if (!Array.isArray(results) || results.length === 0) return { steps: [], revealOrder: [] };
  const best = results.reduce((a, b) => (rarityRank(b) > rarityRank(a) ? b : a), results[0]);
  const steps = [
    { kind: 'lever', label: 'レバーを回す', ms: 600 },
    { kind: 'drop', label: 'カプセルが出る', ms: 800, count: results.length },
    { kind: 'hint', label: 'カプセルの色で予告', ms: best === 'legend' || best === 'super' ? 1200 : 700, color: capsuleColorFor(best) },
  ];
  // 開ける順：低い順→一番良い物を最後
  const revealOrder = [...results].sort((a, b) => rarityRank(a) - rarityRank(b));
  revealOrder.forEach((rarity, i) => {
    const isLast = i === revealOrder.length - 1;
    steps.push({ kind: 'open', label: isLast ? '最後の1つが開く' : 'カプセルが開く', ms: isLast && rarityRank(rarity) >= 2 ? 1500 : 600, rarity, color: capsuleColorFor(rarity) });
  });
  return { steps, revealOrder, best };
}

export function totalDurationMs(sequence) {
  return sequence.steps.reduce((s, x) => s + x.ms, 0);
}
