/**
 * Match-start guard core.
 *
 * 対戦開始の連打を防ぐための小さな核。対戦開始ボタンと再戦ボタンは同じ
 * startMatch を呼ぶため、連打すると同じ対戦が2回始まり、対戦ID
 * （'M' + Date.now()、ミリ秒単位）が同じになる・リプレイの開始が2回
 * 走る・対戦の状態が作り直される。直前の開始から決めた窓の間だけ2回目
 * の開始を断り、すでにある対戦をそのまま返す。窓を過ぎれば普通に始め
 * 直せる。デッキの確認に失敗した開始は記録しないため、デッキを直してすぐ
 * 押し直せる。
 *
 * 純粋な核で画面・保存・通信には触らない。時刻は呼ぶ側が渡す。
 */

export const MATCH_START_GUARD_SCHEMA = 'gameroad.match-start-guard.v1';
export const MATCH_START_GUARD_WINDOW_MS = 1000;

export function createMatchStartGuard({ windowMs = MATCH_START_GUARD_WINDOW_MS } = {}) {
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new TypeError('windowMs must be a finite number >= 0');
  }
  let lastStartedAt = null;
  return Object.freeze({
    schema: MATCH_START_GUARD_SCHEMA,
    windowMs,
    shouldStart(nowMs) {
      if (!Number.isFinite(nowMs)) return false;
      if (lastStartedAt === null) return true;
      return nowMs - lastStartedAt >= windowMs;
    },
    noteStarted(nowMs) {
      if (!Number.isFinite(nowMs)) return false;
      lastStartedAt = nowMs;
      return true;
    },
    reset() {
      lastStartedAt = null;
    },
    snapshot() {
      return Object.freeze({
        schema: MATCH_START_GUARD_SCHEMA,
        windowMs,
        lastStartedAt,
      });
    },
  });
}
