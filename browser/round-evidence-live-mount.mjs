// 巡ごとの証拠記録と、山札切れの最終手段の、本体への取り付け（2026-11-10）。
//
// - GAMEROAD.html の refill(p) が使う補充の写し（deck-fallback-live-bridge）を
//   ここから渡す。本体は結果の配列を受け取って自分の状態へ入れるだけ。
// - 対戦の状態（match）から巡ごとの証拠の写しを作り、match.roundEvidence へ
//   積む。証拠は window.GAMEROAD_ROUND_SUPPORT から JSON で取り出せる
//   （download で証拠ファイルとして保存もできる）。

import {
  ROUND_EVIDENCE_SCHEMA,
  createRoundEvidenceLog,
  buildRoundSnapshot,
  appendRoundSnapshot,
  appendRefillEvent,
  attachMatchResult,
  checkWinFlow,
} from './round-evidence-core.mjs';
import { projectHandRefillWithFallback } from './deck-fallback-live-bridge.mjs';

function snapshotFromMatch(m) {
  if (!m || !Array.isArray(m.players)) return null;
  return buildRoundSnapshot({
    round: m.round,
    players: m.players,
    gateOpen: m.gateOpen,
    gateOpenedBy: m.gateOpenedBy,
  });
}

const support = Object.freeze({
  schema: ROUND_EVIDENCE_SCHEMA,
  refillWithFallback: (deck, hand) => projectHandRefillWithFallback({ deck, hand }),
  ensureLog(m) {
    if (!m) return null;
    if (!m.roundEvidence) m.roundEvidence = createRoundEvidenceLog(m.id);
    return m.roundEvidence;
  },
  recordRound(m) {
    const log = support.ensureLog(m);
    if (!log) return null;
    const snap = snapshotFromMatch(m);
    if (!snap) return null;
    // 同じ巡の写しが既にあれば積み直さない（開始の二重呼び出し対策）。
    if (log.rounds.some((r) => r.round === snap.round)) return snap;
    return appendRoundSnapshot(log, snap);
  },
  recordRefill(m, event) {
    const log = support.ensureLog(m);
    if (!log) return false;
    return appendRefillEvent(log, { round: m.round, ...event });
  },
  attachResult(m, winnerIds, ranks) {
    const log = support.ensureLog(m);
    if (!log) return null;
    return attachMatchResult(log, { winnerIds, ranks });
  },
  checkWinFlow,
  download(m) {
    const log = support.ensureLog(m);
    if (!log || typeof document === 'undefined') return false;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gameroad-round-evidence-${log.matchId || 'match'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
});

if (typeof window !== 'undefined') {
  window.GAMEROAD_ROUND_SUPPORT = support;
}

export { support as GAMEROAD_ROUND_SUPPORT };
