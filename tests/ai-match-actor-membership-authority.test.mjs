import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATCH_HUMAN_PRIORITY_MS,
  createStoredMatchTicket,
  storedMatchTicketStatus,
  matchStorageKeysForTest,
} from '../deploy/cloudflare/relay/src/match-store.mjs';
import {
  AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT,
  resolveAiMatchActorMembershipAuthority,
} from '../tools/ai-match-actor-membership-authority.mjs';

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) {
    if (Array.isArray(key)) {
      const out = new Map();
      for (const k of key) if (this.map.has(k)) out.set(k, structuredClone(this.map.get(k)));
      return out;
    }
    return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined;
  }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async list({ prefix = '', limit = Number.MAX_SAFE_INTEGER } = {}) {
    return new Map([...this.map.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, value]) => [key, structuredClone(value)]));
  }
  async transaction(fn) {
    const before = structuredClone([...this.map.entries()]);
    try { return await fn(this); }
    catch (error) { this.map = new Map(before); throw error; }
  }
}

let sequence = 70_000;
function generated(nowMs) {
  sequence += 1;
  return {
    ticketId: `t-${String(sequence).padStart(6, '0')}`,
    secret: `0123456789abcdef0123456789abcdef${String(sequence).slice(-8).padStart(8, '0')}`,
    matchId: `m-ai-${String(sequence).padStart(6, '0')}`,
    nowMs,
  };
}

async function createHuman(storage, label, nowMs) {
  const ids = generated(nowMs);
  return createStoredMatchTicket(
    storage,
    { clientId: `member-${label}`, idempotencyKey: `idem-ai-${label}-00000001` },
    ids,
  );
}

async function formDuoMatch() {
  const storage = new FakeStorage();
  const startedAt = 1_000_000;
  const first = await createHuman(storage, 'duo-a', startedAt);
  await createHuman(storage, 'duo-b', startedAt + 100);
  const due = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    { nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS, generatedMatchId: 'm-ai-duo-authority' },
  );
  assert.equal(due.ok, true);
  assert.equal(due.match?.format, 'TEAM2V2');
  return { storage, first, due };
}

async function formTrioMatch() {
  const storage = new FakeStorage();
  const startedAt = 2_000_000;
  const first = await createHuman(storage, 'trio-a', startedAt);
  await createHuman(storage, 'trio-b', startedAt + 100);
  await createHuman(storage, 'trio-c', startedAt + 200);
  const due = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    { nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS, generatedMatchId: 'm-ai-trio-authority' },
  );
  assert.equal(due.ok, true);
  assert.equal(due.match?.format, 'FREE4P');
  return { storage, first, due };
}

test('authenticated TEAM2V2 session resolves the exact server-created AI actor slot and team', async () => {
  const { storage, first } = await formDuoMatch();
  const result = await resolveAiMatchActorMembershipAuthority({
    storage,
    ticketId: first.ticket.ticketId,
    secret: first.secret,
    actorRef: 'AI1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.schema, AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.schema);
  assert.deepEqual(result.membership, {
    matchId: 'm-ai-duo-authority',
    actorType: 'AI',
    actorRef: 'AI1',
    slot: 2,
    team: 1,
    format: 'TEAM2V2',
  });
  assert.deepEqual(result.authority, {
    authenticatedMatchSession: true,
    matchIdentityVerified: true,
    aiActorMembershipVerified: true,
    seatVerified: true,
    teamVerified: true,
    gameplayRoleVerified: false,
    decisionSequenceVerified: false,
    stateVersionVerified: false,
  });
  assert.deepEqual(result.unresolved, {
    roleId: null,
    decisionSequence: null,
    stateVersion: null,
  });
  assert.equal(result.aiConsumerReady, false);
  assert.equal(result.gameplayAuthoritative, false);
  assert.equal(result.autoExecute, false);
});

test('ticket secret is actually authenticated and is never projected into the authority result', async () => {
  const { storage, first } = await formDuoMatch();
  const rejected = await resolveAiMatchActorMembershipAuthority({
    storage,
    ticketId: first.ticket.ticketId,
    secret: `${first.secret.slice(0, -1)}f`,
    actorRef: 'AI1',
  });
  assert.deepEqual(rejected, {
    ok: false,
    reason: 'MATCH_SESSION_AUTH_REQUIRED',
    membership: null,
    containsPrivate: false,
    gameplayAuthoritative: false,
    roleVerified: false,
    decisionSequenceVerified: false,
    stateVersionVerified: false,
    aiConsumerReady: false,
  });

  const accepted = await resolveAiMatchActorMembershipAuthority({
    storage,
    ticketId: first.ticket.ticketId,
    secret: first.secret,
    actorRef: 'AI2',
  });
  const serialized = JSON.stringify(accepted);
  assert.equal(serialized.includes(first.secret), false);
  assert.equal(serialized.includes(first.ticket.ticketId), false);
  assert.equal(serialized.includes('member-duo-a'), false);
  assert.equal(accepted.secretIncluded, false);
  assert.equal(accepted.ticketIdIncluded, false);
  assert.equal(accepted.requesterIdentityIncluded, false);
});

test('a caller cannot promote a missing or Human actor into AI membership', async () => {
  const { storage, first } = await formDuoMatch();
  for (const actorRef of ['AI3', 'member-duo-a', '']) {
    const result = await resolveAiMatchActorMembershipAuthority({
      storage,
      ticketId: first.ticket.ticketId,
      secret: first.secret,
      actorRef,
    });
    assert.equal(result.ok, false);
    assert.equal(result.aiConsumerReady, false);
  }
});

test('FREE4P AI membership is verified without inventing a team', async () => {
  const { storage, first } = await formTrioMatch();
  const result = await resolveAiMatchActorMembershipAuthority({
    storage,
    ticketId: first.ticket.ticketId,
    secret: first.secret,
    actorRef: 'AI1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.membership.format, 'FREE4P');
  assert.equal(result.membership.slot, 3);
  assert.equal(result.membership.team, null);
  assert.equal(result.authority.teamVerified, false);
  assert.equal(result.authority.gameplayRoleVerified, false);
  assert.equal(result.authority.decisionSequenceVerified, false);
  assert.equal(result.authority.stateVersionVerified, false);
});

test('corrupt AI-seat bookkeeping fails closed rather than repairing server authority', async () => {
  const { storage, first, due } = await formDuoMatch();
  const key = matchStorageKeysForTest.matchKey(due.match.matchId);
  const raw = await storage.get(key);
  raw.aiSeats = [3];
  await storage.put(key, raw);

  const result = await resolveAiMatchActorMembershipAuthority({
    storage,
    ticketId: first.ticket.ticketId,
    secret: first.secret,
    actorRef: 'AI1',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'MATCH_AI_SEAT_RECORD_INVALID');
  assert.equal(result.aiConsumerReady, false);
});

test('contract keeps later AI consumer gates explicitly unresolved', () => {
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.roleAuthority, 'NONE');
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.decisionSequenceAuthority, 'NONE');
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.stateVersionAuthority, 'NONE');
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.gameplayAuthority, false);
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.bestMoveProven, false);
  assert.equal(AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT.autoExecute, false);
});
