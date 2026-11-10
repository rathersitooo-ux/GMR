// 巡ごとの証拠記録の核のテスト（2026-11-10、対戦ログ必須化）。
// 決め：勝ちは「7枚で門が開く→そのあとゴール到達」で決まる。門だけでは勝ちにならない。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUND_EVIDENCE_SCHEMA,
  createRoundEvidenceLog,
  buildRoundSnapshot,
  appendRoundSnapshot,
  appendRefillEvent,
  attachMatchResult,
  checkWinFlow,
} from '../browser/round-evidence-core.mjs';

function player(id, laneLen, deckLen, handLen) {
  return {
    id,
    lanes: { L: Array(laneLen).fill('x'), C: [], R: [] },
    deck: Array(deckLen).fill('d'),
    hand: Array(handLen).fill('h'),
    position: `R:${id}:L:${laneLen}`,
  };
}

test('写し：巡番号・列の枚数・山札と手札の枚数・ゴールまであと何枚かが残る', () => {
  const snap = buildRoundSnapshot({
    round: 19,
    players: [player('P1', 6, 0, 2), player('P2', 3, 12, 3)],
    gateOpen: false,
    gateOpenedBy: [],
  });
  assert.equal(snap.round, 19);
  assert.equal(snap.players[0].laneCounts.L, 6);
  assert.equal(snap.players[0].deckCount, 0);
  assert.equal(snap.players[0].handCount, 2);
  assert.equal(snap.players[0].goalShortfall, 1); // 7まであと1枚
  assert.equal(snap.players[1].goalShortfall, 4);
  assert.equal(snap.gateOpen, false);
});

test('補充の記録は、その巡の記録へだけ付く', () => {
  const log = createRoundEvidenceLog('M1');
  appendRoundSnapshot(log, buildRoundSnapshot({ round: 1, players: [player('P1', 0, 30, 3)], gateOpen: false, gateOpenedBy: [] }));
  appendRoundSnapshot(log, buildRoundSnapshot({ round: 2, players: [player('P1', 0, 0, 1)], gateOpen: false, gateOpenedBy: [] }));
  assert.equal(appendRefillEvent(log, { round: 2, playerId: 'P1', fromDeck: 0, fromFallback: 2, joker: true }), true);
  assert.equal(appendRefillEvent(log, { round: 99, playerId: 'P1', fromFallback: 1 }), false);
  assert.equal(log.rounds[0].refills.length, 0);
  assert.equal(log.rounds[1].refills.length, 1);
  assert.equal(log.rounds[1].refills[0].fromFallback, 2);
  assert.equal(log.rounds[1].refills[0].joker, true);
});

test('勝ちの流れ：門が開いて、開けた人が勝って、順位で先なら合格', () => {
  const log = createRoundEvidenceLog('M2');
  appendRoundSnapshot(log, buildRoundSnapshot({ round: 1, players: [player('P1', 3, 20, 3), player('P2', 2, 20, 3)], gateOpen: false, gateOpenedBy: [] }));
  appendRoundSnapshot(log, buildRoundSnapshot({ round: 8, players: [player('P1', 7, 10, 3), player('P2', 4, 12, 3)], gateOpen: true, gateOpenedBy: ['P1'] }));
  attachMatchResult(log, {
    winnerIds: ['P1'],
    ranks: [{ playerId: 'P1', rank: 1 }, { playerId: 'P2', rank: 2 }],
  });
  const flow = checkWinFlow(log);
  assert.equal(flow.ok, true);
  assert.equal(flow.gateOpened, true);
  assert.equal(flow.winnerWasGateOpener, true);
  assert.equal(flow.winnerFirst, true);
  assert.equal(log.schema, ROUND_EVIDENCE_SCHEMA);
});

test('勝ちの流れ：門が開いていないのに勝者が付くと落ちる', () => {
  const log = createRoundEvidenceLog('M3');
  appendRoundSnapshot(log, buildRoundSnapshot({ round: 1, players: [player('P1', 3, 20, 3)], gateOpen: false, gateOpenedBy: [] }));
  attachMatchResult(log, { winnerIds: ['P1'], ranks: [{ playerId: 'P1', rank: 1 }] });
  const flow = checkWinFlow(log);
  assert.equal(flow.ok, false);
  assert.ok(flow.problems.includes('GATE_NEVER_OPENED'));
  assert.ok(flow.problems.includes('WINNER_NOT_GATE_OPENER'));
});

test('勝ちの流れ：記録が無い・結果が無いと、その旨が問題として残る', () => {
  const log = createRoundEvidenceLog('M4');
  const flow = checkWinFlow(log);
  assert.equal(flow.ok, false);
  assert.ok(flow.problems.includes('NO_ROUND_RECORDS'));
  assert.ok(flow.problems.includes('NO_RESULT'));
});
