import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA,
  BATTLE_TEAM_PING_LIVE_EVENT_SCHEMA,
  createBattleTeamPingLiveAdapter,
} from '../browser/battle-team-ping-live-adapter.mjs';

function makeHarness(overrides = {}) {
  const teams = new Map([
    ['P1', 'A'],
    ['P2', 'A'],
    ['P3', 'B'],
    ['P4', 'B'],
  ]);
  const dispatched = [];
  const presented = [];
  const adapter = createBattleTeamPingLiveAdapter({
    resolveTeamId: (actorId) => teams.get(actorId) ?? null,
    resolvePublicTarget: ({ target }) => {
      if (!target || target.secret === true) throw new Error('PRIVATE');
      return { kind: target.kind, id: target.id };
    },
    canReadTeam: (viewerId, teamId) => teams.get(viewerId) === teamId,
    admissionPolicy: ({ actorId, teamId }) => teams.get(actorId) === teamId,
    dispatchPing: (event) => {
      dispatched.push(event);
      return true;
    },
    presentPing: (payload) => {
      presented.push(payload);
      return true;
    },
    ...overrides,
  });
  return { adapter, dispatched, presented };
}

test('requires caller-owned authority and transport callbacks', () => {
  assert.throws(() => createBattleTeamPingLiveAdapter(), /RESOLVE_TEAM_ID_REQUIRED/);
  assert.throws(() => createBattleTeamPingLiveAdapter({
    resolveTeamId() {},
    resolvePublicTarget() {},
    canReadTeam() {},
    admissionPolicy() {},
  }), /DISPATCH_PING_REQUIRED/);
});

test('accepted ping is validated by the existing core then handed to transport once', () => {
  const { adapter, dispatched } = makeHarness();
  const result = adapter.submit('P1', {
    intent: 'ATTACK_INTENT',
    target: { kind: 'SHIELD', id: 'P3:L', presentationOnly: 'not-forwarded' },
  });

  assert.equal(result.schema, BATTLE_TEAM_PING_LIVE_ADAPTER_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.transport.attempted, true);
  assert.equal(result.transport.accepted, true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].schema, BATTLE_TEAM_PING_LIVE_EVENT_SCHEMA);
  assert.equal(dispatched[0].actorId, 'P1');
  assert.deepEqual(dispatched[0].ping.targetRef, { kind: 'SHIELD', id: 'P3:L' });
  assert.equal('presentationOnly' in dispatched[0].ping.targetRef, false);
});

test('folded duplicate does not dispatch another transport event', () => {
  const { adapter, dispatched } = makeHarness();
  const message = { intent: 'WAIT', target: { kind: 'LANE', id: 'P3:C' } };
  assert.equal(adapter.submit('P1', message).status, 'accepted');
  const folded = adapter.submit('P1', message);
  assert.equal(folded.ok, true);
  assert.equal(folded.status, 'folded');
  assert.equal(folded.transport.attempted, false);
  assert.equal(dispatched.length, 1);
});

test('private target and denied admission fail closed before transport', () => {
  const first = makeHarness();
  const privateResult = first.adapter.submit('P1', {
    intent: 'HELP',
    target: { kind: 'CARD', id: 'hidden-card', secret: true },
  });
  assert.equal(privateResult.ok, false);
  assert.equal(privateResult.reason, 'TARGET_NOT_PUBLIC');
  assert.equal(first.dispatched.length, 0);

  const second = makeHarness({ admissionPolicy: () => false });
  const denied = second.adapter.submit('P1', { intent: 'ACK' });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'ADMISSION_DENIED');
  assert.equal(second.dispatched.length, 0);
});

test('viewer read respects existing team privacy and presentation is deduped per viewer', () => {
  const { adapter, presented } = makeHarness();
  adapter.submit('P1', { intent: 'ATTENTION' });
  adapter.submit('P2', { intent: 'DEFEND_INTENT', target: { kind: 'SHIELD', id: 'P1:R' } });

  const denied = adapter.readForViewer('P3', 'A', { present: true });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'TEAM_ACCESS_DENIED');
  assert.equal(presented.length, 0);

  const first = adapter.readForViewer('P1', 'A', { present: true });
  assert.equal(first.ok, true);
  assert.equal(first.pings.length, 2);
  assert.equal(first.presentedCount, 2);
  assert.equal(presented.length, 2);

  const second = adapter.readForViewer('P1', 'A', { present: true });
  assert.equal(second.presentedCount, 0);
  assert.equal(presented.length, 2);

  const teammate = adapter.readForViewer('P2', 'A', { present: true });
  assert.equal(teammate.presentedCount, 2);
  assert.equal(presented.length, 4);
});

test('presentation receipt reset supports caller-controlled reconnect replay without changing ping state', () => {
  const { adapter, presented } = makeHarness();
  adapter.submit('P1', { intent: 'HELP' });
  assert.equal(adapter.readForViewer('P1', 'A', { present: true }).presentedCount, 1);
  assert.equal(adapter.readForViewer('P1', 'A', { present: true }).presentedCount, 0);
  assert.equal(adapter.clearPresentationReceipts('P1', 'A'), 1);
  assert.equal(adapter.readForViewer('P1', 'A', { present: true }).presentedCount, 1);
  assert.equal(presented.length, 2);
});

test('transport and presentation callback failures stay outside gameplay authority', () => {
  const { adapter } = makeHarness({
    dispatchPing: () => { throw new Error('relay-down'); },
    presentPing: () => { throw new Error('surface-gone'); },
  });
  const submit = adapter.submit('P1', { intent: 'WAIT' });
  assert.equal(submit.ok, true);
  assert.equal(submit.transport.attempted, true);
  assert.equal(submit.transport.accepted, false);
  assert.equal(submit.transport.error, 'relay-down');

  const read = adapter.readForViewer('P1', 'A', { present: true });
  assert.equal(read.ok, true);
  assert.equal(read.pings.length, 1);
  assert.equal(read.presentedCount, 0);
  assert.deepEqual(read.presentationFailures, [{ sequence: 1, error: 'surface-gone' }]);
});

test('adapter surface exposes no target, legality, result, takeover or gameplay-write methods', () => {
  const { adapter } = makeHarness();
  assert.deepEqual(Object.keys(adapter).sort(), [
    'clearPresentationReceipts',
    'readForViewer',
    'schema',
    'submit',
  ]);
  for (const forbidden of ['chooseTarget', 'legalActions', 'resolveBattle', 'takeover', 'writeGameState']) {
    assert.equal(forbidden in adapter, false);
  }
});
