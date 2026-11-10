// レートの二重管理の核（2026-11-10、第1弾の未回答1の実装）。
//
// 決まっている形：表示のレートは減らさない。内部のレートだけが上下する。
// - 内部レート：対戦の結果で上下する本当の強さ。マッチングに使うのはこちら。
// - 表示レート：内部レートが上がった分だけ付いて上がる。下がることはない
//   （過去の最高の内部レートを表示する）。負けても見た目の数字が減らない
//   ので、負けを怖がって対戦を避ける動きを弱めるのが狙い。
//
// この核は計算だけを持つ。保存先（アカウント保存）への接続は別段。

export const RATE_INITIAL = 1500;
const K = 32;

// 4人の順位（1〜4）から、その試合の得点（1位=1、2位=2/3、3位=1/3、4位=0）。
function placementScore(place) {
  if (place === 1) return 1;
  if (place === 2) return 2 / 3;
  if (place === 3) return 1 / 3;
  return 0;
}

export function createRateState() {
  return { internal: RATE_INITIAL, displayPeak: RATE_INITIAL, matches: 0 };
}

// 相手3人の内部レートの平均に対する期待値を出す（4人戦の簡易形）。
function expectedScore(myInternal, opponentsInternal) {
  const avg = opponentsInternal.reduce((a, b) => a + b, 0) / opponentsInternal.length;
  return 1 / (1 + Math.pow(10, (avg - myInternal) / 400));
}

// 試合結果を1つ適用する。place は 1〜4。
// 戻り値：新しい状態と、この試合での内部の変動量。
export function applyMatchResult(state, place, opponentsInternal) {
  const expected = expectedScore(state.internal, opponentsInternal);
  const actual = placementScore(place);
  const delta = Math.round(K * (actual - expected));
  const internal = Math.max(0, state.internal + delta);
  return {
    state: {
      internal,
      displayPeak: Math.max(state.displayPeak, internal),
      matches: state.matches + 1,
    },
    delta,
  };
}

// 表示に使うレート（減らない）。
export function displayRate(state) {
  return state.displayPeak;
}

// マッチングに使うレート（内部）。
export function matchmakingRate(state) {
  return state.internal;
}
