// 巡ごとの証拠記録の核（2026-11-10、対戦ログ必須化）。
//
// 狙い：遊び確認や自動確認で「なぜ止まったか／勝ちの流れが決め通りか」を、
// 記憶や報告ではなく実物の記録で確かめられるようにする。
// 1巡ごとに、巡番号・各プレイヤーの列の枚数・山札の残り・手札の枚数・
// 門の状態・ゴールまであと何枚か・その巡で起きた補充を残す。
// 試合の終わりには結果（勝者と順位）を付け、勝ちの流れ
// （門が開く→ゴール到達→勝者→順位で勝者が先）を決めと照らす。
//
// 純粋な核で、画面・保存・通信には触らない。状態の読み取りは呼ぶ側が
// 通常の形（buildRoundSnapshot の入力）に直して渡す。

export const ROUND_EVIDENCE_SCHEMA = 'gameroad.round-evidence.v1';
export const GOAL_TARGET_DEFAULT = 7;

function assertLog(log) {
  if (!log || log.schema !== ROUND_EVIDENCE_SCHEMA || !Array.isArray(log.rounds)) {
    throw new TypeError('ROUND_EVIDENCE_LOG_REQUIRED');
  }
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function createRoundEvidenceLog(matchId) {
  return {
    schema: ROUND_EVIDENCE_SCHEMA,
    matchId: matchId == null ? null : String(matchId),
    rounds: [],
    result: null,
    winFlow: null,
  };
}

// 呼ぶ側の生の形（lanes は L/C/R の配列、deck/hand は配列、position は文字列）
// から、記録用の写しを作る。入力は変えない。
export function buildRoundSnapshot({ round, players, gateOpen, gateOpenedBy, goalTarget = GOAL_TARGET_DEFAULT } = {}) {
  if (!Number.isInteger(round) || round < 1) throw new TypeError('ROUND_NUMBER_INVALID');
  if (!Array.isArray(players)) throw new TypeError('PLAYERS_ARRAY_REQUIRED');
  const target = Number.isInteger(goalTarget) && goalTarget > 0 ? goalTarget : GOAL_TARGET_DEFAULT;
  const rows = players.map((p) => {
    const lanes = p?.lanes || {};
    const laneCounts = {
      L: countOf(lanes.L),
      C: countOf(lanes.C),
      R: countOf(lanes.R),
    };
    const maxLane = Math.max(laneCounts.L, laneCounts.C, laneCounts.R);
    return Object.freeze({
      id: p?.id == null ? null : String(p.id),
      laneCounts: Object.freeze(laneCounts),
      maxLane,
      deckCount: countOf(p?.deck),
      handCount: countOf(p?.hand),
      position: typeof p?.position === 'string' ? p.position : null,
      goalShortfall: Math.max(0, target - maxLane),
    });
  });
  return Object.freeze({
    round,
    gateOpen: Boolean(gateOpen),
    gateOpenedBy: Object.freeze([...(Array.isArray(gateOpenedBy) ? gateOpenedBy : [])].map(String)),
    players: Object.freeze(rows),
    refills: [],
  });
}

export function appendRoundSnapshot(log, snapshot) {
  assertLog(log);
  if (!snapshot || !Number.isInteger(snapshot.round)) throw new TypeError('ROUND_SNAPSHOT_REQUIRED');
  log.rounds.push(snapshot);
  return snapshot;
}

// 補充の記録を、その巡の記録へ足す。巡の記録がまだ無い場合は false。
export function appendRefillEvent(log, { round, playerId, fromDeck = 0, fromFallback = 0, joker = false } = {}) {
  assertLog(log);
  const rec = [...log.rounds].reverse().find((r) => r.round === round);
  if (!rec) return false;
  rec.refills.push(Object.freeze({
    playerId: playerId == null ? null : String(playerId),
    fromDeck: Math.max(0, fromDeck | 0),
    fromFallback: Math.max(0, fromFallback | 0),
    joker: Boolean(joker),
  }));
  return true;
}

export function attachMatchResult(log, { winnerIds, ranks } = {}) {
  assertLog(log);
  const winners = [...(Array.isArray(winnerIds) ? winnerIds : [])].map(String);
  const rankRows = (Array.isArray(ranks) ? ranks : []).map((r) => Object.freeze({
    playerId: r?.playerId == null ? null : String(r.playerId),
    rank: Number.isInteger(r?.rank) ? r.rank : null,
  }));
  log.result = Object.freeze({
    winnerIds: Object.freeze(winners),
    ranks: Object.freeze(rankRows),
  });
  log.winFlow = checkWinFlow(log);
  return log.result;
}

// 勝ちの流れの照合（ライカの決め：7枚で門が開き、そのあとゴール到達で勝ち。
// 門が開いただけでは勝ちにならない）。
export function checkWinFlow(log) {
  assertLog(log);
  const problems = [];
  if (!log.rounds.length) problems.push('NO_ROUND_RECORDS');
  const openers = new Set();
  let gateOpened = false;
  for (const rec of log.rounds) {
    if (rec.gateOpen || (rec.gateOpenedBy && rec.gateOpenedBy.length)) gateOpened = true;
    for (const id of rec.gateOpenedBy || []) openers.add(id);
  }
  if (log.rounds.length && !gateOpened) problems.push('GATE_NEVER_OPENED');
  const result = log.result;
  let winnerWasGateOpener = false;
  let winnerFirst = false;
  if (!result) {
    problems.push('NO_RESULT');
  } else {
    if (!result.winnerIds.length) problems.push('NO_WINNER');
    winnerWasGateOpener = result.winnerIds.length > 0 && result.winnerIds.every((id) => openers.has(id));
    if (result.winnerIds.length && !winnerWasGateOpener) problems.push('WINNER_NOT_GATE_OPENER');
    const rankOf = new Map(result.ranks.map((r) => [r.playerId, r.rank]));
    winnerFirst = result.winnerIds.length > 0 && result.winnerIds.every((id) => rankOf.get(id) === 1);
    if (result.winnerIds.length && !winnerFirst) problems.push('WINNER_NOT_FIRST');
  }
  return Object.freeze({
    ok: problems.length === 0,
    gateOpened,
    winnerWasGateOpener,
    winnerFirst,
    problems: Object.freeze(problems),
  });
}
