// BATTLE-PHASE-GUIDE-NOW-LINE-007 — 対戦の案内を出す部品（核）。
// 優先度一覧7番／本アカ引き継ぎ7番：案内の部品は遊ぶ流れから呼ばれておらず、
// 画面では今の段（計画→公開→移動→対象→戦闘）が光るだけだった。
// この核は「今やること」を1行に投影するだけの表示専用部品。
// 対戦の状態・合法手・勝敗・報酬は一切変えない（presentationOnly / autoExecute=false）。
//
// 仮置きの決まり（2026-11-08、ライカの割り当て）：
// - 計画の間は、推奨案Aの形で手順を1行で常に出す。
//   例：「1 ロードを選ぶ → 2 バトルを選ぶ → 3 終点を決める → 準備完了」
// - 他の段も1行だけ出す。
// 文の出し方（常時か初回だけか、文面の最終形）は決め待ち。
// 決まったら、この核の文と出し方だけを差し替える。

export const BATTLE_NOW_GUIDE_SCHEMA = 'gameroad.battle-now-guide.v1';

const PLAN_SEQUENCE = '1 ロードを選ぶ → 2 バトルを選ぶ → 3 終点を決める → 準備完了';

const PHASES = new Set(['plan', 'reveal', 'move', 'target', 'resolve']);

function inactive(reason) {
  return Object.freeze({
    schema: BATTLE_NOW_GUIDE_SCHEMA,
    active: false,
    reason,
    phase: null,
    step: null,
    message: null,
    presentationOnly: true,
    autoExecute: false,
  });
}

function active(phase, step, message) {
  return Object.freeze({
    schema: BATTLE_NOW_GUIDE_SCHEMA,
    active: true,
    reason: null,
    phase,
    step,
    message,
    presentationOnly: true,
    autoExecute: false,
  });
}

function token(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// snapshot: { screen, phase, busy, roadId, battleId }
// 遊ぶ流れ（画面）の今の状態だけを読む。状態は作らない。
export function projectBattleNowGuide(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return inactive('SNAPSHOT_REQUIRED');
  }
  if (snapshot.screen !== 'battle') return inactive('BATTLE_CONTEXT_REQUIRED');

  const phase = token(snapshot.phase);
  if (!phase || !PHASES.has(phase)) return inactive('PHASE_REQUIRED');

  const busy = snapshot.busy === true;
  const roadId = token(snapshot.roadId);
  const battleId = token(snapshot.battleId);

  if (phase === 'plan') {
    if (busy) return active(phase, 'busy', '今やること：決めた内容を送っています。少し待ってください');
    // 計画の間は手順の1行を常に出す（案Aの仮置き）。今どの手順かは step で返す。
    if (!roadId) return active(phase, 'road', `今やること：${PLAN_SEQUENCE}`);
    if (!battleId) return active(phase, 'battle', `今やること：${PLAN_SEQUENCE}`);
    return active(phase, 'ready', `今やること：${PLAN_SEQUENCE}`);
  }
  if (phase === 'reveal') return active(phase, 'reveal', '今やること：公開されたカードを確認する');
  if (phase === 'move') return active(phase, 'move', '今やること：移動の結果を確認する');
  if (phase === 'target') return active(phase, 'target', '今やること：攻撃先を選んで「攻撃先を決定」を押す');
  // resolve
  return active(phase, 'resolve', '今やること：戦闘の結果を確認する');
}

export const BATTLE_NOW_GUIDE_PLAN_SEQUENCE = PLAN_SEQUENCE;
