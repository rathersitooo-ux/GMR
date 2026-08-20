import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MULTI_AGENT_MATCH_FOLLOW_CONTRACT,
  buildAuthoritySubmissionBatch,
  createAgentPacket,
  createFourAgentTurn,
  createPublicObserverPacket,
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
