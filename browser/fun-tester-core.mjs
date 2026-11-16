// 「楽しいか」を理論値で出すテスターの核（v3）。
// プレイ記録（ログ）を食べて、テンポ・報酬の間隔・選択の意味・詰まりの4つの
// 物差しを数値化し、0〜100の楽しさ見込みスコアにまとめる。
// v2の較正（2026-11-12、実機の自動プレイの記録で裏付け）：
// ・テンポは「計画の操作の時間」ではなく、待ち時間込みの1巡の実時間で測る。
//   実測で計画は2秒でも待ちが12秒あり、操作時間だけ見ると100点になる誤りがあった。
// ・一番弱い柱が全体を引っ張る（合計は「一番弱い柱＋25」で頭打ち）。
//   ライカの却下は1つの原因で決まる（エフェクト無し／説明文）ので、弱い柱を
//   他の柱で補う形にはしない。報酬0の記録は25点で頭打ちになる。
// ・「たのしい見込み」は85点以上。80点では甘い。
// ・報酬イベントには任意で「演出の強さ」（0〜1）の札を付けられる。
//   付けない記録は従来通り。付けた記録は強さで報酬の点を補正する。
// v3の較正（2026-11-12、完走の記録2試合の実測で裏付け）：
// ・テンポは「操作の時間」と「演出の時間」に分けて測れる形にした。
//   1巡の全時間を壁時計で測ると、測定環境の遅さ（無人ブラウザのソフトウェア
//   描画で1巡41〜46秒）までテンポの点に入ってしまい、完走した試合の合計が
//   測り方だけで決まる欠けがあった。分離の材料（operationMs /
//   presentationMs / presentationDesignMs）が全巡にそろった記録では、
//   テンポ＝操作の時間＋待ち時間＋演出の設計時間で測る。演出は実測の
//   壁時計ではなく設計時間で数えるので、環境の遅さに引きずられない。
// ・分離の材料が無い・一部だけの記録では系統を混ぜない。全巡そろった時だけ
//   分離を使い、それ以外は v2 の実時間の測り方のままにする。材料の無い分は
//   推測の数字で埋めず「未記録」として結果に印を付ける。
// 画面の文は扱わない。プレイの流れだけを見る。

export const FUN_TESTER_LOG_SCHEMA = 'gameroad.fun-tester.log.v1';
export const FUN_TESTER_VERSION = 'fun-tester-core.v3';

// 1回のプレイ記録の形（v1の形に rewardStrength を任意で追加）：
// {
//   version: 'gameroad.fun-tester.log.v1',
//   startedAtMs: 0, endedAtMs: 120000,
//   completed: true,            // 結果画面まで到達したか
//   turns: [
//     {
//       turn: 1, player: 'p1',
//       startedAtMs: 0, endedAtMs: 4000,
//       options: [0, 5, 12],    // 選べた手の結果の差（数が違うほど意味がある）
//       chosenIndex: 2,
//       rewards: 1,             // この巡で出た報酬の数（0でもよい）
//       rewardStrength: 0.8,    // 任意。報酬の演出の強さ（0〜1）。無い巡は付けない。
//       operationMs: 2000,      // 任意。操作の時間（考えて選ぶ時間）。v3のテンポ分離の材料。
//       presentationMs: 9000,   // 任意。演出の時間の実測（壁時計）。
//       presentationDesignMs: 4000, // 任意。演出の設計時間。テンポは演出をこの時間で数える。
//       waitedMs: 0,            // 入力も演出も無い待ち時間
//       stalled: false,         // 手が無くて進まなかった巡
//       deadEnd: false,         // 行き止まり
//       looped: false,          // 同じ状態の繰り返し
//     },
//   ],
// }

function fail(reason, extra = {}) {
  return Object.freeze({ ok: false, reason, ...extra });
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// テンポ分離の材料は任意。0以上の有限数でなければ「未記録」として null。
function splitMs(value) {
  const n = finiteNumber(value);
  return n != null && n >= 0 ? n : null;
}

function normalizeTurn(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const startedAtMs = finiteNumber(raw.startedAtMs);
  const endedAtMs = finiteNumber(raw.endedAtMs);
  if (startedAtMs == null || endedAtMs == null || endedAtMs < startedAtMs) return null;
  const operationMs = splitMs(raw.operationMs);
  const presentationMs = splitMs(raw.presentationMs);
  const options = Array.isArray(raw.options)
    ? raw.options.map(finiteNumber).filter((n) => n != null)
    : [];
  return Object.freeze({
    turn: Number.isFinite(Number(raw.turn)) ? Number(raw.turn) : index + 1,
    player: typeof raw.player === 'string' && raw.player ? raw.player : null,
    startedAtMs,
    endedAtMs,
    durationMs: endedAtMs - startedAtMs,
    options: Object.freeze(options),
    chosenIndex: Number.isFinite(Number(raw.chosenIndex)) ? Number(raw.chosenIndex) : null,
    rewards: Math.max(0, Math.floor(Number(raw.rewards) || 0)),
    // 演出の強さは任意。数値で無ければ「測っていない」として null。
    rewardStrength: raw.rewardStrength == null
      ? null
      : (Number.isFinite(Number(raw.rewardStrength))
        ? Math.max(0, Math.min(1, Number(raw.rewardStrength)))
        : null),
    waitedMs: Math.max(0, finiteNumber(raw.waitedMs) ?? 0),
    // テンポ分離の材料（v3）。操作と演出の両方が記録された巡だけが分離の対象。
    // 設計時間は任意で、無い巡は演出の実測で数える。
    operationMs,
    presentationMs,
    presentationDesignMs: splitMs(raw.presentationDesignMs),
    tempoSplitRecorded: operationMs != null && presentationMs != null,
    stalled: raw.stalled === true,
    deadEnd: raw.deadEnd === true,
    looped: raw.looped === true,
  });
}

export function normalizeFunLog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.version !== FUN_TESTER_LOG_SCHEMA) return null;
  if (!Array.isArray(raw.turns) || raw.turns.length === 0) return null;
  const turns = [];
  for (let i = 0; i < raw.turns.length; i++) {
    const turn = normalizeTurn(raw.turns[i], i);
    if (!turn) return null;
    turns.push(turn);
  }
  const startedAtMs = finiteNumber(raw.startedAtMs) ?? turns[0].startedAtMs;
  const endedAtMs = finiteNumber(raw.endedAtMs) ?? turns[turns.length - 1].endedAtMs;
  return Object.freeze({
    version: FUN_TESTER_LOG_SCHEMA,
    startedAtMs,
    endedAtMs,
    completed: raw.completed === true,
    turns: Object.freeze(turns),
  });
}

function scoreTempo(turns) {
  // v3：分離の材料（操作の時間と演出の時間）が全巡にそろった記録では、
  // テンポ＝操作の時間＋待ち時間＋演出の設計時間で測る。演出は実測の壁時計
  // ではなく設計時間で数えるので、測定環境の遅さに引きずられない。
  // 材料が無い・一部だけの記録では系統を混ぜず、v2の実時間の測り方のまま。
  // 材料の無い分は推測で埋めず、結果に「未記録」の印（null）を付ける。
  const splitTurns = turns.filter((t) => t.tempoSplitRecorded);
  const splitCoverage = turns.length ? splitTurns.length / turns.length : 0;
  const splitUsed = turns.length > 0 && splitCoverage === 1;
  // 演出を数える時間：設計時間があれば設計時間、無ければその巡の実測。
  const presentationCountedMs = (t) => (t.presentationDesignMs != null ? t.presentationDesignMs : t.presentationMs);
  const durations = splitUsed
    ? turns.map((t) => t.operationMs + t.waitedMs + presentationCountedMs(t))
    : turns.map((t) => t.durationMs + t.waitedMs);
  const med = median(durations) ?? 0;
  const slowShare = durations.filter((d) => d > 15000).length / durations.length;
  // 1巡の真ん中が5秒なら100、30秒なら0。15秒超の巡が多いほど減点。
  const base = 100 - Math.max(0, (med - 5000) / 25000) * 100;
  const splitMedian = (pick) => {
    if (!splitTurns.length) return null;
    const m = median(splitTurns.map(pick));
    return m == null ? null : Math.round(m);
  };
  return {
    medianTurnMs: Math.round(med),
    slowTurnShare: slowShare,
    score: clampScore(base - slowShare * 30),
    splitUsed,
    splitCoverage: Math.round(splitCoverage * 1000) / 1000,
    operationMedianMs: splitMedian((t) => t.operationMs),
    presentationMedianMs: splitMedian((t) => t.presentationMs),
    presentationDesignMedianMs: splitMedian(presentationCountedMs),
  };
}

function scoreRewards(turns) {
  const gaps = [];
  let lastRewardTurn = null;
  let rewardTurns = 0;
  let strengthSum = 0;
  let strengthCount = 0;
  for (const t of turns) {
    if (t.rewards > 0) {
      rewardTurns++;
      if (lastRewardTurn != null) gaps.push(t.turn - lastRewardTurn);
      lastRewardTurn = t.turn;
      if (t.rewardStrength != null) {
        strengthSum += t.rewardStrength;
        strengthCount++;
      }
    }
  }
  const medGap = median(gaps);
  const maxGap = gaps.length ? Math.max(...gaps) : null;
  // 報酬の間隔の真ん中が3巡以内なら100、10巡以上なら0。
  let score = medGap == null
    ? 0
    : clampScore(100 - Math.max(0, (medGap - 3) / 7) * 100 - (maxGap != null && maxGap >= 12 ? 10 : 0));
  // 演出の強さが測れている記録だけ、強さで補正する。
  // 強さ1ならそのまま、強さ0なら4割まで落ちる。測っていない記録は補正しない。
  const meanStrength = strengthCount ? strengthSum / strengthCount : null;
  if (meanStrength != null) score = clampScore(score * (0.4 + 0.6 * meanStrength));
  return { rewardTurns, medianRewardGapTurns: medGap, maxRewardGapTurns: maxGap, meanRewardStrength: meanStrength == null ? null : Math.round(meanStrength * 100) / 100, score };
}

function scoreChoice(turns) {
  let meaningful = 0;
  let forced = 0;
  let totalOptions = 0;
  for (const t of turns) {
    totalOptions += t.options.length;
    if (t.options.length <= 1) {
      forced++;
      continue;
    }
    const distinct = new Set(t.options).size;
    if (distinct >= 2) meaningful++;
  }
  const meaningfulShare = turns.length ? meaningful / turns.length : 0;
  const forcedShare = turns.length ? forced / turns.length : 0;
  const meanOptions = turns.length ? totalOptions / turns.length : 0;
  // 意味のある選択が8割なら100、2割以下なら0。1択ばかりだと減点。
  const score = clampScore(meaningfulShare * 125 - 25 - forcedShare * 20 + Math.min(10, Math.max(0, meanOptions - 2) * 5));
  return { meanLegalOptions: Math.round(meanOptions * 10) / 10, meaningfulShare, forcedShare, score };
}

function scoreStalls(turns) {
  const stalledTurns = turns.filter((t) => t.stalled).length;
  const deadEnds = turns.filter((t) => t.deadEnd).length;
  const loops = turns.filter((t) => t.looped).length;
  const noProgressTurns = turns.filter((t) => t.options.length > 0 && new Set(t.options).size === 1 && t.options[0] === 0).length;
  const score = clampScore(100 - stalledTurns * 10 - deadEnds * 25 - loops * 25 - noProgressTurns * 5);
  return { stalledTurns, deadEnds, loops, noProgressTurns, score };
}

function verdictFor(score, completed) {
  if (!completed) return '未完走（結果まで到達せず）';
  if (score >= 85) return 'たのしい見込み';
  if (score >= 60) return 'まあまあ';
  if (score >= 40) return '物足りない';
  return 'つまらない見込み';
}

// 重みは v2で較正済み。重み自体は v1のまま（実測で動かす根拠はまだ無い）。
// 較正したのは集め方：弱い柱の頭打ちと、テンポの測り方と、判定の区切り。
export const FUN_SCORE_WEIGHTS = Object.freeze({
  tempo: 0.25,
  reward: 0.25,
  choice: 0.3,
  stall: 0.2,
  calibrated: true,
  calibration: 'fun-tester-core.v3 (2026-11-12, v2の較正＋テンポの操作／演出の分離。重みは不変)',
});

// 一番弱い柱が全体を引っ張る上限。ライカの却下は1つの原因で決まるため。
export const FUN_WEAKEST_PILLAR_HEADROOM = 25;

export function analyzeFunLog(raw) {
  const log = normalizeFunLog(raw);
  if (!log) return fail('invalid-log');
  const tempo = scoreTempo(log.turns);
  const reward = scoreRewards(log.turns);
  const choice = scoreChoice(log.turns);
  const stall = scoreStalls(log.turns);
  const waitedMs = log.turns.reduce((sum, t) => sum + t.waitedMs, 0);
  const durationMs = Math.max(0, log.endedAtMs - log.startedAtMs);
  let score = Math.round(
    tempo.score * FUN_SCORE_WEIGHTS.tempo
    + reward.score * FUN_SCORE_WEIGHTS.reward
    + choice.score * FUN_SCORE_WEIGHTS.choice
    + stall.score * FUN_SCORE_WEIGHTS.stall,
  );
  // 一番弱い柱の頭打ち：弱い柱＋25を超えない。
  const weakest = Math.min(tempo.score, reward.score, choice.score, stall.score);
  score = Math.min(score, weakest + FUN_WEAKEST_PILLAR_HEADROOM);
  // 結果まで到達しなければ「たのしい」とは言えない。49点で頭打ち。
  if (!log.completed) score = Math.min(score, 49);
  return Object.freeze({
    ok: true,
    version: FUN_TESTER_VERSION,
    completed: log.completed,
    turns: log.turns.length,
    durationMs,
    idleMs: waitedMs,
    idleShare: durationMs ? Math.round((waitedMs / durationMs) * 1000) / 1000 : 0,
    tempo: Object.freeze(tempo),
    reward: Object.freeze(reward),
    choice: Object.freeze(choice),
    stall: Object.freeze(stall),
    score: clampScore(score),
    verdict: verdictFor(score, log.completed),
    weights: FUN_SCORE_WEIGHTS,
  });
}
