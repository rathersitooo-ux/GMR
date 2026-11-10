// ドッペルゲンガー試し版の接続（影の測定、2026-11-10）。
// 正式な仕様の置き換えではない。本体の公開の所から呼ばれて、試し版なら
// 何が起きるかをログに書くだけで、対戦の結果は変えない。
// 試合の長さへの影響を実対戦で測るための材料を、遊び確認のログから拾う形。
//
// 開き方：URLに ?doppelTrial=normal / super / unified を付ける
// （unified の先後は ?doppelOrder=numberFirst で同数を先にできる）。
// 付けなければ何もしない。

import { evaluateDoppelTrial } from './doppel-trial-core.mjs';

function trialForm() {
  try {
    const q = new URLSearchParams(location.search);
    const form = q.get('doppelTrial');
    if (form) return { form, order: q.get('doppelOrder') || 'nameFirst' };
    const saved = localStorage.getItem('GAMEROAD_DOPPEL_TRIAL');
    if (saved) return { form: saved, order: localStorage.getItem('GAMEROAD_DOPPEL_TRIAL_ORDER') || 'nameFirst' };
  } catch { /* 環境が無い所では黙る */ }
  return null;
}

// entries: [{ playerId, playerName, cardId, name, number, isOriginal? }]
// moment: 'road'（ロード札の公開）/ 'battle'（バトル札の公開）
export function observeDoppelTrial(entries, moment, hooks = {}) {
  const cfg = trialForm();
  if (!cfg || !['normal', 'super', 'unified'].includes(cfg.form)) return null;
  const log = hooks.log || (() => {});
  let result;
  try {
    result = evaluateDoppelTrial(entries, { form: cfg.form, order: cfg.order });
  } catch { return null; }
  const label = { road: 'ロード公開', battle: 'バトル公開' }[moment] || moment;
  if (!result.triggered) {
    log(`試し版ドッペル（${cfg.form}）：${label}では発動なし。`);
    return result;
  }
  const parts = [];
  if (result.returns.length) parts.push(`戻る ${result.returns.map((c) => c.name).join('・')}`);
  if (result.destroys.length) parts.push(`消滅 ${result.destroys.map((c) => c.name).join('・')}`);
  log(`試し版ドッペル（${cfg.form}）：${label}で発動。${parts.join('／')}（影の測定：実際の結果は変えていない）`);
  return result;
}

if (typeof window !== 'undefined') {
  window.GAMEROAD_DOPPEL_TRIAL = { observe: observeDoppelTrial };
}
