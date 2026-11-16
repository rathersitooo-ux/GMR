import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFunLog, FUN_TESTER_LOG_SCHEMA } from '../browser/fun-tester-core.mjs';

function turn(turn, overrides = {}) {
  return {
    turn,
    player: 'p1',
    startedAtMs: (turn - 1) * 4000,
    endedAtMs: turn * 4000,
    options: [0, 5, 12],
    chosenIndex: 2,
    rewards: 0,
    waitedMs: 0,
    stalled: false,
    deadEnd: false,
    looped: false,
    ...overrides,
  };
}

function log(turns, overrides = {}) {
  return {
    version: FUN_TESTER_LOG_SCHEMA,
    startedAtMs: 0,
    endedAtMs: turns.length ? turns[turns.length - 1].endedAtMs : 0,
    completed: true,
    turns,
    ...overrides,
  };
}

test('たのしい見込み：短い巡・こまめな報酬・意味のある選択・完走で高得点', () => {
  const turns = [];
  for (let i = 1; i <= 20; i++) {
    turns.push(turn(i, {
      startedAtMs: (i - 1) * 4000,
      endedAtMs: i * 4000,
      options: [0, 5, 12],
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
  assert.equal(result.turns, 20);
  assert.ok(result.score >= 70, `score=${result.score}`);
  assert.equal(result.verdict, 'たのしい見込み');
  assert.equal(result.tempo.medianTurnMs, 4000);
  assert.equal(result.reward.medianRewardGapTurns, 3);
  assert.ok(result.choice.meaningfulShare > 0.8);
});

test('つまらない見込み：長い巡・報酬が遠い・1択ばかり・詰まりあり', () => {
  const turns = [];
  for (let i = 1; i <= 20; i++) {
    turns.push(turn(i, {
      startedAtMs: (i - 1) * 25000,
      endedAtMs: i * 25000,
      options: [0],
      rewards: i === 12 ? 1 : 0,
      stalled: i === 8 || i === 15,
    }));
  }
  const result = analyzeFunLog(log(turns, { completed: true }));
  assert.equal(result.ok, true);
  assert.ok(result.score < 40, `score=${result.score}`);
  assert.equal(result.verdict, 'つまらない見込み');
  assert.equal(result.stall.stalledTurns, 2);
  assert.equal(result.choice.forcedShare, 1);
});

test('完走しなければ49点で頭打ち（流れが良くても「たのしい」とは言わない）', () => {
  const turns = [];
  for (let i = 1; i <= 20; i++) {
    turns.push(turn(i, { rewards: i % 3 === 0 ? 1 : 0 }));
  }
  const result = analyzeFunLog(log(turns, { completed: false }));
  assert.equal(result.ok, true);
  assert.ok(result.score <= 49, `score=${result.score}`);
  assert.equal(result.verdict, '未完走（結果まで到達せず）');
});

test('行き止まりと繰り返しは詰まりの減点になる', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      deadEnd: i === 5,
      looped: i === 7,
      rewards: i % 2 === 0 ? 1 : 0,
    }));
  }
  const clean = analyzeFunLog(log(turns.map((t) => ({ ...t, deadEnd: false, looped: false }))));
  const result = analyzeFunLog(log(turns));
  assert.ok(result.stall.score < clean.stall.score);
  assert.equal(result.stall.deadEnds, 1);
  assert.equal(result.stall.loops, 1);
});

test('壊れた記録は ok:false を返す（巡なし・版違い・巡の時刻の逆転）', () => {
  assert.equal(analyzeFunLog(null).ok, false);
  assert.equal(analyzeFunLog({ version: FUN_TESTER_LOG_SCHEMA, turns: [] }).ok, false);
  assert.equal(analyzeFunLog({ version: 'other', turns: [turn(1)] }).ok, false);
  assert.equal(analyzeFunLog(log([turn(1, { startedAtMs: 5000, endedAtMs: 1000 })])).ok, false);
});

test('報酬が一度も無ければ報酬の点は0', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) turns.push(turn(i));
  const result = analyzeFunLog(log(turns));
  assert.equal(result.reward.rewardTurns, 0);
  assert.equal(result.reward.score, 0);
});

test('v2較正：テンポは待ち時間込みの実時間で測る（実機の記録の裏付け）', () => {
  // 計画の操作は4秒でも、1巡に11秒の待ちが付く記録。実時間は15秒。
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      startedAtMs: (i - 1) * 4000,
      endedAtMs: i * 4000,
      waitedMs: 11000,
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.tempo.medianTurnMs, 15000);
  assert.ok(result.tempo.score <= 70, `tempo=${result.tempo.score}`);
});

test('v2較正：一番弱い柱が全体を引っ張る（報酬0なら25点で頭打ち）', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) turns.push(turn(i, { rewards: 0 }));
  const result = analyzeFunLog(log(turns));
  assert.equal(result.reward.score, 0);
  assert.ok(result.score <= 25, `score=${result.score}`);
  assert.equal(result.verdict, 'つまらない見込み');
});

test('v2較正：報酬の演出の強さが弱いと報酬の点が下がる', () => {
  const strong = [];
  const weak = [];
  for (let i = 1; i <= 10; i++) {
    const reward = i % 3 === 0 ? 1 : 0;
    strong.push(turn(i, { rewards: reward, rewardStrength: reward ? 1 : undefined }));
    weak.push(turn(i, { rewards: reward, rewardStrength: reward ? 0 : undefined }));
  }
  const strongResult = analyzeFunLog(log(strong));
  const weakResult = analyzeFunLog(log(weak));
  assert.equal(strongResult.reward.score, 100);
  assert.equal(weakResult.reward.score, 40);
  assert.ok(weakResult.reward.meanRewardStrength === 0);
});

test('v3較正：分離がそろった記録は、演出を設計時間で数えてテンポを測る', () => {
  // 壁時計では1巡23秒（操作3秒＋演出の実測20秒）だが、演出の設計時間は4秒。
  // テンポは操作3秒＋設計4秒＝7秒で測るので、環境の遅さに引きずられない。
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      startedAtMs: (i - 1) * 23000,
      endedAtMs: i * 23000,
      operationMs: 3000,
      presentationMs: 20000,
      presentationDesignMs: 4000,
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const split = analyzeFunLog(log(turns));
  assert.equal(split.tempo.splitUsed, true);
  assert.equal(split.tempo.splitCoverage, 1);
  assert.equal(split.tempo.medianTurnMs, 7000);
  assert.equal(split.tempo.operationMedianMs, 3000);
  assert.equal(split.tempo.presentationMedianMs, 20000);
  assert.equal(split.tempo.presentationDesignMedianMs, 4000);
  // 同じ壁時計でも分離が無い記録は v2 の実時間で測り、テンポは大きく下がる。
  const plain = analyzeFunLog(log(turns.map((t) => {
    const { operationMs, presentationMs, presentationDesignMs, ...rest } = t;
    return rest;
  })));
  assert.equal(plain.tempo.medianTurnMs, 23000);
  assert.ok(split.tempo.score > plain.tempo.score, `split=${split.tempo.score} plain=${plain.tempo.score}`);
});

test('v3較正：分離が無い記録は未記録の印が付き、測り方は v2 のまま', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      waitedMs: 11000,
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.tempo.splitUsed, false);
  assert.equal(result.tempo.splitCoverage, 0);
  assert.equal(result.tempo.operationMedianMs, null);
  assert.equal(result.tempo.presentationMedianMs, null);
  assert.equal(result.tempo.presentationDesignMedianMs, null);
  // v2と同じ測り方：真ん中は操作4秒＋待ち11秒＝15秒。
  assert.equal(result.tempo.medianTurnMs, 15000);
});

test('v3較正：分離が一部の巡だけでは系統を混ぜず、分離は使わない', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, i <= 5
      ? { operationMs: 3000, presentationMs: 20000, presentationDesignMs: 4000, rewards: i % 3 === 0 ? 1 : 0 }
      : { rewards: i % 3 === 0 ? 1 : 0 }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.tempo.splitUsed, false);
  assert.equal(result.tempo.splitCoverage, 0.5);
  // 全巡とも v2 の実時間（4秒）で測る。分離した5巡の設計時間では測らない。
  assert.equal(result.tempo.medianTurnMs, 4000);
  // 参考値として、分離した巡の真ん中は出る。
  assert.equal(result.tempo.operationMedianMs, 3000);
  assert.equal(result.tempo.presentationDesignMedianMs, 4000);
});

test('v3較正：設計時間が無い巡は、演出の実測で数える', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      operationMs: 2000,
      presentationMs: 6000,
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.tempo.splitUsed, true);
  assert.equal(result.tempo.medianTurnMs, 8000);
  assert.equal(result.tempo.presentationDesignMedianMs, 6000);
});

test('v3較正：分離の材料が壊れた値なら、その巡は未記録として扱う', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      operationMs: -500,
      presentationMs: 'abc',
      rewards: i % 3 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.equal(result.tempo.splitUsed, false);
  assert.equal(result.tempo.splitCoverage, 0);
  assert.equal(result.tempo.operationMedianMs, null);
});

test('v2較正：「たのしい見込み」は85点以上（84点は「まあまあ」）', () => {
  const turns = [];
  for (let i = 1; i <= 10; i++) {
    turns.push(turn(i, {
      startedAtMs: (i - 1) * 10000,
      endedAtMs: i * 10000,
      options: i <= 8 ? [0, 5, 12] : [0],
      rewards: i % 4 === 0 ? 1 : 0,
    }));
  }
  const result = analyzeFunLog(log(turns));
  assert.ok(result.score >= 60 && result.score < 85, `score=${result.score}`);
  assert.equal(result.verdict, 'まあまあ');
});
