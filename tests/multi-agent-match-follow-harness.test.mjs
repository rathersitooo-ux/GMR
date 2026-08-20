import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MULTI_AGENT_MATCH_FOLLOW_CONTRACT,
  buildAuthoritySubmissionBatch,
  createAgentPacket,
  createFourAgentTurn,
  createPublicObserverPacket,
  runFourAgentWorkers,
  submitAgentIntent,
} from '../tools/multi-agent-match-follow-harness.mjs';

function player(playerId, secret, actions = ['attack', 'guard']) {
  return {
    playerId,
    authorizedProjection: { publicTurn: 7, privateHand: [secret] },
    legalActions: actions.map((actionId) => ({ actionId, kind: 'TEST_ACTION', publicLabel: actionId })),
  };
}

function turnInput() {
  return {
    matchId: 'match-001',
    stateVersion: 'opaque-state-v17',
    eventCursor: 'event-0042',
    players: [
      player('P1', 'P1-SECRET'),
      player('P2', 'P2-SECRET'),
      player('P3', 'P3-SECRET'),
      player('P4', 'P4-SECRET'),
    ],
  };
}

function intent(playerId, actionId = 'attack', overrides = {}) {
  return {
    intentId: `intent-${playerId}`,
    matchId: 'match-001',
    stateVersion: 'opaque-state-v17',
    eventCursor: 'event-0042',
    playerId,
    actionId,
    abstain: false,
    ...overrides,
  };
}

function intentFromPacket(packet, actionId = 'attack', overrides = {}) {
  return {
    intentId: `worker-intent-${packet.playerId}`,
    matchId: packet.matchId,
    stateVersion: packet.stateVersion,
    eventCursor: packet.eventCursor,
    playerId: packet.playerId,
    actionId,
    abstain: false,
    ...overrides,
  };
}

function validWorkers(observe = () => {}) {
  return Object.fromEntries(['P1', 'P2', 'P3', 'P4'].map((playerId) => [playerId, async (packet) => {
    observe(playerId, packet);
    return intentFromPacket(packet);
  }]));
}

test('builds exactly four isolated agent packets without cross-player private projection', () => {
  const source = turnInput();
  const turn = createFourAgentTurn(source);
  assert.equal(turn.players.length, 4);
  assert.equal(turn.complete, false);
  assert.deepEqual(turn.missingPlayerIds, ['P1', 'P2', 'P3', 'P4']);

  const p1 = createAgentPacket(turn, 'P1');
  const serialized = JSON.stringify(p1);
  assert.match(serialized, /P1-SECRET/);
  assert.doesNotMatch(serialized, /P2-SECRET|P3-SECRET|P4-SECRET/);
  assert.deepEqual(p1.legalActions.map((entry) => entry.actionId), ['attack', 'guard']);

  source.players[0].authorizedProjection.privateHand[0] = 'MUTATED-AFTER-BUILD';
  assert.equal(p1.authorizedProjection.privateHand[0], 'P1-SECRET');
});

test('rejects any player count other than four and duplicate player identities', () => {
  const three = turnInput();
  three.players.pop();
  assert.throws(() => createFourAgentTurn(three), /players-must-equal-4/);

  const duplicate = turnInput();
  duplicate.players[3].playerId = 'P1';
  assert.throws(() => createFourAgentTurn(duplicate), /playerId-duplicate:P1/);
});

test('rejects illegal and stale intents before they can enter authority batch', () => {
  const turn = createFourAgentTurn(turnInput());
  assert.throws(() => submitAgentIntent(turn, intent('P1', 'invented-card')), /intent-action-not-legal/);
  assert.throws(
    () => submitAgentIntent(turn, intent('P1', 'attack', { stateVersion: 'model-invented-version' })),
    /intent-stale-stateVersion/,
  );
  assert.throws(
    () => submitAgentIntent(turn, intent('P1', 'attack', { eventCursor: 'old-event' })),
    /intent-stale-eventCursor/,
  );
  assert.throws(
    () => submitAgentIntent(turn, intent('P1', 'attack', { matchId: 'other-match' })),
    /intent-stale-match/,
  );
});

test('supports explicit abstention but never fabricates a timeout move', () => {
  const base = createFourAgentTurn(turnInput());
  const afterAbstain = submitAgentIntent(base, intent('P1', null, { abstain: true }));
  assert.equal(afterAbstain.submissions[0].abstain, true);
  assert.equal(afterAbstain.submissions[0].actionId, null);
  assert.equal(afterAbstain.complete, false);
  assert.deepEqual(afterAbstain.missingPlayerIds, ['P2', 'P3', 'P4']);
  assert.throws(() => buildAuthoritySubmissionBatch(afterAbstain), /turn-incomplete/);
  assert.equal(MULTI_AGENT_MATCH_FOLLOW_CONTRACT.timeoutPolicy, 'NO_AUTOMOVE');
});

test('same intentId and content is idempotent while conflicting duplicate fails closed', () => {
  const base = createFourAgentTurn(turnInput());
  const firstIntent = intent('P1');
  const once = submitAgentIntent(base, firstIntent);
  const twice = submitAgentIntent(once, firstIntent);
  assert.strictEqual(twice, once);
  assert.throws(
    () => submitAgentIntent(once, { ...firstIntent, actionId: 'guard' }),
    /intentId-conflicting-duplicate/,
  );
  assert.throws(
    () => submitAgentIntent(once, intent('P1', 'guard', { intentId: 'second-intent-P1' })),
    /player-already-submitted/,
  );
});

test('collects four independent submissions in deterministic player order without resolving game state', () => {
  let turn = createFourAgentTurn(turnInput());
  for (const playerId of ['P3', 'P1', 'P4', 'P2']) turn = submitAgentIntent(turn, intent(playerId));

  assert.equal(turn.complete, true);
  assert.deepEqual(turn.missingPlayerIds, []);
  assert.deepEqual(turn.submissions.map((entry) => entry.playerId), ['P1', 'P2', 'P3', 'P4']);

  const batch = buildAuthoritySubmissionBatch(turn);
  assert.equal(batch.containsResolution, false);
  assert.equal(batch.resolutionRequestedFrom, 'CALLER_MATCH_AUTHORITY');
  assert.equal(batch.automaticMutationAllowed, false);
  assert.deepEqual(batch.intents.map((entry) => entry.actionId), ['attack', 'attack', 'attack', 'attack']);
  assert.equal('winner' in batch, false);
  assert.equal('nextStateVersion' in batch, false);
});

test('public observer packet receives only caller-provided public projection', () => {
  const observer = createPublicObserverPacket({
    matchId: 'match-001',
    stateVersion: 'opaque-state-v17',
    eventCursor: 'event-0042',
    publicProjection: {
      eventType: 'ATTACK_DECLARED',
      actor: 'P3',
      target: 'P1',
      laneCount: 6,
    },
  });
  const serialized = JSON.stringify(observer);
  assert.match(serialized, /ATTACK_DECLARED/);
  assert.doesNotMatch(serialized, /SECRET|privateHand/);
  assert.equal(observer.authority.mayRevealPlayerPrivateProjection, false);
  assert.equal(observer.authority.storage, 'NONE');
});

test('rejects non-JSON projections instead of carrying executable or hidden runtime objects', () => {
  const input = turnInput();
  input.players[0].authorizedProjection = { callback() {} };
  assert.throws(() => createFourAgentTurn(input), /non-json-value/);

  assert.throws(
    () => createPublicObserverPacket({
      matchId: 'match-001',
      stateVersion: 'opaque-state-v17',
      eventCursor: 'event-0042',
      publicProjection: { score: Number.NaN },
    }),
    /non-json-number/,
  );
});

test('caller input is not frozen or mutated as a side effect', () => {
  const source = turnInput();
  createFourAgentTurn(source);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.players[0]), false);
  source.players[0].legalActions.push({ actionId: 'new-after-build', kind: 'TEST_ACTION' });
  assert.equal(source.players[0].legalActions.length, 3);
});

test('executor invokes four isolated workers exactly once and returns only an authority request batch', async () => {
  const turn = createFourAgentTurn(turnInput());
  const callCounts = new Map();
  const workers = validWorkers((playerId, packet) => {
    callCounts.set(playerId, (callCounts.get(playerId) ?? 0) + 1);
    assert.equal(Object.isFrozen(packet), true);
    assert.equal(Object.isFrozen(packet.authorizedProjection), true);
    const serialized = JSON.stringify(packet);
    assert.match(serialized, new RegExp(`${playerId}-SECRET`));
    for (const other of ['P1', 'P2', 'P3', 'P4'].filter((id) => id !== playerId)) {
      assert.doesNotMatch(serialized, new RegExp(`${other}-SECRET`));
    }
  });

  const result = await runFourAgentWorkers(turn, workers);
  assert.deepEqual([...callCounts.entries()], [['P1', 1], ['P2', 1], ['P3', 1], ['P4', 1]]);
  assert.deepEqual(result.results.map((entry) => [entry.playerId, entry.status]), [
    ['P1', 'ACCEPTED'], ['P2', 'ACCEPTED'], ['P3', 'ACCEPTED'], ['P4', 'ACCEPTED'],
  ]);
  assert.equal(result.turn.complete, true);
  assert.deepEqual(result.turn.missingPlayerIds, []);
  assert.ok(result.authorityBatch);
  assert.equal(result.authorityBatch.containsResolution, false);
  assert.equal(result.authorityBatch.resolutionRequestedFrom, 'CALLER_MATCH_AUTHORITY');
  assert.equal('winner' in result.authorityBatch, false);
  assert.equal('nextStateVersion' in result.authorityBatch, false);
  assert.equal(result.automaticRetryAllowed, false);
  assert.equal(result.automaticTimeoutMoveAllowed, false);
  assert.equal(result.providerAuthority, 'NONE');
});

test('executor reports results in turn order even when worker promises settle out of order', async () => {
  const turn = createFourAgentTurn(turnInput());
  const resolvers = {};
  const calls = [];
  const workers = Object.fromEntries(['P1', 'P2', 'P3', 'P4'].map((playerId) => [playerId, (packet) => {
    calls.push(playerId);
    return new Promise((resolve) => { resolvers[playerId] = () => resolve(intentFromPacket(packet)); });
  }]));

  const running = runFourAgentWorkers(turn, workers);
  assert.deepEqual(calls, ['P1', 'P2', 'P3', 'P4']);
  resolvers.P4();
  resolvers.P2();
  resolvers.P3();
  resolvers.P1();
  const result = await running;
  assert.deepEqual(result.results.map((entry) => entry.playerId), ['P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(result.turn.submissions.map((entry) => entry.playerId), ['P1', 'P2', 'P3', 'P4']);
});

test('executor preserves valid partial submissions when one worker fails and never retries it', async () => {
  const turn = createFourAgentTurn(turnInput());
  const callCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  const workers = validWorkers((playerId) => { callCounts[playerId] += 1; });
  workers.P2 = async () => {
    callCounts.P2 += 1;
    throw new Error('provider-secret-detail-must-not-escape');
  };

  const result = await runFourAgentWorkers(turn, workers);
  assert.deepEqual(callCounts, { P1: 1, P2: 1, P3: 1, P4: 1 });
  assert.equal(result.turn.complete, false);
  assert.deepEqual(result.turn.missingPlayerIds, ['P2']);
  assert.deepEqual(result.turn.submissions.map((entry) => entry.playerId), ['P1', 'P3', 'P4']);
  assert.equal(result.authorityBatch, null);
  assert.deepEqual(result.results[1], {
    playerId: 'P2',
    status: 'WORKER_FAILED',
    reason: 'WORKER_REJECTED_OR_THROWN',
  });
  assert.doesNotMatch(JSON.stringify(result), /provider-secret-detail/);
});

test('executor routes illegal and stale worker intents through the existing authority validator', async () => {
  const turn = createFourAgentTurn(turnInput());
  const workers = validWorkers();
  workers.P1 = async (packet) => intentFromPacket(packet, 'invented-card');
  workers.P3 = async (packet) => intentFromPacket(packet, 'attack', { stateVersion: 'worker-invented-version' });

  const result = await runFourAgentWorkers(turn, workers);
  assert.deepEqual(result.results.map((entry) => [entry.playerId, entry.status, entry.reason]), [
    ['P1', 'INVALID_INTENT', 'intent-action-not-legal'],
    ['P2', 'ACCEPTED', null],
    ['P3', 'INVALID_INTENT', 'intent-stale-stateVersion'],
    ['P4', 'ACCEPTED', null],
  ]);
  assert.deepEqual(result.turn.missingPlayerIds, ['P1', 'P3']);
  assert.equal(result.authorityBatch, null);
});

test('executor rejects worker maps that do not exactly match the four turn players before invocation', async () => {
  const turn = createFourAgentTurn(turnInput());
  let calls = 0;
  const missing = validWorkers(() => { calls += 1; });
  delete missing.P4;
  await assert.rejects(() => runFourAgentWorkers(turn, missing), /workers-must-match-turn-players-exactly/);
  assert.equal(calls, 0);

  const extra = validWorkers(() => { calls += 1; });
  extra.PX = async () => intent('PX');
  await assert.rejects(() => runFourAgentWorkers(turn, extra), /workers-must-match-turn-players-exactly/);
  assert.equal(calls, 0);
});

test('executor prevents a worker from claiming another player slot', async () => {
  const turn = createFourAgentTurn(turnInput());
  const workers = validWorkers();
  workers.P1 = async (packet) => intentFromPacket(packet, 'attack', { playerId: 'P2', intentId: 'stolen-P2' });

  const result = await runFourAgentWorkers(turn, workers);
  assert.deepEqual(result.results[0], {
    playerId: 'P1',
    status: 'WORKER_PLAYER_MISMATCH',
    reason: 'WORKER_RETURNED_OTHER_PLAYER',
  });
  assert.deepEqual(result.turn.missingPlayerIds, ['P1']);
  assert.deepEqual(result.turn.submissions.map((entry) => entry.playerId), ['P2', 'P3', 'P4']);
  assert.equal(result.authorityBatch, null);
});

test('executor refuses implicit reruns of a partially submitted turn', async () => {
  const base = createFourAgentTurn(turnInput());
  const partial = submitAgentIntent(base, intent('P1'));
  let calls = 0;
  await assert.rejects(
    () => runFourAgentWorkers(partial, validWorkers(() => { calls += 1; })),
    /executor-turn-must-be-unsubmitted/,
  );
  assert.equal(calls, 0);
  assert.equal(MULTI_AGENT_MATCH_FOLLOW_CONTRACT.workerRetryPolicy, 'CALLER_CONTROLLED_NO_AUTORETRY');
  assert.equal(MULTI_AGENT_MATCH_FOLLOW_CONTRACT.workerProviderAuthority, 'NONE');
  assert.equal(MULTI_AGENT_MATCH_FOLLOW_CONTRACT.stateVersionAuthority, 'CALLER_OPAQUE_IDENTITY');
  assert.equal(MULTI_AGENT_MATCH_FOLLOW_CONTRACT.legalityAuthority, 'CALLER_SUPPLIED_LEGAL_ACTIONS');
});
