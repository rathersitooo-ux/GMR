import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_TEAM_PING_CORE,
  TEAM_PING_INTENTS,
  createTeamPingChannel
} from '../browser/battle-team-ping-core.mjs';

const teamByActor = new Map([
  ['H1', 'A'], ['H2', 'A'], ['AI1', 'A'], ['H3', 'B']
]);

function makeChannel({ denyAdmission = false } = {}) {
  return createTeamPingChannel({
    resolveTeamId: actorId => teamByActor.get(actorId) || null,
    resolvePublicTarget: ({ teamId, target }) => {
      if (!target || target.visibility !== 'public' || target.teamId !== teamId) return null;
      return { kind: target.kind, id: target.id, ignoredSecret: target.secretCardId };
    },
    canReadTeam: (viewerId, teamId) => teamByActor.get(viewerId) === teamId,
    admissionPolicy: () => !denyAdmission
  });
}

test('canonical intent vocabulary is finite and stable', () => {
  assert.equal(BATTLE_TEAM_PING_CORE.schema, 'GAMEROAD_BATTLE_TEAM_PING_V1');
  assert.deepEqual(TEAM_PING_INTENTS, [
    'ATTENTION', 'ATTACK_INTENT', 'DEFEND_INTENT', 'HELP', 'WAIT', 'ACK'
  ]);
  assert.equal(Object.isFrozen(TEAM_PING_INTENTS), true);
});

test('untrusted message cannot add sender/team/secret payload fields', () => {
  const channel = makeChannel();
  for (const forbidden of ['senderId', 'teamId', 'secretCardId', 'reservedBattle', 'shieldContent']) {
    const result = channel.submit('H1', { intent: 'HELP', [forbidden]: 'SECRET' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, `MESSAGE_FIELD_FORBIDDEN:${forbidden}`);
  }
  assert.deepEqual(channel.readForViewer('H1', 'A'), { ok: true, pings: [] });
});

test('targeted ping stores only resolver-approved public reference', () => {
  const channel = makeChannel();
  const result = channel.submit('H1', {
    intent: 'ATTACK_INTENT',
    target: {
      visibility: 'public', teamId: 'A', kind: 'column', id: 'P3:right', secretCardId: 'NO-LEAK'
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ping.targetRef, { kind: 'column', id: 'P3:right' });
  assert.equal('secretCardId' in result.ping.targetRef, false);
  assert.equal(JSON.stringify(result).includes('NO-LEAK'), false);

  const wrongTeam = channel.submit('H1', {
    intent: 'ATTENTION',
    target: { visibility: 'public', teamId: 'B', kind: 'column', id: 'P3:left' }
  });
  assert.deepEqual(wrongTeam, { ok: false, reason: 'TARGET_NOT_PUBLIC' });

  const privateTarget = channel.submit('H1', {
    intent: 'DEFEND_INTENT',
    target: { visibility: 'private', teamId: 'A', kind: 'hand', id: 'CARD-SECRET' }
  });
  assert.deepEqual(privateTarget, { ok: false, reason: 'TARGET_NOT_PUBLIC' });
});

test('abstract team intent is allowed without fabricating target data', () => {
  const channel = makeChannel();
  const result = channel.submit('H1', { intent: 'WAIT' });
  assert.equal(result.ok, true);
  assert.equal(result.ping.targetRef, null);
});

test('same sender/target/intent folds duplicate notification', () => {
  const channel = makeChannel();
  const target = { visibility: 'public', teamId: 'A', kind: 'column', id: 'P3:center' };
  const first = channel.submit('H1', { intent: 'ATTENTION', target });
  const duplicate = channel.submit('H1', { intent: 'ATTENTION', target });

  assert.equal(first.status, 'accepted');
  assert.equal(first.notify, true);
  assert.equal(duplicate.status, 'folded');
  assert.equal(duplicate.notify, false);
  assert.equal(duplicate.ping.sequence, first.ping.sequence);
  assert.equal(channel.readForViewer('H2', 'A').pings.length, 1);
});

test('same sender/target keeps only latest intent while another sender stays independent', () => {
  const channel = makeChannel();
  const target = { visibility: 'public', teamId: 'A', kind: 'column', id: 'P3:center' };
  channel.submit('H1', { intent: 'ATTENTION', target });
  const replaced = channel.submit('H1', { intent: 'ATTACK_INTENT', target });
  channel.submit('H2', { intent: 'DEFEND_INTENT', target });

  assert.equal(replaced.status, 'replaced');
  const pings = channel.readForViewer('AI1', 'A').pings;
  assert.equal(pings.length, 2);
  assert.deepEqual(pings.map(p => [p.senderId, p.intent]), [
    ['H1', 'ATTACK_INTENT'],
    ['H2', 'DEFEND_INTENT']
  ]);
});

test('admission policy is mandatory and denial fails closed without fixed rate number', () => {
  assert.throws(() => createTeamPingChannel({}), /RESOLVETEAMID_REQUIRED/);
  const denied = makeChannel({ denyAdmission: true });
  assert.deepEqual(denied.submit('H1', { intent: 'ACK' }), {
    ok: false,
    reason: 'ADMISSION_DENIED'
  });
  assert.deepEqual(denied.readForViewer('H1', 'A'), { ok: true, pings: [] });
});

test('team reads fail closed across teams and work identically for human or AI teammate', () => {
  const channel = makeChannel();
  channel.submit('H1', { intent: 'HELP' });
  const human = channel.readForViewer('H2', 'A');
  const ai = channel.readForViewer('AI1', 'A');
  assert.equal(human.ok, true);
  assert.deepEqual(ai, human);
  assert.deepEqual(channel.readForViewer('H3', 'A'), {
    ok: false,
    reason: 'TEAM_ACCESS_DENIED',
    pings: []
  });
});

test('stable player identity can re-read latest ping state after a disconnect/rejoin boundary', () => {
  const channel = makeChannel();
  channel.submit('H1', { intent: 'WAIT' });
  const before = channel.readForViewer('H2', 'A');
  const after = channel.readForViewer('H2', 'A');
  assert.deepEqual(after, before);
  assert.equal(Object.isFrozen(after), true);
  assert.equal(Object.isFrozen(after.pings), true);
});

test('caller-side mutation cannot alter stored public projection', () => {
  const channel = makeChannel();
  const target = { visibility: 'public', teamId: 'A', kind: 'column', id: 'P3:left' };
  channel.submit('H1', { intent: 'ATTENTION', target });
  target.id = 'MUTATED';
  const read = channel.readForViewer('H2', 'A');
  assert.equal(read.pings[0].targetRef.id, 'P3:left');
});
