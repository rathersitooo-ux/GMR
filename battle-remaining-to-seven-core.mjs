// 「あと何枚」の核。GAMEROADに体力はない。ライフに相当するのは
// 「7枚そろえるまでの残りの枚数」＝一番進んだ道（レーン）の枚数から数える残り。
// 数え方は対戦本体と同じ（GAMEROAD.html の grEvaluateMatchCompletion /
// publicMatchHasWinner が使っている形）：各人の道 L・C・R のうち最大の長さが
// 7に届くと門が開く。だから残り = 7 − 最大の道の長さ。
// ここは表示専用の純粋な核で、対戦の状態・勝敗・門の判定は変えない。
// 残り0は「勝ち」ではない。今の決まり（標準）は「7枚で門が開いて、
// ゴールで勝ち」。残り0の表示は「門が開いた！」までで、勝ちとは言わない。
//
// 比べた他のゲーム（2026-11-08、モカが自分で開いて確認）：
// - MTGアリーナ：ライフは「顔の絵のすぐ下に大きな数字」（MagicArena Wiki の
//   Life のページ／対戦画面の解説）。相手の分も画面の上に見える。
// - ハースストーン：体力は顔の絵の右下の隅に、赤い血のしずくの上に大きな数字。
//   守りの数字はその上に重ねる（Hearthstone Wiki の Attribute のページ）。
// - ポケモンカード：サイドの残り枚数がそのまま勝ちまでの残りで、
//   残りのカード自体が場に見える（公式の遊び方）。
// GAMEROADは4人なので、4人全員分を同じ大きさで並べ、見る人（観戦者）にも
// プレイヤーにも一番大事な数字として顔のすぐ下に大きく出す形にする。

export const REMAINING_TO_SEVEN_SCHEMA = 'gameroad.battle-remaining-to-seven.v1';
export const REMAINING_TO_SEVEN_TARGET = 7;

export const REMAINING_LANE_KEYS = Object.freeze(['L', 'C', 'R']);
export const REMAINING_LANE_LABELS = Object.freeze({
  L: '左の道',
  C: 'まん中の道',
  R: '右の道',
});

export const REMAINING_STATES = Object.freeze({
  RACING: 'racing',
  REACH: 'reach',
  GATE_OPEN: 'gate_open',
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function laneLength(value) {
  if (Array.isArray(value)) return value.length;
  if (Number.isSafeInteger(value) && value >= 0) return value;
  return 0;
}

/**
 * 1人の道の長さを返す。実物の対戦（lanes がカードの並び）と、
 * 公開用の写し（lanes が枚数の数字）の両方を受ける。
 */
export function readRemainingLaneLengths(player) {
  const lanes = player?.lanes && typeof player.lanes === 'object' ? player.lanes : {};
  const lengths = {};
  for (const key of REMAINING_LANE_KEYS) lengths[key] = laneLength(lanes[key]);
  return freeze(lengths);
}

/**
 * 1人分の「あと何枚」を作る。
 * - completed: 一番進んだ道の枚数
 * - remaining: 7 − completed（0未満にはしない）
 * - state: racing（通常）／reach（あと1枚）／gate_open（7枚そろった）
 */
export function projectPlayerRemaining(player, { target = REMAINING_TO_SEVEN_TARGET } = {}) {
  if (!player || typeof player !== 'object') throw new TypeError('REMAINING_PLAYER_REQUIRED');
  if (!Number.isSafeInteger(target) || target <= 0) throw new TypeError('REMAINING_TARGET_POSITIVE_INTEGER_REQUIRED');
  const playerId = typeof player.id === 'string' && player.id ? player.id : null;
  if (!playerId) throw new TypeError('REMAINING_PLAYER_ID_REQUIRED');
  const name = typeof player.name === 'string' && player.name ? player.name : playerId;
  const lengths = readRemainingLaneLengths(player);
  let bestLane = 'L';
  for (const key of REMAINING_LANE_KEYS) {
    if (lengths[key] > lengths[bestLane]) bestLane = key;
  }
  const completedRaw = lengths[bestLane];
  const completed = Math.min(completedRaw, target);
  const remaining = target - completed;
  const state = remaining === 0
    ? REMAINING_STATES.GATE_OPEN
    : remaining === 1
      ? REMAINING_STATES.REACH
      : REMAINING_STATES.RACING;
  return freeze({
    playerId,
    name,
    seat: playerId,
    team: typeof player.team === 'string' && player.team ? player.team : null,
    isHuman: player.human === true,
    laneLengths: lengths,
    bestLane,
    bestLaneLabel: REMAINING_LANE_LABELS[bestLane],
    completed,
    completedRaw,
    target,
    remaining,
    state,
    badgeText: state === REMAINING_STATES.GATE_OPEN ? '門が開いた！' : `あと${remaining}枚`,
    detailText: state === REMAINING_STATES.GATE_OPEN
      ? `${REMAINING_LANE_LABELS[bestLane]}が${target}枚そろった`
      : `${REMAINING_LANE_LABELS[bestLane]} ${completed}/${target}枚`,
    ariaText: state === REMAINING_STATES.GATE_OPEN
      ? `${name}、${REMAINING_LANE_LABELS[bestLane]}が${target}枚そろって門が開いた`
      : `${name}、7枚まであと${remaining}枚。一番進んだのは${REMAINING_LANE_LABELS[bestLane]}で${completed}枚`,
  });
}

/**
 * 全員分の「あと何枚」を作る。一番残りが少ない人（先頭）を leaderIds に出す。
 * 全員0枚の開始直後は先頭を付けない（まだ差がない）。
 */
export function projectRemainingToSeven({ players, target = REMAINING_TO_SEVEN_TARGET } = {}) {
  if (!Array.isArray(players)) throw new TypeError('REMAINING_PLAYERS_REQUIRED');
  const projected = players.map((player) => projectPlayerRemaining(player, { target }));
  const hasData = projected.length >= 2;
  let minRemaining = null;
  for (const row of projected) {
    if (minRemaining === null || row.remaining < minRemaining) minRemaining = row.remaining;
  }
  const anyoneMoved = projected.some((row) => row.completed > 0);
  const leaderIds = hasData && anyoneMoved && minRemaining !== null
    ? projected.filter((row) => row.remaining === minRemaining).map((row) => row.playerId)
    : [];
  const rows = projected.map((row) => freeze({ ...row, isLeader: leaderIds.includes(row.playerId) }));
  return freeze({
    schema: REMAINING_TO_SEVEN_SCHEMA,
    target,
    players: rows,
    playerCount: rows.length,
    hasData,
    minRemaining,
    leaderIds,
    gateOpenIds: rows.filter((row) => row.state === REMAINING_STATES.GATE_OPEN).map((row) => row.playerId),
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

export const BATTLE_REMAINING_TO_SEVEN_CORE = freeze({
  schema: REMAINING_TO_SEVEN_SCHEMA,
  target: REMAINING_TO_SEVEN_TARGET,
  countAuthority: 'caller_match_lanes_max_length',
  countFormula: 'remaining = target - max(lane L, lane C, lane R)',
  gateOpenIsNotWin: true,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
});
