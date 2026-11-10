// 7枚以上の先の扱いの試し版の核（2026-11-10、ライカの見立てからの試し）。
// 本番の対戦の流れは変えない。ここは「比べるための部品」で、
// 形の採用はライカが試しの結果を見て決める。
//
// 確かめた今の実装の形（写し GAMEROAD.html）：
// - 勝つと、自分の出した札に加えて自分のチップ（負けた時に積まれた札）が
//   全部その列へ流れる。だから列は1枚ずつではなく大きく跳ぶ。
// - 門は「1列の最大が目標以上」で開く（合計数えではない）。
// - ゴール到達は「コマの位置＝列の長さの深さ」を要求するが、盤面のマスは
//   深さ7までしか無い。列が8以上になると到達先が盤面に無く、到達できない。
// - 置き札の絵も深さ7までのマスにしか描かれない（8枚目以降は見えない）。
//
// 試す3形：
// - unlimited（そのまま・現行）: 全部入る。
// - destroy-overflow（消滅）: 目標を超える分は消滅する。
// - cap-stop（上限）: 目標で止まる。超える分は置かれずチップ側に残る。

export const OVER_SEVEN_FORMS = Object.freeze({
  UNLIMITED: 'unlimited',
  DESTROY: 'destroy-overflow',
  CAP: 'cap-stop',
});

export const OVER_SEVEN_DEFAULT_TARGET = 7;
// 盤面のマスの深さの上限（写しの盤面生成が d<=7 のため7）。
export const OVER_SEVEN_BOARD_MAX_DEPTH = 7;

function requiredForm(form) {
  if (!Object.values(OVER_SEVEN_FORMS).includes(form)) {
    throw new TypeError('OVER_SEVEN_FORM_REQUIRED');
  }
  return form;
}

function requiredTarget(target) {
  if (!Number.isSafeInteger(target) || target <= 0) {
    throw new TypeError('OVER_SEVEN_TARGET_POSITIVE_INTEGER_REQUIRED');
  }
  return target;
}

function cardList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${label}_ARRAY_REQUIRED`);
  return value;
}

function cardValue(card, scoreOf) {
  if (typeof scoreOf === 'function') {
    const v = scoreOf(card);
    return Number.isFinite(v) ? v : 0;
  }
  if (card && typeof card === 'object') {
    if (Number.isFinite(card.number)) return card.number;
    if (Number.isFinite(card.power)) return card.power;
  }
  return 0;
}

/**
 * 列へ札を足す処理を、形ごとに分けて返す。
 * 入力はカードIDの並び（lane＝今の列、gained＝今回足される分）。
 * 返す物：
 * - lane: 足した後の列
 * - placed: 実際に列へ入った分
 * - destroyed: 消滅した分（消滅形だけ）
 * - destroyedScore: 消滅した分をスコアへ変換した値（採用形の決め。
 *   変換先は報酬の計算で読まれるスコアと同じ所。scoreOf で札の数字を渡す）
 * - heldBack: 置かれずチップ側に残った分（上限形だけ）
 */
export function applyLaneGain({ lane = [], gained = [], form, target = OVER_SEVEN_DEFAULT_TARGET, scoreOf = null } = {}) {
  const resolvedForm = requiredForm(form);
  const resolvedTarget = requiredTarget(target);
  const before = cardList(lane, 'OVER_SEVEN_LANE');
  const incoming = cardList(gained, 'OVER_SEVEN_GAINED');

  if (resolvedForm === OVER_SEVEN_FORMS.UNLIMITED) {
    return Object.freeze({
      form: resolvedForm,
      target: resolvedTarget,
      lane: Object.freeze([...before, ...incoming]),
      placed: Object.freeze([...incoming]),
      destroyed: Object.freeze([]),
      destroyedScore: 0,
      heldBack: Object.freeze([]),
      lengthBefore: before.length,
      lengthAfter: before.length + incoming.length,
    });
  }

  const room = Math.max(0, resolvedTarget - before.length);
  const placed = incoming.slice(0, room);
  const excess = incoming.slice(room);
  const isDestroy = resolvedForm === OVER_SEVEN_FORMS.DESTROY;
  const destroyed = isDestroy ? excess : [];
  return Object.freeze({
    form: resolvedForm,
    target: resolvedTarget,
    lane: Object.freeze([...before, ...placed]),
    placed: Object.freeze(placed),
    destroyed: Object.freeze(destroyed),
    destroyedScore: destroyed.reduce((sum, card) => sum + cardValue(card, scoreOf), 0),
    heldBack: Object.freeze(isDestroy ? [] : excess),
    lengthBefore: before.length,
    lengthAfter: before.length + placed.length,
  });
}

/** 門の開き方（現行の実装）：1列の最大が目標以上で開く。 */
export function gateOpenByMaxLane(laneLengths, target = OVER_SEVEN_DEFAULT_TARGET) {
  requiredTarget(target);
  if (!Array.isArray(laneLengths)) throw new TypeError('OVER_SEVEN_LANE_LENGTHS_REQUIRED');
  return laneLengths.some((len) => Number.isSafeInteger(len) && len >= target);
}

/** 比べ用：全列の合計で数える形（現行の実装には無い）。 */
export function gateOpenByTotal(laneLengths, target = OVER_SEVEN_DEFAULT_TARGET) {
  requiredTarget(target);
  if (!Array.isArray(laneLengths)) throw new TypeError('OVER_SEVEN_LANE_LENGTHS_REQUIRED');
  const total = laneLengths.reduce((sum, len) => sum + (Number.isSafeInteger(len) ? len : 0), 0);
  return total >= target;
}

/**
 * ゴール到達に必要な深さ（現行の到達候補の形：列の長さそのもの）。
 * 盤面のマスは深さ7までしか無いので、必要な深さが7を超えると到達できない。
 */
export function goalArrivalPossible(laneLength, { target = OVER_SEVEN_DEFAULT_TARGET, boardMaxDepth = OVER_SEVEN_BOARD_MAX_DEPTH } = {}) {
  requiredTarget(target);
  if (!Number.isSafeInteger(laneLength) || laneLength < 0) {
    throw new TypeError('OVER_SEVEN_LANE_LENGTH_REQUIRED');
  }
  return laneLength >= target && laneLength <= boardMaxDepth;
}

/** 盤面に見えない札の数（深さ7までのマスにしか描かれないため）。 */
export function invisibleCardCount(laneLengths, boardMaxDepth = OVER_SEVEN_BOARD_MAX_DEPTH) {
  if (!Array.isArray(laneLengths)) throw new TypeError('OVER_SEVEN_LANE_LENGTHS_REQUIRED');
  return laneLengths.reduce(
    (sum, len) => sum + (Number.isSafeInteger(len) ? Math.max(0, len - boardMaxDepth) : 0),
    0,
  );
}

export const OVER_SEVEN_TRIAL_CORE = Object.freeze({
  forms: OVER_SEVEN_FORMS,
  defaultTarget: OVER_SEVEN_DEFAULT_TARGET,
  boardMaxDepth: OVER_SEVEN_BOARD_MAX_DEPTH,
  currentForm: OVER_SEVEN_FORMS.UNLIMITED,
  // 採用形（2026-11-10、ライカの決め）：消滅形。消えた札はスコアに変換する。
  // スコアは勝敗に影響しない（勝敗はゴール到達で決まる）ので、変換は安全側。
  // 変換先は報酬の計算で読まれるスコアと同じ所（統合の段で本体へつなぐ）。
  adoptedForm: OVER_SEVEN_FORMS.DESTROY,
  adoptedScoreConversion: true,
  gateCounting: 'max_lane',
  trialOnly: true,
  gameplayAuthority: false,
});
